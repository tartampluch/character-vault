<!--
  @file src/routes/campaigns/[id]/vault/+page.svelte
  @description The Character Vault — all adventurers for this campaign.
  Phase 19.12: Migrated to Tailwind CSS — all scoped <style> removed.

  LAYOUT:
    Page header: back link, title, campaign subtitle, action buttons.
    Character grid (responsive auto-fill) or empty state with CTAs.
    NPCs/Monsters: always shown to players in read-only mode (name + portrait only).

  NEW FEATURES (this update):
    + Spawn NPC / + Spawn Monster buttons (GM only) — open SpawnModal.
    NPCs/Monsters are visible to players but in viewOnly mode (no level, no sheet access).
    Per user requirements:
      NPC:     character.name = template name  / playerName = GM who spawned it.
      Monster: character.name = instance name  / playerName = species (e.g. "Wolf").
-->

<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { engine, createEmptyCharacter } from '$lib/engine/GameEngine.svelte';
  import { sessionContext } from '$lib/engine/SessionContext.svelte';
  import { campaignStore } from '$lib/engine/CampaignStore.svelte';
  import { dataLoader } from '$lib/engine/DataLoader';
  import { homebrewStore } from '$lib/engine/HomebrewStore.svelte';
  import { ui } from '$lib/i18n/ui-strings';
  import { createDefaultCampaignSettings } from '$lib/types/settings';
  import CharacterCard from '$lib/components/vault/CharacterCard.svelte';
  import SpawnModal from '$lib/components/vault/SpawnModal.svelte';
  import { sidebarPinsStore } from '$lib/engine/SidebarPinsStore.svelte';
  import {
    IconVault, IconCampaign,
  } from '$lib/components/ui/icons';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import { getGmGlobalOverrides } from '$lib/api/serverSettingsApi';

  const campaignId = $derived($page.params.id ?? '');
  const campaign   = $derived(campaignStore.getCampaign(campaignId));

  /**
   * Resolves the campaign title to a plain string for the PageHeader subtitle.
   */
  const campaignSubtitle = $derived.by((): string | undefined => {
    if (!campaign) return undefined;
    const t = campaign.title;
    if (!t) return undefined;
    if (typeof t !== 'string') return engine.t(t as Record<string, string>);
    try {
      const parsed = JSON.parse(t);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return engine.t(parsed as Record<string, string>);
      }
    } catch { /* plain string */ }
    return t;
  });

  $effect(() => {
    sessionContext.setActiveCampaign(campaignId);
    engine.loadVaultCharacters(campaignId);
  });

  $effect(() => {
    const id = campaignId;
    if (!id) return;
    homebrewStore.scope = 'campaign';
    homebrewStore.load();
  });

  let serverGmOverrides = $state<string | undefined>(undefined);
  $effect(() => {
    if (serverGmOverrides !== undefined) return;
    serverGmOverrides = '';
    getGmGlobalOverrides().then(v => { serverGmOverrides = v; });
  });

  let lastSourcesKey = '';
  $effect(() => {
    const sources        = campaign?.enabledRuleSources ?? [];
    const overrides      = serverGmOverrides;
    const homebrewEntities = homebrewStore.entities;
    const key = JSON.stringify(sources) + (overrides ?? '') + JSON.stringify(homebrewEntities);
    if (key === lastSourcesKey) return;
    lastSourcesKey = key;

    const cs = campaign?.campaignSettings;
    if (cs && !Array.isArray(cs)) {
      const defaults = createDefaultCampaignSettings();
      engine.updateSettings({
        diceRules:      { ...defaults.diceRules,      ...(cs.diceRules      ?? {}) },
        statGeneration: { ...defaults.statGeneration, ...(cs.statGeneration ?? {}) },
        variantRules:   { ...defaults.variantRules,   ...(cs.variantRules   ?? {}) },
      });
    }

    const homebrewJson = homebrewEntities.length > 0
      ? JSON.stringify(homebrewEntities)
      : undefined;

    dataLoader
      .loadRuleSources(sources, overrides, homebrewJson)
      .then(() => {
        if (campaign) dataLoader.registerLanguagesFromValue(campaign);
        engine.bumpDataLoaderVersion();
      })
      .catch(err => console.warn('[Vault] Failed to load rule sources:', err));
  });

  // ---------------------------------------------------------------------------
  // CHARACTER CREATION
  // ---------------------------------------------------------------------------

  function createNewCharacter() {
    const id = `char_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const newChar = createEmptyCharacter(id, ui('vault.default_char_name', engine.settings.language));
    newChar.campaignId = campaignId;
    newChar.ownerId    = sessionContext.currentUserId;
    newChar.isNPC      = false;
    engine.addCharacterToVault(newChar);
    goto(`/character/${id}?tab=core`);
  }

  // ---------------------------------------------------------------------------
  // SPAWN MODAL (GM only)
  // ---------------------------------------------------------------------------

  let spawnModalOpen = $state(false);
  let spawnModalType = $state<'npc' | 'monster'>('npc');

  function openSpawnModal(type: 'npc' | 'monster'): void {
    spawnModalType = type;
    spawnModalOpen = true;
  }

  /**
   * Called by SpawnModal after a successful spawn.
   * Reloads the vault to pick up the new character, then navigates to its sheet.
   *
   * @param charId - The newly created character's ID.
   */
  function handleSpawned(charId: string): void {
    // Reload vault so the new NPC/Monster appears in the grid.
    engine.loadVaultCharacters(campaignId);
    // GMs can open the character sheet immediately.
    goto(`/character/${charId}?tab=core`);
  }

  // ---------------------------------------------------------------------------
  // OPEN + DELETE
  // ---------------------------------------------------------------------------

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

  function handleDelete(character: { id: string; name: string }) {
    if (!confirm(ui('vault.delete_confirm', engine.settings.language).replace('{name}', character.name))) return;
    engine.removeCharacterFromVault(character.id);
  }

  // ---------------------------------------------------------------------------
  // CHARACTER VISIBILITY RULES
  // ---------------------------------------------------------------------------

  /**
   * Whether a CharacterCard should be rendered in view-only mode.
   *
   * Players can see the name and portrait of NPCs/Monsters in the campaign, but:
   *   - Cannot click through to the character sheet.
   *   - Cannot see the level badge.
   *
   * A character is view-only when:
   *   1. The current user is NOT the owner, AND
   *   2. The character is an NPC or Monster instance (`isNPC === true`), AND
   *   3. The backend has flagged it as player-restricted (`_playerRestricted`).
   */
  function isViewOnly(character: typeof engine.allVaultCharacters[number]): boolean {
    if (sessionContext.isGameMaster) return false;
    return !!(character._playerRestricted ?? (character.isNPC && character.ownerId !== sessionContext.currentUserId));
  }
</script>

<!-- Spawn NPC/Monster Modal -->
<SpawnModal
  open={spawnModalOpen}
  type={spawnModalType}
  {campaignId}
  onspawned={handleSpawned}
  onclose={() => { spawnModalOpen = false; }}
/>

<PageHeader
  title={ui('vault.title', engine.settings.language)}
  subtitle={campaignSubtitle}
  icon={IconVault}
  breadcrumb={{ href: `/campaigns/${campaignId}`, label: ui('common.campaign', engine.settings.language) }}
>
  {#snippet actions()}
    <!-- "+ Create New Character" — always visible to all users -->
    <button class="btn-primary" onclick={createNewCharacter} type="button">
      {ui('vault.create_character', engine.settings.language)}
    </button>

    <!-- GM-only spawn buttons -->
    {#if sessionContext.isGameMaster}
      <button
        class="btn-secondary text-red-400 border-red-800/60 hover:border-red-600"
        onclick={() => openSpawnModal('npc')}
        type="button"
      >
        {ui('vault.spawn_npc', engine.settings.language)}
      </button>
      <button
        class="btn-secondary text-orange-400 border-orange-800/60 hover:border-orange-600"
        onclick={() => openSpawnModal('monster')}
        type="button"
      >
        {ui('vault.spawn_monster', engine.settings.language)}
      </button>
    {/if}
  {/snippet}
</PageHeader>

<div class="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-5">

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
      <!-- Empty-state CTAs mirror the header buttons -->
      <div class="flex gap-3 flex-wrap justify-center mt-2">
        <button class="btn-primary px-5 py-2.5" onclick={createNewCharacter} type="button">
          {ui('vault.create_character', engine.settings.language)}
        </button>
        {#if sessionContext.isGameMaster}
          <button
            class="btn-secondary px-5 py-2.5 text-red-400 border-red-800/60 hover:border-red-600"
            onclick={() => openSpawnModal('npc')}
            type="button"
          >
            {ui('vault.spawn_npc', engine.settings.language)}
          </button>
          <button
            class="btn-secondary px-5 py-2.5 text-orange-400 border-orange-800/60 hover:border-orange-600"
            onclick={() => openSpawnModal('monster')}
            type="button"
          >
            {ui('vault.spawn_monster', engine.settings.language)}
          </button>
        {/if}
      </div>
    </div>

  {:else}
    <section
      class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
      aria-label={ui('vault.character_list_aria', engine.settings.language).replace('{n}', String(engine.visibleCharacters.length))}
    >
      {#each engine.visibleCharacters as character (character.id)}
        {@const viewOnly = isViewOnly(character)}
        <CharacterCard
          {character}
          {viewOnly}
          isPinned={!viewOnly && sidebarPinsStore.isPinnedCharacter(character.id)}
          onpin={!viewOnly ? () => sidebarPinsStore.toggleCharacter(character.id) : undefined}
          onclick={!viewOnly ? () => openCharacter(character.id) : undefined}
          ondelete={canDelete(character) ? () => handleDelete(character) : undefined}
        />
      {/each}
    </section>
  {/if}

</div>
