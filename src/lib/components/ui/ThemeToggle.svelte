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
	import { Monitor, Sun, Moon } from 'lucide-svelte';
	import { themeManager } from '$lib/stores/ThemeManager.svelte';
	import type { ThemePreference } from '$lib/stores/ThemeManager.svelte';

	/** If true, render a text label alongside the icon. Default: false. */
	let { showLabel = false }: { showLabel?: boolean } = $props();

	/**
	 * Mapping from preference state to display metadata.
	 *
	 * WHY NOT A SWITCH?
	 *   Using a lookup object avoids verbose if/else chains and makes it trivial
	 *   to add new states in the future (though none are planned).
	 */
	const STATE_META: Record<
		ThemePreference,
		{ label: string; tooltip: string; icon: typeof Monitor }
	> = {
		system: {
			label: 'System',
			tooltip: 'Theme: System (follows OS preference). Click for Light.',
			icon: Monitor
		},
		light: {
			label: 'Light',
			tooltip: 'Theme: Light. Click for Dark.',
			icon: Sun
		},
		dark: {
			label: 'Dark',
			tooltip: 'Theme: Dark. Click for System.',
			icon: Moon
		}
	};

	/** Derived: current state metadata, updated reactively as themeManager.preference changes. */
	const meta = $derived(STATE_META[themeManager.preference]);
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
	title={meta.tooltip}
	aria-label={meta.tooltip}
	type="button"
>
	<!--
		Render the icon component dynamically based on current state.
		size=20 follows project convention (20px for buttons/nav items).
		aria-hidden prevents the SVG being announced redundantly by screen readers
		(the button's aria-label already fully describes the control).
	-->
	<meta.icon size={20} aria-hidden="true" />

	<!--
		Optional text label — shown when parent layout has enough space (e.g. expanded sidebar).
		Hidden by default to keep the toggle compact in icon-only contexts.
	-->
	{#if showLabel}
		<span>{meta.label}</span>
	{/if}
</button>
