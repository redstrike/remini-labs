export type MiniAppCategory = 'finance' | 'productivity' | 'wellness' | 'labs';

export type MiniAppMeta = {
  id: string;
  slug: string;
  name: string;
  category: MiniAppCategory;
  /** Emoji or unicode character used as the icon glyph */
  iconGlyph: string;
  /** Tailwind gradient classes for the icon tile background */
  iconBg: string;
  shortDescription: string;
  badge?: 'New' | 'Lab' | 'Popular' | 'Beta';
  entryPath: string;
};

export const MINI_APPS: MiniAppMeta[] = [
  {
    id: 'expense-tracker',
    slug: 'expense-tracker',
    name: 'Expenses',
    category: 'finance',
    iconGlyph: '₫',
    iconBg: 'bg-gradient-to-br from-emerald-500 to-teal-600',
    shortDescription: 'Track daily spend & budget.',
    badge: 'Popular',
    entryPath: '/apps/expense-tracker'
  },
  {
    id: 'todo',
    slug: 'todo',
    name: 'Tasks',
    category: 'productivity',
    iconGlyph: '✓',
    iconBg: 'bg-gradient-to-br from-sky-500 to-indigo-600',
    shortDescription: 'Capture and complete tasks.',
    badge: 'New',
    entryPath: '/apps/todo'
  },
  {
    id: 'habits',
    slug: 'habits',
    name: 'Habits',
    category: 'wellness',
    iconGlyph: '★',
    iconBg: 'bg-gradient-to-br from-orange-500 to-rose-600',
    shortDescription: 'Build micro-habits daily.',
    badge: 'Lab',
    entryPath: '/apps/habits'
  },
  {
    id: 'labs',
    slug: 'labs',
    name: 'Labs',
    category: 'labs',
    iconGlyph: '∞',
    iconBg: 'bg-gradient-to-br from-fuchsia-500 to-purple-700',
    shortDescription: 'Experimental prototypes.',
    badge: 'Beta',
    entryPath: '/apps/labs'
  },
  {
    id: 'news',
    slug: 'news',
    name: 'News',
    category: 'productivity',
    iconGlyph: '📰',
    iconBg: 'bg-gradient-to-br from-amber-500 to-orange-600',
    shortDescription: 'Curated daily digest.',
    entryPath: '/apps/news'
  },
  {
    id: 'notes',
    slug: 'notes',
    name: 'Notes',
    category: 'productivity',
    iconGlyph: '✏',
    iconBg: 'bg-gradient-to-br from-violet-500 to-blue-600',
    shortDescription: 'Quick capture notes.',
    entryPath: '/apps/notes'
  },
  {
    id: 'calculator',
    slug: 'calculator',
    name: 'Calc',
    category: 'labs',
    iconGlyph: '✕',
    iconBg: 'bg-gradient-to-br from-slate-500 to-slate-700',
    shortDescription: 'Simple calculator.',
    entryPath: '/apps/calculator'
  },
  {
    id: 'more',
    slug: 'more',
    name: 'More',
    category: 'labs',
    iconGlyph: '⋯',
    iconBg: 'bg-gradient-to-br from-pink-500 to-rose-700',
    shortDescription: 'Discover more apps.',
    entryPath: '/apps/more'
  }
];
