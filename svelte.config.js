import adapter from '@sveltejs/adapter-cloudflare'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

// Windows: dev's file watcher holds open handles inside `.svelte-kit/output`, making
// `pnpm build` fail with EPERM on rimraf. Split dev's outDir so build can delete freely.
// Caveat: `tsconfig.json` extends the build outDir's generated tsconfig — IDE + `check:fast`
// lag behind dev-time route additions until `pnpm check` or `pnpm build` refreshes them.
const isDev = process.argv.some((a) => a === 'dev')
const OUT_DIR = isDev ? '.svelte-kit/output-dev' : '.svelte-kit'

const config = {
	preprocess: vitePreprocess(),
	kit: {
		outDir: OUT_DIR,
		adapter: adapter({
			routes: {
				include: ['/*'],
				exclude: ['<all>'],
			},
		}),
		experimental: {
			remoteFunctions: true,
		},
	},
	compilerOptions: {
		experimental: {
			async: true,
		},
	},
}

export default config
