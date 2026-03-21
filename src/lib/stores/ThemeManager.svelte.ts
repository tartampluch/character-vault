/**
 * @file src/lib/stores/ThemeManager.svelte.ts
 * @description Reactive theme manager for Character Vault using Svelte 5 runes.
 *
 * ARCHITECTURE OVERVIEW:
 *   This module implements the three-state theme system required by Phase 19.2:
 *     1. 'system'  — Follow the OS preference (prefers-color-scheme media query)
 *     2. 'light'   — Always light, regardless of OS
 *     3. 'dark'    — Always dark, regardless of OS
 *
 *   The user's choice is stored in a browser cookie so it persists across sessions.
 *   Cookie attributes: path=/, max-age=31536000 (1 year), SameSite=Lax.
 *
 * HOW THEME APPLICATION WORKS:
 *   Tailwind CSS v4 was configured in src/app.css with:
 *     @custom-variant dark (&:where(.dark, .dark *));
 *   This means all `dark:` utility classes activate when an ancestor has `.dark`.
 *   The ThemeManager toggles the `dark` class on `document.documentElement` (<html>).
 *   The CSS variables in :root and .dark { } handle the color transitions.
 *
 * FLASH-OF-WRONG-THEME (FOWT) PREVENTION:
 *   This module handles RUNTIME theme management (after hydration).
 *   The initial paint is handled by a synchronous inline <script> in src/app.html
 *   that reads the cookie and applies the dark class BEFORE any render.
 *   Without that script, there would be a visible flash when the page loads.
 *
 * SYSTEM PREFERENCE LISTENING:
 *   When the user is in 'system' mode, ThemeManager listens to the
 *   `prefers-color-scheme` media query via matchMedia.addEventListener.
 *   If the user changes their OS theme, the app updates instantly.
 *   The listener is cleaned up when the theme is changed away from 'system'.
 *
 * SVELTE 5 RUNES USAGE:
 *   - $state for the preference and resolved theme
 *   - $effect for the reactive side-effects (DOM class, cookie write, listener)
 *   - Class instance pattern: exported as a singleton `themeManager`
 */

/** The three valid user preference states. */
export type ThemePreference = 'system' | 'light' | 'dark';

/** The two possible resolved (applied) themes once system preference is evaluated. */
export type ResolvedTheme = 'light' | 'dark';

/** Cookie name used to persist the user's theme preference. */
const COOKIE_NAME = 'theme';

/** Cookie lifetime: 1 year in seconds. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Reads the theme preference cookie from document.cookie.
 * Returns the stored value if it is a valid ThemePreference, otherwise undefined.
 *
 * @returns The persisted theme preference, or undefined if not found/invalid.
 */
function readThemeCookie(): ThemePreference | undefined {
	if (typeof document === 'undefined') return undefined;

	// document.cookie is a semicolon-delimited string of "key=value" pairs.
	// We split and search for our specific cookie key.
	const entries = document.cookie.split(';');
	for (const entry of entries) {
		const [key, value] = entry.trim().split('=');
		if (key === COOKIE_NAME) {
			const decoded = decodeURIComponent(value ?? '');
			// Validate that the stored value is one of our known preferences.
			if (decoded === 'system' || decoded === 'light' || decoded === 'dark') {
				return decoded as ThemePreference;
			}
		}
	}
	return undefined;
}

/**
 * Writes the theme preference to a browser cookie.
 * Cookie attributes:
 *   - path=/ — visible across the entire site
 *   - max-age= — expire after 1 year (survives browser restarts)
 *   - SameSite=Lax — sent on same-origin requests + top-level navigations (recommended default)
 *
 * @param preference - The theme preference to persist.
 */
function writeThemeCookie(preference: ThemePreference): void {
	if (typeof document === 'undefined') return;
	document.cookie =
		`${COOKIE_NAME}=${encodeURIComponent(preference)}` +
		`; path=/` +
		`; max-age=${COOKIE_MAX_AGE}` +
		`; SameSite=Lax`;
}

/**
 * Detects the current OS color scheme preference using matchMedia.
 * Returns 'dark' if the OS is in dark mode, 'light' otherwise.
 * Falls back to 'light' in environments without matchMedia (SSR, old browsers).
 *
 * @returns The OS-resolved theme.
 */
