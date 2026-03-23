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
 *   - loadFromServer() — no-op async (mock mode, no crash)
 *   - SessionContext class can be instantiated fresh for test isolation
 *
 * @see src/lib/engine/SessionContext.svelte.ts
 * @see ARCHITECTURE.md section 9.14 — Vault Visibility Rules
 */

import { describe, it, expect } from 'vitest';

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
// 6. loadFromServer() — no-op mock (Phase 14.2 placeholder)
// =============================================================================

describe('SessionContext — loadFromServer() mock no-op', () => {
  it('resolves without throwing (currently a no-op mock)', async () => {
    const ctx = new SessionContextClass();
    await expect(ctx.loadFromServer()).resolves.toBeUndefined();
  });

  it('does not change state in mock mode', async () => {
    const ctx = new SessionContextClass();
    ctx.switchToPlayer(); // Set to player state
    await ctx.loadFromServer(); // Should be a no-op
    // State is unchanged — the mock doesn't load from server
    expect(ctx.currentUserId).toBe('user_player_001');
    expect(ctx.isGameMaster).toBe(false);
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
