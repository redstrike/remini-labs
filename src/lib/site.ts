// Site-identity constants — values that define what this site IS, not how
// it's configured. Locked across every environment (dev replicates prod);
// no env vars, no per-deploy overrides. These aren't knobs — they're the
// site's name, canonical address, and shared brand defaults.

export const CANONICAL_ORIGIN = 'https://remini-labs.redstrike.dev'

export const SITE_NAME = 'Remini Labs'

export const DEFAULT_OG_IMAGE = '/og-default.png'

export const SHELL_DESCRIPTION =
	'Personal research labs for experimental mini-apps — tickers, weather, and more. Crafted by redstrike (Tung Nguyen) with agentic AI development tools (Claude Code, Antigravity, etc.)'
