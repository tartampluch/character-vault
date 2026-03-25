<?php
/**
 * @file api/controllers/UiLocalesController.php
 * @description Locale discovery endpoint — returns metadata for all UI locale
 *              files found in static/locales/.
 *
 * ENDPOINT
 *   GET /api/locales
 *
 * RESPONSE
 *   JSON array of locale descriptors, one per file found:
 *   [
 *     { "code": "fr", "language": "Français", "unitSystem": "metric" },
 *     { "code": "de", "language": "Deutsch",  "unitSystem": "metric" },
 *     …
 *   ]
 *   The built-in English locale is intentionally excluded — it is always
 *   bundled in the frontend and never needs a fetch.
 *
 * HOW TO ADD A COMMUNITY LANGUAGE
 *   Drop a valid locale JSON file in static/locales/{code}.json.
 *   The file must contain a top-level "$meta" object with at least:
 *     { "code": "de", "language": "Deutsch", "unitSystem": "metric" }
 *   On the next page load, the language will appear in the dropdown.
 *   No code change or server restart is required.
 *
 * AUTHENTICATION
 *   Public — locale metadata is not sensitive. No requireAuth() call.
 *   The actual locale file (JSON) is served directly as a static asset
 *   from /locales/{code}.json, so this endpoint only provides discovery.
 */

declare(strict_types=1);

class UiLocalesController {

    /**
     * Absolute path to the directory containing locale JSON files.
     *
     * Defaults to static/locales/ relative to the project root.
     * Accepts an override in the constructor so tests can inject a temp
     * directory without touching the real static/ tree.
     */
    private string $localesDir;

    /**
     * @param string $localesDir  Override for tests; leave empty for production default.
     */
    public function __construct(string $localesDir = '') {
        $this->localesDir = $localesDir !== ''
            ? $localesDir
            : __DIR__ . '/../../static/locales';
    }

    /**
     * GET /api/locales
     *
     * Scans $localesDir for *.json files, reads their $meta block, and
     * returns an array of locale descriptors to the frontend.
     *
     * Files that cannot be read or are missing a valid $meta block are
     * silently skipped — a broken locale file should not crash the app.
     */
    public function index(): void {
        http_response_code(200);
        $locales = [];

        if (!is_dir($this->localesDir)) {
            // Directory doesn't exist yet — return empty list gracefully.
            echo json_encode($locales);
            return;
        }

        $files = glob($this->localesDir . '/*.json');
        if ($files === false) {
            echo json_encode($locales);
            return;
        }

        foreach ($files as $filePath) {
            $raw = @file_get_contents($filePath);
            if ($raw === false) continue;

            $data = json_decode($raw, true);
            if (!is_array($data)) continue;

            $meta = $data['$meta'] ?? null;
            if (!is_array($meta)) continue;

            $code       = $meta['code']       ?? null;
            $language   = $meta['language']   ?? null;
            $unitSystem = $meta['unitSystem'] ?? 'imperial';

            // Require at minimum a code and a display name.
            if (!is_string($code) || $code === '' || !is_string($language)) continue;

            // Skip English — it is always bundled in the frontend.
            if ($code === 'en') continue;

            // Validate unitSystem to one of the two known values.
            if ($unitSystem !== 'metric' && $unitSystem !== 'imperial') {
                $unitSystem = 'imperial';
            }

            $locales[] = [
                'code'       => $code,
                'language'   => $language,
                'unitSystem' => $unitSystem,
            ];
        }

        // Sort alphabetically by code for a stable dropdown order.
        usort($locales, fn($a, $b) => strcmp($a['code'], $b['code']));

        echo json_encode($locales);
    }
}
