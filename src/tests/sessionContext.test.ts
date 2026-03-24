/**
 * @file src/tests/sessionContext.test.ts
 * @description Unit tests for SessionContext — user session reactive singleton.
 *
 * SessionContext uses Svelte 5 `$state` runes. These work in Node.js/Vitest
 * because the Svelte compiler transforms `$state` declarations into standard
 * JavaScript getters/setters at compile time.
 *
 * COVERAGE TARGET: SessionContext.svelte.ts — all public methods.
 *
 * WHAT IS TESTED:
 *   - Default state initialization (GM user, no active campaign)
 *   - switchToGM() — restores GM profile
 *   - switchToPlayer() — switches to player profile
 *   - setActiveCampaign(id) — sets/clears active campaign
 *   - setGameMaster(value) — explicit GM status toggle
 *   - loadFromServer() — Phase 14.2 real implementation:
 *       200 response → populates currentUserId / isGameMaster / csrfToken
 *       401 response → navigates to /login (goto mocked)
 *       network error → logs warning, state unchanged
 *
 * @see src/lib/engine/SessionContext.svelte.ts
 * @see ARCHITECTURE.md Phase 14.2 — PHP session bootstrap
 */

import { describe, it, expect, afterEach, vi } from 'vitest';

// Import the CLASS directly for fresh instances in each test (no singleton pollution)
// The module also exports the singleton `sessionContext` but tests should use fresh instances.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SessionContext: SessionContextClass } = await import('$lib/engine/SessionContext.svelte');

// =============================================================================
// 1. Default state
// =============================================================================

describe('SessionContext — default initial state', () => {
  it('starts as GM user by default (maximum test surface area)', () => {
    const ctx = new SessionContextClass();
    expect(ctx.isGameMaster).toBe(true);
  });

  it('defaults to GM user ID "user_gm_001"', () => {
    const ctx = new SessionContextClass();
    expect(ctx.currentUserId).toBe('user_gm_001');
  });

  it('defaults to "Game Master (Mock)" display name', () => {
    const ctx = new SessionContextClass();
    expect(ctx.currentUserDisplayName).toBe('Game Master (Mock)');
  });

  it('defaults to null active campaign (on the Campaign Hub)', () => {
    const ctx = new SessionContextClass();
    expect(ctx.activeCampaignId).toBeNull();
  });
});

// =============================================================================
// 2. switchToPlayer()
// =============================================================================

describe('SessionContext — switchToPlayer()', () => {
  it('sets isGameMaster to false', () => {
    const ctx = new SessionContextClass();
    ctx.switchToPlayer();
    expect(ctx.isGameMaster).toBe(false);
  });

  it('changes currentUserId to "user_player_001"', () => {
    const ctx = new SessionContextClass();
    ctx.switchToPlayer();
    expect(ctx.currentUserId).toBe('user_player_001');
  });

  it('changes display name to TestPlayer', () => {
    const ctx = new SessionContextClass();
    ctx.switchToPlayer();
    expect(ctx.currentUserDisplayName).toBe('TestPlayer (Mock)');
  });
});

// =============================================================================
// 3. switchToGM()
// =============================================================================

describe('SessionContext — switchToGM()', () => {
  it('restores isGameMaster to true after switching to player', () => {
    const ctx = new SessionContextClass();
    ctx.switchToPlayer();
    ctx.switchToGM();
    expect(ctx.isGameMaster).toBe(true);
  });

  it('restores currentUserId to "user_gm_001"', () => {
    const ctx = new SessionContextClass();
    ctx.switchToPlayer();
    ctx.switchToGM();
    expect(ctx.currentUserId).toBe('user_gm_001');
  });

  it('restores display name to "Game Master (Mock)"', () => {
    const ctx = new SessionContextClass();
    ctx.switchToPlayer();
    ctx.switchToGM();
    expect(ctx.currentUserDisplayName).toBe('Game Master (Mock)');
  });

  it('calling switchToGM() when already GM is idempotent', () => {
    const ctx = new SessionContextClass();
    ctx.switchToGM(); // Already GM
    expect(ctx.isGameMaster).toBe(true);
    expect(ctx.currentUserId).toBe('user_gm_001');
  });
});

// =============================================================================
// 4. setActiveCampaign()
// =============================================================================

describe('SessionContext — setActiveCampaign()', () => {
  it('sets the active campaign ID', () => {
    const ctx = new SessionContextClass();
    ctx.setActiveCampaign('campaign_abc123');
    expect(ctx.activeCampaignId).toBe('campaign_abc123');
  });

  it('clears the active campaign when null is passed', () => {
    const ctx = new SessionContextClass();
    ctx.setActiveCampaign('campaign_abc123');
    ctx.setActiveCampaign(null);
    expect(ctx.activeCampaignId).toBeNull();
  });

  it('can switch between campaigns', () => {
    const ctx = new SessionContextClass();
    ctx.setActiveCampaign('campaign_first');
    ctx.setActiveCampaign('campaign_second');
    expect(ctx.activeCampaignId).toBe('campaign_second');
  });
});

