<!--
  @file src/lib/components/ui/ThemeLanguagePicker.svelte
  @description Shared theme toggle + language picker widget.

  Used in:
    - Sidebar footer (expanded: horizontal flag + full name; collapsed: vertical flag-only stack)
    - Login page (horizontal, centered below card)

  ── LAYOUTS ──────────────────────────────────────────────────────────────────

  showLabel=true  (default — sidebar expanded, login page):
    Horizontal row — theme icon button + language button with flag + full name + chevron.

    [☀]  [🇬🇧  English  ▾]

  showLabel=false (sidebar collapsed, 64 px):
    Vertical stack — theme icon above, flag below. Both fill the full width.
    Dropdown opens to the RIGHT (escapes the narrow sidebar).

    [☀]
    [🇬🇧]

  ── LANGUAGE COOKIE ──────────────────────────────────────────────────────────

  Reads `cv_language` cookie on mount. If the language is in availableLanguages,
  it is applied immediately (without writing). If not, it is stored as `pendingLang`
  and auto-applied when the locale becomes available (e.g. campaign load).
  The cookie is written ONLY on explicit user selection.

  ── FLAGS ─────────────────────────────────────────────────────────────────────

  Uses `flag-icons` CSS (`flag-icons/css/flag-icons.min.css` imported in app.css).
  The component delegates flag lookup to `engine.getLanguageCountryCode(code)`,
  which reads the `countryCode` field from the locale's `$meta` block (mandatory).
  LANG_FLAGS provides a hardcoded fallback for built-in English ('gb') and any
  locale that hasn't loaded its metadata yet.

  ── PROPS ────────────────────────────────────────────────────────────────────

  showLabel   true  → horizontal: flag + full language name + chevron.
              false → vertical stack: flag icon only (tooltip = full name).
  dropdownUp  true  → language panel opens upward (sidebar footer, default).
              false → language panel opens downward (login page top).
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui, loadUiLocale } from '$lib/i18n/ui-strings';
  import { themeManager } from '$lib/stores/ThemeManager.svelte';
  import { readLanguageCookie, writeLanguageCookie } from '$lib/utils/languageCookie';
  import {
    IconThemeSystem, IconThemeLight, IconThemeDark,
    IconChevronDown, IconChevronUp,
  } from '$lib/components/ui/icons';

  // ---------------------------------------------------------------------------
  // PROPS
  // ---------------------------------------------------------------------------

  interface Props {
    /**
     * true  (default) — horizontal: flag + full language name.
     * false — vertical stack: flag icon only (sidebar collapsed mode).
     */
    showLabel?: boolean;
    /**
     * Direction the language dropdown opens.
     * true (default) — upward (sidebar footer).
     * false          — downward (login page, picker is near top).
     */
    dropdownUp?: boolean;
  }

  let { showLabel = true, dropdownUp = true }: Props = $props();

  // ---------------------------------------------------------------------------
  // FALLBACK FLAG MAP (BCP-47 → ISO 3166-1 alpha-2)
  // Used for built-in English ('en' → 'gb') and as a safety net before
  // locale metadata loads. Engine.getLanguageCountryCode() is the primary source.
  // ---------------------------------------------------------------------------

  const FALLBACK_FLAGS: Record<string, string> = {
    en: 'gb', fr: 'fr', de: 'de', es: 'es', it: 'it', pt: 'pt',
    nl: 'nl', pl: 'pl', cs: 'cz', ru: 'ru', ja: 'jp', ko: 'kr', zh: 'cn',
  };

  /**
   * Returns the ISO 3166-1 alpha-2 country code for a language, or undefined.
   * Prefers the engine's data (from $meta.countryCode in the locale file);
   * falls back to the hardcoded FALLBACK_FLAGS map.
   */
  function langFlag(code: string): string | undefined {
    return engine.getLanguageCountryCode(code) ?? FALLBACK_FLAGS[code];
  }

  // ---------------------------------------------------------------------------
  // THEME STATE
  // ---------------------------------------------------------------------------

  const THEME_ICONS = {
    system: IconThemeSystem,
    light:  IconThemeLight,
    dark:   IconThemeDark,
  } as const;

  /** Property-access wrapper — Svelte 5 requires `obj.prop` for dynamic components. */
  const themeState   = $derived({ icon: THEME_ICONS[themeManager.preference] });
  const themeTooltip = $derived(
    ui(`theme.tooltip_${themeManager.preference}`, engine.settings.language)
  );

  // ---------------------------------------------------------------------------
  // LANGUAGE STATE
  // ---------------------------------------------------------------------------

  let pendingLang  = $state<string | null>(null);
  const currentLang    = $derived(engine.settings.language);
  const availableLangs = $derived(engine.availableLanguages);

  /**
   * Display name of the current language — reactive to BOTH the active language
   * AND locale loading.
   *
   * Problem without this: on hard refresh, `engine.settings.language` may already
   * be 'fr' (restored from cookie/store) before `loadExternalLocales()` finishes.
   * `getLanguageDisplayName('fr')` then returns 'FR' (the fallback code). Once
   * locales load, `applyLanguage` is called but `engine.settings.language` is
   * already 'fr' — no change, no re-render, display stays 'FR'.
   *
   * Fix: reading `availableLangs` here creates a reactive dependency on
   * `engine.localesVersion` (via the `availableLanguages` $derived). When the
   * locale file loads and `availableLangs` updates, this derived recomputes and
   * `getLanguageDisplayName` now finds the full name in `_externalLocales`.
   */
  const currentLangDisplayName = $derived.by(() => {
    void availableLangs; // reactive dep — recompute when locales finish loading
    return engine.getLanguageDisplayName(currentLang);
  });

  /**
   * Track whether the cookie-stored language preference is currently available
   * in the dropdown. If not yet (external locales haven't loaded), set
   * `pendingLang` so the UI shows the unavailable entry in the dropdown.
   * Clears automatically when `availableLangs` updates (reactive dependency).
   *
   * Locale loading and `engine.settings.language` are intentionally NOT touched
   * here — AppShell handles both before this component ever renders (it gates all
   * content behind `localeReady`). This effect only manages dropdown state.
   */
  $effect(() => {
    themeManager.init(); // idempotent — safe to call multiple times
    const stored = readLanguageCookie();
    pendingLang = (stored !== 'en' && !availableLangs.includes(stored)) ? stored : null;
  });

  /**
   * Apply a language selection triggered by explicit user interaction.
   *
   * Loads the locale strings (no-op if already cached), updates the engine
   * reactive state so all ui() call sites re-render, and optionally persists
   * the choice to the browser cookie.
   *
   * NOT called on mount — AppShell gates all rendering behind `localeReady`
   * and applies the cookie language before the first paint.
   */
  async function applyLanguage(code: string, writeCookie: boolean): Promise<void> {
    await loadUiLocale(code);
    engine.settings.language = code;
    if (writeCookie) {
      writeLanguageCookie(code);
      pendingLang = null;
    }
  }

  // ---------------------------------------------------------------------------
  // LANGUAGE DROPDOWN
  // ---------------------------------------------------------------------------

  let showLangDropdown = $state(false);

  function toggleLangDropdown(): void {
    showLangDropdown = !showLangDropdown;
  }

  async function selectLanguage(code: string): Promise<void> {
    showLangDropdown = false;
    await applyLanguage(code, true);
  }

  $effect(() => {
    if (!showLangDropdown) return;
    function onOutside(e: MouseEvent) {
      if (!(e.target as Element)?.closest('[data-lang-picker]')) {
        showLangDropdown = false;
      }
    }
    document.addEventListener('click', onOutside);
    return () => document.removeEventListener('click', onOutside);
  });

  const unavailableEntry = $derived(
    pendingLang && !availableLangs.includes(pendingLang) ? pendingLang : null
  );

  // ---------------------------------------------------------------------------
  // DROPDOWN POSITION CLASSES
  // ---------------------------------------------------------------------------

  /**
   * In vertical/collapsed mode (showLabel=false) the sidebar is only 64 px wide.
   * The dropdown opens to the RIGHT (left-full) so it is never clipped.
   * In horizontal mode (showLabel=true) the dropdown opens up or down per dropdownUp.
   */
  const dropdownPosClass = $derived(
    !showLabel
      ? 'left-full top-auto bottom-0 ml-1'            // → right of the flag button
      : dropdownUp
        ? 'bottom-full left-0 mb-1'                    // ↑ upward (sidebar footer)
        : 'top-full left-0 mt-1'                       // ↓ downward (login page)
  );
