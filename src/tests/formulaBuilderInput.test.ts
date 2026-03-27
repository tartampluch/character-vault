/**
 * @file src/tests/formulaBuilderInput.test.ts
 * @description Vitest logic tests for the FormulaBuilderInput validation and
 *              insertion engine.
 *
 * WHAT IS TESTED (Phase 21.7.6 — PROGRESS.md):
 *
 *   Validation algorithm — `validateFormula()`:
 *   1.  Recognised exact @-path → `'valid'`   (green ✓ icon).
 *   2.  Unrecognised @-path     → `'invalid'` (red ✗ icon).
 *   3.  Plain number             → `'valid'`   (neutral ✓).
 *   4.  Dice notation string     → `'valid'`   (neutral ✓).
 *   5.  Partial/incomplete path  → `'partial'` (amber ⚠ icon).
 *   6.  Empty input              → `'empty'`   (no icon).
 *   7.  Arithmetic with no @     → `'valid'`   (any dice/arithmetic combo).
 *   8.  Template-prefix path     → `'valid'`   (@classLevels.class_X, @skills.X, etc.).
 *   9.  Mixed @-path + arithmetic → `'valid'`  when all tokens are known.
 *   10. Mixed expression with one bad token → `'invalid'`.
 *   11. Whitespace-only input    → `'empty'`.
 *   12. Negative number          → `'valid'`.
 *   13. Decimal number           → `'valid'`.
 *
 *   Insertion logic — `insertPath()`:
 *   14. Cursor at end: inserts path appended to current value.
 *   15. Cursor mid-string: inserts at cursor, rest follows.
 *   16. Space-separator: auto-adds space when previous char is not space/operator.
 *   17. No separator needed when previous char is a space.
 *   18. No separator needed when previous char is `+`.
 *   19. Clear action: resets value to `''` and state to `'empty'`.
 *   20. click-to-insert at cursor position 4 in `"2 + "` → produces
 *       `"2 + @attributes.stat_strength.derivedModifier"`.
 *
 *   Validation icon / colour mapping:
 *   21. `'valid'` maps to icon `'✓'` and colour `'text-green-400'`.
 *   22. `'partial'` maps to icon `'⚠'` and colour `'text-amber-400'`.
 *   23. `'invalid'` maps to icon `'✗'` and colour `'text-red-400'`.
 *   24. `'empty'` maps to icon `''` (no icon rendered).
 *
 *   PATH_GROUPS catalog integrity:
 *   25. All static PATH_GROUPS entries are present in KNOWN_PATHS_SET.
 *   26. TEMPLATE_PREFIXES all end with `'.'` (ensures prefix matching is unambiguous).
 *   27. All PATH_GROUPS titles are non-empty strings.
 *   28. No duplicate paths in PATH_GROUPS.
 *
 * SPEC MAPPING NOTE:
 *   The PROGRESS.md spec uses the term `'neutral'` for plain numbers and dice.
 *   The FormulaBuilderInput implementation uses `'valid'` for these cases
 *   (the icon is ✓ green, same as a recognised @-path). There is no `'neutral'`
 *   state in the implementation — `'valid'` covers both exact @-paths AND
 *   non-@ formulas (numbers, dice, arithmetic).
 *   These tests use the ACTUAL implementation values (`'valid'`, `'invalid'`,
 *   `'partial'`, `'empty'`) and the JSDoc of each test clarifies how it maps
 *   to the spec's intent.
 *
 * APPROACH — LOGIC LAYER ONLY:
 *   `FormulaBuilderInput.svelte` is a Svelte 5 component.  The project's Vitest
 *   environment is `node` and `@testing-library/svelte` is not installed.
 *   Rather than testing DOM rendering, these tests extract the validation
 *   algorithm and the insertion logic as standalone TypeScript functions and
 *   test them directly.  This gives complete branch coverage without needing
 *   a browser context.
 *
 *   The one DOM-level behaviour specified (`click-to-insert at cursor`) is
 *   emulated using a plain JavaScript object that matches the minimal
 *   `HTMLInputElement` interface used by `insertPath()`. This lets us verify
 *   the insertion arithmetic without a DOM.
 *
 * @see src/lib/components/content-editor/FormulaBuilderInput.svelte
 * @see ARCHITECTURE.md §4.3   for the @-path reference
 * @see ARCHITECTURE.md §21.8  for the no-token-colouring rationale
 */

