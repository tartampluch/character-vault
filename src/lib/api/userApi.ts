/**
 * @file src/lib/api/userApi.ts
 * @description Typed fetch wrappers for the Phase 22 user management API.
 *
 * All functions use `credentials: 'include'` (PHP session cookie) and the
 * `apiHeaders()` helper (Content-Type + CSRF token) from StorageManager.
 *
 * ERROR HANDLING:
 *   Non-2xx responses are parsed as JSON and thrown as `ApiError` instances,
 *   carrying the HTTP status code and the server's error/message fields.
 *   Callers should catch `ApiError` to display user-friendly messages.
 *
 * ENDPOINTS COVERED:
 *   User management (admin-only):
 *     GET    /api/users
 *     POST   /api/users
 *     PUT    /api/users/{id}
 *     PUT    /api/users/{id}/role
 *     POST   /api/users/{id}/suspend
 *     POST   /api/users/{id}/reinstate
 *     DELETE /api/users/{id}
 *
 *   Campaign membership (GM + Admin):
 *     GET    /api/campaigns/{id}/users
 *     POST   /api/campaigns/{id}/users
 *     DELETE /api/campaigns/{id}/users/{userId}
 *
 * @see api/controllers/UserController.php    for backend implementation.
 * @see api/controllers/CampaignController.php for campaign user endpoints.
 * @see src/lib/engine/StorageManager.ts      for apiHeaders() and setCsrfToken().
 */

import { apiHeaders } from '../engine/StorageManager';
import type { CampaignMember, User, UserRole } from '../types/user';

// =============================================================================
// ERROR CLASS
// =============================================================================

/**
 * Thrown by all `userApi` functions when the server returns a non-2xx status.
 *
 * Usage:
 * ```typescript
 * try {
 *   await userApi.createUser('alice', 'Alice');
 * } catch (e) {
 *   if (e instanceof ApiError && e.status === 409) {
 *     // Handle duplicate username
 *   }
 * }
 * ```
 */
export class ApiError extends Error {
  /** HTTP status code (e.g. 400, 403, 404, 409). */
  readonly status: number;
  /** Server-supplied error code string (e.g. 'Conflict', 'NotFound'). */
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

// =============================================================================
// INTERNAL HELPER
// =============================================================================

/**
 * Performs a fetch and throws `ApiError` if the response is not ok (non-2xx).
 * On success, parses and returns the JSON body.
 *
 * @param url     - Relative API URL (e.g. '/api/users').
 * @param options - Fetch init options (method, body, etc.).
 */
async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  // Merge headers: apiHeaders() provides Content-Type + CSRF token; spread
  // options last so callers can override individual headers if needed.
  const mergedHeaders: Record<string, string> = {
    ...apiHeaders(),
    ...(options.headers as Record<string, string> | undefined),
  };

  const response = await fetch(url, {
    credentials: 'include',
    ...options,
    headers: mergedHeaders,
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(
      response.status,
      (body as { error?: string }).error ?? 'UnknownError',
      (body as { message?: string }).message ?? `HTTP ${response.status}`,
    );
  }

  return body as T;
}

// =============================================================================
// USER MANAGEMENT ENDPOINTS (admin-only)
// =============================================================================

/**
 * Returns all users with their campaign memberships and character counts.
 *
 * GET /api/users
 */
export async function listUsers(): Promise<User[]> {
  return apiFetch<User[]>('/api/users');
}

/**
 * Creates a new user account with no password set.
 * The new user can log in without a password within 7 days and will be
 * immediately redirected to set their password.
 *
 * POST /api/users
 *
 * @param username   - Unique login username.
 * @param playerName - In-game display name.
 * @throws ApiError 409 if the username is already taken.
 */
export async function createUser(username: string, playerName: string): Promise<User> {
  return apiFetch<User>('/api/users', {
    method: 'POST',
    body: JSON.stringify({ username, player_name: playerName }),
  });
}

/**
 * Updates a user's in-game player name (display_name).
 *
 * PUT /api/users/{id}
 *
 * @throws ApiError 400 if targeting own account.
 * @throws ApiError 404 if user not found.
 */
export async function updatePlayerName(userId: string, playerName: string): Promise<{ id: string; player_name: string; username: string }> {
  return apiFetch(`/api/users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify({ player_name: playerName }),
  });
}

/**
 * Updates a user's login username (admin only).
 *
 * PUT /api/users/{id}  — same endpoint as updatePlayerName; sends both fields.
 *
 * @throws ApiError 400 if targeting own account or empty value.
 * @throws ApiError 409 if username is already taken.
 * @throws ApiError 404 if user not found.
 */
export async function updateUsername(userId: string, username: string, playerName: string): Promise<{ id: string; player_name: string; username: string }> {
  return apiFetch(`/api/users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify({ username, player_name: playerName }),
  });
}

