<!--
  @file src/lib/components/content-editor/FormulaBuilderInput.svelte
  @description Compound text input for fields that accept plain numbers or formula strings.

  ────────────────────────────────────────────────────────────────────────────
  OVERVIEW
  ────────────────────────────────────────────────────────────────────────────
  Used wherever a Modifier or resource field accepts a numeric literal, a dice
  expression, a `@`-path, or arithmetic combining several of these:

    Examples of valid values:
      "5"                                → plain number
      "1d6"                              → dice expression (passed to Dice Engine)
      "2d8+3"                            → dice + constant
      "@attributes.stat_strength.derivedModifier"     → @-path (resolved by Math Parser)
      "@classLevels.class_fighter"       → @-path with dynamic suffix
      "@attributes.stat_strength.derivedModifier + 2" → @-path + arithmetic
      "1d4+@classLevels.class_rogue"     → dice + @-path

  Three consumer sites (Phase 21.3):
    • ModifierListEditor — `Modifier.value` field
    • ActivationEditor   — `resourceCost.cost` field
    • ResourcePoolEditor — `rechargeAmount` / `maxPipelineId` fields

  ────────────────────────────────────────────────────────────────────────────
  COMPONENTS
  ────────────────────────────────────────────────────────────────────────────
  1.  PLAIN TEXT INPUT with right-side decorations:
        [formula text…]      [validation icon]  [×]  [?]

  2.  VALIDATION INDICATOR (debounced 150 ms):
        ✓ green  — plain number, dice expression, or exact/template @-path
        ⚠ amber  — partial @-path (e.g. "@classLevels." needs a class ID suffix)
        ✗ red    — string starting with @ that matches no known path/template
        (none)   — empty value

      WHY DEBOUNCE 150 ms?
        The GM types quickly. Re-validating on every keystroke would flash the
        indicator incessantly. 150 ms is enough to avoid perceivable lag while
        still giving near-instant feedback when the GM pauses.

  3.  FORMULA ASSISTANT (collapsible <details> below the input):
        Shows all known @-paths grouped by category. Clicking one calls
        `input.setRangeText()` to insert it at the current cursor position.
        After insertion the input regains focus with the cursor placed after
        the inserted text. The panel stays open so the GM can insert multiple
        paths without re-opening.

        Groups (per ARCHITECTURE.md §4.3):
          • Ability Scores
          • Combat Statistics
          • Saving Throws
          • Skills
          • Class Levels
          • Constants & Special

  4.  "×" CLEAR BUTTON — sets value to "".

  5.  DICE NOTATION HELP — a small "?" button that toggles a popover with
        examples:  1d6  ·  2d8+3  ·  1d4+@attr  ·  @classLevels.class_fighter

  ────────────────────────────────────────────────────────────────────────────
  VALIDATION ALGORITHM
  ────────────────────────────────────────────────────────────────────────────
  1. Empty → no indicator.
  2. Pure number (`-?\d+(\.\d+)?`) → ✓
  3. Pure dice expression (`\d*d\d+([\+\-]\d+)?`) → ✓
  4. Expression with no @ symbol → ✓ (arithmetic/dice combos)
  5. Expression with @ symbol(s):
       a. Extract all `@[\w.]+` tokens.
       b. For each token:
            • Exact match in KNOWN_PATHS set → ✓
            • Matches a template prefix (e.g. starts with "@classLevels.")  → ✓
            • Is a proper prefix of known paths (e.g. "@classLevels." is a
              prefix of "@classLevels.*") → ⚠ partial
            • Otherwise → ✗ invalid (sets overall result to ✗)

  ────────────────────────────────────────────────────────────────────────────
  NO TOKEN COLOURING
  ────────────────────────────────────────────────────────────────────────────
  See ARCHITECTURE.md §21.8 for the full rationale. In summary: overlaying a
  styled <div> over a <input> to achieve inline token colouring requires pixel-
  perfect font alignment across proportional fonts and IME composition events —
  fragile and not worth the maintenance cost. The validation icon provides the
  same semantic signal.

  ────────────────────────────────────────────────────────────────────────────
  PROPS (Svelte 5 callback pattern)
  ────────────────────────────────────────────────────────────────────────────
  value            — Current value (string | number). Displayed as a string.
  onValueChanged   — Called with the new string value on every user change.
  id?              — id attribute for the <input>. External <label for="..."> uses this.
  placeholder?     — Placeholder text.
  disabled?        — Disables the input and all controls.

  ────────────────────────────────────────────────────────────────────────────
  @see src/lib/utils/mathParser.ts   for @-path resolution at runtime
  @see ARCHITECTURE.md §4.3          for the complete path reference
  @see ARCHITECTURE.md §21.8         for the no-token-colouring rationale