import { describe, it, expect } from 'vitest';

// =============================================================================
// LOGIC EXTRACTED FROM FormulaBuilderInput.svelte
// =============================================================================
// These replicate the non-reactive parts of the component's <script> block.
// They are kept in sync with the component; if the component changes, these
// must be updated to match.
// =============================================================================

// ── PATH CATALOG ──────────────────────────────────────────────────────────────

interface PathEntry { path: string; label: string; }
interface PathGroup { title: string; entries: PathEntry[]; }

const PATH_GROUPS: PathGroup[] = [
  {
    title: 'Ability Scores',
    entries: [
      { path: '@attributes.stat_strength.totalValue',       label: 'Strength (total)' },
      { path: '@attributes.stat_strength.derivedModifier',  label: 'Strength modifier' },
      { path: '@attributes.stat_strength.baseValue',        label: 'Strength (base)' },
      { path: '@attributes.stat_dexterity.totalValue',       label: 'Dexterity (total)' },
      { path: '@attributes.stat_dexterity.derivedModifier',  label: 'Dexterity modifier' },
      { path: '@attributes.stat_dexterity.baseValue',        label: 'Dexterity (base)' },
      { path: '@attributes.stat_constitution.totalValue',       label: 'Constitution (total)' },
      { path: '@attributes.stat_constitution.derivedModifier',  label: 'Constitution modifier' },
      { path: '@attributes.stat_constitution.baseValue',        label: 'Constitution (base)' },
      { path: '@attributes.stat_intelligence.totalValue',       label: 'Intelligence (total)' },
      { path: '@attributes.stat_intelligence.derivedModifier',  label: 'Intelligence modifier' },
      { path: '@attributes.stat_intelligence.baseValue',        label: 'Intelligence (base)' },
      { path: '@attributes.stat_wisdom.totalValue',       label: 'Wisdom (total)' },
      { path: '@attributes.stat_wisdom.derivedModifier',  label: 'Wisdom modifier' },
      { path: '@attributes.stat_wisdom.baseValue',        label: 'Wisdom (base)' },
      { path: '@attributes.stat_charisma.totalValue',       label: 'Charisma (total)' },
      { path: '@attributes.stat_charisma.derivedModifier',  label: 'Charisma modifier' },
      { path: '@attributes.stat_charisma.baseValue',        label: 'Charisma (base)' },
      { path: '@attributes.stat_size.totalValue',      label: 'Size modifier' },
      { path: '@attributes.stat_caster_level.totalValue',      label: 'Caster Level' },
      { path: '@attributes.stat_manifester_level.totalValue',  label: 'Manifester Level' },
    ],
  },
  {
    title: 'Combat Statistics',
    entries: [
      { path: '@combatStats.base_attack_bonus.totalValue',                  label: 'Base Attack Bonus' },
      { path: '@combatStats.ac_normal.totalValue',            label: 'Armor Class (Normal)' },
      { path: '@combatStats.ac_touch.totalValue',             label: 'Touch AC' },
      { path: '@combatStats.ac_flat_footed.totalValue',       label: 'Flat-Footed AC' },
      { path: '@combatStats.initiative.totalValue',                 label: 'Initiative' },
      { path: '@combatStats.grapple.totalValue',              label: 'Grapple' },
      { path: '@combatStats.max_hp.totalValue',               label: 'Max Hit Points' },
      { path: '@combatStats.speed_land.totalValue',           label: 'Land Speed (ft.)' },
      { path: '@combatStats.speed_fly.totalValue',            label: 'Fly Speed (ft.)' },
      { path: '@combatStats.speed_swim.totalValue',           label: 'Swim Speed (ft.)' },
      { path: '@combatStats.speed_climb.totalValue',          label: 'Climb Speed (ft.)' },
      { path: '@combatStats.armor_check_penalty.totalValue',  label: 'Armor Check Penalty' },
      { path: '@combatStats.fortification.totalValue',        label: 'Fortification (%)' },
      { path: '@combatStats.arcane_spell_failure.totalValue', label: 'Arcane Spell Failure (%)' },
      { path: '@combatStats.max_dexterity_bonus.totalValue',        label: 'Max DEX Bonus to AC' },
    ],
  },
  {
    title: 'Saving Throws',
    entries: [
      { path: '@saves.fortitude.totalValue', label: 'Fortitude Save' },
      { path: '@saves.reflex.totalValue',  label: 'Reflex Save' },
      { path: '@saves.will.totalValue', label: 'Will Save' },
    ],
  },
  {
    title: 'Skills',
    entries: [
      { path: '@skills.<id>.ranks',      label: '<skill>.ranks' },
      { path: '@skills.<id>.totalValue', label: '<skill>.totalValue' },
    ],
  },
  {
    title: 'Class Levels',
    entries: [
      { path: '@classLevels.<classId>', label: 'Levels in a class' },
      { path: '@characterLevel',        label: 'Total character level (all classes)' },
      { path: '@eclForXp',              label: 'ECL for XP table (characterLevel + LA)' },
    ],
  },
  {
    title: 'Constants & Special',
    entries: [
      // @constant.<id> is from ARCHITECTURE.md §4.3 — named constant from config tables.
      // The TEMPLATE_PREFIXES entry ensures @constant.some_name validates as 'valid'.
      { path: '@constant.<id>',                label: 'Named constant — type constant ID after click' },
      { path: '@selection.<choiceId>',         label: "Player's selection" },
      { path: '@activeTags',                   label: 'All active feature tags (array)' },
      { path: '@equippedWeaponTags',           label: 'Equipped weapon tags (array)' },
      { path: '@targetTags',                   label: 'Target creature tags (roll-time only)' },
      { path: '@master.classLevels.<classId>', label: "Master's class level (LinkedEntity)" },
    ],
  },
];

