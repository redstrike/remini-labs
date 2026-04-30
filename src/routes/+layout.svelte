<script lang="ts">
	import '../app.css'
	import * as Sidebar from '$lib/components/shadcn-svelte/sidebar/index.js'
	import AppSidebar from '$lib/components/app-sidebar.svelte'
	import { Button } from '$lib/components/shadcn-svelte/button/index.js'
	import { NavigationProgress } from '$lib/components/remini-labs/navigation-progress/index.js'
	import { House } from '@lucide/svelte'
	import { page } from '$app/state'
	import { resolve } from '$app/paths'
	import { browser } from '$app/environment'
	import { PersistedState } from 'runed'
	import { initClockSync } from '$lib/clock-sync'
	import { DEFAULT_OG_IMAGE, SHELL_DESCRIPTION, SITE_NAME } from '$lib/site'

	let { children } = $props()

	// Initialize clock sync on hydration — async NTP-lite fetch against /api/clock.
	// Fire-and-forget: layout is long-lived, no cleanup needed.
	if (browser) {
		initClockSync()
	}

	let isHome = $derived(page.url.pathname === '/')
	let appName = $derived(page.data.meta?.appName)
	// Shell-level transient UI state — sessionStorage envelope keyed
	// `remini-labs.shell.ui`. Survives in-tab reload + SPA nav; resets on
	// new tab / browser session (per W3C sessionStorage scope). Chrome state
	// is per-tab context, not a user preference — localStorage would leak
	// across tabs & devices (if ever synced), so session is the right tier.
	// Envelope shape lets us add future shell toggles (theme mode, header
	// density, etc.) under the same key without sprawl.
	const shell = new PersistedState('remini-labs.shell.ui', { sidebarOpen: false }, { storage: 'session' })

	// ── Meta tag contract ────────────────────────────────────────────────
	// Each mini-app's +page.ts can set page.data.meta.{appName, description, ogImage}.
	// Shell fills shared brand defaults from $lib/site; apps override only what
	// they want. All URLs are made absolute — social crawlers don't resolve
	// relative paths.
	let meta = $derived(page.data.meta ?? {})
	let origin = $derived(page.data.origin ?? page.url.origin)
	let pathname = $derived(page.data.pathname ?? page.url.pathname)
	let title = $derived(meta.appName ? `${meta.appName} — ${SITE_NAME}` : SITE_NAME)
	let description = $derived(meta.description ?? SHELL_DESCRIPTION)
	let ogImagePath = $derived(meta.ogImage ?? DEFAULT_OG_IMAGE)
	let ogImageUrl = $derived(`${origin}${ogImagePath}`)
	let canonical = $derived(`${origin}${pathname}`)
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	<meta name="theme-color" content="#08080c" />
	<link rel="canonical" href={canonical} />

	<!-- Open Graph — FB, Messenger, Zalo, Threads, LinkedIn, Discord, … -->
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content={SITE_NAME} />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:url" content={canonical} />
	<meta property="og:image" content={ogImageUrl} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content={title} />
	<meta property="og:locale" content="en_US" />

	<!-- Twitter / X — large hero preview card -->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={title} />
	<meta name="twitter:description" content={description} />
	<meta name="twitter:image" content={ogImageUrl} />
	<meta name="twitter:image:alt" content={title} />
</svelte:head>

<Sidebar.Provider bind:open={shell.current.sidebarOpen}>
	<AppSidebar {isHome} closeSidebar={() => (shell.current.sidebarOpen = false)} />
	<Sidebar.Inset>
		<header
			class="sticky top-0 z-10 flex w-full items-center gap-2 border-b bg-background/95 p-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
			<Sidebar.Trigger />
			<div class="flex items-center gap-2 text-sm">
				<a
					href={resolve('/')}
					class="flex items-center gap-2"
					onclick={(e) => {
						if (isHome) {
							e.preventDefault()
							shell.current.sidebarOpen = false
						}
					}}>
					<img src="/favicon.png" alt="" width="18" height="18" />
					<span class="font-semibold">{SITE_NAME}</span>
				</a>
				{#if appName}
					<span class="text-muted-foreground">›</span>
					<span class="font-medium">{appName}</span>
				{/if}
			</div>
		</header>
		<main class="relative w-full flex-1 overflow-y-auto bg-background">
			<NavigationProgress />
			{@render children()}
		</main>
	</Sidebar.Inset>
</Sidebar.Provider>
