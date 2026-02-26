<script lang="ts">
  import '../app.css';
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import AppSidebar from "$lib/components/app-sidebar.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { House } from "lucide-svelte";
  import { page } from "$app/state";

  let { children } = $props();

  let isHome = $derived(page.url.pathname === '/');
  let appName = $derived(page.data.meta?.appName);
</script>

<svelte:head>
  <title>{appName ? `${appName} - Mini Apps` : 'Mini Apps'}</title>
  <meta name="description" content="SvelteKit super-app shell with hosted mini-apps" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#0D0E14" />
</svelte:head>

<Sidebar.Provider>
  <AppSidebar />
  <Sidebar.Inset>
    <header class="sticky top-0 z-10 flex w-full items-center gap-2 border-b bg-background/95 p-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <Sidebar.Trigger />
      {#if !isHome}
        <div class="flex items-center gap-2">
          <Button variant="ghost" size="icon" href="/">
            <House class="h-5 w-5" />
            <span class="sr-only">Home</span>
          </Button>
          {#if appName}
            <span class="text-sm font-medium">{appName}</span>
          {/if}
        </div>
      {/if}
    </header>
    <main class="flex-1 w-full bg-background relative overflow-y-auto">
      {@render children()}
    </main>
  </Sidebar.Inset>
</Sidebar.Provider>
