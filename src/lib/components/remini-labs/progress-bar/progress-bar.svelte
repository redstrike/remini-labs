<script lang="ts">
	import { isProgressVisible, type ProgressPhase } from './create-progress-fsm.js'

	interface Props {
		phase: ProgressPhase
		accentColor: string
	}

	let { phase, accentColor }: Props = $props()
</script>

{#if isProgressVisible(phase)}
	<div
		class="progress-bar"
		class:completing={phase === 'completing'}
		style:background={accentColor}
		aria-hidden="true">
	</div>
{/if}

<style>
	.progress-bar {
		position: absolute;
		top: 0;
		left: 0;
		height: 1px;
		z-index: 9;
		pointer-events: none;
		animation: progress-fill 10s cubic-bezier(0.3, 0.8, 0.1, 1) forwards;
	}
	.progress-bar.completing {
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
