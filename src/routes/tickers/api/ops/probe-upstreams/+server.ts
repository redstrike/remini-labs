// Ops probe — reachability + latency for each crypto upstream we might fetch from.
// Hit this when a prod fetch fails to tell 'upstream blocked' from 'code bug'.
// Runs each upstream SAMPLES times to expose intermittent blocks that a single
// hit would miss (the CF egress IP-pool block flickers sample-to-sample).
//
// GET /tickers/api/ops/probe-upstreams

import { json } from '@sveltejs/kit'

import type { RequestHandler } from './$types'

const TIMEOUT_MS = 4000 // per-sample budget
const SAMPLES = 3 // sequential samples per upstream; enough to surface flakiness without spamming
const BODY_SAMPLE_BYTES = 200 // cap per-probe body read; we only need a sanity slice

// Some upstreams (CoinGecko, Coinbase) reject empty UAs. Identify ourselves clearly.
const APP_UA = 'ReminiLabs/1.0 (+https://remini-labs.redstrike.workers.dev)'

interface Upstream {
	id: string
	url: string
	headers?: Record<string, string>
	notes?: string // durable context surfaced in the response
}

// Binance variants — trimmed to the three best-latency endpoints (main / gcp / data).
// api-gcp is the one actually reachable from CF Workers today; main/data probed here to
// detect if the upstream IP-pool block ever lifts.
//
// Alternatives — potential fallback sources if Binance goes fully dark from CF egress.
const UPSTREAMS: Upstream[] = [
	{
		id: 'binance-api',
		url: 'https://api.binance.com/api/v3/ticker/24hr?symbols=%5B%22BTCUSDT%22%5D',
	},
	{
		id: 'binance-api-gcp',
		url: 'https://api-gcp.binance.com/api/v3/ticker/24hr?symbols=%5B%22BTCUSDT%22%5D',
		notes: 'Current primary — GCP mirror, reliable from Cloudflare Workers.',
	},
	{
		id: 'binance-vision',
		url: 'https://data-api.binance.vision/api/v3/ticker/24hr?symbols=%5B%22BTCUSDT%22%5D',
	},
	{
		id: 'coingecko',
		url: 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum,solana&order=market_cap_desc&per_page=3&sparkline=false',
		headers: { 'User-Agent': APP_UA },
	},
	{
		id: 'cryptocompare',
		url: 'https://min-api.cryptocompare.com/data/pricemultifull?fsyms=BTC,ETH,SOL&tsyms=USD',
		notes: 'Free tier requires an API key — returns 200 with an error body without one.',
	},
	{
		id: 'coinbase',
		url: 'https://api.exchange.coinbase.com/products/BTC-USD/stats',
		headers: { 'User-Agent': APP_UA },
	},
	{
		id: 'bitstamp',
		url: 'https://www.bitstamp.net/api/v2/ticker/btcusd/',
	},
	{
		id: 'kraken',
		url: 'https://api.kraken.com/0/public/Ticker?pair=XBTUSD,ETHUSD,SOLUSD',
	},
]

interface Sample {
	ok: boolean
	status: number | null
	ms: number
	bytes: number | null // bytes read off the wire, capped near BODY_SAMPLE_BYTES (we cancel after)
	bodySample: string | null // small slice of body for sanity
	error: string | null
}

interface LatencyStats {
	min: number
	median: number
	mean: number
	max: number
}

interface UpstreamResult {
	id: string
	url: string
	notes: string | null
	samples: Sample[]
	successRate: number // 0..1 across samples
	latencyMs: LatencyStats | null // null when no sample succeeded
}

// Bounded body read — stream chunks until we've accumulated ~BODY_SAMPLE_BYTES, then cancel
// the upstream transfer. Replaces `await res.text()`, which would buffer the entire response
// (some upstreams ship hundreds of KB of JSON) just to slice the first 200 bytes for the body
// sample. Cancelling after the cap saves bandwidth + memory on every probe.
async function readBodySample(res: Response, maxBytes: number): Promise<{ bytes: number; bodySample: string }> {
	if (!res.body) return { bytes: 0, bodySample: '' }
	const reader = res.body.getReader()
	const chunks: Uint8Array[] = []
	let bytes = 0
	try {
		while (bytes < maxBytes) {
			const { done, value } = await reader.read()
			if (done) break
			chunks.push(value)
			bytes += value.byteLength
		}
	} finally {
		await reader.cancel().catch(() => {})
	}
	const merged = new Uint8Array(bytes)
	let offset = 0
	for (const chunk of chunks) {
		merged.set(chunk, offset)
		offset += chunk.byteLength
	}
	// Decode, then slice on character count — guards against splitting a multi-byte UTF-8
	// sequence at the byte boundary.
	const bodySample = new TextDecoder('utf-8', { fatal: false }).decode(merged).slice(0, maxBytes)
	return { bytes, bodySample }
}

