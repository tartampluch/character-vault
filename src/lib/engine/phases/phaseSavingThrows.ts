/**
 * @file phaseSavingThrows.ts
 * @description Saving throw display configuration (Phase 9.5).
 */

import type { SaveConfigEntry } from '../../types/engine';
import type { LocalizedString } from '../../types/i18n';
import { dataLoader } from '../DataLoader';

const DEFAULT_SAVE_CONFIG: readonly SaveConfigEntry[] = [
  { pipelineId: 'saves.fortitude', label: { en: 'saves.fortitude', fr: 'saves.fortitude' }, keyAbilityId: 'stat_constitution', keyAbilityAbbr: { en: 'stat_constitution', fr: 'stat_constitution' }, accentColor: 'oklch(65% 0.19 28)' },
  { pipelineId: 'saves.reflex',    label: { en: 'saves.reflex',    fr: 'saves.reflex'    }, keyAbilityId: 'stat_dexterity',    keyAbilityAbbr: { en: 'stat_dexterity',    fr: 'stat_dexterity'    }, accentColor: 'oklch(74% 0.12 230)' },
  { pipelineId: 'saves.will',      label: { en: 'saves.will',      fr: 'saves.will'      }, keyAbilityId: 'stat_wisdom',       keyAbilityAbbr: { en: 'stat_wisdom',       fr: 'stat_wisdom'       }, accentColor: 'oklch(72% 0.12 280)' },
];

/**
 * Builds the saving throw display configuration from the config_save_definitions table.
 * Falls back to DEFAULT_SAVE_CONFIG during bootstrap.
 */
export function buildSavingThrowConfig(): readonly SaveConfigEntry[] {
  const table = dataLoader.getConfigTable('config_save_definitions');
  if (table?.data && Array.isArray(table.data) && table.data.length > 0) {
    return (table.data as Array<Record<string, unknown>>).map(row => ({
      pipelineId:     (row['pipelineId']     as string)         ?? '',
      label:          (row['label']          as LocalizedString) ?? { en: '', fr: '' },
      keyAbilityId:   (row['keyAbilityId']   as string)         ?? '',
      keyAbilityAbbr: (row['keyAbilityAbbr'] as LocalizedString) ?? { en: '', fr: '' },
      accentColor:    (row['accentColor']    as string)         ?? '#888',
    })) satisfies SaveConfigEntry[];
  }
  return DEFAULT_SAVE_CONFIG;
}
