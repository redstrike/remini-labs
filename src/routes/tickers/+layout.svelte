<script lang="ts">
	import './tickers.css'

	let { children } = $props()
</script>

<div class="tickers-root">
	{@render children()}
</div>

<style>
	.tickers-root {
		/* Inherit shell layout — display: contents lets children take the layout slot */
		display: contents;
	}
</style>