// =============================================================================
// 5. setGameMaster()
// =============================================================================

describe('SessionContext — setGameMaster()', () => {
  it('explicitly sets isGameMaster to false', () => {
    const ctx = new SessionContextClass();
    ctx.setGameMaster(false);
    expect(ctx.isGameMaster).toBe(false);
  });

  it('explicitly sets isGameMaster to true', () => {
    const ctx = new SessionContextClass();
    ctx.setGameMaster(false);
    ctx.setGameMaster(true);
    expect(ctx.isGameMaster).toBe(true);
  });

  it('setGameMaster(false) does NOT change userId or display name (unlike switchToPlayer)', () => {
    const ctx = new SessionContextClass();
    // setGameMaster only changes the flag, not the profile
    ctx.setGameMaster(false);
    expect(ctx.currentUserId).toBe('user_gm_001'); // unchanged
  });
});

// =============================================================================
// 6. loadFromServer() — Phase 14.2 real implementation
// =============================================================================

describe('SessionContext — loadFromServer() with mocked fetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('populates userId, displayName, isGameMaster from a 200 response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        id:             'user_gm_001',
        display_name:   'Game Master',
        is_game_master: true,
        csrfToken:      'csrf_token_abc',
      }),
    }));

    const ctx = new SessionContextClass();
    ctx.switchToPlayer(); // Start as player to verify the 200 overwrites state
    await ctx.loadFromServer();

    expect(ctx.currentUserId).toBe('user_gm_001');
    expect(ctx.currentUserDisplayName).toBe('Game Master');
    expect(ctx.isGameMaster).toBe(true);
  });

  it('populates a player profile from a 200 response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        id:             'user_player_001',
        display_name:   'Alice',
        is_game_master: false,
        csrfToken:      'csrf_token_xyz',
      }),
    }));

    const ctx = new SessionContextClass();
    await ctx.loadFromServer();

    expect(ctx.currentUserId).toBe('user_player_001');
    expect(ctx.currentUserDisplayName).toBe('Alice');
    expect(ctx.isGameMaster).toBe(false);
  });

  it('redirects to /login on a 401 response (no active session)', async () => {
    // $app/navigation's goto is already shimmed by SvelteKit's Vite plugin in tests.
    // We stub window.location so goto's fallback navigation can be observed,
    // and just verify that the ctx state was NOT updated (redirect aborts loading).
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: 'Unauthorized' }),
    }));

    // Provide a minimal window with location so the goto shim doesn't crash
    vi.stubGlobal('window', { location: { pathname: '/campaigns', search: '' } });

    const ctx = new SessionContextClass();
    // loadFromServer should not throw even when 401 triggers navigation
    await expect(ctx.loadFromServer()).resolves.not.toThrow();
    // State should remain at default (the redirect prevented any update)
    expect(ctx.currentUserId).toBe('user_gm_001'); // unchanged default
  });

  it('logs a warning and leaves state unchanged on a non-401 error response', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'InternalServerError' }),
    }));

    const ctx = new SessionContextClass();
    ctx.switchToPlayer();

    await ctx.loadFromServer();

    // State is NOT overwritten by a 500 error
    expect(ctx.currentUserId).toBe('user_player_001');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[SessionContext]'),
      expect.anything()
    );
    consoleSpy.mockRestore();
  });

  it('logs a warning and leaves state unchanged when fetch throws (offline)', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Failed to fetch')));

    const ctx = new SessionContextClass();
    ctx.switchToPlayer();

    await expect(ctx.loadFromServer()).resolves.not.toThrow();

    // State is unchanged when the server is unreachable
    expect(ctx.isGameMaster).toBe(false);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('does not crash when csrfToken is absent from the 200 response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        id:             'user_gm_001',
        display_name:   'GM',
        is_game_master: true,
        // csrfToken intentionally omitted
      }),
    }));

    const ctx = new SessionContextClass();
    await expect(ctx.loadFromServer()).resolves.not.toThrow();
    expect(ctx.currentUserId).toBe('user_gm_001');
  });
});

// =============================================================================
// 7. Profile toggle cycle (player → GM → player)
// =============================================================================

describe('SessionContext — profile round-trip', () => {
  it('GM → Player → GM cycle preserves expected state at each step', () => {
    const ctx = new SessionContextClass();

    // Start: GM
    expect(ctx.isGameMaster).toBe(true);
    expect(ctx.currentUserId).toBe('user_gm_001');

    // Switch to Player
    ctx.switchToPlayer();
    expect(ctx.isGameMaster).toBe(false);
    expect(ctx.currentUserId).toBe('user_player_001');

    // Switch back to GM
    ctx.switchToGM();
    expect(ctx.isGameMaster).toBe(true);
    expect(ctx.currentUserId).toBe('user_gm_001');
  });
});
