/**
 * @file src/tests/userManagement.test.ts
 * @description Unit tests for userApi.ts — all Phase 22 user management endpoints.
 *
 * STRATEGY:
 *   Every function in userApi.ts is tested by stubbing global `fetch` with
 *   vi.stubGlobal. We verify:
 *     a) The correct HTTP method and URL are used.
 *     b) The request body contains the expected JSON (for POST/PUT).
 *     c) Successful responses are parsed and returned as typed objects.
 *     d) Non-2xx responses throw an `ApiError` with the correct status and code.
 *
 * FUNCTIONS COVERED:
 *   User management (admin-only):
 *     listUsers, createUser, updatePlayerName, updateRole,
 *     suspendUser, reinstateUser, deleteUser
 *
 *   Campaign membership (GM + Admin):
 *     getCampaignUsers, addCampaignUser, removeCampaignUser
 *
 *   Password setup (first-login):
 *     setupPassword
 *
 * @see src/lib/api/userApi.ts
 * @see ARCHITECTURE.md Phase 22.5
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  listUsers,
  createUser,
  updatePlayerName,
  updateRole,
  suspendUser,
  reinstateUser,
  deleteUser,
  getCampaignUsers,
  addCampaignUser,
  removeCampaignUser,
  setupPassword,
  changePassword,
  resetUserPassword,
  ApiError,
} from '$lib/api/userApi';

// ---------------------------------------------------------------------------
// TEST FIXTURES
// ---------------------------------------------------------------------------

const MOCK_USER = {
  id:            'user_001',
  username:      'alice',
  player_name:   'Alice',
  role:          'player' as const,
  is_suspended:  false,
  created_at:    1700000000,
  last_login_at: null,
  campaigns:     [],
};

const MOCK_MEMBER = {
  user_id:      'user_001',
  username:     'alice',
  player_name:  'Alice',
  role:         'player' as const,
  is_suspended: false,
  joined_at:    1700000000,
};

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

/** Stubs fetch to return a successful JSON response. */
function mockFetchOk(body: unknown, status = 200) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok:     true,
    status,
    json: () => Promise.resolve(body),
  }));
}

/** Stubs fetch to return a non-2xx JSON error response. */
function mockFetchError(status: number, error: string, message = 'Error message') {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok:     false,
    status,
    json: () => Promise.resolve({ error, message }),
  }));
}

/** Returns the URL used in the most recent fetch call. */
function lastFetchUrl(): string {
  const fetchMock = vi.mocked(globalThis.fetch);
  return fetchMock.mock.calls[0][0] as string;
}

/** Returns the RequestInit options used in the most recent fetch call. */
function lastFetchOptions(): RequestInit {
  const fetchMock = vi.mocked(globalThis.fetch);
  return fetchMock.mock.calls[0][1] as RequestInit;
}

