/**
 * @file CampaignStore.svelte.ts
 * @description Campaign list management store using Svelte 5 runes.
 *
 * Design philosophy:
 *   This store manages the in-memory list of campaigns and provides CRUD
 *   operations. In Phase 6 it uses mock data and localStorage for persistence.
 *   In Phase 14, this will be replaced by API calls to the PHP backend.
 *
 *   DUMB DATA LAYER:
 *   Like the GameEngine, this store contains ZERO D&D rule logic.
 *   It only stores and retrieves Campaign objects.
 *
 *   MOCK DATA:
 *   Pre-loaded with two example campaigns so the UI is not empty during
 *   development. The GM can create more via the "Create Campaign" button.
 *
 * @see src/lib/types/campaign.ts  for Campaign, Chapter types.
 * @see src/routes/campaigns/+page.svelte for the Campaign Hub UI.
 * @see ARCHITECTURE.md Phase 6.3 for the specification.
 */

import type { Campaign } from '../types/campaign';
import type { ID } from '../types/primitives';
import { apiHeaders } from './StorageManager';

// =============================================================================
// CAMPAIGN STORE CLASS
// =============================================================================

/**
 * Manages the campaign list state using Svelte 5 $state.
 *
 * The store starts empty — no mock data. Any component that depends on
 * campaign data must ensure loadFromApi() has been called first (either by
 * a parent layout or by the component itself via loadIfNeeded()).
 */
class CampaignStore {
  /**
   * The list of campaigns loaded from the PHP API.
   * Empty until the first successful loadFromApi() call.
   */
  campaigns = $state<Campaign[]>([]);

  /**
   * Whether a loadFromApi() call is currently in flight.
   */
  isLoading = $state<boolean>(false);

  /**
   * True after the first successful API load in this browser session.
   * Used by sub-route layouts to skip a redundant fetch when the hub page
   * (or a sibling layout) has already loaded the list.
   */
  hasLoaded = $state<boolean>(false);

  // ---------------------------------------------------------------------------
  // API — Phase 14.5
  // ---------------------------------------------------------------------------

