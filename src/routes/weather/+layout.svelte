<script lang="ts">
	import './weather.css'

	let { children } = $props()
</script>

<div class="weather-root">
	{@render children()}
</div>

<style>
	.weather-root {
		display: contents;
	}
</style>
