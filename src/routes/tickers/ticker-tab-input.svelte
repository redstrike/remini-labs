<script lang="ts">
	import { tick } from 'svelte'
	import * as Popover from '$lib/components/shadcn-svelte/popover/index.js'

	type CryptoResult = { symbol: string; base: string; quote: string }
	type StockResult = { symbol: string; name: string; kind: string }
	type Result = CryptoResult | StockResult

	interface Props {
		type: 'crypto' | 'stock'
		add: (symbol: string) => boolean
		has: (symbol: string) => boolean
		onPick: (symbol: string) => void
		onClose: () => void
	}

	let { type, add, has, onPick, onClose }: Props = $props()

	const searchUrl = $derived(type === 'crypto' ? '/tickers/api/search/crypto' : '/tickers/api/search/stocks')
	const DEBOUNCE_MS = 200

	let query = $state('')
	let results = $state<Result[]>([])
	let loading = $state(false)
	let highlighted = $state(0)
	let inputEl = $state<HTMLInputElement | null>(null)
	let listEl = $state<HTMLUListElement | null>(null)

	let debounceTimer: ReturnType<typeof setTimeout> | null = null
	let abort: AbortController | null = null

	// Auto-focus on mount
	$effect(() => {
		tick().then(() => inputEl?.focus())
	})

	// Scroll the highlighted item into view when navigating with keyboard.
	$effect(() => {
		const idx = highlighted
		tick().then(() => {
			const items = listEl?.querySelectorAll('.ticker-tab-result')
			items?.[idx]?.scrollIntoView({ block: 'nearest' })
		})
	})

	// Auto-expand input width based on typed characters
	const inputWidth = $derived(`${Math.max(3, query.length + 1)}ch`)

	// Popover opens when we have results to show
	const showPopover = $derived(results.length > 0 && query.trim().length > 0)

	function isCrypto(r: Result): r is CryptoResult {
		return 'base' in r
	}

	async function runSearch(q: string) {
		abort?.abort()
		const ctl = new AbortController()
		abort = ctl
		try {
			const res = await fetch(`${searchUrl}?q=${encodeURIComponent(q)}`, { signal: ctl.signal })
			if (!res.ok) throw new Error(`search returned ${res.status}`)
			const data: Result[] = await res.json()
			if (ctl.signal.aborted) return
			results = data
			highlighted = 0
		} catch (e) {
			if ((e as Error).name !== 'AbortError') console.error('ticker-tab-input search failed:', e)
		} finally {
			if (!ctl.signal.aborted) loading = false
		}
	}

	function onInput() {
		if (debounceTimer) clearTimeout(debounceTimer)
		// Strip "/" so "BNB/BTC" → "BNBBTC" — both forms should narrow down to the same pair.
		const q = query.trim().replace(/\//g, '')
		if (!q) {
			results = []
			loading = false
			abort?.abort()
			return
		}
		loading = true
		debounceTimer = setTimeout(() => runSearch(q), DEBOUNCE_MS)
	}

	function pick(r: Result) {
		if (has(r.symbol)) return
		if (add(r.symbol)) onPick(r.symbol)
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (results.length > 0) {
				results = []
				query = ''
			} else {
				onClose()
			}
			return
		}
		if (!showPopover) return
		if (e.key === 'ArrowDown') {
			e.preventDefault()
			e.stopPropagation()
			highlighted = (highlighted + 1) % results.length
		} else if (e.key === 'ArrowUp') {
			e.preventDefault()
			e.stopPropagation()
			highlighted = (highlighted - 1 + results.length) % results.length
		} else if (e.key === 'Enter') {
			e.preventDefault()
			e.stopPropagation()
			const r = results[highlighted]
			if (r) pick(r)
		}
	}
</script>

