<!--
  @file src/routes/vault/+page.svelte
  @description Global Character Vault — all characters across campaigns.

  LAYOUT:
    Page header: title, subtitle (role-aware), action buttons.
    Characters section: characters grouped by campaign (GM) or flat list (player).
    Templates section (GM/Admin only): NPC and Monster template library.

  NEW FEATURES (this update):
    + Add Character button — creates a character not tied to any campaign.
    Templates section (GM/Admin):
      + Add NPC Template — blank NPC blueprint, opens character editor.
      + Add Monster Template — blank Monster blueprint, opens character editor.
      Template cards: delete, open for editing.

  NAVIGATION:
    Opening a character / template navigates to /character/{id}.
    Pin button on each character card (visible on hover) pins to sidebar.

  DATA:
    Characters: engine.loadAllVaultCharacters() → GET /api/characters (no campaignId).
    Templates:  engine.loadTemplates()          → GET /api/templates (GM only).
-->

<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { engine, createEmptyCharacter } from '$lib/engine/GameEngine.svelte';
  import { sessionContext } from '$lib/engine/SessionContext.svelte';
  import { campaignStore } from '$lib/engine/CampaignStore.svelte';
  import { sidebarPinsStore } from '$lib/engine/SidebarPinsStore.svelte';
  import { ui } from '$lib/i18n/ui-strings';
  import CharacterCard from '$lib/components/vault/CharacterCard.svelte';
  import {
    IconVault, IconCampaign, IconNPC, IconMonster, IconTemplate,
  } from '$lib/components/ui/icons';
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
    // Load templates (GM/Admin only — the API enforces this; non-GMs get 403).
    if (sessionContext.isGameMaster) {
      engine.loadTemplates();
    }
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
  // CHARACTER CREATION (global vault — no campaignId)
  // ---------------------------------------------------------------------------

  function createNewCharacter(): void {
    const id = `char_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const newChar = createEmptyCharacter(id, ui('vault.default_char_name', lang));
    // No campaignId — character lives outside any campaign.
    newChar.ownerId = sessionContext.currentUserId;
    newChar.isNPC   = false;
    engine.addCharacterToVault(newChar);
    goto(`/character/${id}?tab=core`);
  }

  // ---------------------------------------------------------------------------
  // TEMPLATE CREATION (GM/Admin only)
  // ---------------------------------------------------------------------------

  function createTemplate(npcType: 'npc' | 'monster'): void {
    const id = `tmpl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const defaultName = npcType === 'monster'
      ? ui('vault.default_monster_name', lang)
      : ui('vault.default_npc_name', lang);

    const tmpl = createEmptyCharacter(id, defaultName);
    tmpl.ownerId    = sessionContext.currentUserId;
    tmpl.isNPC      = true;
    tmpl.npcType    = npcType;
    tmpl.isTemplate = true;

    // addTemplateToList calls storageManager.createCharacterOnApi which routes to
    // POST /api/templates when isTemplate === true.
    engine.addTemplateToList(tmpl);
    // Also register in allVaultCharacters so the character sheet can load it by ID.
    engine.registerCharacterInVault(tmpl);

    goto(`/character/${id}?tab=core`);
  }

  function handleDeleteTemplate(tmpl: { id: string; name: string }): void {
    if (!confirm(ui('vault.delete_template_confirm', lang).replace('{name}', tmpl.name))) return;
    engine.removeTemplate(tmpl.id);
  }

  // ---------------------------------------------------------------------------
  // OPEN + DELETE (characters)
  // ---------------------------------------------------------------------------

  function openCharacter(characterId: string): void {
    const char = engine.allVaultCharacters.find(c => c.id === characterId) ?? engine.character;
    engine.loadCharacter(char);
    goto(`/character/${characterId}?tab=core`);
  }

  function openTemplate(templateId: string): void {
    const tmpl = engine.allTemplates.find(t => t.id === templateId);
    if (tmpl) engine.loadCharacter(tmpl);
    goto(`/character/${templateId}?tab=core`);
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

  // Template grouping: separate NPC templates from Monster templates for display.
  const npcTemplates     = $derived(engine.allTemplates.filter(t => t.npcType === 'npc'));
  const monsterTemplates = $derived(engine.allTemplates.filter(t => t.npcType === 'monster'));
</script>

<PageHeader
  title={ui('vault.global_title', lang)}
  subtitle={subtitle}
  icon={IconVault}
>
  {#snippet actions()}
    <!-- "+ Add Character" — creates a character not tied to any campaign. -->
    <button class="btn-primary" onclick={createNewCharacter} type="button">
      {ui('vault.add_character', lang)}
    </button>
  {/snippet}
</PageHeader>

<div class="w-full px-4 sm:px-6 py-6 flex flex-col gap-8">

  <!-- ── CHARACTERS SECTION ────────────────────────────────────────────────── -->
  {#if engine.allVaultCharacters.length === 0}

    <!-- Empty state -->
    <div class="flex flex-col items-center gap-3 py-16 text-center text-text-muted">
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

  <!-- ── TEMPLATES SECTION (GM / Admin only) ───────────────────────────────── -->
  {#if sessionContext.isGameMaster}
    <section class="flex flex-col gap-5">

      <!-- Section header -->
      <div class="flex items-center justify-between border-b border-border pb-3">
        <div class="flex items-center gap-2">
          <IconTemplate size={18} class="text-accent" aria-hidden="true" />
          <h2 class="text-base font-semibold text-text-primary">
            {ui('vault.templates_section_title', lang)}
          </h2>
        </div>
        <!-- Template creation buttons -->
        <div class="flex gap-2 flex-wrap justify-end">
          <button
            class="btn-secondary text-sm text-red-400 border-red-800/60 hover:border-red-600"
            onclick={() => createTemplate('npc')}
            type="button"
          >
            {ui('vault.add_npc_template', lang)}
          </button>
          <button
            class="btn-secondary text-sm text-orange-400 border-orange-800/60 hover:border-orange-600"
            onclick={() => createTemplate('monster')}
            type="button"
          >
            {ui('vault.add_monster_template', lang)}
          </button>
        </div>
      </div>

      {#if engine.allTemplates.length === 0}
        <p class="text-sm text-text-muted text-center py-6">
          {ui('vault.templates_empty', lang)}
        </p>

      {:else}

        <!-- NPC Templates sub-section -->
        {#if npcTemplates.length > 0}
          <div class="flex flex-col gap-3">
            <h3 class="flex items-center gap-2 text-sm font-semibold text-red-400">
              <IconNPC size={14} aria-hidden="true" />
              {ui('vault.npc_templates_section', lang)}
            </h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {#each npcTemplates as tmpl (tmpl.id)}
                <CharacterCard
                  character={tmpl}
                  onclick={() => openTemplate(tmpl.id)}
                  ondelete={() => handleDeleteTemplate(tmpl)}
                />
              {/each}
            </div>
          </div>
        {/if}

        <!-- Monster Templates sub-section -->
        {#if monsterTemplates.length > 0}
          <div class="flex flex-col gap-3">
            <h3 class="flex items-center gap-2 text-sm font-semibold text-orange-400">
              <IconMonster size={14} aria-hidden="true" />
              {ui('vault.monster_templates_section', lang)}
            </h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {#each monsterTemplates as tmpl (tmpl.id)}
                <CharacterCard
                  character={tmpl}
                  onclick={() => openTemplate(tmpl.id)}
                  ondelete={() => handleDeleteTemplate(tmpl)}
                />
              {/each}
            </div>
          </div>
        {/if}

      {/if}

    </section>
  {/if}

</div>
