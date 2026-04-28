<script lang="ts">
	import type { Snippet } from 'svelte'
	import {
		DEFAULT_PROGRESS_ACCENT,
		ProgressBar,
		createProgressFSM,
		isProgressVisible,
	} from '$lib/components/remini-labs/progress-bar/index.js'

	interface Props {
		loading: boolean
		accentColor?: string
		children: Snippet
	}

	let { loading, accentColor = DEFAULT_PROGRESS_ACCENT, children }: Props = $props()

	const fsm = createProgressFSM()
	$effect(() => {
		fsm.send(loading ? 'on' : 'off')
	})

	const active = $derived(isProgressVisible(fsm.current))
</script>

<div class="loading-overlay" class:loading={active}>
	<ProgressBar phase={fsm.current} {accentColor} />
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
</style>
