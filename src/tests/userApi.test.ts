/**
 * @file src/tests/userApi.test.ts
 * @description Unit tests for the user-profile API functions added for the
 * "rename display name" and "admin edit username" features.
 *
 * WHAT IS TESTED
 *   1. updateOwnDisplayName()
 *      — Sends PUT to /api/auth/display-name with { display_name }
 *      — Returns the parsed response body on success
 *      — Throws ApiError(400) when the server rejects an empty name
 *      — Throws ApiError(401) when the user is unauthenticated
 *
 *   2. updateUsername()
 *      — Sends PUT to /api/users/{id} with { username, player_name }
 *      — Returns { id, username, player_name } on success
 *      — Throws ApiError(409) on username conflict
 *      — Throws ApiError(400) on empty values
 *
 *   3. updatePlayerName() (regression guard for existing function)
 *      — Still works as before; only sends player_name in the body
 *      — Extended return type now includes username
 *
 * MOCKING STRATEGY
 *   `fetch` is replaced with `vi.stubGlobal('fetch', mockFn)` for each test.
 *   `vi.unstubAllGlobals()` in `afterEach` restores the real implementation.
 *   This avoids any real HTTP call while still exercising the full apiFetch
 *   path (header merging, response parsing, ApiError construction).
 *
 * @see src/lib/api/userApi.ts  Module under test
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  updateOwnDisplayName,
  updateUsername,
  updatePlayerName,
  ApiError,
} from '$lib/api/userApi';

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Creates a minimal Response-like mock that `apiFetch` can consume:
 *   - response.ok      → controls the happy/error path
 *   - response.status  → used in the ApiError constructor
 *   - response.json()  → returns the provided body (or {} on network error)
 */
function makeFetchMock(status: number, body: unknown, ok?: boolean) {
  const isOk = ok ?? (status >= 200 && status < 300);
  return vi.fn().mockResolvedValue({
    ok:     isOk,
    status,
    json:   () => Promise.resolve(body),
  });
}

// =============================================================================
// TEARDOWN
// =============================================================================

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// =============================================================================
// 1. updateOwnDisplayName()
// =============================================================================

describe('updateOwnDisplayName()', () => {

  it('sends PUT /api/auth/display-name with { display_name }', async () => {
    const fetchMock = makeFetchMock(200, { id: 'user_001', display_name: 'Alice' });
    vi.stubGlobal('fetch', fetchMock);

    await updateOwnDisplayName('Alice');

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/auth/display-name');
    expect(options.method).toBe('PUT');
    const body = JSON.parse(options.body as string);
    expect(body).toEqual({ display_name: 'Alice' });
  });

  it('returns the parsed response body on success', async () => {
    const expected = { id: 'user_001', display_name: 'Alice' };
    vi.stubGlobal('fetch', makeFetchMock(200, expected));

    const result = await updateOwnDisplayName('Alice');

    expect(result).toEqual(expected);
  });

  it('uses credentials: include (session cookie must be sent)', async () => {
    vi.stubGlobal('fetch', makeFetchMock(200, { id: 'u1', display_name: 'X' }));

    await updateOwnDisplayName('X');

    const [, options] = (vi.mocked(fetch).mock.calls[0] as unknown) as [string, RequestInit];
    expect(options.credentials).toBe('include');
  });

  it('throws ApiError(400) when the server returns 400 BadRequest', async () => {
    vi.stubGlobal('fetch', makeFetchMock(400, {
      error:   'BadRequest',
      message: 'display_name must not be empty.',
    }));

    await expect(updateOwnDisplayName('')).rejects.toThrow(ApiError);

    try {
      await updateOwnDisplayName('');
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).status).toBe(400);
      expect((e as ApiError).code).toBe('BadRequest');
    }
  });

  it('throws ApiError(401) when the server returns 401 Unauthorized', async () => {
    vi.stubGlobal('fetch', makeFetchMock(401, {
      error:   'Unauthorized',
      message: 'Not authenticated.',
    }));

    await expect(updateOwnDisplayName('Bob')).rejects.toThrow(ApiError);

    try {
      await updateOwnDisplayName('Bob');
    } catch (e) {
      expect((e as ApiError).status).toBe(401);
    }
  });

  it('includes the display_name value verbatim in the request body', async () => {
    vi.stubGlobal('fetch', makeFetchMock(200, { id: 'u1', display_name: 'Zoé (Belgique)' }));

    await updateOwnDisplayName('Zoé (Belgique)');

    const [, options] = (vi.mocked(fetch).mock.calls[0] as unknown) as [string, RequestInit];
    const body = JSON.parse(options.body as string);
    expect(body.display_name).toBe('Zoé (Belgique)');
  });
});

// =============================================================================
// 2. updateUsername()
// =============================================================================

