/**
 * @file SessionContext.svelte.ts
 * @description User session context — who is logged in and in what capacity.
 *
 * Design philosophy:
 *   This module mocks a user session for development (Phases 6–13). It uses
 *   Svelte 5 `$state` so that session changes are reactive — components re-render
 *   automatically when `isGameMaster` is toggled or `activeCampaignId` changes.
 *
 *   REPLACEMENT CONTRACT:
 *   In Phase 14.2, this file is replaced (or wrapped) by a PHP-backed auth session.
 *   The interface MUST remain stable. Any PHP integration should:
 *     1. Keep the same exported names (`sessionContext`, `SessionContext` type).
 *     2. Populate `currentUserId` from the PHP session user ID.
 *     3. Populate `isGameMaster` from the `users.is_game_master` DB column.
 *     4. Populate `activeCampaignId` from the URL route parameter (campaigns/[id]).
 *   Component code that reads `sessionContext.isGameMaster` will work unchanged.
 *
 *   WHY MOCK FIRST?
 *   Building the entire UI layer (Phases 6–15) against a live PHP backend would
 *   require both systems to be developed simultaneously, creating a blocking
 *   dependency. The mock allows full UI development in isolation, then a single
 *   swap in Phase 14 replaces just THIS file.
 *
 *   VISIBILITY RULES (enforced by this context):
 *   These rules, defined in ARCHITECTURE.md Phase 7:
 *     - GM sees ALL characters in the campaign (players, NPCs, monsters).
 *     - Players see ONLY their own characters (ownerId === currentUserId)
 *       plus any LinkedEntities belonging to their characters.
 *   The `visibleCharacters` $derived in the GameEngine/VaultStore reads
 *   `sessionContext.isGameMaster` to apply this filter.
 *
 * @see src/lib/engine/GameEngine.svelte.ts for the engine that reads this context.
 * @see ARCHITECTURE.md Phase 6.1 for the specification.
 * @see ARCHITECTURE.md Phase 14.2 for the PHP replacement.
 */

import { goto } from '$app/navigation';
import type { ID } from '../types/primitives';
import { setCsrfToken } from './StorageManager';

// =============================================================================
// SESSION CONTEXT TYPE
// =============================================================================

/**
 * The user session context shape.
 *
 * STABLE INTERFACE CONTRACT:
 *   This interface must not be changed without updating the PHP replacement layer.
 *   Any field added here must also be provided by the PHP `GET /api/auth/me` response.
 */
export interface SessionContextType {
  /**
   * The unique identifier of the currently logged-in user.
   * In mock mode: a static string (can be changed via `setCurrentUser()`).
   * In PHP mode: the value of `$_SESSION['user_id']`.
   *
   * Used for ownership checks: `character.ownerId === currentUserId`
   * determines whether a player can edit or see a specific character.
   */
  currentUserId: ID;

  /**
   * Display name of the current user (for UI labels, not for game logic).
   * Example: "Martin" or "DM_Patrick"
   */
  currentUserDisplayName: string;

  /**
   * Whether the current user is a Game Master in the active campaign.
   *
   * D&D 3.5 Table roles:
   *   GM (true):   Full access — sees all characters, NPCs, overrides.
   *                Can create/edit campaigns, NPCs, and per-character overrides.
   *   Player (false): Restricted access — sees only own characters.
   *                   Cannot see GM overrides or NPC stats.
   *
   * This field gates:
   *   - The "Create Campaign" button (Phase 6.3)
   *   - The "Add NPC/Monster" button (Phase 7.4)
   *   - Chapter completion toggles (Phase 6.4)
   *   - GM Dashboard and Settings routes (Phase 15)
   *   - Character visibility in the Vault (Phase 7.1)
   */
  isGameMaster: boolean;

  /**
   * The ID of the campaign currently being viewed/played.
   * `null` when on the Campaign Hub (not inside any campaign).
   *
   * Drives:
   *   - Character Vault filtering (show only characters of this campaign).
   *   - GM override loading (load overrides for this campaign).
   *   - Campaign settings loading.
   *
   * Updated by the SvelteKit route system when navigating to `/campaigns/[id]`.
   */
  activeCampaignId: ID | null;
}

// =============================================================================
// SESSION CONTEXT CLASS — Svelte 5 reactive singleton
// =============================================================================

/**
 * The reactive session context class.
 *
 * Uses Svelte 5 `$state` so that any component reading from this object
 * automatically re-renders when session data changes.
 *
 * MOCK USERS (for development):
 *   Two pre-defined user profiles allow testing both roles without a PHP backend:
 *     - "user_gm_001" + isGameMaster: true  → Simulates the DM's browser
 *     - "user_player_001" + isGameMaster: false → Simulates a player's browser
 *   Toggling between profiles tests all visibility and permission rules.
 */
class SessionContext {
  // ---------------------------------------------------------------------------
  // $state (Svelte 5 reactive state)
  // ---------------------------------------------------------------------------

  /**
   * The current user's unique identifier.
   * Default: the mock Game Master user.
   */
  currentUserId = $state<ID>('user_gm_001');

