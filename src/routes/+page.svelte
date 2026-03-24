<!--
  @file +page.svelte
  @description Phase 5.2 — Test UI for validating the engine's core DAG pipeline.

  PURPOSE: This page is a VALIDATION HARNESS, not a production UI. It validates:
    1. (Phase 5.2) Basic settings toggle (Exploding 20s) → CampaignSettings reactive update.
    2. (Phase 5.2) Total Strength and Total AC display → proves Phase 2/3 DAG is working.
    3. (Phase 5.3) "Attack the Orc" button → proves situational modifiers apply at roll time.
    4. (Phase 5.4) Merge Engine rules → proved by toggling test_override source.

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

    // Load only the test_mock source initially (test_override can be toggled)
    const enabledSources = useOverrideSource
      ? ['test_mock', 'test_override']
      : ['test_mock'];

    dataLoader
      .loadRuleSources(enabledSources)
      .then(() => {
        // Create and load a test character: Human Fighter 2
        const testChar = createEmptyCharacter('test-character-001', 'Test Hero');
        testChar.classLevels = { 'class_fighter': 2 };
        testChar.attributes['stat_strength'].baseValue = 16; // STR 16 → mod +3
        testChar.attributes['stat_dexterity'].baseValue = 14; // DEX 14 → mod +2
        testChar.attributes['stat_constitution'].baseValue = 14; // CON 14 → mod +2
        testChar.attributes['stat_intelligence'].baseValue = 10; // INT 10 → mod 0
        testChar.attributes['stat_wisdom'].baseValue = 10; // WIS 10
        testChar.attributes['stat_charisma'].baseValue = 8;  // CHA 8 → mod -1

        // Add race (Human)
        testChar.activeFeatures.push({
          instanceId: 'afi-race-human',
          featureId: 'race_human',
          isActive: true,
        });

        // Add class (Fighter)
        testChar.activeFeatures.push({
          instanceId: 'afi-class-fighter',
          featureId: 'class_fighter',
          isActive: true,
        });

        // Add Favoured Enemy feat (for situational modifier testing)
        testChar.activeFeatures.push({
          instanceId: 'afi-feat-fe-orc',
          featureId: 'feat_favoured_enemy_orc',
          isActive: true,
        });

        // Equip breastplate (for AC calculation testing)
        testChar.activeFeatures.push({
          instanceId: 'afi-item-breastplate',
          featureId: 'item_breastplate',
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
   */
  let totalStr = $derived(engine.phase2_attributes['stat_strength']?.totalValue ?? engine.character.attributes['stat_strength']?.baseValue ?? 0);
  let strMod = $derived(engine.phase2_attributes['stat_strength']?.derivedModifier ?? 0);

  /**
   * Total Dexterity (for AC calculation display)
   */
  let totalDex = $derived(engine.phase2_attributes['stat_dexterity']?.totalValue ?? 10);
  let dexMod = $derived(engine.phase2_attributes['stat_dexterity']?.derivedModifier ?? 0);

  /**
   * Total AC from Phase 3 DAG.
   * Formula: 10 + armor bonus + DEX modifier + size modifier + other bonuses
   */
  let totalAC = $derived(engine.phase3_combatStats['combatStats.ac_normal']?.totalValue ?? 10);
  let touchAC = $derived(engine.phase3_combatStats['combatStats.ac_touch']?.totalValue ?? 10);

  /**
   * Base Attack Bonus from Phase 3 DAG.
   */
  let bab = $derived(engine.phase3_combatStats['combatStats.base_attack_bonus']?.totalValue ?? 0);

  /**
   * Fortitude save from Phase 3 DAG.
   */
  let fort = $derived(engine.phase3_combatStats['saves.fortitude']?.totalValue ?? 0);

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
   *
   * CRITICAL: The +2 Favoured Enemy bonus does NOT appear in `bab` or `totalStr`
   * on the character sheet. It only appears in the RollResult when attacking an orc.
   */
  function attackOrc() {
    // Get the attack pipeline (combatStats.attack_bonus or bab combined)
    // For this test, we build a minimal pipeline with the Favoured Enemy situational modifier
    const attackPipeline = {
      ...engine.phase3_combatStats['combatStats.base_attack_bonus'] ?? {
        id: 'combatStats.base_attack_bonus',
        label: { en: 'BAB' },
        baseValue: 0,
        activeModifiers: [],
        situationalModifiers: [],
        totalBonus: 0,
        totalValue: bab,
        derivedModifier: 0,
      },
      // Inject situational modifiers from the phase0 flat list
      // (In production, this would be pre-assembled by the GameEngine with weapon pipelines)
      situationalModifiers: engine.phase0_flatModifiers
        .filter(e => e.modifier.situationalContext && e.modifier.targetId === 'combatStats.attack_bonus')
        .map(e => e.modifier),
    };

    // Roll context: we are attacking an Orc
    const rollContext: RollContext = {
      targetTags: ['orc', 'humanoid', 'medium'],
      isAttackOfOpportunity: false,
    };

    // Roll 1d20 + BAB (static bonus) with campaign settings for Exploding 20s
    lastRollResult = parseAndRoll(
      '1d20',
      attackPipeline,
      rollContext,
      engine.settings
    );
  }

  // ===================================================
  // PHASE 5.2: STR Base value editor
  // ===================================================

  function changeStrBase(event: Event) {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    if (!isNaN(value) && value >= 1 && value <= 30) {
      engine.setAttributeBase('stat_strength', value);
    }
  }
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

    {#each [
      { id: 'exploding-twenties', label: 'Exploding 20s (House Rule)', hint: 'If ON: rolling a natural 20 on a d20 triggers an additional die roll added to the total.', checked: engine.settings.diceRules.explodingTwenties, onchange: toggleExplodingTwenties, value: engine.settings.diceRules.explodingTwenties ? 'ON' : 'OFF' },
      { id: 'override-source', label: 'Enable test_override rule source (Phase 5.4)', hint: 'If ON: loads test_override.json AFTER test_mock.json. Proves merge semantics.', checked: useOverrideSource, onchange: toggleOverrideSource, value: useOverrideSource ? 'ENABLED' : 'DISABLED' },
    ] as row}
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

      <!-- STR panel -->
      <div class="flex flex-col gap-1.5 p-3 rounded-lg border border-border bg-surface-alt">
        <label for="str-base" class="text-xs font-semibold uppercase tracking-wider text-accent">Strength (STR)</label>
        <div class="flex items-center gap-2">
          <span class="flex-1 text-xs text-text-muted">Base:</span>
          <input id="str-base" type="number" min="1" max="30" value={engine.character.attributes['stat_strength']?.baseValue ?? 10} onchange={changeStrBase} class="input w-16 text-center text-sm px-1" />
        </div>
        <div class="flex items-center justify-between px-1 py-1 rounded bg-accent/10">
          <span class="text-xs text-text-muted">Total:</span>
          <code class="text-base font-bold text-sky-400 font-mono">{totalStr}</code>
        </div>
        <div class="flex items-center justify-between px-1">
          <span class="text-xs text-text-muted">Modifier:</span>
          <code class="text-sm font-semibold text-green-400 font-mono">{formatModifier(strMod)}</code>
        </div>
      </div>

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

      <!-- Combat stats panel -->
      <div class="flex flex-col gap-1.5 p-3 rounded-lg border border-border bg-surface-alt">
        <span class="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-accent">
          <IconAttacks size={14} aria-hidden="true" /> Combat Stats
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
      <IconAttacks size={18} aria-hidden="true" /> Situational Modifier Test — "Attack the Orc" (Phase 5.3)
    </h2>
    <p class="text-xs text-text-muted leading-relaxed">
      The character has <strong class="text-text-secondary">Favoured Enemy: Orc</strong>, granting
      <strong class="text-text-secondary">+2 to attack vs Orcs</strong>.
      This is SITUATIONAL — it does NOT appear in BAB. It only activates at roll time when the target has the "orc" tag.
    </p>

    <button
      class="btn-danger gap-2 self-start"
      onclick={attackOrc}
      disabled={!isInitialized}
      type="button"
    >
      <IconAttacks size={16} aria-hidden="true" /> Attack the Orc! (Roll 1d20 + BAB)
    </button>

    {#if lastRollResult}
      <div
        class="flex flex-col gap-3 p-4 rounded-lg border
          {lastRollResult.isCriticalThreat ? 'border-yellow-500/60 bg-yellow-950/20'
          : lastRollResult.isAutomaticMiss  ? 'border-red-600/60 bg-red-950/20'
          : 'border-border bg-surface-alt'}"
      >
        <!-- Headline -->
        <h3 class="text-base font-bold
          {lastRollResult.isCriticalThreat ? 'text-yellow-400'
          : lastRollResult.isAutomaticMiss  ? 'text-red-400'
          : 'text-sky-400'}">
          {#if lastRollResult.isCriticalThreat}CRITICAL HIT!{:else if lastRollResult.isAutomaticMiss}FUMBLE!{:else}Roll Result{/if}
        </h3>

        <!-- Breakdown rows -->
        <div class="flex flex-col gap-1 text-sm">
          {#each [
            { label: 'Formula',         value: lastRollResult.formula,                               cls: 'text-text-secondary' },
            { label: 'Dice Rolls',      value: '[' + lastRollResult.diceRolls.join(', ') + ']',     cls: 'text-sky-400 font-mono' },
            { label: 'Natural Total',   value: String(lastRollResult.naturalTotal),                  cls: 'text-sky-400 font-bold' },
            { label: 'Static Bonus (BAB)', value: formatModifier(lastRollResult.staticBonus),        cls: 'text-accent' },
          ] as row}
            <div class="flex items-center gap-3">
              <span class="text-text-muted w-40 shrink-0 text-xs">{row.label}:</span>
              <code class="{row.cls} font-mono">{row.value}</code>
            </div>
          {/each}

          <!-- Situational row (highlighted) -->
          <div class="flex items-center gap-3 px-2 py-1.5 rounded bg-accent/10">
            <span class="text-text-muted w-40 shrink-0 text-xs">Situational (vs Orc):</span>
            <code class="font-mono {lastRollResult.situationalBonusApplied > 0 ? 'text-green-400' : 'text-text-muted'}">
              {formatModifier(lastRollResult.situationalBonusApplied)}
            </code>
            {#if lastRollResult.situationalBonusApplied > 0}
              <span class="text-xs text-green-400 flex items-center gap-1"><IconSuccess size={12} aria-hidden="true" /> Applied! (+2 FE)</span>
            {:else}
              <span class="text-xs text-text-muted flex items-center gap-1"><IconWarning size={12} aria-hidden="true" /> Not applied</span>
            {/if}
          </div>

          <!-- Final total row -->
          <div class="flex items-center gap-3 pt-1.5 border-t border-border">
            <span class="text-text-muted w-40 shrink-0 text-xs">Final Total:</span>
            <code class="text-2xl font-bold text-yellow-400 font-mono">{lastRollResult.finalTotal}</code>
          </div>
        </div>

        {#if lastRollResult.numberOfExplosions > 0}
          <span class="badge-yellow font-bold w-fit">EXPLOSION ×{lastRollResult.numberOfExplosions}</span>
        {/if}

        <p class="text-xs text-text-muted leading-relaxed pt-1 border-t border-border">
          {#if lastRollResult.situationalBonusApplied > 0}
            <IconSuccess size={12} class="inline text-green-400" aria-hidden="true" />
            <strong class="text-green-400">PROOF:</strong> The +2 Favoured Enemy bonus ONLY applied here (roll time), NOT in BAB ({formatModifier(bab)}).
          {:else}
            <IconWarning size={12} class="inline text-yellow-400" aria-hidden="true" />
            Situational bonus not applied. Verify feat is loaded and target has "orc" tag.
          {/if}
        </p>
      </div>
    {/if}
  </section>

  <!-- SECTION 4: Merge Engine Test -->
  <section class="card p-4 flex flex-col gap-3">
    <h2 class="section-header border-b border-border pb-2">
      Merge Engine Test (Phase 5.4)
    </h2>
    <p class="text-xs text-text-muted">Enable <strong class="text-text-secondary">test_override</strong> in Settings above to test merge semantics.</p>

    {#if dataLoader.getFeature('race_human')}
      {@const raceHuman = dataLoader.getFeature('race_human')}
      <div class="flex flex-col gap-1.5 p-3 rounded-lg border border-border bg-surface-alt text-xs font-mono">
        <div><strong class="text-text-secondary">ID:</strong> <code>{raceHuman?.id}</code></div>
        <div><strong class="text-text-secondary">ruleSource:</strong> <code>{raceHuman?.ruleSource}</code></div>
        <div><strong class="text-text-secondary">Label:</strong> <code>{engine.t(raceHuman?.label ?? {})}</code></div>
        <div><strong class="text-text-secondary">Tags:</strong> <code>[{raceHuman?.tags.join(', ')}]</code></div>
        <div class="flex flex-col gap-0.5">
          <strong class="text-text-secondary">Modifiers:</strong>
          {#each (raceHuman?.grantedModifiers ?? []) as mod}
            <div class="pl-3 text-text-muted">
              <code>{mod.id}</code>: → <code>{mod.targetId}</code>
              <code class="text-green-400">{formatModifier(typeof mod.value === 'number' ? mod.value : 0)}</code>
              (<code>{mod.type}</code>)
            </div>
          {/each}
        </div>
      </div>
    {:else}
      <p class="text-xs text-text-muted italic">race_human not loaded (load rules first)</p>
    {/if}

    <!-- Expectation table -->
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
          <td>test_mock only</td>
          <td><code>test_mock</code></td>
          <td>+1 bonus_feat_slots (racial)</td>
        </tr>
        <tr class="data-table-row {useOverrideSource ? 'bg-accent/10 border-l-2 border-l-accent' : ''}">
          <td>test_override enabled</td>
          <td><code>test_override</code></td>
          <td>+2 stat_intelligence (racial) — bonus feat GONE</td>
        </tr>
      </tbody>
    </table>
    <p class="text-xs text-text-muted">Highlighted row = current state. If <code class="bg-surface-alt px-1 rounded">ruleSource: test_override</code> shows after enabling, replace semantics work.</p>
  </section>

  {/if}

</div>