  /**
   * Loads all campaigns from the PHP API and replaces the in-memory list.
   * Sets hasLoaded = true on success.
   *
   * Safe to call from multiple places — if already loading, the second call
   * will still fire but will simply overwrite with the same data.
   */
  async loadFromApi(): Promise<void> {
    this.isLoading = true;
    try {
      const response = await fetch('/api/campaigns', {
        headers: apiHeaders(),
        credentials: 'include',
      });
      if (!response.ok) {
        console.warn('[CampaignStore] GET /api/campaigns returned HTTP', response.status);
        return;
      }
      const data = (await response.json()) as Campaign[];
      if (Array.isArray(data)) {
        this.campaigns = data;
        this.hasLoaded = true;
      }
    } catch (err) {
      console.warn('[CampaignStore] GET /api/campaigns unavailable:', err);
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Calls loadFromApi() only when no successful load has occurred yet.
   * Use this in layouts / pages that may render before the hub page has
   * had a chance to populate the store (e.g. direct URL navigation or refresh).
   */
  async loadIfNeeded(): Promise<void> {
    if (!this.hasLoaded && !this.isLoading) {
      await this.loadFromApi();
    }
  }

  /**
   * Creates a campaign via the PHP API, adds it to the local list, and returns it.
   * Falls back to local-only creation if the API is unavailable.
   */
  async createInApi(title: string, ownerId: ID): Promise<Campaign> {
    // Optimistic local entry (used as fallback and as the return value)
    const local = this.createCampaign(title, ownerId);

    try {
      const response = await fetch('/api/campaigns', {
        method: 'POST',
        headers: apiHeaders(),
        credentials: 'include',
        body: JSON.stringify({ title }),
      });
      if (!response.ok) {
        console.warn('[CampaignStore] POST /api/campaigns returned HTTP', response.status);
        return local;
      }
      // Replace the optimistic entry with the server-assigned ID
      const created = (await response.json()) as { id: string; title: string; ownerId: string };
      const index = this.campaigns.findIndex(c => c.id === local.id);
      if (index !== -1) {
        this.campaigns[index] = { ...local, id: created.id };
      }
      return { ...local, id: created.id };
    } catch (err) {
      console.warn('[CampaignStore] POST /api/campaigns unavailable, campaign created locally only (will not persist):', err);
      return local;
    }
  }

  // ---------------------------------------------------------------------------
  // READ
  // ---------------------------------------------------------------------------

  /**
   * Returns a single campaign by ID, or `undefined` if not found.
   */
  getCampaign(id: ID): Campaign | undefined {
    return this.campaigns.find(c => c.id === id);
  }

  // ---------------------------------------------------------------------------
  // CREATE
  // ---------------------------------------------------------------------------

  /**
   * Creates a new campaign and adds it to the list.
   *
   * @param title   - The campaign's display title (user input).
   * @param ownerId - The GM's user ID.
   * @returns The newly created Campaign object.
   */
  createCampaign(title: string, ownerId: ID): Campaign {
    const newCampaign: Campaign = {
      id: `campaign_${Date.now()}`,
      title,
      description: '',
      posterUrl: undefined,
      bannerUrl: undefined,
      ownerId,
      chapters: [],
      enabledRuleSources: ['srd_core'],
      gmGlobalOverrides: '[]',
      updatedAt: Date.now(),
    };

    this.campaigns.push(newCampaign);
    return newCampaign;
  }

  // ---------------------------------------------------------------------------
  // UPDATE
  // ---------------------------------------------------------------------------

  /**
   * Updates a campaign's properties.
   *
   * @param id      - The campaign ID to update.
   * @param updates - Partial campaign properties to merge.
   */
  updateCampaign(id: ID, updates: Partial<Campaign>): void {
    const index = this.campaigns.findIndex(c => c.id === id);
    if (index === -1) {
      console.warn(`[CampaignStore] updateCampaign: campaign "${id}" not found.`);
      return;
    }
    this.campaigns[index] = {
      ...this.campaigns[index],
      ...updates,
      updatedAt: Date.now(),
    };
  }

  /**
   * Toggles the `isCompleted` status of a chapter within a campaign.
   *
   * When the chapter has tasks, all tasks are bulk-toggled to the new state
   * so the chapter-level flag stays in sync with task completion.
   * When the chapter has no tasks, the flag is toggled directly.
   *
   * Only GMs can call this — enforced by the UI (not by the store).
   *
   * @param campaignId - The campaign ID.
   * @param chapterId  - The chapter ID to toggle.
   */
  toggleChapterCompleted(campaignId: ID, chapterId: ID): void {
    const campaign = this.campaigns.find(c => c.id === campaignId);
    if (!campaign) return;

    const chapter = campaign.chapters.find(ch => ch.id === chapterId);
    if (!chapter) return;

    const newState = !chapter.isCompleted;
    chapter.isCompleted = newState;
    // Sync all tasks to the new state so the task list reflects the bulk toggle.
    if (chapter.tasks && chapter.tasks.length > 0) {
      for (const task of chapter.tasks) task.isCompleted = newState;
    }
    campaign.updatedAt = Date.now();
  }

  /**
   * Toggles a single task within a chapter.
   *
   * After toggling, the chapter's `isCompleted` flag is automatically derived:
   * it becomes `true` only when every task is completed, and `false` otherwise.
   *
   * Only GMs can call this — enforced by the UI (not by the store).
   *
   * @param campaignId - The campaign ID.
   * @param chapterId  - The chapter that owns the task.
   * @param taskId     - The task to toggle.
   */
  toggleTaskCompleted(campaignId: ID, chapterId: ID, taskId: ID): void {
    const campaign = this.campaigns.find(c => c.id === campaignId);
    if (!campaign) return;

    const chapter = campaign.chapters.find(ch => ch.id === chapterId);
    if (!chapter || !chapter.tasks) return;

    const task = chapter.tasks.find(t => t.id === taskId);
    if (!task) return;

    task.isCompleted = !task.isCompleted;
    // Auto-derive chapter completion: done only when every task is done.
    chapter.isCompleted = chapter.tasks.every(t => t.isCompleted);
    campaign.updatedAt = Date.now();
  }

  // ---------------------------------------------------------------------------
  // DELETE
  // ---------------------------------------------------------------------------

  /**
   * Deletes a campaign from the list.
   *
   * @param id - The campaign ID to delete.
   */
  deleteCampaign(id: ID): void {
    const index = this.campaigns.findIndex(c => c.id === id);
    if (index !== -1) {
      this.campaigns.splice(index, 1);
    }
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

/**
 * The single shared CampaignStore instance.
 *
 * Import in Svelte components:
 * ```svelte
 * <script>
 *   import { campaignStore } from '$lib/engine/CampaignStore.svelte';
 * </script>
 * ```
 */
export const campaignStore = new CampaignStore();
export { CampaignStore };
