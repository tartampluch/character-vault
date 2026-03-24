<?php
/**
 * @file api/controllers/GlobalRulesController.php
 * @description REST controller for the global (server-side) rule source file API.
 *
 * ENDPOINTS:
 *   GET    /api/global-rules             → list()
 *   GET    /api/global-rules/{filename}  → getFileContent($filename)
 *   PUT    /api/global-rules/{filename}  → put($filename)
 *   DELETE /api/global-rules/{filename}  → delete($filename)
 *
 * PURPOSE:
 *   Exposes a writable directory (`storage/rules/`) outside the web root so GMs
 *   can publish named JSON rule files that DataLoader injects into the resolution
 *   chain alongside the static `static/rules/` files.
 *
 * WHY OUTSIDE THE WEB ROOT?
 *   `storage/rules/` is not directly accessible via HTTP — PHP acts as the sole
 *   gateway. This prevents unauthenticated direct downloads and makes it safe to
 *   store files with arbitrary JSON content.
 *
 * LOAD ORDER:
 *   Files in `storage/rules/` participate in the same alphabetical filename sort
 *   as files in `static/rules/`. A file named `50_my_setting.json` loads after
 *   all `static/rules/` files whose names sort below "50_". Using numeric prefixes
 *   gives content creators deterministic control over override priority.
 *
 * FILENAME VALIDATION:
 *   Only lowercase alphanumeric characters, underscores, and hyphens are allowed
 *   (pattern `[0-9a-z_-]+\.json`). This prevents:
 *     - Directory traversal attacks  (no slashes, dots, `..`)
 *     - Shell-injection via filename  (no spaces, quotes, special characters)
 *     - Overwriting system files      (must end with `.json`)
 *
 * AUTHORISATION:
 *   list() and getFileContent() require any authenticated user — the DataLoader
 *   calls these for ALL users at app init, not just GMs.
 *   put() and delete() are GM-only (403 for authenticated non-GMs).
 *
 * @see ARCHITECTURE.md §21.1.2 for the full specification.
 * @see api/controllers/RulesController.php for the read-only static file discovery.
 * @see src/lib/engine/DataLoader.ts for the client-side resolution chain.
 */

declare(strict_types=1);

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../auth.php';

class GlobalRulesController
{
    // ============================================================
    // CONSTANTS
    // ============================================================

    /**
     * Absolute path to the writable global rule sources directory.
     *
     * WHY `storage/rules/` AND NOT `static/rules/`?
     *   `static/` is served by Vite/SvelteKit directly in development and bundled
     *   into the artifact in production — it is effectively read-only at runtime.
     *   `storage/` is a runtime-writable directory that lives outside the web root
     *   (the web root is the SvelteKit build output, not the project root).
     *   The PHP CLI router (run.sh) and the Apache .htaccess both serve only the
     *   SvelteKit `build/` directory, so `storage/` is unreachable directly via HTTP.
     */
    private const STORAGE_DIR = __DIR__ . '/../../storage/rules/';

    /**
     * Maximum allowed request body in bytes (2 MiB).
     * Matches the campaign-scope homebrew endpoint (21.1.1) for consistency.
     */
    private const MAX_BYTES = 2 * 1024 * 1024;

    /**
     * Regex pattern that a filename must fully match.
     * Permits only lowercase letters, digits, hyphens, underscores, and the
     * `.json` extension — ruling out traversal sequences and special characters.
     */
    private const VALID_FILENAME_PATTERN = '/^[0-9a-z_-]+\.json$/';

    // ============================================================
    // GET /api/global-rules
    // ============================================================

    /**
     * Lists all `.json` files in `storage/rules/`, sorted alphabetically.
     *
     * AUTHORISATION: Any authenticated user.
     *   The DataLoader calls `GET /api/global-rules` during app initialization for ALL
     *   users (not only GMs), because all users need the complete rule set loaded.
     *
     * RESPONSE (200):
     *   [
     *     { "filename": "50_setting.json", "bytes": 4096 },
     *     ...
     *   ]
     *
     *   Returns an empty array when the directory is empty or does not yet exist.
     *
     * WHY BYTES AND NOT ENTITY COUNT?
     *   The file content is not parsed here — parsing would add server load on every
     *   list request and is unnecessary for the GM's management UI. The byte size is
     *   cheap to obtain via `filesize()` and is useful for the UI to warn about large
     *   files before downloading them.
     */
    public static function list(): void
    {
        requireAuth();

        $dir = self::STORAGE_DIR;

        // Directory may not have been created yet on a fresh installation.
        if (!is_dir($dir)) {
            http_response_code(200);
            echo json_encode([]);
            return;
        }

        $files = [];

        foreach (scandir($dir) as $entry) {
            // Skip directory entries and any non-JSON files (e.g., .gitkeep).
            if (!preg_match(self::VALID_FILENAME_PATTERN, $entry)) {
                continue;
            }

            $fullPath = $dir . $entry;

            // Only list regular files, not symlinks or directories named *.json.
            if (!is_file($fullPath)) {
                continue;
            }

            $files[] = [
                'filename' => $entry,
                'bytes'    => (int)filesize($fullPath),
            ];
        }

        // Sort by filename so the list respects the same alphabetical load order
        // that DataLoader uses when merging rules.
        usort($files, fn($a, $b) => strcasecmp($a['filename'], $b['filename']));

        http_response_code(200);
        echo json_encode($files);
    }