  /**
   * The current user's display name.
   */
  currentUserDisplayName = $state<string>('Game Master (Mock)');

  /**
   * Whether the current user is a GM.
   * Default: true (starts as GM for maximum test surface area).
   */
  isGameMaster = $state<boolean>(true);

  /**
   * The currently active campaign ID.
   * Default: null (no campaign selected yet — on the Campaign Hub).
   */
  activeCampaignId = $state<ID | null>(null);

  // ---------------------------------------------------------------------------
  // MOCK PROFILE SWITCHING — Development convenience
  // ---------------------------------------------------------------------------

  /**
   * Switches to the mock Game Master user profile.
   *
   * Used by the dev toolbar (visible only in development mode) and by
   * Vitest test setup to simulate a GM session.
   */
  switchToGM(): void {
    this.currentUserId = 'user_gm_001';
    this.currentUserDisplayName = 'Game Master (Mock)';
    this.isGameMaster = true;
  }

  /**
   * Switches to the mock Player user profile.
   *
   * Used by the dev toolbar to test the restricted "player view" of the UI.
   * Player sees only their own characters, no NPC stats, no override editor.
   */
  switchToPlayer(): void {
    this.currentUserId = 'user_player_001';
    this.currentUserDisplayName = 'TestPlayer (Mock)';
    this.isGameMaster = false;
  }

  /**
   * Sets the active campaign context when navigating into a campaign.
   *
   * Called by the SvelteKit `+layout.svelte` for routes under `/campaigns/[id]/`.
   * Must be called with `null` when navigating back to the Campaign Hub.
   *
   * @param campaignId - The campaign ID from the URL parameter, or null.
   */
  setActiveCampaign(campaignId: ID | null): void {
    this.activeCampaignId = campaignId;
  }

  /**
   * Updates the GM status of the current user.
   *
   * In mock mode: called by the dev toolbar toggle.
   * In PHP mode: this is NEVER called directly — `isGameMaster` is populated
   * from the server session and is read-only from the client's perspective.
   *
   * @param value - Whether the current user is a GM.
   */
  setGameMaster(value: boolean): void {
    this.isGameMaster = value;
  }

  // ---------------------------------------------------------------------------
  // PHP REPLACEMENT HOOK
  // ---------------------------------------------------------------------------

  /**
   * Loads session data from the PHP backend.
   *
   * PHASE 14.2 INTEGRATION POINT:
   *   Replace the body of this method with a `fetch('/api/auth/me')` call.
   *   The PHP endpoint returns:
   *   ```json
   *   {
   *     "userId": "...",
   *     "displayName": "...",
   *     "isGameMaster": true,
   *     "activeCampaignId": null
   *   }
   *   ```
   *
   *   Current mock implementation: no-op (data is pre-seeded in $state).
   *   When PHP is integrated:
   *     1. Call this method in the root `+layout.svelte` `onMount()`.
   *     2. If the API returns 401, redirect to a login page.
   *     3. Populate `currentUserId`, `isGameMaster`, `currentUserDisplayName`.
   *
   * @returns Promise resolving when session data is loaded (no-op in mock).
   */
  async loadFromServer(): Promise<void> {
    // PHASE 14.2: Fetch the real PHP session from the backend.
    // On 401 (no session), redirect to /login so the user can authenticate.
    // The /api/auth/me response also contains the CSRF token needed for
    // all state-changing requests (POST/PUT/DELETE).
    try {
      const response = await fetch('/api/auth/me', { credentials: 'include' });

      if (response.status === 401) {
        // No active session — send the user to the login page.
        // Preserve the current URL so we can redirect back after login.
        const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
        await goto(`/login?returnTo=${returnTo}`);
        return;
      }

      if (!response.ok) {
        console.error('[SessionContext] GET /api/auth/me returned HTTP', response.status);
        return;
      }

      const data = (await response.json()) as {
        id: string;
        display_name: string;
        is_game_master: boolean;
        csrfToken: string;
      };

      this.currentUserId          = data.id;
      this.currentUserDisplayName = data.display_name;
      this.isGameMaster           = data.is_game_master;

      // Store the CSRF token so all mutating API calls (POST/PUT/DELETE) can
      // include it as the X-CSRF-Token header via StorageManager.apiHeaders().
      if (data.csrfToken) {
        setCsrfToken(data.csrfToken);
      }
    } catch (err) {
      console.error('[SessionContext] Failed to reach /api/auth/me:', err);
    }
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

/**
 * The single shared session context instance used across the application.
 *
 * Import pattern in Svelte components:
 * ```svelte
 * <script>
 *   import { sessionContext } from '$lib/engine/SessionContext.svelte';
 *   // Read: sessionContext.isGameMaster
 *   // Mutate: sessionContext.switchToPlayer()
 * </script>
 * ```
 *
 * In tests, create a fresh instance: `const ctx = new SessionContext();`
 */
export const sessionContext = new SessionContext();

// Re-export the class for testing purposes
export { SessionContext };
