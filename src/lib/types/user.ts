/**
 * @file src/lib/types/user.ts
 * @description User account types for the Phase 22 user management interface.
 *
 * These types mirror the JSON shapes returned by the PHP user management API
 * and are used by `userApi.ts`, `SessionContext.svelte.ts`, and all admin UI
 * components.
 *
 * ROLE MODEL:
 *   'admin'  — Can manage all user accounts (UserController endpoints).
 *              Also has full GM capabilities (sees all characters, overrides).
 *   'gm'     — Game Master. Can manage campaigns and characters, but cannot
 *              access the user management admin panel.
 *   'player' — Regular player. Access restricted to their own characters.
 *
 * @see api/controllers/UserController.php  for the backend implementation.
 * @see src/lib/api/userApi.ts              for the typed API client.
 * @see ARCHITECTURE.md Phase 22 for the full specification.
 */

// =============================================================================
// ROLE
// =============================================================================

/**
 * The three possible user roles, in descending privilege order.
 *
 * 'admin' ⊃ 'gm' ⊃ 'player'
 *
 * Role derivation helpers:
 *   isGameMaster = role === 'gm' || role === 'admin'
 *   isAdmin      = role === 'admin'
 */
export type UserRole = 'admin' | 'gm' | 'player';

// =============================================================================
// CAMPAIGN MEMBERSHIP
// =============================================================================

/**
 * A campaign that a user is a member of, with the count of characters they
 * own in that campaign.
 *
 * Returned as part of the `campaigns` array on each `User` object in the
 * admin user-list response (`GET /api/users`).
 */
export interface CampaignMembership {
  /** Campaign identifier. */
  id: string;
  /** Campaign display title. */
  title: string;
  /**
   * Number of characters owned by this user in this campaign.
   * Includes all characters regardless of NPC status.
   * Zero when the user is a member but has not yet created any characters.
   */
  character_count: number;
}

// =============================================================================
// USER
// =============================================================================

/**
 * A full user record as returned by `GET /api/users` and `POST /api/users`.
 *
 * The `player_name` field maps to `display_name` in the database — the name
 * the player uses in-game, distinct from their login `username`.
 */
export interface User {
  /** Unique user identifier (UUID prefixed with 'user_'). */
  id: string;
  /** Login username — unique, used for authentication. */
  username: string;
  /** In-game player name (database column: display_name). */
  player_name: string;
  /** User role. Determines access level across the application. */
  role: UserRole;
  /**
   * Whether the account is currently suspended.
   * Suspended accounts cannot log in. Admins can reinstate them.
   */
  is_suspended: boolean;
  /** Unix timestamp of account creation. */
  created_at: number;
  /**
   * Unix timestamp of the user's last successful login.
   * `null` when the user has never logged in (no-password account not yet activated).
   */
  last_login_at: number | null;
  /**
   * Campaigns this user is a member of, with per-campaign character counts.
   * Empty array if the user has not been added to any campaign.
   */
  campaigns: CampaignMembership[];
}

// =============================================================================
// CAMPAIGN MEMBER (lighter shape for GET /api/campaigns/{id}/users)
// =============================================================================

/**
 * A campaign membership record as returned by `GET /api/campaigns/{id}/users`.
 * Lighter than the full `User` type — contains only the fields relevant to
 * campaign membership management.
 */
export interface CampaignMember {
  /** User identifier. */
  user_id: string;
  /** Login username. */
  username: string;
  /** In-game player name. */
  player_name: string;
  /** User role. */
  role: UserRole;
  /** Whether the account is currently suspended. */
  is_suspended: boolean;
  /** Unix timestamp when this user was added to the campaign. */
  joined_at: number;
}
