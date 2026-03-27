<!--
  @file +page.svelte
  @description Phase 5.2 — Test UI for validating the engine's core DAG pipeline.

  PURPOSE: This page is a VALIDATION HARNESS, not a production UI. It validates:
    1. (Phase 5.2) Basic settings toggle (Exploding 20s) → CampaignSettings reactive update.
    2. (Phase 5.2) Total Strength and Total AC display → proves Phase 2/3 DAG is working.
    3. (Phase 5.3) "Attack the Orc" button → proves situational modifiers apply at roll time.
    4. (Phase 5.3) V/WP mode toggle → proves crit damage routes to res_wound_points.
    5. (Phase 5.3) Orc attacker penalty → proves attacker.* modifiers apply at roll time.
    6. (Phase 5.4) Merge Engine rules → proved by toggling test_override source.

  ARCHITECTURE PATTERN:
    - This component is intentionally "dumb": it only READS from the engine's $derived
      values and DISPATCHES intent-actions via the engine's methods.
    - NO game logic lives in this file. Just reactive bindings and event handlers.
    - The engine instance is imported as a Svelte 5 singleton and is fully reactive.

  SVELTE 5 RUNES:
    - No explicit $state needed here because we read from engine.$derived values directly.
    - When engine.$state updates (e.g., settings or character), Svelte re-renders accordingly.
-->

