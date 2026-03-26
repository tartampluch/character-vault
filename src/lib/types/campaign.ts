/**
 * @file campaign.ts
 * @description Campaign, Chapter, and SceneState types — the overarching container
 *              that groups characters and tracks story progression.
 *
 * Design philosophy:
 *   A Campaign is the top-level organisational unit. It groups:
 *   - Characters (reference stored on `Character.campaignId`)
 *   - Story progression (Chapters/Acts)
 *   - Rule source configuration (which JSON sources are active)
 *   - GM global overrides (the "Layer 2" of the resolution chain)
 *
 *   The Campaign model is intentionally THIN. It doesn't store character data —
 *   characters reference the campaign via `campaignId`. This allows:
 *   - Transferring characters between campaigns without data duplication.
 *   - The GM to see all NPCs/monsters without them "belonging" to any player.
 *   - Independent sync: characters can be updated independently of the campaign.
 *
 * @see src/lib/types/settings.ts    for CampaignSettings (stored separately in the engine)
 * @see src/lib/types/character.ts   for the Character model (references campaignId)
 * @see src/routes/campaigns/         (Phase 6.3-6.4) for the Campaign UI components
 */

import type { ID } from './primitives';
import type { LocalizedString } from './i18n';
import type { CampaignSettings } from './settings';

// =============================================================================
// CHAPTER — Story progression unit (Acts, Chapters, Sessions)
// =============================================================================

/**
 * A single task (checklist item) within a chapter.
 *
 * Tasks are sub-units of a chapter: checking every task automatically
 * completes the chapter. A chapter with no tasks counts as one indivisible
 * unit in the overall progress bar.
 */
export interface ChapterTask {
  /** Unique identifier within the chapter. */
  id: ID;
  /** Display title of the task (localised). */
  title: LocalizedString;
  /** Whether the task has been completed. */
  isCompleted: boolean;
}

/**
 * A single chapter or act in the campaign's narrative progression.
 *
 * Chapters provide a lightweight storytelling structure that the GM can use to
 * track which parts of the story have been completed. They have no mechanical
 * impact on the engine — they are purely a Campaign Management UI feature.
 *
 * The GM (and only the GM, via `SessionContext.isGameMaster`) can check/uncheck
 * the `isCompleted` flag from the Campaign Details page (Phase 6.4).
 *
 * LOCALISATION NOTE:
 *   Both `title` and `description` use `LocalizedString` because campaigns may
 *   be shared across language boundaries (a GM writing in English, players reading
 *   in French). The GM writes in their language; other players read in theirs.
 */
export interface Chapter {
  /**
   * Unique identifier for this chapter within the campaign.
   * Convention: "chapter_<number>_<slug>" (e.g., "chapter_01_arrival_in_waterdeep")
   */
  id: ID;

  /**
   * Localised chapter title.
   * Example: { en: "Chapter 1: The Dark Forest", fr: "Chapitre 1 : La forêt sombre" }
   */
  title: LocalizedString;

  /**
   * Localised chapter description or GM notes.
   * Can contain markdown for formatted display in the Campaign Details UI.
   */
  description: LocalizedString;

  /**
   * Whether the chapter has been completed by the adventuring party.
   *
   * When the chapter has tasks: derived automatically — true only when every
   * task is completed. The GM can also bulk-complete all tasks via the chapter
   * toggle button, which sets this flag and marks all tasks as done.
   *
   * When the chapter has no tasks: toggled manually by the GM.
   */
  isCompleted: boolean;

  /**
   * Optional task checklist for this chapter.
   *
   * Each task is a single-line item. The chapter's progress in the overall
   * stats equals the number of tasks (completed vs. total). A chapter with
   * no tasks counts as one indivisible unit.
   */
  tasks?: ChapterTask[];
}

// =============================================================================
// CAMPAIGN — Top-level container for a game session
// =============================================================================

