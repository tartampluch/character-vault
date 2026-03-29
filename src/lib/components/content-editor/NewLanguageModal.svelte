<!--
  @file src/lib/components/content-editor/NewLanguageModal.svelte
  @description Modal for adding a brand-new language to the content editor.

  ────────────────────────────────────────────────────────────────────────────
  PURPOSE
  ────────────────────────────────────────────────────────────────────────────
  When a GM wants to add a translation in a language not yet present in any
  loaded rule file or server locale, this modal lets them either:

    1. QUICK-SELECT from the premade list of ~25 common languages (with flags
       and native names from src/lib/data/content-languages.json).
       Clicking a premade entry auto-fills the custom form fields for review.
       Double-clicking or using the "Add <name>" button confirms immediately.

    2. ENTER CUSTOM data for a language not in the premade list:
       - code:        2–3-character ISO 639-1 code (e.g. "de", "es", "tlh")
       - nativeName:  The language's own name in its own script (e.g. "Deutsch")
       - countryCode: ISO 3166-1 alpha-2 code for the flag icon (e.g. "de")

  On confirm, calls `onLanguageConfirmed` with the language metadata.
  The caller (LocalizedStringEditor) adds the code to the LocalizedString field
  and registers the language with the formatter via registerLangUnitSystem().

  ────────────────────────────────────────────────────────────────────────────
  EXCLUDED LANGUAGES
  ────────────────────────────────────────────────────────────────────────────
  `excludeCodes` contains language codes already in the field — filtered out
  of the premade list to prevent duplicate additions.
  English ('en') is always excluded (mandatory base language).

  ────────────────────────────────────────────────────────────────────────────
  @see src/lib/utils/contentLanguages.ts    for KnownContentLanguage type
  @see LocalizedStringEditor.svelte         for the calling context
-->

