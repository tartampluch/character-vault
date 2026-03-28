<!--
  @file src/lib/components/ui/ThemeLanguagePicker.svelte
  @description Shared theme toggle + language picker widget.

  Used in:
    - Sidebar footer (expanded: flag + full name; collapsed: flag only)
    - Login page (centered below login card)

  LAYOUT:
    A flex row containing two equal-height (h-8) buttons:
      1. Theme toggle  — square icon button cycling system → light → dark.
      2. Language pick — flag + name (or flag-only when collapsed), opens dropdown.

  LANGUAGE COOKIE:
    Reads `cv_language` cookie on mount. If the stored language is present in
    `engine.availableLanguages`, it is applied immediately. If not, the UI falls
    back to English but shows the stored language as a disabled "(unavailable)"
    entry in the dropdown so the user knows their preference is remembered.

    A `$effect` watches `engine.availableLanguages`: as soon as the stored
    language becomes available (e.g. when a campaign locale loads), it is
    applied automatically WITHOUT writing the cookie again (preference unchanged).

    The cookie is written ONLY when the user explicitly picks a language.

  FLAGS:
    Uses `flag-icons` CSS classes (`.fi .fi-{ISO-3166-1-alpha-2}`).
    The LANG_FLAGS map translates BCP-47 language codes → country codes.
    Extend this map when new locales are added.

  PROPS:
    showLabel  — true: flag + full language name (sidebar expanded, login page).
                 false: flag only, no label (sidebar collapsed icon-only mode).
    dropdownUp — open the language dropdown upward (default true, sidebar footer).
                 Set to false when the picker is near the top of the viewport.
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
     * true  → show the full language display name beside the flag (sidebar expanded,
     *          login page).
     * false → show the flag icon only, no text label (sidebar collapsed icon-only mode).
     */
    showLabel?: boolean;
    /**
     * Open the language dropdown upward (true, default) or downward (false).
     * Use false when the component is at the very top of the visible area.
     */
    dropdownUp?: boolean;
  }

  let { showLabel = true, dropdownUp = true }: Props = $props();

  // ---------------------------------------------------------------------------
  // FLAG MAP — BCP-47 language code → ISO 3166-1 alpha-2 country code
  // ---------------------------------------------------------------------------

  const LANG_FLAGS: Record<string, string> = {
    en: 'gb', fr: 'fr', de: 'de', es: 'es', it: 'it', pt: 'pt',
    nl: 'nl', pl: 'pl', cs: 'cz', ru: 'ru', ja: 'jp', ko: 'kr', zh: 'cn',
  };

  function langFlag(code: string): string | undefined {
    return LANG_FLAGS[code];
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

  /**
   * The language code stored in the cookie that is not yet in availableLanguages.
   * Kept reactive so the "unavailable" entry appears / disappears dynamically.
   */
  let pendingLang = $state<string | null>(null);

  const currentLang    = $derived(engine.settings.language);
  const availableLangs = $derived(engine.availableLanguages);

  /**
   * On mount: read the cookie and apply the language if available, or mark as
   * pending so it activates once the locale is discovered.
   * Never writes the cookie — the stored preference must survive until the user
   * explicitly changes it.
   */
  $effect(() => {
    themeManager.init(); // idempotent
    const stored = readLanguageCookie();
    if (stored === 'en') return;

    if (availableLangs.includes(stored)) {
      applyLanguage(stored, false);
      pendingLang = null;
    } else {
      pendingLang = stored;
    }
  });

  /**
   * Auto-apply the pending language as soon as it appears in availableLanguages.
   * This fires when a campaign loads a new locale file.
   */
  $effect(() => {
    if (!pendingLang) return;
    if (availableLangs.includes(pendingLang)) {
      applyLanguage(pendingLang, false);
      pendingLang = null;
    }
  });

  /**
   * Apply a language: load the locale file and update the engine.
   * @param code        - BCP-47 language code.
   * @param writeCookie - Persist the choice to the cookie (only on explicit user action).
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

  /**
   * Select a language: close the dropdown, apply the language, and persist.
   * Closing first (synchronously) prevents any visual flicker.
   */
  async function selectLanguage(code: string): Promise<void> {
    showLangDropdown = false;
    await applyLanguage(code, true);
  }

  // Close the dropdown on any click outside the picker container.
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

  /**
   * Disabled entry shown when the stored cookie language is not yet available.
   * Gives visual feedback that the preference is saved and will activate later.
   */
  const unavailableEntry = $derived(
    pendingLang && !availableLangs.includes(pendingLang) ? pendingLang : null
  );
</script>

<!--
  Two equal-height (h-8) controls in a flex row.
  The parent is responsible for width/positioning.
-->
<div class="flex items-center gap-1 w-full">

  <!-- ── THEME TOGGLE ──────────────────────────────────────────────────────── -->
  <button
    type="button"
    class="
      h-8 w-8 shrink-0 rounded-md
      flex items-center justify-center
      text-text-muted hover:text-text-primary hover:bg-surface-alt
      transition-colors duration-150
      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50
    "
    onclick={() => themeManager.cycle()}
    title={themeTooltip}
    aria-label={themeTooltip}
  >
    <themeState.icon size={16} aria-hidden="true" />
  </button>

  <!-- ── LANGUAGE PICKER ───────────────────────────────────────────────────── -->
  <div class="relative flex-1 min-w-0" data-lang-picker>

    <!-- Trigger button -->
    <button
      type="button"
      class="
        h-8 w-full rounded-md
        flex items-center gap-1.5 px-2
        text-xs text-text-muted hover:text-text-primary hover:bg-surface-alt
        transition-colors duration-150
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50
      "
      onclick={toggleLangDropdown}
      title={showLabel
        ? ui('lang.select_tooltip', currentLang)
        : engine.getLanguageDisplayName(currentLang)}
      aria-label={ui('lang.select_tooltip', currentLang)}
      aria-expanded={showLangDropdown}
      aria-haspopup="listbox"
    >
      <!-- Country flag -->
      {#if langFlag(currentLang)}
        <span
          class="fi fi-{langFlag(currentLang)} shrink-0"
          style="width:1.1em;height:0.85em;border-radius:2px;"
          aria-hidden="true"
        ></span>
      {/if}

      {#if showLabel}
        <!-- Full language name + chevron -->
        <span class="flex-1 min-w-0 truncate text-left">
          {engine.getLanguageDisplayName(currentLang)}
        </span>
        {#if showLangDropdown}
          <IconChevronUp  size={11} class="shrink-0" aria-hidden="true" />
        {:else}
          <IconChevronDown size={11} class="shrink-0" aria-hidden="true" />
        {/if}
      {/if}
      <!-- When showLabel=false: flag only (collapsed sidebar). Tooltip shows the full name. -->
    </button>

    <!-- Dropdown panel -->
    {#if showLangDropdown}
      <div
        role="listbox"
        aria-label={ui('lang.select_tooltip', currentLang)}
        class="
          absolute {dropdownUp ? 'bottom-full mb-1' : 'top-full mt-1'}
          left-0 z-50
          min-w-[11rem] max-h-60 overflow-y-auto
          bg-surface border border-border rounded-lg shadow-lg py-1
        "
      >
        <!-- Available languages -->
        {#each availableLangs as code}
          {@const flag       = langFlag(code)}
          {@const isSelected = code === currentLang}
          <button
            type="button"
            role="option"
            aria-selected={isSelected}
            class="
              flex items-center gap-2 w-full px-3 py-2 text-xs
              transition-colors duration-100
              {isSelected
                ? 'bg-accent-50 text-accent-700 dark:bg-accent-950 dark:text-accent-300 font-medium'
                : 'text-text-secondary hover:bg-surface-alt hover:text-text-primary'}
            "
            onclick={() => selectLanguage(code)}
          >
            {#if flag}
              <span
                class="fi fi-{flag} shrink-0"
                style="width:1.15em;height:0.9em;border-radius:2px;"
                aria-hidden="true"
              ></span>
            {:else}
              <span class="shrink-0 inline-block w-[1.15em] h-[0.9em] rounded-sm bg-surface-alt" aria-hidden="true"></span>
            {/if}
            <span class="truncate">{engine.getLanguageDisplayName(code)}</span>
            {#if isSelected}
              <span class="ml-auto shrink-0 text-accent" aria-hidden="true">✓</span>
            {/if}
          </button>
        {/each}

        <!--
          Unavailable language entry — shown when the stored cookie preference is not
          yet available. Non-interactive but visible so the user understands their
          preference is remembered and will activate automatically.
        -->
        {#if unavailableEntry}
          {@const flag = langFlag(unavailableEntry)}
          <div class="border-t border-border mt-1 pt-1" aria-hidden="true"></div>
          <div
            role="option"
            aria-selected="false"
            aria-disabled="true"
            class="flex items-center gap-2 w-full px-3 py-2 text-xs
                   text-text-muted opacity-50 cursor-not-allowed select-none"
          >
            {#if flag}
              <span
                class="fi fi-{flag} shrink-0"
                style="width:1.15em;height:0.9em;border-radius:2px;"
                aria-hidden="true"
              ></span>
            {:else}
              <span class="shrink-0 inline-block w-[1.15em] h-[0.9em] rounded-sm bg-surface-alt" aria-hidden="true"></span>
            {/if}
            <span class="truncate italic">
              {engine.getLanguageDisplayName(unavailableEntry)}
              <span class="not-italic text-[10px]"> — {ui('lang.unavailable', currentLang)}</span>
            </span>
          </div>
        {/if}
      </div>
    {/if}
  </div>

</div>
