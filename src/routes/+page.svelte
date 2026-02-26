<script lang="ts">
  import { CloudRain, Sparkles } from "lucide-svelte";
</script>

<main class="container mx-auto p-4 md:p-8 max-w-5xl h-[100dvh] pt-12">
  <div class="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-x-4 gap-y-6">
    <!-- Weather App Icon -->
    <a href="/weather" class="group flex flex-col items-center gap-2 tap-highlight-transparent">
      <div class="w-16 h-16 sm:w-18 sm:h-18 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-sm transition-transform active:scale-90 flex items-center justify-center">
        <CloudRain class="w-8 h-8" strokeWidth={1.5} />
      </div>
      <span class="text-xs font-medium text-center leading-tight line-clamp-2 text-foreground/90">Weather</span>
    </a>
    
    <!-- Placeholder for future apps -->
    <div class="group flex flex-col items-center gap-2 tap-highlight-transparent cursor-default">
      <div class="w-16 h-16 sm:w-18 sm:h-18 rounded-2xl border-[1.5px] border-dashed border-muted-foreground/30 bg-muted/10 text-muted-foreground/60 transition-all duration-300 group-hover:border-primary/40 group-hover:bg-primary/5 group-hover:text-primary flex items-center justify-center active:scale-90">
        <Sparkles class="w-7 h-7" strokeWidth={1.5} />
      </div>
      <span class="text-xs font-medium text-center leading-tight line-clamp-2 text-muted-foreground group-hover:text-foreground/80 transition-colors duration-300">More Apps</span>
    </div>
  </div>
</main>

<style>
  .tap-highlight-transparent {
    -webkit-tap-highlight-color: transparent;
  }
</style>
