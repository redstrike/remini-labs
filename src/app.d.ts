import type { CacheStorage, ExecutionContext, IncomingRequestCfProperties } from '@cloudflare/workers-types'

declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
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
