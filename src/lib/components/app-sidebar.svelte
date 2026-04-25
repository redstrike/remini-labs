<script lang="ts">
	import * as Sidebar from '$lib/components/shadcn-svelte/sidebar/index.js'
	import { LayoutDashboard, CloudRain, TrendingUp } from '@lucide/svelte'

	let { isHome = false, closeSidebar = () => {} }: { isHome?: boolean; closeSidebar?: () => void } = $props()

	function handleHomeClick(e: MouseEvent) {
		if (isHome) {
			e.preventDefault()
			closeSidebar()
		}
	}
</script>

<Sidebar.Root>
	<Sidebar.Header>
		<a href="/" class="flex items-center gap-2.5 px-2 py-3" onclick={handleHomeClick}>
			<img src="/favicon.png" alt="" width="20" height="20" />
			<span class="text-sm font-semibold tracking-tight">Remini Labs</span>
		</a>
	</Sidebar.Header>
	<Sidebar.Content>
		<Sidebar.Group>
			<Sidebar.GroupContent>
				<Sidebar.Menu>
					<Sidebar.MenuItem>
						<Sidebar.MenuButton>
							{#snippet child({ props })}
								<a href="/" {...props} onclick={handleHomeClick}>
									<LayoutDashboard />
									<span>Home</span>
								</a>
							{/snippet}
						</Sidebar.MenuButton>
					</Sidebar.MenuItem>
					<Sidebar.MenuItem>
						<Sidebar.MenuButton>
							{#snippet child({ props })}
								<a href="/weather" {...props}>
									<CloudRain />
									<span>Weather</span>
								</a>
							{/snippet}
						</Sidebar.MenuButton>
					</Sidebar.MenuItem>
					<Sidebar.MenuItem>
						<Sidebar.MenuButton>
							{#snippet child({ props })}
								<a href="/tickers" data-sveltekit-preload-code="eager" {...props}>
									<TrendingUp />
									<span>Tickers</span>
								</a>
							{/snippet}
						</Sidebar.MenuButton>
					</Sidebar.MenuItem>
				</Sidebar.Menu>
			</Sidebar.GroupContent>
		</Sidebar.Group>
	</Sidebar.Content>
	<Sidebar.Footer>
		<div class="p-4 text-center text-[13px] whitespace-nowrap text-muted-foreground md:text-[12px]">
			Crafted with ❤️ ☕ and 🤖 by redstrike
		</div>
	</Sidebar.Footer>
</Sidebar.Root>
