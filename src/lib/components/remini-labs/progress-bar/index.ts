export { default as ProgressBar } from './progress-bar.svelte'
export { createProgressFSM, isProgressVisible, type ProgressPhase } from './create-progress-fsm.js'

/** Neutral progress/loading accent used when no route- or asset-specific accent applies. */
export const DEFAULT_PROGRESS_ACCENT = '#4a9eff'