describe('updateUsername()', () => {

  it('sends PUT /api/users/{id} with { username, player_name }', async () => {
    const fetchMock = makeFetchMock(200, {
      id: 'user_002', username: 'bob_new', player_name: 'Bob',
    });
    vi.stubGlobal('fetch', fetchMock);

    await updateUsername('user_002', 'bob_new', 'Bob');

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/users/user_002');
    expect(options.method).toBe('PUT');
    const body = JSON.parse(options.body as string);
    expect(body).toEqual({ username: 'bob_new', player_name: 'Bob' });
  });

  it('returns { id, username, player_name } on success', async () => {
    const expected = { id: 'user_002', username: 'bob_new', player_name: 'Bob' };
    vi.stubGlobal('fetch', makeFetchMock(200, expected));

    const result = await updateUsername('user_002', 'bob_new', 'Bob');

    expect(result.id).toBe('user_002');
    expect(result.username).toBe('bob_new');
    expect(result.player_name).toBe('Bob');
  });

  it('throws ApiError(409) on username conflict', async () => {
    vi.stubGlobal('fetch', makeFetchMock(409, {
      error:   'Conflict',
      message: "Username 'bob_new' is already taken.",
    }));

    await expect(updateUsername('user_002', 'bob_new', 'Bob')).rejects.toThrow(ApiError);

    try {
      await updateUsername('user_002', 'bob_new', 'Bob');
    } catch (e) {
      expect((e as ApiError).status).toBe(409);
      expect((e as ApiError).code).toBe('Conflict');
    }
  });

  it('throws ApiError(400) when player_name is empty', async () => {
    vi.stubGlobal('fetch', makeFetchMock(400, {
      error:   'BadRequest',
      message: 'player_name must not be empty.',
    }));

    await expect(updateUsername('user_002', 'bob_new', '')).rejects.toThrow(ApiError);
  });

  it('throws ApiError(400) on self-edit attempt', async () => {
    vi.stubGlobal('fetch', makeFetchMock(400, {
      error:   'BadRequest',
      message: 'Administrators cannot edit their own account via this endpoint.',
    }));

    await expect(updateUsername('admin_001', 'admin_new', 'Admin')).rejects.toThrow(ApiError);
  });

  it('includes the user id in the URL', async () => {
    vi.stubGlobal('fetch', makeFetchMock(200, { id: 'u99', username: 'u', player_name: 'P' }));

    await updateUsername('u99', 'u', 'P');

    const [url] = vi.mocked(fetch).mock.calls[0] as [string, ...unknown[]];
    expect(url).toContain('u99');
  });
});

// =============================================================================
// 3. updatePlayerName() — regression guard
// =============================================================================

describe('updatePlayerName() — regression guard', () => {

  it('sends PUT /api/users/{id} with only player_name in the body', async () => {
    const fetchMock = makeFetchMock(200, {
      id: 'user_003', player_name: 'Carol', username: 'carol',
    });
    vi.stubGlobal('fetch', fetchMock);

    await updatePlayerName('user_003', 'Carol');

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/users/user_003');
    const body = JSON.parse(options.body as string);
    expect(body).toEqual({ player_name: 'Carol' });
    // username must NOT be sent when not requested
    expect(body).not.toHaveProperty('username');
  });

  it('returns the updated player_name', async () => {
    vi.stubGlobal('fetch', makeFetchMock(200, {
      id: 'user_003', player_name: 'Carol', username: 'carol',
    }));

    const result = await updatePlayerName('user_003', 'Carol');
    expect(result.player_name).toBe('Carol');
  });
});

// =============================================================================
// 4. ApiError shape
// =============================================================================

describe('ApiError — constructor and properties', () => {

  it('exposes status, code, and message', async () => {
    vi.stubGlobal('fetch', makeFetchMock(403, {
      error: 'Forbidden', message: 'Admin only.',
    }));

    try {
      await updateOwnDisplayName('X');
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      const err = e as ApiError;
      expect(err.status).toBe(403);
      expect(err.code).toBe('Forbidden');
      expect(err.message).toBe('Admin only.');
    }
  });

  it('uses "UnknownError" code when the body has no "error" field', async () => {
    vi.stubGlobal('fetch', makeFetchMock(500, { message: 'Internal server error.' }));

    try {
      await updateOwnDisplayName('X');
    } catch (e) {
      expect((e as ApiError).code).toBe('UnknownError');
    }
  });

  it('falls back to "HTTP {status}" message when body has no "message" field', async () => {
    vi.stubGlobal('fetch', makeFetchMock(503, { error: 'ServiceUnavailable' }));

    try {
      await updateOwnDisplayName('X');
    } catch (e) {
      expect((e as ApiError).message).toBe('HTTP 503');
    }
  });
});