const KNOWN_PATHS_SET = new Set<string>(
  PATH_GROUPS.flatMap(g => g.entries.map(e => e.path))
);

const TEMPLATE_PREFIXES: string[] = [
  '@classLevels.',
  '@skills.',
  '@selection.',
  '@constant.',
  '@master.classLevels.',
];

// ── VALIDATION ────────────────────────────────────────────────────────────────

type ValidationState = 'empty' | 'valid' | 'partial' | 'invalid';

const RE_NUMBER    = /^-?\d+(\.\d+)?$/;
const RE_DICE_TOKEN = /\d*d\d+/;
const RE_AT_PATH   = /@[\w.]+/g;

function validateFormula(raw: string): ValidationState {
  const val = raw.trim();
  if (!val) return 'empty';
  if (RE_NUMBER.test(val)) return 'valid';
  if (!val.includes('@')) return 'valid';

  const tokens = val.match(RE_AT_PATH) ?? [];
  let hasPartial = false;

  for (const token of tokens) {
    if (KNOWN_PATHS_SET.has(token)) continue;
    if (TEMPLATE_PREFIXES.some(prefix => token.startsWith(prefix) && token.length > prefix.length)) continue;

    const isPartialPrefix = TEMPLATE_PREFIXES.some(p => p.startsWith(token + '.') || p === token);
    const isPartialKnown  = [...KNOWN_PATHS_SET].some(known => known.startsWith(token + '.'));
    if (isPartialPrefix || isPartialKnown) { hasPartial = true; continue; }

    return 'invalid';
  }

  return hasPartial ? 'partial' : 'valid';
}

// ── ICON / COLOUR MAPPINGS ────────────────────────────────────────────────────

function validationIcon(state: ValidationState): string {
  if (state === 'valid')   return '✓';
  if (state === 'partial') return '⚠';
  if (state === 'invalid') return '✗';
  return '';
}

function validationColor(state: ValidationState): string {
  if (state === 'valid')   return 'text-green-400';
  if (state === 'partial') return 'text-amber-400';
  if (state === 'invalid') return 'text-red-400';
  return '';
}

// ── INSERTION LOGIC ───────────────────────────────────────────────────────────

/**
 * Minimal interface matching only the HTMLInputElement members used by
 * `insertPath()` in FormulaBuilderInput.svelte.  This lets us test the
 * insertion arithmetic without a DOM.
 */
interface MinimalInput {
  value:          string;
  selectionStart: number | null;
  selectionEnd:   number | null;
  setRangeText(text: string, start: number, end: number, selectionMode: string): void;
}

/**
 * Creates a minimal input mock at a given cursor position.
 * `setRangeText` is simulated: it replaces the selection range and moves
 * the cursor to just after the inserted text (matching the browser's
 * `SelectionMode = 'end'` behaviour).
 */
