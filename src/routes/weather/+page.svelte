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
		if (animationType === 'storm') return 'var(--rl-color-weather-storm)'
		if (animationType === 'rain') return 'var(--rl-color-weather-rain)'
		if (animationType === 'snow') return 'var(--rl-color-weather-snow)'
		if (animationType === 'cloud') return 'var(--rl-color-weather-cloud)'
		if (!isDay) return 'var(--rl-color-weather-clear-night)'
		if (temp >= 35) return 'var(--rl-color-weather-hot)'
		return 'var(--rl-color-weather-clear-day)'
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
		padding: var(--rl-space-sm) var(--rl-space-md);
		border-bottom: 1px solid var(--rl-color-border);
		background: var(--rl-color-bg);
	}
	.weather-toolbar-left {
		display: flex;
		align-items: center;
		gap: var(--rl-space-sm);
	}
	.weather-toolbar-label {
		font-size: 13px;
		font-weight: var(--rl-font-medium);
		color: var(--rl-color-text-subtle);
		font-family: var(--rl-font-sans);
	}
	.weather-toggle-group {
		display: flex;
		align-items: center;
		gap: 2px;
		background: var(--rl-color-surface);
		border: 1px solid var(--rl-color-border);
		border-radius: var(--rl-radius-sm);
		padding: 2px;
	}
	.weather-toggle-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: none;
		border-radius: var(--rl-radius-md);
		background: transparent;
		color: var(--rl-color-text-faint);
		cursor: pointer;
		transition: all var(--rl-duration-short) var(--rl-ease-move);
	}
	.weather-toggle-btn:hover {
		color: var(--rl-color-text);
	}
	.weather-toggle-btn.active {
		background: var(--rl-color-border);
		color: var(--rl-color-text);
	}

	/* ─── Dot-grid Canvas ─── */
	.weather-canvas {
		flex: 1;
		position: relative;
		display: flex;
		justify-content: center;
		align-items: flex-start;
		padding: var(--rl-space-lg) var(--rl-space-sm);
		overflow-x: auto;
		overflow-y: hidden;
		min-width: 0;
	}
	.weather-dots {
		position: absolute;
		inset: 0;
		background: radial-gradient(var(--rl-color-border) 1px, transparent 1px);
		background-size: 20px 20px;
		pointer-events: none;
	}

	/* ─── Device Frame ─── */
	.weather-device {
		position: relative;
		height: fit-content;
		border-radius: var(--rl-radius-lg);
		background: linear-gradient(
			180deg,
			var(--rl-color-weather-device-from) 0%,
			var(--rl-color-weather-device-mid) 40%,
			var(--rl-color-weather-device-to) 100%
		);
		box-shadow:
			0 4px 24px rgba(0, 0, 0, 0.3),
			inset 0 0 0 1px var(--rl-color-border);
		transition: width var(--rl-duration-medium) var(--rl-ease-move);
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

	/* ─── Weather Content (per-breakpoint design tokens live here) ─── */
	.weather {
		font-family: var(--rl-font-sans);
		color: var(--rl-color-text);

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
		--stats-border: 1px solid var(--rl-color-border);
		--stats-pt: 12px;

		padding: 20px var(--rl-space-md);
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

			padding: 28px var(--rl-space-lg);
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
			--card-padding: var(--rl-space-xl);
			--grid-layout: 'info icon' 'info stats';
			--grid-cols: 1fr auto;
			--stats-direction: column;
			--stats-border: none;
			--stats-pt: 0px;

			padding: 40px var(--rl-space-xl);
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
		padding-bottom: var(--rl-space-md);
		border-bottom: 1px solid var(--rl-color-border);
	}
	.weather-title {
		font-size: var(--rl-text-md);
		font-weight: var(--rl-font-semibold);
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
		font-size: var(--rl-text-xs);
		color: var(--rl-color-text-muted);
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
		border-radius: var(--rl-radius-md);
		border: 1px solid var(--rl-color-border);
		background: transparent;
		color: var(--rl-color-text-faint);
		cursor: pointer;
		transition: all var(--rl-duration-short) var(--rl-ease-move);
	}
	.weather-refresh-btn:hover {
		border-color: var(--rl-color-text-faint);
		color: var(--rl-color-text);
		background: rgba(255, 255, 255, 0.03);
	}
	.weather-refresh-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.weather-dot {
		width: 5px;
		height: 5px;
		background: var(--rl-color-success);
		border-radius: var(--rl-radius-full);
		animation: pulse 2s infinite;
	}
	:global(.weather-spinner) {
		animation: spin 1s linear infinite;
		color: var(--rl-color-text-faint);
	}

	/* ─── Weather Card ─── */
	.weather-card {
		background: var(--rl-color-surface);
		border: 1px solid var(--rl-color-border);
		border-left: 3px solid var(--accent, var(--rl-color-text-subtle));
		border-radius: var(--rl-radius-lg);
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
		gap: 12px var(--rl-space-md);
		margin-bottom: var(--rl-space-md);
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
			width var(--rl-duration-medium) var(--rl-ease-move),
			height var(--rl-duration-medium) var(--rl-ease-move);
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
		font-weight: var(--rl-font-medium);
		color: var(--rl-color-text-subtle);
		font-family: var(--rl-font-mono);
		font-variant-numeric: tabular-nums;
	}

	/* ─── Typography ─── */
	.weather-temp-row {
		display: flex;
		align-items: baseline;
		gap: 2px;
		margin-bottom: var(--rl-space-xs);
	}
	.weather-temp {
		font-family: var(--rl-font-mono);
		font-size: var(--temp-size);
		font-weight: var(--rl-font-bold);
		letter-spacing: -1.5px;
		font-variant-numeric: tabular-nums;
		line-height: 1;
		color: var(--accent, var(--rl-color-text));
		transition: font-size var(--rl-duration-medium) var(--rl-ease-move);
	}
	.weather-temp-unit {
		font-family: var(--rl-font-mono);
		font-size: var(--temp-unit-size);
		font-weight: var(--rl-font-medium);
		color: var(--rl-color-text-faint);
		margin-left: 2px;
		transition: font-size var(--rl-duration-medium) var(--rl-ease-move);
	}
	.weather-condition {
		font-size: var(--condition-size);
		font-weight: var(--rl-font-semibold);
		color: var(--rl-color-text);
		margin-bottom: 2px;
		transition: font-size var(--rl-duration-medium) var(--rl-ease-move);
	}
	.weather-feels {
		font-size: var(--feels-size);
		color: var(--rl-color-text-subtle);
	}

	/* ─── Location ─── */
	.weather-location {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--rl-space-sm);
		font-size: 13px;
		font-weight: var(--rl-font-medium);
		color: var(--rl-color-text-faint);
		padding-top: var(--rl-space-md);
		border-top: 1px solid var(--rl-color-border);
	}
	.weather-coords {
		font-family: var(--rl-font-mono);
		font-size: var(--rl-text-sm);
	}
	.weather-approx {
		display: inline-flex;
		align-items: center;
		gap: var(--rl-space-xs);
		font-size: var(--rl-text-xs);
		color: var(--rl-color-warning);
		background: var(--rl-color-warning-bg);
		border: 1px solid rgba(212, 135, 77, 0.2);
		border-radius: var(--rl-radius-full);
		padding: 2px var(--rl-space-sm);
	}

	/* ─── Skeleton ─── */
	.weather-skeleton {
		--accent: var(--rl-color-border);
	}
	.skel {
		border-radius: var(--rl-radius-md);
		background: var(--rl-color-surface-raised);
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
		margin-bottom: var(--rl-space-sm);
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
		padding: var(--rl-space-2xl) var(--rl-space-lg);
		background: var(--rl-color-surface);
		border: 1px solid var(--rl-color-border);
		border-radius: var(--rl-radius-lg);
	}
	.weather-prompt-icon {
		width: 64px;
		height: 64px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--rl-radius-full);
		background: rgba(138, 138, 150, 0.1);
		color: var(--rl-color-text-subtle);
		margin-bottom: 20px;
	}
	.weather-prompt-icon.denied {
		background: var(--rl-color-warning-bg);
		color: var(--rl-color-warning);
	}
	.weather-prompt-title {
		font-size: var(--rl-text-lg);
		font-weight: var(--rl-font-semibold);
		margin-bottom: var(--rl-space-sm);
	}
	.weather-prompt-text {
		font-size: var(--rl-text-base);
		color: var(--rl-color-text-subtle);
		max-width: 360px;
		margin-bottom: var(--rl-space-lg);
		line-height: 1.5;
	}
	.weather-prompt-btn {
		display: inline-flex;
		align-items: center;
		gap: var(--rl-space-sm);
		padding: 10px 20px;
		font-size: var(--rl-text-base);
		font-weight: var(--rl-font-medium);
		font-family: inherit;
		color: var(--rl-color-text);
		background: var(--rl-color-surface-raised);
		border: 1px solid var(--rl-color-border);
		border-radius: var(--rl-radius-sm);
		cursor: pointer;
		transition: all var(--rl-duration-short) var(--rl-ease-move);
	}
	.weather-prompt-btn:hover {
		background: var(--rl-color-border);
		border-color: var(--rl-color-text-faint);
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
