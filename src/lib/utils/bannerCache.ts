/**
 * @file src/lib/utils/bannerCache.ts
 * @description Client-side sessionStorage cache for campaign banner data URIs.
 *
 * WHY A DEDICATED CACHE?
 *   Banner images are stored as base64 data URIs in `campaigns.banner_image_data`
 *   (up to ~6.7 MB encoded). Including them in every GET /api/campaigns list
 *   response would make the campaign hub page very slow. Instead:
 *
 *   - GET /api/campaigns (list)   — EXCLUDES banner_image_data (fast list).
 *   - GET /api/campaigns/{id}     — INCLUDES banner_image_data (single item).
 *
 *   Once loaded, the data URI is cached in sessionStorage for the session so
 *   the user does not pay the fetch cost again when revisiting the settings page.
 *
 * CACHE KEY STRATEGY:
 *   Key format: `cvault_banner_${campaignId}_${updatedAt}`
 *
 *   Including `updatedAt` in the key means:
 *   - After the GM saves a new banner (the server updates `updated_at`), the old
 *     cached entry is automatically stale: the new `updatedAt` produces a different
 *     key, causing a cache miss and a re-fetch.
 *   - No explicit invalidation is needed on save — the timestamp change acts as
 *     a natural version token.
 *
 * EVICTION:
 *   Before writing a new entry, evictStaleBannerEntries() removes all existing
 *   keys for the same campaign (regardless of timestamp), keeping sessionStorage
 *   bounded to at most ONE banner entry per campaign per session.
 *
 * GRACEFUL DEGRADATION:
 *   All functions silently catch sessionStorage errors (quota exceeded,
 *   security restrictions in private/incognito browsing). A cache miss is
 *   treated as a normal case — the banner is just re-fetched from the API.
 */

// Internal prefix — namespaces our keys within the shared sessionStorage.
const KEY_PREFIX = 'cvault_banner_';

// =============================================================================
// PRIVATE HELPERS
// =============================================================================

/**
 * Builds the sessionStorage key for a given (campaignId, updatedAt) pair.
 */
function buildKey(campaignId: string, updatedAt: number): string {
  return `${KEY_PREFIX}${campaignId}_${updatedAt}`;
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Returns the cached banner data URI for a campaign, or `null` on cache miss.
 *
 * A miss occurs when:
 *   - The browser session is new (sessionStorage was cleared).
 *   - The campaign's `updatedAt` changed since the entry was written.
 *   - The entry was evicted by a previous setCachedBanner() call.
 *   - sessionStorage is unavailable (private browsing, quota full).
 *
 * @param campaignId - Campaign UUID (e.g. "camp_abc123").
 * @param updatedAt  - Unix timestamp from `Campaign.updatedAt`.
 * @returns Data URI string on hit, `null` on miss.
 */
export function getCachedBanner(campaignId: string, updatedAt: number): string | null {
  try {
    return sessionStorage.getItem(buildKey(campaignId, updatedAt));
  } catch {
    // sessionStorage unavailable (private browsing, QuotaExceededError, etc.)
    return null;
  }
}

/**
 * Stores a banner data URI in the session cache.
 *
 * Evicts all stale entries for the same campaign first so only the latest
 * version is retained. Silently ignores storage errors.
 *
 * @param campaignId - Campaign UUID.
 * @param updatedAt  - Unix timestamp that matches this data URI's generation.
 * @param dataUri    - Base64 data URI (e.g. "data:image/jpeg;base64,…").
 */
export function setCachedBanner(
  campaignId: string,
  updatedAt: number,
  dataUri: string,
): void {
  try {
    // Remove stale entries for this campaign before writing the new one.
    evictStaleBannerEntries(campaignId, updatedAt);
    sessionStorage.setItem(buildKey(campaignId, updatedAt), dataUri);
  } catch {
    // Silently swallow — a cache miss is a graceful fallback, not a crash.
  }
}

/**
 * Removes all cached banner entries for a campaign EXCEPT the one matching
 * `keepUpdatedAt`. Pass `keepUpdatedAt = -1` to remove every entry.
 *
 * Call this:
 *   - Before writing a new entry (done automatically by setCachedBanner).
 *   - After the GM removes a banner (pass -1 to clear everything).
 *
 * Uses a two-pass approach (collect keys first, then delete) to avoid
 * mutating sessionStorage while iterating over it — a common pitfall with
 * `sessionStorage.key(i)` iteration.
 *
 * @param campaignId      - Campaign UUID whose entries should be evicted.
 * @param keepUpdatedAt   - The `updatedAt` value to preserve. Default: -1 (evict all).
 */
export function evictStaleBannerEntries(
  campaignId: string,
  keepUpdatedAt = -1,
): void {
  try {
    const campaignPrefix = `${KEY_PREFIX}${campaignId}_`;
    const keepKey        = buildKey(campaignId, keepUpdatedAt);
    const keysToRemove: string[] = [];

    // Collect matching keys in a first pass — do NOT delete during iteration.
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(campaignPrefix) && key !== keepKey) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      sessionStorage.removeItem(key);
    }
  } catch {
    // Silently swallow — eviction is best-effort.
  }
}
