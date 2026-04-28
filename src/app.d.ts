import type { CacheStorage, ExecutionContext, IncomingRequestCfProperties } from '@cloudflare/workers-types'

declare global {
	// Workers `caches.default` is not in the W3C spec, so `lib.dom` doesn't ship its type.
	// Augment the global `CacheStorage` so TypeScript recognises the Workers extension
	// uniformly — real runtime is Workers; dev runtime is our polyfill at
	// `src/lib/workers-cache-polyfill/`. Declared here (not in the polyfill) so the
	// type is visible to every module in the compilation graph, including test files.
	interface CacheStorage {
		readonly default: Cache
	}

	namespace App {
		// interface Error {}
		interface Locals {
			cacheControl?: string
		}
		interface PageData {
			// Per-route overrides for title, meta description, and social preview image.
			// Shell fills defaults in +layout.svelte; apps set only what they want to override.
			meta?: {
				appName?: string
				description?: string
				ogImage?: string // path like "/og-weather.png" — resolved to absolute URL in shell
			}
		}
		// interface PageState {}
		interface Platform {
			env?: Env
			context?: ExecutionContext
			caches?: CacheStorage & { default: Cache }
			// `IncomingRequestCfProperties` already types city / country / latitude / longitude /
			// asOrganization (and every other CF-populated field). The previous `[key: string]: any`
			// index signature defeated type safety on every property access — dropped.
			cf?: IncomingRequestCfProperties
		}
	}
}

export {}
