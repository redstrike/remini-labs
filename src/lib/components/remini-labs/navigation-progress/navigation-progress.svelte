<script lang="ts">
	import { navigating } from '$app/state'
	import {
		DEFAULT_PROGRESS_ACCENT,
		ProgressBar,
		createProgressFSM,
	} from '$lib/components/remini-labs/progress-bar/index.js'

	const ACCENTS: Record<string, string> = {
		'/tickers': '#d97706',
		'/weather': '#3b82f6',
	}

	function pickAccent(pathname: string | undefined): string {
		if (!pathname) return DEFAULT_PROGRESS_ACCENT
		for (const [route, color] of Object.entries(ACCENTS)) {
			if (pathname === route || pathname.startsWith(route + '/')) return color
		}
		return DEFAULT_PROGRESS_ACCENT
	}

	const to = $derived(navigating.to)
	const isNavigating = $derived(to !== null)
	const targetAccent = $derived(pickAccent(to?.url.pathname))

	// Latch the accent at navigation start so the completing fade keeps the
	// target color (navigating.to flips to null at completion, so a derived
	// would reset to DEFAULT_PROGRESS_ACCENT mid-fade).
	let displayAccent = $state(DEFAULT_PROGRESS_ACCENT)
	$effect(() => {
		if (isNavigating) displayAccent = targetAccent
	})

	const fsm = createProgressFSM({ delayMs: 150 })
	$effect(() => {
		fsm.send(isNavigating ? 'on' : 'off')
	})
</script>

<ProgressBar phase={fsm.current} accentColor={displayAccent} />
