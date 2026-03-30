<!--
  @file src/routes/vault/+page.svelte
  @description Global Character Vault — all characters across campaigns.

  LAYOUT:
    Page header: title, subtitle (role-aware), character count.
    Character grid (responsive auto-fill) or empty state.
    For GMs: characters are grouped by campaign.
    For players: flat list of own characters across all campaigns.

  NAVIGATION:
    Opening a character navigates to /character/{id}.
    Pin button on each card (visible on hover) pins the character to the sidebar.

  DATA:
    Calls engine.loadAllVaultCharacters() which hits GET /api/characters (no campaignId).
    GMs see all characters from all their campaigns.
    Players see only their own characters from all campaigns.
-->

<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { sessionContext } from '$lib/engine/SessionContext.svelte';
  import { campaignStore } from '$lib/engine/CampaignStore.svelte';
  import { sidebarPinsStore } from '$lib/engine/SidebarPinsStore.svelte';
  import { ui } from '$lib/i18n/ui-strings';
  import CharacterCard from '$lib/components/vault/CharacterCard.svelte';
  import { IconVault, IconCampaign } from '$lib/components/ui/icons';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';

  const lang = $derived(engine.settings.language);

  // ---------------------------------------------------------------------------
  // DATA LOADING
  // ---------------------------------------------------------------------------

  onMount(() => {
    // Load all campaigns so we can display campaign titles in the GM view.
    campaignStore.loadIfNeeded();
    // Load all characters across all campaigns (visibility rules applied server-side).
    engine.loadAllVaultCharacters();
  });

  // ---------------------------------------------------------------------------
  // CHARACTER GROUPING (GM view)
  // ---------------------------------------------------------------------------

  /**
   * Groups characters by campaignId for the GM view.
   * Returns an ordered map: campaignId → character array.
   * Characters without a campaignId are grouped under the empty string key.
   */
  const charactersByCampaign = $derived.by(() => {
    const map = new Map<string, typeof engine.allVaultCharacters>();
    for (const char of engine.allVaultCharacters) {
      const key = char.campaignId ?? '';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(char);
    }
    return map;
  });

  /**
   * Returns the display title for a campaign group.
   * Falls back to the raw ID if the campaign is not in the store (e.g. deleted).
   */
  function campaignTitle(campaignId: string): string {
    if (!campaignId) return ui('vault.global_title', lang);
    const c = campaignStore.getCampaign(campaignId);
    if (!c) return campaignId;
    const t = c.title;
    if (!t) return campaignId;
    if (typeof t === 'string') {
      try {
        const parsed = JSON.parse(t);
        return engine.t(parsed as Record<string, string>);
      } catch { return t; }
    }
    return engine.t(t as Record<string, string>);
  }

  // ---------------------------------------------------------------------------
  // OPEN + DELETE
  // ---------------------------------------------------------------------------

  function openCharacter(characterId: string): void {
    const char = engine.allVaultCharacters.find(c => c.id === characterId) ?? engine.character;
    engine.loadCharacter(char);
    goto(`/character/${characterId}?tab=core`);
  }

  function canDelete(character: { ownerId?: string }): boolean {
    return sessionContext.isGameMaster || character.ownerId === sessionContext.currentUserId;
  }

  function handleDelete(character: { id: string; name: string }): void {
    if (!confirm(ui('vault.delete_confirm', lang).replace('{name}', character.name))) return;
    engine.removeCharacterFromVault(character.id);
  }

  // ---------------------------------------------------------------------------
  // SUBTITLE
  // ---------------------------------------------------------------------------

  const subtitle = $derived(
    sessionContext.isGameMaster
      ? ui('vault.global_subtitle_gm', lang)
      : ui('vault.global_subtitle', lang)
  );
</script>

<PageHeader
  title={ui('vault.global_title', lang)}
  subtitle={subtitle}
  icon={IconVault}
/>

<div class="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">

  <!-- ── CONTENT ──────────────────────────────────────────────────────────── -->
  {#if engine.allVaultCharacters.length === 0}

    <!-- Empty state -->
    <div class="flex flex-col items-center gap-3 py-20 text-center text-text-muted">
      <IconVault size={64} class="opacity-20" aria-hidden="true" />
      <h2 class="text-xl font-semibold text-text-secondary">
        {sessionContext.isGameMaster
          ? ui('vault.global_empty_gm', lang)
          : ui('vault.global_empty', lang)}
      </h2>
    </div>

  {:else if sessionContext.isGameMaster}

    <!-- GM VIEW: characters grouped by campaign -->
    <div class="flex flex-col gap-8">
      {#each [...charactersByCampaign.entries()] as [campId, chars]}
        <section class="flex flex-col gap-3">

          <!-- Campaign group header -->
          <div class="flex items-center gap-2 border-b border-border pb-2">
            <IconCampaign size={16} class="text-text-muted shrink-0" aria-hidden="true" />
            <h2 class="text-sm font-semibold text-text-secondary">{campaignTitle(campId)}</h2>
            <span class="text-xs text-text-muted">({chars.length})</span>
          </div>

          <!-- Character grid -->
          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {#each chars as character (character.id)}
              <CharacterCard
                {character}
                isPinned={sidebarPinsStore.isPinnedCharacter(character.id)}
                onpin={() => sidebarPinsStore.toggleCharacter(character.id)}
                onclick={() => openCharacter(character.id)}
                ondelete={canDelete(character) ? () => handleDelete(character) : undefined}
              />
            {/each}
          </div>

        </section>
      {/each}
    </div>

  {:else}

    <!-- PLAYER VIEW: flat list of own characters -->
    <section
      class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
      aria-label={ui('vault.character_list_aria', lang).replace('{n}', String(engine.allVaultCharacters.length))}
    >
      {#each engine.allVaultCharacters as character (character.id)}
        <CharacterCard
          {character}
          isPinned={sidebarPinsStore.isPinnedCharacter(character.id)}
          onpin={() => sidebarPinsStore.toggleCharacter(character.id)}
          onclick={() => openCharacter(character.id)}
          ondelete={canDelete(character) ? () => handleDelete(character) : undefined}
        />
      {/each}
    </section>

  {/if}

</div>
