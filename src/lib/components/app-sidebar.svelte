<script lang="ts">
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import { LayoutDashboard, CloudRain } from "lucide-svelte";
</script>

<Sidebar.Root>
  <Sidebar.Header>
    <div class="flex items-center justify-center p-4 py-6 text-xl font-bold tracking-tight text-primary">
      MegaApp
    </div>
  </Sidebar.Header>
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
                  <span>Weather App</span>
                </a>
              {/snippet}
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>
        </Sidebar.Menu>
      </Sidebar.GroupContent>
    </Sidebar.Group>
  </Sidebar.Content>
  <Sidebar.Footer>
    <div class="p-4 text-xs text-muted-foreground text-center">
      Vibe Coding Mode
    </div>
  </Sidebar.Footer>
</Sidebar.Root>
