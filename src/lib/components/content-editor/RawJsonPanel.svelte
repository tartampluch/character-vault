<!--
  @file src/lib/components/content-editor/RawJsonPanel.svelte
  @description Two-way synced raw JSON panel at the bottom of EntityForm.
-->

<script lang="ts">
  import { getContext, untrack } from 'svelte';
  import { EDITOR_CONTEXT_KEY, type EditorContext } from './editorContext';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';
  import type { Feature } from '$lib/types/feature';
  import { IconSuccess } from '$lib/components/ui/icons';

  const ctx = getContext<EditorContext>(EDITOR_CONTEXT_KEY);
  const lang = $derived(engine.settings.language);

  interface Props {
    onRawJsonChange: (feature: Feature) => void;
  }

  let { onRawJsonChange }: Props = $props();

  let pretty = $state(true);

  const derivedJson = $derived(
    pretty
      ? JSON.stringify(ctx.feature, null, 2)
      : JSON.stringify(ctx.feature)
  );

  let textareaValue = $state(untrack(() => derivedJson));
  let userEditing = $state(false);
  let parseError = $state('');
  let copySuccess = $state(false);

  $effect(() => {
    const incoming = derivedJson;
    if (!userEditing) {
      textareaValue = incoming;
    }
  });

  $effect(() => {
    const text = textareaValue;
    if (!userEditing) return;

    const timer = setTimeout(() => {
      parseError = '';
      try {
        const parsed = JSON.parse(text) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          parseError = ui('editor.raw_json.must_be_object_error', engine.settings.language);
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
      {ui('editor.raw_json.section_title', lang)}
      {#if userEditing}
        <span class="text-[10px] font-normal text-amber-400">{ui('editor.raw_json.editing_hint', lang)}</span>
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
        {pretty ? ui('editor.raw_json.minify_btn', lang) : ui('editor.raw_json.prettify_btn', lang)}
      </button>
      <button type="button" class="btn-ghost text-xs py-0.5 px-2 h-auto"
              onclick={copyToClipboard}>
        {#if copySuccess}
          <IconSuccess size={14} aria-hidden="true" />
          {ui('editor.raw_json.copied_btn', lang)}
        {:else}
          {ui('editor.raw_json.copy_btn', lang)}
        {/if}
      </button>
      <span class="text-[10px] text-text-muted ml-auto">
        {ui('editor.raw_json.char_count', lang).replace('{n}', textareaValue.length.toLocaleString())}
      </span>
    </div>

    <!-- Parse error -->
    {#if parseError}
      <div class="rounded border border-red-700/50 bg-red-900/20 px-3 py-2 text-xs text-red-400"
           role="alert">
        <strong>{ui('editor.raw_json.parse_error_prefix', lang)}</strong> {parseError}
        <span class="text-red-400/70">{ui('editor.raw_json.parse_error_suffix', lang)}</span>
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
      aria-label={ui('editor.raw_json.json_editor_aria', lang)}
    ></textarea>

    <p class="text-[10px] text-text-muted">
      {ui('editor.raw_json.auto_parse_hint', lang)}
    </p>

  </div>
</details>
