import type { LayoutLoad } from './$types';
import { MINI_APPS } from '$lib/mini-apps/registry';

export const load: LayoutLoad = async () => {
  return { miniApps: MINI_APPS };
};
