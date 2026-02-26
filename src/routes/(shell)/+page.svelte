<script lang="ts">
  import type { PageData } from './$types';
  import { shellState } from '$lib/state/shell.svelte';

  let { data } = $props<{ data: PageData }>();

  function greeting() {
    if (typeof window === 'undefined') return 'Hello';
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  }

  const gridApps   = $derived(data.miniApps.slice(0, 8));
  const recentApps = $derived(
    shellState.recentSlugs
      .map(slug => data.miniApps.find(a => a.slug === slug))
      .filter(Boolean)
  );
</script>

<div class="flex items-center justify-between px-5 pt-3 pb-0 text-[11px] font-medium text-white/40 select-none">
  <span>9:41</span>
  <div class="flex items-center gap-1.5 text-[10px]">
    <span>▲▲▲</span><span>WiFi</span><span>🔋</span>
  </div>
</div>

<header class="px-5 pt-4 pb-3">
  <div class="flex items-center justify-between">
    <div>
      <p class="text-sm text-white/50 font-medium">{greeting()},</p>
      <h1 class="text-xl font-bold tracking-tight">Mini App Lab 👋</h1>
    </div>
    <div class="flex items-center gap-2">
      <button type="button"
        class="w-9 h-9 rounded-full bg-[#1C1E30] border border-white/10
          flex items-center justify-center text-white/60 hover:bg-[#252742] transition-colors"
        aria-label="Notifications">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>
        </svg>
      </button>
      <button type="button"
        class="w-9 h-9 rounded-full bg-gradient-to-br from-[#E8318A] to-[#7B2FBE]
          flex items-center justify-center text-xs font-bold shadow-glow-pink"
        aria-label="Profile">VN</button>
    </div>
  </div>
</header>

<section class="px-4 mb-4">
  <div class="relative rounded-3xl overflow-hidden p-5"
    style="background:linear-gradient(135deg,#E8318A 0%,#AB1F65 55%,#7B2FBE 100%);">
    <div aria-hidden="true" class="pointer-events-none absolute inset-0"
      style="background:radial-gradient(ellipse 80% 60% at 80% 0%,rgba(255,255,255,0.12) 0%,transparent 70%)"></div>
    <div class="relative z-10">
      <p class="text-xs font-semibold uppercase tracking-widest text-white/70 mb-1">Total Balance</p>
      <div class="flex items-end gap-2 mb-4">
        <span class="text-3xl font-extrabold tracking-tight">12,450,000</span>
        <span class="text-base font-semibold text-white/80 mb-0.5">₫</span>
      </div>
      <div class="flex items-center gap-2">
        {#each [
          {label:'Send',icon:'↑'},{label:'Receive',icon:'↓'},{label:'Top up',icon:'+'},{label:'More',icon:'⋯'}
        ] as action}
          <button type="button"
            class="flex-1 flex flex-col items-center gap-1 py-2 rounded-2xl
              bg-white/15 hover:bg-white/25 active:scale-95 transition-all">
            <span class="text-base font-bold">{action.icon}</span>
            <span class="text-[10px] font-medium text-white/85">{action.label}</span>
          </button>
        {/each}
      </div>
    </div>
  </div>
</section>

<section class="mb-4">
  <div class="flex gap-2.5 px-4 overflow-x-auto scrollbar-none pb-1">
    {#each [
      {label:'Free transfer', sub:'Until Feb 28', color:'from-sky-500 to-blue-700',   icon:'🎁'},
      {label:'Cashback 10%',  sub:'On groceries', color:'from-emerald-500 to-teal-700',icon:'💸'},
      {label:'New: Habits',   sub:'Try mini app', color:'from-fuchsia-500 to-purple-700',icon:'🔥'},
    ] as promo}
      <div class="flex-none w-[140px] rounded-2xl p-3 bg-gradient-to-br {promo.color} flex items-center gap-2.5 shadow-card">
        <span class="text-2xl">{promo.icon}</span>
        <div class="min-w-0">
          <p class="text-xs font-bold text-white truncate">{promo.label}</p>
          <p class="text-[10px] text-white/70 truncate">{promo.sub}</p>
        </div>
      </div>
    {/each}
  </div>
</section>

<section class="px-4 mb-5">
  <div class="flex items-center justify-between mb-3">
    <h2 class="text-sm font-bold">My Apps</h2>
    <a href="/?view=all" class="text-[11px] font-semibold text-[#E8318A]">See all</a>
  </div>
  <div class="grid grid-cols-4 gap-y-4 gap-x-2">
    {#each gridApps as app}
      <a href={app.entryPath} class="app-icon-tile" onclick={() => shellState.openApp(app.slug)}>
        <div class="icon-wrap {app.iconBg}">
          <div aria-hidden="true" class="absolute inset-0 rounded-[18px]"
            style="background:linear-gradient(135deg,rgba(255,255,255,0.22) 0%,transparent 55%)"></div>
          <span class="relative z-10 font-bold text-white select-none">{app.iconGlyph}</span>
          {#if app.badge}
            <span class="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#E8318A] border-2 border-[#0D0E14] flex items-center justify-center text-[7px] font-bold text-white">
              {app.badge === 'New' ? 'N' : app.badge === 'Lab' ? 'L' : app.badge === 'Beta' ? 'β' : '★'}
            </span>
          {/if}
        </div>
        <span class="icon-label">{app.name}</span>
      </a>
    {/each}
  </div>
</section>

{#if recentApps.length > 0}
  <section class="px-4 mb-4">
    <h2 class="text-sm font-bold mb-3">Recent</h2>
    <div class="flex gap-3 overflow-x-auto scrollbar-none pb-1">
      {#each recentApps as app}
        {#if app}
          <a href={app.entryPath} class="flex-none flex flex-col items-center gap-1.5">
            <div class="w-12 h-12 rounded-2xl {app.iconBg} flex items-center justify-center text-xl font-bold text-white shadow-card relative overflow-hidden">
              <div aria-hidden="true" class="absolute inset-0 rounded-2xl"
                style="background:linear-gradient(135deg,rgba(255,255,255,0.18) 0%,transparent 55%)"></div>
              <span class="relative z-10">{app.iconGlyph}</span>
            </div>
            <span class="text-[10px] text-white/70 font-medium">{app.name}</span>
          </a>
        {/if}
      {/each}
    </div>
  </section>
{/if}

<section class="px-4 mb-6">
  <div class="shell-card">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-sm font-bold">Today's Snapshot</h2>
      <span class="badge-pill border-white/12 text-white/40">Live</span>
    </div>
    <div class="grid grid-cols-3 gap-3">
      {#each [
        {label:'Tasks',  value:'3/5',  color:'text-sky-400',     sub:'done'},
        {label:'Budget', value:'82%',  color:'text-orange-400',  sub:'used'},
        {label:'Habits', value:'2/3',  color:'text-emerald-400', sub:'done'},
      ] as kpi}
        <div class="rounded-2xl bg-[#1C1E30] p-3 text-center">
          <p class="text-xl font-extrabold {kpi.color}">{kpi.value}</p>
          <p class="text-[10px] text-white/50 mt-0.5">{kpi.label}</p>
          <p class="text-[9px] text-white/30">{kpi.sub}</p>
        </div>
      {/each}
    </div>
  </div>
</section>

<div class="tab-safe-spacer"></div>

<style>
  .scrollbar-none{scrollbar-width:none;-ms-overflow-style:none;}
  .scrollbar-none::-webkit-scrollbar{display:none;}
</style>