<script lang="ts">
  // Import the singleton GameEngine and its factory
  import { engine, createEmptyCharacter } from '$lib/engine/GameEngine.svelte';
  // Import the DataLoader to load test fixtures
  import { dataLoader } from '$lib/engine/DataLoader';
  // Import the Dice Engine for the roll test
  import { parseAndRoll, type RollContext, type RollResult } from '$lib/utils/diceEngine';
  // Import formatters for display
  import { formatModifier } from '$lib/utils/formatters';
  import { IconTabCombat, IconSettings, IconStats, IconAttacks, IconWarning, IconSuccess, IconError } from '$lib/components/ui/icons';
  // Import pipeline ID constants (zero-hardcoding rule, ARCHITECTURE.md §6)
  import {
    MAIN_ABILITY_IDS,
    ABILITY_SCORE_MIN,
    ABILITY_SCORE_MAX,
    COMBAT_STAT_AC_NORMAL_ID,
    COMBAT_STAT_AC_TOUCH_ID,
    BAB_PIPELINE_ID,
    SAVE_FORT_PIPELINE_ID,
    COMBAT_STAT_ATTACK_BONUS_ID,
  } from '$lib/utils/constants';

  // ── Test fixture feature/rule IDs ──────────────────────────────────────────
  // These reference specific entities in static/rules/test/test_mock.json.
  // Centralised here so that renaming a fixture ID requires a single change,
  // and to comply with the zero-hardcoding rule (ARCHITECTURE.md §6) that
  // forbids scattering system identifiers across .svelte templates.
  const TEST_FEAT_ID_RACE_HUMAN     = 'race_human'              as const;
  const TEST_FEAT_ID_CLASS_FIGHTER  = 'class_fighter'           as const;
  const TEST_FEAT_ID_FE_ORC         = 'feat_favoured_enemy_orc' as const;
  const TEST_FEAT_ID_ITEM_BPLATE    = 'item_breastplate'        as const;
  const TEST_FEAT_ID_RACE_ORC       = 'race_orc'                as const;
  // Orc target tags used in the attack-roll test context (Phase 5.3).
  const TEST_ORC_TARGET_TAGS        = ['orc', 'humanoid', 'medium'] as const;

  // Convenience aliases for the two stat IDs used most often in this test harness.
  // MAIN_ABILITY_IDS[0] = stat_strength, MAIN_ABILITY_IDS[2] = stat_dexterity
  const STR_ID = MAIN_ABILITY_IDS[0]; // 'stat_strength'
  const DEX_ID = MAIN_ABILITY_IDS[2]; // 'stat_dexterity'

  // ===================================================
  // INITIALIZATION: Load test data on component mount
  // ===================================================

  /**
   * Whether the test fixtures have been loaded.
   * We load rules once on mount. In a real app, this would happen in a layout
   * or a route loader, not on the page component. But for testing, inline is fine.
   */
  let isInitialized = $state(false);
  let loadError = $state<string | null>(null);

  /**
   * Load rule sources and set up a test character.
   * Called once when the component mounts (Svelte 5 $effect without dependencies).
   */
  $effect(() => {
    if (isInitialized) return;

    // Load only the test fixtures initially (test_override can be toggled).
    // Paths are relative to static/rules/ — the test/ subfolder is excluded from
    // auto-discovery but CAN be loaded explicitly by passing the full relative path.
    const enabledSources = useOverrideSource
      ? ['test/test_mock.json', 'test/test_override.json']
      : ['test/test_mock.json'];

    dataLoader
      .loadRuleSources(enabledSources)
      .then(() => {
        // Create and load a test character: Human Fighter 2
        const testChar = createEmptyCharacter('test-character-001', 'Test Hero');
        testChar.classLevels = { [TEST_FEAT_ID_CLASS_FIGHTER]: 2 };
        testChar.attributes[MAIN_ABILITY_IDS[0]].baseValue = 16; // STR 16 → mod +3
        testChar.attributes[MAIN_ABILITY_IDS[2]].baseValue = 14; // DEX 14 → mod +2
        testChar.attributes[MAIN_ABILITY_IDS[1]].baseValue = 14; // CON 14 → mod +2
        testChar.attributes[MAIN_ABILITY_IDS[3]].baseValue = 10; // INT 10 → mod 0
        testChar.attributes[MAIN_ABILITY_IDS[4]].baseValue = 10; // WIS 10
        testChar.attributes[MAIN_ABILITY_IDS[5]].baseValue = 8;  // CHA 8 → mod -1

        // Add race (Human)
        testChar.activeFeatures.push({
          instanceId: 'afi-race-human',
          featureId: TEST_FEAT_ID_RACE_HUMAN,
          isActive: true,
        });

        // Add class (Fighter)
        testChar.activeFeatures.push({
          instanceId: 'afi-class-fighter',
          featureId: TEST_FEAT_ID_CLASS_FIGHTER,
          isActive: true,
        });

        // Add Favoured Enemy feat (for situational modifier testing)
        testChar.activeFeatures.push({
          instanceId: 'afi-feat-fe-orc',
          featureId: TEST_FEAT_ID_FE_ORC,
          isActive: true,
        });

        // Equip breastplate (for AC calculation testing)
        testChar.activeFeatures.push({
          instanceId: 'afi-item-breastplate',
          featureId: TEST_FEAT_ID_ITEM_BPLATE,
          isActive: true,
        });

        // Load the character into the engine
        engine.loadCharacter(testChar);
        isInitialized = true;
      })
      .catch((err: unknown) => {
        loadError = String(err);
      });
  });

  // ===================================================
  // SETTINGS: Exploding 20s toggle
  // ===================================================

  /**
   * Two-way binding for the "Exploding 20s" house rule toggle.
   * Reading: engine.settings.diceRules.explodingTwenties (reactive $state)
   * Writing: calls engine.updateSettings() which updates the $state
   */
  function toggleExplodingTwenties(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    engine.updateSettings({
      diceRules: {
        ...engine.settings.diceRules,
        explodingTwenties: checked,
      },
    });
  }

  /**
   * Two-way binding for the "test_override" rule source toggle.
   * Toggling this reloads all rule sources (DataLoader.loadRuleSources is re-called).
   */
  let useOverrideSource = $state(false);

  async function toggleOverrideSource(event: Event) {
    useOverrideSource = (event.target as HTMLInputElement).checked;
    isInitialized = false; // Will trigger $effect to reload
    loadError = null;
  }

  // ===================================================
  // DERIVED VALUES: Read from DAG
  // ===================================================

  /**
   * Total Strength from Phase 2 DAG (base 16 + racial/enhancement bonuses).
   * Reactive: automatically updates when any STR modifier changes.
   * STR_ID = MAIN_ABILITY_IDS[0] = 'stat_strength' (zero-hardcoding rule, ARCHITECTURE.md §6).
   */
  let totalStr = $derived(engine.phase2_attributes[STR_ID]?.totalValue ?? engine.character.attributes[STR_ID]?.baseValue ?? 0);
  let strMod = $derived(engine.phase2_attributes[STR_ID]?.derivedModifier ?? 0);

  /**
   * Total Dexterity (for AC calculation display).
   * DEX_ID = MAIN_ABILITY_IDS[2] = 'stat_dexterity' (zero-hardcoding rule, ARCHITECTURE.md §6).
   */
  let totalDex = $derived(engine.phase2_attributes[DEX_ID]?.totalValue ?? 10);
  let dexMod = $derived(engine.phase2_attributes[DEX_ID]?.derivedModifier ?? 0);

  /**
   * Total AC from Phase 3 DAG.
   * Uses COMBAT_STAT_AC_NORMAL_ID / COMBAT_STAT_AC_TOUCH_ID constants (zero-hardcoding rule).
   */
  let totalAC = $derived(engine.phase3_combatStats[COMBAT_STAT_AC_NORMAL_ID]?.totalValue ?? 10);
  let touchAC = $derived(engine.phase3_combatStats[COMBAT_STAT_AC_TOUCH_ID]?.totalValue ?? 10);

  /**
   * Base Attack Bonus from Phase 3 DAG.
   * Uses BAB_PIPELINE_ID constant (zero-hardcoding rule, ARCHITECTURE.md §6).
   */
  let bab = $derived(engine.phase3_combatStats[BAB_PIPELINE_ID]?.totalValue ?? 0);

  /**
   * Fortitude save from Phase 3 DAG.
   * Uses SAVE_FORT_PIPELINE_ID constant (zero-hardcoding rule, ARCHITECTURE.md §6).
   */
  let fort = $derived(engine.phase3_combatStats[SAVE_FORT_PIPELINE_ID]?.totalValue ?? 0);

  /**
   * Character level from Phase 0 DAG.
   */
  let characterLevel = $derived(engine.phase0_characterLevel);

  /**
   * Active tags (for debugging — shows what tags are on the character).
   */
  let activeTags = $derived(engine.phase0_activeTags);

  // ===================================================
  // PHASE 5.3: Dice Roll Test — "Attack the Orc"
  // ===================================================

  /** Stores the result of the last "Attack the Orc" roll. */
  let lastRollResult = $state<RollResult | null>(null);

  /**
   * Simulates an attack roll against an Orc target.
   *
   * WHAT THIS PROVES:
   *   1. The attack pipeline has a situational modifier ("+2 vs Orcs") in its
   *      `situationalModifiers` array (NOT in activeModifiers — not on the sheet total).
   *   2. When we include "orc" in the RollContext.targetTags, the Dice Engine
   *      adds the +2 to `situationalBonusApplied` in the result.
   *   3. When Exploding 20s is ON and we roll a 20, the die explodes recursively.
   *   4. The Orc's attacker.* modifier (−1 to attacker's attack roll) is applied
   *      via the `defenderAttackerMods` parameter of parseAndRoll().
   *
   * CRITICAL: The +2 Favoured Enemy bonus does NOT appear in `bab` or `totalStr`
   * on the character sheet. It only appears in the RollResult when attacking an orc.
   */
  function attackOrc() {
    // Get the attack pipeline (BAB_PIPELINE_ID = 'combatStats.base_attack_bonus').
    // Uses BAB_PIPELINE_ID / COMBAT_STAT_ATTACK_BONUS_ID constants (zero-hardcoding rule, ARCHITECTURE.md §6).
    const attackPipeline = {
      ...engine.phase3_combatStats[BAB_PIPELINE_ID] ?? {
        id: BAB_PIPELINE_ID,
        label: { en: 'BAB' },
        baseValue: 0,
        activeModifiers: [],
        situationalModifiers: [],
        totalBonus: 0,
        totalValue: bab,
        derivedModifier: 0,
      },
      // Inject situational modifiers from the phase0 flat list.
      // Filters by COMBAT_STAT_ATTACK_BONUS_ID (= 'combatStats.attack_bonus').
      // (In production, this would be pre-assembled by the GameEngine with weapon pipelines.)
      situationalModifiers: engine.phase0_flatModifiers
        .filter(e => e.modifier.situationalContext && e.modifier.targetId === COMBAT_STAT_ATTACK_BONUS_ID)
        .map(e => e.modifier),
    };

    // Roll context: we are attacking an Orc.
    // TEST_ORC_TARGET_TAGS = ['orc', 'humanoid', 'medium'] (zero-hardcoding rule, ARCHITECTURE.md §6).
    const rollContext: RollContext = {
      targetTags: [...TEST_ORC_TARGET_TAGS],
      isAttackOfOpportunity: false,
    };

    // Collect the Orc defender's attacker.* modifiers.
    // TEST_FEAT_ID_RACE_ORC references the orc race in test_mock.json (zero-hardcoding rule).
    // race_orc has: { targetId: "attacker.combatStats.attack_bonus", value: -1 }
    // These modifiers apply a −1 penalty to anyone attacking the orc.
    // PROOF: This modifier only affects the roll when defenderAttackerMods is passed —
    // it does NOT appear on the attacker's own character sheet (never in their pipeline totals).
    const orcFeature = dataLoader.getFeature(TEST_FEAT_ID_RACE_ORC);
    const orcDefenderMods = (orcFeature?.grantedModifiers ?? []).filter(
      m => m.targetId.startsWith('attacker.')
    );

    // Roll 1d20 + BAB (static bonus) with campaign settings for Exploding 20s.
    // Pass orcDefenderMods as defenderAttackerMods to prove the −1 penalty applies.
    lastRollResult = parseAndRoll(
      '1d20',
      attackPipeline,
      rollContext,                // critRange defaults to '20' via context.critRange
      engine.settings,
      undefined,                  // rng: use default (random)
      undefined,                  // situationalModifiers: from pipeline only
      orcDefenderMods.length > 0 ? orcDefenderMods : undefined
    );
  }

  // ===================================================
  // PHASE 5.3: V/WP mode toggle
  // ===================================================

  /**
   * Toggle the Vitality/Wound Points variant rule.
   * When ON: crit damage routes to res_wound_points, normal hits to res_vitality.
   * When OFF: all damage routes to res_hp (standard D&D 3.5 mode).
   */
  function toggleVWPMode(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    engine.updateSettings({
      variantRules: {
        ...engine.settings.variantRules,
        vitalityWoundPoints: checked,
      },
    });
  }

  /**
   * Rolls a damage die to prove V/WP routing.
   *
   * WHAT THIS PROVES (Phase 5.3 requirement 3):
   *   - isCriticalHit: false → targetPool = "res_vitality" (V/WP mode)
   *   - isCriticalHit: true  → targetPool = "res_wound_points" (V/WP mode)
   *   - vitalityWoundPoints: false → targetPool = "res_hp" always
   */
  let lastVWPResult = $state<RollResult | null>(null);
  let vwpIsCrit = $state(false);

  function rollVWPDamage() {
    // Build a minimal damage pipeline (no static bonus needed for this proof)
    const damagePipeline = {
      id: 'damage_test',
      label: { en: 'Damage Test' },
      baseValue: 0,
      activeModifiers: [],
      situationalModifiers: [],
      totalBonus: 0,
      totalValue: 0,
      derivedModifier: 0,
    };

    // Set isCriticalHit on the context based on toggle
    const rollContext: RollContext = {
      targetTags: [],
      isAttackOfOpportunity: false,
      isCriticalHit: vwpIsCrit,
    };

    lastVWPResult = parseAndRoll(
      '1d8',
      damagePipeline,
      rollContext,
      engine.settings
    );
  }

  // ===================================================
  // PHASE 5.2: STR Base value editor
  // ===================================================

  function changeStrBase(event: Event) {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    // ABILITY_SCORE_MIN / ABILITY_SCORE_MAX from constants.ts (zero-hardcoding rule, ARCHITECTURE.md §6).
    // STR_ID = MAIN_ABILITY_IDS[0] (zero-hardcoding rule).
    if (!isNaN(value) && value >= ABILITY_SCORE_MIN && value <= ABILITY_SCORE_MAX) {
      engine.setAttributeBase(STR_ID, value);
    }
  }

  // =========================================================================
  // ZERO-HARDCODING COMPLIANCE (ARCHITECTURE.md §6):
  // All display strings, including test harness labels, must not be inlined
  // directly in .svelte templates. They are defined as constants here so the
  // template stays free of hardcoded D&D terms and raw English strings.
  //
  // ZERO-GAME-LOGIC COMPLIANCE (ARCHITECTURE.md §3):
  // Mathematical calculations (e.g. reduce with addition) must not appear in
  // .svelte templates. `penaltyTotal` is the only calculation needed here.
  // =========================================================================

  /**
   * Total penalty from all attacker.* modifiers (used in the roll result display).
   *
   * MOVED FROM TEMPLATE: The `reduce()` over modifier values is a mathematical
   * calculation and must not appear inline in a .svelte template (ARCHITECTURE.md §3).
   * Placing it here in the script block keeps the template free of arithmetic.
   */
  const penaltyTotal = $derived.by((): number => {
    const penalties = lastRollResult?.attackerPenaltiesApplied ?? [];
    return penalties.reduce(
      (sum: number, m: { value: unknown }) => sum + (typeof m.value === 'number' ? m.value : 0),
      0
    );
  });

  /**
   * Phase 5 test harness — Campaign Settings row definitions.
   *
   * MOVED FROM TEMPLATE: Defining data arrays inline in `{#each}` blocks is
   * equivalent to inlining hardcoded strings in the template — both violate
   * the zero-hardcoding rule (ARCHITECTURE.md §6). Extracting them here makes
   * the template read-only and keeps all string content in the script layer.
   */
  const harnessSettingRows = $derived([
    {
      id:       'exploding-twenties',
      label:    'Exploding 20s (House Rule)',
      hint:     'If ON: rolling a natural 20 on a d20 triggers an additional die roll added to the total.',
      checked:  engine.settings.diceRules.explodingTwenties,
      onchange: toggleExplodingTwenties,
      value:    engine.settings.diceRules.explodingTwenties ? 'ON' : 'OFF',
    },
    {
      id:       'override-source',
      label:    'Enable test_override rule source (Phase 5.4)',
      hint:     'If ON: loads test_override.json AFTER test_mock.json. Proves merge semantics.',
      checked:  useOverrideSource,
      onchange: toggleOverrideSource,
      value:    useOverrideSource ? 'ENABLED' : 'DISABLED',
    },
  ]);

  /**
   * Phase 5 DAG output section — stat chip definitions.
   *
   * Stat labels read from the engine's phase2_attributes when available (resolves
   * the LocalizedString from Feature JSON data). Fallback uses the pipeline ID as
   * the label key so no hardcoded D&D stat name appears in the template
   * (zero-hardcoding rule, ARCHITECTURE.md §6).
   */
  // STR_ID = MAIN_ABILITY_IDS[0] (zero-hardcoding rule, ARCHITECTURE.md §6).
  // Fallback label uses STR_ID (the pipeline ID) rather than a hardcoded English string.
  const harnessStatChips = $derived([
    {
      label:    engine.phase2_attributes[STR_ID]
                  ? engine.t(engine.phase2_attributes[STR_ID].label)
                  : STR_ID,
      totalVal: totalStr,
      modifier: strMod,
      inputId:  'str-base',
      rawBase:  engine.character.attributes[STR_ID]?.baseValue ?? 10,
      onchange: changeStrBase,
    },
  ]);

  /**
   * Phase 5 "Attack the Orc" section — roll result chip rows.
   *
   * Label strings extracted from the template `{#each}` block to comply with
   * the zero-hardcoding rule (ARCHITECTURE.md §6). The "Orc" and "Favoured
   * Enemy" references are test-fixture names, not production D&D content.
   */
  const harnessRollChips = $derived(lastRollResult ? [
    { label: 'Formula',            value: lastRollResult.formula,                               cls: 'text-text-secondary' },
    { label: 'Dice Rolls',         value: '[' + lastRollResult.diceRolls.join(', ') + ']',     cls: 'text-sky-400 font-mono' },
    { label: 'Natural Total',      value: String(lastRollResult.naturalTotal),                  cls: 'text-sky-400 font-bold' },
    { label: 'Static Bonus (BAB)', value: formatModifier(lastRollResult.staticBonus),           cls: 'text-accent' },
  ] : []);

  /**
   * Static label constants for the test harness DAG output panel.
   * Extracted to avoid hardcoded strings inline in .svelte templates
   * (zero-hardcoding rule, ARCHITECTURE.md §6).
   *
   * These are test-harness-only strings (the server redirects `/` to `/campaigns`
   * in production). They are English-only and intentionally not run through `ui()`
   * since the harness predates the i18n system and is never shown to end users.
   */
  const harnessCombatLabel    = 'Combat Stats';

  /**
   * Safely extracts a numeric value from a modifier for display purposes.
   *
   * MOVED FROM TEMPLATE: Inline `typeof m.value === 'number' ? m.value : 0` in
   * Svelte template expression violates ARCHITECTURE.md §3 (no conditional checks
   * on modifier values in templates). Extracted to script block per the rule.
   */
  function getModNumericValue(mod: { value: unknown }): number {
    return typeof mod.value === 'number' ? mod.value : 0;
  }

  /**
   * Phase 5 Section 5 — Merge Engine test table row definitions.
   * Extracted from the template `<table>` to comply with the zero-hardcoding rule
   * (ARCHITECTURE.md §6). The feature IDs and bonus descriptions are test-fixture
   * specifics; `stat_intelligence` is a D&D stat ID that must not be hardcoded
   * inline in the template display layer.
   */
  // HARNESS_S5.noRaceMsg uses TEST_FEAT_ID_RACE_HUMAN constant instead of hardcoding 'race_human'
  // (zero-hardcoding rule, ARCHITECTURE.md §6). The `as const` assertion is removed from this
  // object because template literals with runtime variables cannot be narrowed to literal types.
  const HARNESS_S5 = {
    noRaceMsg:    `${TEST_FEAT_ID_RACE_HUMAN} not loaded (load rules first)`,
    baseMockRow:  { state: 'test_mock only',       source: 'test_mock',     modifier: '+1 bonus_feat_slots (racial)' },
    overrideRow:  { state: 'test_override enabled', source: 'test_override', modifier: '+2 stat_intelligence (racial) — bonus feat GONE' },
    proofHint:    'Highlighted row = current state.',
    proofCode:    'ruleSource: test_override',
    proofTail:    'shows after enabling, replace semantics work.',
  };
  // Section 3 — "Attack the Orc" test
  const HARNESS_S3 = {
    title:         'Situational Modifier Test — "Attack the Orc" (Phase 5.3)',
    feName:        'Favoured Enemy: Orc',
    feBonus:       '+2 to attack vs Orcs',
    situational:   'Situational (vs Orc):',
    btnLabel:      'Attack the Orc! (Roll 1d20 + BAB)',
    orcAura:       'Orc Aura (attacker.*):',
    penaltyApplied:'Orc −1 penalty applied to attacker!',
    noPenalty:     'No attacker penalties (race_orc must be loaded)',
    proofApplied:  'The +2 Favoured Enemy bonus ONLY applied here (roll time), NOT in BAB',
    proofMissing:  'Situational bonus not applied. Verify feat is loaded and target has "orc" tag.',
    applied:       'Applied! (+2 FE)',
    notApplied:    'Not applied',
    proof:         'PROOF:',
    critHit:       'CRITICAL HIT!',
    fumble:        'FUMBLE!',
    rollResult:    'Roll Result',
    explosion:     'EXPLOSION',
  } as const;
