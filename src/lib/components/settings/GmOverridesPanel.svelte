<!--
  @file src/lib/components/settings/GmOverridesPanel.svelte
  @description GM Global Overrides panel — JSON textarea with live validation.
  Extracted from settings/+page.svelte as part of F1e refactoring.

  Props:
    bind:gmOverridesText  — string  (raw JSON text)
    bind:isValidJson      — boolean (computed inside, exposed so parent can disable Save)
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui, uiN } from '$lib/i18n/ui-strings';
  import { IconGMDashboard, IconWarning, IconError, IconSuccess, IconChevronRight } from '$lib/components/ui/icons';

  let {
    gmOverridesText = $bindable('[]'),
    isValidJson     = $bindable(true),
  } = $props();

  /**
   * Reactive JSON validation — recomputes synchronously whenever gmOverridesText
   * or the active language changes.
   *
   * ZERO-HARDCODING RULE (ARCHITECTURE.md §6):
   *   All user-facing error and warning messages are resolved via ui() so they
   *   are translated when the GM switches languages.
   */
  const _jsonValidation = $derived.by(() => {
    const text = gmOverridesText;
    const lang = engine.settings.language; // reactive dependency — re-runs on lang change
    const trimmed = text.trim();

    if (!trimmed || trimmed === '[]') {
      return { valid: true, error: '', warnings: [] as string[] };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e: unknown) {
      const err = e as Error;
      const posMatch = err.message.match(/position (\d+)/);
      let errMsg: string;
      if (posMatch) {
        const pos     = parseInt(posMatch[1], 10);
        const lineNum = text.slice(0, pos).split('\n').length;
        errMsg = `${ui('settings.overrides.json_syntax_on_line', lang).replace('{line}', String(lineNum))} ${err.message}`;
      } else {
        errMsg = `${ui('gm.syntax_error', lang)} ${err.message}`;
      }
      return { valid: false, error: errMsg, warnings: [] as string[] };
    }

    if (!Array.isArray(parsed)) {
      return { valid: false, error: ui('settings.overrides.json_not_array', lang), warnings: [] as string[] };
    }

    const warnings: string[] = [];
    for (let i = 0; i < (parsed as unknown[]).length; i++) {
      const entry = (parsed as Record<string, unknown>[])[i];
      if (!entry || typeof entry !== 'object') {
        warnings.push(
          ui('settings.overrides.json_entry_bad_type', lang)
            .replace('{n}', String(i))
            .replace('{type}', typeof entry)
        );
        continue;
      }
      if (!entry['tableId'] && (!entry['id'] || !entry['category'])) {
        warnings.push(
          ui('settings.overrides.json_entry_no_id', lang)
            .replace('{n}', String(i))
            .replace('{id}', String(entry['id'] ?? '?'))
        );
      }
      if (entry['tableId'] && !entry['data']) {
        warnings.push(
          ui('settings.overrides.json_entry_no_data', lang)
            .replace('{n}', String(i))
            .replace('{tableId}', String(entry['tableId']))
        );
      }
    }
    return { valid: true, error: '', warnings };
  });

  const jsonError    = $derived(_jsonValidation.error);
  const jsonWarnings = $derived(_jsonValidation.warnings);

  // Expose isValidJson via $bindable so parent can gate the Save button.
  $effect(() => { isValidJson = _jsonValidation.valid; });
</script>

