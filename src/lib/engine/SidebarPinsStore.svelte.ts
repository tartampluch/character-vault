/**
 * @file src/lib/engine/SidebarPinsStore.svelte.ts
 * @description Manages pinned campaigns and characters in the sidebar.
 *
 * Design philosophy:
 *   Follows the same Svelte 5 $state class pattern as CampaignStore.
 *   Pins are persisted to localStorage keyed by userId so each user keeps
 *   their own pin state across browser sessions.
 *
 *   Pin state is purely a UI preference and does not affect game data.
 *   The store loads from localStorage when `initForUser()` is called, which
 *   should happen in the root layout as soon as the session userId is known.
 *
 * STORAGE KEY FORMAT:
 *   `cv_pins_{userId}` → JSON { campaigns: string[], characters: string[] }
 *
 * @see src/lib/components/layout/Sidebar.svelte for the sidebar consumer.
 * @see src/routes/campaigns/+page.svelte for campaign card pin buttons.
 * @see src/lib/components/vault/CharacterCard.svelte for character pin buttons.
 */

// =============================================================================
// SIDEBAR PINS STORE CLASS
// =============================================================================

class SidebarPinsStore {
  // ---------------------------------------------------------------------------
  // $state — reactive pin lists
  // ---------------------------------------------------------------------------

  /** IDs of campaigns pinned to the sidebar. Ordered by pin time (oldest first). */
  pinnedCampaignIds = $state<string[]>([]);

  /** IDs of characters pinned to the sidebar. Ordered by pin time (oldest first). */
  pinnedCharacterIds = $state<string[]>([]);

  // ---------------------------------------------------------------------------
  // INTERNAL — current user ID for storage key
  // ---------------------------------------------------------------------------

  /** The userId whose pins are currently loaded. Empty until initForUser() is called. */
  private _userId = '';

  // ---------------------------------------------------------------------------
  // INITIALIZATION
  // ---------------------------------------------------------------------------

  /**
   * Loads pin state from localStorage for the given user.
   * Must be called once the session userId is known (e.g., in +layout.svelte onMount).
   * Idempotent: calling again with the same userId is a no-op.
   *
   * @param userId - The current user's ID.
   */
  initForUser(userId: string): void {
    if (!userId || userId === this._userId) return;
    this._userId = userId;
    this._load();
  }

  // ---------------------------------------------------------------------------
  // CAMPAIGNS
  // ---------------------------------------------------------------------------

  /** Returns true when the given campaign is pinned. */
  isPinnedCampaign(id: string): boolean {
    return this.pinnedCampaignIds.includes(id);
  }

  /** Pins the campaign if not already pinned. */
  pinCampaign(id: string): void {
    if (!this.pinnedCampaignIds.includes(id)) {
      this.pinnedCampaignIds = [...this.pinnedCampaignIds, id];
      this._save();
    }
  }

  /** Unpins the campaign. No-op if not currently pinned. */
  unpinCampaign(id: string): void {
    this.pinnedCampaignIds = this.pinnedCampaignIds.filter(c => c !== id);
    this._save();
  }

  /** Toggles the pin state of the campaign. */
  toggleCampaign(id: string): void {
    if (this.isPinnedCampaign(id)) this.unpinCampaign(id);
    else this.pinCampaign(id);
  }

  // ---------------------------------------------------------------------------
  // CHARACTERS
  // ---------------------------------------------------------------------------

  /** Returns true when the given character is pinned. */
  isPinnedCharacter(id: string): boolean {
    return this.pinnedCharacterIds.includes(id);
  }

  /** Pins the character if not already pinned. */
  pinCharacter(id: string): void {
    if (!this.pinnedCharacterIds.includes(id)) {
      this.pinnedCharacterIds = [...this.pinnedCharacterIds, id];
      this._save();
    }
  }

  /** Unpins the character. No-op if not currently pinned. */
  unpinCharacter(id: string): void {
    this.pinnedCharacterIds = this.pinnedCharacterIds.filter(c => c !== id);
    this._save();
  }

  /** Toggles the pin state of the character. */
  toggleCharacter(id: string): void {
    if (this.isPinnedCharacter(id)) this.unpinCharacter(id);
    else this.pinCharacter(id);
  }

  // ---------------------------------------------------------------------------
  // PRIVATE — localStorage persistence
  // ---------------------------------------------------------------------------

  private _storageKey(): string {
    return `cv_pins_${this._userId}`;
  }

  private _load(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(this._storageKey());
      if (!raw) {
        this.pinnedCampaignIds  = [];
        this.pinnedCharacterIds = [];
        return;
      }
      const data = JSON.parse(raw) as { campaigns?: unknown; characters?: unknown };
      this.pinnedCampaignIds  = Array.isArray(data.campaigns)  ? data.campaigns  as string[] : [];
      this.pinnedCharacterIds = Array.isArray(data.characters) ? data.characters as string[] : [];
    } catch {
      this.pinnedCampaignIds  = [];
      this.pinnedCharacterIds = [];
    }
  }

  private _save(): void {
    if (typeof localStorage === 'undefined') return;
    if (!this._userId) return;
    try {
      localStorage.setItem(this._storageKey(), JSON.stringify({
        campaigns:  this.pinnedCampaignIds,
        characters: this.pinnedCharacterIds,
      }));
    } catch {
      // localStorage quota exceeded or unavailable — silently ignore.
    }
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

/**
 * The single shared SidebarPinsStore instance.
 *
 * Usage in Svelte components:
 * ```svelte
 * <script>
 *   import { sidebarPinsStore } from '$lib/engine/SidebarPinsStore.svelte';
 * </script>
 * ```
 */
export const sidebarPinsStore = new SidebarPinsStore();
export { SidebarPinsStore };
