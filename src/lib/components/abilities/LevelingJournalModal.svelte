<!--
  @file src/lib/components/abilities/LevelingJournalModal.svelte
  @description Leveling Journal Modal — explains per-class contributions to BAB,
               saves, skill points, and class skills.

  D&D 3.5 MULTICLASS TRACKING PURPOSE:
    In D&D 3.5, leveling up in different classes yields different amounts of:
      - Base Attack Bonus (full/¾/half progression depends on class)
      - Saving throw bases (good vs. poor saves depend on class)
      - Skill points (2 to 8+INT depending on class)
      - Class skills (which skills cost 1 point vs. 2 points)
    
    When multiclassing, each contributions comes SEPARATELY from each class.
    This modal makes that transparent: the player can see exactly which class
    gave which bonus, making incorrect totals detectable and correctable.

  RANK LOCK / UNLOCK:
    The modal also provides buttons to lock/unlock the current skill ranks.
    "Lock Current Ranks" calls engine.lockAllSkillRanks(), preventing ranks
    from being lowered below current values — simulating a committed level-up.
    "Unlock Ranks" clears all minimums (for character creation / rebuilding).
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { dataLoader } from '$lib/engine/DataLoader';
  import { ui } from '$lib/i18n/ui-strings';
  import Modal from '$lib/components/ui/Modal.svelte';
  import { IconJournal, IconInfo, IconLocked, IconSuccess, IconWarning } from '$lib/components/ui/icons';
  import type { LevelingJournalClassEntry, SkillPointsBudget } from '$lib/engine/GameEngine.svelte';

  interface Props {
    onclose: () => void;
  }

  const { onclose }: Props = $props();

  // ── Reactive data from the engine ──────────────────────────────────────────
  const journal     = $derived(engine.phase4_levelingJournal);
  const budget      = $derived(engine.phase4_skillPointsBudget);
  const lang        = $derived(engine.settings.language);

  // ── Skill points spent/remaining — read directly from the engine.
  //    The D&D 3.5 cross-class cost formula (1 SP/rank class, 2 SP/rank cross-class)
  //    and the remaining/exceeded computations live in `engine.phase4_skill*`
  //    (zero-game-logic-in-Svelte rule, ARCHITECTURE.md §3).
  const skillPointsSpent     = $derived(engine.phase4_skillPointsSpent);
  const skillPointsRemaining = $derived(engine.phase4_skillPointsRemaining);
  const isOverBudget         = $derived(engine.phase4_skillPointsBudgetExceeded);

  /**
   * Returns whether any skill rank minimums are currently locked.
   * Used to show the "Unlock Ranks" button only when relevant.
   */
  const hasLockedRanks = $derived.by(() => {
    const mins = engine.character.minimumSkillRanks;
    if (!mins) return false;
    return Object.values(mins).some(v => v > 0);
  });

  /**
   * Whether multiclassing XP penalty applies.
   * D&D 3.5 SRD: any class more than 1 level below the highest class level
   * triggers a 20% XP penalty for that class. This is informational only —
   * the engine does not auto-apply penalties (that's a GM decision).
   *
   * Delegated to engine.phase_multiclassXpPenaltyRisk to comply with the
   * zero-game-logic-in-Svelte rule (ARCHITECTURE.md §3).
   */
  const multiclassXpPenaltyRisk = $derived(engine.phase_multiclassXpPenaltyRisk);

  /**
   * Formats the SP formula for display in a journal entry card.
   *
   * Examples:
   *   Normal class:      "(2 +2) × 3 = 12"
   *   First class (4×):  "(2 +2) × 3 + 12 (×4 L1 bonus) = 24"
   */
  function formatSpFormula(entry: LevelingJournalClassEntry): string {
    const intMod = budget.intModifier;
    const intStr = intMod >= 0 ? `+${intMod}` : String(intMod);
    // entry.totalSp already reflects the D&D min-1-per-level rule (max(1, spPerLevel + intMod) × classLevel),
    // computed by the engine. We read the result directly rather than recomputing it here.
    if (entry.firstLevelBonus > 0) {
      return `(${entry.spPerLevel} ${intStr}) × ${entry.classLevel} + ${entry.firstLevelBonus} ${ui('journal.sp_first_level_abbr', lang)} = ${entry.totalSp}`;
    }
    return `(${entry.spPerLevel} ${intStr}) × ${entry.classLevel} = ${entry.totalSp}`;
  }

  /**
   * Returns +/sign for a numeric value.
   */
  function signedNum(n: number): string {
    return n >= 0 ? `+${n}` : String(n);
  }

  // ── Rank lock/unlock handlers ────────────────────────────────────────────────
  function lockAllRanks(): void {
    engine.lockAllSkillRanks();
  }

  function unlockAllRanks(): void {
    // Delegates to engine.unlockAllSkillRanks() rather than mutating
    // `engine.character.minimumSkillRanks` directly — engine methods are the
    // sanctioned mutation point (zero-game-logic-in-Svelte rule, ARCHITECTURE.md §3).
    engine.unlockAllSkillRanks();
  }
