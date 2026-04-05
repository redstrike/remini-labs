<script lang="ts">
	interface Props {
		/** Milliseconds since last successful fetch */
		elapsed: number
		/** Total freshness window in milliseconds */
		ttl: number
	}

	let { elapsed, ttl }: Props = $props()

	type Freshness = 'fresh' | 'good' | 'aging' | 'stale'

	const freshness: Freshness = $derived.by(() => {
		const pct = 1 - elapsed / ttl
		if (pct > 0.75) return 'fresh'
		if (pct > 0.5) return 'good'
		if (pct > 0.25) return 'aging'
		return 'stale'
	})
</script>

<span class="freshness-dot {freshness}"></span>

<style>
	.freshness-dot {
		display: block;
		width: 6px;
		height: 6px;
		min-width: 6px;
		min-height: 6px;
		border-radius: 9999px;
		flex-shrink: 0;
		animation: pulse var(--pulse-speed) infinite;
	}
	.freshness-dot.fresh {
		background: #34d399;
		--pulse-speed: 3s;
	}
	.freshness-dot.good {
		background: #f0c850;
		--pulse-speed: 2s;
	}
	.freshness-dot.aging {
		background: #e8993a;
		--pulse-speed: 1.5s;
	}
	.freshness-dot.stale {
		background: #ef4444;
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
</style>
