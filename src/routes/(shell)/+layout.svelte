<script lang="ts">
  import type { LayoutData } from './$types';
  import { shellState } from '$lib/state/shell.svelte';
  import { page } from '$app/stores';

  let { data, children } = $props<{ data: LayoutData; children: any }>();

  const isHome   = $derived($page.url.pathname === '/');
  const qTab     = $derived($page.url.searchParams.get('tab'));

  type NavItem = {
    id: string;
    label: string;
    href: string;
    icon: string;
    isCta?: boolean;
  };

  const NAV: NavItem[] = [
    { id:'home',     label:'Home',     href:'/',              icon:'⊞' },
    { id:'wallet',   label:'Wallet',   href:'/?tab=wallet',   icon:'💳' },
    { id:'qr',       label:'Scan',     href:'/?tab=qr',       icon:'◉',  isCta:true },
    { id:'activity', label:'Activity', href:'/?tab=activity', icon:'📋' },
    { id:'profile',  label:'Profile',  href:'/?tab=profile',  icon:'👤' },
  ];

  function isActive(id: string) {
    if (id === 'home') return isHome;
    return qTab === id;
  }
</script>

<div class="  relative flex flex-col min-h-svh w-full max-w-[430px] mx-auto bg-[#0D0E14]
  md:my-8 md:min-h-0 md:h-[calc(100vh-4rem)]
  md:rounded-[40px] md:shadow-[0_32px_96px_rgba(0,0,0,0.9)]
  md:border md:border-white/10 overflow-hidden
">
  <div aria-hidden="true" class="pointer-events-none absolute inset-0 z-0 opacity-40"
    style="background:radial-gradient(ellipse 60% 35% at 50% 0%,rgba(232,49,138,0.16) 0%,transparent 70%)"></div>

  <main class="relative z-10 flex-1 overflow-y-auto overflow-x-hidden">
    {@render children()}
  </main>

  <nav class="    relative z-20 flex-none flex items-end justify-around
    px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]
    bg-[#14162A]/96 backdrop-blur-2xl border-t border-white/[0.07]
  " aria-label="Main navigation">
    {#each NAV as item}
      {#if item.isCta}
        <button type="button"
          class="flex flex-col items-center gap-0.5 -mt-5"
          onclick={() => shellState.setActiveTab('qr')} aria-label="Scan QR">
          <div class="            w-[52px] h-[52px] rounded-full
            bg-gradient-to-br from-[#E8318A] to-[#AB1F65]
            shadow-glow-pink ring-4 ring-[#0D0E14]
            flex items-center justify-center text-[22px]
            active:scale-90 transition-transform
          ">{item.icon}</div>
          <span class="text-[10px] font-semibold text-[#E8318A] leading-tight">{item.label}</span>
        </button>
      {:else}
        <a href={item.href}
          class="flex flex-col items-center gap-0.5 px-2 py-0.5 min-w-[52px] transition-colors
            {isActive(item.id) ? 'text-[#E8318A]' : 'text-white/38 hover:text-white/65'}"
          onclick={() => shellState.setActiveTab(item.id as any)}>
          <span class="text-[22px] leading-none">{item.icon}</span>
          <span class="text-[10px] font-medium">{item.label}</span>
          <div class="w-1 h-1 rounded-full mt-0.5 {isActive(item.id) ? 'bg-[#E8318A]' : ''}"></div>
        </a>
      {/if}
    {/each}
  </nav>
</div>