<script lang="ts">
  import { engine }                          from '$lib/engine/GameEngine.svelte';
  import { ui }                              from '$lib/i18n/ui-strings';
  import Modal                               from '$lib/components/ui/Modal.svelte';
  import {
    KNOWN_CONTENT_LANGUAGES,
    getContentLangUnitSystem,
    type KnownContentLanguage,
  }                                          from '$lib/utils/contentLanguages';

  // ===========================================================================
  // PROPS
  // ===========================================================================

  interface Props {
    /**
     * Language codes already present in the LocalizedString being edited.
     * These are filtered out of the premade list to prevent duplicates.
     * 'en' is always excluded regardless.
     */
    excludeCodes?: string[];
    /**
     * Called when the GM confirms adding a language.
     * @param lang The selected/entered language metadata.
     */
    onLanguageConfirmed: (lang: KnownContentLanguage) => void;
    /** Called when the modal is dismissed without confirming. */
    onclose: () => void;
  }

  let { excludeCodes = [], onLanguageConfirmed, onclose }: Props = $props();

  const lang = $derived(engine.settings.language);

  // ===========================================================================
  // FILTERED PREMADE LIST
  // ===========================================================================

  /**
   * Premade languages with already-present codes excluded.
   * English is always excluded — it is the mandatory base language.
   */
  const filteredPremade = $derived(
    KNOWN_CONTENT_LANGUAGES.filter(
      l => l.code !== 'en' && !excludeCodes.includes(l.code)
    )
  );

  // ===========================================================================
  // SELECTED PREMADE ENTRY (highlights the clicked row)
  // ===========================================================================

  let selectedPremade = $state<KnownContentLanguage | null>(null);

  // ===========================================================================
  // CUSTOM FORM STATE
  // ===========================================================================

  let customCode        = $state('');
  let customNativeName  = $state('');
  let customCountryCode = $state('');

  /**
   * Validation error message for the language code field.
   * Empty string means no error (valid or untouched).
   *
   * ACCEPTS two BCP-47 formats (all-lowercase hyphenated):
   *   - Base language only:    "de", "fr", "es"   (2–3 letters)
   *   - Regional variant:      "en-gb", "fr-be", "pt-br"  (xx-yy or xx-yyy)
   */
  const codeError = $derived.by(() => {
    const c = customCode.trim().toLowerCase();
    if (c.length === 0) return '';
    // BCP-47: 2-3 letter language tag, optionally followed by a hyphen +
    // 2-3 letter region/script subtag (e.g. "en-gb", "zh-tw", "pt-br").
    if (!/^[a-z]{2,3}(-[a-z]{2,3})?$/.test(c)) {
      return ui('editor.lang.code_invalid_error', lang);
    }
    if (['en', ...excludeCodes.map(x => x.toLowerCase())].includes(c)) {
      return ui('editor.lang.code_duplicate_error', lang).replace('{code}', c);
    }
    return '';
  });

  /**
   * True when the custom form has all required fields and no validation errors.
   */
  const canConfirmCustom = $derived(
    customCode.trim().length >= 2 &&
    customNativeName.trim().length > 0 &&
    codeError === ''
  );

  // ===========================================================================
  // ACTIONS
  // ===========================================================================

  /**
   * Selects a premade language — auto-fills the custom form for review.
   * The user can then click "Add <name>" to confirm or tweak the fields.
   */
  function selectPremade(entry: KnownContentLanguage): void {
    selectedPremade     = entry;
    customCode          = entry.code;
    customNativeName    = entry.nativeName;
    customCountryCode   = entry.countryCode;
  }

  /**
   * Confirms a premade language directly without going through the custom form.
   */
  function confirmPremade(entry: KnownContentLanguage): void {
    onLanguageConfirmed(entry);
  }

  /** Confirms the custom-form language. */
  function confirmCustom(): void {
    if (!canConfirmCustom) return;
    // Normalise to lowercase BCP-47: "EN-GB" → "en-gb", "FR" → "fr".
    const code       = customCode.trim().toLowerCase();
    const nativeName = customNativeName.trim();
    // Country code: use the region part of a regional code (e.g. "en-gb" → "gb"),
    // or the explicit field value, or fall back to the language code itself.
    const hyphenIdx  = code.indexOf('-');
    const autoCtry   = hyphenIdx > 0 ? code.slice(hyphenIdx + 1) : code;
    const ctryCode   = customCountryCode.trim().toLowerCase() || autoCtry;
    // Determine metric vs imperial: check premade list for base lang,
    // then fall back to metric (most non-English languages are metric).
    const metric = getContentLangUnitSystem(code) === 'metric';
    onLanguageConfirmed({ code, nativeName, countryCode: ctryCode, metric });
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
</script>

<Modal open={true} onClose={onclose} title={ui('editor.lang.new_language_title', lang)} size="lg">

  <div class="flex flex-col gap-5">

    <!-- ===================================================================== -->
    <!-- PREMADE SECTION                                                        -->
    <!-- ===================================================================== -->
    <section>
      <p class="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
        {ui('editor.lang.premade_section', lang)}
      </p>

      <!-- Scrollable grid of language buttons -->
      <div class="max-h-52 overflow-y-auto rounded border border-border
                  grid grid-cols-2 sm:grid-cols-3 gap-1 p-2 bg-surface-alt">
        {#each filteredPremade as entry (entry.code)}
          <button
            type="button"
            class="flex items-center gap-2 px-2.5 py-1.5 rounded text-left text-xs
                   transition-colors hover:bg-accent/10
                   {selectedPremade?.code === entry.code
                     ? 'bg-accent/15 border border-accent/50 text-text-primary font-semibold'
                     : 'text-text-secondary border border-transparent'}"
            onclick={() => selectPremade(entry)}
            ondblclick={() => confirmPremade(entry)}
            title={ui('editor.lang.confirm_premade_title', lang).replace('{name}', entry.nativeName)}
          >
            <!-- Flag emoji using Unicode regional indicator symbols -->
            <span class="text-base leading-none shrink-0" aria-hidden="true">
              {flagEmoji(entry.countryCode)}
            </span>
            <span class="truncate">{entry.nativeName}</span>
            <code class="ml-auto shrink-0 text-[9px] text-text-muted font-mono opacity-60">
              {entry.code}
            </code>
          </button>
        {/each}

        {#if filteredPremade.length === 0}
          <p class="col-span-full text-xs text-text-muted italic text-center py-3">
            {ui('editor.lang.all_premade_added', lang)}
          </p>
        {/if}
      </div>

      <!-- Quick-confirm button for the highlighted premade entry -->
      {#if selectedPremade !== null}
        <button
          type="button"
          class="mt-2 w-full btn-primary text-sm py-2"
          onclick={() => { if (selectedPremade) confirmPremade(selectedPremade); }}
        >
          {ui('editor.lang.add_premade_btn', lang).replace('{name}', selectedPremade.nativeName)}
        </button>
      {/if}
    </section>

    <!-- Horizontal divider with label -->
    <div class="flex items-center gap-3">
      <div class="h-px flex-1 bg-border"></div>
      <span class="text-[10px] text-text-muted uppercase tracking-wider">
        {ui('editor.lang.custom_section', lang)}
      </span>
      <div class="h-px flex-1 bg-border"></div>
    </div>

    <!-- ===================================================================== -->
    <!-- CUSTOM ENTRY FORM                                                      -->
    <!-- ===================================================================== -->
    <section class="flex flex-col gap-3">
      <p class="text-[11px] text-text-muted">
        {ui('editor.lang.custom_section_hint', lang)}
      </p>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">

        <!-- Language code -->
        <div class="flex flex-col gap-1">
          <label for="nlm-code" class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            {ui('editor.lang.code_label', lang)}
            <span class="text-danger ml-0.5">*</span>
          </label>
          <input
            id="nlm-code"
            type="text"
            class="input font-mono text-sm {codeError ? 'border-danger/60 focus:ring-danger/30' : ''}"
            placeholder={ui('editor.lang.code_placeholder', lang)}
            bind:value={customCode}
            maxlength={3}
            autocomplete="off"
            spellcheck="false"
          />
          <p class="text-[10px] {codeError ? 'text-danger' : 'text-text-muted'}">
            {codeError || ui('editor.lang.code_hint', lang)}
          </p>
        </div>

        <!-- Country code for flag -->
        <div class="flex flex-col gap-1">
          <label for="nlm-country" class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            {ui('editor.lang.flag_code_label', lang)}
            <span class="text-[9px] font-normal normal-case text-text-muted ml-1">
              ({ui('editor.choices.prefix_optional', lang)})
            </span>
          </label>
          <input
            id="nlm-country"
            type="text"
            class="input font-mono text-sm"
            placeholder={ui('editor.lang.flag_placeholder', lang)}
            bind:value={customCountryCode}
            maxlength={2}
            autocomplete="off"
            spellcheck="false"
          />
          <p class="text-[10px] text-text-muted">{ui('editor.lang.flag_code_hint', lang)}</p>
        </div>

        <!-- Native name (spans full width) -->
        <div class="flex flex-col gap-1 sm:col-span-2">
          <label for="nlm-name" class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            {ui('editor.lang.native_name_label', lang)}
            <span class="text-danger ml-0.5">*</span>
          </label>
          <input
            id="nlm-name"
            type="text"
            class="input text-sm"
            placeholder={ui('editor.lang.name_placeholder', lang)}
            bind:value={customNativeName}
            autocomplete="off"
          />
          <p class="text-[10px] text-text-muted">{ui('editor.lang.native_name_hint', lang)}</p>
        </div>
      </div>

      <!-- Confirm button for custom form -->
      <button
        type="button"
        class="btn-primary text-sm py-2 w-full"
        onclick={confirmCustom}
        disabled={!canConfirmCustom}
      >
        {ui('editor.lang.confirm_custom', lang)}
      </button>
    </section>

    <!-- Cancel button -->
    <button
      type="button"
      class="btn-ghost text-sm py-1.5 w-full"
      onclick={onclose}
    >
      {ui('common.cancel', lang)}
    </button>

  </div>
</Modal>
