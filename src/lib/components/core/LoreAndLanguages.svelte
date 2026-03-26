<!--
  @file src/lib/components/core/LoreAndLanguages.svelte
  @description Lore (Personal Story, Appearance) and Language selection panel.
  Phase 19.7: Migrated to Tailwind CSS — all scoped <style> removed.

  LAYOUT (spec 19.7):
    - Desktop (lg+): two-column grid — Personal Story left, Languages right.
      Appearance fields span full width below both columns.
    - Mobile: single column, stacked.

  All text areas, inputs, and selects use the `.textarea`, `.input`, `.select`
  component classes defined in app.css.
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { dataLoader } from '$lib/engine/DataLoader';
  import { ui } from '$lib/i18n/ui-strings';
  import type { ID } from '$lib/types/primitives';
  import { IconLore, IconCharacter, IconLanguages, IconLocked, IconClose } from '$lib/components/ui/icons';

  // ── Lore state ──────────────────────────────────────────────────────────────
  let personalStory = $state(engine.character.customSubtitle ?? '');
  let height = $state('');
  let weight = $state('');
  let age    = $state('');
  let eyes   = $state('');
  let hair   = $state('');
  let skin   = $state('');

  $effect(() => {
    engine.character.customSubtitle = personalStory || undefined;
  });

  const lang = $derived(engine.settings.language);

  // ── Language system ─────────────────────────────────────────────────────────
  //
  // D&D 3.5 RULE: bonus language slots = max(0, INT modifier) + Speak Language ranks.
  // Both the INT pipeline ID ('stat_intelligence') and the skill ID ('skill_speak_language')
  // are internal system identifiers that must NOT be hardcoded in .svelte files
  // (zero-hardcoding rule, ARCHITECTURE.md §6). The engine exposes
  // `phase_bonusLanguageSlots` which performs this computation centrally.
  //
  // Math.max(0, intMod) + speakRanks is also D&D arithmetic forbidden in .svelte
  // files (zero-game-logic-in-Svelte rule, ARCHITECTURE.md §3).
  const bonusLanguageSlots = $derived(engine.phase_bonusLanguageSlots);

  // NOTE: `remainingSlots` is now read from the engine (below) to avoid
  // Math.max(0, bonusLanguageSlots - manualCount) arithmetic in the component.
  // The engine computes phase_remainingLanguageSlots using the same formula.

  const languages = $derived.by(() => {
    const automatic: Array<{ id: ID; name: string }> = [];
    const manual: Array<{ id: ID; name: string; instanceId: ID }> = [];

    for (const afi of engine.character.activeFeatures) {
      if (!afi.isActive) continue;
      const feature = dataLoader.getFeature(afi.featureId);
      if (!feature) continue;

      if (feature.tags.includes('language')) {
        manual.push({ id: feature.id, name: engine.t(feature.label), instanceId: afi.instanceId });
      }

      for (const grantedId of (feature.grantedFeatures ?? [])) {
        if (grantedId.startsWith('-')) continue;
        const grantedFeature = dataLoader.getFeature(grantedId);
        if (grantedFeature?.tags.includes('language')) {
          if (!automatic.some(l => l.id === grantedId) && !manual.some(l => l.id === grantedId)) {
            automatic.push({ id: grantedId, name: engine.t(grantedFeature.label) });
          }
        }
      }
    }

    return { automatic, manual };
  });

  // manualCount is still needed for the slot-counter display (used/{total})
  const manualCount     = $derived(languages.manual.length);
  // remainingSlots: Math.max(0, bonusSlots − manualCount) was forbidden in a .svelte file.
  // Delegated to engine.phase_remainingLanguageSlots (zero-game-logic-in-Svelte, ARCHITECTURE.md §3).
  const remainingSlots  = $derived(engine.phase_remainingLanguageSlots);

  const availableLanguages = $derived.by(() => {
    const selectedIds = new Set([
      ...languages.automatic.map(l => l.id),
      ...languages.manual.map(l => l.id),
    ]);
    return dataLoader.queryFeatures('tag:language')
      .filter(f => !selectedIds.has(f.id))
      .sort((a, b) => engine.t(a.label).localeCompare(engine.t(b.label)));
  });

  function addLanguage(featureId: ID): void {
    if (!featureId || remainingSlots <= 0) return;
    const languageFeature = dataLoader.getFeature(featureId);
    if (!languageFeature) return;
    engine.addFeature({ instanceId: `afi_lang_${featureId}_${Date.now()}`, featureId, isActive: true });
  }

  function removeLanguage(instanceId: ID): void {
    engine.removeFeature(instanceId);
  }

  function handleLanguageSelect(event: Event) {
    const featureId = (event.target as HTMLSelectElement).value;
    if (featureId) {
      addLanguage(featureId);
      (event.target as HTMLSelectElement).value = '';
    }
  }

  /** Build the "Add language (N slot left)" dropdown label */
  function addLangLabel(n: number): string {
    const s = n > 1 ? 's' : '';
    return ui('lore.add_language', lang)
      .replace('{n}', String(n))
      .replace(/\{s\}/g, s);
  }
