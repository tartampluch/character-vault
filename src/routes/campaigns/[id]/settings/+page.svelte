<!--
  @file src/routes/campaigns/[id]/settings/+page.svelte
  @description GM-only Campaign Settings — orchestrates all settings panels.
  Phase 19.12: Migrated to Tailwind CSS — all scoped <style> removed.
  F1 refactoring: split into panel components in src/lib/components/settings/.

  LAYOUT:
    Sticky page header (back link, title, GM badge, Save button).
    Panel 0: Campaign Info    (CampaignInfoPanel)   ← title + description (localised)
    Panel 1: Chapters         (ChaptersPanel)
    Panel 2: Members          (MembershipPanel)
    Panel 3: Rule Sources     (RuleSourcesPanel)
    Panel 4+5: Dice + Stats   (CharacterCreationPanel)
    Panel 6: Variant Rules    (VariantRulesPanel)
    Panel 7: GM Overrides     (GmOverridesPanel)
-->

<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { sessionContext } from '$lib/engine/SessionContext.svelte';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { campaignStore } from '$lib/engine/CampaignStore.svelte';
  import { storageManager, apiHeaders } from '$lib/engine/StorageManager';
  import { dataLoader } from '$lib/engine/DataLoader';
  import { IconSettings, IconBack, IconSuccess } from '$lib/components/ui/icons';
  import { ui } from '$lib/i18n/ui-strings';

  import CampaignInfoPanel     from '$lib/components/settings/CampaignInfoPanel.svelte';
  import RuleSourcesPanel      from '$lib/components/settings/RuleSourcesPanel.svelte';
  import CharacterCreationPanel from '$lib/components/settings/CharacterCreationPanel.svelte';
  import VariantRulesPanel     from '$lib/components/settings/VariantRulesPanel.svelte';
  import ChaptersPanel         from '$lib/components/settings/ChaptersPanel.svelte';
  import GmOverridesPanel      from '$lib/components/settings/GmOverridesPanel.svelte';

  // These types mirror EditableTask/EditableChapter in ChaptersPanel.svelte
  // (Svelte component scripts cannot export types directly).
  interface EditableTask {
    id: string;
    title: Record<string, string>;
    isCompleted: boolean;
  }
  interface EditableChapter {
    id: string;
    title: Record<string, string>;
    description: Record<string, string>;
    isCompleted: boolean;
    tasks: EditableTask[];
  }
  import MembershipPanel       from '$lib/components/settings/MembershipPanel.svelte';

  $effect(() => {
    if (!sessionContext.isGameMaster) goto(`/campaigns/${campaignId}`);
  });

  const campaignId = $derived($page.params.id ?? '');
  const campaign   = $derived(campaignStore.getCampaign(campaignId));

  // ── Campaign Info (title & description) ──────────────────────────────────
  /**
   * Normalises a LocalizedString | string value to a plain Record<string,string>
   * suitable for LocalizedStringEditor:
   *   - LocalizedString object   → used as-is
   *   - JSON-encoded string      → JSON.parsed
   *   - Plain string             → wrapped as { en: value }
   *   - Empty / missing          → { en: '' }
   */
  function toLocalizedRecord(field: Record<string, string> | string | undefined): Record<string, string> {
    if (!field) return { en: '' };
    if (typeof field !== 'string') return { ...field };
    try {
      const parsed = JSON.parse(field);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, string>;
      }
    } catch { /* not JSON */ }
    return { en: field };
  }

  let editableTitle       = $state<Record<string, string>>({ en: '' });
  let editableDescription = $state<Record<string, string>>({ en: '' });
  let infoInitialised     = false;

  $effect(() => {
    const c = campaign;
    if (!c || infoInitialised) return;
    editableTitle       = toLocalizedRecord(c.title as Record<string, string> | string);
    editableDescription = toLocalizedRecord(c.description as Record<string, string> | string);
    infoInitialised = true;
  });

  // ── Enabled rule sources ──────────────────────────────────────────────────
  let enabledSources     = $state<string[]>([]);
  let sourcesInitialised = false;
  $effect(() => {
    const sources = campaign?.enabledRuleSources;
    if (sources && !sourcesInitialised) {
      enabledSources     = [...sources];
      sourcesInitialised = true;
    }
  });

  // ── GM Overrides ──────────────────────────────────────────────────────────
  let gmOverridesText = $state('[]');
  let isValidJson     = $state(true);

  let overridesInitialised = false;
  $effect(() => {
    const overrides = campaign?.gmGlobalOverrides;
    if (overrides && !overridesInitialised) {
      gmOverridesText = overrides;
      overridesInitialised = true;
    }
  });

  // ── Chapters ──────────────────────────────────────────────────────────────
  let editableChapters = $state<EditableChapter[]>([]);
  let syncedUpdatedAt  = $state<number>(-1);
  let chaptersAreDirty = $state(false);

  $effect(() => {
    const c = campaign;
    if (!c) return;
    if (syncedUpdatedAt === -1 || (!chaptersAreDirty && c.updatedAt > syncedUpdatedAt)) {
      editableChapters = (c.chapters ?? []).map(ch => ({
        id: ch.id,
        title: { ...ch.title },
        description: { ...ch.description },
        isCompleted: ch.isCompleted,
        tasks: ((ch as unknown as Record<string, unknown>)['tasks'] as EditableTask[] ?? []).map((t: EditableTask) => ({
          id: t.id,
          title: { ...t.title },
          isCompleted: t.isCompleted,
        })),
      }));
      syncedUpdatedAt  = c.updatedAt;
      chaptersAreDirty = false;
    }
  });

  // ── Dice / Stat-gen / Variant settings ────────────────────────────────────
  let explodingTwenties = $state(false);
  let rerollOnes        = $state(false);
  let pointBuyBudget    = $state(25);
  let allowedRoll       = $state(true);
  let allowedPointBuy   = $state(true);
  let allowedStdArray   = $state(true);
  let variantGestalt    = $state(false);
  let variantVWP        = $state(false);

  const allowedMethods = $derived.by((): Array<'roll' | 'point_buy' | 'standard_array'> => {
    const methods: Array<'roll' | 'point_buy' | 'standard_array'> = [];
    if (allowedRoll)     methods.push('roll');
    if (allowedPointBuy) methods.push('point_buy');
    if (allowedStdArray) methods.push('standard_array');
    return methods;
  });

  let diceSettingsInitialised = false;
  $effect(() => {
    const cs = campaign?.campaignSettings;
    if (!diceSettingsInitialised && cs && !Array.isArray(cs)) {
      explodingTwenties = cs.diceRules?.explodingTwenties            ?? false;
      rerollOnes        = cs.statGeneration?.rerollOnes               ?? false;
      pointBuyBudget    = cs.statGeneration?.pointBuyBudget           ?? 25;
      const methods     = cs.statGeneration?.allowedMethods
                          ?? ['roll', 'point_buy', 'standard_array'];
      allowedRoll       = methods.includes('roll');
      allowedPointBuy   = methods.includes('point_buy');
      allowedStdArray   = methods.includes('standard_array');
      variantGestalt    = cs.variantRules?.gestalt                    ?? false;
      variantVWP        = cs.variantRules?.vitalityWoundPoints        ?? false;
      diceSettingsInitialised = true;
    }
  });

  // ── Save ──────────────────────────────────────────────────────────────────
  let isSaving    = $state(false);
  let saveSuccess = $state('');

  async function saveSettings() {
    if (!isValidJson) return;
    isSaving = true; saveSuccess = '';

    engine.updateSettings({
      enabledRuleSources: [...enabledSources],
      diceRules:      { explodingTwenties },
      statGeneration: { method: allowedMethods[0] ?? 'point_buy', rerollOnes, pointBuyBudget, allowedMethods },
      variantRules:   { gestalt: variantGestalt, vitalityWoundPoints: variantVWP },
    });

    dataLoader
      .loadRuleSources(enabledSources, gmOverridesText)
      .catch(e => console.warn('[Settings] DataLoader reload failed:', e));

    try {
      const chaptersPayload = editableChapters.map(ch => ({
        id: ch.id,
        title: ch.title,
        description: ch.description,
        isCompleted: ch.isCompleted,
        tasks: ch.tasks.map((t: EditableTask) => ({
          id: t.id,
          title: t.title,
          isCompleted: t.isCompleted,
        })),
      }));
      const response = await fetch(`/api/campaigns/${campaignId}`, {
        method: 'PUT',
        headers: apiHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          title:       editableTitle,
          description: editableDescription,
          enabledRuleSources: enabledSources,
          gmGlobalOverrides: gmOverridesText,
          chapters: chaptersPayload,
          diceRules:      { explodingTwenties },
          statGeneration: { method: allowedMethods[0] ?? 'point_buy', rerollOnes, pointBuyBudget, allowedMethods },
          variantRules:   { gestalt: variantGestalt, vitalityWoundPoints: variantVWP },
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      campaignStore.updateCampaign(campaignId, {
        title:       { ...editableTitle },
        description: { ...editableDescription },
        enabledRuleSources: [...enabledSources],
        gmGlobalOverrides: gmOverridesText,
        chapters: chaptersPayload,
        campaignSettings: {
          diceRules:      { explodingTwenties },
          statGeneration: { method: allowedMethods[0] ?? 'point_buy', rerollOnes, pointBuyBudget, allowedMethods },
          variantRules:   { gestalt: variantGestalt, vitalityWoundPoints: variantVWP },
        },
      });
      chaptersAreDirty = false;
      saveSuccess = ui('settings.saved', engine.settings.language);
      setTimeout(() => (saveSuccess = ''), 3000);
    } catch (err) {
      console.warn('[Settings] API unavailable:', err);
      saveSuccess = ui('settings.saved_local', engine.settings.language);
      setTimeout(() => (saveSuccess = ''), 5000);
    } finally {
      isSaving = false;
    }
  }
</script>

<div class="max-w-4xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-5">

  <!-- ── HEADER ───────────────────────────────────────────────────────────── -->
  <header class="flex items-center gap-3 flex-wrap border-b border-border pb-4">
    <a href="/campaigns/{campaignId}" class="inline-flex items-center gap-1 text-xs text-text-muted hover:text-accent transition-colors shrink-0">
      <IconBack size={12} aria-hidden="true" /> {ui('settings.back_campaign', engine.settings.language)}
    </a>
    <h1 class="flex items-center gap-2 text-xl font-bold text-text-primary flex-1">
      <IconSettings size={20} aria-hidden="true" /> {ui('settings.title', engine.settings.language)}
    </h1>
    <div class="flex items-center gap-2">
      <button
        class="btn-primary"
        onclick={saveSettings}
        disabled={isSaving || !isValidJson}
        aria-label={ui('nav.save_campaign_settings_aria', engine.settings.language)}
        type="button"
      >
        {isSaving ? ui('settings.saving', engine.settings.language) : ui('settings.save', engine.settings.language)}
      </button>
    </div>
  </header>

  {#if saveSuccess}
    <div class="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-green-600/40 bg-green-950/20 text-green-400 text-sm" role="status">
      <IconSuccess size={14} aria-hidden="true" /> {saveSuccess}
    </div>
  {/if}

  <CampaignInfoPanel bind:editableTitle bind:editableDescription />

  <ChaptersPanel bind:editableChapters bind:chaptersAreDirty />

  <MembershipPanel {campaignId} />

  <RuleSourcesPanel bind:enabledSources />

  <CharacterCreationPanel
    bind:explodingTwenties
    bind:rerollOnes
    bind:pointBuyBudget
    bind:allowedRoll
    bind:allowedPointBuy
    bind:allowedStdArray
  />

  <VariantRulesPanel bind:variantGestalt bind:variantVWP />

  <GmOverridesPanel bind:gmOverridesText bind:isValidJson />

</div>
