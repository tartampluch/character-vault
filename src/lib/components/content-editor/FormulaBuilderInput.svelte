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
      "@attributes.stat_str.derivedModifier"     → @-path (resolved by Math Parser)
      "@classLevels.class_fighter"       → @-path with dynamic suffix
      "@attributes.stat_str.derivedModifier + 2" → @-path + arithmetic
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
    placeholder = 'e.g. 5, 1d6, @attributes.stat_str.derivedModifier',
    disabled = false,
  }: Props = $props();

  // ===========================================================================
  // KNOWN @-PATH CATALOG (Formula Assistant + Validation)
  // ===========================================================================

  interface PathEntry {
    path:  string;   // the full @-path string
    label: string;   // human-readable description
  }

  interface PathGroup {
    title:   string;
    entries: PathEntry[];
  }

  const PATH_GROUPS: PathGroup[] = [
    {
      title: 'Ability Scores',
      entries: [
        { path: '@attributes.stat_str.totalValue',       label: 'Strength (total)' },
        { path: '@attributes.stat_str.derivedModifier',  label: 'Strength modifier' },
        { path: '@attributes.stat_str.baseValue',        label: 'Strength (base)' },
        { path: '@attributes.stat_dex.totalValue',       label: 'Dexterity (total)' },
        { path: '@attributes.stat_dex.derivedModifier',  label: 'Dexterity modifier' },
        { path: '@attributes.stat_dex.baseValue',        label: 'Dexterity (base)' },
        { path: '@attributes.stat_con.totalValue',       label: 'Constitution (total)' },
        { path: '@attributes.stat_con.derivedModifier',  label: 'Constitution modifier' },
        { path: '@attributes.stat_con.baseValue',        label: 'Constitution (base)' },
        { path: '@attributes.stat_int.totalValue',       label: 'Intelligence (total)' },
        { path: '@attributes.stat_int.derivedModifier',  label: 'Intelligence modifier' },
        { path: '@attributes.stat_int.baseValue',        label: 'Intelligence (base)' },
        { path: '@attributes.stat_wis.totalValue',       label: 'Wisdom (total)' },
        { path: '@attributes.stat_wis.derivedModifier',  label: 'Wisdom modifier' },
        { path: '@attributes.stat_wis.baseValue',        label: 'Wisdom (base)' },
        { path: '@attributes.stat_cha.totalValue',       label: 'Charisma (total)' },
        { path: '@attributes.stat_cha.derivedModifier',  label: 'Charisma modifier' },
        { path: '@attributes.stat_cha.baseValue',        label: 'Charisma (base)' },
        { path: '@attributes.stat_size.totalValue',      label: 'Size modifier' },
        { path: '@attributes.stat_caster_level.totalValue',     label: 'Caster Level' },
        { path: '@attributes.stat_manifester_level.totalValue', label: 'Manifester Level' },
      ],
    },
    {
      title: 'Combat Statistics',
      entries: [
        { path: '@combatStats.bab.totalValue',                  label: 'Base Attack Bonus' },
        { path: '@combatStats.ac_normal.totalValue',            label: 'Armor Class (Normal)' },
        { path: '@combatStats.ac_touch.totalValue',             label: 'Touch AC' },
        { path: '@combatStats.ac_flat_footed.totalValue',       label: 'Flat-Footed AC' },
        { path: '@combatStats.init.totalValue',                 label: 'Initiative' },
        { path: '@combatStats.grapple.totalValue',              label: 'Grapple' },
        { path: '@combatStats.max_hp.totalValue',               label: 'Max Hit Points' },
        { path: '@combatStats.speed_land.totalValue',           label: 'Land Speed (ft.)' },
        { path: '@combatStats.speed_fly.totalValue',            label: 'Fly Speed (ft.)' },
        { path: '@combatStats.speed_swim.totalValue',           label: 'Swim Speed (ft.)' },
        { path: '@combatStats.speed_climb.totalValue',          label: 'Climb Speed (ft.)' },
        { path: '@combatStats.armor_check_penalty.totalValue',  label: 'Armor Check Penalty' },
        { path: '@combatStats.fortification.totalValue',        label: 'Fortification (%)' },
        { path: '@combatStats.arcane_spell_failure.totalValue', label: 'Arcane Spell Failure (%)' },
        { path: '@combatStats.max_dex_bonus.totalValue',        label: 'Max DEX Bonus to AC' },
      ],
    },
    {
      title: 'Saving Throws',
      entries: [
        { path: '@saves.fort.totalValue', label: 'Fortitude Save' },
        { path: '@saves.ref.totalValue',  label: 'Reflex Save' },
        { path: '@saves.will.totalValue', label: 'Will Save' },
      ],
    },
    {
      title: 'Skills',
      entries: [
        { path: '@skills.<id>.ranks',      label: '<skill>.ranks  — type skill ID after click' },
        { path: '@skills.<id>.totalValue', label: '<skill>.totalValue  — type skill ID after click' },
      ],
    },
    {
      title: 'Class Levels',
      entries: [
        { path: '@classLevels.<classId>', label: 'Levels in a class  — type class ID after click' },
        { path: '@characterLevel',        label: 'Total character level (all classes)' },
        { path: '@eclForXp',              label: 'ECL for XP table (characterLevel + LA)' },
      ],
    },
    {
      title: 'Constants & Special',
      entries: [
        { path: '@selection.<choiceId>',  label: 'Player\'s selection on parent feature' },
        { path: '@activeTags',            label: 'All active feature tags (array)' },
        { path: '@equippedWeaponTags',    label: 'Equipped weapon tags (array)' },
        { path: '@targetTags',            label: 'Target creature tags (roll-time only)' },
        { path: '@master.classLevels.<classId>', label: 'Master\'s class level (LinkedEntity)' },
      ],
    },
  ];

  /** Flat set of exact known @-paths (for O(1) lookup in validation). */
  const KNOWN_PATHS_SET = new Set<string>(
    PATH_GROUPS.flatMap(g => g.entries.map(e => e.path))
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

      // Template prefix match (e.g. "@classLevels.class_fighter")
      if (TEMPLATE_PREFIXES.some(prefix => token.startsWith(prefix))) continue;

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

  const validationIcon = $derived.by((): string => {
    if (validationState === 'valid')   return '✓';
    if (validationState === 'partial') return '⚠';
    if (validationState === 'invalid') return '✗';
    return '';
  });

  const validationColor = $derived.by((): string => {
    if (validationState === 'valid')   return 'text-green-400';
    if (validationState === 'partial') return 'text-amber-400';
    if (validationState === 'invalid') return 'text-red-400';
    return '';
  });

  const validationTitle = $derived.by((): string => {
    if (validationState === 'valid')   return 'Valid formula or @-path';
    if (validationState === 'partial') return 'Partial @-path — add a suffix (e.g. class ID or skill ID)';
    if (validationState === 'invalid') return 'Unrecognised @-path — check the Formula Assistant for valid paths';
    return '';
  });

  // ===========================================================================
  // SKILL PATHS (dynamic — populated from DataLoader)
  // ===========================================================================

  interface SkillDef { id: string; label?: { en?: string } }

  /**
   * Dynamic skill entries from the DataLoader config table.
   * These appear in the Skills group of the Formula Assistant in addition to
   * the generic template entries.
   */
  const dynamicSkillEntries = $derived.by((): PathEntry[] => {
    const table = dataLoader.getConfigTable('config_skill_definitions');
    if (!table?.data) return [];
    const raw = table.data as unknown as Record<string, SkillDef>;
    return Object.values(raw)
      .map(def => ({
        path:  `@skills.${def.id}.ranks`,
        label: `${def.label?.en ?? def.id} — ranks`,
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
      {placeholder}
      {disabled}
      oninput={handleInput}
      autocomplete="off"
      spellcheck="false"
    />

    <!-- Right-side decorations (validation icon, clear, dice help) -->
    <div class="absolute right-1 flex items-center gap-0.5">

      <!-- Validation indicator (debounced 150 ms) -->
      {#if validationState !== 'empty'}
        <span
          class="text-sm font-bold {validationColor} w-5 text-center select-none"
          title={validationTitle}
          aria-live="polite"
          aria-label={validationTitle}
        >
          {validationIcon}
        </span>
      {/if}

      <!-- × Clear button -->
      {#if currentText && !disabled}
        <button
          type="button"
          class="btn-ghost btn-icon h-6 w-6 p-0 text-text-muted hover:text-text-primary
                 text-xs leading-none"
          onclick={handleClear}
          title="Clear value"
          aria-label="Clear formula input"
        >
          ×
        </button>
      {/if}

      <!-- ? Dice notation help -->
      <div class="relative">
        <button
          type="button"
          class="btn-ghost btn-icon h-6 w-6 p-0 text-text-muted hover:text-text-primary
                 text-xs font-semibold leading-none"
          onclick={() => (diceHelpOpen = !diceHelpOpen)}
          aria-label="Dice notation help"
          title="Dice notation help"
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
            <p class="font-semibold text-text-primary mb-2">Dice notation examples</p>
            <ul class="space-y-1 text-text-secondary font-mono">
              <li><code>5</code> — plain number</li>
              <li><code>1d6</code> — roll 1 six-sided die</li>
              <li><code>2d8+3</code> — roll 2d8, add 3</li>
              <li><code>1d4+@attributes.stat_str.derivedModifier</code></li>
              <li><code>@classLevels.class_fighter</code></li>
              <li><code>@characterLevel * 2</code></li>
            </ul>
            <button
              type="button"
              class="mt-2 text-[10px] text-text-muted underline"
              onclick={() => (diceHelpOpen = false)}
            >
              Close
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
      Formula Assistant
    </summary>

    <!--
      Assistant body — scrollable grid of path groups.
      Groups are shown as collapsible <details> so the GM can focus on one
      category at a time.
    -->
    <div class="mt-1 rounded-lg border border-border bg-surface-alt overflow-hidden">

      {#each PATH_GROUPS as group (group.title)}
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
                title="Insert: {entry.path}"
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
            {#if group.title === 'Skills' && dynamicSkillEntries.length > 0}
              <div class="mt-1 pt-1 border-t border-border/50">
                <p class="text-[9px] text-text-muted mb-0.5 px-2">Loaded skills:</p>
                {#each dynamicSkillEntries as entry (entry.path)}
                  <button
                    type="button"
                    class="flex items-center gap-2 w-full text-left rounded px-2 py-1
                           hover:bg-accent/10 transition-colors group/pathrow"
                    onclick={() => insertPath(entry.path)}
                    title="Insert: {entry.path}"
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
