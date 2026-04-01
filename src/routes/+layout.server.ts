export const load = ({ cookies }) => {
	const sidebarState = cookies.get('sidebar:state')
	return {
		sidebarOpen: sidebarState !== 'false',
	}
}
