// Metal asset icons — stylized SJC vàng miếng (gold) and Phu Quy silver ingot SVGs used in
// the Metals tab's asset column. Same Vite `?url` bundling pattern as flag icons in
// vcb-forex-client.ts — emitted as separate fingerprinted files under
// /_app/immutable/assets/<name>-<hash>.svg, not inlined into JS.

const iconModules = import.meta.glob('../assets/metals/*.svg', {
	query: '?url',
	import: 'default',
	eager: true,
}) as Record<string, string>

export type MetalAsset = 'gold' | 'silver'

const FILENAME: Record<MetalAsset, string> = {
	gold: 'sjc-gold',
	silver: 'pq-silver',
}

export function metalIconUrl(asset: MetalAsset): string {
	return iconModules[`../assets/metals/${FILENAME[asset]}.svg`]
}
