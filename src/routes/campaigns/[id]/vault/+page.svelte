<!--
  @file src/routes/campaigns/[id]/vault/+page.svelte
  @description The Character Vault — all adventurers for this campaign.
  Phase 19.12: Migrated to Tailwind CSS — all scoped <style> removed.

  LAYOUT:
    Page header: back link, title, campaign subtitle, action buttons.
    Visibility info badge (dev convenience).
    Character grid (responsive auto-fill) or empty state with CTAs.
-->

<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { engine, createEmptyCharacter } from '$lib/engine/GameEngine.svelte';
  import { sessionContext } from '$lib/engine/SessionContext.svelte';
  import { campaignStore } from '$lib/engine/CampaignStore.svelte';
  import { dataLoader } from '$lib/engine/DataLoader';
  import { ui } from '$lib/i18n/ui-strings';
  import { createDefaultCampaignSettings } from '$lib/types/settings';
  import CharacterCard from '$lib/components/vault/CharacterCard.svelte';
  import { IconVault, IconAddCharacter, IconNPC, IconGMDashboard, IconCharacter, IconCampaign, IconBack } from '$lib/components/ui/icons';

  const campaignId = $derived($page.params.id ?? '');
  const campaign   = $derived(campaignStore.getCampaign(campaignId));

  $effect(() => {
    sessionContext.setActiveCampaign(campaignId);
    engine.loadVaultCharacters();
  });

  // Reload rule sources whenever the campaign's enabledRuleSources changes.
  // This $effect is intentionally separate so it re-runs when loadFromApi()
  // updates the campaign store (which changes campaign.enabledRuleSources).
  // The JSON.stringify ensures the effect re-runs even if the array reference
  // changes but the contents are the same (avoids duplicate loads).
  let lastSourcesKey = '';
  $effect(() => {
    const sources = campaign?.enabledRuleSources ?? [];
    const overrides = campaign?.gmGlobalOverrides;
    const key = JSON.stringify(sources) + (overrides ?? '');
    if (key === lastSourcesKey) return;
    lastSourcesKey = key;

    // Apply per-campaign rule settings (diceRules, statGeneration, variantRules)
    // whenever the campaign changes, so all players share the same campaign rules.
    // Guard: PHP json_decode('{}', true) can return [] (empty array) for a never-saved
    // settings blob; an empty array is truthy in JS but has no diceRules/etc fields,
    // which would silently reset the engine to defaults.  Only apply when cs is a
    // non-null, non-array object (i.e. has at least one settings key).
    const cs = campaign?.campaignSettings;
    if (cs && !Array.isArray(cs)) {
      const defaults = createDefaultCampaignSettings();
      engine.updateSettings({
        diceRules:      { ...defaults.diceRules,      ...(cs.diceRules      ?? {}) },
        statGeneration: { ...defaults.statGeneration, ...(cs.statGeneration ?? {}) },
        variantRules:   { ...defaults.variantRules,   ...(cs.variantRules   ?? {}) },
      });
    }

    // Always call loadRuleSources, even when sources is empty.
    // An empty array is the permissive mode: DataLoader loads ALL rule files.
    // Previously this was guarded by `if (sources.length > 0)`, which meant
    // new campaigns with the default empty array would NEVER initialize the
    // DataLoader, leaving the engine with no features, classes, or config tables.
    dataLoader
      .loadRuleSources(sources, overrides)
      .then(() => engine.bumpDataLoaderVersion())
      .catch(err => console.warn('[Vault] Failed to load rule sources:', err));
  });

  function createNewCharacter() {
    const id = `char_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const newChar = createEmptyCharacter(id, ui('vault.default_char_name', engine.settings.language));
    newChar.campaignId = campaignId;
    newChar.ownerId    = sessionContext.currentUserId;
    newChar.isNPC      = false;
    engine.addCharacterToVault(newChar);
    goto(`/character/${id}?tab=core`);
  }

  function addNPCMonster() {
    const id = `npc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const newNPC = createEmptyCharacter(id, ui('vault.default_npc_name', engine.settings.language));
    newNPC.campaignId = campaignId;
    newNPC.ownerId    = sessionContext.currentUserId;
    newNPC.isNPC      = true;
    engine.addCharacterToVault(newNPC);
    goto(`/character/${id}?tab=core`);
  }

  function openCharacter(characterId: string) {
    engine.loadCharacter(
      engine.allVaultCharacters.find(c => c.id === characterId) ?? engine.character
    );
    goto(`/character/${characterId}?tab=core`);
  }

  /**
   * Returns true when the current user is allowed to delete the given character.
   *   - GMs can delete any character (PCs, NPCs, monsters).
   *   - Players can only delete characters they own.
   */
  function canDelete(character: { ownerId?: string }): boolean {
    return sessionContext.isGameMaster || character.ownerId === sessionContext.currentUserId;
  }

  /**
   * Asks for confirmation then removes the character from the vault.
   * Linked characters (mounts, followers) are NOT deleted — only the
   * selected character's own data is removed.
   */
  function handleDelete(character: { id: string; name: string }) {
    if (!confirm(ui('vault.delete_confirm', engine.settings.language).replace('{name}', character.name))) return;
    engine.removeCharacterFromVault(character.id);
  }
