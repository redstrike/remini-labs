<script lang="ts">
	import { tick } from 'svelte'
	import { Debounced } from 'runed'

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
		/** Floor width for the input in ch units. Default 3ch matches the chrome-tab placeholder
		 * footprint; raise (e.g. 6) when the input lives in a wider host like a table row, so the
		 * field reads as inviting rather than cramped. */
		minWidthCh?: number
		/** Optional muted hint shown in the empty input — e.g. `"ETF / Index"` to suggest browse-
		 * mode keywords on the stock host. Sized into `inputWidth` so the placeholder doesn't
		 * clip on first render before the user types. */
		placeholder?: string
	}

	let { type, add, has, onPick, onClose, minWidthCh = 3, placeholder }: Props = $props()

	const searchUrl = $derived(type === 'crypto' ? '/tickers/api/search/crypto' : '/tickers/api/search/stocks')
	const DEBOUNCE_MS = 200

	let query = $state('')
	let results = $state<Result[]>([])
	let highlighted = $state(0)
	let inputEl = $state<HTMLInputElement | null>(null)
	let listEl = $state<HTMLUListElement | null>(null)
	// Tracks "user dismissed the popover but didn't clear the input" — outside-click sets this
	// true so the popover hides while the typed query stays put for the user to come back to.
	// Refocusing the input resets it to false; the explicit × clear button + Esc do a full reset
	// (which also clears this flag for free since results/query both go empty).
	let popoverDismissed = $state(false)

	// Strip "/" so "BNB/BTC" → "BNBBTC" — both forms narrow to the same pair.
	const cleanQuery = $derived(query.trim().replace(/\//g, ''))
	const debouncedQuery = new Debounced(() => cleanQuery, DEBOUNCE_MS)

	// Scroll the highlighted item into view when navigating with keyboard.
	$effect(() => {
		const idx = highlighted
		tick().then(() => {
			const items = listEl?.querySelectorAll('.ticker-tab-result')
			items?.[idx]?.scrollIntoView({ block: 'nearest' })
		})
	})

	// Auto-expand input width based on typed characters; floor at minWidthCh and at the
	// placeholder length (+1 for cursor breathing room) so the hint doesn't clip on first render.
	const inputWidth = $derived(`${Math.max(minWidthCh, query.length + 1, (placeholder?.length ?? 0) + 1)}ch`)

	// Popover opens when we have results to show AND the user hasn't dismissed it via outside-
	// click. Dismissal is sticky until the user either refocuses the input (auto-undismiss) or
	// clears the field explicitly (full reset).
	const showPopover = $derived(!popoverDismissed && results.length > 0 && query.trim().length > 0)

	function isCrypto(r: Result): r is CryptoResult {
		return 'base' in r
	}

	// Fire search when the debounced query settles. Auto-aborts the in-flight fetch on
	// re-trigger (next debounce tick) or component unmount via $effect's cleanup return.
	$effect(() => {
		if (!debouncedQuery.current) {
			results = []
			return
		}
		const ctl = new AbortController()
		fetch(`${searchUrl}?q=${encodeURIComponent(debouncedQuery.current)}`, { signal: ctl.signal })
			.then((res) => {
				if (!res.ok) throw new Error(`search returned ${res.status}`)
				return res.json() as Promise<Result[]>
			})
			.then((data) => {
				if (ctl.signal.aborted) return
				results = data
				highlighted = 0
			})
			.catch((e) => {
				if ((e as Error).name !== 'AbortError') console.error('ticker-tab-input search failed:', e)
			})
		return () => ctl.abort()
	})

	function tryAdd(symbol: string) {
		if (has(symbol)) return
		if (add(symbol)) onPick(symbol)
	}

	function pick(r: Result) {
		tryAdd(r.symbol)
	}

	/** Commit whatever the user typed verbatim — used when Enter fires before the popover shows
	 * results (debounce in flight) or when the typed symbol is already exact. Power-user escape
	 * hatch: typing `BTCUSDT` + Enter shouldn't be blocked by a 200ms search round-trip. The
	 * host's `add` callback owns validation (duplicate, cap, normalization to uppercase); a wrong
	 * symbol falls through to the standard "Skeleton row that never resolves" fail mode. */
	function submitRaw() {
		const symbol = cleanQuery.toUpperCase()
		if (!symbol) return
		tryAdd(symbol)
	}

	/** Soft hide — popover library calls this via `onOpenChange(false)` on outside-click. We
	 * intentionally DON'T clear `query` or `results`, so the field reads as "you typed something
	 * here, click back in to keep going". Refocusing the input flips `popoverDismissed` back to
	 * false; if the cached results still match the query, the popover re-opens instantly with no
	 * round-trip. */
	function dismissPopover() {
		popoverDismissed = true
	}

	/** Full reset — used by Esc, the explicit × clear button, and any "I'm done with this" path.
	 * Clearing `results` makes `showPopover` false (so the library closes), and zeroing `query`
	 * resets the field. Also flips `popoverDismissed` back to its default so a future round of
	 * typing isn't blocked by a stale dismissal flag. Refocuses the input so the user can keep
	 * typing without an extra click. */
	function clearInput() {
		results = []
		query = ''
		popoverDismissed = false
		inputEl?.focus()
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (results.length > 0) {
				clearInput()
			} else {
				onClose()
			}
			return
		}
		if (e.key === 'Enter') {
			e.preventDefault()
			e.stopPropagation()
			if (showPopover && results[highlighted]) {
				pick(results[highlighted])
			} else {
				submitRaw()
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
		}
	}
</script>

<Popover.Root
	open={showPopover}
	onOpenChange={(open) => {
		// Library-requested close (click-outside, etc.). Soft-dismiss only — the typed query
		// stays in the field so the user can come back to it. Refocusing the input flips the
		// flag back; the cached results re-show without another round-trip if they still match.
		if (!open) dismissPopover()
	}}>
	<!-- Trigger wraps a span (the positioning anchor) NOT the input directly. Spreading trigger
	     props onto <input> kills native text-input behavior (role="button", click handlers, etc.).
	     The span is the anchor for Popover.Content positioning; the input inside stays native. -->
	<Popover.Trigger>
		{#snippet child({ props })}
			<span {...props} class="ticker-tab-input-anchor">
				<input
					bind:this={inputEl}
					bind:value={query}
					onkeydown={onKeydown}
					onclick={(e) => e.stopPropagation()}
					onfocus={() => (popoverDismissed = false)}
					class="ticker-tab-input"
					style:width={inputWidth}
					autocomplete="off"
					spellcheck="false"
					{placeholder} />
				{#if query}
					<button
						class="ticker-tab-input-clear"
						onclick={(e) => {
							// Stop the click from bubbling to the trigger anchor (which would toggle the
							// popover) AND from registering as outside-click against the popover lib.
							e.stopPropagation()
							clearInput()
						}}
						aria-label="Clear input"
						title="Clear input">
						×
					</button>
				{/if}
			</span>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content
		align="start"
		sideOffset={8}
		class="ticker-tab-dropdown"
		style="background: var(--rl-color-bg); border: 1px solid var(--rl-color-border); border-radius: var(--rl-radius-lg); padding: var(--rl-space-xs); width: auto; min-width: 220px; max-width: 340px; box-shadow: 0 8px 24px rgba(0,0,0,0.6); ring: none; --tw-ring-shadow: none;"
		onOpenAutoFocus={(e) => e.preventDefault()}
		onCloseAutoFocus={(e) => e.preventDefault()}>
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
		/* Inline-flex with `align-items: center` aligns the × clear button's bounding-box center
		   with the input's bounding-box center. Baseline alignment was geometrically correct but
		   read as "× sitting too high" because the input's tall padding-bottom + border-bottom
		   pushes its baseline (= bottom of visible text) low, while the × glyph renders centered
		   in its own line-box. Center-aligning the boxes plants the × at the input's geometric
		   middle which matches user expectation of "vertically centered with the input". */
		display: inline-flex;
		align-items: center;
		vertical-align: bottom;
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
		outline: none;
		min-width: 3ch;
		caret-color: var(--rl-color-text);
	}
	/* Muted placeholder hint (e.g. "ETF / Index" on the stock host). Lighter weight than the
	   typed text so the field reads as "type something" rather than "this is filled". `opacity:1`
	   resets Firefox's 50% default so the color token controls the actual rendered tone. */
	.ticker-tab-input::placeholder {
		color: var(--rl-color-text-faint);
		font-weight: var(--rl-font-normal);
		opacity: 1;
	}
	/* × clear button — sits flush-right of the input, only when the field has content. Negative
	   inline-end margin pulls the hit-area padding so the visible glyph aligns with the input's
	   right edge. Vertical centering comes from the parent's `align-items: center`. */
	.ticker-tab-input-clear {
		font-family: var(--rl-font-mono);
		font-size: var(--rl-text-sm);
		line-height: 1;
		color: var(--rl-color-text-faint);
		background: transparent;
		border: none;
		padding: 4px;
		margin: 0 -4px 0 2px;
		cursor: pointer;
		border-radius: 4px;
		transition:
			color var(--rl-duration-micro, 120ms) var(--rl-ease-move, ease-out),
			background var(--rl-duration-micro, 120ms) var(--rl-ease-move, ease-out);
	}
	.ticker-tab-input-clear:hover {
		color: var(--rl-color-text);
		background: var(--rl-color-surface-raised);
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
