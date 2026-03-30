/**
 * @file src/lib/api/serverSettingsApi.ts
 * @description Client-side helpers for the server-wide settings API.
 *
 * WHY A DEDICATED MODULE?
 *   Server settings (like GM global overrides) are not tied to any single campaign.
 *   They live in the `server_settings` table on the backend and are fetched from a
 *   separate endpoint.  Centralising the fetch logic here avoids duplicating headers,
 *   error-handling, and URL constants across multiple Svelte pages.
 *
 * ENDPOINT:
 *   GET  /api/server-settings/gm-overrides  — returns the raw JSON array string
 *   PUT  /api/server-settings/gm-overrides  — replaces the JSON array (GM only)
 *
 * USAGE PATTERN:
 *   Pages that previously read `campaign.gmGlobalOverrides` should now call
 *   `getGmGlobalOverrides()` once on mount (or in a reactive `$effect`) and store
 *   the result in a local `$state` variable.  The DataLoader `gmGlobalOverrides`
 *   parameter accepts the same JSON string format this function returns.
 *
 * @see api/controllers/ServerSettingsController.php  for the backend implementation.
 * @see src/lib/engine/DataLoader.ts                  for how overrides are consumed.
 */

import { apiHeaders } from '$lib/engine/StorageManager';

// ============================================================
// GET — fetch current global GM overrides
// ============================================================

/**
 * Fetches the current global GM override JSON array from the server.
 *
 * RETURN VALUE:
 *   A raw JSON string (e.g. `'[]'` or `'[{"id":"feat_custom","category":"feat"}]'`).
 *   This string can be passed directly to `DataLoader.loadRuleSources()` as the
 *   `gmGlobalOverrides` parameter.
 *
 * ERROR BEHAVIOUR:
 *   Returns `'[]'` on any fetch failure so the DataLoader still starts up correctly.
 *   Logs a warning to the console but does NOT throw.
 *
 * CACHING:
 *   The caller is responsible for caching.  Components typically store the result
 *   in a Svelte `$state` variable and only re-fetch when needed (e.g., after the
 *   GM saves new overrides).
 */
export async function getGmGlobalOverrides(): Promise<string> {
  try {
    const response = await fetch('/api/server-settings/gm-overrides', {
      headers:     apiHeaders(),
      credentials: 'include',
    });
    if (!response.ok) {
      console.warn('[serverSettingsApi] GET gm-overrides returned HTTP', response.status);
      return '[]';
    }
    // The endpoint returns the raw JSON string, not a wrapped object.
    return await response.text();
  } catch (err) {
    console.warn('[serverSettingsApi] GET gm-overrides unavailable:', err);
    return '[]';
  }
}

// ============================================================
// PUT — save global GM overrides
// ============================================================

/**
 * Saves a new global GM override JSON array to the server.
 *
 * @param jsonArray - A JSON-encoded array string (e.g. `'[]'` or a JSON array).
 *                   Must be a valid JSON array; the server returns 422 otherwise.
 *
 * @returns `true` on success, `false` on any failure (HTTP error or network error).
 *
 * AUTHORISATION:
 *   GM or Admin only.  Returns `false` if the user does not have GM rights
 *   (the server responds with 403 Forbidden).
 */
export async function setGmGlobalOverrides(jsonArray: string): Promise<boolean> {
  try {
    const response = await fetch('/api/server-settings/gm-overrides', {
      method:      'PUT',
      headers:     apiHeaders(),
      credentials: 'include',
      body:        jsonArray,
    });
    if (!response.ok) {
      console.warn('[serverSettingsApi] PUT gm-overrides returned HTTP', response.status);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[serverSettingsApi] PUT gm-overrides unavailable:', err);
    return false;
  }
}
