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
        testChar.attributes['stat_str'].baseValue = 16; // STR 16 → mod +3
        testChar.attributes['stat_dex'].baseValue = 14; // DEX 14 → mod +2
        testChar.attributes['stat_con'].baseValue = 14; // CON 14 → mod +2
        testChar.attributes['stat_int'].baseValue = 10; // INT 10 → mod 0
        testChar.attributes['stat_wis'].baseValue = 10; // WIS 10
        testChar.attributes['stat_cha'].baseValue = 8;  // CHA 8 → mod -1

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
  let totalStr = $derived(engine.phase2_attributes['stat_str']?.totalValue ?? engine.character.attributes['stat_str']?.baseValue ?? 0);
  let strMod = $derived(engine.phase2_attributes['stat_str']?.derivedModifier ?? 0);

  /**
   * Total Dexterity (for AC calculation display)
   */
  let totalDex = $derived(engine.phase2_attributes['stat_dex']?.totalValue ?? 10);
  let dexMod = $derived(engine.phase2_attributes['stat_dex']?.derivedModifier ?? 0);

  /**
   * Total AC from Phase 3 DAG.
   * Formula: 10 + armor bonus + DEX modifier + size modifier + other bonuses
   */
  let totalAC = $derived(engine.phase3_combatStats['combatStats.ac_normal']?.totalValue ?? 10);
  let touchAC = $derived(engine.phase3_combatStats['combatStats.ac_touch']?.totalValue ?? 10);

  /**
   * Base Attack Bonus from Phase 3 DAG.
   */
  let bab = $derived(engine.phase3_combatStats['combatStats.bab']?.totalValue ?? 0);

  /**
   * Fortitude save from Phase 3 DAG.
   */
  let fort = $derived(engine.phase3_combatStats['saves.fort']?.totalValue ?? 0);

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
      ...engine.phase3_combatStats['combatStats.bab'] ?? {
        id: 'combatStats.bab',
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
      engine.setAttributeBase('stat_str', value);
    }
  }
</script>

