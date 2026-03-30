<?php
/**
 * @file api/controllers/ServerSettingsController.php
 * @description REST controller for server-wide settings.
 *
 * ENDPOINTS:
 *   GET  /api/server-settings/gm-overrides  → getGmOverrides()
 *   PUT  /api/server-settings/gm-overrides  → setGmOverrides()
 *
 * PURPOSE:
 *   Provides access to the server_settings table — a key-value store for
 *   configuration that is global across ALL campaigns (not per-campaign).
 *
 * GM GLOBAL OVERRIDES:
 *   The `gm_global_overrides` setting is a JSON array of Feature/config-table
 *   objects that the GM applies as "Layer 2" of the DataLoader resolution chain:
 *
 *     [1] Static rule source files  (static/rules/*.json, alphabetical)
 *     [2] Dynamic global rule files (storage/rules/*.json, alphabetical)
 *     [3] Campaign homebrew         (campaigns.homebrew_rules_json)
 *     [4] GM global overrides       ← this setting (server_settings.gm_global_overrides)
 *     [5] Per-character GM overrides (characters.gm_overrides_json)
 *
 *   WHY SERVER-WIDE (not per-campaign)?
 *     A single "GM global override" layer applies uniformly to every campaign
 *     on the server.  Storing it per-campaign would force the GM to update every
 *     campaign row individually just to adjust one entity.  Since these overrides
 *     are typically server-level house rules (e.g., custom XP table, house feats),
 *     one shared record is the correct model.
 *
 * VISIBILITY / AUTHORISATION:
 *   getGmOverrides() — any authenticated user.
 *     All users' DataLoaders call this during app init so every client applies
 *     the same overrides.  Restricting GET to GMs would prevent players from
 *     loading rules correctly.
 *
 *   setGmOverrides() — GM or Admin only.
 *     Writing overrides is a privileged operation that affects ALL campaigns
 *     and ALL players on the server.
 *
 * VALIDATION (setGmOverrides):
 *   - Body must be valid JSON.                          → 422
 *   - Root value must be a JSON array.                  → 422
 *   - Raw request body must not exceed 2 MB.            → 413
 *
 * @see api/migrate.php               for the server_settings table definition.
 * @see api/controllers/GlobalRulesController.php for rule FILE management.
 * @see src/lib/engine/DataLoader.ts  for the client-side resolution chain.
 * @see ARCHITECTURE.md §15.2         for the global overrides text-area spec.
 */

declare(strict_types=1);

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../Logger.php';
require_once __DIR__ . '/../Database.php';
require_once __DIR__ . '/../auth.php';

class ServerSettingsController
{
    /**
     * Maximum allowed request body in bytes (2 MiB).
     * Matches the campaign-scope homebrew limit (Phase 21.1.1) for consistency.
     */
    private const MAX_BYTES = 2 * 1024 * 1024;

    /**
     * The database key used to store the global GM override array.
     */
    private const KEY_GM_OVERRIDES = 'gm_global_overrides';

    // ============================================================
    // GET /api/server-settings/gm-overrides
    // ============================================================

    /**
     * Returns the current global GM override JSON array.
     *
     * AUTHORISATION: Any authenticated user.
     *   The DataLoader calls this during app init for ALL users so that every
     *   player's DataLoader applies the same GM overrides.
     *
     * RESPONSE (200):
     *   A JSON array of Feature/config-table objects (may be empty: `[]`).
     *
     * FAILURE MODES:
     *   - 401 if not authenticated (requireAuth blocks the request).
     *   - 500 if the DB row is corrupted (malformed JSON).  Logs the error and
     *     returns `[]` so the DataLoader can still start up.
     */
    public static function getGmOverrides(): void
    {
        requireAuth();
        $db = Database::getInstance();

        // The bootstrap in migrate() guarantees the row exists with value '[]',
        // so this SELECT should always return a row.
        $stmt = $db->prepare('SELECT value FROM server_settings WHERE key = ?');
        $stmt->execute([self::KEY_GM_OVERRIDES]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            // Defensive fallback: row missing despite bootstrap — auto-insert and return empty.
            $db->prepare("INSERT OR IGNORE INTO server_settings (key, value) VALUES (?, '[]')")
               ->execute([self::KEY_GM_OVERRIDES]);
            Logger::info('ServerSettings', 'GmOverrides GET (auto-seeded missing row)');
            http_response_code(200);
            echo '[]';
            return;
        }

        // Return the raw JSON value directly.
        // It was normalised when PUT so it is always valid JSON.
        Logger::info('ServerSettings', 'GmOverrides GET');
        http_response_code(200);
        echo $row['value'];
    }

