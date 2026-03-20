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

// =============================================================================
// MOCK CAMPAIGN DATA
// =============================================================================

/**
 * Mock campaigns for development.
 * These simulate what would come from the PHP API in Phase 14.
 * Data is intentionally generic (no hardcoded D&D terms in the logic layer,
 * but campaign TITLES are user-authored strings, so they're fine here as mocks).
 */
const MOCK_CAMPAIGNS: Campaign[] = [
  {
    id: 'campaign_001',
    title: 'Reign of Winter',
    description: 'A campaign of intrigue, ancient evils, and frozen wilderness. The adventurers must stop a cold that threatens to consume the world.',
    posterUrl: undefined,
    bannerUrl: undefined,
    ownerId: 'user_gm_001',
    chapters: [
      {
        id: 'chapter_001_01',
        title: { en: 'Act I: The Snows of Summer', fr: 'Acte I : Les neiges de l\'été' },
        description: { en: 'Strange snow falls in summer. The village of Heldren is threatened.', fr: 'Une neige étrange tombe en été. Le village d\'Heldren est menacé.' },
        isCompleted: true,
      },
      {
        id: 'chapter_001_02',
        title: { en: 'Act II: The Shackled Hut', fr: 'Acte II : La hutte enchaînée' },
        description: { en: 'Track the source of the cold to Baba Yaga\'s dancing hut.', fr: 'Tracez la source du froid jusqu\'à la hutte dansante de Baba Yaga.' },
        isCompleted: false,
      },
    ],
    enabledRuleSources: ['srd_core', 'test_mock'],
    gmGlobalOverrides: '[]',
    updatedAt: Date.now(),
  },
  {
    id: 'campaign_002',
    title: 'The Darklands',
    description: 'A homebrew campaign set in a world of perpetual twilight, where the surface world is only legend and survival is paramount.',
    posterUrl: undefined,
    bannerUrl: undefined,
    ownerId: 'user_gm_001',
    chapters: [
      {
        id: 'chapter_002_01',
        title: { en: 'Chapter 1: Descent', fr: 'Chapitre 1 : La descente' },
        description: { en: 'The party ventures into the depths for the first time.', fr: 'Le groupe s\'aventure dans les profondeurs pour la première fois.' },
        isCompleted: false,
      },
    ],
    enabledRuleSources: ['srd_core', 'test_mock'],
    gmGlobalOverrides: '[]',
    updatedAt: Date.now(),
  },
];

// =============================================================================
// CAMPAIGN STORE CLASS
// =============================================================================

/**
 * Manages the campaign list state using Svelte 5 $state.
 *
 * PHASE 14 REPLACEMENT:
 *   The mock data and localStorage operations will be replaced by
 *   `fetch('/api/campaigns')`, `POST /api/campaigns`, etc.
 */
class CampaignStore {
  /**
   * The list of available campaigns.
   * Reactive: any component reading this $state re-renders when it changes.
   */
  campaigns = $state<Campaign[]>([...MOCK_CAMPAIGNS]);

  /**
   * Whether campaigns are being loaded (for UI loading states).
   */
  isLoading = $state<boolean>(false);

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

    chapter.isCompleted = !chapter.isCompleted;
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
