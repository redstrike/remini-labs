<script lang="ts">
	import * as Sidebar from '$lib/components/ui/sidebar/index.js'
	import { LayoutDashboard, CloudRain, TrendingUp } from '@lucide/svelte'
</script>

<Sidebar.Root>
	<Sidebar.Header></Sidebar.Header>
	<Sidebar.Content>
		<Sidebar.Group>
			<Sidebar.GroupLabel>Mini Apps</Sidebar.GroupLabel>
			<Sidebar.GroupContent>
				<Sidebar.Menu>
					<Sidebar.MenuItem>
						<Sidebar.MenuButton>
							{#snippet child({ props })}
								<a href="/" {...props}>
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
								<a href="/tickers" {...props}>
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
		<div class="p-4 text-center text-xs text-muted-foreground">Vibe Coding Mode</div>
	</Sidebar.Footer>
</Sidebar.Root>
