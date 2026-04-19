import type { CacheStorage, ExecutionContext, IncomingRequestCfProperties } from '@cloudflare/workers-types'

declare global {
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
			cf?: IncomingRequestCfProperties & {
				city?: string
				country?: string
				latitude?: string
				longitude?: string
				asOrganization?: string
				[key: string]: any
			}
		}
	}
}

export {}