</script>

{#if showLabel}
  <!-- ══════════════════════════════════════════════════════════════════════════
       HORIZONTAL LAYOUT (expanded sidebar, login page)
       [☀]  [🇬🇧  English  ▾]
  ══════════════════════════════════════════════════════════════════════════ -->
  <div class="flex items-center gap-1 w-full">

    <!-- Theme button -->
    <button
      type="button"
      class="h-8 w-8 shrink-0 rounded-md flex items-center justify-center
             text-text-muted hover:text-text-primary hover:bg-surface-alt
             transition-colors duration-150
             focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      onclick={() => themeManager.cycle()}
      title={themeTooltip}
      aria-label={themeTooltip}
    >
      <themeState.icon size={16} aria-hidden="true" />
    </button>

    <!-- Language button + dropdown -->
    <div class="relative flex-1 min-w-0" data-lang-picker>
      <button
        type="button"
        class="h-8 w-full rounded-md flex items-center gap-1.5 px-2
               text-xs text-text-muted hover:text-text-primary hover:bg-surface-alt
               transition-colors duration-150
               focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        onclick={toggleLangDropdown}
        title={ui('lang.select_tooltip', currentLang)}
        aria-label={ui('lang.select_tooltip', currentLang)}
        aria-expanded={showLangDropdown}
        aria-haspopup="listbox"
      >
        {#if langFlag(currentLang)}
          <span class="fi fi-{langFlag(currentLang)} shrink-0"
                style="width:1.1em;height:0.85em;border-radius:2px;"
                aria-hidden="true"></span>
        {/if}
        <span class="flex-1 min-w-0 truncate text-left">
          {currentLangDisplayName}
        </span>
        {#if showLangDropdown}
          <IconChevronUp  size={11} class="shrink-0" aria-hidden="true" />
        {:else}
          <IconChevronDown size={11} class="shrink-0" aria-hidden="true" />
        {/if}
      </button>

      {#if showLangDropdown}
        {@render langDropdown()}
      {/if}
    </div>

  </div>

{:else}
  <!-- ══════════════════════════════════════════════════════════════════════════
       VERTICAL STACK LAYOUT (collapsed sidebar, 64 px)
       [☀]
       [🇬🇧]
  ══════════════════════════════════════════════════════════════════════════ -->
  <div class="flex flex-col items-stretch gap-1 w-full">

    <!-- Theme button -->
    <button
      type="button"
      class="h-8 w-full rounded-md flex items-center justify-center
             text-text-muted hover:text-text-primary hover:bg-surface-alt
             transition-colors duration-150
             focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      onclick={() => themeManager.cycle()}
      title={themeTooltip}
      aria-label={themeTooltip}
    >
      <themeState.icon size={16} aria-hidden="true" />
    </button>

    <!-- Language flag button + dropdown (opens to the right) -->
    <div class="relative w-full" data-lang-picker>
      <button
        type="button"
        class="h-8 w-full rounded-md flex items-center justify-center
               text-text-muted hover:text-text-primary hover:bg-surface-alt
               transition-colors duration-150
               focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        onclick={toggleLangDropdown}
        title={currentLangDisplayName}
        aria-label={ui('lang.select_tooltip', currentLang)}
        aria-expanded={showLangDropdown}
        aria-haspopup="listbox"
      >
        {#if langFlag(currentLang)}
          <span class="fi fi-{langFlag(currentLang)}"
                style="width:1.3em;height:1em;border-radius:2px;"
                aria-hidden="true"></span>
        {:else}
          <!-- Fallback if no flag available -->
          <span class="text-[10px] font-bold uppercase">{currentLang}</span>
        {/if}
      </button>

      {#if showLangDropdown}
        {@render langDropdown()}
      {/if}
    </div>

  </div>
{/if}

<!-- ── Shared dropdown panel (rendered via snippet) ─────────────────────── -->
{#snippet langDropdown()}
  <div
    role="listbox"
    aria-label={ui('lang.select_tooltip', currentLang)}
    class="absolute {dropdownPosClass} z-50
           min-w-[11rem] max-h-60 overflow-y-auto
           bg-surface border border-border rounded-lg shadow-lg py-1"
  >
    {#each availableLangs as code}
      {@const flag       = langFlag(code)}
      {@const isSelected = code === currentLang}
      <button
        type="button"
        role="option"
        aria-selected={isSelected}
        class="flex items-center gap-2 w-full px-3 py-2 text-xs
               transition-colors duration-100
               {isSelected
                 ? 'bg-accent-50 text-accent-700 dark:bg-accent-950 dark:text-accent-300 font-medium'
                 : 'text-text-secondary hover:bg-surface-alt hover:text-text-primary'}"
        onclick={() => selectLanguage(code)}
      >
        {#if flag}
          <span class="fi fi-{flag} shrink-0"
                style="width:1.15em;height:0.9em;border-radius:2px;"
                aria-hidden="true"></span>
        {:else}
          <span class="shrink-0 inline-block w-[1.15em] h-[0.9em] rounded-sm bg-surface-alt"
                aria-hidden="true"></span>
        {/if}
        <span class="truncate">{engine.getLanguageDisplayName(code)}</span>
        {#if isSelected}
          <span class="ml-auto shrink-0 text-accent" aria-hidden="true">✓</span>
        {/if}
      </button>
    {/each}

    {#if unavailableEntry}
      {@const flag = langFlag(unavailableEntry)}
      <div class="border-t border-border mt-1 pt-1" aria-hidden="true"></div>
      <div role="option" aria-selected="false" aria-disabled="true"
           class="flex items-center gap-2 w-full px-3 py-2 text-xs
                  text-text-muted opacity-50 cursor-not-allowed select-none">
        {#if flag}
          <span class="fi fi-{flag} shrink-0"
                style="width:1.15em;height:0.9em;border-radius:2px;"
                aria-hidden="true"></span>
        {:else}
          <span class="shrink-0 inline-block w-[1.15em] h-[0.9em] rounded-sm bg-surface-alt"
                aria-hidden="true"></span>
        {/if}
        <span class="truncate italic">
          {engine.getLanguageDisplayName(unavailableEntry)}
          <span class="not-italic text-[10px]"> — {ui('lang.unavailable', currentLang)}</span>
        </span>
      </div>
    {/if}
  </div>
{/snippet}
