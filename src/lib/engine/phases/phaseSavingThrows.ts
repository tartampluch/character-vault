/**
 * @file phaseSavingThrows.ts
 * @description Saving throw display configuration (Phase 9.5).
 */

import type { SaveConfigEntry } from '../../types/engine';
import type { LocalizedString } from '../../types/i18n';
import { dataLoader } from '../DataLoader';

const DEFAULT_SAVE_CONFIG: readonly SaveConfigEntry[] = [
  { pipelineId: 'saves.fortitude', label: { en: 'saves.fortitude' }, keyAbilityId: 'stat_constitution', keyAbilityAbbr: { en: 'stat_constitution' }, accentColor: 'var(--color-save-fort)' },
  { pipelineId: 'saves.reflex',    label: { en: 'saves.reflex'    }, keyAbilityId: 'stat_dexterity',    keyAbilityAbbr: { en: 'stat_dexterity'    }, accentColor: 'var(--color-save-ref)'  },
  { pipelineId: 'saves.will',      label: { en: 'saves.will'      }, keyAbilityId: 'stat_wisdom',       keyAbilityAbbr: { en: 'stat_wisdom'       }, accentColor: 'var(--color-save-will)' },
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
      label:          (row['label']          as LocalizedString) ?? { en: '' },
      keyAbilityId:   (row['keyAbilityId']   as string)         ?? '',
      keyAbilityAbbr: (row['keyAbilityAbbr'] as LocalizedString) ?? { en: '' },
      accentColor:    (row['accentColor']    as string)         ?? 'var(--theme-text-muted)',
    })) satisfies SaveConfigEntry[];
  }
  return DEFAULT_SAVE_CONFIG;
}