<Popover.Root open={showPopover}>
	<!-- Trigger wraps a span (the positioning anchor) NOT the input directly. Spreading trigger
	     props onto <input> kills native text-input behavior (role="button", click handlers, etc.).
	     The span is the anchor for Popover.Content positioning; the input inside stays native. -->
	<Popover.Trigger>
		{#snippet child({ props })}
			<span {...props} class="ticker-tab-input-anchor">
				<input
					bind:this={inputEl}
					bind:value={query}
					oninput={onInput}
					onkeydown={onKeydown}
					onclick={(e) => e.stopPropagation()}
					class="ticker-tab-input"
					style:width={inputWidth}
					autocomplete="off"
					spellcheck="false" />
			</span>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content
		align="start"
		sideOffset={8}
		class="ticker-tab-dropdown"
		style="background: var(--rl-color-bg); border: 1px solid var(--rl-color-border); border-radius: var(--rl-radius-lg); padding: var(--rl-space-xs); width: auto; min-width: 220px; max-width: 340px; box-shadow: 0 8px 24px rgba(0,0,0,0.6); ring: none; --tw-ring-shadow: none;"
		onOpenAutoFocus={(e) => e.preventDefault()}
		onCloseAutoFocus={(e) => e.preventDefault()}
		onInteractOutside={(e) => e.preventDefault()}>
		<ul bind:this={listEl} class="ticker-tab-results" role="listbox">
			{#each results as r, i (r.symbol)}
				{@const already = has(r.symbol)}
				<li role="option" aria-selected={i === highlighted}>
					<button
						class="ticker-tab-result"
						class:highlighted={i === highlighted}
						class:disabled={already}
						disabled={already}
						onclick={() => pick(r)}
						onpointerenter={() => (highlighted = i)}>
						{#if isCrypto(r)}
							<span class="ticker-tab-result-symbol">
								{r.base}<span class="ticker-tab-result-quote">/{r.quote}</span>
							</span>
						{:else}
							<span class="ticker-tab-result-symbol">{r.symbol}</span>
							<span class="ticker-tab-result-name">{r.name}</span>
							<span class="ticker-tab-result-kind">{r.kind}</span>
						{/if}
						{#if already}
							<span class="ticker-tab-result-badge">added</span>
						{/if}
					</button>
				</li>
			{/each}
		</ul>
	</Popover.Content>
</Popover.Root>

<style>
	.ticker-tab-input-anchor {
		display: inline-block;
		/* Match the exact box model of a regular .tickers-card-tab button so the container height
		   doesn't shift when a placeholder input appears — which would push the + button off-position. */
		vertical-align: bottom;
		line-height: 0;
	}

	.ticker-tab-input {
		font: inherit;
		font-family: var(--rl-font-mono);
		font-size: var(--rl-text-sm);
		font-weight: var(--rl-font-semibold);
		color: var(--rl-color-text);
		background: transparent;
		border: none;
		border-bottom: 2px solid var(--rl-color-text);
		padding: 0 0 var(--rl-space-sm);
		margin-bottom: -1px;
		outline: none;
		min-width: 3ch;
		caret-color: var(--rl-color-text);
	}

	.ticker-tab-results {
		list-style: none;
		margin: 0;
		padding: 0;
		max-height: 240px;
		overflow-y: auto;
		/* Thin dark scrollbar that blends with the OLED popover bg. */
		scrollbar-width: thin;
		scrollbar-color: var(--rl-color-border) transparent;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.ticker-tab-results::-webkit-scrollbar {
		width: 4px;
	}
	.ticker-tab-results::-webkit-scrollbar-track {
		background: transparent;
	}
	.ticker-tab-results::-webkit-scrollbar-thumb {
		background: var(--rl-color-border);
		border-radius: 2px;
	}

	.ticker-tab-result {
		width: 100%;
		display: flex;
		align-items: baseline;
		gap: var(--rl-space-sm);
		padding: var(--rl-space-xs) var(--rl-space-sm);
		text-align: left;
		background: transparent;
		border: none;
		border-radius: var(--rl-radius-md);
		color: var(--rl-color-text);
		cursor: pointer;
		transition: background var(--rl-duration-short) var(--rl-ease-move);
	}

	.ticker-tab-result.highlighted {
		background: var(--rl-color-surface);
	}

	.ticker-tab-result:hover:not(:disabled) {
		background: var(--rl-color-surface);
	}

	.ticker-tab-result.disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.ticker-tab-result-symbol {
		font-family: var(--rl-font-mono);
		font-size: var(--rl-text-sm);
		font-weight: var(--rl-font-bold);
		letter-spacing: -0.2px;
	}

	.ticker-tab-result-quote {
		font-size: 0.78em;
		font-weight: var(--rl-font-normal);
		color: var(--rl-color-text-faint);
	}

	.ticker-tab-result-name {
		flex: 1;
		min-width: 0;
		font-size: var(--rl-text-xs);
		color: var(--rl-color-text-subtle);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.ticker-tab-result-kind {
		font-size: var(--rl-text-2xs);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--rl-color-text-faint);
		padding: 2px 6px;
		border: 1px solid var(--rl-color-border);
		border-radius: var(--rl-radius-sm);
	}

	.ticker-tab-result-badge {
		font-size: var(--rl-text-2xs);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--rl-color-success);
		margin-left: auto;
	}
</style>
