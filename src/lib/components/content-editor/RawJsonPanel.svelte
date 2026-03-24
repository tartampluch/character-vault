<!--
  @file src/lib/components/content-editor/RawJsonPanel.svelte
  @description Two-way synced raw JSON panel at the bottom of EntityForm.

  PURPOSE:
    Gives power users direct access to the raw JSON of the entity being edited.
    Supports copying the full Feature JSON for use in rule source files, and
    allows bulk-editing fields that don't yet have a dedicated UI control.

  TWO-WAY SYNC:
    • Form → textarea: any change to EditorContext.feature immediately updates
      the textarea (via $derived from ctx.feature).
    • Textarea → form: oninput is debounced 300 ms; on valid parse the form
      state is replaced via onRawJsonChange; on invalid parse a red error
      banner appears WITHOUT touching the form state.

  DISPLAYS:
    - "Prettify / Minify" button toggles between pretty-printed and minified JSON.
    - "Copy to Clipboard" button copies the current textarea content.
-->

<script lang="ts">
  import { getContext, untrack } from 'svelte';
  import { EDITOR_CONTEXT_KEY, type EditorContext } from './editorContext';
  import type { Feature } from '$lib/types/feature';

  // ===========================================================================
  // CONTEXT
  // ===========================================================================

  const ctx = getContext<EditorContext>(EDITOR_CONTEXT_KEY);

  interface Props {
    /** Called when the textarea contains a valid Feature JSON, after debounce. */
    onRawJsonChange: (feature: Feature) => void;
  }

  let { onRawJsonChange }: Props = $props();

  // ===========================================================================
  // DISPLAY STATE
  // ===========================================================================

  let pretty = $state(true);

  /** Authoritative display text — derived from form state. */
  const derivedJson = $derived(
    pretty
      ? JSON.stringify(ctx.feature, null, 2)
      : JSON.stringify(ctx.feature)
  );

  /**
   * The textarea's current text content. Starts as the derived JSON and is
   * updated when the form state changes (unless the user is actively editing).
   */
  let textareaValue = $state(untrack(() => derivedJson));

  /** True while the user has pending textarea edits not yet reflected in form. */
  let userEditing = $state(false);

  /** Error message from the most recent failed parse attempt. */
  let parseError = $state('');

  /** Whether the copy button recently succeeded (resets after 2 s). */
  let copySuccess = $state(false);

  // Sync form → textarea whenever form state changes (from other controls).
  $effect(() => {
    const incoming = derivedJson;
    if (!userEditing) {
      textareaValue = incoming;
    }
  });

  // ===========================================================================
  // DEBOUNCED PARSE
  // ===========================================================================

  $effect(() => {
    const text = textareaValue;
    if (!userEditing) return;   // only parse when the user is typing

    const timer = setTimeout(() => {
      parseError = '';
      try {
        const parsed = JSON.parse(text) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          parseError = 'Root value must be a JSON object (a Feature).';
          return;
        }
        userEditing = false;
        onRawJsonChange(parsed as Feature);
      } catch (err) {
        parseError = err instanceof Error ? err.message : 'Invalid JSON';
      }
    }, 300);
    return () => clearTimeout(timer);
  });

  // ===========================================================================
  // HANDLERS
  // ===========================================================================

  function handleInput(e: Event): void {
    userEditing = true;
    parseError  = '';
    textareaValue = (e.currentTarget as HTMLTextAreaElement).value;
  }

  function togglePretty(): void {
    pretty = !pretty;
    if (!userEditing) textareaValue = derivedJson;
  }

  async function copyToClipboard(): Promise<void> {
    try {
      await navigator.clipboard.writeText(textareaValue);
      copySuccess = true;
      setTimeout(() => { copySuccess = false; }, 2000);
    } catch {
      /* clipboard API unavailable */
    }
  }
</script>

<details class="group/raw rounded-lg border border-border overflow-hidden">
  <summary class="flex items-center justify-between px-4 py-2 bg-surface-alt cursor-pointer
                  select-none list-none hover:bg-accent/5 text-sm font-semibold text-text-primary">
    <span class="flex items-center gap-2">
      Raw JSON
      {#if userEditing}
        <span class="text-[10px] font-normal text-amber-400">(editing — will sync on pause)</span>
      {/if}
    </span>
    <svg class="h-4 w-4 text-text-muted transition-transform group-open/raw:rotate-180"
         xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2" stroke-linecap="round"
         stroke-linejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  </summary>

  <div class="flex flex-col gap-3 p-4">

    <!-- Toolbar -->
    <div class="flex items-center gap-2 flex-wrap">
      <button type="button" class="btn-ghost text-xs py-0.5 px-2 h-auto"
              onclick={togglePretty}>
        {pretty ? 'Minify' : 'Prettify'}
      </button>
      <button type="button" class="btn-ghost text-xs py-0.5 px-2 h-auto"
              onclick={copyToClipboard}>
        {copySuccess ? '✓ Copied!' : 'Copy to Clipboard'}
      </button>
      <span class="text-[10px] text-text-muted ml-auto">
        {textareaValue.length.toLocaleString()} chars
      </span>
    </div>

    <!-- Parse error -->
    {#if parseError}
      <div class="rounded border border-red-700/50 bg-red-900/20 px-3 py-2 text-xs text-red-400"
           role="alert">
        <strong>JSON parse error:</strong> {parseError}
        <span class="text-red-400/70"> — form state unchanged.</span>
      </div>
    {/if}

    <!-- Textarea -->
    <textarea
      class="input font-mono text-xs min-h-[20rem] resize-y leading-relaxed
             {parseError ? 'border-red-600/50' : userEditing ? 'border-amber-600/50' : ''}"
      value={textareaValue}
      oninput={handleInput}
      spellcheck="false"
      autocapitalize="off"
      aria-label="Raw JSON editor"
    ></textarea>

    <p class="text-[10px] text-text-muted">
      Changes are parsed automatically 300 ms after you stop typing.
      Valid JSON objects replace the form state; invalid JSON shows an error without affecting the form.
    </p>

  </div>
</details>
