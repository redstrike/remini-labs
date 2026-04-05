<script lang="ts">
	import type { Snippet } from 'svelte'

	interface Props {
		loading: boolean
		accentColor?: string
		children: Snippet
	}

	let { loading, accentColor = '#4a9eff', children }: Props = $props()

	// Progress bar lifecycle: loading → completing (100% + fade) → idle
	let completing = $state(false)
	let wasLoading = $state(false)
	let completingTimer: ReturnType<typeof setTimeout> | null = null

	$effect(() => {
		if (loading) {
			wasLoading = true
			completing = false
			if (completingTimer) {
				clearTimeout(completingTimer)
				completingTimer = null
			}
		} else if (wasLoading) {
			wasLoading = false
			completing = true
			if (completingTimer) clearTimeout(completingTimer)
			completingTimer = setTimeout(() => {
				completing = false
				completingTimer = null
			}, 400)
		}
	})

	const active = $derived(loading || completing)
</script>

<div class="loading-overlay" class:loading={active}>
	{#if active}
		<div class="loading-overlay-progress" class:completing style:background={accentColor}></div>
	{/if}
	<div class="loading-overlay-content">
		{@render children()}
	</div>
</div>

<style>
	.loading-overlay {
		position: relative;
	}
	.loading-overlay-content {
		opacity: 1;
		filter: blur(0px);
		transition:
			opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1),
			filter 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}
	.loading-overlay.loading .loading-overlay-content {
		opacity: 0.5;
		filter: blur(2px);
		pointer-events: none;
	}
	.loading-overlay-progress {
		position: absolute;
		top: 0;
		left: 0;
		height: 1px;
		z-index: 1;
		animation: progress-fill 10s cubic-bezier(0.3, 0.8, 0.1, 1) forwards;
	}
	.loading-overlay-progress.completing {
		animation: progress-complete 0.35s ease-in forwards;
	}
	@keyframes progress-fill {
		0% {
			width: 0;
		}
		8% {
			width: 30%;
		}
		25% {
			width: 55%;
		}
		50% {
			width: 72%;
		}
		75% {
			width: 84%;
		}
		100% {
			width: 96%;
		}
	}
	@keyframes progress-complete {
		0% {
			width: 90%;
			opacity: 1;
		}
		60% {
			width: 100%;
			opacity: 1;
		}
		100% {
			width: 100%;
			opacity: 0;
		}
	}
</style>