    // ============================================================
    // GET /api/global-rules/{filename}
    // ============================================================

    /**
     * Returns the full JSON content of a named global rule file.
     *
     * AUTHORISATION: Any authenticated user.
     *   The DataLoader fetches each file's content during app initialization for ALL
     *   users; restricting this to GMs would prevent rule loading for players.
     *
     * RESPONSE (200):
     *   The raw JSON array stored in the file, with `Content-Type: application/json`.
     *
     * SECURITY:
     *   Filename is validated against the same strict pattern used by put() and
     *   delete() — this prevents directory traversal (no `..`, slashes, spaces).
     *   The file is read only from `STORAGE_DIR`; no other path is reachable.
     *
     * @param string $filename  The validated filename segment from the URL.
     */
    public static function getFileContent(string $filename): void
    {
        requireAuth();

        // ---- 422 — filename validation -----------------------------------------------
        if (!preg_match(self::VALID_FILENAME_PATTERN, $filename)) {
            http_response_code(422);
            echo json_encode([
                'error'   => 'UnprocessableEntity',
                'message' => "Filename '{$filename}' is invalid. "
                           . 'Only lowercase letters, digits, hyphens, and underscores are allowed, '
                           . 'and the name must end with .json.',
            ]);
            return;
        }

        $targetPath = self::STORAGE_DIR . $filename;

        // ---- 404 — file must exist ---------------------------------------------------
        if (!is_file($targetPath)) {
            http_response_code(404);
            echo json_encode([
                'error'   => 'NotFound',
                'message' => "Global rule file '{$filename}' does not exist.",
            ]);
            return;
        }

        // ---- Read and serve ----------------------------------------------------------
        $content = @file_get_contents($targetPath);
        if ($content === false) {
            error_log('[GlobalRulesController] Failed to read: ' . $targetPath);
            http_response_code(500);
            echo json_encode([
                'error'   => 'ServerError',
                'message' => 'Could not read rule file from disk.',
            ]);
            return;
        }

        // Return the raw JSON content directly. The file was normalised when PUT
        // (via json_encode), so it is always valid JSON — we don't re-parse it here
        // to avoid unnecessary processing overhead.
        http_response_code(200);
        echo $content;
    }

    // ============================================================
    // PUT /api/global-rules/{filename}
    // ============================================================

