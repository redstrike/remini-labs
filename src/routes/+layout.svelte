<script lang="ts">
	import '../app.css'
	import * as Sidebar from '$lib/components/shadcn-svelte/sidebar/index.js'
	import AppSidebar from '$lib/components/app-sidebar.svelte'
	import { Button } from '$lib/components/shadcn-svelte/button/index.js'
	import { House } from '@lucide/svelte'
	import { page } from '$app/state'
	import { browser } from '$app/environment'
	import { initClockSync } from '$lib/clock-sync'

	let { children } = $props()

	// Initialize clock sync from SSR-provided server time
	if (browser && page.data.serverTime) {
		initClockSync(page.data.serverTime)
	}

	let isHome = $derived(page.url.pathname === '/')
	let appName = $derived(page.data.meta?.appName)
	// Read initial sidebar state from server cookie — intentionally one-time capture
	const initialSidebarOpen = page.data.sidebarOpen ?? true
	let sidebarOpen = $state(initialSidebarOpen)

	// ── Meta tag contract ────────────────────────────────────────────────
	// Each mini-app's +page.ts can set page.data.meta.{appName, description, ogImage}.
	// Shell fills shared brand defaults; apps override only what they want.
	// All URLs are made absolute — social crawlers don't resolve relative paths.
	const SHELL_DESCRIPTION =
		'Personal research labs for experimental mini-apps — tickers, weather, and more. Crafted by redstrike (Tung Nguyen) with agentic AI development tools (Claude Code, Antigravity, etc.)'

	let meta = $derived(page.data.meta ?? {})
	let origin = $derived(page.data.origin ?? page.url.origin)
	let pathname = $derived(page.data.pathname ?? page.url.pathname)
	let title = $derived(meta.appName ? `${meta.appName} — Remini Labs` : 'Remini Labs')
	let description = $derived(meta.description ?? SHELL_DESCRIPTION)
	let ogImagePath = $derived(meta.ogImage ?? '/og-default.png')
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
	<meta property="og:site_name" content="Remini Labs" />
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

<Sidebar.Provider bind:open={sidebarOpen}>
	<AppSidebar {isHome} closeSidebar={() => (sidebarOpen = false)} />
	<Sidebar.Inset>
		<header
			class="sticky top-0 z-10 flex w-full items-center gap-2 border-b bg-background/95 p-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
			<Sidebar.Trigger />
			<div class="flex items-center gap-2 text-sm">
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<a
					href="/"
					class="flex items-center gap-2"
					onclick={(e) => {
						if (isHome) {
							e.preventDefault()
							sidebarOpen = false
						}
					}}>
					<img src="/favicon.png" alt="" width="18" height="18" />
					<span class="font-semibold">Remini Labs</span>
				</a>
				{#if appName}
					<span class="text-muted-foreground">›</span>
					<span class="font-medium">{appName}</span>
				{/if}
			</div>
		</header>
		<main class="relative w-full flex-1 overflow-y-auto bg-background">
			{@render children()}
		</main>
	</Sidebar.Inset>
</Sidebar.Provider>