</script>

<Modal
  open={true}
  onClose={onclose}
  title={ui('journal.title', lang)}
  size="xl"
  fullscreen={true}
>
  <div class="flex flex-col gap-5 pb-2">

    <!-- ── Subtitle + character level summary ───────────────────────────── -->
    <div class="flex items-start justify-between flex-wrap gap-3">
      <div>
        <p class="text-text-muted text-sm">{ui('journal.subtitle', lang)}</p>
        <div class="flex items-center gap-2 mt-1 flex-wrap">
          <span class="badge-blue">{ui('common.level', lang)} {journal.characterLevel}</span>
          {#if journal.perClassBreakdown.length > 1}
            <span class="text-xs text-text-muted">{journal.perClassBreakdown.map(e => `${engine.t(e.classLabel)} ${e.classLevel}`).join(' / ')}</span>
          {/if}
        </div>
      </div>

      <!-- Skill point budget summary -->
      <div class="flex flex-col items-end gap-1">
        <div class="flex items-center gap-1.5 text-sm">
          <span class="text-text-muted text-xs">{ui('journal.skill_points', lang)}:</span>
          <span class="{isOverBudget ? 'text-red-400 font-bold' : 'text-accent font-bold'}">{skillPointsSpent}</span>
          <span class="text-text-muted">/</span>
          <span class="text-green-400 font-bold">{budget.totalAvailable}</span>
          <span class="text-xs {isOverBudget ? 'text-red-400' : 'text-text-muted'}">
            ({skillPointsRemaining >= 0 ? '+' : ''}{skillPointsRemaining})
          </span>
        </div>
      </div>
    </div>

    <!-- ── Multiclass XP penalty warning ─────────────────────────────────── -->
    {#if multiclassXpPenaltyRisk}
      <div class="flex items-start gap-2 rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-yellow-400">
        <IconWarning size={16} class="mt-0.5 shrink-0" aria-hidden="true" />
        <span>{ui('journal.multiclass_warning', lang)}</span>
      </div>
    {/if}

    <!-- ── No-classes state ────────────────────────────────────────────────── -->
    {#if journal.perClassBreakdown.length === 0}
      <div class="text-center py-8 text-text-muted">
        <IconJournal size={32} class="mx-auto mb-3 opacity-30" aria-hidden="true" />
        <p class="text-sm">{ui('journal.no_classes', lang)}</p>
      </div>

    {:else}
      <!-- ── Overview table: totals row per column ──────────────────────── -->
      <div class="overflow-x-auto rounded-lg border border-border">
        <table class="w-full text-sm min-w-[480px]">
          <thead>
            <tr class="bg-surface-alt text-text-muted text-xs uppercase tracking-wider">
              <th class="text-left px-3 py-2">{ui('common.class', lang)}</th>
              <th class="text-center px-2 py-2">{ui('journal.class_level', lang)}</th>
              <th class="text-center px-2 py-2">{ui('journal.bab', lang)}</th>
              <th class="text-center px-2 py-2">{ui('journal.fort', lang)}</th>
              <th class="text-center px-2 py-2">{ui('journal.ref', lang)}</th>
              <th class="text-center px-2 py-2">{ui('journal.will', lang)}</th>
              <th class="text-center px-2 py-2">{ui('journal.skill_points', lang)}</th>
            </tr>
          </thead>
          <tbody>
            {#each journal.perClassBreakdown as entry, i}
              <tr class="{i % 2 === 0 ? 'bg-surface' : 'bg-surface-alt'} hover:bg-accent/5 transition-colors">
                <td class="px-3 py-2 font-medium text-text-primary">
                  {engine.t(entry.classLabel)}
                </td>
                <td class="text-center px-2 py-2 text-text-secondary">{entry.classLevel}</td>
                <td class="text-center px-2 py-2 font-mono text-green-400">{signedNum(entry.totalBab)}</td>
                <td class="text-center px-2 py-2 font-mono text-blue-400">{signedNum(entry.totalFort)}</td>
                <td class="text-center px-2 py-2 font-mono text-blue-400">{signedNum(entry.totalRef)}</td>
                <td class="text-center px-2 py-2 font-mono text-blue-400">{signedNum(entry.totalWill)}</td>
                <td class="text-center px-2 py-2 font-mono text-yellow-400">{entry.totalSp}</td>
              </tr>
            {/each}

            <!-- Bonus SP row (racial, feat) — only if applicable -->
            {#if budget.bonusSpPerLevel > 0}
              <tr class="bg-surface-alt/50 italic text-text-muted text-xs">
                <td class="px-3 py-1.5">
                  {ui('journal.bonus_sp', lang).replace('{bonus}', String(budget.bonusSpPerLevel))}
                </td>
                <td></td><td></td><td></td><td></td><td></td>
                <td class="text-center px-2 py-1.5 font-mono text-yellow-400/70">
                  +{budget.totalBonusPoints}
                </td>
              </tr>
            {/if}

            <!-- Totals row -->
            <tr class="bg-accent/10 border-t border-accent/30 font-semibold">
              <td class="px-3 py-2 text-text-primary uppercase text-xs tracking-wider">
                {ui('journal.totals_row', lang)}
              </td>
              <td class="text-center px-2 py-2 text-text-secondary">{journal.characterLevel}</td>
              <td class="text-center px-2 py-2 font-mono text-green-400">{signedNum(journal.totalBab)}</td>
              <td class="text-center px-2 py-2 font-mono text-blue-400">{signedNum(journal.totalFort)}</td>
              <td class="text-center px-2 py-2 font-mono text-blue-400">{signedNum(journal.totalRef)}</td>
              <td class="text-center px-2 py-2 font-mono text-blue-400">{signedNum(journal.totalWill)}</td>
              <td class="text-center px-2 py-2 font-mono text-yellow-400">{budget.totalAvailable}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- ── Per-class detail cards ─────────────────────────────────────── -->
      <div class="flex flex-col gap-4">
        {#each journal.perClassBreakdown as entry}
          <div class="rounded-lg border border-border bg-surface p-4 flex flex-col gap-3">

            <!-- Card header -->
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="font-semibold text-text-primary">{engine.t(entry.classLabel)}</span>
                <span class="badge-blue text-xs">{ui('journal.class_level_badge', lang).replace('{n}', String(entry.classLevel))}</span>
              </div>
              <div class="flex items-center gap-3 text-xs font-mono">
                <span class="text-green-400" title={ui('journal.bab', lang)}>
                  {ui('journal.bab', lang)} {signedNum(entry.totalBab)}
                </span>
                <span class="text-blue-400" title={ui('journal.fort_ref_will_title', lang)}>
                  {signedNum(entry.totalFort)}/{signedNum(entry.totalRef)}/{signedNum(entry.totalWill)}
                </span>
                <span class="text-yellow-400" title={ui('journal.skill_points', lang)}>
                  {entry.totalSp} {ui('journal.skill_points', lang)}
                </span>
              </div>
            </div>

            <!-- SP formula detail -->
            <div class="text-xs text-text-muted bg-surface-alt rounded px-3 py-2">
              <span class="font-medium text-text-secondary">{ui('journal.skill_points', lang)}: </span>
              {formatSpFormula(entry)}
              {#if budget.intModifier < 0}
                <span class="text-amber-400 ml-1">{ui('journal.sp_min_note', lang)}</span>
              {/if}
            </div>

            <!-- Class skills list -->
            <div class="flex flex-col gap-1.5">
              <span class="text-xs font-semibold uppercase tracking-wider text-text-muted">
                {ui('journal.class_skills_title', lang)}
                <span class="font-normal">({entry.classSkills.length})</span>
              </span>
              {#if entry.classSkills.length === 0}
                <p class="text-xs text-text-muted italic">{ui('journal.class_skills_none', lang)}</p>
              {:else}
                <!-- Wrap class skill badges in a responsive flow layout -->
                <div class="flex flex-wrap gap-1">
                  {#each entry.classSkillLabels as skillLabel}
                    {@const isActive = !!engine.phase4_skills[skillLabel.id]}
                    <span
                      class="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] border
                             {isActive
                               ? 'border-yellow-500/50 bg-yellow-500/10 text-yellow-400'
                               : 'border-border bg-surface-alt text-text-muted opacity-50'}"
                      title={isActive ? ui('skills.class_skill', lang) : ui('journal.skill_not_loaded', lang)}
                    >
                      {#if isActive}
                        <IconSuccess size={10} aria-hidden="true" />
                      {/if}
                      {engine.t(skillLabel.label)}
                    </span>
                  {/each}
                </div>
              {/if}
            </div>

            <!-- Granted features list -->
            {#if entry.grantedFeatureIds.length > 0}
              <div class="flex flex-col gap-1.5">
                <span class="text-xs font-semibold uppercase tracking-wider text-text-muted">
                  {ui('journal.features_title', lang).replace('{lvl}', String(entry.classLevel))}
                </span>
                <div class="flex flex-wrap gap-1">
                  {#each entry.grantedFeatureIds.slice(0, 12) as featureId}
                    {@const feat = dataLoader.getFeature(featureId)}
                    <span class="badge-accent text-[10px]">
                      {feat ? engine.t(feat.label) : featureId.replace(/_/g, ' ')}
                    </span>
                  {/each}
                  {#if entry.grantedFeatureIds.length > 12}
                    <span class="text-[10px] text-text-muted">{ui('journal.n_more', lang).replace('{n}', String(entry.grantedFeatureIds.length - 12))}</span>
                  {/if}
                </div>
              </div>
            {/if}

          </div>
        {/each}
      </div>

      <!-- ── First-level 4× bonus note ─────────────────────────────────── -->
      <div class="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-400">
        <IconInfo size={14} class="mt-0.5 shrink-0" aria-hidden="true" />
        <span>{ui('journal.sp_first_level_note', lang)}</span>
      </div>

      <!-- ── Rank lock / unlock controls ───────────────────────────────── -->
      <div class="flex items-center gap-3 flex-wrap border-t border-border pt-3">
        <div class="flex-1 min-w-0">
          <p class="text-xs text-text-muted">
            {#if hasLockedRanks}
              <span class="inline-flex items-center gap-1 text-amber-400">
                <IconLocked size={12} aria-hidden="true" />
                {ui('journal.ranks_locked_note', lang)}
              </span>
            {:else}
              <span>{ui('journal.ranks_free_note', lang)}</span>
            {/if}
          </p>
        </div>

        <div class="flex gap-2 flex-wrap">
          <!-- Lock all current ranks — prevents lowering below current values -->
          <button
            class="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1"
            onclick={lockAllRanks}
            title={ui('journal.lock_ranks_tooltip', lang)}
            type="button"
          >
            <IconLocked size={14} aria-hidden="true" />
            {ui('journal.lock_ranks_btn', lang)}
          </button>

          <!-- Unlock all ranks — for character creation / rebuilds -->
          {#if hasLockedRanks}
            <button
              class="btn-ghost text-xs px-3 py-1.5 flex items-center gap-1 text-text-muted hover:text-red-400"
              onclick={unlockAllRanks}
              title={ui('journal.unlock_ranks_tooltip', lang)}
              type="button"
            >
              {ui('journal.unlock_ranks_btn', lang)}
            </button>
          {/if}
        </div>
      </div>
    {/if}

  </div>
</Modal>