    /**
     * Creates or fully replaces a named JSON rule file in `storage/rules/`.
     *
     * VALIDATION (in order — first failure wins):
     *   1. 422 — filename does not match `[0-9a-z_-]+\.json`
     *   2. 413 — Content-Length header exceeds 2 MB
     *   3. 413 — actual body exceeds 2 MB (after buffering)
     *   4. 422 — body is not valid JSON
     *   5. 422 — root JSON value is not an array  (DataLoader expects an array)
     *
     * SIDE EFFECT:
     *   Writes (or overwrites) `storage/rules/{filename}`.
     *   Creates the directory with mode 0755 if it does not exist.
     *
     *   The content is re-encoded from the parsed value to guarantee consistent
     *   JSON formatting (no trailing whitespace, no control characters from the
     *   raw body, deterministic unicode representation).
     *
     * RESPONSE (200):
     *   { "filename": "<filename>", "bytes": <byte_size> }
     *
     * @param string $filename  The validated filename segment from the URL.
     */
    public static function put(string $filename): void
    {
        requireGameMaster();

        // ---- 422 — filename validation -----------------------------------------------
        if (!preg_match(self::VALID_FILENAME_PATTERN, $filename)) {
            http_response_code(422);
            echo json_encode([
                'error'   => 'UnprocessableEntity',
                'message' => "Filename '{$filename}' is invalid. "
                           . 'Only lowercase letters, digits, hyphens, and underscores are allowed, '
                           . 'and the name must end with .json.',
            ]);
            return;
        }

        // ---- 413 — Content-Length fast gate ------------------------------------------
        $contentLength = isset($_SERVER['CONTENT_LENGTH']) ? (int)$_SERVER['CONTENT_LENGTH'] : 0;
        if ($contentLength > self::MAX_BYTES) {
            http_response_code(413);
            echo json_encode([
                'error'   => 'RequestTooLarge',
                'message' => 'Rule file payload must not exceed 2 MB.',
            ]);
            return;
        }

        // ---- Read body ---------------------------------------------------------------
        $rawBody = (string)file_get_contents('php://input');

        // ---- 413 — actual body size check -------------------------------------------
        if (strlen($rawBody) > self::MAX_BYTES) {
            http_response_code(413);
            echo json_encode([
                'error'   => 'RequestTooLarge',
                'message' => 'Rule file payload must not exceed 2 MB.',
            ]);
            return;
        }

        // ---- 422 — JSON validity -----------------------------------------------------
        $decoded = json_decode($rawBody, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            http_response_code(422);
            echo json_encode([
                'error'   => 'UnprocessableEntity',
                'message' => 'Request body is not valid JSON: ' . json_last_error_msg(),
            ]);
            return;
        }

        // ---- 422 — must be a JSON array (same constraint as 21.1.1) -----------------
        // DataLoader iterates over the array; a top-level object would silently break loading.
        if (!is_array($decoded) || !array_is_list($decoded)) {
            http_response_code(422);
            echo json_encode([
                'error'   => 'UnprocessableEntity',
                'message' => 'Request body must be a JSON array of Feature/ConfigTable objects.',
            ]);
            return;
        }

        // ---- Ensure storage directory exists ----------------------------------------
        $dir = self::STORAGE_DIR;
        if (!is_dir($dir)) {
            // mode 0755: owner can rwx, group/others can r-x — appropriate for web server use.
            if (!mkdir($dir, 0755, true)) {
                error_log('[GlobalRulesController] Failed to create directory: ' . $dir);
                http_response_code(500);
                echo json_encode([
                    'error'   => 'ServerError',
                    'message' => 'Could not create storage/rules/ directory.',
                ]);
                return;
            }
        }

        // ---- Persist ---------------------------------------------------------------
        // Re-encode to normalise formatting (no extra whitespace, no BOM, consistent escaping).
        $normalizedJson = json_encode($decoded, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
        $targetPath     = $dir . $filename;

        // Use an atomic write pattern: write to a temp file first, then rename.
        // This prevents DataLoader from reading a partially-written file if a concurrent
        // request reads the directory while we are still writing.
        $tmpPath = $targetPath . '.tmp.' . bin2hex(random_bytes(4));
        if (file_put_contents($tmpPath, $normalizedJson) === false) {
            @unlink($tmpPath);
            error_log('[GlobalRulesController] Failed to write temp file: ' . $tmpPath);
            http_response_code(500);
            echo json_encode([
                'error'   => 'ServerError',
                'message' => 'Could not write rule file to disk.',
            ]);
            return;
        }

        // rename() is atomic on POSIX systems (Linux/macOS shared hosting).
        if (!rename($tmpPath, $targetPath)) {
            @unlink($tmpPath);
            error_log('[GlobalRulesController] Failed to rename temp file: ' . $tmpPath . ' → ' . $targetPath);
            http_response_code(500);
            echo json_encode([
                'error'   => 'ServerError',
                'message' => 'Could not finalise rule file write.',
            ]);
            return;
        }

        http_response_code(200);
        echo json_encode([
            'filename' => $filename,
            'bytes'    => (int)filesize($targetPath),
        ]);
    }

    // ============================================================
    // DELETE /api/global-rules/{filename}
    // ============================================================

    /**
     * Deletes a named JSON rule file from `storage/rules/`.
     *
     * VALIDATION:
     *   - 422 if the filename is invalid (same pattern as PUT).
     *   - 404 if the file does not exist.
     *
     * RESPONSE (200):
     *   { "filename": "<filename>", "deleted": true }
     *
     * WHY ALLOW DELETING ANY MATCHING FILE VIA THE API?
     *   The GM authored these files through the same API — they have full ownership.
     *   There is no shared system of record that could be corrupted by deletion;
     *   the worst outcome is that a file disappears from the DataLoader chain and
     *   its entities revert to earlier sources or become absent.
     *
     * @param string $filename  The validated filename segment from the URL.
     */
    public static function delete(string $filename): void
    {
        requireGameMaster();

        // ---- 422 — filename validation -----------------------------------------------
        if (!preg_match(self::VALID_FILENAME_PATTERN, $filename)) {
            http_response_code(422);
            echo json_encode([
                'error'   => 'UnprocessableEntity',
                'message' => "Filename '{$filename}' is invalid. "
                           . 'Only lowercase letters, digits, hyphens, and underscores are allowed, '
                           . 'and the name must end with .json.',
            ]);
            return;
        }

        $targetPath = self::STORAGE_DIR . $filename;

        // ---- 404 — file must exist ---------------------------------------------------
        if (!is_file($targetPath)) {
            http_response_code(404);
            echo json_encode([
                'error'   => 'NotFound',
                'message' => "Global rule file '{$filename}' does not exist.",
            ]);
            return;
        }

        // ---- Delete -----------------------------------------------------------------
        if (!unlink($targetPath)) {
            error_log('[GlobalRulesController] Failed to delete: ' . $targetPath);
            http_response_code(500);
            echo json_encode([
                'error'   => 'ServerError',
                'message' => 'Could not delete rule file from disk.',
            ]);
            return;
        }

        http_response_code(200);
        echo json_encode(['filename' => $filename, 'deleted' => true]);
    }
}
