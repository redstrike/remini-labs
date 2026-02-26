<script lang="ts">
  import { CloudRain } from "lucide-svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
</script>

<header class="sticky top-0 z-10 flex w-full items-center gap-2 border-b bg-background/95 p-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
  <Sidebar.Trigger />
  <h1 class="text-xl font-bold">Mini App Launcher</h1>
</header>

<main class="container mx-auto p-6 md:p-10 max-w-5xl">
  <div class="grid gap-6">
    <div class="flex flex-col gap-2">
      <h2 class="text-3xl font-bold tracking-tight">Welcome back</h2>
      <p class="text-muted-foreground">Select a mini-app to get started.</p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-4">
      <!-- Weather App Card -->
      <a href="/weather" class="block group">
        <div class="rounded-xl border bg-card text-card-foreground shadow transition-all hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 overflow-hidden h-full flex flex-col items-start gap-4 p-6">
          <div class="rounded-lg bg-primary/10 p-3 text-primary group-hover:scale-110 transition-transform">
            <CloudRain class="w-8 h-8" />
          </div>
          <div class="flex flex-col gap-1">
            <h3 class="font-semibold leading-none tracking-tight">Weather App</h3>
            <p class="text-sm text-muted-foreground line-clamp-2">Check the current weather and forecasts for any location.</p>
          </div>
          <div class="mt-auto pt-4 w-full">
            <Button variant="secondary" class="w-full">Open App</Button>
          </div>
        </div>
      </a>
      
      <!-- Placeholder for future apps -->
      <div class="rounded-xl border border-dashed text-card-foreground shadow-sm bg-transparent flex flex-col items-center justify-center gap-2 p-8 text-center min-h-[220px]">
        <span class="text-4xl">✨</span>
        <h3 class="font-medium">More apps coming soon</h3>
      </div>
    </div>
  </div>
</main>
