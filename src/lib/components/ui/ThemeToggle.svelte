<script lang="ts">
	/**
	 * @file src/lib/components/ui/ThemeToggle.svelte
	 * @description Three-state theme toggle button for the application shell.
	 *
	 * STATES (cycles in order):
	 *   System → Light → Dark → System → ...
	 *
	 * Each state shows a distinct Lucide icon:
	 *   'system' → Monitor  (follows OS)
	 *   'light'  → Sun      (forced light)
	 *   'dark'   → Moon     (forced dark)
	 *
	 * USAGE:
	 *   <ThemeToggle />
	 *   <ThemeToggle showLabel={true} />   — show text label alongside icon
	 *
	 * The component calls themeManager.cycle() on click, which rotates through
	 * the three preferences and persists the selection in a cookie.
	 *
	 * ACCESSIBILITY:
	 *   The button carries an aria-label describing the CURRENT state and a
	 *   title tooltip for mouse users. The icon aria-hidden prevents redundant
	 *   announcements from screen readers (the button label is sufficient).
	 *
	 * ICON SIZING:
	 *   Icons are 20px per project convention (buttons and nav items).
	 *   They inherit `currentColor` from the button's text color automatically.
	 */
	import { IconThemeSystem, IconThemeLight, IconThemeDark } from '$lib/components/ui/icons';
	import { themeManager } from '$lib/stores/ThemeManager.svelte';
	import type { ThemePreference } from '$lib/stores/ThemeManager.svelte';
	import { engine } from '$lib/engine/GameEngine.svelte';
	import { ui } from '$lib/i18n/ui-strings';

	/** If true, render a text label alongside the icon. Default: false. */
	let { showLabel = false }: { showLabel?: boolean } = $props();

	/**
	 * Mapping from preference state to i18n keys.
	 */
	const STATE_KEYS: Record<ThemePreference, { labelKey: string; tooltipKey: string; icon: typeof IconThemeSystem }> = {
		system: {
			labelKey:   'theme.system',
			tooltipKey: 'theme.tooltip_system',
			icon: IconThemeSystem
		},
		light: {
			labelKey:   'theme.light',
			tooltipKey: 'theme.tooltip_light',
			icon: IconThemeLight
		},
		dark: {
			labelKey:   'theme.dark',
			tooltipKey: 'theme.tooltip_dark',
			icon: IconThemeDark
		}
	};

	/** Derived: current state keys, updated reactively as themeManager.preference changes. */
	const stateKeys = $derived(STATE_KEYS[themeManager.preference]);
	const lang      = $derived(engine.settings.language);
	const label     = $derived(ui(stateKeys.labelKey, lang));
	const tooltip   = $derived(ui(stateKeys.tooltipKey, lang));
</script>

<!--
	Three-state theme toggle button.

	Classes breakdown:
	  btn-ghost     — from app.css @layer components: base button styles with ghost style
	  gap-2         — space between icon and optional label
	  title={...}   — native browser tooltip on hover (no JS required)
	  aria-label    — describes current state for screen readers
-->
<button
	class="btn-ghost gap-2"
	onclick={() => themeManager.cycle()}
	title={tooltip}
	aria-label={tooltip}
	type="button"
>
	<!--
		Render the icon component dynamically based on current state.
		size=20 follows project convention (20px for buttons/nav items).
		aria-hidden prevents the SVG being announced redundantly by screen readers
		(the button's aria-label already fully describes the control).
	-->
	<stateKeys.icon size={20} aria-hidden="true" />

	<!--
		Optional text label — shown when parent layout has enough space (e.g. expanded sidebar).
		Hidden by default to keep the toggle compact in icon-only contexts.
	-->
	{#if showLabel}
		<span>{label}</span>
	{/if}
</button>