/** Parses the body of the most recent fetch call. */
function lastFetchBody(): unknown {
  const opts = lastFetchOptions();
  return opts.body ? JSON.parse(opts.body as string) : null;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// =============================================================================
// 1. listUsers()
// =============================================================================

describe('userApi — listUsers()', () => {
  it('makes GET /api/users', async () => {
    mockFetchOk([MOCK_USER]);
    await listUsers();
    expect(lastFetchUrl()).toBe('/api/users');
    expect(lastFetchOptions().method).toBeUndefined(); // default = GET
  });

  it('returns array of users on success', async () => {
    mockFetchOk([MOCK_USER]);
    const result = await listUsers();
    expect(result).toHaveLength(1);
    expect(result[0].username).toBe('alice');
  });

  it('throws ApiError on 403', async () => {
    mockFetchError(403, 'Forbidden', 'Admin required');
    await expect(listUsers()).rejects.toBeInstanceOf(ApiError);
    await expect(listUsers()).rejects.toMatchObject({ status: 403, code: 'Forbidden' });
  });
});

// =============================================================================
// 2. createUser()
// =============================================================================

describe('userApi — createUser()', () => {
  it('makes POST /api/users with username and player_name', async () => {
    mockFetchOk(MOCK_USER, 201);
    await createUser('alice', 'Alice');
    expect(lastFetchUrl()).toBe('/api/users');
    expect(lastFetchOptions().method).toBe('POST');
    expect(lastFetchBody()).toEqual({ username: 'alice', player_name: 'Alice' });
  });

  it('returns created user on 201', async () => {
    mockFetchOk(MOCK_USER, 201);
    const result = await createUser('alice', 'Alice');
    expect(result.username).toBe('alice');
    expect(result.role).toBe('player');
  });

  it('throws ApiError with status 409 on duplicate username', async () => {
    mockFetchError(409, 'Conflict', "Username 'alice' is already taken.");
    const err = await createUser('alice', 'Alice').catch(e => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409);
    expect(err.code).toBe('Conflict');
  });
});

// =============================================================================
// 3. updatePlayerName()
// =============================================================================

describe('userApi — updatePlayerName()', () => {
  it('makes PUT /api/users/{id} with player_name', async () => {
    mockFetchOk({ id: 'user_001', player_name: 'Alice Updated' });
    await updatePlayerName('user_001', 'Alice Updated');
    expect(lastFetchUrl()).toBe('/api/users/user_001');
    expect(lastFetchOptions().method).toBe('PUT');
    expect(lastFetchBody()).toEqual({ player_name: 'Alice Updated' });
  });

  it('throws ApiError 400 on self-edit attempt', async () => {
    mockFetchError(400, 'BadRequest', 'Cannot edit own account');
    await expect(updatePlayerName('user_001', 'Me')).rejects.toMatchObject({ status: 400 });
  });

  it('throws ApiError 404 when user not found', async () => {
    mockFetchError(404, 'NotFound', 'User not found');
    await expect(updatePlayerName('user_ghost', 'Ghost')).rejects.toMatchObject({ status: 404 });
  });
});

// =============================================================================
// 4. updateRole()
// =============================================================================

describe('userApi — updateRole()', () => {
  it('makes PUT /api/users/{id}/role with role', async () => {
    mockFetchOk({ id: 'user_001', role: 'gm', is_game_master: true });
    await updateRole('user_001', 'gm');
    expect(lastFetchUrl()).toBe('/api/users/user_001/role');
    expect(lastFetchOptions().method).toBe('PUT');
    expect(lastFetchBody()).toEqual({ role: 'gm' });
  });

  it('returns updated role on success', async () => {
    mockFetchOk({ id: 'user_001', role: 'admin', is_game_master: true });
    const result = await updateRole('user_001', 'admin');
    expect(result.role).toBe('admin');
    expect(result.is_game_master).toBe(true);
  });

  it('throws ApiError 400 when targeting own account', async () => {
    mockFetchError(400, 'BadRequest', 'Cannot change own role');
    await expect(updateRole('self_001', 'player')).rejects.toMatchObject({ status: 400 });
  });
});

// =============================================================================
// 5. suspendUser()
// =============================================================================

describe('userApi — suspendUser()', () => {
  it('makes POST /api/users/{id}/suspend with no body', async () => {
    mockFetchOk({ id: 'user_001', is_suspended: true });
    await suspendUser('user_001');
    expect(lastFetchUrl()).toBe('/api/users/user_001/suspend');
    expect(lastFetchOptions().method).toBe('POST');
  });

  it('returns is_suspended: true on success', async () => {
    mockFetchOk({ id: 'user_001', is_suspended: true });
    const result = await suspendUser('user_001');
    expect(result.is_suspended).toBe(true);
  });

  it('throws ApiError 400 on self-suspend attempt', async () => {
    mockFetchError(400, 'BadRequest', 'Cannot suspend own account');
    await expect(suspendUser('self_001')).rejects.toMatchObject({ status: 400 });
  });
});

// =============================================================================
// 6. reinstateUser()
// =============================================================================

describe('userApi — reinstateUser()', () => {
  it('makes POST /api/users/{id}/reinstate', async () => {
    mockFetchOk({ id: 'user_001', is_suspended: false });
    await reinstateUser('user_001');
    expect(lastFetchUrl()).toBe('/api/users/user_001/reinstate');
    expect(lastFetchOptions().method).toBe('POST');
  });

  it('returns is_suspended: false on success', async () => {
    mockFetchOk({ id: 'user_001', is_suspended: false });
    const result = await reinstateUser('user_001');
    expect(result.is_suspended).toBe(false);
  });

  it('throws ApiError 404 when user not found', async () => {
    mockFetchError(404, 'NotFound', 'User not found');
    await expect(reinstateUser('user_ghost')).rejects.toMatchObject({ status: 404 });
  });
});

// =============================================================================
// 7. deleteUser()
// =============================================================================

describe('userApi — deleteUser()', () => {
  it('makes DELETE /api/users/{id}', async () => {
    mockFetchOk({ id: 'user_001', deleted: true });
    await deleteUser('user_001');
    expect(lastFetchUrl()).toBe('/api/users/user_001');
    expect(lastFetchOptions().method).toBe('DELETE');
  });

  it('returns deleted: true on success', async () => {
    mockFetchOk({ id: 'user_001', deleted: true });
    const result = await deleteUser('user_001');
    expect(result.deleted).toBe(true);
  });

  it('throws ApiError 400 on self-delete attempt', async () => {
    mockFetchError(400, 'BadRequest', 'Cannot delete own account');
    await expect(deleteUser('self_001')).rejects.toMatchObject({ status: 400 });
  });

  it('throws ApiError 404 when user not found', async () => {
    mockFetchError(404, 'NotFound', 'User not found');
    await expect(deleteUser('user_ghost')).rejects.toMatchObject({ status: 404 });
  });
});

// =============================================================================
// 8. getCampaignUsers()
// =============================================================================

describe('userApi — getCampaignUsers()', () => {
  it('makes GET /api/campaigns/{id}/users', async () => {
    mockFetchOk([MOCK_MEMBER]);
    await getCampaignUsers('camp_001');
    expect(lastFetchUrl()).toBe('/api/campaigns/camp_001/users');
    expect(lastFetchOptions().method).toBeUndefined(); // GET
  });

  it('returns array of campaign members on success', async () => {
    mockFetchOk([MOCK_MEMBER]);
    const result = await getCampaignUsers('camp_001');
    expect(result).toHaveLength(1);
    expect(result[0].user_id).toBe('user_001');
    expect(result[0].is_suspended).toBe(false);
  });

  it('throws ApiError 403 when called by non-GM', async () => {
    mockFetchError(403, 'Forbidden', 'GM required');
    await expect(getCampaignUsers('camp_001')).rejects.toMatchObject({ status: 403 });
  });
});

// =============================================================================
// 9. addCampaignUser()
// =============================================================================

describe('userApi — addCampaignUser()', () => {
  it('makes POST /api/campaigns/{id}/users with user_id', async () => {
    mockFetchOk({ campaign_id: 'camp_001', user_id: 'user_001', joined_at: 1700000000 }, 201);
    await addCampaignUser('camp_001', 'user_001');
    expect(lastFetchUrl()).toBe('/api/campaigns/camp_001/users');
    expect(lastFetchOptions().method).toBe('POST');
    expect(lastFetchBody()).toEqual({ user_id: 'user_001' });
  });

  it('returns membership record on 201', async () => {
    mockFetchOk({ campaign_id: 'camp_001', user_id: 'user_001', joined_at: 1700000000 }, 201);
    const result = await addCampaignUser('camp_001', 'user_001');
    expect(result.campaign_id).toBe('camp_001');
    expect(result.user_id).toBe('user_001');
    expect(result.joined_at).toBe(1700000000);
  });

  it('throws ApiError 409 on duplicate membership', async () => {
    mockFetchError(409, 'Conflict', 'User is already a member');
    await expect(addCampaignUser('camp_001', 'user_001')).rejects.toMatchObject({
      status: 409,
      code:   'Conflict',
    });
  });

  it('throws ApiError 404 when campaign or user not found', async () => {
    mockFetchError(404, 'NotFound', 'Campaign not found');
    await expect(addCampaignUser('camp_ghost', 'user_001')).rejects.toMatchObject({ status: 404 });
  });
});

// =============================================================================
// 10. removeCampaignUser()
// =============================================================================

describe('userApi — removeCampaignUser()', () => {
  it('makes DELETE /api/campaigns/{id}/users/{userId}', async () => {
    mockFetchOk({ campaign_id: 'camp_001', user_id: 'user_001', removed: true });
    await removeCampaignUser('camp_001', 'user_001');
    expect(lastFetchUrl()).toBe('/api/campaigns/camp_001/users/user_001');
    expect(lastFetchOptions().method).toBe('DELETE');
  });

  it('returns removed: true on success', async () => {
    mockFetchOk({ campaign_id: 'camp_001', user_id: 'user_001', removed: true });
    const result = await removeCampaignUser('camp_001', 'user_001');
    expect(result.removed).toBe(true);
  });

  it('throws ApiError 404 when membership not found', async () => {
    mockFetchError(404, 'NotFound', 'Membership not found');
    await expect(removeCampaignUser('camp_001', 'user_ghost')).rejects.toMatchObject({ status: 404 });
  });
});

// =============================================================================
// 11. setupPassword()
// =============================================================================

describe('userApi — setupPassword()', () => {
  it('makes PUT /api/auth/setup-password with password', async () => {
    mockFetchOk({ id: 'user_001', username: 'alice', display_name: 'Alice', role: 'player', is_game_master: false });
    await setupPassword('NewPass123!');
    expect(lastFetchUrl()).toBe('/api/auth/setup-password');
    expect(lastFetchOptions().method).toBe('PUT');
    expect(lastFetchBody()).toEqual({ password: 'NewPass123!' });
  });

  it('returns updated user on success', async () => {
    mockFetchOk({ id: 'user_001', username: 'alice', display_name: 'Alice', role: 'player', is_game_master: false });
    const result = await setupPassword('NewPass123!');
    expect(result.username).toBe('alice');
    expect(result.role).toBe('player');
  });

  it('throws ApiError 400 when password is empty', async () => {
    mockFetchError(400, 'BadRequest', 'Password must not be empty');
    await expect(setupPassword('')).rejects.toMatchObject({ status: 400, code: 'BadRequest' });
  });

  it('throws ApiError 403 when session flag is not set', async () => {
    mockFetchError(403, 'Forbidden', 'Not in password setup flow');
    await expect(setupPassword('Pass123!')).rejects.toMatchObject({ status: 403, code: 'Forbidden' });
  });
});

// =============================================================================
// 11b. resetUserPassword() — Phase 22.14
// =============================================================================

describe('userApi — resetUserPassword()', () => {
  it('makes POST /api/users/{id}/reset-password with no body', async () => {
    mockFetchOk({ id: 'user_001', password_reset: true });
    await resetUserPassword('user_001');
    expect(lastFetchUrl()).toBe('/api/users/user_001/reset-password');
    expect(lastFetchOptions().method).toBe('POST');
  });

  it('returns password_reset: true on success', async () => {
    mockFetchOk({ id: 'user_001', password_reset: true });
    const result = await resetUserPassword('user_001');
    expect(result.password_reset).toBe(true);
    expect(result.id).toBe('user_001');
  });

  it('throws ApiError 403 when called by non-admin', async () => {
    mockFetchError(403, 'Forbidden', 'Admin required');
    await expect(resetUserPassword('user_001')).rejects.toMatchObject({ status: 403 });
  });

  it('throws ApiError 404 when user not found', async () => {
    mockFetchError(404, 'NotFound', 'User not found');
    await expect(resetUserPassword('user_ghost')).rejects.toMatchObject({ status: 404 });
  });
});

// =============================================================================
// 11c. changePassword() — Phase 22.14
// =============================================================================

describe('userApi — changePassword()', () => {
  it('makes PUT /api/auth/change-password with current and new password', async () => {
    mockFetchOk({ id: 'user_001', username: 'alice', display_name: 'Alice', role: 'player', is_game_master: false });
    await changePassword('OldPass123!', 'NewPass123!');
    expect(lastFetchUrl()).toBe('/api/auth/change-password');
    expect(lastFetchOptions().method).toBe('PUT');
    expect(lastFetchBody()).toEqual({ current_password: 'OldPass123!', new_password: 'NewPass123!' });
  });

  it('returns updated user on success', async () => {
    mockFetchOk({ id: 'user_001', username: 'alice', display_name: 'Alice', role: 'player', is_game_master: false });
    const result = await changePassword('OldPass123!', 'NewPass123!');
    expect(result.username).toBe('alice');
    expect(result.role).toBe('player');
  });

  it('throws ApiError 400 WrongPassword when current password is wrong', async () => {
    mockFetchError(400, 'WrongPassword', 'Current password is incorrect.');
    const err = await changePassword('WrongPass!', 'NewPass123!').catch(e => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(400);
    expect(err.code).toBe('WrongPassword');
  });

  it('throws ApiError 400 BadRequest when new password is empty', async () => {
    mockFetchError(400, 'BadRequest', 'New password must not be empty.');
    await expect(changePassword('OldPass123!', '')).rejects.toMatchObject({
      status: 400,
      code: 'BadRequest',
    });
  });

  it('sends empty string for current_password (no-password account flow)', async () => {
    mockFetchOk({ id: 'user_001', username: 'alice', display_name: 'Alice', role: 'player', is_game_master: false });
    await changePassword('', 'NewPass123!');
    expect(lastFetchBody()).toEqual({ current_password: '', new_password: 'NewPass123!' });
  });

  it('throws ApiError 401 when not authenticated', async () => {
    mockFetchError(401, 'Unauthorized', 'Authentication required');
    await expect(changePassword('OldPass!', 'NewPass123!')).rejects.toMatchObject({ status: 401 });
  });
});

// =============================================================================
// 11d. apiFetch — error response fallback fields (coverage for lines 98-99)
// =============================================================================

describe('apiFetch — error response fallback fields', () => {
  it('uses "UnknownError" code and "HTTP {status}" message when body has no error/message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok:     false,
      status: 500,
      json:   () => Promise.resolve({}), // empty body — no error/message fields
    }));
    const err = await listUsers().catch(e => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('UnknownError');
    expect(err.message).toBe('HTTP 500');
  });

  it('uses "HTTP {status}" message when body has error but no message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok:     false,
      status: 403,
      json:   () => Promise.resolve({ error: 'Forbidden' }), // error present, message absent
    }));
    const err = await listUsers().catch(e => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('Forbidden');
    expect(err.message).toBe('HTTP 403');
  });

  it('falls back to empty body when JSON parsing throws (malformed response)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok:     false,
      status: 500,
      json:   () => Promise.reject(new SyntaxError('Invalid JSON')),
    }));
    const err = await listUsers().catch(e => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(500);
    expect(err.code).toBe('UnknownError');
    expect(err.message).toBe('HTTP 500');
  });
});

// =============================================================================
// 12. ApiError class
// =============================================================================

describe('ApiError class', () => {
  it('carries status, code, and message', () => {
    const err = new ApiError(409, 'Conflict', 'Username taken');
    expect(err.status).toBe(409);
    expect(err.code).toBe('Conflict');
    expect(err.message).toBe('Username taken');
    expect(err.name).toBe('ApiError');
  });

  it('is instanceof Error and instanceof ApiError', () => {
    const err = new ApiError(500, 'InternalError', 'Server error');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ApiError);
  });

  it('is distinguishable from generic Error in catch blocks', () => {
    const err = new ApiError(404, 'NotFound', 'Missing');
    if (err instanceof ApiError) {
      expect(err.status).toBe(404);
    } else {
      throw new Error('Should have been ApiError');
    }
  });
});
