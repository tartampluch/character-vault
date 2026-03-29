<!--
  @file src/routes/campaigns/[id]/content-editor/[entityId]/+page.svelte
  @description Edit Entity Page — loads a homebrew entity and renders EntityForm in edit mode.

  ────────────────────────────────────────────────────────────────────────────
  DATA FLOW
  ────────────────────────────────────────────────────────────────────────────
  1. URL param `[entityId]` is URI-decoded (IDs can contain slashes in edge
     cases but more commonly just snake_case).
  2. HomebrewStore.getById(entityId) — loaded entity.
  3. If not found in the store, redirect back to the library with an error query
     param rather than crashing.
  4. EntityForm renders in mode: 'edit'.
  5. Save → HomebrewStore.update() (handled inside EntityForm via ctx.store).
  6. Delete → confirmation modal → HomebrewStore.remove() → redirect to library.

  ────────────────────────────────────────────────────────────────────────────
  GM GUARD
  ────────────────────────────────────────────────────────────────────────────
  Non-GM users are redirected to the campaign root.

  ────────────────────────────────────────────────────────────────────────────
  @see src/lib/components/content-editor/EntityForm.svelte  for the form orchestrator
  @see src/lib/engine/HomebrewStore.svelte.ts              for the store
-->

<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { sessionContext } from '$lib/engine/SessionContext.svelte';
  import { homebrewStore } from '$lib/engine/HomebrewStore.svelte';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';
  import type { Feature } from '$lib/types/feature';
  import EntityForm from '$lib/components/content-editor/EntityForm.svelte';
  import Modal from '$lib/components/ui/Modal.svelte';

  const lang = $derived(engine.settings.language);

  // ===========================================================================
  // ROUTE PARAMS + AUTH GUARD
  // ===========================================================================

  const campaignId = $derived($page.params.id ?? '');
  const entityId   = $derived(decodeURIComponent(($page.params as Record<string, string>)['entityId'] ?? ''));

  $effect(() => {
    if (!sessionContext.isGameMaster) goto(`/campaigns/${campaignId}`);
  });

  $effect(() => {
    if (campaignId) sessionContext.setActiveCampaign(campaignId);
  });

  // ===========================================================================
  // ENTITY LOOKUP
  // ===========================================================================

  /**
   * The entity being edited (from HomebrewStore).
   * Reacts to entityId changes and to store mutations.
   */
  const entity = $derived(homebrewStore.getById(entityId));

  /**
   * If the entity doesn't exist in the store, redirect to the library.
   * Uses a `?notFound=1` query param so the library can show a brief warning.
   */
  $effect(() => {
    if (entityId && homebrewStore.entities.length > 0 && !entity) {
      goto(`/campaigns/${campaignId}/content-editor?notFound=${encodeURIComponent(entityId)}`);
    }
  });

  // ===========================================================================
  // DELETE FLOW
  // ===========================================================================

  let showDeleteConfirm = $state(false);

  function confirmDelete(): void {
    homebrewStore.remove(entityId);
    goto(`/campaigns/${campaignId}/content-editor`);
  }

  // ===========================================================================
  // SAVE CALLBACK
  // ===========================================================================

  function handleSaved(_saved: Feature): void {
    // EntityForm already called homebrewStore.update(). Optionally redirect.
    // For edit mode we stay on the page (the GM may continue tweaking).
    // A brief "Saved" indicator is shown by EntityForm's own save bar.
  }
</script>

<!-- Delete confirmation modal -->
{#if showDeleteConfirm}
  <Modal open={true} onClose={() => (showDeleteConfirm = false)} title={ui('content_editor.edit.delete_entity_title', lang)} size="sm">
    {#snippet children()}
      <div class="flex flex-col gap-4">
        <p class="text-sm text-text-primary">
          {ui('content_editor.edit.delete_prompt', lang).replace('{id}', entityId)}
        </p>
        <p class="text-xs text-text-muted">
          {ui('content_editor.edit.delete_desc', lang)}
        </p>
        <div class="flex justify-end gap-2">
          <button type="button" class="btn-ghost"
                  onclick={() => (showDeleteConfirm = false)}>
            {ui('common.cancel', lang)}
          </button>
          <button type="button" class="btn-danger" onclick={confirmDelete}>
            {ui('content_editor.edit.delete_permanently', lang)}
          </button>
        </div>
      </div>
    {/snippet}
  </Modal>
{/if}

<!-- ======================================================================== -->
<!-- PAGE                                                                      -->
<!-- ======================================================================== -->
<div class="flex flex-col gap-6 p-4 md:p-6 max-w-4xl mx-auto">

  <!-- Header row: back link + title + delete button -->
  <div class="flex items-center gap-3">
    <a href="/campaigns/{campaignId}/content-editor"
       class="text-text-muted hover:text-text-primary transition-colors shrink-0"
       aria-label={ui('content_editor.back_to_library_aria', lang)}>
      <svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
           fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="15 18 9 12 15 6"/>
      </svg>
    </a>

    <div class="flex-1 min-w-0">
      <h1 class="text-xl font-bold text-text-primary truncate">
        {ui('content_editor.edit.heading', lang).replace('{id}', '')}
        <code class="font-mono">{entityId}</code>
      </h1>
      {#if entity}
        <p class="text-xs text-text-muted">
          {ui(`editor.category.${entity.category}`, lang) || entity.category} · {entity.ruleSource}
        </p>
      {/if}
    </div>

    <!-- Delete button (prominent, top-right) -->
    {#if entity}
      <button
        type="button"
        class="btn-ghost text-sm text-danger hover:bg-danger/10 border border-danger/30
               hover:border-danger/50 transition-colors shrink-0"
        onclick={() => (showDeleteConfirm = true)}
      >
        {ui('content_editor.edit.delete_btn', lang)}
      </button>
    {/if}
  </div>

  <!-- ── ENTITY NOT FOUND ──────────────────────────────────────────────── -->
  {#if !entity}
    <div class="rounded-lg border border-border px-6 py-12 text-center">
      <p class="text-text-muted italic text-sm">
        {ui('content_editor.edit.loading', lang).replace('{id}', '')}
        <code class="font-mono">{entityId}</code>…
      </p>
      <p class="text-xs text-text-muted mt-2">
        {ui('content_editor.edit.loading_hint', lang)}
        <a href="/campaigns/{campaignId}/content-editor"
           class="underline hover:text-text-primary">{ui('content_editor.edit.return_link', lang)}</a>
      </p>
    </div>

  <!-- ── ENTITY FORM ───────────────────────────────────────────────────── -->
  {:else}
    <EntityForm
      category={entity.category}
      initialData={entity}
      mode="edit"
      onSaved={handleSaved}
    />
  {/if}

</div>
