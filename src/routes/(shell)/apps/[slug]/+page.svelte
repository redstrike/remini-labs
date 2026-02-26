<script lang="ts">
  import type { PageData } from './$types';
  import { shellState } from '$lib/state/shell.svelte';
  import ExpenseTrackerApp from '$lib/mini-apps/expense-tracker/ExpenseTrackerApp.svelte';
  import TodoApp           from '$lib/mini-apps/todo/TodoApp.svelte';
  import HabitsApp         from '$lib/mini-apps/habits/HabitsApp.svelte';
  import LabsApp           from '$lib/mini-apps/labs/LabsApp.svelte';

  let { data } = $props<{ data: PageData }>();

  $effect(() => { shellState.openApp(data.app.slug); });
</script>

<div class="flex flex-col min-h-[calc(100svh-80px)]">
  <header class="sticky top-0 z-30 flex items-center gap-3 px-4 py-3
      bg-[#0D0E14]/95 backdrop-blur-xl border-b border-white/[0.07]">
    <a href="/" class="w-9 h-9 rounded-full bg-[#1C1E30] border border-white/10
        flex items-center justify-center text-white/70 hover:bg-[#252742]
        active:scale-90 transition-all" aria-label="Back to home">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
    </a>
    <div class="w-8 h-8 rounded-2xl {data.app.iconBg} flex items-center justify-center text-base font-bold shadow-card relative overflow-hidden">
      <div aria-hidden="true" class="absolute inset-0"
        style="background: linear-gradient(135deg,rgba(255,255,255,0.22) 0%,transparent 55%)"></div>
      <span class="relative z-10">{data.app.iconGlyph}</span>
    </div>
    <div class="flex-1 min-w-0">
      <h1 class="text-sm font-bold truncate">{data.app.name}</h1>
      <p class="text-[10px] text-white/45 truncate">{data.app.shortDescription}</p>
    </div>
    {#if data.app.badge}
      <span class="badge-pill border-white/12 text-white/50">{data.app.badge}</span>
    {/if}
    <button type="button" class="w-9 h-9 rounded-full bg-[#1C1E30] border border-white/10
        flex items-center justify-center transition-colors
        {shellState.isPinned(data.app.slug)
          ? 'text-[#E8318A] border-[#E8318A]/40'
          : 'text-white/40 hover:text-white/70'}"
      onclick={() => shellState.togglePin(data.app.slug)}
      aria-label={shellState.isPinned(data.app.slug) ? 'Unpin app' : 'Pin app'}>
      {shellState.isPinned(data.app.slug) ? '★' : '☆'}
    </button>
  </header>

  <div class="flex-1 overflow-y-auto px-4 pt-4 pb-6">
    {#if data.app.slug === 'expense-tracker'}
      <ExpenseTrackerApp />
    {:else if data.app.slug === 'todo'}
      <TodoApp />
    {:else if data.app.slug === 'habits'}
      <HabitsApp />
    {:else if data.app.slug === 'labs'}
      <LabsApp />
    {:else}
      <div class="flex flex-col items-center justify-center py-20 gap-4 text-center">
        <div class="w-20 h-20 rounded-[24px] {data.app.iconBg} flex items-center justify-center text-4xl shadow-float relative overflow-hidden">
          <div aria-hidden="true" class="absolute inset-0" style="background: linear-gradient(135deg,rgba(255,255,255,0.22) 0%,transparent 55%)"></div>
          <span class="relative z-10">{data.app.iconGlyph}</span>
        </div>
        <div>
          <h2 class="text-lg font-bold">{data.app.name}</h2>
          <p class="text-sm text-white/50 mt-1">{data.app.shortDescription}</p>
        </div>
        <div class="px-5 py-3 rounded-2xl bg-[#1C1E30] border border-white/8 text-sm text-white/40">
          🚧 Coming soon — add your component in<br/>
          <code class="text-[#E8318A] text-xs">src/lib/mini-apps/{data.app.slug}/</code>
        </div>
      </div>
    {/if}
  </div>
</div>