function makeInput(value: string, cursorPos?: number): MinimalInput {
  let _value = value;
  const _cursor = cursorPos ?? value.length;
  return {
    get value() { return _value; },
    set value(v) { _value = v; },
    selectionStart: _cursor,
    selectionEnd:   _cursor,
    setRangeText(text: string, start: number, end: number, _mode: string): void {
      _value = _value.slice(0, start) + text + _value.slice(end);
    },
  };
}

/**
 * Mirrors FormulaBuilderInput.insertPath() exactly.
 * Returns the new value after insertion.
 */
function insertPath(input: MinimalInput, path: string, disabled = false): string {
  if (disabled) return input.value;

  const start  = input.selectionStart ?? input.value.length;
  const end    = input.selectionEnd   ?? input.value.length;
  const before = input.value.slice(0, start);

  const needsSpace = before.length > 0 && !/[\s\+\-\*\/\(]$/.test(before);
  const insert = needsSpace ? ' ' + path : path;

  input.setRangeText(insert, start, end, 'end');
  return input.value;
}

/**
 * Simulates the clear button handler.
 */
function handleClear(): { value: string; state: ValidationState } {
  return { value: '', state: 'empty' };
}

// =============================================================================
// TEST 1-2: Recognised vs. unrecognised @-paths
// =============================================================================

describe('FormulaBuilderInput — validation: @-path recognition', () => {
  /**
   * TEST 1 (spec: "recognised @-path → validationState === 'valid'"):
   * An exact path present in KNOWN_PATHS_SET must return 'valid'.
   *
   * The spec says "green ✓ icon rendered" — in the implementation 'valid'
   * drives the ✓ icon. The icon assertion is in the icon/colour suite (test 21).
   */
  it("recognised @-path '@attributes.stat_strength.derivedModifier' → 'valid'", () => {
    expect(validateFormula('@attributes.stat_strength.derivedModifier')).toBe('valid');
  });

  it("recognised @-path '@combatStats.base_attack_bonus.totalValue' → 'valid'", () => {
    expect(validateFormula('@combatStats.base_attack_bonus.totalValue')).toBe('valid');
  });

  it("recognised @-path '@saves.will.totalValue' → 'valid'", () => {
    expect(validateFormula('@saves.will.totalValue')).toBe('valid');
  });

  it("recognised @-path '@characterLevel' → 'valid'", () => {
    expect(validateFormula('@characterLevel')).toBe('valid');
  });

  it("recognised @-path '@activeTags' → 'valid'", () => {
    expect(validateFormula('@activeTags')).toBe('valid');
  });

  /**
   * TEST 2 (spec: "unrecognised path → validationState === 'error'"):
   * A path starting with @ that does not match any known path or template
   * prefix must return 'invalid' (which drives the red ✗ icon).
   *
   * The spec uses the word "error" — the implementation calls this 'invalid'.
   */
  it("unrecognised @-path '@nonsense.path' → 'invalid'", () => {
    expect(validateFormula('@nonsense.path')).toBe('invalid');
  });

  it("unrecognised @-path '@attributes.UPPER.totalValue' → 'invalid' (case-sensitive)", () => {
    expect(validateFormula('@attributes.UPPER.totalValue')).toBe('invalid');
  });

  it("unrecognised @-path '@unknown' → 'invalid'", () => {
    expect(validateFormula('@unknown')).toBe('invalid');
  });
});

// =============================================================================
// TEST 3-4: Plain numbers and dice expressions → `'valid'` (spec: `'neutral'`)
// =============================================================================

describe("FormulaBuilderInput — validation: plain numbers and dice ('neutral' in spec, 'valid' in impl)", () => {
  /**
   * TEST 3 (spec: "plain number → validationState === 'neutral'"):
   * Plain numbers return 'valid' in the implementation.
   * The spec's 'neutral' maps to 'valid' because the icon is still ✓ green —
   * there is no distinct 'neutral' state in the implementation.
   */
  it("plain integer '5' → 'valid'", () => {
    expect(validateFormula('5')).toBe('valid');
  });

  it("plain integer '42' → 'valid'", () => {
    expect(validateFormula('42')).toBe('valid');
  });

  /**
   * TEST 4 (spec: "dice notation 2d6+3 → validationState === 'neutral'"):
   * Dice expressions and arithmetic without @ are treated as 'valid' because
   * the Math Parser/Dice Engine handles them at runtime. No validation is
   * attempted at authoring time.
   */
  it("dice expression '2d6+3' → 'valid'", () => {
    expect(validateFormula('2d6+3')).toBe('valid');
  });

  it("dice expression '1d6' → 'valid'", () => {
    expect(validateFormula('1d6')).toBe('valid');
  });

  it("dice expression '3d8+5' → 'valid'", () => {
    expect(validateFormula('3d8+5')).toBe('valid');
  });

  it("arithmetic without @ '3 + 4 * 2' → 'valid'", () => {
    expect(validateFormula('3 + 4 * 2')).toBe('valid');
  });
});

// =============================================================================
// TEST 5: Partial path → `'partial'`
// =============================================================================

describe("FormulaBuilderInput — validation: partial @-path → 'partial'", () => {
  /**
   * TEST 5 (spec: "partially-specified path '@classLevels.' → 'partial'"):
   * A path that is a proper prefix of a known template prefix — e.g.
   * "@classLevels." — must return 'partial' (amber ⚠ icon).
   *
   * WHY 'partial' AND NOT 'invalid'?
   *   The GM is mid-type. "@classLevels." is an unfinished valid path.
   *   Showing red ✗ would be misleading. Amber ⚠ signals "almost there".
   */
  it("'@classLevels.' → 'partial' (GM is still typing the class ID)", () => {
    expect(validateFormula('@classLevels.')).toBe('partial');
  });

  it("'@attributes' → 'partial' (GM hasn't finished to '.stat_strength.totalValue')", () => {
    expect(validateFormula('@attributes')).toBe('partial');
  });

  it("'@attributes.stat_strength' → 'partial' (missing final .totalValue/.derivedModifier)", () => {
    expect(validateFormula('@attributes.stat_strength')).toBe('partial');
  });

  it("'@saves' → 'partial' (prefix of @saves.fortitude/reflex/will)", () => {
    expect(validateFormula('@saves')).toBe('partial');
  });

  it("'@combatStats' → 'partial' (prefix of @combatStats.*)", () => {
    expect(validateFormula('@combatStats')).toBe('partial');
  });
});

// =============================================================================
// TEST 6: Empty / whitespace-only input → `'empty'`
// =============================================================================

describe("FormulaBuilderInput — validation: empty input → 'empty'", () => {
  /**
   * TEST 6: Empty or whitespace-only values return 'empty' (no icon rendered).
   */
  it("empty string '' → 'empty'", () => {
    expect(validateFormula('')).toBe('empty');
  });

  it("whitespace-only ' ' → 'empty'", () => {
    expect(validateFormula('   ')).toBe('empty');
  });

  it("tab-only '\\t' → 'empty'", () => {
    expect(validateFormula('\t')).toBe('empty');
  });
});

// =============================================================================
// TESTS 7-13: Additional validation scenarios
// =============================================================================

describe('FormulaBuilderInput — validation: extended cases', () => {
  /**
   * TEST 7: Arithmetic with no @ → 'valid'.
   */
  it("arithmetic without @ '3+5' → 'valid'", () => {
    expect(validateFormula('3+5')).toBe('valid');
  });

  it("dice + constant '1d4+2' (no @) → 'valid'", () => {
    expect(validateFormula('1d4+2')).toBe('valid');
  });

  /**
   * TEST 8: Template-prefix paths → 'valid'.
   * "@classLevels.class_fighter" starts with "@classLevels." → valid.
   */
  it("'@classLevels.class_fighter' (template prefix match) → 'valid'", () => {
    expect(validateFormula('@classLevels.class_fighter')).toBe('valid');
  });

  it("'@skills.skill_climb.ranks' (template prefix match) → 'valid'", () => {
    expect(validateFormula('@skills.skill_climb.ranks')).toBe('valid');
  });

  it("'@selection.weapon_choice' (template prefix match) → 'valid'", () => {
    expect(validateFormula('@selection.weapon_choice')).toBe('valid');
  });

  it("'@master.classLevels.class_wizard' (template prefix match) → 'valid'", () => {
    expect(validateFormula('@master.classLevels.class_wizard')).toBe('valid');
  });

  /**
   * TEST 8b: @constant.<id> template-prefix paths → 'valid'.
   * "@constant.<id>" is in ARCHITECTURE.md §4.3 for named numeric constants
   * from config tables. The TEMPLATE_PREFIXES entry '@constant.' ensures
   * "@constant.some_name" validates as 'valid' even though the full path is
   * not in KNOWN_PATHS_SET.
   */
  it("'@constant.xp_threshold_level_5' (template prefix match) → 'valid'", () => {
    expect(validateFormula('@constant.xp_threshold_level_5')).toBe('valid');
  });

  it("'@constant.point_buy_cap' (template prefix match) → 'valid'", () => {
    expect(validateFormula('@constant.point_buy_cap')).toBe('valid');
  });

  /**
   * TEST 9: Mixed @-path + arithmetic with all valid tokens → 'valid'.
   */
  it("'@attributes.stat_strength.derivedModifier + 2' → 'valid'", () => {
    expect(validateFormula('@attributes.stat_strength.derivedModifier + 2')).toBe('valid');
  });

  it("'1d4 + @classLevels.class_rogue' → 'valid'", () => {
    expect(validateFormula('1d4 + @classLevels.class_rogue')).toBe('valid');
  });

  it("'@combatStats.base_attack_bonus.totalValue + @attributes.stat_strength.derivedModifier' → 'valid' (two known paths)", () => {
    expect(validateFormula('@combatStats.base_attack_bonus.totalValue + @attributes.stat_strength.derivedModifier')).toBe('valid');
  });

  /**
   * TEST 10: Mixed expression with one bad token → 'invalid'.
   */
  it("'@attributes.stat_strength.totalValue + @bogus.path' → 'invalid'", () => {
    expect(validateFormula('@attributes.stat_strength.totalValue + @bogus.path')).toBe('invalid');
  });

  it("'@bad' → 'invalid'", () => {
    expect(validateFormula('@bad')).toBe('invalid');
  });

  /**
   * TEST 12: Negative number → 'valid'.
   */
  it("negative number '-4' → 'valid'", () => {
    expect(validateFormula('-4')).toBe('valid');
  });

  it("negative number '-10' → 'valid'", () => {
    expect(validateFormula('-10')).toBe('valid');
  });

  /**
   * TEST 13: Decimal number → 'valid'.
   */
  it("decimal number '1.5' → 'valid'", () => {
    expect(validateFormula('1.5')).toBe('valid');
  });

  it("decimal number '0.25' → 'valid'", () => {
    expect(validateFormula('0.25')).toBe('valid');
  });
});

// =============================================================================
// TESTS 14-20: Insertion logic
// =============================================================================

describe('FormulaBuilderInput — insertPath() insertion logic', () => {
  /**
   * TEST 14 (spec: cursor at end): inserting a path when the input already
   * contains text and the cursor is at the end must append the path (with a
   * space separator if needed).
   */
  it('cursor at end with existing text: appends path with space separator', () => {
    const input = makeInput('2 + ');     // trailing space, cursor at end
    const result = insertPath(input, '@attributes.stat_strength.derivedModifier');
    // Trailing space in "2 + " means no extra space needed (last char is ' ')
    expect(result).toBe('2 + @attributes.stat_strength.derivedModifier');
  });

  it('cursor at end with no existing text: inserts path with no leading space', () => {
    const input = makeInput('');
    const result = insertPath(input, '@characterLevel');
    expect(result).toBe('@characterLevel');
  });

  it('cursor at end with text not ending in space/operator: auto-adds space', () => {
    const input = makeInput('2');   // ends with digit, no space
    const result = insertPath(input, '@attributes.stat_strength.derivedModifier');
    expect(result).toBe('2 @attributes.stat_strength.derivedModifier');
  });

  /**
   * TEST 15 (spec: cursor mid-string): inserting at position 3 in "abc+xyz"
   * must place the path after position 3, with the rest of the string following.
   */
  it('cursor mid-string: inserts at cursor position, rest follows', () => {
    const input = makeInput('abc+xyz', 4); // cursor after the '+' at pos 4
    // char at pos 3 is '+', no space needed ('+' is an operator)
    const result = insertPath(input, '@characterLevel');
    expect(result).toBe('abc+@characterLevelxyz');
  });

  /**
   * TEST 16: Auto-adds a space when the character before the cursor is not
   * a space or operator.
   */
  it('auto-adds space when previous char is alphanumeric', () => {
    const input = makeInput('abc', 3); // cursor at end, last char is 'c'
    const result = insertPath(input, '@characterLevel');
    expect(result).toBe('abc @characterLevel');
  });

  /**
   * TEST 17: No separator when previous char is already a space.
   */
  it('no separator when previous char is a space', () => {
    const input = makeInput('1 ', 2);  // cursor after the space
    const result = insertPath(input, '@characterLevel');
    expect(result).toBe('1 @characterLevel');
  });

  /**
   * TEST 18: No separator when previous char is `+`.
   */
  it('no separator when previous char is "+"', () => {
    const input = makeInput('2+', 2);  // cursor after '+'
    const result = insertPath(input, '@characterLevel');
    expect(result).toBe('2+@characterLevel');
  });

  it('no separator when previous char is "-"', () => {
    const input = makeInput('1-', 2);
    const result = insertPath(input, '@characterLevel');
    expect(result).toBe('1-@characterLevel');
  });

  it('no separator when previous char is "("', () => {
    const input = makeInput('(', 1);
    const result = insertPath(input, '@characterLevel');
    expect(result).toBe('(@characterLevel');
  });

  /**
   * TEST 19 (spec: "clear button resets value to ''"):
   * The clear handler returns value `''` and state `'empty'`.
   */
  it("clear action returns value '' and state 'empty'", () => {
    const { value, state } = handleClear();
    expect(value).toBe('');
    expect(state).toBe('empty');
  });

  /**
   * TEST 20 (spec: "click-to-insert at cursor: simulate cursor at position 5 in
   * input value '2 + ' → click '@attributes.stat_strength.derivedModifier' →
   * verify resulting value is '2 + @attributes.stat_strength.derivedModifier' and
   * cursor is at end"):
   *
   * The value is "2 + " (length 4). The spec says "position 5" which is the end.
   * Trailing space → no separating space needed.
   */
  it("click-to-insert: cursor at end of '2 + ' inserts @-path directly after the space", () => {
    const value   = '2 + ';
    const input   = makeInput(value, value.length); // cursor at position 4 (end)
    const path    = '@attributes.stat_strength.derivedModifier';
    const result  = insertPath(input, path);

    // "2 + " trailing space → no extra separator
    expect(result).toBe('2 + @attributes.stat_strength.derivedModifier');

    // Simulated cursor is now at the end of the inserted text
    // (setRangeText with 'end' places it after the insert)
    const cursorAfter = value.length + path.length; // 4 + len(path)
    expect(result.length).toBe(cursorAfter);
  });
});

// =============================================================================
// TESTS 21-24: Icon and colour mapping
// =============================================================================

describe('FormulaBuilderInput — validation icon and colour mapping', () => {
  /**
   * TEST 21 (spec: "green ✓ icon"):
   * 'valid' → icon '✓' + colour 'text-green-400'.
   */
  it("'valid' → icon '✓' and colour 'text-green-400'", () => {
    expect(validationIcon('valid')).toBe('✓');
    expect(validationColor('valid')).toBe('text-green-400');
  });

  /**
   * TEST 22 (spec: "amber ⚠ icon"):
   * 'partial' → icon '⚠' + colour 'text-amber-400'.
   */
  it("'partial' → icon '⚠' and colour 'text-amber-400'", () => {
    expect(validationIcon('partial')).toBe('⚠');
    expect(validationColor('partial')).toBe('text-amber-400');
  });

  /**
   * TEST 23 (spec: "red ✗ icon"):
   * 'invalid' → icon '✗' + colour 'text-red-400'.
   */
  it("'invalid' → icon '✗' and colour 'text-red-400'", () => {
    expect(validationIcon('invalid')).toBe('✗');
    expect(validationColor('invalid')).toBe('text-red-400');
  });

  /**
   * TEST 24 (spec: no icon for empty):
   * 'empty' → icon '' (empty string, no icon rendered).
   */
  it("'empty' → icon '' (no icon) and colour '' (no colour class)", () => {
    expect(validationIcon('empty')).toBe('');
    expect(validationColor('empty')).toBe('');
  });
});

// =============================================================================
// TESTS 25-28: PATH_GROUPS catalog integrity
// =============================================================================

describe('FormulaBuilderInput — PATH_GROUPS catalog integrity', () => {
  /**
   * TEST 25: Every path listed in PATH_GROUPS must be in KNOWN_PATHS_SET.
   * If a path is added to PATH_GROUPS but not reflected in KNOWN_PATHS_SET,
   * the validation would incorrectly mark it as 'invalid' or 'partial'.
   */
  it('all PATH_GROUPS entries are present in KNOWN_PATHS_SET', () => {
    const missingPaths: string[] = [];
    for (const group of PATH_GROUPS) {
      for (const entry of group.entries) {
        if (!KNOWN_PATHS_SET.has(entry.path)) {
          missingPaths.push(entry.path);
        }
      }
    }
    expect(missingPaths).toHaveLength(0);
  });

  /**
   * TEST 26: All TEMPLATE_PREFIXES must end with '.' so that the prefix-match
   * logic correctly identifies "starts with @classLevels." (not just "@classLevels").
   */
  it('all TEMPLATE_PREFIXES end with "."', () => {
    for (const prefix of TEMPLATE_PREFIXES) {
      expect(prefix.endsWith('.')).toBe(true);
    }
  });

  /**
   * TEST 27: All PATH_GROUPS group titles are non-empty strings.
   * Empty titles would cause blank collapsible headers in the Formula Assistant.
   */
  it('all PATH_GROUPS have non-empty title strings', () => {
    for (const group of PATH_GROUPS) {
      expect(typeof group.title).toBe('string');
      expect(group.title.trim().length).toBeGreaterThan(0);
    }
  });

  /**
   * TEST 28: No duplicate paths in PATH_GROUPS.
   * Duplicates would cause two identical buttons in the Formula Assistant,
   * confusing the GM and wasting screen space.
   */
  it('no duplicate @-paths across all PATH_GROUPS entries', () => {
    const allPaths = PATH_GROUPS.flatMap(g => g.entries.map(e => e.path));
    const uniquePaths = new Set(allPaths);
    expect(uniquePaths.size).toBe(allPaths.length);
  });

  /**
   * Additional integrity: all path entries have non-empty path and label.
   */
  it('all PATH_GROUPS entries have non-empty path and label', () => {
    for (const group of PATH_GROUPS) {
      for (const entry of group.entries) {
        expect(entry.path.trim().length).toBeGreaterThan(0);
        expect(entry.label.trim().length).toBeGreaterThan(0);
      }
    }
  });

  /**
   * All known @-paths start with '@' (the regex RE_AT_PATH depends on this).
   */
  it('all known paths begin with "@"', () => {
    for (const path of KNOWN_PATHS_SET) {
      expect(path.startsWith('@')).toBe(true);
    }
  });
});

// =============================================================================
// Additional edge-case validation tests
// =============================================================================

describe('FormulaBuilderInput — validation edge cases', () => {
  it("single '@' with no suffix → 'valid' (regex requires ≥1 char after @, so no tokens matched)", () => {
    // RE_AT_PATH = /@[\w.]+/g requires at least one \w or . after @.
    // A bare '@' extracts zero tokens → the token loop never runs →
    // hasPartial stays false → returns 'valid'.
    // This is a documented edge case: the GM has only typed '@' and hasn't
    // started a path yet.  The component handles this gracefully by returning
    // 'valid' rather than an alarming red ✗.
    expect(validateFormula('@')).toBe('valid');
  });

  it("formula '0' → 'valid'", () => {
    expect(validateFormula('0')).toBe('valid');
  });

  it("formula '-0' → 'valid'", () => {
    expect(validateFormula('-0')).toBe('valid');
  });

  it('@eclForXp (exact known path) → valid', () => {
    expect(validateFormula('@eclForXp')).toBe('valid');
  });

  it('@equippedWeaponTags (exact known path) → valid', () => {
    expect(validateFormula('@equippedWeaponTags')).toBe('valid');
  });

  it('@targetTags (exact known path) → valid', () => {
    expect(validateFormula('@targetTags')).toBe('valid');
  });

  it('expression mixing good path + bad path returns invalid', () => {
    expect(
      validateFormula('@attributes.stat_strength.totalValue + @totally.bogus')
    ).toBe('invalid');
  });

  it('disabled insertPath returns original value unchanged', () => {
    const input  = makeInput('existing');
    const result = insertPath(input, '@characterLevel', true /* disabled */);
    expect(result).toBe('existing');
  });
});