/**
 * A D&D campaign — the top-level container grouping characters and story.
 *
 * RELATIONSHIP TO CampaignSettings:
 *   Note that `CampaignSettings` (in `settings.ts`) is a separate type that lives
 *   in the `GameEngine.$state`. The Campaign model itself stores only the campaign's
 *   identifying information and narrative structure.
 *
 *   However, `enabledRuleSources` appears in BOTH types:
 *   - In `Campaign`: persisted to the database (the authoritative server record).
 *   - In `CampaignSettings`: loaded into the engine at startup (the live working copy).
 *   When the GM changes rule sources via the Settings UI (Phase 15.1), both are updated.
 *
 * GM GLOBAL OVERRIDES:
 *   `gmGlobalOverrides` is a raw JSON string stored as text in the database.
 *   It contains a JSON array of Feature/config-table objects that override the
 *   loaded rule sources. It is parsed by the DataLoader during the resolution chain.
 *
 *   WHY STORE AS A STRING?
 *   - The backend treats it as opaque text (no D&D rule processing).
 *   - The GM edits it directly in a text area (Phase 15.2).
 *   - Only the frontend parses and validates it (via the JSON validator in the UI).
 *   - Storing as text avoids re-encoding issues between server and client.
 *
 * SYNC STRATEGY:
 *   `updatedAt` (Unix timestamp) is used by the polling mechanism (Phase 14.6).
 *   The client checks this timestamp every 5-10 seconds to detect server-side changes.
 *   @see ARCHITECTURE.md section 19 for the full sync protocol.
 */
export interface Campaign {
  /**
   * Unique campaign identifier (UUID string).
   * Generated at campaign creation. Never changes.
   */
  id: ID;

  /**
   * The campaign's display name.
   * Example: "Reign of Winter", "Curse of Strahd", "Homebrew: The Darklands"
   * NOT localised — campaigns are always named in one language by the GM.
   */
  title: string;

  /**
   * A short description of the campaign, shown on the Campaign Hub card.
   * Can be multi-line markdown text.
   */
  description: string;

  /**
   * URL to the campaign's poster/thumbnail image.
   * Displayed as the main image on the Campaign Hub card (Phase 6.3).
   * Falls back to a default placeholder if absent.
   * Cached by browser via HTTP headers — not re-fetched on every poll.
   */
  posterUrl?: string;

  /**
   * URL to the campaign's full-width banner image.
   * Displayed at the top of the Campaign Details page (Phase 6.4).
   * Falls back to the `posterUrl` or a default banner if absent.
   */
  bannerUrl?: string;

  /**
   * The user ID of the GM who created and manages this campaign.
   * Only this user (and server admins) can modify campaign settings,
   * chapters, GM global overrides, and per-character GM overrides.
   */
  ownerId: ID;

  /**
   * The narrative chapters/acts of the campaign.
   * Ordered array — displayed in order in the Campaign Details page.
   * The GM can reorder, add, and complete chapters from the UI.
   */
  chapters: Chapter[];

  /**
   * Ordered list of rule source FILE PATHS enabled for this campaign.
   * This is the AUTHORITATIVE server record. Loaded into `CampaignSettings`
   * and passed directly to `DataLoader.loadRuleSources()` at startup.
   *
   * Empty array (`[]`) = permissive mode: load ALL rule files (recommended default).
   * Non-empty = strict file-path whitelist managed by the Rule Source Manager (Phase 15.1).
   *
   * IMPORTANT: entries are FILE PATHS (e.g. "00_d20srd_core/01_races.json"),
   * NOT `Feature.ruleSource` IDs (e.g. "srd_core"). Passing source IDs would
   * silently filter out every file, loading zero content.
   *
   * @see CampaignSettings.enabledRuleSources in settings.ts for full documentation.
   */
  enabledRuleSources: string[];

  /**
   * The GM's global override layer — a JSON-encoded array of Feature/config objects.
   *
   * Stored as a RAW STRING in the database (no server-side parsing).
   * Parsed by the DataLoader (Phase 4.2) as Layer 2 of the resolution chain:
   *   Rule source files → GM Global Overrides (this field) → Character GM Overrides
   *
   * Content format: A JSON array containing:
   *   - Feature-like objects: `{ id, category, ruleSource, grantedModifiers, ... }`
   *   - Config table objects: `{ tableId, ruleSource, data: [...] }`
   *
   * The GM edits this via the GM Settings page (Phase 15.2), which includes
   * a JSON validator that prevents saving syntactically invalid JSON.
   *
   * Default: `"[]"` (empty array, no global overrides).
   *
   * @see ARCHITECTURE.md section 18.6 for the full GM text area format specification.
   */
  gmGlobalOverrides: string;