-->

<script lang="ts">
  import { untrack } from 'svelte';
  import { dataLoader } from '$lib/engine/DataLoader';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';
  import { IconSuccess, IconWarning, IconError, IconClose } from '$lib/components/ui/icons';
  import type { LocalizedString } from '$lib/types/i18n';

  // ===========================================================================
  // PROPS
  // ===========================================================================

  interface Props {
    /** Current value — displayed as a string inside the input. */
    value: string | number;
    /** Called with the new raw string value after every change. */
    onValueChanged: (value: string) => void;
    /** Forwarded to the underlying <input> element for external label binding. */
    id?: string;
    /** Placeholder text shown when the input is empty. */
    placeholder?: string;
    /** Disables the input and all controls. */
    disabled?: boolean;
  }

  let {
    value,
    onValueChanged,
    id,
    placeholder,
    disabled = false,
  }: Props = $props();

  // Resolve the effective placeholder: use the caller-supplied value if provided,
  // otherwise fall back to the localised default so it updates with language changes.
  const effectivePlaceholder = $derived(
    placeholder ?? ui('formula.value_placeholder', engine.settings.language)
  );

  // ===========================================================================
  // KNOWN @-PATH CATALOG (Formula Assistant + Validation)
  // ===========================================================================

  interface PathEntry {
    path:  string;   // the full @-path string
    label: string;   // human-readable description
  }

  interface PathGroup {
    key:     string;   // stable identifier — never translated (used for group-specific logic)
    title:   string;
    entries: PathEntry[];
  }

  /**
   * Formula path group catalog.
   *
   * ZERO-HARDCODING RULE (ARCHITECTURE.md §6):
   *   - Group titles use ui() with content_editor.group.* keys.
   *   - Pipeline-name labels use engine.resolvePipelineLabel() (language-aware).
   *   - Field qualifiers use formula.qualifier.* i18n keys.
   *   - Developer hint labels use formula.hint.* i18n keys.
   */
  const PATH_GROUPS = $derived.by((): PathGroup[] => {
    const lang = engine.settings.language;
    const rpl  = (id: string) => engine.resolvePipelineLabel(id);
    const tot  = ui('formula.qualifier.total',    lang);  // '(total)'
    const mod  = ui('formula.qualifier.modifier', lang);  // 'modifier'
    const base = ui('formula.qualifier.base',     lang);  // '(base)'
    return [
      {
        key: 'ability_scores',
        title: ui('content_editor.group.ability_scores', lang),
        entries: [
          { path: '@attributes.stat_strength.totalValue',            label: `${rpl('attributes.stat_strength')} ${tot}` },
          { path: '@attributes.stat_strength.derivedModifier',       label: `${rpl('attributes.stat_strength')} ${mod}` },
          { path: '@attributes.stat_strength.baseValue',             label: `${rpl('attributes.stat_strength')} ${base}` },
          { path: '@attributes.stat_dexterity.totalValue',           label: `${rpl('attributes.stat_dexterity')} ${tot}` },
          { path: '@attributes.stat_dexterity.derivedModifier',      label: `${rpl('attributes.stat_dexterity')} ${mod}` },
          { path: '@attributes.stat_dexterity.baseValue',            label: `${rpl('attributes.stat_dexterity')} ${base}` },
          { path: '@attributes.stat_constitution.totalValue',        label: `${rpl('attributes.stat_constitution')} ${tot}` },
          { path: '@attributes.stat_constitution.derivedModifier',   label: `${rpl('attributes.stat_constitution')} ${mod}` },
          { path: '@attributes.stat_constitution.baseValue',         label: `${rpl('attributes.stat_constitution')} ${base}` },
          { path: '@attributes.stat_intelligence.totalValue',        label: `${rpl('attributes.stat_intelligence')} ${tot}` },
          { path: '@attributes.stat_intelligence.derivedModifier',   label: `${rpl('attributes.stat_intelligence')} ${mod}` },
          { path: '@attributes.stat_intelligence.baseValue',         label: `${rpl('attributes.stat_intelligence')} ${base}` },
          { path: '@attributes.stat_wisdom.totalValue',              label: `${rpl('attributes.stat_wisdom')} ${tot}` },
          { path: '@attributes.stat_wisdom.derivedModifier',         label: `${rpl('attributes.stat_wisdom')} ${mod}` },
          { path: '@attributes.stat_wisdom.baseValue',               label: `${rpl('attributes.stat_wisdom')} ${base}` },
          { path: '@attributes.stat_charisma.totalValue',            label: `${rpl('attributes.stat_charisma')} ${tot}` },
          { path: '@attributes.stat_charisma.derivedModifier',       label: `${rpl('attributes.stat_charisma')} ${mod}` },
          { path: '@attributes.stat_charisma.baseValue',             label: `${rpl('attributes.stat_charisma')} ${base}` },
          { path: '@attributes.stat_size.totalValue',                label: `${rpl('attributes.stat_size')} ${tot}` },
          { path: '@attributes.stat_caster_level.totalValue',        label: rpl('attributes.stat_caster_level') },
          { path: '@attributes.stat_manifester_level.totalValue',    label: rpl('attributes.stat_manifester_level') },
        ],
      },
      {
        key: 'combat_stats',
        title: ui('content_editor.group.combat_stats', lang),
        entries: [
          { path: '@combatStats.base_attack_bonus.totalValue',       label: rpl('combatStats.base_attack_bonus') },
          { path: '@combatStats.ac_normal.totalValue',               label: rpl('combatStats.ac_normal') },
          { path: '@combatStats.ac_touch.totalValue',                label: rpl('combatStats.ac_touch') },
          { path: '@combatStats.ac_flat_footed.totalValue',          label: rpl('combatStats.ac_flat_footed') },
          { path: '@combatStats.initiative.totalValue',              label: rpl('combatStats.initiative') },
          { path: '@combatStats.grapple.totalValue',                 label: rpl('combatStats.grapple') },
          { path: '@combatStats.max_hp.totalValue',                  label: rpl('combatStats.max_hp') },
          { path: '@combatStats.speed_land.totalValue',              label: rpl('combatStats.speed_land') },
          { path: '@combatStats.speed_fly.totalValue',               label: rpl('combatStats.speed_fly') },
          { path: '@combatStats.speed_swim.totalValue',              label: rpl('combatStats.speed_swim') },
          { path: '@combatStats.speed_climb.totalValue',             label: rpl('combatStats.speed_climb') },
          { path: '@combatStats.armor_check_penalty.totalValue',     label: rpl('combatStats.armor_check_penalty') },
          { path: '@combatStats.fortification.totalValue',           label: rpl('combatStats.fortification') },
          { path: '@combatStats.arcane_spell_failure.totalValue',    label: rpl('combatStats.arcane_spell_failure') },
          { path: '@combatStats.max_dexterity_bonus.totalValue',     label: rpl('combatStats.max_dexterity_bonus') },
        ],
      },
      {
        key: 'saves',
        title: ui('content_editor.group.saves', lang),
        entries: [
          { path: '@saves.fortitude.totalValue', label: rpl('saves.fortitude') },
          { path: '@saves.reflex.totalValue',    label: rpl('saves.reflex') },
          { path: '@saves.will.totalValue',      label: rpl('saves.will') },
        ],
      },
      {
        key: 'skills',
        title: ui('content_editor.group.skills', lang),
        entries: [
          { path: '@skills.<id>.ranks',      label: ui('formula.hint.skill_ranks', lang) },
          { path: '@skills.<id>.totalValue', label: ui('formula.hint.skill_total', lang) },
        ],
      },
      {
        key: 'class_levels',
        title: ui('content_editor.group.class_levels', lang),
        entries: [
          { path: '@classLevels.<classId>', label: ui('formula.hint.class_levels', lang) },
          { path: '@characterLevel',        label: ui('formula.hint.character_level', lang) },
          { path: '@eclForXp',              label: ui('formula.hint.ecl_for_xp', lang) },
        ],
      },
      {
        key: 'constants',
        title: ui('content_editor.group.constants', lang),
        entries: [
          // @constant.<id> is in ARCHITECTURE.md §4.3 as a named numeric constant
          // from config tables (e.g. XP thresholds, point-buy costs). The GM types
          // the constant ID after clicking. The TEMPLATE_PREFIXES entry ensures that
          // "@constant.some_name" validates as 'valid' even though the full path is
          // not in KNOWN_PATHS_SET.
          { path: '@constant.<id>',                label: ui('formula.hint.constant', lang) },
          { path: '@selection.<choiceId>',         label: ui('formula.hint.selection', lang) },
          { path: '@activeTags',                   label: ui('formula.hint.active_tags', lang) },
          { path: '@equippedWeaponTags',           label: ui('formula.hint.weapon_tags', lang) },
          { path: '@targetTags',                   label: ui('formula.hint.target_tags', lang) },
          { path: '@master.classLevels.<classId>', label: ui('formula.hint.master_class_levels', lang) },
        ],
      },
    ];
  });

  /**
   * Flat set of exact known @-paths (for O(1) lookup in validation).
   * Declared as $derived because PATH_GROUPS is now $derived (language-reactive).
   * The path values themselves never change, so this re-computation is cheap.
   */
  const KNOWN_PATHS_SET = $derived(
    new Set<string>(PATH_GROUPS.flatMap(g => g.entries.map(e => e.path)))
  );

  /**
   * Dynamic-suffix template prefixes.
   * A path that starts with one of these is valid even without an exact match,
   * because the suffix is a user-supplied ID (class ID, skill ID, etc.).
   * E.g. "@classLevels.class_fighter" is valid because it starts with "@classLevels.".
   */
  const TEMPLATE_PREFIXES: string[] = [
    '@classLevels.',
    '@skills.',
    '@selection.',
    '@constant.',
    '@master.classLevels.',
  ];

  // ===========================================================================
  // VALIDATION
  // ===========================================================================

  type ValidationState = 'empty' | 'valid' | 'partial' | 'invalid';

  /** Plain number: optional minus, digits, optional decimal. */
  const RE_NUMBER = /^-?\d+(\.\d+)?$/;

  /**
   * Dice expression: optional count, d, sides, optional +/- modifier.
   * Matches: "1d6", "2d8+3", "d20", "3d4-1"
   * Also matches mixed expressions like "1d4+5" even with trailing text —
   * we check for the dice token anywhere in the string.
   */
  const RE_DICE_TOKEN = /\d*d\d+/;

  /**
   * Extract all @-path tokens from a formula string.
   * Matches @word.word.word (variable length dot-paths).
   */
  const RE_AT_PATH = /@[\w.]+/g;

  function validateFormula(raw: string): ValidationState {
    const val = raw.trim();
    if (!val) return 'empty';

    // Pure number
    if (RE_NUMBER.test(val)) return 'valid';

    // Contains no @-paths — treat as arithmetic / dice combo (valid)
    if (!val.includes('@')) return 'valid';

    // Contains @-path tokens — validate each one
    const tokens = val.match(RE_AT_PATH) ?? [];
    let hasPartial = false;

    for (const token of tokens) {
      // Exact known path
      if (KNOWN_PATHS_SET.has(token)) continue;

      // Template prefix match (e.g. "@classLevels.class_fighter").
      // Requires the token to have a non-empty suffix beyond the prefix itself —
      // "@classLevels." alone (empty suffix) should fall through to the partial
      // check below, not be marked valid before the GM has typed the class ID.
      if (TEMPLATE_PREFIXES.some(prefix => token.startsWith(prefix) && token.length > prefix.length)) continue;

      // Is this a partial prefix? (e.g. "@classLevels." which is a prefix of valid paths)
      const isPartialPrefix = TEMPLATE_PREFIXES.some(p => p.startsWith(token + '.') || p === token);
      const isPartialKnown  = [...KNOWN_PATHS_SET].some(known => known.startsWith(token + '.'));
      if (isPartialPrefix || isPartialKnown) {
        hasPartial = true;
        continue;
      }

      // Unrecognised @-path token → invalid
      return 'invalid';
    }

    return hasPartial ? 'partial' : 'valid';
  }

  // ===========================================================================
  // REACTIVE STATE
  // ===========================================================================

  /** Current text in the input (string representation of `value` prop).
   *  Read once at mount via `untrack` — the live sync is handled by the $effect below. */
  let currentText = $state(untrack(() => String(value ?? '')));

  /** Debounced validation state — updated 150 ms after input stops. */
  let validationState = $state<ValidationState>('empty');

  /** Sync `currentText` when the `value` prop changes from outside. */
  $effect(() => {
    const incoming = String(value ?? '');
    if (incoming !== currentText) {
      currentText    = incoming;
      validationState = validateFormula(incoming);
    }
  });

  /** Debounced validation: evaluate 150 ms after the GM stops typing. */
  $effect(() => {
    const text = currentText;
    const timer = setTimeout(() => {
      validationState = validateFormula(text);
    }, 150);
    return () => clearTimeout(timer);
  });

  // ===========================================================================
  // INPUT ELEMENT REF (for setRangeText insertion)
  // ===========================================================================

  let inputEl = $state<HTMLInputElement | null>(null);

  // ===========================================================================
  // FORMULA ASSISTANT OPEN STATE
  // ===========================================================================

  /**
   * Whether the Formula Assistant panel is open.
   * Toggled by clicking "[▼ Formula Assistant]".
   */
  let assistantOpen = $state(false);

  // ===========================================================================
  // DICE NOTATION HELP POPOVER
  // ===========================================================================

  let diceHelpOpen = $state(false);

  // ===========================================================================
  // HANDLERS
  // ===========================================================================

  function handleInput(e: Event): void {
    currentText = (e.currentTarget as HTMLInputElement).value;
    onValueChanged(currentText);
  }

  function handleClear(): void {
    currentText = '';
    onValueChanged('');
    validationState = 'empty';
    inputEl?.focus();
  }

  /**
   * Inserts `path` into the input at the current cursor position.
   * Uses `setRangeText` for precise cursor-aware insertion.
   * After insertion the cursor is placed immediately after the inserted text.
   *
   * TEMPLATE PATHS: paths containing "<id>" or "<classId>" are inserted as-is
   * so the GM can see the placeholder and immediately replace it by typing.
   */
  function insertPath(path: string): void {
    if (!inputEl || disabled) return;

    const start = inputEl.selectionStart ?? inputEl.value.length;
    const end   = inputEl.selectionEnd   ?? inputEl.value.length;

    // If there's already text and the character before the insertion point
    // isn't a space or operator, add a space separator.
    const before = inputEl.value.slice(0, start);
    const needsSpace = before.length > 0 && !/[\s\+\-\*\/\(]$/.test(before);
    const insert = needsSpace ? ' ' + path : path;

    inputEl.setRangeText(insert, start, end, 'end');

    // Sync reactive state with the new DOM value.
    currentText = inputEl.value;
    onValueChanged(currentText);

    // Return focus to the input so the GM can continue typing.
    inputEl.focus();
  }

  // ===========================================================================
  // VALIDATION ICON / COLOUR HELPERS
  // ===========================================================================

  const validationColor = $derived.by((): string => {
    if (validationState === 'valid')   return 'text-green-400';
    if (validationState === 'partial') return 'text-amber-400';
    if (validationState === 'invalid') return 'text-red-400';
    return '';
  });

  const validationTitle = $derived.by((): string => {
    const lang = engine.settings.language;
    if (validationState === 'valid')   return ui('formula.validation.valid',   lang);
    if (validationState === 'partial') return ui('formula.validation.partial', lang);
    if (validationState === 'invalid') return ui('formula.validation.invalid', lang);
    return '';
  });

  // ===========================================================================
  // SKILL PATHS (dynamic — populated from DataLoader)
  // ===========================================================================

  interface SkillDef { id: string; label?: { en?: string; fr?: string; [lang: string]: string | undefined } }

  /**
   * Dynamic skill entries from the DataLoader config table.
   * These appear in the Skills group of the Formula Assistant in addition to
   * the generic template entries.
   */
  const dynamicSkillEntries = $derived.by((): PathEntry[] => {
    const table = dataLoader.getConfigTable('config_skill_definitions');
    if (!table?.data) return [];
    const raw = table.data as unknown as Record<string, SkillDef>;
    const ranksSuffix = ui('formula.skill_ranks_suffix', engine.settings.language);
    return Object.values(raw)
      .map(def => ({
        path:  `@skills.${def.id}.ranks`,
        label: `${def.label ? engine.t(def.label as LocalizedString) : def.id}${ranksSuffix}`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  });
</script>

<!--
  OUTER WRAPPER — `relative` so the dice-help popover can be absolutely
  positioned relative to the compound input group.
-->
<div class="flex flex-col gap-1">

  <!-- ====================================================================== -->
  <!-- INPUT ROW                                                               -->
  <!-- ====================================================================== -->
  <div class="relative flex items-center">

    <!-- Main text input — plain, unstyled text (no token colouring) -->
    <input
      bind:this={inputEl}
      {id}
      type="text"
      class="input flex-1 pr-20 font-mono text-sm"
      value={currentText}
      placeholder={effectivePlaceholder}
      {disabled}
      oninput={handleInput}
      autocomplete="off"
      spellcheck="false"
    />

    <!-- Right-side decorations (validation icon, clear, dice help) -->
    <div class="absolute right-1 flex items-center gap-0.5">

      <!-- Validation indicator (debounced 150 ms) — uses Lucide icons per Phase 19.3 -->
      {#if validationState !== 'empty'}
        <span
          class="flex items-center justify-center {validationColor} w-5 select-none"
          title={validationTitle}
          aria-live="polite"
          aria-label={validationTitle}
        >
          {#if validationState === 'valid'}
            <IconSuccess size={14} aria-hidden="true" />
          {:else if validationState === 'partial'}
            <IconWarning size={14} aria-hidden="true" />
          {:else if validationState === 'invalid'}
            <IconError size={14} aria-hidden="true" />
          {/if}
        </span>
      {/if}

          <!-- Clear button — uses IconClose per Phase 19.3 (no raw Unicode characters) -->
      {#if currentText && !disabled}
        <button
          type="button"
          class="btn-ghost btn-icon h-6 w-6 p-0 text-text-muted hover:text-text-primary"
          onclick={handleClear}
          title={ui('formula.clear_title', engine.settings.language)}
          aria-label={ui('formula.clear_aria', engine.settings.language)}
        >
          <IconClose size={12} aria-hidden="true" />
        </button>
      {/if}

      <!-- ? Dice notation help -->
      <div class="relative">
        <button
          type="button"
          class="btn-ghost btn-icon h-6 w-6 p-0 text-text-muted hover:text-text-primary
                 text-xs font-semibold leading-none"
          onclick={() => (diceHelpOpen = !diceHelpOpen)}
          aria-label={ui('formula.dice_help_aria', engine.settings.language)}
          title={ui('formula.dice_help_aria', engine.settings.language)}
        >
          ?
        </button>

        <!-- Dice help popover -->
        {#if diceHelpOpen}
          <div
            class="absolute right-0 top-full mt-1 z-20 w-56 rounded-lg border border-border
                   bg-surface shadow-xl p-3 text-xs"
            role="tooltip"
          >
            <p class="font-semibold text-text-primary mb-2">{ui('formula.dice_examples_title', engine.settings.language)}</p>
             <ul class="space-y-1 text-text-secondary font-mono">
               <li><code>5</code> {ui('formula.dice_ex_num', engine.settings.language)}</li>
               <li><code>1d6</code> {ui('formula.dice_ex_1d6', engine.settings.language)}</li>
               <li><code>2d8+3</code> {ui('formula.dice_ex_2d8', engine.settings.language)}</li>
               <li><code>1d4+@attributes.stat_strength.derivedModifier</code></li>
               <li><code>@classLevels.class_fighter</code></li>
               <li><code>@characterLevel * 2</code></li>
             </ul>
            <button
              type="button"
              class="mt-2 text-[10px] text-text-muted underline"
              onclick={() => (diceHelpOpen = false)}
            >
              {ui('common.close', engine.settings.language)}
            </button>
          </div>
        {/if}
      </div>
    </div>
  </div>

  <!-- ====================================================================== -->
  <!-- FORMULA ASSISTANT PANEL                                                  -->
  <!-- ====================================================================== -->

  <details class="group/assistant" bind:open={assistantOpen}>
    <summary
      class="cursor-pointer text-[11px] text-text-muted hover:text-text-secondary
             select-none list-none flex items-center gap-1 w-fit py-0.5"
    >
      <svg
        class="h-3 w-3 transition-transform group-open/assistant:rotate-90"
        xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
      >
        <polyline points="9 18 15 12 9 6"/>
      </svg>
      {ui('formula.assistant_title', engine.settings.language)}
    </summary>

    <!--
      Assistant body — scrollable grid of path groups.
      Groups are shown as collapsible <details> so the GM can focus on one
      category at a time.
    -->
    <div class="mt-1 rounded-lg border border-border bg-surface-alt overflow-hidden">

      {#each PATH_GROUPS as group (group.key)}
        <details class="group/pathgroup border-b border-border last:border-b-0">
          <summary
            class="flex items-center justify-between px-3 py-1.5 cursor-pointer
                   text-[11px] font-semibold text-text-muted hover:text-text-primary
                   hover:bg-surface select-none list-none"
          >
            {group.title}
            <svg
              class="h-3 w-3 transition-transform group-open/pathgroup:rotate-180"
              xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
            >
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </summary>

          <div class="px-3 py-1.5 flex flex-col gap-0.5">
            {#each group.entries as entry (entry.path)}
              <button
                type="button"
                class="flex items-center gap-2 w-full text-left rounded px-2 py-1
                       hover:bg-accent/10 transition-colors group/pathrow"
                onclick={() => insertPath(entry.path)}
                 title={ui('formula.insert_title', engine.settings.language).replace('{path}', entry.path)}
               >
               <code
                   class="font-mono text-[10px] text-accent shrink-0
                          group-hover/pathrow:underline underline-offset-2"
                 >
                   {entry.path}
                </code>
                <span class="text-[10px] text-text-muted truncate">
                  {entry.label}
                </span>
              </button>
            {/each}

            <!-- Dynamic skills (only shown in Skills group) -->
            {#if group.key === 'skills' && dynamicSkillEntries.length > 0}
              <div class="mt-1 pt-1 border-t border-border/50">
                <p class="text-[9px] text-text-muted mb-0.5 px-2">{ui('formula.loaded_skills_label', engine.settings.language)}</p>
                {#each dynamicSkillEntries as entry (entry.path)}
                  <button
                    type="button"
                    class="flex items-center gap-2 w-full text-left rounded px-2 py-1
                           hover:bg-accent/10 transition-colors group/pathrow"
                    onclick={() => insertPath(entry.path)}
                     title={ui('formula.insert_title', engine.settings.language).replace('{path}', entry.path)}
                   >
                     <code class="font-mono text-[10px] text-accent shrink-0
                                  group-hover/pathrow:underline underline-offset-2">
                       {entry.path}
                     </code>
                    <span class="text-[10px] text-text-muted truncate">{entry.label}</span>
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        </details>
      {/each}

    </div>
  </details>

</div>
