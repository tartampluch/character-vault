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
  import { homebrewStore } from '$lib/engine/HomebrewStore.svelte';
  import { ui } from '$lib/i18n/ui-strings';
  import { createDefaultCampaignSettings } from '$lib/types/settings';
  import CharacterCard from '$lib/components/vault/CharacterCard.svelte';
  import { sidebarPinsStore } from '$lib/engine/SidebarPinsStore.svelte';
  import { IconVault, IconAddCharacter, IconNPC, IconCampaign } from '$lib/components/ui/icons';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import { getGmGlobalOverrides } from '$lib/api/serverSettingsApi';

  const campaignId = $derived($page.params.id ?? '');
  const campaign   = $derived(campaignStore.getCampaign(campaignId));

  /**
   * Resolves the campaign title to a plain string for the PageHeader subtitle.
   *
   * The `Campaign.title` field is `LocalizedString | string`:
   *   - LocalizedString object → resolve via engine.t() (picks current language).
   *   - JSON-encoded string '{"en":"…"}' → JSON.parse then engine.t().
   *   - Plain string → return as-is.
   * This matches the `resolveLocalized` pattern used in the campaign hub page.
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
    // Pass campaignId so the engine fetches from the API (server-side visibility
    // rules: GMs see all characters, players see only their own).
    engine.loadVaultCharacters(campaignId);
  });

  // Load campaign-scoped homebrew entities from the API whenever the campaign
  // changes. homebrewStore.entities is $state, so once the load() promise resolves
  // the entity list update will re-trigger the loadRuleSources $effect below,
  // causing a second pass that includes the homebrew in the DataLoader scan.
  // This is what makes languages added via the Campaign Editor (e.g. Japanese on
  // a weapon label) appear in the sidebar language dropdown.
  $effect(() => {
    const id = campaignId;
    if (!id) return;
    homebrewStore.scope = 'campaign';
    homebrewStore.load();
  });

  // ---------------------------------------------------------------------------
  // GM GLOBAL OVERRIDES — fetched from server settings (not per-campaign).
  // GM global overrides are now server-wide and live in the `server_settings`
  // table.  We fetch them once on mount and store in a $state variable so the
  // loadRuleSources $effect below can include them in the key check.
  // ---------------------------------------------------------------------------
  let serverGmOverrides = $state<string | undefined>(undefined);

  $effect(() => {
    // Only fetch once; the fetch resolves asynchronously and then updates the
    // $state, which triggers the loadRuleSources $effect on the next microtask.
    if (serverGmOverrides !== undefined) return;
    serverGmOverrides = ''; // Sentinel: fetch in progress.
    getGmGlobalOverrides().then(v => { serverGmOverrides = v; });
  });

  // Reload rule sources whenever the campaign's enabledRuleSources, GM global
  // overrides, OR campaign homebrew entities change.
  // This $effect is intentionally separate so it re-runs when loadFromApi()
  // updates the campaign store (which changes campaign.enabledRuleSources) AND when
  // homebrewStore.entities updates after homebrewStore.load() resolves.
  // The JSON.stringify ensures the effect re-runs even if array references change
  // but contents are identical (avoids duplicate loads).
  let lastSourcesKey = '';
  $effect(() => {
    const sources   = campaign?.enabledRuleSources ?? [];
    // Use the server-fetched GM overrides (no longer on the campaign object).
    const overrides = serverGmOverrides;
    // Reading homebrewStore.entities here creates a reactive dependency on the
    // homebrew entity list. When homebrewStore.load() resolves, _entities is
    // replaced with the server data, Svelte re-runs this effect, and
    // loadRuleSources() is called again with the homebrew JSON — causing
    // scanEntityForLanguages() to discover any new language codes (e.g. 'ja').
    const homebrewEntities = homebrewStore.entities;
    const key = JSON.stringify(sources) + (overrides ?? '') + JSON.stringify(homebrewEntities);
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

    // Pass the campaign homebrew JSON as the 3rd argument so the DataLoader's
    // #applyCampaignHomebrew() processes those entities and scanEntityForLanguages()
    // registers any language codes they use (e.g. 'ja' from a Japanese weapon label).
    const homebrewJson = homebrewEntities.length > 0
      ? JSON.stringify(homebrewEntities)
      : undefined;

    // Always call loadRuleSources, even when sources is empty.
    // An empty array is the permissive mode: DataLoader loads ALL rule files.
    // Previously this was guarded by `if (sources.length > 0)`, which meant
    // new campaigns with the default empty array would NEVER initialize the
    // DataLoader, leaving the engine with no features, classes, or config tables.
    dataLoader
      .loadRuleSources(sources, overrides, homebrewJson)
      .then(() => {
        // Re-scan the campaign object after every loadRuleSources() because
        // clearCache() (called at the start of loadRuleSources) resets
        // _availableLanguages, wiping any languages previously registered by
        // the layout's $effect. Calling registerLanguagesFromValue() here
        // re-adds them after the cache is fully rebuilt.
        if (campaign) {
          dataLoader.registerLanguagesFromValue(campaign);
        }
        engine.bumpDataLoaderVersion();
      })
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

<PageHeader
  title={ui('vault.title', engine.settings.language)}
  subtitle={campaignSubtitle}
  icon={IconVault}
  breadcrumb={{ href: `/campaigns/${campaignId}`, label: ui('common.campaign', engine.settings.language) }}
>
  {#snippet actions()}
    <button class="btn-primary gap-1" onclick={createNewCharacter} type="button">
      <IconAddCharacter size={16} aria-hidden="true" /> {ui('vault.create_character', engine.settings.language)}
    </button>
    {#if sessionContext.isGameMaster}
      <button class="btn-secondary gap-1 text-red-400 border-red-800/60 hover:border-red-600" onclick={addNPCMonster} type="button">
        <IconNPC size={16} aria-hidden="true" /> {ui('vault.add_npc', engine.settings.language)}
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
      aria-label={ui('vault.character_list_aria', engine.settings.language).replace('{n}', String(engine.visibleCharacters.length))}
    >
      {#each engine.visibleCharacters as character (character.id)}
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
