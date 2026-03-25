<?php
/**
 * @file api/controllers/RulesController.php
 * @description REST controller for rule source file discovery.
 *
 * ENDPOINTS:
 *   GET /api/rules/list → Returns the sorted list of available JSON rule source files.
 *
 * PURPOSE:
 *   The SvelteKit DataLoader reads rule sources from static/rules/ in dev mode.
 *   In production (served via PHP), it uses this endpoint to discover available files.
 *   The GM Settings UI (Phase 15.1) also uses this to display available rule sources.
 *
 * FILE DISCOVERY:
 *   Scans `static/rules/` recursively for `.json` files.
 *   Returns them in alphabetical order (by full relative path).
 *   WHY ALPHABETICAL? Loading order = override priority (last file wins).
 *   Numeric prefixes in filenames give content creators deterministic control.
 *
 * RESPONSE FORMAT:
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
     * The root directory containing all rule source files.
     * Must be accessible from the PHP process.
     */
    private const RULES_DIR = __DIR__ . '/../../static/rules/';

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