/**
 * Self-service: update the current user's own display name.
 *
 * PUT /api/auth/display-name
 *
 * @throws ApiError 400 if display_name is empty.
 * @throws ApiError 401 if not authenticated.
 */
export async function updateOwnDisplayName(displayName: string): Promise<{ id: string; display_name: string }> {
  return apiFetch('/api/auth/display-name', {
    method: 'PUT',
    body: JSON.stringify({ display_name: displayName }),
  });
}

/**
 * Promotes or demotes a user's role.
 *
 * PUT /api/users/{id}/role
 *
 * @throws ApiError 400 if targeting own account or invalid role value.
 * @throws ApiError 404 if user not found.
 */
export async function updateRole(userId: string, role: UserRole): Promise<{ id: string; role: UserRole; is_game_master: boolean }> {
  return apiFetch(`/api/users/${userId}/role`, {
    method: 'PUT',
    body: JSON.stringify({ role }),
  });
}

/**
 * Suspends a user account, preventing login.
 *
 * POST /api/users/{id}/suspend
 *
 * @throws ApiError 400 if targeting own account.
 * @throws ApiError 404 if user not found.
 */
export async function suspendUser(userId: string): Promise<{ id: string; is_suspended: true }> {
  return apiFetch(`/api/users/${userId}/suspend`, { method: 'POST' });
}

/**
 * Reinstates a suspended user account, allowing login again.
 *
 * POST /api/users/{id}/reinstate
 *
 * @throws ApiError 404 if user not found.
 */
export async function reinstateUser(userId: string): Promise<{ id: string; is_suspended: false }> {
  return apiFetch(`/api/users/${userId}/reinstate`, { method: 'POST' });
}

/**
 * Permanently deletes a user account and all their owned characters.
 * Campaign memberships are also removed (cascade).
 *
 * DELETE /api/users/{id}
 *
 * @throws ApiError 400 if targeting own account.
 * @throws ApiError 404 if user not found.
 */
export async function deleteUser(userId: string): Promise<{ id: string; deleted: true }> {
  return apiFetch(`/api/users/${userId}`, { method: 'DELETE' });
}

// =============================================================================
// CAMPAIGN MEMBERSHIP ENDPOINTS (GM + Admin)
// =============================================================================

/**
 * Lists all members of a campaign, including suspended users.
 *
 * GET /api/campaigns/{campaignId}/users
 */
export async function getCampaignUsers(campaignId: string): Promise<CampaignMember[]> {
  return apiFetch<CampaignMember[]>(`/api/campaigns/${campaignId}/users`);
}

/**
 * Adds a user to a campaign. Succeeds even for suspended users (they may
 * have active characters that need to remain in the campaign).
 *
 * POST /api/campaigns/{campaignId}/users
 *
 * @throws ApiError 404 if campaign or user not found.
 * @throws ApiError 409 if user is already a member.
 */
export async function addCampaignUser(
  campaignId: string,
  userId: string,
): Promise<{ campaign_id: string; user_id: string; joined_at: number }> {
  return apiFetch(`/api/campaigns/${campaignId}/users`, {
    method: 'POST',
    body: JSON.stringify({ user_id: userId }),
  });
}

