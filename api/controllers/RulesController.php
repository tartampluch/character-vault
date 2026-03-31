<?php
/**
 * @file api/controllers/RulesController.php
 * @description REST controller for rule source file discovery and batch serving.
 *
 * ENDPOINTS:
 *   GET /api/rules/list  → Returns the sorted list of available JSON rule source files.
 *   GET /api/rules/batch → Returns ALL rule file contents in a single response with ETag.
 *
 * PURPOSE:
 *   The SvelteKit DataLoader reads rule sources from static/rules/ in dev mode.
 *   In production (served via PHP), it uses this endpoint to discover available files.
 *   The GM Settings UI (Phase 15.1) also uses this to display available rule sources.
 *
 * BATCH ENDPOINT:
 *   GET /api/rules/batch replaces the previous per-file fetch pattern. It returns
 *   every static (static/rules/) and global (storage/rules/) rule file in a single
 *   JSON payload with an ETag computed from the combined file modification times.
 *   The DataLoader sends an `If-None-Match` header on subsequent loads — the server
 *   returns 304 Not Modified when nothing has changed, eliminating redundant transfers.
 *
 * FILE DISCOVERY (list endpoint):
 *   Scans `static/rules/` recursively for `.json` files.
 *   Returns them in alphabetical order (by full relative path).
 *   WHY ALPHABETICAL? Loading order = override priority (last file wins).
 *   Numeric prefixes in filenames give content creators deterministic control.
 *
 * RESPONSE FORMAT (list endpoint):
 *   [
 *     {
 *       "path": "00_srd_core/00_srd_core_races.json",
 *       "ruleSource": "srd_core",
 *       "entityCount": 12
 *     },
 *     ...
 *   ]
 *
 * @see ARCHITECTURE.md Phase 18.1 for the file discovery specification.
 * @see ARCHITECTURE.md Phase 14.5 for the API endpoint specification.
 */

declare(strict_types=1);

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../auth.php';

class RulesController
{
    /**
     * The root directory containing all static rule source files.
     * Must be accessible from the PHP process.
     */
    private const RULES_DIR = __DIR__ . '/../../static/rules/';

    /**
     * Default path to the GM-uploaded global rule files (storage/rules/).
     * Intentionally outside the web root — only accessible via PHP.
     * Mirrors GlobalRulesController::STORAGE_DIR.
     *
     * Tests override this by setting the GLOBAL_RULES_DIR environment variable
     * (same convention as GlobalRulesController), so they never touch the real directory.
     */
    private const GLOBAL_RULES_DIR = __DIR__ . '/../../storage/rules/';

