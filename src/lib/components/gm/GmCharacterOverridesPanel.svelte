<!--
  @file src/lib/components/gm/GmCharacterOverridesPanel.svelte
  @description Per-character GM controls panel (GM/Admin only).

  Two sections, both reading/writing engine.character directly:

  1. PLAYER VISIBILITY (NPC/Monster only)
     A <select> controlling `character.playerVisibility`:
       hidden     — NPC not shown to players (default)
       name       — stub with name, playerName, posterUrl
       name_level — stub + classLevels
       full       — full character data, read-only for player
     Change is applied to the in-memory character; the user must click
     the Save button in the character sheet header to persist it.

  2. PER-CHARACTER GM OVERRIDES (all characters)
     JSON textarea for `gmOverrides` (ActiveFeatureInstance[]).
     Saved explicitly via PUT /api/characters/{id}/gm-overrides.

  USAGE: Only render when sessionContext.isGameMaster is true.
  Props: (none — reads from engine.character directly)
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { apiHeaders } from '$lib/engine/StorageManager';
  import { ui } from '$lib/i18n/ui-strings';
  import type { ActiveFeatureInstance } from '$lib/types/character';
  import { IconGMDashboard, IconSuccess, IconError } from '$lib/components/ui/icons';

  const lang = $derived(engine.settings.language);

  // ---------------------------------------------------------------------------
  // LOCAL EDITOR STATE — keyed to the current character ID
  // ---------------------------------------------------------------------------

  /**
   * Raw JSON text of gmOverrides for the active character.
   * Initialized from engine.character.gmOverrides on character change.
   * We keep it as a string for the textarea; validation/parsing happen reactively.
   */
  let overrideText = $state('[]');
  let lastCharId   = $state('');

  /**
   * Sync the textarea content whenever the active character changes.
   * We use a separate lastCharId guard to avoid re-resetting when the GM
   * edits the textarea (which would mutate engine.character indirectly).
   */
  $effect(() => {
    const charId = engine.character.id;
    if (charId !== lastCharId) {
      lastCharId   = charId;
      overrideText = JSON.stringify(engine.character.gmOverrides ?? [], null, 2);
    }
  });

  // ---------------------------------------------------------------------------
  // JSON VALIDATION
  // ---------------------------------------------------------------------------

  const _validation = $derived.by(() => {
    const text = overrideText;
    const _lang = lang; // reactive dependency

    if (!text.trim() || text.trim() === '[]') {
      return { valid: true, error: '' };
    }

    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) {
        return { valid: false, error: ui('gm.must_be_json_array', _lang) };
      }
      return { valid: true, error: '' };
    } catch (e: unknown) {
      const err = e as Error;
      const posMatch = err.message.match(/position (\d+)/);
      let errMsg: string;
      if (posMatch) {
        const pos     = parseInt(posMatch[1], 10);
        const lineNum = text.slice(0, pos).split('\n').length;
        errMsg = `${ui('gm.json_syntax_on_line', _lang).replace('{line}', String(lineNum))} ${err.message}`;
      } else {
        errMsg = `${ui('gm.syntax_error', _lang)} ${err.message}`;
      }
      return { valid: false, error: errMsg };
    }
  });

  const isValid     = $derived(_validation.valid);
  const validError  = $derived(_validation.error);

  // ---------------------------------------------------------------------------
  // SAVE
  // ---------------------------------------------------------------------------

  let saving      = $state(false);
  let saveMessage = $state('');

  async function save(): Promise<void> {
    if (!isValid || saving) return;
    saving = true;
    saveMessage = '';

    const overrides = JSON.parse(overrideText) as ActiveFeatureInstance[];
    const charId    = engine.character.id;

    try {
      const response = await fetch(`/api/characters/${charId}/gm-overrides`, {
        method:  'PUT',
        headers: apiHeaders(),
        credentials: 'include',
        body:    JSON.stringify({ gmOverrides: overrides }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      // Delegate mutation to engine so Svelte reactivity propagates correctly.
      engine.setCharacterGmOverrides(charId, overrides);
      saveMessage = ui('gm.saved', lang);
      setTimeout(() => { saveMessage = ''; }, 3000);
    } catch {
      // API unavailable — update local state so the GM sees their changes.
      engine.setCharacterGmOverrides(charId, overrides);
      saveMessage = ui('gm.saved_locally', lang);
      setTimeout(() => { saveMessage = ''; }, 5000);
    } finally {
      saving = false;
    }
  }
</script>

<!-- ── GM PER-CHARACTER CONTROLS ──────────────────────────────────────────── -->
<section class="card p-4 flex flex-col gap-3">

  <!-- Header -->
  <div class="section-header text-sm border-b border-border pb-2 text-red-400">
    <IconGMDashboard size={16} aria-hidden="true" />
    <span>{ui('gm.per_char_overrides', lang)}</span>
  </div>

  <!-- ── PLAYER VISIBILITY (NPC/Monster only) ────────────────────────────── -->
  {#if engine.character.isNPC}
    <div class="flex flex-col gap-1.5 pb-3 border-b border-border">
      <label
        for="npc-player-visibility"
        class="text-xs font-semibold uppercase tracking-wider text-text-muted"
      >
        {ui('gm.player_visibility', lang)}
      </label>
      <select
        id="npc-player-visibility"
        class="select text-sm"
        value={engine.character.playerVisibility ?? 'hidden'}
        onchange={(e) =>
          engine.setPlayerVisibility(
            (e.target as HTMLSelectElement).value as
              'hidden' | 'name' | 'name_level' | 'full'
          )
        }
        aria-label={ui('gm.player_visibility', lang)}
      >
        <option value="hidden">{ui('gm.player_visibility_hidden',     lang)}</option>
        <option value="name">{ui('gm.player_visibility_name',         lang)}</option>
        <option value="name_level">{ui('gm.player_visibility_name_level', lang)}</option>
        <option value="full">{ui('gm.player_visibility_full',         lang)}</option>
      </select>
      <p class="text-xs text-text-muted leading-relaxed">
        {ui('gm.player_visibility_help', lang)}
      </p>
    </div>
  {/if}

  <!-- ── PER-CHARACTER GM OVERRIDES ─────────────────────────────────────── -->
  <p class="text-xs text-text-muted leading-relaxed">
    {ui('gm.override_help', lang)}
  </p>

  <!-- JSON error -->
  {#if validError}
    <div class="flex items-center gap-2 px-3 py-2 rounded border border-red-700/40 bg-red-950/20 text-red-400 text-xs font-mono" role="alert">
      <IconError size={12} aria-hidden="true" /> {validError}
    </div>
  {/if}

  <!-- Textarea -->
  <textarea
    class="w-full rounded-lg border px-3 py-2 font-mono text-xs leading-relaxed resize-vertical
           bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50
           {!isValid ? 'border-red-600 bg-red-950/10' : 'border-border focus:border-accent'}"
    bind:value={overrideText}
    spellcheck="false"
    rows="10"
    aria-label={ui('gm.overrides_for_aria', lang).replace('{name}', engine.character.name)}
  ></textarea>

  <!-- Status bar + save button -->
  <div class="flex items-center gap-3 flex-wrap">
    <span class="flex items-center gap-1 text-xs flex-1 {!isValid ? 'text-red-400' : 'text-green-400'}">
      {#if !isValid}
        <IconError size={12} aria-hidden="true" /> {ui('gm.invalid_json', lang)}
      {:else}
        <IconSuccess size={12} aria-hidden="true" /> {ui('gm.valid_json', lang)}
      {/if}
    </span>

    {#if saveMessage}
      <span class="text-xs text-green-400">{saveMessage}</span>
    {/if}

    <button
      class="btn-primary shrink-0 text-xs"
      onclick={save}
      disabled={saving || !isValid}
      aria-label={ui('gm.save_overrides_for_aria', lang).replace('{name}', engine.character.name)}
      type="button"
    >
      {saving ? ui('gm.saving', lang) : ui('gm.save_overrides', lang)}
    </button>
  </div>

</section>
