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
	bytes: number | null
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

async function probeOnce(url: string, init?: RequestInit): Promise<Sample> {
	const started = Date.now()
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
	try {
		const res = await globalThis.fetch(url, { ...init, signal: controller.signal })
		const text = await res.text()
		return {
			ok: res.ok,
			status: res.status,
			ms: Date.now() - started,
			bytes: text.length,
			bodySample: text.slice(0, 200),
			error: null,
		}
	} catch (e) {
		return {
			ok: false,
			status: null,
			ms: Date.now() - started,
			bytes: null,
			bodySample: null,
			error: (e as Error).message,
		}
	} finally {
		clearTimeout(timer)
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
	const sorted = [...values].sort((a, b) => a - b)
	const n = sorted.length
	const median = n % 2 === 1 ? sorted[(n - 1) / 2] : Math.round((sorted[n / 2 - 1] + sorted[n / 2]) / 2)
	const mean = Math.round(values.reduce((sum, v) => sum + v, 0) / n)
	return { min: sorted[0], median, mean, max: sorted[n - 1] }
}

export const GET: RequestHandler = async ({ request }) => {
	const results = await Promise.all(UPSTREAMS.map(probeUpstream))
	return json(
		{
			ranAt: new Date().toISOString(),
			samples: SAMPLES,
			cf: {
				colo: request.headers.get('cf-ipcountry') ?? null,
				country: request.headers.get('cf-ipcountry') ?? null,
				ray: request.headers.get('cf-ray') ?? null,
			},
			results,
		},
		{ headers: { 'Cache-Control': 'no-store' } },
	)
}