    /**
     * Returns the resolved global rule sources directory path (with trailing slash).
     *
     * Resolution order:
     *   1. GLOBAL_RULES_DIR environment variable (set by tests for isolation).
     *   2. GLOBAL_RULES_DIR constant (the default production path).
     *
     * Mirrors GlobalRulesController::storageDir() — any change to the env var
     * convention there must be reflected here.
     */
    private static function resolveGlobalDir(): string
    {
        $envDir = getenv('GLOBAL_RULES_DIR');
        if ($envDir !== false && $envDir !== '') {
            return rtrim($envDir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR;
        }
        return self::GLOBAL_RULES_DIR;
    }

    // ============================================================
    // GET /api/rules/batch
    // ============================================================

    /**
     * Returns all static and global rule file contents in a single JSON response.
     *
     * AUTHENTICATION: Any authenticated user (DataLoader calls this at app init).
     *
     * ETAG / CONDITIONAL GET:
     *   The ETag is an MD5 of "scope:filename:mtime" strings for every rule file.
     *   When the client sends `If-None-Match: "<etag>"` and the files are unchanged,
     *   the server returns 304 Not Modified with an empty body — no data transfer.
     *
     * RESPONSE (200):
     *   {
     *     "etag": "<md5>",
     *     "staticFiles": {
     *       "00_d20srd_core/01_races.json": { "supportedLanguages": [...], "entities": [...] },
     *       ...
     *     },
     *     "globalFiles": {
     *       "50_custom.json": { "entities": [...] },
     *       ...
     *     }
     *   }
     *
     * RESPONSE (304): Empty body when If-None-Match matches the computed ETag.
     *
     * WHY RETURN ALL FILES?
     *   The `enabledFilePaths` filter is campaign-specific (set by the GM) and
     *   known only to the client. Returning all files lets the DataLoader apply
     *   the same filter locally, while keeping the ETag stable regardless of which
     *   sources a given campaign has enabled.
     *
     * FILE ORDER:
     *   Files are sorted alphabetically within each group (static and global).
     *   The DataLoader re-sorts them on the client side for safety.
     */
    public static function batch(): void
    {
        requireAuth();

        $etag = self::computeRulesHash();

        // Check conditional request
        $clientEtag = trim($_SERVER['HTTP_IF_NONE_MATCH'] ?? '', '"');
        header('ETag: "' . $etag . '"');
        header('Cache-Control: no-cache, must-revalidate');

        if ($clientEtag === $etag) {
            http_response_code(304);
            return;
        }

        // Build static files map (relative path → parsed wrapper)
        $staticFiles = [];
        foreach (self::listStaticFilePaths() as $relativePath => $fullPath) {
            $content = @file_get_contents($fullPath);
            if ($content === false) continue;
            $parsed = @json_decode($content, true);
            if (!is_array($parsed)) continue;
            $staticFiles[$relativePath] = $parsed;
        }

        // Build global files map (filename → parsed wrapper)
        $globalFiles = [];
        $globalDir = self::resolveGlobalDir();
        if (is_dir($globalDir)) {
            $entries = scandir($globalDir);
            if ($entries !== false) {
                usort($entries, fn($a, $b) => strcasecmp($a, $b));
                foreach ($entries as $entry) {
                    if (!preg_match('/^[0-9a-z_-]+\.json$/', $entry)) continue;
                    $fullPath = $globalDir . $entry;
                    if (!is_file($fullPath)) continue;
                    $content = @file_get_contents($fullPath);
                    if ($content === false) continue;
                    $parsed = @json_decode($content, true);
                    if (!is_array($parsed)) continue;
                    $globalFiles[$entry] = $parsed;
                }
            }
        }

        http_response_code(200);
        echo json_encode([
            'etag'        => $etag,
            'staticFiles' => $staticFiles ?: (object)[],
            'globalFiles' => $globalFiles ?: (object)[],
        ]);
    }

    // ============================================================
    // SHARED HELPERS
    // ============================================================

    /**
     * Computes a hash of all rule file modification times.
     *
     * Used by batch() for ETag generation and by CampaignController::syncStatus()
     * to include a `rulesHash` field so the polling mechanism can detect when
     * a GM uploads or deletes a rule file.
     *
     * The hash changes whenever any file in static/rules/ or storage/rules/ is
     * added, removed, or modified. Filename + scope + mtime are concatenated and
     * sorted before hashing to guarantee a stable, order-independent value.
     *
     * @return string  A 32-character lowercase hexadecimal MD5 string.
     */
    public static function computeRulesHash(): string
    {
        $parts = [];

        // Static files
        foreach (self::listStaticFilePaths() as $relativePath => $fullPath) {
            $mtime = @filemtime($fullPath) ?: 0;
            $parts[] = 'static:' . $relativePath . ':' . $mtime;
        }

        // Global files
        $globalDir = self::resolveGlobalDir();
        if (is_dir($globalDir)) {
            foreach (scandir($globalDir) as $entry) {
                if (!preg_match('/^[0-9a-z_-]+\.json$/', $entry)) continue;
                $fullPath = $globalDir . $entry;
                if (!is_file($fullPath)) continue;
                $mtime = @filemtime($fullPath) ?: 0;
                $parts[] = 'global:' . $entry . ':' . $mtime;
            }
        }

        sort($parts);
        return md5(implode(',', $parts));
    }

    /**
     * Returns all JSON rule file paths in static/rules/, sorted alphabetically.
     *
     * @return array<string, string>  relativePath → absolute filesystem path.
     */
    private static function listStaticFilePaths(): array
    {
        $rulesDir = self::RULES_DIR;
        if (!is_dir($rulesDir)) return [];

        $excludedDirs  = ['test'];
        $excludedFiles = ['manifest.json'];
        $result        = [];

        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($rulesDir, FilesystemIterator::SKIP_DOTS),
            RecursiveIteratorIterator::SELF_FIRST
        );

        foreach ($iterator as $file) {
            if (!$file->isFile() || $file->getExtension() !== 'json') continue;
            $parentDir = basename($file->getPath());
            if (in_array($parentDir, $excludedDirs, true)) continue;
            if (in_array($file->getFilename(), $excludedFiles, true)) continue;

            $relativePath = str_replace([$rulesDir, '\\'], ['', '/'], $file->getPathname());
            $result[$relativePath] = $file->getPathname();
        }

        ksort($result, SORT_STRING | SORT_FLAG_CASE);
        return $result;
    }

    // ============================================================
    // GET /api/rules/list
    // ============================================================

