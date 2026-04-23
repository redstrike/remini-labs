<script lang="ts">
	import * as Tooltip from '$lib/components/shadcn-svelte/tooltip/index.js'
	import { cn, type WithElementRef } from '$lib/utils.js'
	import type { HTMLAttributes } from 'svelte/elements'
	import { SIDEBAR_WIDTH, SIDEBAR_WIDTH_ICON } from './constants.js'
	import { setSidebar } from './context.svelte.js'

	let {
		ref = $bindable(null),
		open = $bindable(true),
		onOpenChange = () => {},
		class: className,
		style,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		open?: boolean
		onOpenChange?: (open: boolean) => void
	} = $props()

	const sidebar = setSidebar({
		open: () => open,
		setOpen: (value: boolean) => {
			open = value
			onOpenChange(value)
			// Remini Labs customization: upstream shadcn persists open-state in a
			// `sidebar:state` cookie here. Removed deliberately — sidebar is a
			// transient per-session UI state, not a user preference worth syncing
			// across requests / devices. Default closed, user toggles as needed.
			// Preserve on next shadcn-svelte:sync (see SIDEBAR_COOKIE_* in constants.ts).
		},
	})
</script>

<svelte:window onkeydown={sidebar.handleShortcutKeydown} />

<Tooltip.Provider delayDuration={0}>
	<div
		data-slot="sidebar-wrapper"
		style="--sidebar-width: {SIDEBAR_WIDTH}; --sidebar-width-icon: {SIDEBAR_WIDTH_ICON}; {style}"
		class={cn('group/sidebar-wrapper flex min-h-svh w-full has-data-[variant=inset]:bg-sidebar', className)}
		bind:this={ref}
		{...restProps}>
		{@render children?.()}
	</div>
</Tooltip.Provider>
