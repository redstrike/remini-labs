<script lang="ts">
	import { CloudRain, Sparkles } from '@lucide/svelte'
</script>

<main class="container mx-auto h-[100dvh] max-w-5xl p-4 pt-12 md:p-8">
	<div class="grid grid-cols-4 gap-x-4 gap-y-6 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8">
		<!-- Weather App Icon -->
		<a href="/weather" class="group tap-highlight-transparent flex flex-col items-center gap-2">
			<div
				class="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-sm transition-transform active:scale-90 sm:h-18 sm:w-18">
				<CloudRain class="h-8 w-8" strokeWidth={1.5} />
			</div>
			<span class="line-clamp-2 text-center text-xs leading-tight font-medium text-foreground/90">Weather</span>
		</a>

		<!-- Placeholder for future apps -->
		<div class="group tap-highlight-transparent flex cursor-default flex-col items-center gap-2">
			<div
				class="flex h-16 w-16 items-center justify-center rounded-2xl border-[1.5px] border-dashed border-muted-foreground/30 bg-muted/10 text-muted-foreground/60 transition-all duration-300 group-hover:border-primary/40 group-hover:bg-primary/5 group-hover:text-primary active:scale-90 sm:h-18 sm:w-18">
				<Sparkles class="h-7 w-7" strokeWidth={1.5} />
			</div>
			<span
				class="line-clamp-2 text-center text-xs leading-tight font-medium text-muted-foreground transition-colors duration-300 group-hover:text-foreground/80"
				>More Apps</span>
		</div>
	</div>
</main>

<style>
	.tap-highlight-transparent {
		-webkit-tap-highlight-color: transparent;
	}
</style>
