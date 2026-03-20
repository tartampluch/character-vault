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
     *   2. Filter for `.json` files only.
     *   3. Extract relative path (from static/rules/ as root).
     *   4. Sort alphabetically (case-insensitive).
     *   5. For each file, read the first entity's `ruleSource` field (or the
     *      top-level `_meta.ruleSource` if present).
     *   6. Count the number of Feature/ConfigTable entities in the file.
     *
     * PERFORMANCE:
     *   Reads the first JSON entity of each file only to extract ruleSource.
     *   Does NOT parse the entire file (avoids loading all rules on every request).
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

        $files = [];

        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($rulesDir, FilesystemIterator::SKIP_DOTS),
            RecursiveIteratorIterator::SELF_FIRST
        );

        foreach ($iterator as $file) {
            if (!$file->isFile() || $file->getExtension() !== 'json') {
                continue;
            }

            // Get path relative to rules dir (e.g., "00_srd_core/00_srd_core_races.json")
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
     * APPROACH:
     *   JSON parse the entire file but only read the first entity's
     *   ruleSource/tableId fields, plus count entities.
     *   This avoids implementing complex streaming JSON parsing for PHP.
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
        if (!is_array($data)) {
            return $default;
        }

        // Top-level metadata object (if present)
        if (isset($data['_meta'])) {
            return [
                'ruleSource'  => $data['_meta']['ruleSource'] ?? 'unknown',
                'entityCount' => count($data['entities'] ?? []),
                'description' => $data['_meta']['description'] ?? '',
            ];
        }

        // Array of entities (standard format)
        if (isset($data[0])) {
            $firstEntity = $data[0];
            return [
                'ruleSource'  => $firstEntity['ruleSource'] ?? ($firstEntity['tableId'] ? 'config_table' : 'unknown'),
                'entityCount' => count($data),
                'description' => '',
            ];
        }

        // Single entity (unusual but valid)
        if (isset($data['ruleSource'])) {
            return [
                'ruleSource'  => $data['ruleSource'],
                'entityCount' => 1,
                'description' => '',
            ];
        }

        // Config table format (has tableId)
        if (isset($data['tableId'])) {
            return [
                'ruleSource'  => $data['ruleSource'] ?? 'unknown',
                'entityCount' => 1,
                'description' => $data['description'] ?? '',
            ];
        }

        return $default;
    }
}
