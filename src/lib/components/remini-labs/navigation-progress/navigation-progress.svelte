<script lang="ts">
	import { navigating } from '$app/state'
	import { ProgressBar, createProgressFSM } from '$lib/components/remini-labs/progress-bar/index.js'

	const ACCENTS: Record<string, string> = {
		'/tickers': '#d97706',
		'/weather': '#3b82f6',
	}
	const DEFAULT_ACCENT = '#4a9eff'

	function pickAccent(pathname: string | undefined): string {
		if (!pathname) return DEFAULT_ACCENT
		for (const route of Object.keys(ACCENTS)) {
			if (pathname === route || pathname.startsWith(route + '/')) return ACCENTS[route]
		}
		return DEFAULT_ACCENT
	}

	let to = $derived(navigating.to)
	let isNavigating = $derived(to !== null)
	let targetAccent = $derived(pickAccent(to?.url.pathname))

	// Latch the accent at navigation start so the completing fade keeps the
	// target color (navigating.to flips to null at completion, so a derived
	// would reset to DEFAULT_ACCENT mid-fade).
	let displayAccent = $state(DEFAULT_ACCENT)
	$effect(() => {
		if (isNavigating) displayAccent = targetAccent
	})

	const fsm = createProgressFSM({ delayMs: 150 })
	$effect(() => {
		fsm.send(isNavigating ? 'on' : 'off')
	})
</script>

<ProgressBar phase={fsm.current} accentColor={displayAccent} />
