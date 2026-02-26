<script lang="ts">
  import '../app.css';
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import AppSidebar from "$lib/components/app-sidebar.svelte";
  import { page } from "$app/state";

  let { children } = $props();

  let appTitle = $derived(page.url.pathname.startsWith('/weather') ? 'Weather App' : 'Mini App Launcher');
</script>

<svelte:head>
  <title>{appTitle} - Mega App Shell</title>
  <meta name="description" content="SvelteKit super-app shell with hosted mini-apps" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#0D0E14" />
</svelte:head>

<Sidebar.Provider>
  <AppSidebar />
  <Sidebar.Inset>
    <header class="sticky top-0 z-10 flex w-full items-center gap-2 border-b bg-background/95 p-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <Sidebar.Trigger />
      <h1 class="text-xl font-bold">{appTitle}</h1>
    </header>
    <main class="flex-1 w-full bg-background relative overflow-y-auto">
      {@render children()}
    </main>
  </Sidebar.Inset>
</Sidebar.Provider>
