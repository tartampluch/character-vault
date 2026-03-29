<!--
  @file src/lib/components/content-editor/ArmorFieldsEditor.svelte
  @description Armor / Shield Data section (Section 3) for ItemDataEditor.
-->

<script lang="ts">
  import { getContext } from 'svelte';
  import { EDITOR_CONTEXT_KEY, type EditorContext } from './editorContext';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';
  import type { ItemFeature } from '$lib/types/feature';

  const ctx = getContext<EditorContext>(EDITOR_CONTEXT_KEY);
  const lang = $derived(engine.settings.language);
  const item = $derived(ctx.feature as unknown as ItemFeature);

  function toggleArmorData(on: boolean): void {
    (ctx.feature as ItemFeature).armorData = on
      ? { armorBonus: 0, maxDex: 99, armorCheckPenalty: 0, arcaneSpellFailure: 0 }
      : undefined;
  }

  const uid = Math.random().toString(36).slice(2, 7);
  const fid = (name: string) => `afe-${uid}-${name}`;
</script>

<!-- ======================================================================= -->
<!-- SECTION 3 — ARMOR DATA                                                    -->
<!-- ======================================================================= -->
<details class="group/arm rounded-lg border border-border overflow-hidden">
  <summary class="flex items-center justify-between px-4 py-2 bg-surface-alt cursor-pointer
                  select-none list-none hover:bg-accent/5 font-semibold text-sm text-text-primary">
    <label class="flex items-center gap-3 cursor-pointer select-none">
      <input type="checkbox" class="h-4 w-4 accent-accent"
             checked={!!item.armorData}
             onchange={(e) => toggleArmorData((e.currentTarget as HTMLInputElement).checked)}
             onclick={(e) => e.stopPropagation()}/>
      {ui('editor.armor.section_label', lang)}
    </label>
    <svg class="h-4 w-4 text-text-muted transition-transform group-open/arm:rotate-180"
         xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2" stroke-linecap="round"
         stroke-linejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  </summary>

  {#if item.armorData}
    {@const ad = item.armorData}
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 p-4">
      <div class="flex flex-col gap-1">
        <label for={fid('ab')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{ui('editor.armor.armor_bonus_label', lang)}</label>
        <input id={fid('ab')} type="number" class="input text-xs" min="0"
               value={ad.armorBonus}
               oninput={(e) => { ad.armorBonus = parseInt((e.currentTarget as HTMLInputElement).value) || 0; }}/>
      </div>
      <div class="flex flex-col gap-1">
        <label for={fid('md')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{ui('editor.armor.max_dex_label', lang)}</label>
        <input id={fid('md')} type="number" class="input text-xs" min="0"
               value={ad.maxDex === 99 ? '' : ad.maxDex}
               placeholder={ui('editor.armor.no_cap_hint', lang)}
               oninput={(e) => {
                 const v = (e.currentTarget as HTMLInputElement).value.trim();
                 ad.maxDex = v ? parseInt(v) : 99;
               }}/>
      </div>
      <div class="flex flex-col gap-1">
        <label for={fid('acp')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          {ui('editor.armor.acp_label', lang)}
        </label>
        <input id={fid('acp')} type="number" class="input text-xs" max="0"
               value={ad.armorCheckPenalty}
               title={ui('editor.armor.acp_sign_hint', lang)}
               oninput={(e) => { ad.armorCheckPenalty = parseInt((e.currentTarget as HTMLInputElement).value) || 0; }}/>
      </div>
      <div class="flex flex-col gap-1">
        <label for={fid('asf')} class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          {ui('editor.armor.asf_label', lang)}
        </label>
        <input id={fid('asf')} type="number" class="input text-xs" min="0" max="100"
               value={ad.arcaneSpellFailure}
               oninput={(e) => { ad.arcaneSpellFailure = parseInt((e.currentTarget as HTMLInputElement).value) || 0; }}/>
      </div>
    </div>
  {:else}
    <div class="px-4 py-3 text-xs text-text-muted italic">
      {ui('editor.armor.empty_hint', lang)}
    </div>
  {/if}
</details>
