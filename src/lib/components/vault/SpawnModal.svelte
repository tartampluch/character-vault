<!--
  @file src/lib/components/vault/SpawnModal.svelte
  @description Modal for spawning an NPC or Monster instance from a template
               into a specific campaign.

  BEHAVIOUR:
    Opens with a list of templates filtered by `type` ('npc' | 'monster').
    For NPC:     one-click spawn — template name is used directly.
    For Monster: shows an editable instance name input (pre-filled with template
                 name) before spawning.

  SPAWN SEMANTICS (from user requirements):
    NPC:
      character.name       = template.name
      character.playerName = GM's display name (who pressed "Spawn NPC")

    Monster:
      character.name       = instanceName (editable; defaults to template name)
      character.playerName = template.name (the species; e.g. "Wolf")

  DATA FLOW:
    1. Parent passes `type` ('npc' | 'monster'), `campaignId`, and `onspawned`.
    2. Modal fetches templates of the requested type from GET /api/templates?type=X.
    3. User selects a template (and optionally edits the Monster instance name).
    4. "Spawn" button calls POST /api/templates/{id}/spawn.
    5. `onspawned(charId)` is called with the new character ID so the parent
       can reload the vault and navigate to the new character.
-->

<script lang="ts">
  import { onMount } from 'svelte';
  import type { Character } from '$lib/types/character';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';
  import { getTemplates, spawnTemplate } from '$lib/api/templatesApi';
  import { IconNPC, IconMonster, IconSpawn, IconClose, IconLoading } from '$lib/components/ui/icons';

  // ---------------------------------------------------------------------------
  // PROPS
  // ---------------------------------------------------------------------------

  interface Props {
    /** Whether this modal is currently visible. */
    open: boolean;
    /** Template type to display and spawn from. */
    type: 'npc' | 'monster';
    /** Campaign ID to spawn the instance into. */
    campaignId: string;
    /** Called with the new character ID after a successful spawn. */
    onspawned: (charId: string) => void;
    /** Called when the user cancels / closes the modal. */
    onclose: () => void;
  }

  let { open, type, campaignId, onspawned, onclose }: Props = $props();

  const lang = $derived(engine.settings.language);

  // ---------------------------------------------------------------------------
  // STATE
  // ---------------------------------------------------------------------------

  let templates    = $state<Character[]>([]);
  let loading      = $state(false);
  let spawning     = $state(false);
  let selected     = $state<Character | null>(null);
  /** Instance name for Monster type — editable by the GM. */
  let instanceName = $state('');
  let error        = $state<string | null>(null);

  // ---------------------------------------------------------------------------
  // DATA LOADING
  // ---------------------------------------------------------------------------

  // Reload templates every time the modal opens or the type changes.
  $effect(() => {
    if (!open) return;
    loading = true;
    error   = null;
    selected = null;
    instanceName = '';
    getTemplates(type)
      .then(t => { templates = t; loading = false; })
      .catch(() => { loading = false; });
  });

  // Pre-fill instanceName when a Monster template is selected.
  $effect(() => {
    if (type === 'monster' && selected) {
      instanceName = selected.name;
    }
  });

  // ---------------------------------------------------------------------------
  // SPAWN ACTION
  // ---------------------------------------------------------------------------

  async function handleSpawn(): Promise<void> {
    if (!selected) return;
    spawning = true;
    error    = null;

    const name = type === 'monster' ? instanceName.trim() || selected.name : undefined;
    const result = await spawnTemplate(selected.id, campaignId, name);

    spawning = false;

    if (!result) {
      error = ui('common.error_unexpected', lang);
      return;
    }

    onspawned(result.id);
    onclose();
  }

  // ---------------------------------------------------------------------------
  // KEYBOARD ACCESSIBILITY
  // ---------------------------------------------------------------------------

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') onclose();
  }

  // Modal title based on type
  const modalTitle = $derived(
    type === 'npc'
      ? ui('vault.spawn_modal_title_npc', lang)
      : ui('vault.spawn_modal_title_monster', lang)
  );
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4
           bg-black/60 backdrop-blur-sm"
    role="dialog"
    aria-modal="true"
    aria-label={modalTitle}
    onclick={(e) => { if (e.target === e.currentTarget) onclose(); }}
  >
    <!-- Panel -->
    <div class="relative flex flex-col w-full max-w-md max-h-[90vh]
                bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden">

      <!-- Header -->
      <div class="flex items-center justify-between gap-3 px-5 py-4 border-b border-border shrink-0">
        <div class="flex items-center gap-2">
          {#if type === 'npc'}
            <IconNPC size={20} class="text-red-400" aria-hidden="true" />
          {:else}
            <IconMonster size={20} class="text-orange-400" aria-hidden="true" />
          {/if}
          <h2 class="text-base font-semibold text-text-primary">{modalTitle}</h2>
        </div>
        <button
          class="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-alt
                 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
          onclick={onclose}
          type="button"
          aria-label={ui('common.close', lang)}
        >
          <IconClose size={16} aria-hidden="true" />
        </button>
      </div>

      <!-- Template list -->
      <div class="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-2 min-h-0">
        {#if loading}
          <div class="flex items-center justify-center gap-2 py-8 text-text-muted">
            <IconLoading size={20} class="animate-spin" aria-hidden="true" />
          </div>

        {:else if templates.length === 0}
          <p class="text-sm text-text-muted text-center py-8">
            {ui('vault.spawn_no_templates', lang)}
          </p>

        {:else}
          {#each templates as tmpl (tmpl.id)}
            <!-- Template selection row -->
            <button
              class="flex items-start gap-3 w-full text-left p-3 rounded-lg border transition-colors
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50
                     {selected?.id === tmpl.id
                       ? type === 'monster'
                         ? 'border-orange-500 bg-orange-500/10'
                         : 'border-red-500 bg-red-500/10'
                       : 'border-border bg-surface-alt hover:border-accent/50'}"
              onclick={() => { selected = tmpl; }}
              type="button"
            >
              <div class="shrink-0 mt-0.5">
                {#if type === 'npc'}
                  <IconNPC size={16} class="text-red-400" aria-hidden="true" />
                {:else}
                  <IconMonster size={16} class="text-orange-400" aria-hidden="true" />
                {/if}
              </div>
              <div class="flex flex-col gap-0.5 min-w-0">
                <span class="text-sm font-medium text-text-primary truncate">{tmpl.name}</span>
                {#if tmpl.notes}
                  <span class="text-xs text-text-muted line-clamp-2">{tmpl.notes}</span>
                {/if}
              </div>
            </button>
          {/each}
        {/if}
      </div>

      <!-- Monster instance name input (shown only when a Monster template is selected) -->
      {#if type === 'monster' && selected}
        <div class="px-5 pb-3 shrink-0 border-t border-border pt-3 flex flex-col gap-2">
          <label class="flex flex-col gap-1">
            <span class="text-xs font-medium text-text-secondary">
              {ui('vault.spawn_modal_name_label', lang)}
            </span>
            <input
              class="input-base w-full text-sm"
              type="text"
              bind:value={instanceName}
              placeholder={ui('vault.spawn_modal_name_hint', lang)}
            />
          </label>
          <p class="text-xs text-text-muted">
            {ui('vault.spawn_modal_species_label', lang)}: <strong class="text-text-secondary">{selected.name}</strong>
          </p>
        </div>
      {/if}

      <!-- Error message -->
      {#if error}
        <p class="px-5 pb-2 text-xs text-red-400 shrink-0">{error}</p>
      {/if}

      <!-- Footer actions -->
      <div class="flex items-center justify-end gap-3 px-5 py-4 border-t border-border shrink-0">
        <button
          class="btn-secondary px-4 py-2 text-sm"
          onclick={onclose}
          type="button"
        >
          {ui('common.cancel', lang)}
        </button>
        <button
          class="btn-primary flex items-center gap-2 px-4 py-2 text-sm
                 disabled:opacity-50 disabled:cursor-not-allowed"
          onclick={handleSpawn}
          type="button"
          disabled={!selected || spawning}
        >
          {#if spawning}
            <IconLoading size={14} class="animate-spin" aria-hidden="true" />
          {:else}
            <IconSpawn size={14} aria-hidden="true" />
          {/if}
          {ui('vault.spawn_button', lang)}
        </button>
      </div>

    </div>
  </div>
{/if}
