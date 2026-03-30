<!--
  @file src/lib/components/settings/CampaignInfoPanel.svelte
  @description Campaign Info panel — edits the localised title, description,
               and banner image for the campaign.

  BANNER IMAGE DESIGN:
    The banner is stored as a base64 data URI in `campaigns.banner_image_data`.
    No separate file server is needed — the raw bytes live in the DB.
    Flow:
      1. GM clicks "Browse Image…" → hidden <input type="file"> opens.
      2. Client validates: MIME type (JPEG/PNG/WebP/GIF) and size (≤ 5 MB).
      3. On success: File is converted to a data URI via FileReader.
         `editableBannerImageData` is updated (reflects in the preview instantly).
      4. An informational notice replaces the error slot.
      5. The GM clicks "Save Settings" in the parent page — the data URI is
         included in the PUT /api/campaigns/{id} body.
      6. On remove: `editableBannerImageData` is set to null; the preview
         reverts to the placeholder.

    The "Remove Banner" button is visible only when a banner is currently set
    (either the persisted one or a freshly selected one).

  PROPS (all $bindable):
    editableTitle          — Record<string, string>  (localised title)
    editableDescription    — Record<string, string>  (localised description)
    editableBannerImageData — string | null          (base64 data URI or null)
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';
  import { IconCampaign, IconImage, IconDelete } from '$lib/components/ui/icons';
  import LocalizedStringEditor from '$lib/components/content-editor/LocalizedStringEditor.svelte';
  import {
    validateBannerFile,
    fileToBase64DataUri,
    isImageDataUri,
    BANNER_INPUT_ACCEPT,
  } from '$lib/utils/bannerImageUtils';

  // ── Props ──────────────────────────────────────────────────────────────────
  interface Props {
    editableTitle?:           Record<string, string>;
    editableDescription?:     Record<string, string>;
    /** Base64 data URI of the current banner, or null when none is set. */
    editableBannerImageData?: string | null;
  }

  let {
    editableTitle           = $bindable({}),
    editableDescription     = $bindable({}),
    editableBannerImageData = $bindable(null),
  }: Props = $props();

  const lang = $derived(engine.settings.language);

  // ── Internal state ─────────────────────────────────────────────────────────
  /**
   * True when the GM selected a new file in this session but has not yet saved.
   * Drives the informational "will be saved with Settings" notice.
   */
  let pendingChange  = $state(false);

  /** Validation error key, or '' when no error. Cleared on each new selection. */
  let validationError: '' | 'error_type' | 'error_size' = $state('');
  let errorSizeMb     = $state('');

  /**
   * Reference to the hidden <input type="file"> element.
   * Clicked programmatically when the "Browse Image…" button is pressed.
   */
  let fileInputEl: HTMLInputElement | null = $state(null);

  // ── Banner upload handler ──────────────────────────────────────────────────

  /**
   * Handles a file selection from the hidden <input type="file">.
   * Validates the file, converts it to a data URI, and updates the binding.
   *
   * Called by the input's `onchange` event — never invoked by the user directly.
   */
  async function handleFileChange(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file  = input.files?.[0];

    // Reset state from any previous attempt.
    validationError = '';
    errorSizeMb     = '';
    pendingChange   = false;

    if (!file) return;

    // Always reset the input value so the same file can be re-selected after
    // removal without the browser treating it as a no-op.
    input.value = '';

    // Client-side validation (type + size check).
    const result = validateBannerFile(file);
    if (!result.ok) {
      validationError = result.errorKey;
      if (result.errorKey === 'error_size') {
        errorSizeMb = result.sizeMb;
      }
      return;
    }

    try {
      // Convert to base64 data URI — this is an async FileReader operation.
      editableBannerImageData = await fileToBase64DataUri(file);
      pendingChange = true;
    } catch (err) {
      console.warn('[CampaignInfoPanel] fileToBase64DataUri failed:', err);
      validationError = 'error_type'; // Treat a read error as "unsupported file".
    }
  }

  /** Clears the current banner and marks the tab as having unsaved changes. */
  function handleRemoveBanner(): void {
    editableBannerImageData = null;
    validationError         = '';
    errorSizeMb             = '';
    pendingChange           = true;
  }

  /** Opens the hidden file input. */
  function openFilePicker(): void {
    fileInputEl?.click();
  }

  // ── Derived helpers ───────────────────────────────────────────────────────

  /** True when a banner image (persisted or freshly selected) is present. */
  const hasBanner = $derived(isImageDataUri(editableBannerImageData));
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

  <!-- ── Banner Image ──────────────────────────────────────────────────────── -->
  <fieldset class="flex flex-col gap-3 border-0 p-0 m-0">
    <div class="flex flex-col gap-0.5">
      <legend class="text-sm font-medium text-text-secondary">
        {ui('settings.info.banner.title', lang)}
      </legend>
      <p class="text-xs text-text-muted">{ui('settings.info.banner.desc', lang)}</p>
    </div>

    <!--
      PREVIEW AREA
      Shows the current or newly selected banner.
      h-52 matches the fixed height used by PageHeader's banner area so the
      preview proportions are identical to the rendered banner on the campaign
      page. object-cover on the <img> gives aspect-fill behaviour.
      If no banner is set, a neutral placeholder is shown at the same height.
    -->
    <div class="relative w-full h-52 rounded-lg overflow-hidden border border-border bg-surface-alt">
      {#if hasBanner}
        <img
          src={editableBannerImageData!}
          alt={ui('settings.info.banner.current_alt', lang)}
          class="w-full h-full object-cover"
        />
      {:else}
        <!-- Placeholder shown when no banner is set -->
        <div class="w-full h-full flex flex-col items-center justify-center gap-2 text-text-muted/40">
          <IconImage size={40} aria-hidden="true" />
          <span class="text-xs">{ui('settings.info.banner.no_banner', lang)}</span>
        </div>
      {/if}
    </div>

    <!-- ACTION ROW: Browse + Remove -->
    <div class="flex items-center gap-2 flex-wrap">
      <!--
        Hidden file input — triggered programmatically by the Browse button.
        Using a hidden input + visible button gives full styling control while
        preserving native file-picker behaviour and accessibility.
      -->
      <input
        bind:this={fileInputEl}
        type="file"
        accept={BANNER_INPUT_ACCEPT}
        class="sr-only"
        aria-hidden="true"
        tabindex="-1"
        onchange={handleFileChange}
      />

      <!-- Browse button -->
      <button
        type="button"
        class="btn-secondary gap-1.5 text-sm"
        onclick={openFilePicker}
        aria-label={ui('settings.info.banner.browse', lang)}
      >
        <IconImage size={14} aria-hidden="true" />
        {ui('settings.info.banner.browse', lang)}
      </button>

      <!-- Remove banner — only shown when a banner is currently present -->
      {#if hasBanner}
        <button
          type="button"
          class="btn-danger-outline gap-1.5 text-sm"
          onclick={handleRemoveBanner}
          aria-label={ui('settings.info.banner.remove', lang)}
        >
          <IconDelete size={14} aria-hidden="true" />
          {ui('settings.info.banner.remove', lang)}
        </button>
      {/if}
    </div>

    <!-- Validation error -->
    {#if validationError === 'error_size'}
      <p class="text-xs text-red-400 flex items-center gap-1" role="alert">
        {ui('settings.info.banner.error_size', lang).replace('{size}', errorSizeMb)}
      </p>
    {:else if validationError === 'error_type'}
      <p class="text-xs text-red-400 flex items-center gap-1" role="alert">
        {ui('settings.info.banner.error_type', lang)}
      </p>
    {/if}

    <!-- Pending-change notice -->
    {#if pendingChange && !validationError}
      <p class="text-xs text-amber-400/90 italic">
        {ui('settings.info.banner.pending', lang)}
      </p>
    {/if}

  </fieldset>

</section>