  /**
   * Per-campaign rule settings: dice rules, stat generation method, variant rules.
   *
   * Stored in `campaign_settings_json` on the server; merged into `engine.settings`
   * when the vault page loads. Partial — only keys present override engine defaults.
   *
   * All players receive this field so their engines apply the same rules.
   */
  campaignSettings?: Partial<Pick<CampaignSettings, 'diceRules' | 'statGeneration' | 'variantRules'>>;

  /**
   * Unix timestamp (seconds since epoch) of the last modification to this campaign.
   *
   * Updated by the server whenever:
   *   - Campaign title, description, or images change.
   *   - A chapter is added, removed, or updated.
   *   - `enabledRuleSources` changes.
   *   - `gmGlobalOverrides` changes.
   *
   * Used by the client-side polling mechanism (Phase 14.6) to detect whether
   * the campaign needs to be re-fetched from the server.
   *
   * @see ARCHITECTURE.md section 19 for the polling sync protocol.
   */
  updatedAt: number;
}

// =============================================================================
// TASK-AWARE PROGRESS HELPER
// =============================================================================

/**
 * Computes task-aware progress totals for a campaign.
 *
 * Rules:
 *   - Chapter with tasks  → contributes `tasks.length` to total,
 *                           `tasks.filter(t => t.isCompleted).length` to completed.
 *   - Chapter without tasks → counts as 1 unit, completed when `isCompleted === true`.
 *
 * @returns `{ total, completed }` — use to build a progress bar or "X / Y tasks" label.
 */
export function campaignTaskStats(chapters: Campaign['chapters']): { total: number; completed: number; pct: number } {
  let total = 0;
  let completed = 0;
  for (const ch of chapters) {
    const tasks = ch.tasks ?? [];
    if (tasks.length === 0) {
      total     += 1;
      completed += ch.isCompleted ? 1 : 0;
    } else {
      total     += tasks.length;
      completed += tasks.filter(t => t.isCompleted).length;
    }
  }
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { total, completed, pct };
}

// =============================================================================
// SCENE STATE — Active global environmental conditions
// =============================================================================

/**
 * The current scene/environment state managed by the GM.
 *
 * WHY A SEPARATE TYPE?
 *   Environmental conditions (Extreme Heat, Underwater, Darkness, etc.) affect ALL
 *   characters in the current scene simultaneously. Rather than manually adding
 *   `ActiveFeatureInstance` entries to every character individually (which would be
 *   tedious and error-prone), the GM activates a global Feature that is
 *   VIRTUALLY INJECTED into every character's feature list during the DAG Phase 0.
 *
 * HOW IT WORKS:
 *   1. GM activates `environment_extreme_heat` in the Scene State.
 *   2. The GameEngine sees this ID in `SceneState.activeGlobalFeatures`.
 *   3. During Phase 0 (feature flattening), the engine includes the modifiers
 *      from `environment_extreme_heat` in the same pass as character features.
 *   4. Characters with fire resistance or Endure Elements have conditional modifiers
 *      that block the heat feature's effects via `conditionNode` logic.
 *   5. When the GM deactivates the scene feature, all characters instantly recover
 *      (the Svelte `$derived` DAG re-evaluates automatically).
 *
 * @see ARCHITECTURE.md section 13 for full Environment/Scene specification.
 * @see ANNEXES.md section A.11 for Extreme Heat and Underwater examples.
 */
export interface SceneState {
  /**
   * IDs of globally active Features applied to ALL characters in the current scene.
   *
   * Examples:
   *   - "environment_extreme_heat"    → All characters take hourly nonlethal damage
   *   - "environment_underwater"      → Creature's land speed blocked; aquatic bonuses apply
   *   - "environment_magical_darkness"→ All characters suffer concealment penalties
   *   - "scene_silence_zone"          → No verbal spell components can be cast
   *
   * Each ID references a Feature in the loaded rule sources (typically with
   * `category: "environment"` for scene conditions).
   *
   * The GameEngine's Phase 0 flattening includes features from this list
   * alongside `Character.activeFeatures`, treating them as if they were on
   * every character simultaneously.
   */
  activeGlobalFeatures: ID[];
}
