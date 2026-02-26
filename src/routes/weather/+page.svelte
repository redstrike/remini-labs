<script lang="ts">
  import type { PageData } from './$types';
  import { invalidateAll } from '$app/navigation';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  
  // UI Components
  import { Input } from "$lib/components/ui/input/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import { Search, Loader2, Cloud, Sun, CloudRain, Snowflake, Wind, Droplets } from "lucide-svelte";

  let { data } = $props<{ data: PageData }>();
  
  let searchQuery = $state('');
  let isSearching = $state(false);

  // Parse WMO Weather codes to human readable text and icons
  function getWeatherCondition(code: number) {
    if (code === 0) return { text: 'Clear sky', icon: Sun };
    if (code === 1 || code === 2 || code === 3) return { text: 'Partly cloudy', icon: Cloud };
    if (code >= 45 && code <= 48) return { text: 'Fog', icon: Cloud };
    if (code >= 51 && code <= 67) return { text: 'Rain', icon: CloudRain };
    if (code >= 71 && code <= 77) return { text: 'Snow', icon: Snowflake };
    if (code >= 80 && code <= 82) return { text: 'Showers', icon: CloudRain };
    if (code >= 95 && code <= 99) return { text: 'Thunderstorm', icon: CloudRain };
    return { text: 'Unknown', icon: Cloud };
  }

  async function handleSearch(e: Event) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    
    isSearching = true;
    try {
      const url = new URL($page.url);
      url.searchParams.set('city', searchQuery);
      await goto(url.toString(), { keepFocus: true });
    } finally {
      isSearching = false;
      searchQuery = '';
    }
  }

  let currentCondition = $derived(data.weather ? getWeatherCondition(data.weather.current.weather_code) : null);
</script>

<svelte:head>
  <title>Weather - {data.city || 'App'}</title>
</svelte:head>

<div class="container mx-auto p-4 md:p-8 max-w-4xl">
  <div class="flex flex-col gap-6">
    <!-- Header & Search -->
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">Weather</h1>
        <p class="text-muted-foreground">Real-time weather powered by Open-Meteo (SSR + CSR)</p>
      </div>

      <form onsubmit={handleSearch} class="flex w-full sm:w-auto items-center gap-2">
        <Input 
          type="text" 
          placeholder="Search city..." 
          bind:value={searchQuery}
          class="w-full sm:w-[250px]" 
        />
        <Button type="submit" disabled={isSearching} size="icon">
          {#if isSearching}
            <Loader2 class="h-4 w-4 animate-spin" />
          {:else}
            <Search class="h-4 w-4" />
          {/if}
        </Button>
      </form>
    </div>

    <!-- Error State -->
    {#if data.error}
      <Card.Root class="border-destructive bg-destructive/10">
        <Card.Content class="p-6 text-center">
          <p class="text-destructive font-medium">{data.error}</p>
          <p class="text-sm text-muted-foreground mt-2">Try searching for a different city.</p>
        </Card.Content>
      </Card.Root>
    {/if}

    <!-- Weather Content -->
    {#if data.weather}
      <div class="grid gap-6 md:grid-cols-3">
        
        <!-- Main Weather Card -->
        <Card.Root class="md:col-span-2 overflow-hidden relative">
          <div class="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
            {#if currentCondition}
              {@const Icon = currentCondition.icon}
              <Icon class="w-48 h-48" />
            {/if}
          </div>
          <Card.Header>
            <Card.Title class="text-2xl">{data.city}, {data.country}</Card.Title>
            <Card.Description>Current conditions</Card.Description>
          </Card.Header>
          <Card.Content>
            <div class="flex items-center gap-6">
              <span class="text-6xl font-bold tracking-tighter">
                {Math.round(data.weather.current.temperature_2m)}°
              </span>
              <div class="flex flex-col">
                <span class="text-xl font-medium">{currentCondition?.text}</span>
                <span class="text-muted-foreground">
                  Feels like {Math.round(data.weather.current.apparent_temperature)}°
                </span>
              </div>
            </div>
          </Card.Content>
        </Card.Root>

        <!-- Details Card -->
        <Card.Root>
          <Card.Header>
            <Card.Title>Details</Card.Title>
          </Card.Header>
          <Card.Content class="grid gap-4">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2 text-muted-foreground">
                <Wind class="h-4 w-4" />
                <span>Wind</span>
              </div>
              <span class="font-medium">{data.weather.current.wind_speed_10m} km/h</span>
            </div>
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2 text-muted-foreground">
                <Droplets class="h-4 w-4" />
                <span>Humidity</span>
              </div>
              <span class="font-medium">{data.weather.current.relative_humidity_2m}%</span>
            </div>
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2 text-muted-foreground">
                <Cloud class="h-4 w-4" />
                <span>Cloud Cover</span>
              </div>
              <span class="font-medium">{data.weather.current.cloud_cover}%</span>
            </div>
          </Card.Content>
        </Card.Root>

        <!-- Forecast (Daily) -->
        <Card.Root class="md:col-span-3">
          <Card.Header>
            <Card.Title>7-Day Forecast</Card.Title>
          </Card.Header>
          <Card.Content>
            <div class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-4">
              {#each data.weather.daily.time as day, i (day)}
                {@const fc = getWeatherCondition(data.weather.daily.weather_code[i])}
                {@const Icon = fc.icon}
                <div class="flex flex-col items-center gap-2 rounded-lg border bg-muted/30 p-4 text-center">
                  <span class="text-sm font-medium">
                    {new Date(day).toLocaleDateString(undefined, { weekday: 'short' })}
                  </span>
                  <Icon class="h-6 w-6 text-primary" />
                  <div class="flex flex-col text-sm">
                    <span class="font-bold">{Math.round(data.weather.daily.temperature_2m_max[i])}°</span>
                    <span class="text-muted-foreground">{Math.round(data.weather.daily.temperature_2m_min[i])}°</span>
                  </div>
                </div>
              {/each}
            </div>
          </Card.Content>
        </Card.Root>

      </div>
    {:else if !data.error && isSearching}
      <div class="flex items-center justify-center p-12">
        <Loader2 class="h-8 w-8 animate-spin text-primary" />
      </div>
    {/if}
  </div>
</div>
