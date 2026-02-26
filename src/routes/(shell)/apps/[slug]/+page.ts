import type { PageLoad } from './$types';
import { MINI_APPS } from '$lib/mini-apps/registry';
import { error } from '@sveltejs/kit';

export const load: PageLoad = ({ params }) => {
  const app = MINI_APPS.find(a => a.slug === params.slug);
  if (!app) throw error(404, `Mini app "${params.slug}" not found`);
  return { app };
};
