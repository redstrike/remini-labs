import type { LayoutServerLoad } from './$types'

export const load: LayoutServerLoad = ({ locals }) => {
	locals.cacheControl = 'public, max-age=300, must-revalidate'
}
