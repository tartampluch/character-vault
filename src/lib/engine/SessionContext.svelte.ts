/**
 * @file SessionContext.svelte.ts
 * @description User session context — who is logged in and in what capacity.
 *
 * Design philosophy:
 *   This module uses Svelte 5 `$state` / `$derived` runes so that session
 *   changes are reactive — components re-render automatically when `role`,
 *   `activeCampaignId`, or `needsPasswordSetup` change.
 *
 *   ROLE MODEL (Phase 22):
 *     'admin'  — user management + full GM capabilities.
 *     'gm'     — Game Master (campaigns, characters, overrides).
 *     'player' — restricted to own characters.
 *
 *   `isGameMaster` and `isAdmin` are `$derived` from `role` so there is a
 *   single source of truth. Code that read `isGameMaster` before Phase 22
 *   continues to work without changes.
 *
 *   REPLACEMENT CONTRACT:
 *   The interface `SessionContextType` must remain stable. Any field added here
 *   must also be provided by the PHP `GET /api/auth/me` response.
 *   Component code that reads `sessionContext.isGameMaster` works unchanged.
 *
 * @see src/lib/api/userApi.ts              for the user management API client.
 * @see src/lib/types/user.ts               for the UserRole type.
 * @see src/lib/engine/StorageManager.ts    for setCsrfToken / apiHeaders.
 * @see ARCHITECTURE.md Phase 6.1 and Phase 22 for the full specification.
 */

import { goto } from '$app/navigation';
import type { ID } from '../types/primitives';
import type { UserRole } from '../types/user';
import { setCsrfToken } from './StorageManager';

// =============================================================================
// SESSION CONTEXT TYPE
// =============================================================================

/**
 * The user session context shape.
 *
 * STABLE INTERFACE CONTRACT:
 *   All fields here must remain backward-compatible. Fields added in Phase 22
 *   (`role`, `isAdmin`, `needsPasswordSetup`) are additive and do not break
 *   any existing component code.
 */
export interface SessionContextType {
  /**
   * The unique identifier of the currently logged-in user.
   * In PHP mode: the value of `$_SESSION['user_id']`.
   */
  currentUserId: ID;

  /** Display name of the current user (for UI labels, not for game logic). */
  currentUserDisplayName: string;

  /**
   * The user's role — the single source of truth for permissions.
   * `isGameMaster` and `isAdmin` are derived from this field.
   */
  role: UserRole;

  /**
   * Whether the current user has Game Master privileges.
   * True when `role === 'gm' || role === 'admin'`.
   *
   * DERIVED — do not set directly. Use `setGameMaster()` (legacy) or
   * update `role` via the user management endpoints.
   *
   * Gates: Create Campaign, Add NPC, GM Dashboard, character visibility.
   */
  isGameMaster: boolean;

  /**
   * Whether the current user has administrator privileges.
   * True only when `role === 'admin'`.
   *
   * DERIVED — gates the user management admin panel (`/admin/users`).
   */
  isAdmin: boolean;

  /**
   * The ID of the campaign currently being viewed/played.
   * `null` when on the Campaign Hub (not inside any campaign).
   */
  activeCampaignId: ID | null;

  /**
   * Whether the current session requires the user to set a password before
   * proceeding. True after a no-password first login (new account or admin
   * bootstrap). Clears when `PUT /api/auth/setup-password` succeeds.
   *
   * The layout guard redirects to `/setup-password` while this is true.
   */
  needsPasswordSetup: boolean;
}

// =============================================================================
// SESSION CONTEXT CLASS — Svelte 5 reactive singleton
// =============================================================================

/**
 * The reactive session context class.
 *
 * Uses Svelte 5 `$state` / `$derived` runes so that any component reading
 * from this object automatically re-renders when session data changes.
 *
 */
class SessionContext {
  // ---------------------------------------------------------------------------
  // $state (Svelte 5 reactive primitives — writable)
  // ---------------------------------------------------------------------------

  /** The current user's unique identifier. Populated by loadFromServer(). */
  currentUserId = $state<ID>('');

  /** The current user's display name. Populated by loadFromServer(). */
  currentUserDisplayName = $state<string>('');

  /**
   * The user's role — the single source of truth for all permission checks.
   * Default: 'gm' so the mock starts with maximum test surface area (same
   * behaviour as the previous `isGameMaster = true` default).
   */
  role = $state<UserRole>('gm');

  /** The currently active campaign ID. Default: null (Campaign Hub). */
  activeCampaignId = $state<ID | null>(null);

