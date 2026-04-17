<script lang="ts">
	interface Props {
		/** Milliseconds since last successful fetch */
		elapsed: number
		/** Total freshness window in milliseconds */
		ttl: number
		/** Show inline debug text */
		debug?: boolean
	}

	let { elapsed, ttl, debug = false }: Props = $props()

	type Freshness = 'fresh' | 'good' | 'aging' | 'stale'

	const freshness: Freshness = $derived.by(() => {
		const freshRatio = 1 - elapsed / ttl
		if (freshRatio >= 0.75) return 'fresh'
		if (freshRatio >= 0.5) return 'good'
		if (freshRatio >= 0.25) return 'aging'
		return 'stale'
	})

	const debugText = $derived.by(() => {
		if (!debug) return ''
		const elapsedSec = Math.floor(elapsed / 1000)
		const ttlSec = Math.floor(ttl / 1000)
		const remainingSec = Math.max(0, ttlSec - elapsedSec)
		const freshPercent = Math.round((1 - elapsed / ttl) * 100)
		return `${elapsedSec}s/${ttlSec}s (${freshPercent}%) · refresh in ${remainingSec}s`
	})
</script>

{#if debug}
	<span class="freshness-debug">
		<span class="freshness-dot {freshness}"></span>
		<span class="freshness-debug-text">{debugText}</span>
	</span>
{:else}
	<span class="freshness-dot {freshness}"></span>
{/if}

<style>
	.freshness-dot {
		display: block;
		width: 6px;
		height: 6px;
		min-width: 6px;
		min-height: 6px;
		border-radius: var(--rl-radius-full);
		flex-shrink: 0;
		animation: pulse var(--pulse-speed) infinite;
	}
	.freshness-dot.fresh {
		background: var(--rl-color-state-fresh);
		--pulse-speed: 3s;
	}
	.freshness-dot.good {
		background: var(--rl-color-state-good);
		--pulse-speed: 2s;
	}
	.freshness-dot.aging {
		background: var(--rl-color-state-aging);
		--pulse-speed: 1.5s;
	}
	.freshness-dot.stale {
		background: var(--rl-color-state-stale);
		--pulse-speed: 0.75s;
	}
	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.4;
		}
	}
	.freshness-debug {
		display: inline-flex;
		align-items: center;
		gap: var(--rl-space-sm);
	}
	.freshness-debug-text {
		font-family: var(--rl-font-mono);
		font-size: 9px;
		color: var(--rl-color-text-muted);
		white-space: nowrap;
	}
</style>