    /**
     * Returns a sorted list of all available JSON rule source files.
     *
     * AUTHENTICATION:
     *   Requires authentication (all authenticated users can read rule sources).
     *   The DataLoader uses this endpoint — it's called during app init.
     *
     * FILE DISCOVERY ALGORITHM:
     *   1. Use RecursiveDirectoryIterator to scan all subdirectories.
     *   2. Skip the `test/` subdirectory entirely (unit-test fixtures, not for deployment).
     *   3. Skip `manifest.json` at the root (static fallback list, not a rule file).
     *   4. Filter for `.json` files only.
     *   5. Extract relative path (from static/rules/ as root).
     *   6. Sort alphabetically (case-insensitive).
     *   7. For each file, read `ruleSource` and count entities via extractFileMeta().
     *
     * EXCLUDED PATHS:
     *   - `test/` subdirectory: contains unit-test fixtures (`test_mock.json`,
     *     `test_override.json`) used exclusively by the Vitest test suite. These files
     *     must never appear in a live campaign. They are still listed in `manifest.json`
     *     so the DataLoader can reach them in the test environment (where this PHP
     *     endpoint is unavailable).
     *   - `manifest.json`: the static fallback file-list itself, not a rule source.
     *
     * PERFORMANCE:
     *   Reads the JSON wrapper of each file to extract ruleSource and entityCount.
     *   The DataLoader caches the full parse in memory after the first load.
     */
    public static function list(): void
    {
        requireAuth();

        $rulesDir = self::RULES_DIR;

        if (!is_dir($rulesDir)) {
            http_response_code(200);
            echo json_encode([]);
            return;
        }

        // Directory names (relative to $rulesDir) that must never be served.
        // 'test' contains unit-test fixtures only — excluded from all deployments.
        $excludedDirs  = ['test'];

        // Root-level file names that are not rule sources.
        $excludedFiles = ['manifest.json'];

        $files = [];

        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($rulesDir, FilesystemIterator::SKIP_DOTS),
            RecursiveIteratorIterator::SELF_FIRST
        );

        foreach ($iterator as $file) {
            if (!$file->isFile() || $file->getExtension() !== 'json') {
                continue;
            }

            // Skip any file whose immediate parent directory is in the excluded list.
            // This catches test/test_mock.json, test/test_override.json, etc.
            $parentDir = basename($file->getPath());
            if (in_array($parentDir, $excludedDirs, true)) {
                continue;
            }

            // Skip excluded root-level files (manifest.json).
            if (in_array($file->getFilename(), $excludedFiles, true)) {
                continue;
            }

            // Get path relative to rules dir (e.g., "00_d20srd_core/01_d20srd_core_races.json")
            $relativePath = str_replace(
                [$rulesDir, '\\'],
                ['', '/'],
                $file->getPathname()
            );

            $files[] = $relativePath;
        }

        // Sort alphabetically (case-insensitive), per ARCHITECTURE.md section 18.1
        usort($files, fn($a, $b) => strcasecmp($a, $b));

        // Build response with metadata for each file
        $result = [];
        foreach ($files as $relativePath) {
            $fullPath = $rulesDir . $relativePath;
            $meta = self::extractFileMeta($fullPath);

            $result[] = [
                'path'        => $relativePath,
                'ruleSource'  => $meta['ruleSource'],
                'entityCount' => $meta['entityCount'],
                'description' => $meta['description'],
            ];
        }

        http_response_code(200);
        echo json_encode($result);
    }

    /**
     * Extracts lightweight metadata from a JSON rule source file.
     *
     * FILE FORMAT:
     *   All rule files use the standard wrapper format:
     *     { "supportedLanguages": ["en", "fr"], "entities": [...] }
     *   ruleSource is read from the first entity inside "entities".
     *
     * RETURNS:
     *   ['ruleSource' => string, 'entityCount' => int, 'description' => string]
     */
    private static function extractFileMeta(string $filePath): array
    {
        $default = ['ruleSource' => 'unknown', 'entityCount' => 0, 'description' => ''];

        $content = @file_get_contents($filePath);
        if ($content === false) {
            return $default;
        }

        $data = @json_decode($content, true);
        if (!is_array($data) || !isset($data['entities']) || !is_array($data['entities'])) {
            return $default;
        }

        $entities    = $data['entities'];
        $firstEntity = $entities[0] ?? null;
        $ruleSource  = 'unknown';

        if ($firstEntity !== null) {
            if (isset($firstEntity['ruleSource'])) {
                $ruleSource = $firstEntity['ruleSource'];
            } elseif (isset($firstEntity['tableId'])) {
                $ruleSource = 'config_table';
            }
        }

        return [
            'ruleSource'  => $ruleSource,
            'entityCount' => count($entities),
            'description' => '',
        ];
    }
}