<main class="test-harness">
  <header>
    <h1>⚔️ Character Vault — Engine Test Harness (Phase 5)</h1>
    <p class="subtitle">
      Validation UI — proves the DAG pipeline, situational modifiers, house rules, and merge engine.
    </p>
  </header>

  <!-- ================================================== -->
  <!-- LOADING STATE -->
  <!-- ================================================== -->
  {#if !isInitialized && !loadError}
    <section class="status-panel loading">
      <p>⏳ Loading rule sources...</p>
    </section>
  {:else if loadError}
    <section class="status-panel error">
      <p>❌ Failed to load rules: {loadError}</p>
      <p><small>Check that <code>static/rules/manifest.json</code> exists and is accessible.</small></p>
    </section>
  {:else}

  <!-- ================================================== -->
  <!-- SECTION 1: Campaign Settings -->
  <!-- ================================================== -->
  <section class="panel">
    <h2>⚙️ Campaign Settings</h2>

    <div class="setting-row">
      <label for="exploding-twenties">
        <strong>Exploding 20s (House Rule)</strong>
        <span class="hint">If ON: rolling a natural 20 on a d20 triggers an additional die roll that is added to the total.</span>
      </label>
      <input
        id="exploding-twenties"
        type="checkbox"
        checked={engine.settings.diceRules.explodingTwenties}
        onchange={toggleExplodingTwenties}
      />
      <code class="value-display">{engine.settings.diceRules.explodingTwenties ? 'ON' : 'OFF'}</code>
    </div>

    <div class="setting-row">
      <label for="override-source">
        <strong>Enable test_override rule source (Phase 5.4)</strong>
        <span class="hint">If ON: loads test_override.json AFTER test_mock.json. Proves merge: "replace" and merge: "partial" semantics.</span>
      </label>
      <input
        id="override-source"
        type="checkbox"
        checked={useOverrideSource}
        onchange={toggleOverrideSource}
      />
      <code class="value-display">{useOverrideSource ? 'ENABLED' : 'DISABLED'}</code>
    </div>
  </section>

  <!-- ================================================== -->
  <!-- SECTION 2: Character Stats (DAG Output — Phase 5.2) -->
  <!-- ================================================== -->
  <section class="panel">
    <h2>📊 Character Statistics — DAG Output</h2>
    <p class="hint">
      These values are computed by the reactive DAG ($derived chain). Changes to base values
      automatically cascade through the pipeline.
    </p>

    <div class="stats-grid">

      <div class="stat-block">
        <label for="str-base">
          <h3>💪 Strength (STR)</h3>
        </label>
        <div class="stat-row">
          <span class="label">Base Score:</span>
          <input
            id="str-base"
            type="number"
            min="1" max="30"
            value={engine.character.attributes['stat_str']?.baseValue ?? 10}
            onchange={changeStrBase}
            class="stat-input"
          />
        </div>
        <div class="stat-row highlight">
          <span class="label">Total Value:</span>
          <code class="value">{totalStr}</code>
        </div>
        <div class="stat-row">
          <span class="label">Modifier:</span>
          <code class="value modifier">{formatModifier(strMod)}</code>
        </div>
      </div>

      <div class="stat-block">
        <h3>🛡️ Armor Class (AC)</h3>
        <div class="stat-row highlight">
          <span class="label">Normal AC:</span>
          <code class="value">{totalAC}</code>
        </div>
        <div class="stat-row">
          <span class="label">Touch AC:</span>
          <code class="value">{touchAC}</code>
        </div>
        <div class="stat-row">
          <span class="label">DEX mod ({totalDex}):</span>
          <code class="value modifier">{formatModifier(dexMod)}</code>
        </div>
      </div>

      <div class="stat-block">
        <h3>⚔️ Combat Stats</h3>
        <div class="stat-row">
          <span class="label">Character Level:</span>
          <code class="value">{characterLevel}</code>
        </div>
        <div class="stat-row highlight">
          <span class="label">Base Attack Bonus:</span>
          <code class="value">{formatModifier(bab)}</code>
        </div>
        <div class="stat-row">
          <span class="label">Fortitude Save:</span>
          <code class="value">{formatModifier(fort)}</code>
        </div>
      </div>

    </div>

    <div class="active-tags">
      <span class="label">Active Tags ({activeTags.length}):</span>
      {#if activeTags.length === 0}
        <em class="hint">No tags (no features loaded or DataLoader cache empty)</em>
      {:else}
        <div class="tag-list">
          {#each activeTags as tag}
            <span class="tag">{tag}</span>
          {/each}
        </div>
      {/if}
    </div>
  </section>

  <!-- ================================================== -->
  <!-- SECTION 3: Situational Modifier Test (Phase 5.3) -->
  <!-- ================================================== -->
  <section class="panel">
    <h2>🎯 Situational Modifier Test — "Attack the Orc" (Phase 5.3)</h2>
    <p class="hint">
      The character has the <strong>Favoured Enemy: Orc</strong> feat, granting <strong>+2 to attack</strong>
      vs Orcs. This modifier is SITUATIONAL — it does NOT appear in the BAB above.
      It only activates at roll time when the target has the "orc" tag.
      Click the button to prove this.
    </p>

    <button
      class="attack-button"
      onclick={attackOrc}
      disabled={!isInitialized}
    >
      ⚔️ Attack the Orc! (Roll 1d20 + BAB vs Orc target)
    </button>

    {#if lastRollResult}
      <div class="roll-result" class:critical={lastRollResult.isCriticalThreat} class:fumble={lastRollResult.isAutomaticMiss}>
        <h3>
          {#if lastRollResult.isCriticalThreat}🎯 CRITICAL HIT!{:else if lastRollResult.isAutomaticMiss}💀 FUMBLE!{:else}🎲 Roll Result{/if}
        </h3>

        <div class="roll-breakdown">
          <div class="roll-row">
            <span class="label">Formula:</span>
            <code>{lastRollResult.formula}</code>
          </div>
          <div class="roll-row">
            <span class="label">Dice Rolls:</span>
            <code>[{lastRollResult.diceRolls.join(', ')}]</code>
          </div>
          <div class="roll-row">
            <span class="label">Natural Total:</span>
            <code class="natural">{lastRollResult.naturalTotal}</code>
            {#if lastRollResult.numberOfExplosions > 0}
              <span class="explosion-badge">💥 EXPLOSION ×{lastRollResult.numberOfExplosions}</span>
            {/if}
          </div>
          <div class="roll-row">
            <span class="label">Static Bonus (BAB):</span>
            <code>{formatModifier(lastRollResult.staticBonus)}</code>
          </div>
          <div class="roll-row situational">
            <span class="label">Situational Bonus (vs Orc):</span>
            <code class="situational-value">
              {formatModifier(lastRollResult.situationalBonusApplied)}
              {#if lastRollResult.situationalBonusApplied > 0}
                ✅ Applied! (+2 Favoured Enemy)
              {:else}
                ⚠️ Not applied (target lacks "orc" tag, or feat not equipped)
              {/if}
            </code>
          </div>
          <div class="roll-row total">
            <span class="label">Final Total:</span>
            <code class="final-total">{lastRollResult.finalTotal}</code>
          </div>
        </div>

        <p class="roll-explanation">
          {#if lastRollResult.situationalBonusApplied > 0}
            ✅ <strong>PROOF:</strong> The +2 Favoured Enemy bonus ONLY applied here (at roll time),
            NOT in the BAB ({formatModifier(bab)}) shown above. This confirms that situational modifiers
            are correctly isolated in the pipeline and applied only by the Dice Engine when the target
            context matches.
          {:else}
            ⚠️ Situational bonus not applied. Verify that the feat is loaded and the target has the "orc" tag.
          {/if}
        </p>
      </div>
    {/if}
  </section>

  <!-- ================================================== -->
  <!-- SECTION 4: Merge Engine Test (Phase 5.4) -->
  <!-- ================================================== -->
  <section class="panel">
    <h2>🔀 Merge Engine Test (Phase 5.4)</h2>
    <p class="hint">
      Enable the <strong>test_override</strong> rule source above (⚙️ Settings) to test merge semantics.
    </p>

    <div class="merge-test">
      <h3>Current race_human state (from DataLoader cache):</h3>
      {#if dataLoader.getFeature('race_human')}
        {@const raceHuman = dataLoader.getFeature('race_human')}
        <div class="entity-debug">
          <div class="field"><strong>ID:</strong> <code>{raceHuman?.id}</code></div>
          <div class="field"><strong>ruleSource:</strong> <code>{raceHuman?.ruleSource}</code></div>
          <div class="field"><strong>Label (en):</strong> <code>{engine.t(raceHuman?.label ?? {})}</code></div>
          <div class="field"><strong>Tags:</strong> <code>[{raceHuman?.tags.join(', ')}]</code></div>
          <div class="field">
            <strong>Modifiers:</strong>
            <div class="modifier-list">
              {#each (raceHuman?.grantedModifiers ?? []) as mod}
                <div class="mod-item">
                  <code>{mod.id}</code>: targets <code>{mod.targetId}</code>, value
                  <code class="value">{formatModifier(typeof mod.value === 'number' ? mod.value : 0)}</code>
                  (type: <code>{mod.type}</code>)
                </div>
              {/each}
            </div>
          </div>
        </div>
      {:else}
        <p class="hint">race_human not loaded (DataLoader cache empty — load rules first)</p>
      {/if}

      <div class="merge-expectations">
        <h4>Expected values by merge state:</h4>
        <table class="expectations-table">
          <thead>
            <tr>
              <th>State</th>
              <th>Expected ruleSource</th>
              <th>Expected modifier</th>
            </tr>
          </thead>
          <tbody>
            <tr class:active={!useOverrideSource}>
              <td>test_mock only (no override)</td>
              <td><code>test_mock</code></td>
              <td>+1 bonus_feat_slots (racial)</td>
            </tr>
            <tr class:active={useOverrideSource}>
              <td>test_override enabled (replace)</td>
              <td><code>test_override</code></td>
              <td>+2 stat_int (racial) — bonus feat GONE</td>
            </tr>
          </tbody>
        </table>
        <p class="hint">
          The highlighted row matches the current state.
          If the DataLoader shows <code>ruleSource: test_override</code> after enabling the override,
          the replace merge semantics are correctly implemented. ✅
        </p>
      </div>
    </div>
  </section>

  {/if}
</main>

<style>
  :global(body) {
    font-family: 'Segoe UI', system-ui, sans-serif;
    background: #1a1a2e;
    color: #e0e0e0;
    margin: 0;
    padding: 0;
  }

  .test-harness {
    max-width: 960px;
    margin: 0 auto;
    padding: 1.5rem;
  }

  header {
    border-bottom: 2px solid #7c3aed;
    padding-bottom: 1rem;
    margin-bottom: 1.5rem;
  }

  h1 {
    margin: 0 0 0.25rem;
    font-size: 1.6rem;
    color: #f0f0ff;
  }

  .subtitle {
    color: #9090b0;
    font-size: 0.9rem;
    margin: 0;
  }

  .panel {
    background: #16213e;
    border: 1px solid #2d2d5e;
    border-radius: 8px;
    padding: 1.25rem;
    margin-bottom: 1.25rem;
  }

  .panel h2 {
    margin: 0 0 0.75rem;
    font-size: 1.15rem;
    color: #a78bfa;
    border-bottom: 1px solid #2d2d5e;
    padding-bottom: 0.5rem;
  }

  .hint {
    font-size: 0.8rem;
    color: #8080a0;
    margin-bottom: 0.75rem;
  }

  .setting-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0;
    border-bottom: 1px solid #2d2d5e;
  }

  .setting-row label {
    flex: 1;
    cursor: pointer;
  }

  .setting-row label strong {
    display: block;
    color: #e0e0ff;
  }

  .value-display {
    background: #0f3460;
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    font-size: 0.85rem;
    min-width: 3rem;
    text-align: center;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .stat-block {
    background: #0f1b35;
    border: 1px solid #2d2d5e;
    border-radius: 6px;
    padding: 0.75rem;
  }

  .stat-block h3 {
    margin: 0 0 0.5rem;
    font-size: 0.95rem;
    color: #c4b5fd;
  }

  .stat-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.2rem 0;
  }

  .stat-row.highlight {
    background: #1a2a50;
    border-radius: 4px;
    padding: 0.3rem 0.4rem;
  }

  .stat-row .label {
    flex: 1;
    font-size: 0.85rem;
    color: #9090c0;
  }

  code.value {
    background: #1e3a5f;
    padding: 0.1rem 0.4rem;
    border-radius: 3px;
    font-size: 1rem;
    min-width: 2.5rem;
    text-align: center;
    color: #7dd3fc;
  }

  code.modifier {
    color: #86efac;
  }

  .stat-input {
    width: 60px;
    background: #0f3460;
    border: 1px solid #4a4a8a;
    border-radius: 4px;
    color: #e0e0ff;
    padding: 0.2rem 0.4rem;
    font-size: 0.9rem;
    text-align: center;
  }

  .active-tags {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    flex-wrap: wrap;
    padding-top: 0.5rem;
    border-top: 1px solid #2d2d5e;
  }

  .tag-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }

  .tag {
    background: #2d1b69;
    color: #c4b5fd;
    padding: 0.1rem 0.5rem;
    border-radius: 12px;
    font-size: 0.75rem;
    border: 1px solid #4c35a0;
  }

  .attack-button {
    background: #7c1d1d;
    color: #fca5a5;
    border: 1px solid #dc2626;
    border-radius: 6px;
    padding: 0.6rem 1.5rem;
    font-size: 1rem;
    cursor: pointer;
    transition: background 0.2s;
    margin-bottom: 1rem;
  }

  .attack-button:hover:not(:disabled) {
    background: #991b1b;
  }

  .attack-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .roll-result {
    background: #0f2030;
    border: 1px solid #1e418a;
    border-radius: 6px;
    padding: 1rem;
  }

  .roll-result.critical {
    border-color: #d97706;
    background: #1c1000;
  }

  .roll-result.fumble {
    border-color: #dc2626;
    background: #1c0000;
  }

  .roll-result h3 {
    margin: 0 0 0.75rem;
    color: #93c5fd;
  }

  .roll-result.critical h3 { color: #fbbf24; }
  .roll-result.fumble h3 { color: #f87171; }

  .roll-breakdown {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .roll-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .roll-row .label {
    width: 200px;
    font-size: 0.85rem;
    color: #8080c0;
    flex-shrink: 0;
  }

  .roll-row.situational {
    background: #0f2540;
    border-radius: 4px;
    padding: 0.3rem 0.4rem;
  }

  .roll-row.total {
    border-top: 1px solid #2d4080;
    padding-top: 0.4rem;
    margin-top: 0.2rem;
  }

  code.natural {
    font-size: 1.1rem;
    color: #7dd3fc;
  }

  code.situational-value {
    color: #86efac;
  }

  code.final-total {
    font-size: 1.3rem;
    color: #fbbf24;
    font-weight: bold;
  }

  .explosion-badge {
    background: #d97706;
    color: #000;
    padding: 0.1rem 0.6rem;
    border-radius: 12px;
    font-size: 0.8rem;
    font-weight: bold;
  }

  .roll-explanation {
    margin-top: 0.75rem;
    padding-top: 0.5rem;
    border-top: 1px solid #2d4080;
    font-size: 0.85rem;
    color: #9090c0;
  }

  .entity-debug {
    background: #0a1628;
    border: 1px solid #2d2d5e;
    border-radius: 4px;
    padding: 0.75rem;
    font-size: 0.85rem;
  }

  .field {
    margin-bottom: 0.3rem;
  }

  .modifier-list {
    margin-top: 0.3rem;
    padding-left: 1rem;
  }

  .mod-item {
    margin-bottom: 0.2rem;
    color: #9090c0;
  }

  .mod-item code.value {
    color: #86efac;
  }

  .merge-expectations {
    margin-top: 1rem;
  }

  .expectations-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }

  .expectations-table th,
  .expectations-table td {
    border: 1px solid #2d2d5e;
    padding: 0.4rem 0.6rem;
    text-align: left;
  }

  .expectations-table th {
    background: #1a1a4a;
    color: #a78bfa;
  }

  .expectations-table tr.active {
    background: #0f3060;
  }

  .status-panel {
    padding: 1.5rem;
    border-radius: 8px;
    text-align: center;
  }

  .status-panel.loading {
    background: #1a2030;
    border: 1px solid #4a4a6a;
  }

  .status-panel.error {
    background: #1c0000;
    border: 1px solid #dc2626;
    color: #fca5a5;
  }
</style>
