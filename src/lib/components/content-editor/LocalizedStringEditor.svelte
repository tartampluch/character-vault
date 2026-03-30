<!--
  @file src/lib/components/content-editor/LocalizedStringEditor.svelte
  @description Reusable editor for LocalizedString fields in the content editor.

  ────────────────────────────────────────────────────────────────────────────
  PURPOSE
  ────────────────────────────────────────────────────────────────────────────
  A LocalizedString is a Record<string, string> mapping language codes to
  translations. This component renders an editable UI for all active translations
  with the following UX:

    • English always first and mandatory (cannot be removed — it is the engine
      fallback language per ARCHITECTURE.md §11).
    • Additional languages shown below with a remove button (× Remove).
    • "+ Add Translation" selector at the bottom offering:
        - Languages available from loaded rule files (engine.availableLanguages)
        - The KNOWN_CONTENT_LANGUAGES premade list (~25 common languages)
        - "+ New language…" option that opens NewLanguageModal for unlisted codes
    • Optional Markdown preview toggle for textarea mode.
    • Warning when the English (fallback) translation is empty.

  ────────────────────────────────────────────────────────────────────────────
  MODES
  ────────────────────────────────────────────────────────────────────────────
    'input'    Single-line <input> — for entity labels, pool labels, choice labels.
    'textarea' Multi-line <textarea> with optional preview toggle — for descriptions.

  ────────────────────────────────────────────────────────────────────────────
  @see src/lib/utils/contentLanguages.ts   for display name resolution
  @see NewLanguageModal.svelte              for adding unlisted languages
  @see ARCHITECTURE.md §11                 for LocalizedString design
-->

