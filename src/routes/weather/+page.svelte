<script lang="ts">
	import { useWeather, getWeatherCondition } from './use-weather.svelte'
	import {
		RefreshCw,
		TriangleAlert,
		MapPin,
		LoaderCircle,
		Globe,
		Wind,
		Droplets,
		Smartphone,
		Tablet,
		Monitor,
	} from '@lucide/svelte'

	const weather = useWeather({ useRemoteFns: true })

	import { browser } from '$app/environment'

	type ViewMode = 'phone' | 'tablet' | 'laptop'

	function detectViewMode(): ViewMode {
		if (!browser) return 'laptop'
		const w = window.innerWidth
		if (w < 720) return 'phone'
		if (w < 1280) return 'tablet'
		return 'laptop'
	}

	let viewMode = $state<ViewMode>(detectViewMode())

	const viewWidths: Record<ViewMode, string> = {
		phone: '360px',
		tablet: '720px',
		laptop: '1280px',
	}

	function getAccentColor(animationType: string, isDay: boolean, temp: number): string {
		if (animationType === 'storm') return '#8b7bb8'
		if (animationType === 'rain') return '#5b8fb9'
		if (animationType === 'snow') return '#9ab8d4'
		if (animationType === 'cloud') return '#8a8a96'
		if (!isDay) return '#6b8aad'
		if (temp >= 35) return '#c47a4d'
		return '#c9a84c'
	}
</script>

<svelte:head>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		rel="stylesheet"
		href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;600;700&display=swap" />
</svelte:head>