<!-- ── SECTION 6: GM GLOBAL OVERRIDES ─────────────────────────────────────── -->
<section class="card p-5 flex flex-col gap-3">
  <div>
    <h2 class="section-header text-base border-b border-border pb-2">
      <IconGMDashboard size={24} aria-hidden="true" /> {ui('settings.overrides.title', engine.settings.language)}
    </h2>
    <p class="mt-2 text-xs text-text-muted leading-relaxed [&_code]:bg-surface-alt [&_code]:px-1 [&_code]:rounded">
      {@html ui('settings.overrides.desc', engine.settings.language)}
    </p>
  </div>

  <!-- Examples (collapsible) -->
  <details class="group rounded-lg border border-border">
    <summary class="flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-xs font-medium text-text-muted
                    hover:text-text-primary transition-colors list-none [&::-webkit-details-marker]:hidden">
      <IconChevronRight size={12} class="transition-transform duration-150 group-open:rotate-90" aria-hidden="true" />
      {ui('settings.overrides.examples', engine.settings.language)}
    </summary>
    <div class="flex flex-col gap-3 px-3 pb-3 pt-1">

      <!-- Example 1: new feature granting a campaign-wide bonus -->
      <div class="flex flex-col gap-1">
        <p class="text-[10px] font-semibold uppercase tracking-wider text-accent/80">
          {ui('settings.overrides.ex_new_label', engine.settings.language)}
        </p>
        <pre class="overflow-x-auto rounded bg-surface-alt px-3 py-2 text-[10px] leading-relaxed text-text-secondary font-mono">{`[
  {
    "id":          "gm_campaign_boon",
    "category":    "feat",
    "ruleSource":  "gm_override",
    "label":       { "en": "Campaign Boon", "fr": "B\u00e9n\u00e9diction de campagne" },
    "description": { "en": "All adventurers gain a +2 morale bonus to Spot.", "fr": "Tous les aventuriers gagnent un bonus de moral de +2 \u00e0 D\u00e9tection." },
    "grantedModifiers": [
      {
        "id":       "gm_campaign_boon_spot",
        "sourceId": "gm_campaign_boon",
        "targetId": "skills.skill_spot",
        "value":    2,
        "type":     "morale"
      }
    ]
  }
]`}</pre>
      </div>

      <!-- Example 2: partial override (merge) to patch an existing entity -->
      <div class="flex flex-col gap-1">
        <p class="text-[10px] font-semibold uppercase tracking-wider text-accent/80">
          {ui('settings.overrides.ex_merge_label', engine.settings.language)}
        </p>
        <pre class="overflow-x-auto rounded bg-surface-alt px-3 py-2 text-[10px] leading-relaxed text-text-secondary font-mono">{`[
  {
    "id":       "feat_power_attack",
    "category": "feat",
    "merge":    "partial",
    "label":    { "en": "Power Attack (house rule)" },
    "grantedModifiers": [
      {
        "id":       "feat_pa_custom_penalty",
        "sourceId": "feat_power_attack",
        "targetId": "combatStats.base_attack_bonus",
        "value":    -2,
        "type":     "untyped"
      }
    ]
  }
]`}</pre>
      </div>

      <!-- Example 3: config table override -->
      <div class="flex flex-col gap-1">
        <p class="text-[10px] font-semibold uppercase tracking-wider text-accent/80">
          {ui('settings.overrides.ex_table_label', engine.settings.language)}
        </p>
        <pre class="overflow-x-auto rounded bg-surface-alt px-3 py-2 text-[10px] leading-relaxed text-text-secondary font-mono">{`[
  {
    "tableId":    "config_xp_thresholds",
    "ruleSource": "gm_override",
    "data": [
      { "level": 1, "xpRequired": 0    },
      { "level": 2, "xpRequired": 1500 },
      { "level": 3, "xpRequired": 3500 }
    ]
  }
]`}</pre>
      </div>

    </div>
  </details>

  <!-- JSON error -->
  {#if jsonError}
    <div class="flex items-start gap-2 px-3 py-2 rounded border border-red-700/40 bg-red-950/20 text-red-400 text-xs font-mono" role="alert">
      <IconWarning size={12} class="mt-0.5 shrink-0" aria-hidden="true" />
      <span>{jsonError}</span>
    </div>
  {/if}

  <!-- JSON warnings (non-blocking) -->
  {#if jsonWarnings.length > 0}
    <ul class="flex flex-col gap-1">
      {#each jsonWarnings as warning}
        <li class="flex items-center gap-1.5 px-2 py-1 rounded border border-yellow-700/40 bg-yellow-950/20 text-yellow-400 text-xs">
          <IconWarning size={11} aria-hidden="true" /> {warning}
        </li>
      {/each}
    </ul>
  {/if}

  <!-- JSON textarea -->
  <textarea
    class="w-full rounded-lg border px-3 py-2.5 font-mono text-xs leading-relaxed resize-vertical
           bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50 transition-colors
           {isValidJson ? 'border-border focus:border-accent' : 'border-red-600 bg-red-950/10'}"
    bind:value={gmOverridesText}
    spellcheck="false"
    rows="18"
    aria-label={ui('settings.overrides.aria_label', engine.settings.language)}
  ></textarea>

  <!-- JSON status bar -->
  <div class="flex items-center justify-between text-xs px-0.5">
    <span class="flex items-center gap-1.5 font-medium {isValidJson ? 'text-green-400' : 'text-red-400'}">
      {#if isValidJson}
        <IconSuccess size={13} aria-hidden="true" /> {ui('settings.overrides.valid', engine.settings.language)}
      {:else}
        <IconError size={13} aria-hidden="true" /> {ui('settings.overrides.invalid', engine.settings.language)}
      {/if}
    </span>
    {#if isValidJson}
      {@const _c = JSON.parse(gmOverridesText || '[]').length}
      <span class="text-text-muted">
        {uiN('settings.overrides.entry', _c, engine.settings.language)}
      </span>
    {/if}
  </div>
</section>
