<!--
  @file src/lib/components/settings/CampaignInfoPanel.svelte
  @description Campaign Info panel — edits the localised campaign title and description.

  Uses LocalizedStringEditor (the same multi-language input used in the content
  editor) so the GM can provide translations for all players regardless of their
  UI language.

  Props:
    bind:editableTitle       — Record<string, string>  (LocalizedString for the title)
    bind:editableDescription — Record<string, string>  (LocalizedString for the description)
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';
  import { IconCampaign } from '$lib/components/ui/icons';
  import LocalizedStringEditor from '$lib/components/content-editor/LocalizedStringEditor.svelte';

  let {
    editableTitle       = $bindable<Record<string, string>>({}),
    editableDescription = $bindable<Record<string, string>>({}),
  } = $props();

  const lang = $derived(engine.settings.language);
</script>

<section class="card p-5 flex flex-col gap-4" aria-label={ui('settings.info.title', lang)}>

  <!-- ── Panel header ──────────────────────────────────────────────────────── -->
  <div class="flex flex-col gap-0.5">
    <h2 class="flex items-center gap-2 text-base font-semibold text-accent">
      <IconCampaign size={18} aria-hidden="true" />
      {ui('settings.info.title', lang)}
    </h2>
    <p class="text-xs text-text-muted">{ui('settings.info.desc', lang)}</p>
  </div>

  <!-- ── Title ─────────────────────────────────────────────────────────────── -->
  <fieldset class="flex flex-col gap-2 border-0 p-0 m-0">
    <legend class="text-sm font-medium text-text-secondary mb-1">
      {ui('settings.info.field_title', lang)}
    </legend>
    <LocalizedStringEditor
      value={editableTitle}
      onchange={(v) => (editableTitle = v)}
      mode="input"
      uid="campaign-info"
      fieldName="title"
      {lang}
      placeholder={ui('settings.info.field_title_placeholder', lang)}
      extraPlaceholder={ui('editor.lang.translation_placeholder', lang)}
    />
  </fieldset>

  <!-- ── Description ───────────────────────────────────────────────────────── -->
  <fieldset class="flex flex-col gap-2 border-0 p-0 m-0">
    <legend class="text-sm font-medium text-text-secondary mb-1">
      {ui('settings.info.field_description', lang)}
    </legend>
    <LocalizedStringEditor
      value={editableDescription}
      onchange={(v) => (editableDescription = v)}
      mode="textarea"
      uid="campaign-info"
      fieldName="description"
      {lang}
      placeholder={ui('settings.info.field_description_placeholder', lang)}
      extraPlaceholder={ui('settings.info.field_description_extra_placeholder', lang)}
    />
  </fieldset>

</section>
