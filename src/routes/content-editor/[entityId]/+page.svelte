<!--
  @file src/routes/content-editor/[entityId]/+page.svelte
  @description Edit Entity Page (global scope) — loads a homebrew entity and renders EntityForm in edit mode.

  ────────────────────────────────────────────────────────────────────────────
  DATA FLOW
  ────────────────────────────────────────────────────────────────────────────
  1. URL param `[entityId]` is URI-decoded.
  2. HomebrewStore.getById(entityId) — loaded entity.
  3. If not found in the store, redirect back to the global content editor.
  4. EntityForm renders in mode: 'edit'.
  5. Save → HomebrewStore.update() (handled inside EntityForm via ctx.store).
  6. Delete → confirmation modal → HomebrewStore.remove() → redirect to global editor.

  ────────────────────────────────────────────────────────────────────────────
  AUTH GUARD
  ────────────────────────────────────────────────────────────────────────────
  Non-GM/non-admin users are redirected to /campaigns.

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
  import { IconBack } from '$lib/components/ui/icons';
  import type { Feature } from '$lib/types/feature';
  import EntityForm from '$lib/components/content-editor/EntityForm.svelte';
  import Modal from '$lib/components/ui/Modal.svelte';

  const lang = $derived(engine.settings.language);

  // ===========================================================================
  // ROUTE PARAMS + AUTH GUARD
  // ===========================================================================

  const entityId = $derived(decodeURIComponent(($page.params as Record<string, string>)['entityId'] ?? ''));

  $effect(() => {
    if (!sessionContext.isGameMaster && !sessionContext.isAdmin) {
      goto('/campaigns');
    }
  });

  /** Ensure global scope is set for this context. */
  $effect(() => {
    homebrewStore.scope = 'global';
  });

  // ===========================================================================
  // ENTITY LOOKUP
  // ===========================================================================

  const entity = $derived(homebrewStore.getById(entityId));

  /**
   * If the entity doesn't exist in the store, redirect to the global editor.
   */
  $effect(() => {
    if (entityId && homebrewStore.entities.length > 0 && !entity) {
      goto(`/content-editor?notFound=${encodeURIComponent(entityId)}`);
    }
  });

  // ===========================================================================
  // DELETE FLOW
  // ===========================================================================

  let showDeleteConfirm = $state(false);

  function confirmDelete(): void {
    homebrewStore.remove(entityId);
    goto('/content-editor');
  }

  // ===========================================================================
  // SAVE CALLBACK
  // ===========================================================================

  function handleSaved(_saved: Feature): void {
    // EntityForm already called homebrewStore.update(). Stay on page for tweaking.
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
  <header class="flex items-start justify-between gap-3 flex-wrap">
    <div class="flex flex-col gap-0.5 flex-1 min-w-0">
      <a href="/content-editor"
         class="inline-flex items-center gap-1 text-xs text-text-muted hover:text-accent transition-colors">
        <IconBack size={12} aria-hidden="true" /> {ui('nav.content_editor', lang)}
      </a>
      <div class="min-w-0">
        <h1 class="text-2xl font-bold text-text-primary truncate">
          {ui('content_editor.edit.heading', lang).replace('{id}', '')}
          <code class="font-mono">{entityId}</code>
        </h1>
        {#if entity}
          <p class="text-xs text-text-muted">
            {ui(`editor.category.${entity.category}`, lang) || entity.category} · {entity.ruleSource}
          </p>
        {/if}
      </div>
    </div>

    <!-- Delete button (top-right action) -->
    {#if entity}
      <div class="flex items-center gap-2 shrink-0">
        <button
          type="button"
          class="btn-ghost text-sm text-danger hover:bg-danger/10 border border-danger/30
                 hover:border-danger/50 transition-colors"
          onclick={() => (showDeleteConfirm = true)}
        >
          {ui('content_editor.edit.delete_btn', lang)}
        </button>
      </div>
    {/if}
  </header>

  <!-- ── ENTITY NOT FOUND ──────────────────────────────────────────────── -->
  {#if !entity}
    <div class="rounded-lg border border-border px-6 py-12 text-center">
      <p class="text-text-muted italic text-sm">
        {ui('content_editor.edit.loading', lang).replace('{id}', '')}
        <code class="font-mono">{entityId}</code>…
      </p>
      <p class="text-xs text-text-muted mt-2">
        {ui('content_editor.edit.loading_hint', lang)}
        <a href="/content-editor"
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
