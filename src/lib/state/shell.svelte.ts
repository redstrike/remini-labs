/**
 * Shell-level reactive state using Svelte 5 runes.
 * Safe to import in both SSR and CSR contexts.
 */

type Tab = 'home' | 'wallet' | 'qr' | 'activity' | 'profile';

class ShellState {
  activeTab   = $state<Tab>('home');
  pinnedSlugs = $state<string[]>(['expense-tracker', 'todo']);
  recentSlugs = $state<string[]>([]);
  currentSlug = $state<string | null>(null);

  isPinned(slug: string) {
    return this.pinnedSlugs.includes(slug);
  }

  togglePin(slug: string) {
    if (this.pinnedSlugs.includes(slug)) {
      this.pinnedSlugs = this.pinnedSlugs.filter(s => s !== slug);
    } else {
      this.pinnedSlugs = [...this.pinnedSlugs, slug];
    }
  }

  openApp(slug: string) {
    this.currentSlug = slug;
    this.recentSlugs = [
      slug,
      ...this.recentSlugs.filter(s => s !== slug)
    ].slice(0, 6);
  }

  setActiveTab(tab: Tab) {
    this.activeTab = tab;
  }
}

export const shellState = new ShellState();

// Persist to localStorage (client-side only)
if (typeof window !== 'undefined') {
  // Restore on load
  try {
    const p = localStorage.getItem('shell:pinned');
    const r = localStorage.getItem('shell:recent');
    if (p) shellState.pinnedSlugs = JSON.parse(p);
    if (r) shellState.recentSlugs = JSON.parse(r);
  } catch {
    // Ignore parse errors
  }

  // Sync on change
  $effect.root(() => {
    $effect(() => {
      localStorage.setItem('shell:pinned', JSON.stringify(shellState.pinnedSlugs));
    });
    $effect(() => {
      localStorage.setItem('shell:recent', JSON.stringify(shellState.recentSlugs));
    });
  });
}