</script>

<div class="max-w-5xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-5">

  <!-- ── HEADER ───────────────────────────────────────────────────────────── -->
  <header class="flex items-start justify-between gap-3 flex-wrap">
    <div class="flex flex-col gap-0.5">
      <a href="/campaigns/{campaignId}" class="inline-flex items-center gap-1 text-xs text-text-muted hover:text-accent transition-colors">
        <IconBack size={12} aria-hidden="true" /> {ui('common.campaign', engine.settings.language)}
      </a>
      <h1 class="flex items-center gap-2 text-2xl font-bold text-text-primary">
        <IconVault size={24} aria-hidden="true" /> {ui('vault.title', engine.settings.language)}
      </h1>
      {#if campaign}
        <p class="text-sm text-text-muted">{campaign.title}</p>
      {/if}
    </div>

    <div class="flex items-center gap-2 flex-wrap">
      <button class="btn-primary gap-1" onclick={createNewCharacter} type="button">
        <IconAddCharacter size={15} aria-hidden="true" /> {ui('vault.create_character', engine.settings.language)}
      </button>
      {#if sessionContext.isGameMaster}
        <button class="btn-secondary gap-1 text-red-400 border-red-800/60 hover:border-red-600" onclick={addNPCMonster} type="button">
          <IconNPC size={15} aria-hidden="true" /> {ui('vault.add_npc', engine.settings.language)}
        </button>
      {/if}
    </div>
  </header>

  <!-- ── VISIBILITY INFO ──────────────────────────────────────────────────── -->
  <div aria-live="polite">
    {#if sessionContext.isGameMaster}
      <span class="badge-accent flex items-center gap-1 w-fit text-xs">
        <IconGMDashboard size={12} aria-hidden="true" />
        {ui('vault.gm_view', engine.settings.language)} — {engine.visibleCharacters.length} {ui('vault.characters', engine.settings.language)}
      </span>
    {:else}
      <span class="badge-gray flex items-center gap-1 w-fit text-xs">
        <IconCharacter size={12} aria-hidden="true" />
        {ui('vault.player_view', engine.settings.language)} — {engine.visibleCharacters.length} {ui('vault.characters', engine.settings.language)}
      </span>
    {/if}
  </div>

  <!-- ── CHARACTER GRID or EMPTY STATE ─────────────────────────────────────── -->
  {#if engine.visibleCharacters.length === 0}
    <div class="flex flex-col items-center gap-3 py-20 text-center text-text-muted">
      <IconCampaign size={64} class="opacity-20" aria-hidden="true" />
      <h2 class="text-xl font-semibold text-text-secondary">{ui('vault.empty_title', engine.settings.language)}</h2>
      <p class="text-sm max-w-sm leading-relaxed">
        {#if sessionContext.isGameMaster}
          {ui('vault.empty_gm', engine.settings.language)}
        {:else}
          {ui('vault.empty_player', engine.settings.language)}
        {/if}
      </p>
      <div class="flex gap-3 flex-wrap justify-center mt-2">
        <button class="btn-primary gap-1 px-5 py-2.5" onclick={createNewCharacter} type="button">
          <IconAddCharacter size={16} aria-hidden="true" /> {ui('vault.create_character', engine.settings.language)}
        </button>
        {#if sessionContext.isGameMaster}
          <button class="btn-secondary gap-1 px-5 py-2.5 text-red-400 border-red-800/60 hover:border-red-600" onclick={addNPCMonster} type="button">
            <IconNPC size={16} aria-hidden="true" /> {ui('vault.add_npc', engine.settings.language)}
          </button>
        {/if}
      </div>
    </div>

  {:else}
    <section
      class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
      aria-label="Character list ({engine.visibleCharacters.length} adventurers)"
    >
      {#each engine.visibleCharacters as character (character.id)}
        <CharacterCard
          {character}
          onclick={() => openCharacter(character.id)}
          ondelete={canDelete(character) ? () => handleDelete(character) : undefined}
        />
      {/each}
    </section>
  {/if}

</div>
