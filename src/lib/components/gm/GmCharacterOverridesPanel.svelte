<!--
  @file src/lib/components/gm/GmCharacterOverridesPanel.svelte
  @description Per-character GM overrides editor panel.

  Allows a GM or admin to edit the `gmOverrides` array for the currently active
  engine character. Shows a JSON textarea with live validation and a save button
  that calls `PUT /api/characters/{id}/gm-overrides`.

  IMPORTANT: This component reads and writes `engine.character.gmOverrides` (the
  raw override array for the active character), NOT the global campaign overrides
  managed by `GmOverridesPanel.svelte`.

  USAGE:
    Only render when `sessionContext.isGameMaster` is true. The component enforces
    no role check internally — gate it in the parent.

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

<!-- ── GM PER-CHARACTER OVERRIDES ─────────────────────────────────────────── -->
<section class="card p-4 flex flex-col gap-3">

  <!-- Header -->
  <div class="section-header text-sm border-b border-border pb-2 text-red-400">
    <IconGMDashboard size={16} aria-hidden="true" />
    <span>{ui('gm.per_char_overrides', lang)}</span>
  </div>

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