  /**
   * Whether the session requires a password to be set before normal app use.
   * Set to `true` after a successful no-password login; cleared on setup.
   */
  needsPasswordSetup = $state<boolean>(false);

  // ---------------------------------------------------------------------------
  // $derived (Svelte 5 reactive computed values — read-only)
  // ---------------------------------------------------------------------------

  /**
   * Whether the current user has Game Master privileges.
   * Derived from `role`; true for both 'gm' and 'admin'.
   *
   * BACKWARD COMPATIBILITY:
   *   All existing components and tests that read `sessionContext.isGameMaster`
   *   continue to work without modification.
   */
  isGameMaster = $derived(this.role === 'gm' || this.role === 'admin');

  /**
   * Whether the current user has administrator privileges.
   * Derived from `role`; true only for 'admin'.
   */
  isAdmin = $derived(this.role === 'admin');

  /**
   * Sets the active campaign context when navigating into a campaign.
   *
   * Called by the SvelteKit `+layout.svelte` for routes under `/campaigns/[id]/`.
   * Must be called with `null` when navigating back to the Campaign Hub.
   *
   * @param campaignId - The campaign ID from the URL parameter, or `null`.
   */
  setActiveCampaign(campaignId: ID | null): void {
    this.activeCampaignId = campaignId;
  }

  /**
   * Convenience toggle for dev-mode and legacy code.
   *
   * Maps to role changes:
   *   `setGameMaster(true)`  → role = 'gm'
   *   `setGameMaster(false)` → role = 'player'
   *
   * Does NOT change `currentUserId` or `currentUserDisplayName`.
   *
   * LEGACY COMPATIBILITY: this method existed before roles were introduced
   * (Phase 22). All code that calls `ctx.setGameMaster(value)` continues
   * to work because `isGameMaster` is now derived from `role`.
   *
   * @param value - If `true`, sets role to 'gm'; if `false`, sets 'player'.
   */
  setGameMaster(value: boolean): void {
    this.role = value ? 'gm' : 'player';
  }

  /**
   * Clears the first-login password-setup requirement flag.
   *
   * Called by the setup-password page after `PUT /api/auth/setup-password`
   * succeeds so that the layout guard stops redirecting to /setup-password.
   *
   * We expose this as an explicit method (rather than direct field assignment)
   * because Svelte 5's TypeScript plugin makes `$state` fields on class
   * instances appear as read-only from external `.svelte` files.
   */
  clearPasswordSetup(): void {
    this.needsPasswordSetup = false;
  }

  /**
   * Activates the first-login password-setup requirement flag.
   *
   * Called when login returns `needs_password_setup: true` from the server.
   * (loadFromServer() already handles the normal case; this method is provided
   * for completeness and test use.)
   */
  requirePasswordSetup(): void {
    this.needsPasswordSetup = true;
  }

  // ---------------------------------------------------------------------------
  // PHP BACKEND INTEGRATION
  // ---------------------------------------------------------------------------

  /**
   * Loads session data from the PHP backend (`GET /api/auth/me`).
   *
   * Called in the root `+layout.svelte` `onMount()`.
   * On 401 (no session), redirects to `/login`.
   * On success, populates `currentUserId`, `role`, `needsPasswordSetup`, and
   * stores the CSRF token for all subsequent state-changing requests.
   *
   * BACKWARD COMPATIBILITY for older API responses / test mocks that include
   * only `is_game_master` (boolean) without an explicit `role` field:
   *   role is derived as `is_game_master ? 'gm' : 'player'`.
   *
   * @returns Promise resolving when session data is loaded.
   */
  async loadFromServer(): Promise<void> {
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
        role?: UserRole;
        is_game_master: boolean;
        csrfToken?: string;
        needs_password_setup?: boolean;
      };

      this.currentUserId          = data.id;
      this.currentUserDisplayName = data.display_name;

      // Prefer the explicit `role` field (Phase 22+).
      // Fall back to deriving from `is_game_master` for legacy mocks / older API.
      this.role = data.role ?? (data.is_game_master ? 'gm' : 'player');

      // Phase 22 — password setup required for no-password first logins.
      this.needsPasswordSetup = data.needs_password_setup ?? false;

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
 *   // Read:   sessionContext.isGameMaster  (derived from role)
 *   //         sessionContext.isAdmin        (derived from role)
 *   //         sessionContext.role
 *   //         sessionContext.needsPasswordSetup
 * </script>
 * ```
 *
 * In tests, create a fresh instance: `const ctx = new SessionContext();`
 */
export const sessionContext = new SessionContext();

// Re-export the class for testing purposes
export { SessionContext };