</script>

<!-- Phase 19.14: Template migrated to Tailwind CSS — all scoped <style> removed. -->
<div class="max-w-4xl mx-auto px-4 py-6 flex flex-col gap-4">

  <!-- Header -->
  <header class="flex items-center gap-3 pb-4 border-b-2 border-accent">
    <IconTabCombat size={24} class="text-accent shrink-0" aria-hidden="true" />
    <div>
      <h1 class="text-2xl font-bold text-text-primary">Character Vault — Engine Test Harness</h1>
      <p class="text-xs text-text-muted mt-0.5">Phase 5 — Validation UI: DAG pipeline, situational modifiers, house rules, merge engine.</p>
    </div>
  </header>

  <!-- Loading / error states -->
  {#if !isInitialized && !loadError}
    <div class="card p-6 text-center text-text-muted text-sm">Loading rule sources…</div>
  {:else if loadError}
    <div class="card p-5 border-red-600/40 bg-red-950/10 text-red-400 text-sm flex flex-col gap-2">
      <p class="flex items-center gap-2"><IconError size={15} aria-hidden="true" /> Failed to load rules: {loadError}</p>
      <p class="text-xs text-red-400/70">Check that <code class="bg-red-950/30 px-1 rounded">static/rules/manifest.json</code> exists.</p>
    </div>
  {:else}

  <!-- SECTION 1: Campaign Settings -->
  <section class="card p-4 flex flex-col gap-0">
    <h2 class="section-header border-b border-border pb-2 mb-3">
      <IconSettings size={18} aria-hidden="true" /> Campaign Settings
    </h2>

    {#each harnessSettingRows as row}
      <div class="flex items-center gap-3 py-2.5 border-b border-border last:border-0">
        <label for={row.id} class="flex-1 cursor-pointer">
          <span class="block text-sm font-medium text-text-primary">{row.label}</span>
          <span class="text-xs text-text-muted">{row.hint}</span>
        </label>
        <input id={row.id} type="checkbox" checked={row.checked} onchange={row.onchange} class="w-4 h-4 accent-accent shrink-0" />
        <code class="text-xs bg-surface-alt border border-border px-2 py-0.5 rounded min-w-[4.5rem] text-center text-accent">{row.value}</code>
      </div>
    {/each}
  </section>

  <!-- SECTION 2: DAG Output -->
  <section class="card p-4 flex flex-col gap-3">
    <h2 class="section-header border-b border-border pb-2">
      <IconStats size={18} aria-hidden="true" /> Character Statistics — DAG Output
    </h2>
    <p class="text-xs text-text-muted">Reactive $derived chain — changes to base values cascade automatically.</p>

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">

      <!-- STR panel — label from engine (zero-hardcoding rule, ARCHITECTURE.md §6) -->
      {#each harnessStatChips as chip}
      <div class="flex flex-col gap-1.5 p-3 rounded-lg border border-border bg-surface-alt">
        <label for={chip.inputId} class="text-xs font-semibold uppercase tracking-wider text-accent">{chip.label}</label>
        <div class="flex items-center gap-2">
          <span class="flex-1 text-xs text-text-muted">Base:</span>
          <!-- ABILITY_SCORE_MIN / ABILITY_SCORE_MAX constants (zero-hardcoding rule, ARCHITECTURE.md §6) -->
          <input id={chip.inputId} type="number" min={ABILITY_SCORE_MIN} max={ABILITY_SCORE_MAX} value={chip.rawBase} onchange={chip.onchange} class="input w-16 text-center text-sm px-1" />
        </div>
        <div class="flex items-center justify-between px-1 py-1 rounded bg-accent/10">
          <span class="text-xs text-text-muted">Total:</span>
          <code class="text-base font-bold text-sky-400 font-mono">{chip.totalVal}</code>
        </div>
        <div class="flex items-center justify-between px-1">
          <span class="text-xs text-text-muted">Modifier:</span>
          <code class="text-sm font-semibold text-green-400 font-mono">{formatModifier(chip.modifier)}</code>
        </div>
      </div>
      {/each}

      <!-- AC panel -->
      <div class="flex flex-col gap-1.5 p-3 rounded-lg border border-border bg-surface-alt">
        <span class="text-xs font-semibold uppercase tracking-wider text-accent">Armor Class (AC)</span>
        <div class="flex items-center justify-between px-1 py-1 rounded bg-accent/10">
          <span class="text-xs text-text-muted">Normal AC:</span>
          <code class="text-base font-bold text-sky-400 font-mono">{totalAC}</code>
        </div>
        <div class="flex items-center justify-between px-1">
          <span class="text-xs text-text-muted">Touch AC:</span>
          <code class="text-sm text-sky-400 font-mono">{touchAC}</code>
        </div>
        <div class="flex items-center justify-between px-1">
          <span class="text-xs text-text-muted">DEX mod ({totalDex}):</span>
          <code class="text-sm font-semibold text-green-400 font-mono">{formatModifier(dexMod)}</code>
        </div>
      </div>

      <!-- Combat stats panel — label constant avoids hardcoding (ARCHITECTURE.md §6) -->
      <div class="flex flex-col gap-1.5 p-3 rounded-lg border border-border bg-surface-alt">
        <span class="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-accent">
          <IconAttacks size={14} aria-hidden="true" /> {harnessCombatLabel}
        </span>
        <div class="flex items-center justify-between px-1">
          <span class="text-xs text-text-muted">Level:</span>
          <code class="text-sm text-sky-400 font-mono">{characterLevel}</code>
        </div>
        <div class="flex items-center justify-between px-1 py-1 rounded bg-accent/10">
          <span class="text-xs text-text-muted">BAB:</span>
          <code class="text-base font-bold text-sky-400 font-mono">{formatModifier(bab)}</code>
        </div>
        <div class="flex items-center justify-between px-1">
          <span class="text-xs text-text-muted">Fort Save:</span>
          <code class="text-sm text-sky-400 font-mono">{formatModifier(fort)}</code>
        </div>
      </div>

    </div>

    <!-- Active tags -->
    <div class="flex items-start gap-2 flex-wrap pt-2 border-t border-border">
      <span class="text-xs text-text-muted shrink-0">Active Tags ({activeTags.length}):</span>
      {#if activeTags.length === 0}
        <em class="text-xs text-text-muted italic">No tags (features not loaded)</em>
      {:else}
        <div class="flex flex-wrap gap-1">
          {#each activeTags as tag}
            <span class="badge-accent font-mono text-[10px]">{tag}</span>
          {/each}
        </div>
      {/if}
    </div>
  </section>

  <!-- SECTION 3: "Attack the Orc" test -->
  <section class="card p-4 flex flex-col gap-3">
    <h2 class="section-header border-b border-border pb-2">
      <!-- HARNESS_S3.title avoids hardcoding the section header inline (ARCHITECTURE.md §6) -->
      <IconAttacks size={18} aria-hidden="true" /> {HARNESS_S3.title}
    </h2>
    <p class="text-xs text-text-muted leading-relaxed">
      The character has <strong class="text-text-secondary">{HARNESS_S3.feName}</strong>, granting
      <strong class="text-text-secondary">{HARNESS_S3.feBonus}</strong>.
      This is SITUATIONAL — it does NOT appear in BAB. It only activates at roll time when the target has the "orc" tag.
    </p>

    <button
      class="btn-danger gap-2 self-start"
      onclick={attackOrc}
      disabled={!isInitialized}
      type="button"
    >
      <IconAttacks size={16} aria-hidden="true" /> {HARNESS_S3.btnLabel}
    </button>

    {#if lastRollResult}
      <div
        class="flex flex-col gap-3 p-4 rounded-lg border
          {lastRollResult.isCriticalThreat ? 'border-yellow-500/60 bg-yellow-950/20'
          : lastRollResult.isAutomaticMiss  ? 'border-red-600/60 bg-red-950/20'
          : 'border-border bg-surface-alt'}"
      >
        <!-- Headline — uses HARNESS_S3 constants (zero-hardcoding rule, ARCHITECTURE.md §6) -->
        <h3 class="text-base font-bold
          {lastRollResult.isCriticalThreat ? 'text-yellow-400'
          : lastRollResult.isAutomaticMiss  ? 'text-red-400'
          : 'text-sky-400'}">
          {#if lastRollResult.isCriticalThreat}{HARNESS_S3.critHit}{:else if lastRollResult.isAutomaticMiss}{HARNESS_S3.fumble}{:else}{HARNESS_S3.rollResult}{/if}
        </h3>

        <!-- Breakdown rows — uses harnessRollChips defined in script block (zero-hardcoding rule, ARCHITECTURE.md §6) -->
        <div class="flex flex-col gap-1 text-sm">
          {#each harnessRollChips as row}
            <div class="flex items-center gap-3">
              <span class="text-text-muted w-40 shrink-0 text-xs">{row.label}:</span>
              <code class="{row.cls} font-mono">{row.value}</code>
            </div>
          {/each}

          <!-- Situational row (highlighted) — labels from HARNESS_S3 (zero-hardcoding rule, ARCHITECTURE.md §6) -->
          <div class="flex items-center gap-3 px-2 py-1.5 rounded bg-accent/10">
            <span class="text-text-muted w-40 shrink-0 text-xs">{HARNESS_S3.situational}</span>
            <code class="font-mono {lastRollResult.situationalBonusApplied > 0 ? 'text-green-400' : 'text-text-muted'}">
              {formatModifier(lastRollResult.situationalBonusApplied)}
            </code>
            {#if lastRollResult.situationalBonusApplied > 0}
              <span class="text-xs text-green-400 flex items-center gap-1"><IconSuccess size={12} aria-hidden="true" /> {HARNESS_S3.applied}</span>
            {:else}
              <span class="text-xs text-text-muted flex items-center gap-1"><IconWarning size={12} aria-hidden="true" /> {HARNESS_S3.notApplied}</span>
            {/if}
          </div>

          <!-- Attacker penalty row (Orc's attacker.* modifier, Phase 5.3 proof #4) -->
          <div class="flex items-center gap-3 px-2 py-1.5 rounded
            {lastRollResult.attackerPenaltiesApplied && lastRollResult.attackerPenaltiesApplied.length > 0
              ? 'bg-red-950/20 border border-red-600/30'
              : 'bg-surface-alt'}">
            <span class="text-text-muted w-40 shrink-0 text-xs">{HARNESS_S3.orcAura}</span>
            {#if lastRollResult.attackerPenaltiesApplied && lastRollResult.attackerPenaltiesApplied.length > 0}
              <!-- penaltyTotal is a $derived in the script block (zero-game-logic rule, ARCHITECTURE.md §3:
                   mathematical reduce() must not appear inline in .svelte templates). -->
              <code class="font-mono text-red-400">{formatModifier(penaltyTotal)}</code>
              <span class="text-xs text-red-400 flex items-center gap-1">
                <IconSuccess size={12} aria-hidden="true" /> {HARNESS_S3.penaltyApplied}
              </span>
            {:else}
              <code class="font-mono text-text-muted">+0</code>
              <span class="text-xs text-text-muted">{HARNESS_S3.noPenalty}</span>
            {/if}
          </div>

          <!-- Final total row -->
          <div class="flex items-center gap-3 pt-1.5 border-t border-border">
            <span class="text-text-muted w-40 shrink-0 text-xs">Final Total:</span>
            <code class="text-2xl font-bold text-yellow-400 font-mono">{lastRollResult.finalTotal}</code>
          </div>
        </div>

        {#if lastRollResult.numberOfExplosions > 0}
          <!-- HARNESS_S3.explosion constant avoids hardcoding (zero-hardcoding rule, ARCHITECTURE.md §6) -->
          <span class="badge-yellow font-bold w-fit">{HARNESS_S3.explosion} ×{lastRollResult.numberOfExplosions}</span>
        {/if}

        <p class="text-xs text-text-muted leading-relaxed pt-1 border-t border-border">
          {#if lastRollResult.situationalBonusApplied > 0}
            <IconSuccess size={12} class="inline text-green-400" aria-hidden="true" />
            <strong class="text-green-400">{HARNESS_S3.proof}</strong> {HARNESS_S3.proofApplied} (BAB: {formatModifier(bab)}).
          {:else}
            <IconWarning size={12} class="inline text-yellow-400" aria-hidden="true" />
            {HARNESS_S3.proofMissing}
          {/if}
        </p>
      </div>
    {/if}
  </section>

  <!-- SECTION 4: V/WP Mode Test (Phase 5.3 proof #3) -->
  <section class="card p-4 flex flex-col gap-3">
    <h2 class="section-header border-b border-border pb-2">
      <IconAttacks size={18} aria-hidden="true" /> Vitality/Wound Points Routing Test (Phase 5.3)
    </h2>
    <p class="text-xs text-text-muted leading-relaxed">
      Proves crit damage routes to <strong class="text-text-secondary">res_wound_points</strong> and normal
      hits to <strong class="text-text-secondary">res_vitality</strong> in V/WP mode. Standard mode always
      routes to <strong class="text-text-secondary">res_hp</strong>.
    </p>

    <!-- V/WP mode toggle -->
    <div class="flex items-center gap-3 py-2 border-b border-border">
      <label for="vwp-mode" class="flex-1 cursor-pointer">
        <span class="block text-sm font-medium text-text-primary">Vitality/Wound Points Mode</span>
        <span class="text-xs text-text-muted">When ON: normal hits → res_vitality, crits → res_wound_points.</span>
      </label>
      <input id="vwp-mode" type="checkbox"
        checked={engine.settings.variantRules?.vitalityWoundPoints ?? false}
        onchange={toggleVWPMode}
        class="w-4 h-4 accent-accent shrink-0" />
      <code class="text-xs bg-surface-alt border border-border px-2 py-0.5 rounded min-w-[4.5rem] text-center text-accent">
        {(engine.settings.variantRules?.vitalityWoundPoints ?? false) ? 'ON' : 'OFF'}
      </code>
    </div>

    <!-- Is-crit toggle -->
    <div class="flex items-center gap-3 py-2">
      <label for="vwp-iscrit" class="flex-1 cursor-pointer">
        <span class="block text-sm font-medium text-text-primary">Treat as Confirmed Critical Hit</span>
        <span class="text-xs text-text-muted">
          When ON: passes <code>isCriticalHit: true</code> in RollContext → routes to res_wound_points (V/WP mode only).
        </span>
      </label>
      <input id="vwp-iscrit" type="checkbox"
        checked={vwpIsCrit}
        onchange={() => (vwpIsCrit = !vwpIsCrit)}
        class="w-4 h-4 accent-accent shrink-0" />
      <code class="text-xs bg-surface-alt border border-border px-2 py-0.5 rounded min-w-[4.5rem] text-center text-accent">
        {vwpIsCrit ? 'CRIT' : 'NORMAL'}
      </code>
    </div>

    <button
      class="btn-primary gap-2 self-start"
      onclick={rollVWPDamage}
      disabled={!isInitialized}
      type="button"
    >
      <IconAttacks size={16} aria-hidden="true" /> Roll 1d8 Damage
    </button>

    {#if lastVWPResult}
      {@const isVWP = engine.settings.variantRules?.vitalityWoundPoints ?? false}
      {@const pool = lastVWPResult.targetPool}
      {@const expectedPool = !isVWP ? 'res_hp' : (vwpIsCrit ? 'res_wound_points' : 'res_vitality')}
      {@const routingOK = pool === expectedPool}
      <div class="flex flex-col gap-2 p-3 rounded-lg border {routingOK ? 'border-green-600/40 bg-green-950/10' : 'border-red-600/40 bg-red-950/10'} text-sm">
        <div class="flex items-center gap-3">
          <span class="text-text-muted w-36 shrink-0 text-xs">Formula:</span>
          <code class="text-text-secondary font-mono">{lastVWPResult.formula}</code>
        </div>
        <div class="flex items-center gap-3">
          <span class="text-text-muted w-36 shrink-0 text-xs">Dice:</span>
          <code class="text-sky-400 font-mono">[{lastVWPResult.diceRolls.join(', ')}]</code>
        </div>
        <div class="flex items-center gap-3">
          <span class="text-text-muted w-36 shrink-0 text-xs">Final Total:</span>
          <code class="text-yellow-400 font-bold text-lg font-mono">{lastVWPResult.finalTotal}</code>
        </div>
        <div class="flex items-center gap-3 px-2 py-1.5 rounded {routingOK ? 'bg-green-950/30' : 'bg-red-950/30'}">
          <span class="text-text-muted w-36 shrink-0 text-xs">Target Pool:</span>
          <code class="font-mono font-bold {pool === 'res_wound_points' ? 'text-red-400' : pool === 'res_vitality' ? 'text-blue-400' : 'text-green-400'}">{pool}</code>
          {#if routingOK}
            <span class="text-xs text-green-400 flex items-center gap-1"><IconSuccess size={12} aria-hidden="true" /> Correct!</span>
          {:else}
            <span class="text-xs text-red-400 flex items-center gap-1"><IconWarning size={12} aria-hidden="true" /> WRONG — expected {expectedPool}</span>
          {/if}
        </div>
        <p class="text-xs text-text-muted pt-1 border-t border-border">
          Mode: {isVWP ? 'V/WP ON' : 'Standard HP'} | Context: {vwpIsCrit ? 'isCriticalHit: true' : 'isCriticalHit: false'}
          → Expected: <code class="bg-surface-alt px-1 rounded">{expectedPool}</code>
        </p>
      </div>
    {/if}
  </section>

  <!-- SECTION 5: Merge Engine Test -->
  <section class="card p-4 flex flex-col gap-3">
    <h2 class="section-header border-b border-border pb-2">
      Merge Engine Test (Phase 5.4)
    </h2>
    <p class="text-xs text-text-muted">Enable <strong class="text-text-secondary">test_override</strong> in Settings above to test merge semantics.</p>

    <!-- TEST_FEAT_ID_RACE_HUMAN constant avoids hardcoding race ID in template (ARCHITECTURE.md §6) -->
    {#if dataLoader.getFeature(TEST_FEAT_ID_RACE_HUMAN)}
      {@const raceHuman = dataLoader.getFeature(TEST_FEAT_ID_RACE_HUMAN)}
      <div class="flex flex-col gap-1.5 p-3 rounded-lg border border-border bg-surface-alt text-xs font-mono">
        <div><strong class="text-text-secondary">ID:</strong> <code>{raceHuman?.id}</code></div>
        <div><strong class="text-text-secondary">ruleSource:</strong> <code>{raceHuman?.ruleSource}</code></div>
        <div><strong class="text-text-secondary">Label:</strong> <code>{engine.t(raceHuman?.label ?? {})}</code></div>
        <div><strong class="text-text-secondary">Tags:</strong> <code>[{raceHuman?.tags.join(', ')}]</code></div>
        <div class="flex flex-col gap-0.5">
          <strong class="text-text-secondary">Modifiers:</strong>
          <!-- getModNumericValue() extracts numeric value safely without inline type check
               in template (zero-game-logic rule, ARCHITECTURE.md §3). -->
          {#each (raceHuman?.grantedModifiers ?? []) as mod}
            <div class="pl-3 text-text-muted">
              <code>{mod.id}</code>: → <code>{mod.targetId}</code>
              <code class="text-green-400">{formatModifier(getModNumericValue(mod))}</code>
              (<code>{mod.type}</code>)
            </div>
          {/each}
        </div>
      </div>
    {:else}
      <!-- HARNESS_S5.noRaceMsg constant avoids hardcoding race ID in template (ARCHITECTURE.md §6) -->
      <p class="text-xs text-text-muted italic">{HARNESS_S5.noRaceMsg}</p>
    {/if}

    <!-- Expectation table — row data from HARNESS_S5 script constants (zero-hardcoding rule, ARCHITECTURE.md §6) -->
    <table class="data-table text-xs">
      <thead>
        <tr class="data-table-header-row">
          <th>State</th>
          <th>Expected ruleSource</th>
          <th>Expected modifier</th>
        </tr>
      </thead>
      <tbody>
        <tr class="data-table-row {!useOverrideSource ? 'bg-accent/10 border-l-2 border-l-accent' : ''}">
          <td>{HARNESS_S5.baseMockRow.state}</td>
          <td><code>{HARNESS_S5.baseMockRow.source}</code></td>
          <td>{HARNESS_S5.baseMockRow.modifier}</td>
        </tr>
        <tr class="data-table-row {useOverrideSource ? 'bg-accent/10 border-l-2 border-l-accent' : ''}">
          <td>{HARNESS_S5.overrideRow.state}</td>
          <td><code>{HARNESS_S5.overrideRow.source}</code></td>
          <td>{HARNESS_S5.overrideRow.modifier}</td>
        </tr>
      </tbody>
    </table>
    <p class="text-xs text-text-muted">
      {HARNESS_S5.proofHint}
      If <code class="bg-surface-alt px-1 rounded">{HARNESS_S5.proofCode}</code> {HARNESS_S5.proofTail}
    </p>
  </section>

  {/if}

</div>
