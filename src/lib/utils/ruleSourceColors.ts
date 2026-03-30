/**
 * @file src/lib/utils/ruleSourceColors.ts
 * @description Shared deterministic color palette for rule source groups.
 *
 * Both the campaign detail view and the campaign settings (RuleSourcesPanel)
 * use this utility so that the same `ruleSource` identifier always maps to
 * the same color, regardless of which page is being viewed.
 *
 * Color key: the `ruleSource` field embedded in each rule-source JSON file
 * (e.g. "srd_core"), NOT the directory name of the file path.
 */

export type GroupColorState = {
  /** Single-element states used by RuleSourcesPanel. */
  on: string; partial: string; off: string;
  /**
   * Split-pill fields for the campaign detail view.
   * `splitLabel` and `splitBadge` share the same hue but swap roles:
   *   - label: light/tinted bg  + dark text
   *   - badge: solid/dark bg    + light text  (bg ↔ text swapped)
   */
  splitBorder: string;
  splitLabel: string;
  splitBadge: string;
};

/**
 * 12-entry palette cycling through distinct hues.
 * Each entry has three visual states:
 *   - `on`      — fully enabled (vivid border + tinted background)
 *   - `partial` — partially enabled (lighter border, same tinted bg)
 *   - `off`     — disabled (very faint, transparent bg)
 */
