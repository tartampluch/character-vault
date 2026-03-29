<!--
  @file src/lib/components/settings/VariantRulesPanel.svelte
  @description Variant Rules panel — Gestalt (Extension G) + Vitality/Wound Points (Extension H).
  Extracted from settings/+page.svelte as part of F1c refactoring.

  Props (all $bindable):
    bind:variantGestalt — boolean
    bind:variantVWP     — boolean
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';
  import { IconWarning, IconRuleSources } from '$lib/components/ui/icons';
  import { RESOURCE_VITALITY_POINTS_ID, RESOURCE_WOUND_POINTS_ID } from '$lib/utils/constants';

  let {
    variantGestalt = $bindable(false),
    variantVWP     = $bindable(false),
  } = $props();
</script>

<!-- ── SECTION 4: VARIANT RULES (Extensions G + H) ─────────────────────── -->
<section class="card p-5 flex flex-col gap-4">
  <div>
    <h2 class="section-header text-base border-b border-border pb-2">
      <IconRuleSources size={24} aria-hidden="true" /> {ui('variant.title', engine.settings.language)}
    </h2>
    <p class="mt-2 text-xs text-text-muted leading-relaxed">
      {ui('settings.variant.section_desc', engine.settings.language)}
    </p>
  </div>

  <!-- Gestalt Characters (Extension G) -->
  <label class="flex items-start gap-3 cursor-pointer group">
    <div class="mt-0.5 shrink-0">
      <input
        type="checkbox"
        bind:checked={variantGestalt}
        class="w-4 h-4 accent-accent rounded"
        aria-labelledby="variant-gestalt-label"
      />
    </div>
    <div class="flex flex-col gap-0.5">
      <span id="variant-gestalt-label" class="text-sm font-semibold text-text-primary group-hover:text-accent transition-colors">
        {ui('variant.gestalt', engine.settings.language)}
      </span>
      <span class="text-xs text-text-muted leading-relaxed">
        {ui('variant.gestalt_desc', engine.settings.language)}
      </span>
    </div>
  </label>

  <!-- Vitality / Wound Points (Extension H) -->
  <label class="flex items-start gap-3 cursor-pointer group">
    <div class="mt-0.5 shrink-0">
      <input
        type="checkbox"
        bind:checked={variantVWP}
        class="w-4 h-4 accent-accent rounded"
        aria-labelledby="variant-vwp-label"
      />
    </div>
    <div class="flex flex-col gap-0.5">
      <span id="variant-vwp-label" class="text-sm font-semibold text-text-primary group-hover:text-accent transition-colors">
        {ui('variant.vitality_wound', engine.settings.language)}
      </span>
      <span class="text-xs text-text-muted leading-relaxed">
        {ui('variant.vitality_wound_desc', engine.settings.language)}
      </span>
      {#if variantVWP}
        <!-- ZERO-HARDCODING RULE (ARCHITECTURE.md §6):
             Resource pool IDs are system constants — imported from constants.ts,
             never inlined as string literals in .svelte template code. -->
        <p class="text-xs text-amber-400/80 italic mt-0.5">
          <IconWarning size={14} aria-hidden="true" /> {ui('settings.variant.vwp_warning', engine.settings.language)
            .replace('{v}', RESOURCE_VITALITY_POINTS_ID)
            .replace('{w}', RESOURCE_WOUND_POINTS_ID)}
        </p>
      {/if}
    </div>
  </label>
</section>