    // ============================================================
    // PUT /api/server-settings/gm-overrides
    // ============================================================

    /**
     * Replaces the global GM override array.
     *
     * AUTHORISATION: GM or Admin only.
     *
     * REQUEST BODY:
     *   A JSON array of Feature/config-table objects.
     *   Send `[]` to clear all overrides.
     *
     * VALIDATION (first failure wins):
     *   1. 413 — Content-Length header exceeds 2 MB.
     *   2. 413 — Actual body exceeds 2 MB (after buffering).
     *   3. 422 — Body is not valid JSON.
     *   4. 422 — Root value is not a JSON array.
     *
     * SIDE EFFECT:
     *   Upserts the 'gm_global_overrides' row in server_settings.
     *   Uses INSERT OR REPLACE to handle both first-time writes and updates
     *   atomically, without needing a separate existence check.
     *
     * RESPONSE (200):
     *   { "key": "gm_global_overrides", "updatedAt": <unix_timestamp> }
     */
    public static function setGmOverrides(): void
    {
        requireGameMaster();
        $db = Database::getInstance();

        // ---- 413 Request Entity Too Large — Content-Length gate ------------------
        // Fast rejection before reading the body into memory.
        $contentLength = isset($_SERVER['CONTENT_LENGTH']) ? (int)$_SERVER['CONTENT_LENGTH'] : 0;
        if ($contentLength > self::MAX_BYTES) {
            http_response_code(413);
            echo json_encode([
                'error'   => 'RequestTooLarge',
                'message' => 'GM global overrides payload must not exceed 2 MB.',
            ]);
            return;
        }

        // ---- Read body -----------------------------------------------------------
        $rawBody = (string)file_get_contents('php://input');

        // ---- 413 — actual body size check ----------------------------------------
        if (strlen($rawBody) > self::MAX_BYTES) {
            http_response_code(413);
            echo json_encode([
                'error'   => 'RequestTooLarge',
                'message' => 'GM global overrides payload must not exceed 2 MB.',
            ]);
            return;
        }

        // ---- 422 — JSON validity -------------------------------------------------
        $decoded = json_decode($rawBody, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            http_response_code(422);
            echo json_encode([
                'error'   => 'UnprocessableEntity',
                'message' => 'Request body is not valid JSON: ' . json_last_error_msg(),
            ]);
            return;
        }

        // ---- 422 — must be a JSON array ------------------------------------------
        // DataLoader iterates the array; a top-level object or scalar would break loading.
        if (!is_array($decoded) || !array_is_list($decoded)) {
            http_response_code(422);
            echo json_encode([
                'error'   => 'UnprocessableEntity',
                'message' => 'Request body must be a JSON array of Feature/ConfigTable objects.',
            ]);
            return;
        }

        // ---- Persist (upsert) ----------------------------------------------------
        // Re-encode to normalise formatting (consistent unicode representation,
        // no extra whitespace, no control characters from the raw body).
        $normalizedJson = json_encode($decoded, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $now = time();

        // INSERT OR REPLACE atomically creates or overwrites the row.
        // This is safe because the primary key is `key`, not an auto-increment.
        $db->prepare('INSERT OR REPLACE INTO server_settings (key, value) VALUES (?, ?)')
           ->execute([self::KEY_GM_OVERRIDES, $normalizedJson]);

        Logger::info('ServerSettings', 'GmOverrides PUT', ['entities' => count($decoded)]);
        http_response_code(200);
        echo json_encode([
            'key'       => self::KEY_GM_OVERRIDES,
            'updatedAt' => $now,
        ]);
    }
}
