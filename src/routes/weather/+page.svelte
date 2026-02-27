<script lang="ts">
	import { useWeather, getWeatherCondition } from './use-weather.svelte';

	// UI Components
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import {
		MapPin,
		LoaderCircle,
		Cloud,
		Wind,
		Droplets,
		RefreshCw,
		Globe,
		TriangleAlert,
		Moon,
	} from 'lucide-svelte';

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
				<div class="flex flex-wrap items-center gap-2 text-muted-foreground mt-1">
					<p>Real-time local weather</p>
					{#if weather.relativeTime}
						<span class="text-xs px-2 py-0.5 bg-muted rounded-full"
							>Last updated: {weather.relativeTime}</span
						>
					{/if}
					{#if weather.isApproxLocation && weather.displayWeather}
						<span
							class="text-xs flex items-center gap-1 px-2 py-0.5 bg-amber-500/15 text-amber-500 border border-amber-500/30 rounded-full"
						>
							<TriangleAlert class="w-3 h-3" />
							Approximate location{weather.ipCity ? ` · ${weather.ipCity}` : ''}
						</span>
					{/if}
				</div>
			</div>
			<div class="w-full sm:w-auto flex justify-end">
				{#if weather.displayWeather}
					<Button
						variant="secondary"
						size="sm"
						class="rounded-full shadow-sm gap-2 px-4 transition-all hover:shadow-md"
						onclick={() => weather.requestLocation(true)}
						disabled={weather.loadingState !== 'idle'}
						title="Refresh weather and location data"
					>
						<RefreshCw
							class="h-4 w-4 {weather.loadingState !== 'idle'
								? 'animate-spin text-primary'
								: 'text-muted-foreground'}"
						/>
						<span class="font-medium">Refresh</span>
					</Button>
				{/if}
			</div>
		</div>

		{#if (weather.loadingState === 'locating' || weather.loadingState === 'fetching') && !weather.displayWeather}
			<div class="space-y-6">
				<Skeleton class="h-[240px] w-full rounded-xl" />
				<div class="grid gap-6 md:grid-cols-3">
					<Skeleton class="h-[180px] w-full rounded-xl" />
					<Skeleton class="h-[180px] w-full rounded-xl md:col-span-2" />
				</div>
			</div>
		{:else if weather.displayWeather}
			{@const weatherInfo = weather.displayWeather}
			{#if weatherInfo.weather}
				{@const currentCondition = getWeatherCondition(weatherInfo.weather.current.weather_code)}
				{@const isDay = weatherInfo.weather.current.is_day === 1}
				{@const animType = currentCondition.animationType === 'sun' && !isDay ? 'moon' : currentCondition.animationType}

				<div class="grid gap-6 md:grid-cols-3">
					<!-- Main Weather Card -->
					<Card.Root class="md:col-span-2 overflow-hidden relative">

						<!-- Animated background icon -->
						<div class="weather-bg-icon absolute top-0 right-0 p-6 pointer-events-none select-none" aria-hidden="true">
							{#if animType === 'sun'}
								{@const Icon = currentCondition.icon}
								<Icon class="w-44 h-44 text-amber-400 anim-sun" />
							{:else if animType === 'moon'}
								<Moon class="w-44 h-44 text-sky-300 anim-moon" />
							{:else if animType === 'cloud'}
								{@const Icon = currentCondition.icon}
								<Icon class="w-44 h-44 text-foreground anim-cloud" />
							{:else if animType === 'rain'}
							{@const Icon = currentCondition.icon}
							<div class="relative">
								<Icon class="w-44 h-44 text-sky-400 anim-cloud" />
								<div class="rain-drops" aria-hidden="true">
									{#each [0,1,2,3,4,5,6,7] as i}
										<span class="rain-drop" style="--i:{i}"></span>
									{/each}
								</div>
							</div>
							{:else if animType === 'snow'}
							{@const Icon = currentCondition.icon}
							<div class="relative">
								<Icon class="w-44 h-44 text-sky-200 anim-snow-icon" />
								<div class="snow-flakes" aria-hidden="true">
									{#each [0,1,2,3,4,5] as i}
										<span class="snow-flake" style="--i:{i}">❄</span>
									{/each}
								</div>
							</div>
							{:else if animType === 'storm'}
							{@const Icon = currentCondition.icon}
							<div class="relative">
								<Icon class="w-44 h-44 text-violet-400 anim-cloud" />
								<div class="lightning" aria-hidden="true">⚡</div>
							</div>
							{/if}
						</div>

						<Card.Content class="space-y-5">
							<!-- Location label -->
							<div>
								{#if weather.isApproxLocation && weather.ipCity}
									<p class="text-xl font-semibold tracking-tight">{weather.ipCity}</p>
									<p class="text-xs text-muted-foreground font-mono mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
										<span>Lat: {weatherInfo.lat.toFixed(4)}</span>
										<span>Lng: {weatherInfo.lng.toFixed(4)}</span>
										{#if weather.ipIsp}<span>· {weather.ipIsp}</span>{/if}
									</p>
								{:else if weather.gpsCity}
									<p class="text-xl font-semibold tracking-tight">{weather.gpsCity}</p>
									<p class="text-xs text-muted-foreground font-mono mt-1 flex gap-x-3">
										<span>Lat: {weatherInfo.lat.toFixed(4)}</span>
										<span>Lng: {weatherInfo.lng.toFixed(4)}</span>
									</p>
								{:else}
									<p class="text-xs text-muted-foreground font-mono flex gap-x-3">
										<span>Lat: {weatherInfo.lat.toFixed(4)}</span>
										<span>Lng: {weatherInfo.lng.toFixed(4)}</span>
									</p>
								{/if}
							</div>

							<!-- Temperature + condition -->
							<div class="flex items-center gap-6">
								<span class="text-7xl font-bold tracking-tighter tabular-nums">
									{Math.round(weatherInfo.weather.current.temperature_2m)}°
								</span>
								<div class="flex flex-col">
									<span class="text-xl font-semibold">{currentCondition?.text}</span>
									<span class="text-muted-foreground text-sm mt-0.5">
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
								<span class="font-medium tabular-nums"
									>{weatherInfo.weather.current.wind_speed_10m} km/h</span
								>
							</div>
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-2 text-muted-foreground">
									<Droplets class="h-4 w-4" />
									<span>Humidity</span>
								</div>
								<span class="font-medium tabular-nums"
									>{weatherInfo.weather.current.relative_humidity_2m}%</span
								>
							</div>
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-2 text-muted-foreground">
									<Cloud class="h-4 w-4" />
									<span>Cloud Cover</span>
								</div>
								<span class="font-medium tabular-nums"
									>{weatherInfo.weather.current.cloud_cover}%</span
								>
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
										<div class="flex flex-col text-sm tabular-nums">
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
					{#if weather.permissionState === 'denied'}
						<!-- Denied state: permission cannot be re-prompted, guide user to settings -->
						<div class="p-4 bg-amber-500/10 rounded-full">
							<Globe class="w-12 h-12 text-amber-500" />
						</div>
						<div class="space-y-2 mt-4">
							<h3 class="text-2xl font-semibold">Location Access Blocked</h3>
							<p class="text-muted-foreground max-w-md mx-auto">
								{weather.locationError ||
									'GPS access was denied. To enable it, open your browser site settings and allow location for this site, then reload the page.'}
							</p>
						</div>
						<div class="mt-4 flex flex-col sm:flex-row items-center gap-3">
							<Button variant="outline" size="lg" onclick={() => window.location.reload()}>
								<RefreshCw class="mr-2 h-5 w-5" />
								Reload After Allowing
							</Button>
						</div>
					{:else}
						<!-- Prompt / unknown state: browser prompt can still be triggered -->
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
							onclick={() => weather.requestLocation(true)}
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
					{/if}
				</Card.Content>
			</Card.Root>
		{/if}
	</div>
</div>

<style>
	/* ─── Sun: slow rotation + brightness pulse ─── */
	:global(.anim-sun) {
		animation: sun-spin 20s linear infinite, sun-pulse 4s ease-in-out infinite;
		opacity: 0.18;
		transform-origin: center;
	}
	@keyframes sun-spin {
		from { transform: rotate(0deg); }
		to   { transform: rotate(360deg); }
	}
	@keyframes sun-pulse {
		0%, 100% { opacity: 0.12; filter: blur(0px); }
		50%       { opacity: 0.28; filter: blur(1px); }
	}

	/* ─── Moon: gentle glow pulse ─── */
	:global(.anim-moon) {
		animation: moon-pulse 5s ease-in-out infinite;
		opacity: 0.18;
	}
	@keyframes moon-pulse {
		0%, 100% { opacity: 0.10; transform: scale(1); }
		50%       { opacity: 0.25; transform: scale(1.04); }
	}

	/* ─── Cloud / fog: slow horizontal drift ─── */
	:global(.anim-cloud) {
		animation: cloud-float 7s ease-in-out infinite;
		opacity: 0.12;
	}
	@keyframes cloud-float {
		0%, 100% { transform: translateX(0px) translateY(0px); }
		33%       { transform: translateX(-8px) translateY(-5px); }
		66%       { transform: translateX(5px) translateY(-3px); }
	}

	/* ─── Rain: cloud floats, drops fall ─── */
	.rain-drops {
		position: absolute;
		bottom: -40px;
		left: 16px;
		width: 120px;
		height: 60px;
		overflow: visible;
	}
	.rain-drop {
		position: absolute;
		left: calc(var(--i) * 14px);
		top: 0;
		width: 2px;
		height: 14px;
		border-radius: 999px;
		background: currentColor;
		opacity: 0;
		animation: rain-fall 1.4s linear calc(var(--i) * 0.18s) infinite;
	}
	@keyframes rain-fall {
		0%   { transform: translateY(-10px); opacity: 0; }
		15%  { opacity: 0.5; }
		85%  { opacity: 0.4; }
		100% { transform: translateY(50px); opacity: 0; }
	}

	/* ─── Snow: icon rotates, flakes drift ─── */
	:global(.anim-snow-icon) {
		animation: snow-spin 30s linear infinite;
		opacity: 0.14;
	}
	@keyframes snow-spin {
		from { transform: rotate(0deg); }
		to   { transform: rotate(-360deg); }
	}
	.snow-flakes {
		position: absolute;
		top: 10px;
		left: 10px;
		width: 120px;
		height: 120px;
		pointer-events: none;
	}
	.snow-flake {
		position: absolute;
		left: calc(var(--i) * 20px);
		font-size: 14px;
		opacity: 0;
		animation: snow-drift 3s ease-in calc(var(--i) * 0.5s) infinite;
	}
	@keyframes snow-drift {
		0%   { transform: translateY(-10px) translateX(0); opacity: 0; }
		20%  { opacity: 0.6; }
		80%  { opacity: 0.4; }
		100% { transform: translateY(110px) translateX(12px); opacity: 0; }
	}

	/* ─── Thunderstorm: cloud floats, lightning flashes ─── */
	.lightning {
		position: absolute;
		bottom: 0;
		left: 40px;
		font-size: 40px;
		animation: lightning-flash 3s ease-in-out infinite;
		opacity: 0;
	}
	@keyframes lightning-flash {
		0%, 100%      { opacity: 0; }
		10%, 12%      { opacity: 0.8; }
		11%           { opacity: 0.2; }
		50%, 52%      { opacity: 0.6; }
		51%           { opacity: 0.1; }
	}

	/* shared wrapper: clip overflow from particles */
	.weather-bg-icon {
		overflow: visible;
	}
</style>