/**
 * Removes a user from a campaign. Does NOT delete their characters.
 *
 * DELETE /api/campaigns/{campaignId}/users/{userId}
 *
 * @throws ApiError 404 if campaign or membership not found.
 */
export async function removeCampaignUser(
  campaignId: string,
  userId: string,
): Promise<{ campaign_id: string; user_id: string; removed: true }> {
  return apiFetch(`/api/campaigns/${campaignId}/users/${userId}`, { method: 'DELETE' });
}

// =============================================================================
// CAMPAIGN CHARACTER ENROLLMENT
// =============================================================================

/**
 * Lightweight character summary returned by the character enrollment endpoints.
 * Avoids sending the full character sheet — contains only the fields needed
 * for the Campaign Settings members panel and the Add-Characters picker modal.
 */
export interface CharacterSummary {
  /** Character UUID. */
  id: string;
  /** Character display name. */
  name: string;
  /** In-game player name stored inside the character JSON. May be null. */
  playerName: string | null;
  /** The campaign this character is currently enrolled in, or null. */
  campaignId: string | null;
  /** User ID of the player who owns this character. */
  ownerId: string;
  /** Whether this character is an NPC. */
  isNPC: boolean;
}

/**
 * Returns lightweight summaries for all characters enrolled in a campaign.
 *
 * GET /api/campaigns/{campaignId}/characters
 *
 * @throws ApiError 403 if not a GM or admin.
 * @throws ApiError 404 if campaign not found.
 */
export async function getCampaignCharacters(
  campaignId: string,
): Promise<CharacterSummary[]> {
  return apiFetch<CharacterSummary[]>(
    `/api/campaigns/${encodeURIComponent(campaignId)}/characters`,
  );
}

/**
 * Returns lightweight summaries for ALL characters visible to the GM.
 * Used by the Add-Characters picker to let the GM enroll characters from
 * other campaigns or from the global vault.
 *
 * GET /api/campaigns/{campaignId}/characters?all=1
 *
 * @throws ApiError 403 if not a GM or admin.
 * @throws ApiError 404 if campaign not found.
 */
export async function getAllCharactersForPicker(
  campaignId: string,
): Promise<CharacterSummary[]> {
  return apiFetch<CharacterSummary[]>(
    `/api/campaigns/${encodeURIComponent(campaignId)}/characters?all=1`,
  );
}

/**
 * Enrolls one or more characters in a campaign.
 *
 * POST /api/campaigns/{campaignId}/characters
 *
 * @param campaignId - Target campaign.
 * @param charIds    - Array of character IDs to enroll.
 * @throws ApiError 400 if charIds is empty.
 * @throws ApiError 403 if not a GM or admin.
 * @throws ApiError 404 if campaign not found.
 */
export async function addCampaignCharacters(
  campaignId: string,
  charIds: string[],
): Promise<{ enrolled: string[]; count: number }> {
  return apiFetch(`/api/campaigns/${encodeURIComponent(campaignId)}/characters`, {
    method: 'POST',
    body: JSON.stringify({ char_ids: charIds }),
  });
}

/**
 * Removes a character from a campaign (clears its campaign association).
 * Does NOT delete the character.
 *
 * DELETE /api/campaigns/{campaignId}/characters/{charId}
 *
 * @throws ApiError 403 if not a GM or admin.
 * @throws ApiError 404 if campaign not found or character not enrolled.
 */
export async function removeCampaignCharacter(
  campaignId: string,
  charId: string,
): Promise<{ id: string; removed: true }> {
  return apiFetch(
    `/api/campaigns/${encodeURIComponent(campaignId)}/characters/${encodeURIComponent(charId)}`,
    { method: 'DELETE' },
  );
}

// =============================================================================
// PASSWORD MANAGEMENT (admin reset + self-service change)
// =============================================================================

