<script lang="ts">
	import { useWeather, getWeatherCondition } from './use-weather.svelte'

	import { Button } from '$lib/components/ui/button/index.js'
	import * as Card from '$lib/components/ui/card/index.js'
	import { Skeleton } from '$lib/components/ui/skeleton/index.js'
	import { MapPin, LoaderCircle, Cloud, Wind, Droplets, RefreshCw, Globe, TriangleAlert, Moon } from '@lucide/svelte'

	const weather = useWeather(true)
</script>

<div class="weather-room relative p-4 md:p-8">
<div class="container mx-auto max-w-4xl">
	<div class="flex flex-col gap-6">
		<!-- Header -->
		<div class="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
			<div>
				<h1 class="flex items-center gap-2 text-3xl font-bold tracking-tight">
					Weather
					{#if weather.isUpdatingInBg || weather.loadingState === 'fetching' || weather.loadingState === 'locating'}
						<LoaderCircle class="h-4 w-4 animate-spin text-muted-foreground" />
					{/if}
				</h1>
				<div class="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground">
					<p>Real-time local weather</p>
					{#if weather.relativeTime}
						<span class="rounded-full bg-muted px-2 py-0.5 text-xs"
							>Last updated: {weather.relativeTime}</span>
					{/if}
					{#if weather.isApproxLocation && weather.displayWeather}
						<span
							class="flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-xs text-amber-500">
							<TriangleAlert class="h-3 w-3" />
							Approximate location{weather.ipCity ? ` · ${weather.ipCity}` : ''}
						</span>
					{/if}
				</div>
			</div>
			<div class="flex w-full justify-end sm:w-auto">
				{#if weather.displayWeather}
					<Button
						variant="secondary"
						size="sm"
						class="gap-2 rounded-full px-4 shadow-sm transition-all hover:shadow-md"
						onclick={() => weather.requestLocation(true)}
						disabled={weather.loadingState !== 'idle'}
						title="Refresh weather and location data">
						<RefreshCw
							class="h-4 w-4 {weather.loadingState !== 'idle'
								? 'animate-spin text-primary'
								: 'text-muted-foreground'}" />
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
				{@const animType =
					currentCondition.animationType === 'sun' && !isDay ? 'moon' : currentCondition.animationType}
				{@const temp = Math.round(weatherInfo.weather.current.temperature_2m)}
				{@const gradientClass =
					animType === 'storm' ? (isDay ? 'weather-grad-storm-day' : 'weather-grad-storm-night')
					: animType === 'rain' ? (isDay ? 'weather-grad-rain-day' : 'weather-grad-rain-night')
					: animType === 'snow' ? (isDay ? 'weather-grad-snow-day' : 'weather-grad-snow-night')
					: animType === 'cloud' ? (isDay ? 'weather-grad-cloud-day' : 'weather-grad-cloud-night')
					: animType === 'moon' ? 'weather-grad-clear-night'
					: temp >= 35 ? 'weather-grad-hot'
					: 'weather-grad-clear-day'}

				<div class="weather-page-bg {gradientClass} rounded-2xl p-4 md:p-6 relative overflow-hidden">
				<!-- Atmospheric overlays -->
				{#if animType === 'sun' || (animType !== 'moon' && temp >= 30)}
					<div class="weather-sun-glow" aria-hidden="true"></div>
				{/if}
				{#if animType === 'rain' || animType === 'storm'}
					<div class="weather-rain-overlay" aria-hidden="true">
						{#each Array(20) as _, i}
							<span class="weather-rain-streak" style="--i:{i}"></span>
						{/each}
					</div>
				{/if}
				{#if animType === 'cloud' || animType === 'rain'}
					<div class="weather-fog" aria-hidden="true"></div>
				{/if}
				{#if animType === 'snow'}
					<div class="weather-snow-overlay" aria-hidden="true">
						{#each Array(15) as _, i}
							<span class="weather-snow-particle" style="--i:{i}">•</span>
						{/each}
					</div>
				{/if}

				<div class="grid gap-6 md:grid-cols-3 relative z-10">
					<Card.Root class="relative overflow-hidden md:col-span-2 border-0 bg-black/20 backdrop-blur-sm">
						<!-- Animated background icon -->
						<div
							class="weather-bg-icon pointer-events-none absolute top-0 right-0 p-6 select-none"
							aria-hidden="true">
							{#if animType === 'sun'}
								{@const Icon = currentCondition.icon}
								<Icon class="anim-sun h-44 w-44 text-amber-400" />
							{:else if animType === 'moon'}
								<Moon class="anim-moon h-44 w-44 text-sky-300" />
							{:else if animType === 'cloud'}
								{@const Icon = currentCondition.icon}
								<Icon class="anim-cloud h-44 w-44 text-foreground" />
							{:else if animType === 'rain'}
								{@const Icon = currentCondition.icon}
								<div class="relative">
									<Icon class="anim-cloud h-44 w-44 text-sky-400" />
									<div class="rain-drops" aria-hidden="true">
										{#each [0, 1, 2, 3, 4, 5, 6, 7] as i}
											<span class="rain-drop" style="--i:{i}"></span>
										{/each}
									</div>
								</div>
							{:else if animType === 'snow'}
								{@const Icon = currentCondition.icon}
								<div class="relative">
									<Icon class="anim-snow-icon h-44 w-44 text-sky-200" />
									<div class="snow-flakes" aria-hidden="true">
										{#each [0, 1, 2, 3, 4, 5] as i}
											<span class="snow-flake" style="--i:{i}">❄</span>
										{/each}
									</div>
								</div>
							{:else if animType === 'storm'}
								{@const Icon = currentCondition.icon}
								<div class="relative">
									<Icon class="anim-cloud h-44 w-44 text-violet-400" />
									<div class="lightning" aria-hidden="true">⚡</div>
								</div>
							{/if}
						</div>

						<Card.Content class="space-y-5">
							<!-- Location label -->
							<div>
								{#if weather.isApproxLocation && weather.ipCity}
									<p class="text-xl font-semibold tracking-tight text-white">
										{weather.ipCity}
									</p>
									<p
										class="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-xs text-white/50">
										<span>Lat: {weatherInfo.lat.toFixed(4)}</span>
										<span>Lng: {weatherInfo.lng.toFixed(4)}</span>
										{#if weather.ipIsp}<span>· {weather.ipIsp}</span>{/if}
									</p>
								{:else if weather.gpsCity}
									<p class="text-xl font-semibold tracking-tight text-white">
										{weather.gpsCity}
									</p>
									<p class="mt-1 flex gap-x-3 font-mono text-xs text-white/50">
										<span>Lat: {weatherInfo.lat.toFixed(4)}</span>
										<span>Lng: {weatherInfo.lng.toFixed(4)}</span>
									</p>
								{:else}
									<p class="flex gap-x-3 font-mono text-xs text-white/50">
										<span>Lat: {weatherInfo.lat.toFixed(4)}</span>
										<span>Lng: {weatherInfo.lng.toFixed(4)}</span>
									</p>
								{/if}
							</div>

							<!-- Temperature + condition -->
							<div class="flex items-center gap-6 relative">
								<div class="weather-temp-glow {animType === 'sun' || temp >= 30 ? 'warm' : animType === 'snow' ? 'cold' : 'neutral'}" aria-hidden="true"></div>
								<span class="weather-temp text-7xl font-bold tracking-tighter tabular-nums relative">
									{temp}°
								</span>
								<div class="flex flex-col">
									<span class="text-xl font-semibold text-white/90">{currentCondition?.text}</span>
									<span class="mt-0.5 text-sm text-white/60">
										Feels like {Math.round(weatherInfo.weather.current.apparent_temperature)}°
									</span>
								</div>
							</div>
						</Card.Content>
					</Card.Root>

					<!-- Details Card -->
					<Card.Root class="weather-detail-card border-white/10 bg-white/5 backdrop-blur-sm">
						<Card.Header>
							<Card.Title class="text-white/80">Details</Card.Title>
						</Card.Header>
						<Card.Content class="grid gap-4">
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-2 text-white/50">
									<Wind class="h-4 w-4" />
									<span>Wind</span>
								</div>
								<span class="font-medium tabular-nums text-white/90"
									>{weatherInfo.weather.current.wind_speed_10m} km/h</span>
							</div>
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-2 text-white/50">
									<Droplets class="h-4 w-4" />
									<span>Humidity</span>
								</div>
								<span class="font-medium tabular-nums text-white/90"
									>{weatherInfo.weather.current.relative_humidity_2m}%</span>
							</div>
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-2 text-white/50">
									<Cloud class="h-4 w-4" />
									<span>Cloud Cover</span>
								</div>
								<span class="font-medium tabular-nums text-white/90">{weatherInfo.weather.current.cloud_cover}%</span>
							</div>
						</Card.Content>
					</Card.Root>

					<!-- Forecast (Daily) -->
					<Card.Root class="md:col-span-3 weather-detail-card border-white/10 bg-white/5 backdrop-blur-sm">
						<Card.Header>
							<Card.Title class="text-white/80">7-Day Forecast</Card.Title>
						</Card.Header>
						<Card.Content>
							<div class="grid grid-cols-2 gap-4 sm:grid-cols-4 md:grid-cols-7">
								{#each weatherInfo.weather.daily.time as day, i (day)}
									{@const fc = getWeatherCondition(weatherInfo.weather.daily.weather_code[i])}
									{@const Icon = fc.icon}
									<div
										class="flex flex-col items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-4 text-center">
										<span class="text-sm font-medium text-white/70">
											{new Date(day).toLocaleDateString(undefined, { weekday: 'short' })}
										</span>
										<Icon class="h-6 w-6 text-white/80" />
										<div class="flex flex-col text-sm tabular-nums">
											<span class="font-bold text-white/90"
												>{Math.round(weatherInfo.weather.daily.temperature_2m_max[i])}°</span>
											<span class="text-white/50"
												>{Math.round(weatherInfo.weather.daily.temperature_2m_min[i])}°</span>
										</div>
									</div>
								{/each}
							</div>
						</Card.Content>
					</Card.Root>
				</div>
				</div>
			{/if}
		{:else}
			<!-- Prompt Location Fallback -->
			<Card.Root class="mt-8 border-border">
				<Card.Content class="flex flex-col items-center gap-4 p-12 text-center">
					{#if weather.permissionState === 'denied'}
						<!-- Denied state: permission cannot be re-prompted, guide user to settings -->
						<div class="rounded-full bg-amber-500/10 p-4">
							<Globe class="h-12 w-12 text-amber-500" />
						</div>
						<div class="mt-4 space-y-2">
							<h3 class="text-2xl font-semibold">Location Access Blocked</h3>
							<p class="mx-auto max-w-md text-muted-foreground">
								{weather.locationError ||
									'GPS access was denied. To enable it, open your browser site settings and allow location for this site, then reload the page.'}
							</p>
						</div>
						<div class="mt-4 flex flex-col items-center gap-3 sm:flex-row">
							<Button variant="outline" size="lg" onclick={() => window.location.reload()}>
								<RefreshCw class="mr-2 h-5 w-5" />
								Reload After Allowing
							</Button>
						</div>
					{:else}
						<!-- Prompt / unknown state: browser prompt can still be triggered -->
						<div class="rounded-full bg-muted p-4">
							<MapPin class="h-12 w-12 text-muted-foreground" />
						</div>
						<div class="mt-4 space-y-2">
							<h3 class="text-2xl font-semibold">Location Required</h3>
							<p class="mx-auto max-w-md text-muted-foreground">
								{weather.locationError ||
									"We use your device's location to provide accurate, real-time weather information for your area."}
							</p>
						</div>
						<Button
							class="mt-4"
							size="lg"
							onclick={() => weather.requestLocation(true)}
							disabled={weather.loadingState !== 'idle'}>
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
</div>

<style>
	/* ─── Sun: slow rotation + brightness pulse ─── */
	:global(.anim-sun) {
		animation:
			sun-spin 20s linear infinite,
			sun-pulse 4s ease-in-out infinite;
		opacity: 0.3;
		transform-origin: center;
	}
	@keyframes sun-spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}
	@keyframes sun-pulse {
		0%,
		100% {
			opacity: 0.25;
			filter: blur(0px);
		}
		50% {
			opacity: 0.45;
			filter: blur(1px);
		}
	}

	/* ─── Moon: gentle glow pulse ─── */
	:global(.anim-moon) {
		animation: moon-pulse 5s ease-in-out infinite;
		opacity: 0.25;
	}
	@keyframes moon-pulse {
		0%,
		100% {
			opacity: 0.1;
			transform: scale(1);
		}
		50% {
			opacity: 0.25;
			transform: scale(1.04);
		}
	}

	/* ─── Cloud / fog: slow horizontal drift ─── */
	:global(.anim-cloud) {
		animation: cloud-float 7s ease-in-out infinite;
		opacity: 0.2;
	}
	@keyframes cloud-float {
		0%,
		100% {
			transform: translateX(0px) translateY(0px);
		}
		33% {
			transform: translateX(-8px) translateY(-5px);
		}
		66% {
			transform: translateX(5px) translateY(-3px);
		}
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
		0% {
			transform: translateY(-10px);
			opacity: 0;
		}
		15% {
			opacity: 0.5;
		}
		85% {
			opacity: 0.4;
		}
		100% {
			transform: translateY(50px);
			opacity: 0;
		}
	}

	/* ─── Snow: icon rotates, flakes drift ─── */
	:global(.anim-snow-icon) {
		animation: snow-spin 30s linear infinite;
		opacity: 0.22;
	}
	@keyframes snow-spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(-360deg);
		}
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
		0% {
			transform: translateY(-10px) translateX(0);
			opacity: 0;
		}
		20% {
			opacity: 0.6;
		}
		80% {
			opacity: 0.4;
		}
		100% {
			transform: translateY(110px) translateX(12px);
			opacity: 0;
		}
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
		0%,
		100% {
			opacity: 0;
		}
		10%,
		12% {
			opacity: 0.8;
		}
		11% {
			opacity: 0.2;
		}
		50%,
		52% {
			opacity: 0.6;
		}
		51% {
			opacity: 0.1;
		}
	}

	/* shared wrapper: clip overflow from particles */
	.weather-bg-icon {
		overflow: visible;
	}

	/* ─── Weather room: its own space ─── */
	.weather-room {
		background: linear-gradient(180deg, #0d1117 0%, #111827 40%, #0f172a 100%);
		min-height: calc(100vh - 57px); /* fill below the header bar */
	}

	/* ─── Temperature glow ─── */
	.weather-temp-glow {
		position: absolute;
		width: 120px;
		height: 120px;
		border-radius: 50%;
		filter: blur(40px);
		opacity: 0.3;
		left: -10px;
		top: -20px;
		animation: glow-pulse 4s ease-in-out infinite;
	}
	.weather-temp-glow.warm { background: radial-gradient(circle, #f59e0b, transparent); }
	.weather-temp-glow.cold { background: radial-gradient(circle, #38bdf8, transparent); }
	.weather-temp-glow.neutral { background: radial-gradient(circle, #94a3b8, transparent); opacity: 0.15; }
	@keyframes glow-pulse {
		0%, 100% { opacity: 0.2; transform: scale(1); }
		50% { opacity: 0.4; transform: scale(1.1); }
	}

	/* ─── Sun radial glow on page bg ─── */
	.weather-sun-glow {
		position: absolute;
		top: -60px;
		right: -60px;
		width: 300px;
		height: 300px;
		border-radius: 50%;
		background: radial-gradient(circle, rgba(251, 191, 36, 0.25), transparent 70%);
		animation: sun-glow-drift 8s ease-in-out infinite;
		pointer-events: none;
	}
	@keyframes sun-glow-drift {
		0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.6; }
		50% { transform: translate(-20px, 15px) scale(1.1); opacity: 0.9; }
	}

	/* ─── Rain streaks across page bg ─── */
	.weather-rain-overlay {
		position: absolute;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
	}
	.weather-rain-streak {
		position: absolute;
		top: -20px;
		left: calc(var(--i) * 5%);
		width: 1px;
		height: 30px;
		background: linear-gradient(to bottom, transparent, rgba(148, 197, 233, 0.4), transparent);
		animation: rain-streak-fall 1.2s linear calc(var(--i) * 0.1s) infinite;
		transform: rotate(8deg);
	}
	@keyframes rain-streak-fall {
		0% { transform: translateY(-30px) rotate(8deg); opacity: 0; }
		10% { opacity: 0.6; }
		90% { opacity: 0.3; }
		100% { transform: translateY(calc(100vh)) rotate(8deg); opacity: 0; }
	}

	/* ─── Fog / mist overlay ─── */
	.weather-fog {
		position: absolute;
		bottom: 0;
		left: -10%;
		width: 120%;
		height: 40%;
		background: linear-gradient(to top, rgba(255, 255, 255, 0.06), transparent);
		animation: fog-drift 12s ease-in-out infinite;
		pointer-events: none;
		border-radius: 50% 50% 0 0;
	}
	@keyframes fog-drift {
		0%, 100% { transform: translateX(0); opacity: 0.6; }
		50% { transform: translateX(3%); opacity: 1; }
	}

	/* ─── Snow particles across page bg ─── */
	.weather-snow-overlay {
		position: absolute;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
	}
	.weather-snow-particle {
		position: absolute;
		top: -10px;
		left: calc(var(--i) * 6.5%);
		font-size: 8px;
		color: rgba(224, 242, 254, 0.5);
		animation: snow-particle-fall 4s linear calc(var(--i) * 0.3s) infinite;
	}
	@keyframes snow-particle-fall {
		0% { transform: translateY(-10px) translateX(0); opacity: 0; }
		10% { opacity: 0.7; }
		90% { opacity: 0.4; }
		100% { transform: translateY(500px) translateX(20px); opacity: 0; }
	}

	/* ─── Atmospheric gradient backgrounds ─── */
	:global(.weather-page-bg) {
		transition: background 0.6s ease;
	}
	:global(.weather-temp) {
		color: white;
		text-shadow: 0 2px 12px rgba(255, 255, 255, 0.15);
	}

	/* Clear day — warm sky */
	:global(.weather-grad-clear-day) {
		background: linear-gradient(135deg, #2980b9 0%, #6dd5fa 50%, #f9d423 100%);
	}
	/* Clear day hot — intense warm */
	:global(.weather-grad-hot) {
		background: linear-gradient(135deg, #f46b45 0%, #eea849 50%, #f9d423 100%);
	}
	/* Clear night — deep navy */
	:global(.weather-grad-clear-night) {
		background: linear-gradient(135deg, #0f0c29 0%, #1a1a4e 50%, #24243e 100%);
	}
	/* Cloudy day — muted gray-blue */
	:global(.weather-grad-cloud-day) {
		background: linear-gradient(135deg, #636e7b 0%, #8e9eab 50%, #a8b5c2 100%);
	}
	/* Cloudy night — dark slate */
	:global(.weather-grad-cloud-night) {
		background: linear-gradient(135deg, #1c1f26 0%, #2c3e50 50%, #3a4a5c 100%);
	}
	/* Rain day — steel blue */
	:global(.weather-grad-rain-day) {
		background: linear-gradient(135deg, #4b6584 0%, #5f7fa2 50%, #7f8fa6 100%);
	}
	/* Rain night — dark blue-gray */
	:global(.weather-grad-rain-night) {
		background: linear-gradient(135deg, #141e30 0%, #1e3044 50%, #2c3e50 100%);
	}
	/* Snow day — cool white-blue */
	:global(.weather-grad-snow-day) {
		background: linear-gradient(135deg, #83a4d4 0%, #b6cde8 50%, #d4e4f1 100%);
	}
	/* Snow night — dark blue */
	:global(.weather-grad-snow-night) {
		background: linear-gradient(135deg, #1a2a3a 0%, #2a3f54 50%, #3a5068 100%);
	}
	/* Storm day — dark purple */
	:global(.weather-grad-storm-day) {
		background: linear-gradient(135deg, #373b44 0%, #4a4e69 50%, #5c5f7a 100%);
	}
	/* Storm night — deep violet */
	:global(.weather-grad-storm-night) {
		background: linear-gradient(135deg, #0d0b1a 0%, #1a1440 50%, #2d1b69 100%);
	}
</style>