<div class="weather-page">
	<!-- Device toggle toolbar -->
	<div class="weather-toolbar">
		<div class="weather-toolbar-left">
			<span class="weather-toolbar-label">Preview</span>
		</div>
		<div class="weather-toggle-group">
			<button
				class="weather-toggle-btn"
				class:active={viewMode === 'phone'}
				title="Phone (360px)"
				onclick={() => (viewMode = 'phone')}><Smartphone size={14} /></button>
			<button
				class="weather-toggle-btn"
				class:active={viewMode === 'tablet'}
				title="Tablet (720px)"
				onclick={() => (viewMode = 'tablet')}><Tablet size={14} /></button>
			<button
				class="weather-toggle-btn"
				class:active={viewMode === 'laptop'}
				title="Laptop (1280px)"
				onclick={() => (viewMode = 'laptop')}><Monitor size={14} /></button>
		</div>
	</div>

	<!-- Dot-grid canvas -->
	<div class="weather-canvas">
		<div class="weather-dots" aria-hidden="true"></div>
		<div class="weather-device" style="width: {viewWidths[viewMode]}">
			<div class="weather">
				<!-- Header -->
				<div class="weather-header">
					<h1 class="weather-title">Weather</h1>
					<div class="weather-header-right">
						<div class="weather-status">
							{#if weather.loadingState !== 'idle'}
								<RefreshCw class="weather-spinner" size={14} />
							{:else if weather.displayWeather}
								<span class="weather-dot"></span>
							{/if}
							<span class="weather-status-text">
								{#if weather.loadingState === 'locating'}
									Locating...
								{:else if weather.loadingState === 'fetching'}
									Fetching...
								{:else if weather.relativeTime}
									{weather.relativeTime}
								{/if}
							</span>
						</div>
						{#if weather.displayWeather}
							<button
								class="weather-refresh-btn"
								onclick={() => weather.requestLocation()}
								disabled={weather.loadingState !== 'idle'}
								title="Refresh weather">
								<RefreshCw size={13} class={weather.loadingState !== 'idle' ? 'weather-spinner' : ''} />
							</button>
						{/if}
					</div>
				</div>

				{#if (weather.loadingState === 'locating' || weather.loadingState === 'fetching') && !weather.displayWeather}
					<!-- Loading skeleton -->
					<div class="weather-card weather-skeleton">
						<div class="skel skel-temp"></div>
						<div class="skel skel-text"></div>
						<div class="skel skel-text-sm"></div>
					</div>
				{:else if weather.displayWeather}
					{@const weatherInfo = weather.displayWeather}
					{#if weatherInfo.weather}
						{@const condition = getWeatherCondition(weatherInfo.weather.current.weather_code)}
						{@const isDay = weatherInfo.weather.current.is_day === 1}
						{@const animType =
							condition.animationType === 'sun' && !isDay ? 'moon' : condition.animationType}
						{@const temp = Math.round(weatherInfo.weather.current.temperature_2m)}
						{@const accent = getAccentColor(animType, isDay, temp)}
						{@const Icon = condition.icon}

						<div class="weather-card" style="--accent: {accent}">
							<div class="weather-grid">
								<div class="weather-info">
									<div class="weather-temp-row">
										<span class="weather-temp">{temp}°</span>
										<span class="weather-temp-unit">C</span>
									</div>
									<div class="weather-condition">{condition.text}</div>
									<div class="weather-feels">
										Feels like {Math.round(weatherInfo.weather.current.apparent_temperature)}°
									</div>
								</div>
								<div class="weather-icon-wrap">
									<Icon
										size={undefined}
										style="color: {accent}; opacity: 0.8; width: 100%; height: 100%;" />
								</div>
								<div class="weather-stats">
									<div class="weather-stat">
										<Wind size={14} />
										<span>{weatherInfo.weather.current.wind_speed_10m} km/h</span>
									</div>
									<div class="weather-stat">
										<Droplets size={14} />
										<span>{weatherInfo.weather.current.relative_humidity_2m}%</span>
									</div>
								</div>
							</div>

							<div class="weather-location">
								{#if weather.gpsCity}
									<!-- Precise reverse-geocoded label wins. Keep the Approximate
									     badge when we're still on the IP fallback path so the user
									     understands the lat/lng underlying this label is coarse. -->
									<span>{weather.gpsCity}</span>
									{#if weather.isApproxLocation}
										<span class="weather-approx">
											<TriangleAlert size={11} />
											Approximate{weather.ipIsp ? ` · ${weather.ipIsp}` : ''}
										</span>
									{/if}
								{:else if weather.isApproxLocation && weather.ipCity}
									<span>{weather.ipCity}</span>
									<span class="weather-approx">
										<TriangleAlert size={11} />
										Approximate{weather.ipIsp ? ` · ${weather.ipIsp}` : ''}
									</span>
								{:else}
									<span class="weather-coords">
										{weatherInfo.lat.toFixed(4)}, {weatherInfo.lng.toFixed(4)}
									</span>
								{/if}
							</div>
						</div>
					{/if}
				{:else}
					<!-- Permission prompt -->
					<div class="weather-prompt">
						{#if weather.permissionState === 'denied'}
							<div class="weather-prompt-icon denied">
								<Globe size={32} />
							</div>
							<h3 class="weather-prompt-title">Location Access Blocked</h3>
							<p class="weather-prompt-text">
								{weather.locationError ||
									'GPS access was denied. Open your browser site settings, allow location for this site, then reload.'}
							</p>
							<button class="weather-prompt-btn" onclick={() => window.location.reload()}>
								<RefreshCw size={16} />
								Reload After Allowing
							</button>
						{:else}
							<div class="weather-prompt-icon">
								<MapPin size={32} />
							</div>
							<h3 class="weather-prompt-title">Location Required</h3>
							<p class="weather-prompt-text">
								{weather.locationError || 'We need your location to show local weather.'}
							</p>
							<button
								class="weather-prompt-btn"
								onclick={() => weather.requestLocation()}
								disabled={weather.loadingState !== 'idle'}>
								{#if weather.loadingState !== 'idle'}
									<LoaderCircle size={16} class="weather-spinner" />
									Locating...
								{:else}
									<MapPin size={16} />
									Get Current Location
								{/if}
							</button>
						{/if}
					</div>
				{/if}
			</div>
			<!-- .weather -->
		</div>
		<!-- .weather-device -->
	</div>
	<!-- .weather-canvas -->
</div>

<!-- .weather-page -->

<style>
	/* ─── Page ─── */
	.weather-page {
		min-height: calc(100vh - 57px);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		min-width: 0;
	}

	/* ─── Toolbar ─── */
	.weather-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 16px;
		border-bottom: 1px solid #2a2a36;
		background: #0f0f14;
	}
	.weather-toolbar-left {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.weather-toolbar-label {
		font-size: 13px;
		font-weight: 500;
		color: #8a8a96;
		font-family: 'Geist', 'Geist Sans', system-ui, sans-serif;
	}
	.weather-toggle-group {
		display: flex;
		align-items: center;
		gap: 2px;
		background: #1a1a24;
		border: 1px solid #2a2a36;
		border-radius: 8px;
		padding: 2px;
	}
	.weather-toggle-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: #6b6b76;
		cursor: pointer;
		transition: all 0.15s ease;
	}
	.weather-toggle-btn:hover {
		color: #e8e6e3;
	}
	.weather-toggle-btn.active {
		background: #2a2a36;
		color: #e8e6e3;
	}

	/* ─── Dot-grid Canvas ─── */
	.weather-canvas {
		flex: 1;
		position: relative;
		display: flex;
		justify-content: center;
		align-items: flex-start;
		padding: 24px 8px;
		overflow-x: auto;
		overflow-y: hidden;
		min-width: 0;
	}
	.weather-dots {
		position: absolute;
		inset: 0;
		background: radial-gradient(#2a2a36 1px, transparent 1px);
		background-size: 20px 20px;
		pointer-events: none;
	}

	/* ─── Device Frame ─── */
	.weather-device {
		position: relative;
		height: fit-content;
		border-radius: 16px;
		background: linear-gradient(180deg, #0d1117 0%, #111827 40%, #0f172a 100%);
		box-shadow:
			0 4px 24px rgba(0, 0, 0, 0.3),
			inset 0 0 0 1px #2a2a36;
		transition: width 0.3s ease;
		overflow: hidden;
		container-type: inline-size;
	}

	@media (max-width: 480px) {
		.weather-toolbar {
			display: none;
		}
		.weather-canvas {
			padding: 0;
		}
		.weather-dots {
			display: none;
		}
		.weather-device {
			width: 100% !important;
			max-width: 100%;
			border-radius: 0;
			box-shadow: none;
		}
	}

	/* ─── Weather Content (design tokens live here, not on the container) ─── */
	.weather {
		font-family: 'Geist', 'Geist Sans', system-ui, sans-serif;
		color: #e8e6e3;

		/* Base: phone (< 720px) */
		--temp-size: 48px;
		--temp-unit-size: 18px;
		--icon-size: 48px;
		--condition-size: 14px;
		--feels-size: 13px;
		--stat-size: 13px;
		--card-padding: 20px;
		--grid-layout: 'info icon' 'stats stats';
		--grid-cols: 1fr auto;
		--stats-direction: row;
		--stats-border: 1px solid #2a2a36;
		--stats-pt: 12px;

		padding: 20px 16px;
	}

	/* ─── ≥ 720px: two-column ─── */
	@container (min-width: 720px) {
		.weather {
			--temp-size: 56px;
			--temp-unit-size: 22px;
			--icon-size: 64px;
			--condition-size: 16px;
			--stat-size: 13px;
			--card-padding: 28px;
			--grid-layout: 'info icon' 'info stats';
			--grid-cols: 1fr auto;
			--stats-direction: column;
			--stats-border: none;
			--stats-pt: 0px;

			padding: 28px 24px;
		}
	}

	/* ─── ≥ 1280px: scaled two-column ─── */
	@container (min-width: 1280px) {
		.weather {
			--temp-size: 72px;
			--temp-unit-size: 26px;
			--icon-size: 96px;
			--condition-size: 18px;
			--feels-size: 14px;
			--stat-size: 14px;
			--card-padding: 32px;
			--grid-layout: 'info icon' 'info stats';
			--grid-cols: 1fr auto;
			--stats-direction: column;
			--stats-border: none;
			--stats-pt: 0px;

			padding: 40px 32px;
			max-width: 1600px;
			margin: 0 auto;
		}
	}

	/* ─── Header ─── */
	.weather-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 20px;
		padding-bottom: 16px;
		border-bottom: 1px solid #2a2a36;
	}
	.weather-title {
		font-size: 16px;
		font-weight: 600;
		letter-spacing: -0.2px;
	}
	.weather-header-right {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.weather-status {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 11px;
		color: #9a9aa6;
	}
	.weather-status-text {
		white-space: nowrap;
	}
	.weather-refresh-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: 6px;
		border: 1px solid #2a2a36;
		background: transparent;
		color: #6b6b76;
		cursor: pointer;
		transition: all 0.15s ease;
	}
	.weather-refresh-btn:hover {
		border-color: #6b6b76;
		color: #e8e6e3;
		background: rgba(255, 255, 255, 0.03);
	}
	.weather-refresh-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.weather-dot {
		width: 5px;
		height: 5px;
		background: #2d9f6f;
		border-radius: 9999px;
		animation: pulse 2s infinite;
	}
	:global(.weather-spinner) {
		animation: spin 1s linear infinite;
		color: #6b6b76;
	}

	/* ─── Weather Card ─── */
	.weather-card {
		background: #1a1a24;
		border: 1px solid #2a2a36;
		border-left: 3px solid var(--accent, #8a8a96);
		border-radius: 12px;
		padding: var(--card-padding);
		/* Cap at big-phone width (iPhone 17 Pro Max ≈ 440px) so the card doesn't stretch
		   across tablet/laptop/desktop. Phones fill their container since max-width
		   only kicks in beyond 440px. */
		max-width: 440px;
		margin-inline: auto;
	}

	/* ─── Grid ─── */
	.weather-grid {
		display: grid;
		grid-template-columns: var(--grid-cols);
		grid-template-areas: var(--grid-layout);
		gap: 12px 16px;
		margin-bottom: 16px;
	}
	.weather-info {
		grid-area: info;
	}
	.weather-icon-wrap {
		grid-area: icon;
		align-self: start;
		width: var(--icon-size);
		height: var(--icon-size);
		transition:
			width 0.3s ease,
			height 0.3s ease;
	}
	.weather-stats {
		grid-area: stats;
		display: flex;
		flex-direction: var(--stats-direction);
		gap: 12px;
		padding-top: var(--stats-pt);
		border-top: var(--stats-border);
	}
	.weather-stat {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: var(--stat-size);
		font-weight: 500;
		color: #8a8a96;
		font-family: 'Geist Mono', monospace;
		font-variant-numeric: tabular-nums;
	}

	/* ─── Typography ─── */
	.weather-temp-row {
		display: flex;
		align-items: baseline;
		gap: 2px;
		margin-bottom: 4px;
	}
	.weather-temp {
		font-family: 'Geist Mono', monospace;
		font-size: var(--temp-size);
		font-weight: 700;
		letter-spacing: -1.5px;
		font-variant-numeric: tabular-nums;
		line-height: 1;
		color: var(--accent, #e8e6e3);
		transition: font-size 0.3s ease;
	}
	.weather-temp-unit {
		font-family: 'Geist Mono', monospace;
		font-size: var(--temp-unit-size);
		font-weight: 500;
		color: #6b6b76;
		margin-left: 2px;
		transition: font-size 0.3s ease;
	}
	.weather-condition {
		font-size: var(--condition-size);
		font-weight: 600;
		color: #e8e6e3;
		margin-bottom: 2px;
		transition: font-size 0.3s ease;
	}
	.weather-feels {
		font-size: var(--feels-size);
		color: #8a8a96;
	}

	/* ─── Location ─── */
	.weather-location {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		font-weight: 500;
		color: #6b6b76;
		padding-top: 16px;
		border-top: 1px solid #2a2a36;
	}
	.weather-coords {
		font-family: 'Geist Mono', monospace;
		font-size: 12px;
	}
	.weather-approx {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 11px;
		color: #d4874d;
		background: rgba(212, 135, 77, 0.1);
		border: 1px solid rgba(212, 135, 77, 0.2);
		border-radius: 9999px;
		padding: 2px 8px;
	}

	/* ─── Skeleton ─── */
	.weather-skeleton {
		--accent: #2a2a36;
	}
	.skel {
		border-radius: 6px;
		background: #22222e;
		animation: pulse 2s infinite;
	}
	.skel-temp {
		width: 120px;
		height: 56px;
		margin-bottom: 12px;
	}
	.skel-text {
		width: 140px;
		height: 16px;
		margin-bottom: 8px;
	}
	.skel-text-sm {
		width: 100px;
		height: 13px;
	}

	/* ─── Permission Prompt ─── */
	.weather-prompt {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		padding: 48px 24px;
		background: #1a1a24;
		border: 1px solid #2a2a36;
		border-radius: 12px;
	}
	.weather-prompt-icon {
		width: 64px;
		height: 64px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 9999px;
		background: rgba(138, 138, 150, 0.1);
		color: #8a8a96;
		margin-bottom: 20px;
	}
	.weather-prompt-icon.denied {
		background: rgba(212, 135, 77, 0.1);
		color: #d4874d;
	}
	.weather-prompt-title {
		font-size: 18px;
		font-weight: 600;
		margin-bottom: 8px;
	}
	.weather-prompt-text {
		font-size: 14px;
		color: #8a8a96;
		max-width: 360px;
		margin-bottom: 24px;
		line-height: 1.5;
	}
	.weather-prompt-btn {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 10px 20px;
		font-size: 14px;
		font-weight: 500;
		font-family: inherit;
		color: #e8e6e3;
		background: #22222e;
		border: 1px solid #2a2a36;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.15s ease;
	}
	.weather-prompt-btn:hover {
		background: #2a2a36;
		border-color: #6b6b76;
	}
	.weather-prompt-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* ─── Keyframes ─── */
	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.4;
		}
	}
	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}
</style>