async function probeOnce(url: string, init?: RequestInit): Promise<Sample> {
	const started = Date.now()
	try {
		const res = await globalThis.fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })
		const { bytes, bodySample } = await readBodySample(res, BODY_SAMPLE_BYTES)
		return {
			ok: res.ok,
			status: res.status,
			ms: Date.now() - started,
			bytes,
			bodySample,
			error: null,
		}
	} catch (e) {
		return {
			ok: false,
			status: null,
			ms: Date.now() - started,
			bytes: null,
			bodySample: null,
			error: e instanceof Error ? e.message : String(e),
		}
	}
}

async function probeUpstream(u: Upstream): Promise<UpstreamResult> {
	const samples: Sample[] = []
	// Sequential within a single upstream so each sample gets a fresh connection and
	// captures variance; parallel across upstreams for overall speed.
	for (let i = 0; i < SAMPLES; i++) {
		samples.push(await probeOnce(u.url, u.headers ? { headers: u.headers } : undefined))
	}
	const successful = samples.filter((s) => s.ok)
	const successRate = successful.length / samples.length
	return {
		id: u.id,
		url: u.url,
		notes: u.notes ?? null,
		samples,
		successRate,
		latencyMs: successful.length > 0 ? summarize(successful.map((s) => s.ms)) : null,
	}
}

function summarize(values: number[]): LatencyStats {
	const sorted = values.toSorted((a, b) => a - b)
	const n = sorted.length
	const median = n % 2 === 1 ? sorted[(n - 1) / 2] : Math.round((sorted[n / 2 - 1] + sorted[n / 2]) / 2)
	const mean = Math.round(values.reduce((sum, v) => sum + v, 0) / n)
	return { min: sorted[0], median, mean, max: sorted[n - 1] }
}

export const GET: RequestHandler = async ({ request, platform }) => {
	// Auth gate — this endpoint exposes upstream URLs, latency, and 200-byte body samples per
	// probe (which can leak rate-limit error tokens or partial responses from third-party APIs).
	// Set the secret via `wrangler secret put OPS_TOKEN <value>`; clients send
	// `Authorization: Bearer <value>`. Without the secret the endpoint stays disabled (503).
	const expected = platform?.env?.OPS_TOKEN
	if (!expected) {
		return json({ error: 'Ops endpoint disabled — set OPS_TOKEN secret to enable' }, { status: 503 })
	}

	// RFC 6750: Bearer scheme is case-insensitive — accept any case for the scheme prefix
	// (e.g. `bearer`, `BEARER`); the token itself stays case-sensitive.
	const auth = request.headers.get('Authorization')
	const bearerMatch = auth?.match(/^Bearer\s+(.+)$/i)
	const provided = bearerMatch?.[1] ?? null
	if (!provided || !(await timingSafeEqualString(provided, expected))) {
		return json({ error: 'Unauthorized' }, { status: 401 })
	}

	const results = await Promise.all(UPSTREAMS.map(probeUpstream))
	return json(
		{
			ranAt: new Date().toISOString(),
			samples: SAMPLES,
			cf: {
				// `colo` is the IATA airport code of the CF colo that handled the request (e.g.
				// "SIN", "FRA"). Surfaced via `request.cf.colo` per CF docs; the cf-ipcountry header
				// is country (different field). The 3-letter colo is also encoded as the suffix of
				// `cf-ray` (e.g. "8a1b2c3d4e5f6789-SIN") if cf object is unavailable.
				colo: platform?.cf?.colo ?? null,
				country: request.headers.get('cf-ipcountry') ?? null,
				ray: request.headers.get('cf-ray') ?? null,
			},
			results,
		},
		{ headers: { 'Cache-Control': 'no-store' } },
	)
}

// Constant-time string comparison via SHA-256 normalization. Plain `===` exits on first mismatch
// byte, leaking length/prefix info to a timing attacker. Hashing both inputs to a fixed length
// first sidesteps the same-length requirement of byte-wise constant-time comparison. The XOR-
// accumulator loop is portable across Workers / Node / browsers; `crypto.subtle.timingSafeEqual`
// is a CF-Workers extension not present in Node SSR (Vite dev), so we don't rely on it.
//
// SHA-256 sized to match the 32-byte / 43-char base64url token from
// `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` —
// industry-default bearer-token auth construction (TLS 1.3, JWT HS256, AWS SigV4, GitHub API).
// Hardware-accelerated via SHA-NI on CF's edge x86-64. Endpoint sensitivity is low (probes
// public upstream APIs), so the 256-bit security envelope is comfortable headroom.
async function timingSafeEqualString(a: string, b: string): Promise<boolean> {
	const enc = new TextEncoder()
	const aHash = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(a)))
	const bHash = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(b)))
	if (aHash.byteLength !== bHash.byteLength) return false
	let result = 0
	for (let i = 0; i < aHash.byteLength; i++) {
		result |= aHash[i] ^ bHash[i]
	}
	return result === 0
}
