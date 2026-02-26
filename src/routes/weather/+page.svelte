<script lang="ts">
  import { onMount } from 'svelte';
  import type { PageData } from './$types';
  import { asyncStorage } from '$lib/utils/storage';
  
  // UI Components
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import { MapPin, Loader2, Cloud, Sun, CloudRain, Snowflake, Wind, Droplets, RefreshCw } from "lucide-svelte";

  let { data } = $props<{ data: PageData }>();

  let loadingState = $state<'idle' | 'locating' | 'fetching'>('idle');
  let locationError = $state<string | null>(null);
  let cachedWeather = $state<any>(null); 
  let liveWeather = $state<any>(null);   
  
  let displayWeather = $derived(liveWeather || cachedWeather);
  let isUpdatingInBg = $derived(loadingState === 'fetching' && !!displayWeather && !liveWeather);
  
  let now = $state(Date.now());
  
  $effect(() => {
    const interval = setInterval(() => {
      now = Date.now();
    }, 60000); // update every minute
    return () => clearInterval(interval);
  });
  
  let relativeTime = $derived.by(() => {
    if (!displayWeather || !displayWeather.timestamp) return '';
    const diffMs = now - displayWeather.timestamp;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  });

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

  // Haversine formula to detect drastic location changes (> 10km)
  function isDrasticChange(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return (R * c) > 10;
  }

  async function fetchWeatherData(lat: number, lng: number) {
    loadingState = 'fetching';
    try {
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset&timezone=auto`);
      const weatherData = await response.json();
      
      const newWeather = { lat, lng, timestamp: Date.now(), weather: weatherData };
      liveWeather = newWeather;
      
      await asyncStorage.setItem('weather_cache', newWeather);
    } catch (e) {
      console.error('Failed to fetch weather', e);
      locationError = 'Failed to fetch the latest weather data.';
    } finally {
      loadingState = 'idle';
    }
  }

  const FRESHNESS_THRESHOLD = 30 * 60 * 1000; // 30 minutes in ms

  async function requestLocation(force: boolean = false) {
    loadingState = 'locating';
    locationError = null;

    if (!navigator.geolocation) {
      locationError = "Geolocation is not supported by your browser.";
      loadingState = 'idle';
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        
        let shouldFetch = true;
        
        if (cachedWeather) {
           const isDrastic = isDrasticChange(cachedWeather.lat, cachedWeather.lng, latitude, longitude);
           const isStale = (Date.now() - cachedWeather.timestamp) > FRESHNESS_THRESHOLD;
           
           if (isDrastic) {
              // Discard cache if drastically changed
              cachedWeather = null;
           } else if (!isStale && !force) {
              // Location is same, and data is fresh. Skip fetch unless forced.
              shouldFetch = false;
              loadingState = 'idle';
           }
        }
        
        if (shouldFetch) {
          await fetchWeatherData(latitude, longitude);
        }
      },
      (error) => {
        console.error("Geolocation error:", error);
        locationError = "Please allow location access to see your local weather.";
        loadingState = 'idle';
      },
      { timeout: 10000, maximumAge: 60000 }
    );
  }

  onMount(async () => {
    // Check if we have SSR data
    const ssrWeather = await data.streamed.weatherData;
    if (ssrWeather && !ssrWeather.error) {
       liveWeather = { ...ssrWeather, timestamp: Date.now() };
       return; // Rely on SSR, no immediate CSR fetch to save calls
    }

    // Load from cache first
    const cached = await asyncStorage.getItem<any>('weather_cache');
    if (cached) {
      cachedWeather = cached;
    }

    // Trigger update automatically
    requestLocation();
  });
</script>

<svelte:head>
  <title>Local Weather</title>
</svelte:head>

<div class="container mx-auto p-4 md:p-8 max-w-4xl relative">
  <div class="flex flex-col gap-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div>
        <h1 class="text-3xl font-bold tracking-tight flex items-center gap-2">
          Local Weather
          {#if isUpdatingInBg || loadingState === 'fetching' || loadingState === 'locating'}
             <Loader2 class="w-4 h-4 animate-spin text-muted-foreground" />
          {/if}
        </h1>
        <div class="flex items-center gap-2 text-muted-foreground mt-1">
          <p>Real-time local weather</p>
          {#if relativeTime}
            <span class="text-xs px-2 py-0.5 bg-muted rounded-full">Last updated: {relativeTime}</span>
          {/if}
        </div>
      </div>
      <div>
        {#if displayWeather}
          <div class="flex items-center gap-2">
            <Button variant="outline" size="icon" onclick={() => requestLocation(true)} disabled={loadingState !== 'idle'} title="Force fetch latest weather">
               <RefreshCw class="h-4 w-4 {loadingState !== 'idle' ? 'animate-spin' : ''}" />
            </Button>
            <Button variant="outline" size="sm" onclick={() => requestLocation(false)} disabled={loadingState !== 'idle'}>
              <MapPin class="h-4 w-4 mr-2" />
              Update Location
            </Button>
          </div>
        {/if}
      </div>
    </div>

    {#if loadingState === 'locating' || (loadingState === 'fetching' && !displayWeather)}
      <div class="space-y-6">
        <Skeleton class="h-[200px] w-full rounded-xl" />
        <div class="grid gap-6 md:grid-cols-3">
          <Skeleton class="h-[150px] w-full rounded-xl" />
          <Skeleton class="h-[150px] w-full rounded-xl md:col-span-2" />
        </div>
      </div>
    {:else if displayWeather}
      {@const weatherInfo = displayWeather}
      {#if weatherInfo.error}
        <!-- Error State -->
        <Card.Root class="border-destructive bg-destructive/10">
          <Card.Content class="p-6 text-center">
            <p class="text-destructive font-medium">{weatherInfo.error}</p>
            <Button variant="outline" class="mt-4" onclick={() => requestLocation(true)}>Try Again</Button>
          </Card.Content>
        </Card.Root>
      {:else if weatherInfo.weather}
        {@const currentCondition = getWeatherCondition(weatherInfo.weather.current.weather_code)}
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
              <Card.Title class="text-2xl">Your Location</Card.Title>
              <Card.Description>Lat: {weatherInfo.lat.toFixed(4)}, Lng: {weatherInfo.lng.toFixed(4)}</Card.Description>
            </Card.Header>
            <Card.Content>
              <div class="flex items-center gap-6">
                <span class="text-6xl font-bold tracking-tighter">
                  {Math.round(weatherInfo.weather.current.temperature_2m)}°
                </span>
                <div class="flex flex-col">
                  <span class="text-xl font-medium">{currentCondition?.text}</span>
                  <span class="text-muted-foreground">
                    Feels like {Math.round(weatherInfo.weather.current.apparent_temperature)}°
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
                <span class="font-medium">{weatherInfo.weather.current.wind_speed_10m} km/h</span>
              </div>
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2 text-muted-foreground">
                  <Droplets class="h-4 w-4" />
                  <span>Humidity</span>
                </div>
                <span class="font-medium">{weatherInfo.weather.current.relative_humidity_2m}%</span>
              </div>
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2 text-muted-foreground">
                  <Cloud class="h-4 w-4" />
                  <span>Cloud Cover</span>
                </div>
                <span class="font-medium">{weatherInfo.weather.current.cloud_cover}%</span>
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
                {#each weatherInfo.weather.daily.time as day, i (day)}
                  {@const fc = getWeatherCondition(weatherInfo.weather.daily.weather_code[i])}
                  {@const Icon = fc.icon}
                  <div class="flex flex-col items-center gap-2 rounded-lg border bg-muted/30 p-4 text-center">
                    <span class="text-sm font-medium">
                      {new Date(day).toLocaleDateString(undefined, { weekday: 'short' })}
                    </span>
                    <Icon class="h-6 w-6 text-primary" />
                    <div class="flex flex-col text-sm">
                      <span class="font-bold">{Math.round(weatherInfo.weather.daily.temperature_2m_max[i])}°</span>
                      <span class="text-muted-foreground">{Math.round(weatherInfo.weather.daily.temperature_2m_min[i])}°</span>
                    </div>
                  </div>
                {/each}
              </div>
            </Card.Content>
          </Card.Root>

        </div>
      {/if}
    {:else}
      <!-- Prompt Location Fallback -->
      <Card.Root class="border-border mt-8">
        <Card.Content class="p-12 text-center flex flex-col items-center gap-4">
          <div class="p-4 bg-muted rounded-full">
            <MapPin class="w-12 h-12 text-muted-foreground" />
          </div>
          <div class="space-y-2 mt-4">
            <h3 class="text-2xl font-semibold">Location Required</h3>
            <p class="text-muted-foreground max-w-md mx-auto">
              {locationError || "We use your device's location to provide accurate, real-time weather information for your area."}
            </p>
          </div>
          <Button class="mt-4" size="lg" onclick={() => requestLocation(false)} disabled={loadingState !== 'idle'}>
            {#if loadingState !== 'idle'}
              <Loader2 class="mr-2 h-5 w-5 animate-spin" />
              Locating...
            {:else}
              <MapPin class="mr-2 h-5 w-5" />
              Get Current Location
            {/if}
          </Button>
        </Card.Content>
      </Card.Root>
    {/if}
  </div>
</div>
