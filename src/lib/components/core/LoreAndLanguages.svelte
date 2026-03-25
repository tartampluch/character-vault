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

  // ── Language system ─────────────────────────────────────────────────────────
  const intModifier = $derived(
    Math.max(0, engine.phase2_attributes['stat_intelligence']?.derivedModifier ?? 0)
  );
  const speakLanguageRanks = $derived(
    engine.character.skills['skill_speak_language']?.ranks ?? 0
  );
  const bonusLanguageSlots = $derived(intModifier + speakLanguageRanks);

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

  const manualCount     = $derived(languages.manual.length);
  const remainingSlots  = $derived(Math.max(0, bonusLanguageSlots - manualCount));

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
        <span>Personal Story</span>
      </div>
      <textarea
        class="textarea"
        bind:value={personalStory}
        placeholder="The character's backstory, motivation, personality traits, ideals, bonds, and flaws..."
        rows="5"
        aria-label="Personal story and background"
      ></textarea>
    </section>

    <!-- ── LANGUAGES ──────────────────────────────────────────────── -->
    <section class="flex flex-col gap-2" aria-label="Languages known">

      <!-- Languages header with slot counter -->
      <div class="flex items-center justify-between border-b border-border pb-2">
        <div class="section-header">
          <IconLanguages size={20} aria-hidden="true" />
          <span>Languages</span>
        </div>
        <span
          class="text-xs {remainingSlots === 0 && bonusLanguageSlots > 0 ? 'text-green-500 dark:text-green-400' : 'text-text-muted'}"
          aria-label="{remainingSlots} language slots remaining"
        >
          {#if bonusLanguageSlots > 0}
            {manualCount}/{bonusLanguageSlots} bonus slots
          {:else}
            No bonus slots
          {/if}
        </span>
      </div>

      <!-- Automatic languages (locked, from race/class) -->
      {#if languages.automatic.length > 0}
        <div class="flex flex-col gap-1">
          <span class="text-xs text-text-muted uppercase tracking-wider">Automatic</span>
          <div class="flex flex-wrap gap-1">
            {#each languages.automatic as lang}
              <span class="badge-green flex items-center gap-1" aria-label="{lang.name} (automatic)">
                {lang.name}
                <IconLocked size={10} aria-hidden="true" class="opacity-60" />
              </span>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Manual languages (removable) -->
      {#if languages.manual.length > 0}
        <div class="flex flex-col gap-1">
          <span class="text-xs text-text-muted uppercase tracking-wider">Learned</span>
          <div class="flex flex-wrap gap-1">
            {#each languages.manual as lang}
              <span class="badge-accent flex items-center gap-1" aria-label="{lang.name} (removable)">
                {lang.name}
                <button
                  class="text-accent-700 dark:text-accent-300 hover:text-red-500 transition-colors duration-100"
                  onclick={() => removeLanguage(lang.instanceId)}
                  aria-label="Remove {lang.name}"
                  title="Remove {lang.name}"
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
          aria-label="Add a language"
        >
          <option value="">— Add language ({remainingSlots} slot{remainingSlots !== 1 ? 's' : ''} left) —</option>
          {#each availableLanguages as lang}
            <option value={lang.id}>{engine.t(lang.label)}</option>
          {/each}
        </select>
      {:else if remainingSlots === 0 && bonusLanguageSlots > 0}
        <p class="text-xs text-text-muted italic">
          All bonus language slots filled. Increase INT or add Speak Language ranks for more.
        </p>
      {:else if bonusLanguageSlots > 0 && availableLanguages.length === 0}
        <p class="text-xs text-text-muted italic">
          No additional languages available. Enable a rule source with language features.
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
      <span>Appearance</span>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
      {#each [
        { id: 'char-height', label: 'Height',     bind: 'height', placeholder: "5'8\"" },
        { id: 'char-weight', label: 'Weight',     bind: 'weight', placeholder: '160 lb.' },
        { id: 'char-age',    label: 'Age',        bind: 'age',    placeholder: '24' },
        { id: 'char-eyes',   label: 'Eyes',       bind: 'eyes',   placeholder: 'Brown' },
        { id: 'char-hair',   label: 'Hair',       bind: 'hair',   placeholder: 'Dark brown' },
        { id: 'char-skin',   label: 'Skin',       bind: 'skin',   placeholder: 'Olive' },
      ] as field}
        <div class="flex flex-col gap-0.5">
          <label for={field.id} class="text-xs text-text-muted uppercase tracking-wider">
            {field.label}
          </label>
          {#if field.bind === 'height'}
            <input id={field.id} type="text" bind:value={height} placeholder={field.placeholder} class="input px-2 py-1.5 text-xs" maxlength="20" />
          {:else if field.bind === 'weight'}
            <input id={field.id} type="text" bind:value={weight} placeholder={field.placeholder} class="input px-2 py-1.5 text-xs" maxlength="20" />
          {:else if field.bind === 'age'}
            <input id={field.id} type="text" bind:value={age}    placeholder={field.placeholder} class="input px-2 py-1.5 text-xs" maxlength="10" />
          {:else if field.bind === 'eyes'}
            <input id={field.id} type="text" bind:value={eyes}   placeholder={field.placeholder} class="input px-2 py-1.5 text-xs" maxlength="30" />
          {:else if field.bind === 'hair'}
            <input id={field.id} type="text" bind:value={hair}   placeholder={field.placeholder} class="input px-2 py-1.5 text-xs" maxlength="30" />
          {:else if field.bind === 'skin'}
            <input id={field.id} type="text" bind:value={skin}   placeholder={field.placeholder} class="input px-2 py-1.5 text-xs" maxlength="30" />
          {/if}
        </div>
      {/each}
    </div>
  </section>

</div>
