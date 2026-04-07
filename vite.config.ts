import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { defineConfig } from 'vite'

export default defineConfig(({ mode }) => ({
	plugins: [tailwindcss(), sveltekit(), mode === 'development' && basicSsl()].filter(Boolean),
	build: {
		target: 'baseline-widely-available', // Vite 8 default — https://v8.vite.dev/config/build-options#build-target
		cssMinify: 'lightningcss', // Vite 8 default — https://v8.vite.dev/config/build-options#build-cssminify
		sourcemap: false, // Vite default, use 'hidden' when adding production error tracking like Sentry — https://vite.dev/config/build-options#build-sourcemap
	},
}))