</script>

<div class="card p-4 flex flex-col gap-4">

  <!-- ================================================================= -->
  <!-- TOP TWO-COLUMN AREA: Personal Story (left) + Languages (right)    -->
  <!-- Single column on mobile, two-column on lg+                        -->
  <!-- ================================================================= -->
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">

    <!-- ── PERSONAL STORY ─────────────────────────────────────────── -->
    <section class="flex flex-col gap-2">
      <div class="section-header border-b border-border pb-2">
        <IconLore size={20} aria-hidden="true" />
        <span>{ui('lore.personal_story', lang)}</span>
      </div>
      <textarea
        class="textarea"
        bind:value={personalStory}
        placeholder={ui('lore.personal_story_placeholder', lang)}
        rows="5"
        aria-label={ui('lore.personal_story', lang)}
      ></textarea>
    </section>

    <!-- ── LANGUAGES ──────────────────────────────────────────────── -->
    <section class="flex flex-col gap-2" aria-label={ui('lore.languages', lang)}>

      <!-- Languages header -->
      <div class="section-header border-b border-border pb-2">
        <IconLanguages size={20} aria-hidden="true" />
        <span>{ui('lore.languages', lang)}</span>
      </div>

      <!-- Slot counter — always below the divider to avoid vertical misalignment -->
      <span
        class="text-xs {remainingSlots === 0 && bonusLanguageSlots > 0 ? 'text-green-500 dark:text-green-400' : 'text-text-muted'}"
        aria-label="{remainingSlots} language slots remaining"
      >
        {#if bonusLanguageSlots > 0}
          {ui('lore.bonus_slots', lang).replace('{used}', String(manualCount)).replace('{total}', String(bonusLanguageSlots))}
        {:else}
          {ui('lore.no_bonus_slots', lang)}
        {/if}
      </span>

      <!-- Automatic languages (locked, from race/class) -->
      {#if languages.automatic.length > 0}
        <div class="flex flex-col gap-1">
          <span class="text-xs text-text-muted uppercase tracking-wider">{ui('lore.automatic', lang)}</span>
          <div class="flex flex-wrap gap-1">
            {#each languages.automatic as lang_entry}
              <span class="badge-green flex items-center gap-1" aria-label="{lang_entry.name} (automatic)">
                {lang_entry.name}
                <IconLocked size={10} aria-hidden="true" class="opacity-60" />
              </span>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Manual languages (removable) -->
      {#if languages.manual.length > 0}
        <div class="flex flex-col gap-1">
          <span class="text-xs text-text-muted uppercase tracking-wider">{ui('lore.learned', lang)}</span>
          <div class="flex flex-wrap gap-1">
            {#each languages.manual as lang_entry}
              <span class="badge-accent flex items-center gap-1" aria-label="{lang_entry.name} (removable)">
                {lang_entry.name}
                <button
                  class="text-accent-700 dark:text-accent-300 hover:text-red-500 transition-colors duration-100"
                  onclick={() => removeLanguage(lang_entry.instanceId)}
                  aria-label="Remove {lang_entry.name}"
                  title="Remove {lang_entry.name}"
                  type="button"
                >
                  <IconClose size={10} aria-hidden="true" />
                </button>
              </span>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Add language dropdown -->
      {#if remainingSlots > 0 && availableLanguages.length > 0}
        <select
          class="select mt-1"
          value=""
          onchange={handleLanguageSelect}
          aria-label={ui('lore.add_language', lang).replace('{n}', String(remainingSlots)).replace(/\{s\}/g, remainingSlots !== 1 ? 's' : '')}
        >
          <option value="">{addLangLabel(remainingSlots)}</option>
          {#each availableLanguages as lang_feat}
            <option value={lang_feat.id}>{engine.t(lang_feat.label)}</option>
          {/each}
        </select>
      {:else if remainingSlots === 0 && bonusLanguageSlots > 0}
        <p class="text-xs text-text-muted italic">
          {ui('lore.all_slots_filled', lang)}
        </p>
      {:else if bonusLanguageSlots > 0 && availableLanguages.length === 0}
        <p class="text-xs text-text-muted italic">
          {ui('lore.no_languages_available', lang)}
        </p>
      {/if}
    </section>

  </div><!-- /top two-column -->

  <!-- ================================================================= -->
  <!-- APPEARANCE — full width, grid of compact fields                    -->
  <!-- ================================================================= -->
  <section class="flex flex-col gap-2">
    <div class="section-header border-b border-border pb-2">
      <IconCharacter size={20} aria-hidden="true" />
      <span>{ui('lore.appearance', lang)}</span>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
      {#each ([
        { id: 'char-height', labelKey: 'lore.height', bind: 'height', placeholderKey: 'lore.height_placeholder' },
        { id: 'char-weight', labelKey: 'lore.weight', bind: 'weight', placeholderKey: 'lore.weight_placeholder' },
        { id: 'char-age',    labelKey: 'lore.age',    bind: 'age',    placeholderKey: 'lore.age_placeholder'    },
        { id: 'char-eyes',   labelKey: 'lore.eyes',   bind: 'eyes',   placeholderKey: 'lore.eyes_placeholder'   },
        { id: 'char-hair',   labelKey: 'lore.hair',   bind: 'hair',   placeholderKey: 'lore.hair_placeholder'   },
        { id: 'char-skin',   labelKey: 'lore.skin',   bind: 'skin',   placeholderKey: 'lore.skin_placeholder'   },
      ] as const) as field}
        <div class="flex flex-col gap-0.5">
          <label for={field.id} class="text-xs text-text-muted uppercase tracking-wider">
            {ui(field.labelKey, lang)}
          </label>
          {#if field.bind === 'height'}
            <input id={field.id} type="text" bind:value={height} placeholder={ui(field.placeholderKey, lang)} class="input px-2 py-1.5 text-xs" maxlength="20" />
          {:else if field.bind === 'weight'}
            <input id={field.id} type="text" bind:value={weight} placeholder={ui(field.placeholderKey, lang)} class="input px-2 py-1.5 text-xs" maxlength="20" />
          {:else if field.bind === 'age'}
            <input id={field.id} type="text" bind:value={age}    placeholder={ui(field.placeholderKey, lang)} class="input px-2 py-1.5 text-xs" maxlength="10" />
          {:else if field.bind === 'eyes'}
            <input id={field.id} type="text" bind:value={eyes}   placeholder={ui(field.placeholderKey, lang)} class="input px-2 py-1.5 text-xs" maxlength="30" />
          {:else if field.bind === 'hair'}
            <input id={field.id} type="text" bind:value={hair}   placeholder={ui(field.placeholderKey, lang)} class="input px-2 py-1.5 text-xs" maxlength="30" />
          {:else if field.bind === 'skin'}
            <input id={field.id} type="text" bind:value={skin}   placeholder={ui(field.placeholderKey, lang)} class="input px-2 py-1.5 text-xs" maxlength="30" />
          {/if}
        </div>
      {/each}
    </div>
  </section>

</div>