export const RULE_SOURCE_PALETTE: readonly GroupColorState[] = [
  {
    on: 'border-sky-600/60 bg-sky-600/10 text-sky-700 dark:text-sky-400',
    partial: 'border-sky-600/35 bg-sky-600/10 text-sky-600 dark:text-sky-500',
    off: 'border-sky-600/15 bg-transparent text-sky-700/40 dark:text-sky-400/30',
    splitBorder: 'border-sky-600/60',
    splitLabel: 'bg-sky-600/20 text-sky-900 dark:text-sky-200',
    splitBadge: 'bg-sky-700 text-white',
  },
  {
    on: 'border-violet-600/60 bg-violet-600/10 text-violet-700 dark:text-violet-400',
    partial: 'border-violet-600/35 bg-violet-600/10 text-violet-600 dark:text-violet-500',
    off: 'border-violet-600/15 bg-transparent text-violet-700/40 dark:text-violet-400/30',
    splitBorder: 'border-violet-600/60',
    splitLabel: 'bg-violet-600/20 text-violet-900 dark:text-violet-200',
    splitBadge: 'bg-violet-700 text-white',
  },
  {
    on: 'border-amber-600/60 bg-amber-600/10 text-amber-700 dark:text-amber-400',
    partial: 'border-amber-600/35 bg-amber-600/10 text-amber-600 dark:text-amber-500',
    off: 'border-amber-600/15 bg-transparent text-amber-700/40 dark:text-amber-400/30',
    splitBorder: 'border-amber-600/60',
    splitLabel: 'bg-amber-600/20 text-amber-900 dark:text-amber-200',
    splitBadge: 'bg-amber-700 text-white',
  },
  {
    on: 'border-emerald-600/60 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400',
    partial: 'border-emerald-600/35 bg-emerald-600/10 text-emerald-600 dark:text-emerald-500',
    off: 'border-emerald-600/15 bg-transparent text-emerald-700/40 dark:text-emerald-400/30',
    splitBorder: 'border-emerald-600/60',
    splitLabel: 'bg-emerald-600/20 text-emerald-900 dark:text-emerald-200',
    splitBadge: 'bg-emerald-700 text-white',
  },
  {
    on: 'border-rose-600/60 bg-rose-600/10 text-rose-700 dark:text-rose-400',
    partial: 'border-rose-600/35 bg-rose-600/10 text-rose-600 dark:text-rose-500',
    off: 'border-rose-600/15 bg-transparent text-rose-700/40 dark:text-rose-400/30',
    splitBorder: 'border-rose-600/60',
    splitLabel: 'bg-rose-600/20 text-rose-900 dark:text-rose-200',
    splitBadge: 'bg-rose-700 text-white',
  },
  {
    on: 'border-cyan-600/60 bg-cyan-600/10 text-cyan-700 dark:text-cyan-400',
    partial: 'border-cyan-600/35 bg-cyan-600/10 text-cyan-600 dark:text-cyan-500',
    off: 'border-cyan-600/15 bg-transparent text-cyan-700/40 dark:text-cyan-400/30',
    splitBorder: 'border-cyan-600/60',
    splitLabel: 'bg-cyan-600/20 text-cyan-900 dark:text-cyan-200',
    splitBadge: 'bg-cyan-700 text-white',
  },
  {
    on: 'border-orange-600/60 bg-orange-600/10 text-orange-700 dark:text-orange-400',
    partial: 'border-orange-600/35 bg-orange-600/10 text-orange-600 dark:text-orange-500',
    off: 'border-orange-600/15 bg-transparent text-orange-700/40 dark:text-orange-400/30',
    splitBorder: 'border-orange-600/60',
    splitLabel: 'bg-orange-600/20 text-orange-900 dark:text-orange-200',
    splitBadge: 'bg-orange-700 text-white',
  },
  {
    on: 'border-teal-600/60 bg-teal-600/10 text-teal-700 dark:text-teal-400',
    partial: 'border-teal-600/35 bg-teal-600/10 text-teal-600 dark:text-teal-500',
    off: 'border-teal-600/15 bg-transparent text-teal-700/40 dark:text-teal-400/30',
    splitBorder: 'border-teal-600/60',
    splitLabel: 'bg-teal-600/20 text-teal-900 dark:text-teal-200',
    splitBadge: 'bg-teal-700 text-white',
  },
  {
    on: 'border-indigo-600/60 bg-indigo-600/10 text-indigo-700 dark:text-indigo-400',
    partial: 'border-indigo-600/35 bg-indigo-600/10 text-indigo-600 dark:text-indigo-500',
    off: 'border-indigo-600/15 bg-transparent text-indigo-700/40 dark:text-indigo-400/30',
    splitBorder: 'border-indigo-600/60',
    splitLabel: 'bg-indigo-600/20 text-indigo-900 dark:text-indigo-200',
    splitBadge: 'bg-indigo-700 text-white',
  },
  {
    on: 'border-pink-600/60 bg-pink-600/10 text-pink-700 dark:text-pink-400',
    partial: 'border-pink-600/35 bg-pink-600/10 text-pink-600 dark:text-pink-500',
    off: 'border-pink-600/15 bg-transparent text-pink-700/40 dark:text-pink-400/30',
    splitBorder: 'border-pink-600/60',
    splitLabel: 'bg-pink-600/20 text-pink-900 dark:text-pink-200',
    splitBadge: 'bg-pink-700 text-white',
  },
  {
    on: 'border-lime-600/60 bg-lime-600/10 text-lime-700 dark:text-lime-400',
    partial: 'border-lime-600/35 bg-lime-600/10 text-lime-600 dark:text-lime-500',
    off: 'border-lime-600/15 bg-transparent text-lime-700/40 dark:text-lime-400/30',
    splitBorder: 'border-lime-600/60',
    splitLabel: 'bg-lime-600/20 text-lime-900 dark:text-lime-200',
    splitBadge: 'bg-lime-700 text-white',
  },
  {
    on: 'border-fuchsia-600/60 bg-fuchsia-600/10 text-fuchsia-700 dark:text-fuchsia-400',
    partial: 'border-fuchsia-600/35 bg-fuchsia-600/10 text-fuchsia-600 dark:text-fuchsia-500',
    off: 'border-fuchsia-600/15 bg-transparent text-fuchsia-700/40 dark:text-fuchsia-400/30',
    splitBorder: 'border-fuchsia-600/60',
    splitLabel: 'bg-fuchsia-600/20 text-fuchsia-900 dark:text-fuchsia-200',
    splitBadge: 'bg-fuchsia-700 text-white',
  },
];

/**
 * Returns the palette entry for a given `ruleSource` group identifier.
 * Uses a djb2-style hash so the same string always yields the same entry.
 *
 * @param groupId - The `ruleSource` field value (e.g. "srd_core").
 */
export function ruleSourcePalette(groupId: string): GroupColorState {
  let h = 0;
  for (let i = 0; i < groupId.length; i++) {
    h = Math.imul(31, h) + groupId.charCodeAt(i) | 0;
  }
  return RULE_SOURCE_PALETTE[Math.abs(h) % RULE_SOURCE_PALETTE.length];
}