<script lang="ts">
  import { engine }                          from '$lib/engine/GameEngine.svelte';
  import { ui }                              from '$lib/i18n/ui-strings';
  import { registerLangUnitSystem }          from '$lib/i18n/ui-strings';
  import NewLanguageModal                    from './NewLanguageModal.svelte';
  import {
    KNOWN_CONTENT_LANGUAGES,
    getContentLangDisplayName,
    getContentLangCountryCode,
    getContentLangUnitSystem,
    type KnownContentLanguage,
  }                                          from '$lib/utils/contentLanguages';

  // ===========================================================================
  // PROPS
  // ===========================================================================

  interface Props {
    /** The current LocalizedString object (Record<string, string>). */
    value: Record<string, string>;
    /** Callback fired whenever a translation is added, edited, or removed. */
    onchange: (newValue: Record<string, string>) => void;
    /**
     * Rendering mode.
     * 'input'    — single-line <input> (labels, pool names, choice labels)
     * 'textarea' — multi-line <textarea> with optional preview (descriptions)
     */
    mode?: 'input' | 'textarea';
    /** Unique DOM-id prefix to prevent conflicts when multiple editors coexist. */
    uid: string;
    /** Short field name used in form IDs (e.g. 'label', 'description', 'label-pool'). */
    fieldName: string;
    /** Current UI language code for ui() calls. */
    lang: string;
    /** Placeholder text for the English (mandatory) field. */
    placeholder?: string;
    /** Placeholder text for non-English fields. Falls back to `placeholder` if omitted. */
    extraPlaceholder?: string;
    /** Additional CSS class applied to every <input> or <textarea> element. */
    inputClass?: string;
  }

  let {
    value,
    onchange,
    mode           = 'input',
    uid,
    fieldName,
    lang,
    placeholder    = '',
    extraPlaceholder = '',
    inputClass     = '',
  }: Props = $props();

  // ===========================================================================
  // ACTIVE LANGUAGES
  // ===========================================================================

  /**
   * Ordered list of language codes currently in the value.
   * English is always first; remaining codes follow their insertion order.
   * Empty-string keys (defensive guard) are excluded.
   */
  const activeLanguages = $derived.by(() => {
    const keys = Object.keys(value).filter(k => k.length > 0);
    const withoutEn = keys.filter(k => k !== 'en');
    return ['en', ...withoutEn];
  });

  // ===========================================================================
  // LANGUAGES AVAILABLE TO ADD
  // ===========================================================================

  /**
   * Codes that can be added to the value (not yet present in `activeLanguages`).
   * Merges engine.availableLanguages (from loaded rule files) with the premade list.
   * 'en' is always excluded — English is mandatory and always present.
   */
  const addableCodes = $derived.by(() => {
    const active      = new Set(activeLanguages);
    const fromEngine  = engine.availableLanguages;
    const fromPremade = KNOWN_CONTENT_LANGUAGES.map(l => l.code);
    const all         = [...new Set([...fromEngine, ...fromPremade])];
    return all.filter(code => code !== 'en' && !active.has(code));
  });

  // ===========================================================================
  // ADD LANGUAGE STATE
  // ===========================================================================

  /** Currently selected value in the "add translation" <select>. Reset after processing. */
  let addSelectValue = $state('');

  /** Whether the NewLanguageModal is currently open. */
  let showNewLanguageModal = $state(false);

  /**
   * Handles the "add translation" select change event.
   * '__new__' → open NewLanguageModal; any other code → add directly.
   */
  function handleAddSelectChange(e: Event): void {
    const selectedCode = (e.currentTarget as HTMLSelectElement).value;
    if (!selectedCode) return;

    if (selectedCode === '__new__') {
      showNewLanguageModal = true;
    } else {
      addLanguage(selectedCode);
    }
    // Reset select to the placeholder option after handling.
    addSelectValue = '';
  }

  /**
   * Adds a language code to the value with an empty string translation.
   * Also registers the language's unit system for distance/weight formatters.
   */
  function addLanguage(code: string): void {
    if (activeLanguages.includes(code)) return;
    registerLangUnitSystem(code, getContentLangUnitSystem(code));
    onchange({ ...value, [code]: '' });
  }

  /**
   * Called by NewLanguageModal when the GM confirms a new language entry.
   */
  function handleNewLanguageConfirmed(entry: KnownContentLanguage): void {
    showNewLanguageModal = false;
    if (activeLanguages.includes(entry.code)) return;
    registerLangUnitSystem(entry.code, entry.metric ? 'metric' : 'imperial');
    onchange({ ...value, [entry.code]: '' });
  }

  // ===========================================================================
  // REMOVE LANGUAGE
  // ===========================================================================

  /** Removes a non-English language from the value. English cannot be removed. */
  function removeLanguage(code: string): void {
    if (code === 'en') return;
    const newValue = { ...value };
    delete newValue[code];
    onchange(newValue);
  }

  // ===========================================================================
  // UPDATE SINGLE TRANSLATION
  // ===========================================================================

  /** Updates the translation for a single language code. */
  function setTranslation(code: string, text: string): void {
    onchange({ ...value, [code]: text });
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  /** Builds a flag emoji from a 2-letter ISO 3166-1 alpha-2 country code. */
  function flagEmoji(countryCode: string): string {
    if (countryCode.length !== 2) return '🌐';
    const a = countryCode.toUpperCase().charCodeAt(0) - 65;
    const b = countryCode.toUpperCase().charCodeAt(1) - 65;
    return String.fromCodePoint(0x1F1E6 + a, 0x1F1E6 + b);
  }

  /** Returns a unique form-element id for the given language code. */
  function makeId(code: string): string {
    return `${uid}-${fieldName}-${code}`;
  }
</script>

<!-- =========================================================================
     NEW LANGUAGE MODAL
     ========================================================================= -->
{#if showNewLanguageModal}
  <NewLanguageModal
    excludeCodes={activeLanguages}
    onLanguageConfirmed={handleNewLanguageConfirmed}
    onclose={() => { showNewLanguageModal = false; addSelectValue = ''; }}
  />
{/if}

<!-- =========================================================================
     MAIN RENDER
     ========================================================================= -->
<div class="flex flex-col gap-2">

  <!-- -----------------------------------------------------------------------
       ONE ROW PER ACTIVE LANGUAGE
       ----------------------------------------------------------------------- -->
  {#each activeLanguages as code (code)}
    {@const displayName  = getContentLangDisplayName(code)}
    {@const countryCode  = getContentLangCountryCode(code)}
    {@const isMandatory  = code === 'en'}
    {@const currentValue = value[code] ?? ''}


    <div class="flex flex-col gap-1">

      <!-- Language label row (flag + name + remove button) -->
      <div class="flex items-center gap-1.5">
        <span class="text-sm leading-none shrink-0" aria-hidden="true">
          {flagEmoji(countryCode)}
        </span>
        <span
          class="text-[10px] font-semibold uppercase tracking-wider text-text-muted shrink-0"
          title={displayName}
        >{displayName}</span>
        {#if isMandatory}
          <span class="text-[9px] font-normal normal-case text-text-muted/60 shrink-0">
            ({ui('editor.lang.required_hint', lang)})
          </span>
        {:else}
          <!-- Remove button right after language name -->
          <button
            type="button"
            class="text-[10px] text-text-muted/60 hover:text-red-500 hover:bg-red-500/10
                   dark:hover:text-red-400 dark:hover:bg-red-500/15
                   transition-colors rounded px-1 py-0.5
                   flex items-center gap-0.5 shrink-0"
            onclick={() => removeLanguage(code)}
            title={ui('editor.lang.remove_translation', lang).replace('{lang}', displayName)}
            aria-label={ui('editor.lang.remove_translation', lang).replace('{lang}', displayName)}
          >
            <span aria-hidden="true">&times;</span>
            {ui('common.remove', lang)}
          </button>
        {/if}
      </div>

      <!-- ----------------------------------------------------------------- -->
      <!-- INPUT / TEXTAREA / PREVIEW                                          -->
      <!-- ----------------------------------------------------------------- -->
      {#if mode === 'input'}
        <input
          id={makeId(code)}
          type="text"
          class="input text-sm {inputClass}"
          value={currentValue}
          placeholder={isMandatory ? placeholder : (extraPlaceholder || placeholder)}
          oninput={(e) => setTranslation(code, (e.currentTarget as HTMLInputElement).value)}
        />

      {:else}
        <!-- Edit mode: resizable textarea -->
        <textarea
          id={makeId(code)}
          class="input min-h-[6rem] text-sm resize-y font-sans {inputClass}"
          value={currentValue}
          placeholder={isMandatory ? placeholder : (extraPlaceholder || placeholder)}
          oninput={(e) => setTranslation(code, (e.currentTarget as HTMLTextAreaElement).value)}
          spellcheck="true"
        ></textarea>
      {/if}

    </div>
  {/each}

  <!-- -----------------------------------------------------------------------
       ADD TRANSLATION SELECTOR
       ----------------------------------------------------------------------- -->
  <div class="flex items-center gap-2 mt-1">
    <!--
      Using a <select> for the add action keeps the UX simple and accessible.
      The select resets to '' after each selection via addSelectValue = ''.
    -->
    <select
      class="input text-xs py-1 w-auto text-text-muted"
      value={addSelectValue}
      onchange={handleAddSelectChange}
      aria-label={ui('editor.lang.add_translation', lang)}
    >
      <!-- Placeholder / default option -->
      <option value="" disabled>
        {ui('editor.lang.add_translation', lang)}
      </option>

      <!-- Available languages not yet in the field -->
      {#each addableCodes as code (code)}
        <option value={code}>
          {flagEmoji(getContentLangCountryCode(code))} {getContentLangDisplayName(code)}
        </option>
      {/each}

      <!-- Visual separator (non-interactive) -->
      <option disabled>──────────────</option>

      <!-- Open NewLanguageModal for completely unlisted languages -->
      <option value="__new__">
        {ui('editor.lang.new_language_option', lang)}
      </option>
    </select>
  </div>

  <!-- Warning when the mandatory English translation is empty -->
  {#if (value['en'] ?? '').trim() === ''}
    <p class="text-[10px] text-amber-400/80 flex items-center gap-1">
      <span aria-hidden="true">&#x26A0;</span>
      {ui('editor.lang.english_required_hint', lang)}
    </p>
  {/if}

</div>
