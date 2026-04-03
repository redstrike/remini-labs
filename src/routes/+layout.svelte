<script lang="ts">
	import '../app.css'
	import * as Sidebar from '$lib/components/ui/sidebar/index.js'
	import AppSidebar from '$lib/components/app-sidebar.svelte'
	import { Button } from '$lib/components/ui/button/index.js'
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
</script>

<svelte:head>
	<title>{appName ? `${appName} — Remini Labs` : 'Remini Labs'}</title>
	<meta name="description" content="Remini Labs — experimental mini-apps by redstrike (Tung Nguyen), crafted with Claude Code (Opus 4.6 / Sonnet 4.6), Antigravity (Gemini 3.1 Pro). Notable everyday mini-apps: gold/silver tickers, local weather, and more." />
	<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
	<meta name="theme-color" content="#0D0E14" />
</svelte:head>

<Sidebar.Provider bind:open={sidebarOpen}>
	<AppSidebar {isHome} closeSidebar={() => sidebarOpen = false} />
	<Sidebar.Inset>
		<header
			class="sticky top-0 z-10 flex w-full items-center gap-2 border-b bg-background/95 p-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
			<Sidebar.Trigger />
			<div class="flex items-center gap-2 text-sm">
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<a href="/" class="flex items-center gap-2" onclick={(e) => {
					if (isHome) { e.preventDefault(); sidebarOpen = false }
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
