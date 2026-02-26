<script lang="ts">
  import '../app.css';
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import AppSidebar from "$lib/components/app-sidebar.svelte";

  let { children } = $props();
</script>

<svelte:head>
  <title>Mega App Shell</title>
  <meta name="description" content="SvelteKit super-app shell with hosted mini-apps" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#0D0E14" />
</svelte:head>

<Sidebar.Provider>
  <AppSidebar />
  <Sidebar.Inset>
    <main class="flex-1 w-full bg-background relative overflow-y-auto">
      {@render children()}
    </main>
  </Sidebar.Inset>
</Sidebar.Provider>
