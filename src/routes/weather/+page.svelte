<script lang="ts">
	import { useWeather, getWeatherCondition } from './use-weather.svelte';

	// UI Components
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { MapPin, LoaderCircle, Cloud, Wind, Droplets, RefreshCw } from 'lucide-svelte';

	const weather = useWeather();
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
					{#if weather.isUpdatingInBg || weather.loadingState === 'fetching' || weather.loadingState === 'locating'}
						<LoaderCircle class="w-4 h-4 animate-spin text-muted-foreground" />
					{/if}
				</h1>
				<div class="flex items-center gap-2 text-muted-foreground mt-1">
					<p>Real-time local weather</p>
					{#if weather.relativeTime}
						<span class="text-xs px-2 py-0.5 bg-muted rounded-full">Last updated: {weather.relativeTime}</span>
					{/if}
				</div>
			</div>
			<div>
				{#if weather.displayWeather}
					<div class="flex items-center gap-2">
						<Button
							variant="outline"
							size="icon"
							onclick={() => weather.requestLocation(true)}
							disabled={weather.loadingState !== 'idle'}
							title="Force fetch latest weather"
						>
							<RefreshCw class="h-4 w-4 {weather.loadingState !== 'idle' ? 'animate-spin' : ''}" />
						</Button>
						<Button
							variant="outline"
							size="sm"
							onclick={() => weather.requestLocation(true)}
							disabled={weather.loadingState !== 'idle'}
						>
							<MapPin class="h-4 w-4 mr-2" />
							Update Location
						</Button>
					</div>
				{/if}
			</div>
		</div>

		{#if (weather.loadingState === 'locating' || weather.loadingState === 'fetching') && !weather.displayWeather}
			<div class="space-y-6">
				<Skeleton class="h-[200px] w-full rounded-xl" />
				<div class="grid gap-6 md:grid-cols-3">
					<Skeleton class="h-[150px] w-full rounded-xl" />
					<Skeleton class="h-[150px] w-full rounded-xl md:col-span-2" />
				</div>
			</div>
		{:else if weather.displayWeather}
			{@const weatherInfo = weather.displayWeather}
			{#if weatherInfo.weather}
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
							<Card.Description
								>Lat: {weatherInfo.lat.toFixed(4)}, Lng: {weatherInfo.lng.toFixed(4)}</Card.Description
							>
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
									<div
										class="flex flex-col items-center gap-2 rounded-lg border bg-muted/30 p-4 text-center"
									>
										<span class="text-sm font-medium">
											{new Date(day).toLocaleDateString(undefined, { weekday: 'short' })}
										</span>
										<Icon class="h-6 w-6 text-primary" />
										<div class="flex flex-col text-sm">
											<span class="font-bold"
												>{Math.round(weatherInfo.weather.daily.temperature_2m_max[i])}°</span
											>
											<span class="text-muted-foreground"
												>{Math.round(weatherInfo.weather.daily.temperature_2m_min[i])}°</span
											>
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
							{weather.locationError ||
								"We use your device's location to provide accurate, real-time weather information for your area."}
						</p>
					</div>
					<Button
						class="mt-4"
						size="lg"
						onclick={() => weather.requestLocation(false)}
						disabled={weather.loadingState !== 'idle'}
					>
						{#if weather.loadingState !== 'idle'}
							<LoaderCircle class="mr-2 h-5 w-5 animate-spin" />
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
