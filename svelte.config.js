import adapter from '@sveltejs/adapter-auto';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const config = {
  compilerOptions: { runes: true },
  preprocess: vitePreprocess(),
  kit: { adapter: adapter() }
};

export default config;
