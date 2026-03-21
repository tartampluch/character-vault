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
  import CharacterCard from '$lib/components/vault/CharacterCard.svelte';
  import { IconVault, IconAddCharacter, IconNPC, IconGMDashboard, IconCharacter, IconCampaign, IconBack } from '$lib/components/ui/icons';

  const campaignId = $derived($page.params.id ?? '');
  const campaign   = $derived(campaignStore.getCampaign(campaignId));

  $effect(() => {
    sessionContext.setActiveCampaign(campaignId);
    engine.loadVaultCharacters();
  });

  function createNewCharacter() {
    const id = `char_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const newChar = createEmptyCharacter(id, 'New Character');
    newChar.campaignId = campaignId;
    newChar.ownerId    = sessionContext.currentUserId;
    newChar.isNPC      = false;
    engine.addCharacterToVault(newChar);
    goto(`/character/${id}?tab=core`);
  }

  function addNPCMonster() {
    const id = `npc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const newNPC = createEmptyCharacter(id, 'New NPC');
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
</script>

<div class="max-w-5xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-5">

  <!-- ── HEADER ───────────────────────────────────────────────────────────── -->
  <header class="flex items-start justify-between gap-3 flex-wrap">
    <div class="flex flex-col gap-0.5">
      <a href="/campaigns/{campaignId}" class="inline-flex items-center gap-1 text-xs text-text-muted hover:text-accent transition-colors">
        <IconBack size={12} aria-hidden="true" /> Campaign
      </a>
      <h1 class="flex items-center gap-2 text-2xl font-bold text-text-primary">
        <IconVault size={24} aria-hidden="true" /> Your Adventurers
      </h1>
      {#if campaign}
        <p class="text-sm text-text-muted">{campaign.title}</p>
      {/if}
    </div>

    <div class="flex items-center gap-2 flex-wrap">
      <button class="btn-primary gap-1" onclick={createNewCharacter} type="button">
        <IconAddCharacter size={15} aria-hidden="true" /> Create New Character
      </button>
      {#if sessionContext.isGameMaster}
        <button class="btn-secondary gap-1 text-red-400 border-red-800/60 hover:border-red-600" onclick={addNPCMonster} type="button">
          <IconNPC size={15} aria-hidden="true" /> Add NPC / Monster
        </button>
      {/if}
    </div>
  </header>

  <!-- ── VISIBILITY INFO ──────────────────────────────────────────────────── -->
  <div aria-live="polite">
    {#if sessionContext.isGameMaster}
      <span class="badge-accent flex items-center gap-1 w-fit text-xs">
        <IconGMDashboard size={12} aria-hidden="true" />
        GM View — {engine.visibleCharacters.length} character{engine.visibleCharacters.length !== 1 ? 's' : ''}
      </span>
    {:else}
      <span class="badge-gray flex items-center gap-1 w-fit text-xs">
        <IconCharacter size={12} aria-hidden="true" />
        Player View — {engine.visibleCharacters.length} character{engine.visibleCharacters.length !== 1 ? 's' : ''}
      </span>
    {/if}
  </div>

  <!-- ── CHARACTER GRID or EMPTY STATE ─────────────────────────────────────── -->
  {#if engine.visibleCharacters.length === 0}
    <div class="flex flex-col items-center gap-3 py-20 text-center text-text-muted">
      <IconCampaign size={64} class="opacity-20" aria-hidden="true" />
      <h2 class="text-xl font-semibold text-text-secondary">No adventurers yet!</h2>
      <p class="text-sm max-w-sm leading-relaxed">
        {#if sessionContext.isGameMaster}
          Create the party's first character or add an NPC to get started.
        {:else}
          You don't have any characters in this campaign yet. Click "Create New Character" to begin your journey!
        {/if}
      </p>
      <div class="flex gap-3 flex-wrap justify-center mt-2">
        <button class="btn-primary gap-1 px-5 py-2.5" onclick={createNewCharacter} type="button">
          <IconAddCharacter size={16} aria-hidden="true" /> Create New Character
        </button>
        {#if sessionContext.isGameMaster}
          <button class="btn-secondary gap-1 px-5 py-2.5 text-red-400 border-red-800/60 hover:border-red-600" onclick={addNPCMonster} type="button">
            <IconNPC size={16} aria-hidden="true" /> Add NPC / Monster
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
        <CharacterCard {character} onclick={() => openCharacter(character.id)} />
      {/each}
    </section>
  {/if}

</div>
