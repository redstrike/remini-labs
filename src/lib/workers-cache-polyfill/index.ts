// Barrel. Importing this path triggers the module evaluation of
// `workers-cache-polyfill.ts`, which auto-invokes `install()` on load.
// Side-effect consumers can just write `import '$lib/workers-cache-polyfill'`;
// named consumers can do `import { install } from '$lib/workers-cache-polyfill'`.
export { install } from './workers-cache-polyfill'
export type { PolyfillOptions } from './workers-cache-polyfill'