/**
 * Blanks a user's password, forcing them through the setup-password flow on
 * their next login. Admin-only; no self-edit restriction.
 *
 * POST /api/users/{userId}/reset-password
 *
 * @throws ApiError 403 if caller is not admin.
 * @throws ApiError 404 if user not found.
 */
export async function resetUserPassword(
  userId: string,
): Promise<{ id: string; password_reset: true }> {
  return apiFetch(`/api/users/${userId}/reset-password`, { method: 'POST' });
}

/**
 * Changes the authenticated user's own password.
 *
 * PUT /api/auth/change-password
 *
 * `currentPassword` is validated against the stored hash unless the account
 * has no password yet (password_hash = ''), in which case it is ignored.
 *
 * @throws ApiError 400 BadRequest   — new_password is empty.
 * @throws ApiError 400 WrongPassword — current_password does not match.
 * @throws ApiError 401 Unauthorized  — not authenticated.
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ id: string; username: string; display_name: string; role: UserRole; is_game_master: boolean }> {
  return apiFetch('/api/auth/change-password', {
    method: 'PUT',
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
}

// =============================================================================
// LOGOUT ENDPOINT
// =============================================================================

/**
 * Terminates the current PHP session.
 *
 * POST /api/auth/logout
 *
 * Destroys the server-side session and clears the session cookie.
 * After calling this, the browser should be redirected to /login.
 *
 * Does not throw on network errors — the caller should navigate to /login
 * regardless, to ensure the user is always signed out from the client side.
 */
export async function logout(): Promise<void> {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' });
  } catch {
    // Ignore errors — the caller navigates to /login unconditionally.
  }
}

// =============================================================================
// CAMPAIGN ROSTER (read-only, any campaign member)
// =============================================================================

/**
 * A single character entry in the party roster.
 *
 * Contains only the minimal information safe to share with all campaign members
 * (name and total level). Full character stats remain restricted to the owner
 * and the GM via the standard character visibility rules.
 */
export interface RosterCharacter {
  /** The character's display name. */
  name: string;
  /**
   * Total character level — sum of all classLevels values.
   * Zero when the character has no class levels assigned yet.
   */
  level: number;
}

/**
 * A single player's entry in the party roster.
 *
 * Groups all of that player's non-NPC characters for the campaign.
 * Players with no non-NPC characters are excluded from the roster array.
 */
export interface RosterEntry {
  /** The player's user ID. */
  userId: string;
  /** The player's in-game display name (users.display_name). */
  playerName: string;
  /**
   * All non-NPC characters this player owns in the campaign.
   * Ordered alphabetically by character name.
   * Empty array is theoretically impossible (players with no characters
   * are excluded by the server query), but typed defensively.
   */
  characters: RosterCharacter[];
}

/**
 * Fetches the party roster for a campaign.
 *
 * Accessible to any authenticated campaign member (and GMs).
 * Returns only character names and levels — no stats or private data.
 *
 * GET /api/campaigns/{campaignId}/roster
 *
 * @param campaignId - The campaign UUID.
 * @returns Roster entries ordered by player name.
 * @throws ApiError 403 if the caller is not a campaign member.
 * @throws ApiError 401 if not authenticated.
 */
export async function getCampaignRoster(campaignId: string): Promise<RosterEntry[]> {
  return apiFetch(`/api/campaigns/${encodeURIComponent(campaignId)}/roster`);
}

// =============================================================================
// PASSWORD SETUP ENDPOINT (authenticated user, first login only)
// =============================================================================

/**
 * Sets the password for a first-login account (no-password sentinel).
 * Only callable when the session has `needs_password_setup: true`.
 *
 * PUT /api/auth/setup-password
 *
 * @throws ApiError 400 if password is empty.
 * @throws ApiError 403 if session flag is not set (account already has a password).
 */
export async function setupPassword(
  password: string,
): Promise<{ id: string; username: string; display_name: string; role: UserRole; is_game_master: boolean }> {
  return apiFetch('/api/auth/setup-password', {
    method: 'PUT',
    body: JSON.stringify({ password }),
  });
}