function getSystemPreference(): ResolvedTheme {
	if (typeof window === 'undefined') return 'light';
	return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Applies the resolved theme to the document by toggling the `dark` class on
 * <html> (document.documentElement). This activates Tailwind's `dark:` utilities
 * which were configured via `@custom-variant dark (&:where(.dark, .dark *))`.
 *
 * Also updates the `color-scheme` meta to help browsers render native UI elements
 * (scrollbars, input fields, etc.) in the correct scheme.
 *
 * @param resolved - The resolved theme to apply ('light' or 'dark').
 */
function applyThemeToDom(resolved: ResolvedTheme): void {
	if (typeof document === 'undefined') return;
	const html = document.documentElement;
	if (resolved === 'dark') {
		html.classList.add('dark');
	} else {
		html.classList.remove('dark');
	}
	// Helps browsers render native UI elements in the correct scheme
	html.style.colorScheme = resolved;
}

/**
 * ThemeManager — Svelte 5 rune-based reactive theme controller.
 *
 * USAGE:
 *   Import the singleton and use its reactive properties in Svelte components:
 *     import { themeManager } from '$lib/stores/ThemeManager.svelte';
 *
 *   Read:
 *     themeManager.preference  // 'system' | 'light' | 'dark'
 *     themeManager.resolved    // 'light' | 'dark' (what is currently applied)
 *
 *   Set:
 *     themeManager.setPreference('dark')  // persists to cookie, updates DOM
 *     themeManager.cycle()                // System → Light → Dark → System
 *
 * INITIALIZATION:
 *   Call `themeManager.init()` once, from the root layout's onMount().
 *   This reads the cookie, sets up the matchMedia listener, and applies the
 *   initial theme. It is safe to call multiple times (idempotent).
 */
class ThemeManagerClass {
	/**
	 * The user's explicit preference ('system', 'light', or 'dark').
	 * Initializes to 'system' — will be overwritten by init() on mount.
	 */
	preference = $state<ThemePreference>('system');

	/**
	 * The actual resolved theme currently applied to the DOM.
	 * Derived from preference + OS preference when preference is 'system'.
	 */
	resolved = $state<ResolvedTheme>('light');

	/**
	 * Reference to the matchMedia listener cleanup function.
	 * Stored so we can remove the old listener when switching away from 'system'.
	 */
	private mediaQueryCleanup: (() => void) | null = null;

	/**
	 * Whether init() has been called. Prevents double-initialization.
	 */
	private initialized = false;

	/**
	 * Initialize the ThemeManager. Must be called once from the root layout's
	 * onMount() so that browser APIs (document.cookie, matchMedia) are available.
	 *
	 * Sequence:
	 *   1. Read cookie → set preference
	 *   2. Resolve the actual theme (system → OS, explicit → the value)
	 *   3. Apply to DOM
	 *   4. If 'system', attach matchMedia listener for OS changes
	 */
	init(): void {
		if (this.initialized) return;
		this.initialized = true;

		// 1. Read persisted preference from cookie (or default to 'system')
		const stored = readThemeCookie();
		this.preference = stored ?? 'system';

		// 2. Resolve & 3. Apply
		this.applyPreference(this.preference);
	}

	/**
	 * Set a new theme preference. Persists to cookie, resolves the theme,
	 * applies it to the DOM, and manages the matchMedia listener.
	 *
	 * @param preference - The new preference to apply.
	 */
	setPreference(preference: ThemePreference): void {
		this.preference = preference;
		writeThemeCookie(preference);
		this.applyPreference(preference);
	}

	/**
	 * Cycle through preferences in order: System → Light → Dark → System.
	 * Convenient for a single toggle button that steps through all three states.
	 */
	cycle(): void {
		const next: Record<ThemePreference, ThemePreference> = {
			system: 'light',
			light: 'dark',
			dark: 'system'
		};
		this.setPreference(next[this.preference]);
	}

	/**
	 * Resolve and apply a theme preference to the DOM.
	 * Manages the matchMedia listener for the 'system' state.
	 *
	 * @param preference - The preference to resolve and apply.
	 */
	private applyPreference(preference: ThemePreference): void {
		// Always clean up any existing matchMedia listener first.
		// When transitioning FROM 'system' to a manual preference, the listener
		// must be removed so OS changes no longer affect the explicitly-set theme.
		this.cleanupMediaListener();

		if (preference === 'system') {
			// System mode: resolve once immediately, then listen for OS changes
			const initial = getSystemPreference();
			this.resolved = initial;
			applyThemeToDom(initial);
			this.attachMediaListener();
		} else {
			// Explicit mode: apply directly, no listener needed
			this.resolved = preference;
			applyThemeToDom(preference);
		}
	}

	/**
	 * Attach a matchMedia event listener that updates the resolved theme whenever
	 * the OS preference changes AND the user preference is set to 'system'.
	 *
	 * Uses the modern `addEventListener` API (IE11+ / all modern browsers).
	 * Stores a cleanup function in `this.mediaQueryCleanup`.
	 */
	private attachMediaListener(): void {
		if (typeof window === 'undefined') return;

		const mq = window.matchMedia('(prefers-color-scheme: dark)');

		const handler = (event: MediaQueryListEvent) => {
			// Only update if still in 'system' mode.
			// (Guard against the rare timing where setPreference is called
			// before the previous listener was cleaned up.)
			if (this.preference === 'system') {
				this.resolved = event.matches ? 'dark' : 'light';
				applyThemeToDom(this.resolved);
			}
		};

		mq.addEventListener('change', handler);

		// Store the cleanup so it can be called later
		this.mediaQueryCleanup = () => mq.removeEventListener('change', handler);
	}

	/**
	 * Remove the matchMedia listener if one is active.
	 * Called when switching away from 'system' mode.
	 */
	private cleanupMediaListener(): void {
		this.mediaQueryCleanup?.();
		this.mediaQueryCleanup = null;
	}
}

/**
 * Singleton instance of ThemeManager.
 * Import this singleton in components and layouts:
 *   import { themeManager } from '$lib/stores/ThemeManager.svelte';
 *
 * Call `themeManager.init()` once in the root layout's onMount.
 */
export const themeManager = new ThemeManagerClass();
