/**
 * @file src/routes/rules/+server.ts
 * @description SvelteKit server endpoint for auto-discovery of JSON rule source files.
 *
 * PURPOSE:
 *   Provides a real-time directory scan of `static/rules/` so content creators can
 *   drop a new `.json` file into a subdirectory and have it automatically discovered
 *   — no manual manifest maintenance required.
 *
 * USAGE BY THE DATALOADER:
 *   The DataLoader first tries `GET /rules` (this endpoint). If the server responds
 *   with a sorted file list, it uses that. If this endpoint is unavailable (e.g., in
 *   the Vitest test environment where there is no SvelteKit server), it falls back to
 *   `GET /rules/manifest.json`.
 *
 * EXCLUDED PATHS:
 *   - `manifest.json`       — static fallback manifest, not a rule file.
 *   - `test/` subdirectory  — unit-test fixtures only; MUST NOT be loaded in any
 *                             deployed or development session. The `test/` folder
 *                             contains `test_mock.json` and `test_override.json`
 *                             which are consumed exclusively by the Vitest test suite
 *                             via `manifest.json`. They are never part of a live campaign.
 *
 * LOADING ORDER:
 *   Files are returned sorted ALPHABETICALLY by their relative path (case-insensitive).
 *   This is the canonical override priority — files loaded later override files loaded
 *   earlier when entities share the same `id`.
 *
 *   ```
 *   static/rules/
 *     00_d20srd_core/          ← loaded first (lowest priority)
 *       00_d20srd_core_config_tables.json
 *       01_d20srd_core_races.json
 *       …
 *     50_homebrew/             ← loaded after core (higher priority)
 *       00_custom_feats.json
 *     90_campaign_overrides/   ← loaded last (highest file-level priority)
 *       00_custom_rules.json
 *     test/                    ← EXCLUDED — unit-test fixtures, never served
 *   ```
 *
 * RESPONSE FORMAT:
 *   ```json
 *   [
 *     "/rules/00_d20srd_core/00_d20srd_core_config_tables.json",
 *     "/rules/00_d20srd_core/01_d20srd_core_races.json",
 *     "/rules/50_homebrew/00_custom_feats.json"
 *   ]
 *   ```
 *
 * @see src/lib/engine/DataLoader.ts for the loadRuleSources() consumer.
 * @see static/rules/manifest.json for the test-environment fallback (includes test/).
 * @see ARCHITECTURE.md section 18 for file discovery and loading order specification.
 */

import { json } from '@sveltejs/kit';
import { readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { RequestHandler } from './$types';

// The rules directory path relative to the project root (where `static/` lives).
// `process.cwd()` returns the project root in SvelteKit's Node environment.
const RULES_DIR = join(process.cwd(), 'static', 'rules');

// URL prefix to prepend to each discovered file path.
// Files in `static/rules/` are served at `/rules/` in the browser.
const URL_PREFIX = '/rules';

/**
 * Names of directories under `static/rules/` that are never served to the app.
 *
 * `test/` contains unit-test fixtures (`test_mock.json`, `test_override.json`) that
 * are consumed exclusively by the Vitest test suite.  They MUST NOT be loaded in any
 * live or development session — they contain dummy data designed to exercise merge
 * semantics and would pollute a real campaign's entity cache.
 *
 * The `test/` files are still listed in `manifest.json` so that the DataLoader's
 * `manifest.json` fallback path (used when this SvelteKit endpoint is unavailable,
 * i.e., in the Vitest environment) can reach them.
 */
const EXCLUDED_DIRS = new Set(['test']);

/**
 * Names of root-level files that are never served as rule sources.
 *
 * `manifest.json` is the static fallback file-list used by the DataLoader when
 * this endpoint is unavailable; it is not itself a rule file.
 */
const EXCLUDED_FILES = new Set(['manifest.json']);

/**
 * Recursively walks a directory and collects all `.json` rule file paths.
 *
 * Skips any directory whose name appears in `EXCLUDED_DIRS` (currently `test/`)
 * and any root-level file whose name appears in `EXCLUDED_FILES` (currently
 * `manifest.json`).
 *
 * ALPHABETICAL SORT:
 *   Each directory's entries are sorted before recursion so the final list
 *   reflects the intended loading order (numeric prefixes give deterministic priority).
 *
 * @param dir - Absolute path to the directory to scan.
 * @returns Sorted array of absolute file paths to `.json` rule files.
 */
async function collectJsonFiles(dir: string): Promise<string[]> {
  const files: string[] = [];

  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    // Directory doesn't exist or isn't readable — return empty array.
    // This happens in environments where static/ isn't on disk (e.g., edge deployments).
    return [];
  }

  // Sort entries alphabetically, case-insensitive, for deterministic loading order.
  entries.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stats = await stat(fullPath);

    if (stats.isDirectory()) {
      // Skip the test/ subfolder entirely — it contains unit-test fixtures only.
      if (EXCLUDED_DIRS.has(entry)) continue;
      // Recurse into all other subdirectories.
      const subFiles = await collectJsonFiles(fullPath);
      files.push(...subFiles);
    } else if (entry.endsWith('.json') && !EXCLUDED_FILES.has(entry)) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * GET /rules — Returns a sorted list of rule source file URLs.
 *
 * Called by the DataLoader at application startup via:
 *   `fetch('/rules').then(r => r.json())`
 *
 * RESPONSE: 200 OK with JSON array of URL strings.
 * FALLBACK: Returns an empty array (not an error) if the rules directory is
 *   missing. This allows the DataLoader to gracefully degrade to `manifest.json`.
 *
 * CACHE HEADERS:
 *   Rule files change infrequently during development. We set a short cache
 *   (10 seconds) to prevent excessive filesystem scans during development while
 *   still reflecting new files quickly. In production, this would be longer.
 */
export const GET: RequestHandler = async () => {
  const absolutePaths = await collectJsonFiles(RULES_DIR);

  // Convert absolute filesystem paths to browser-accessible URL paths.
  // Example: /project/static/rules/00_srd_core/races.json → /rules/00_srd_core/races.json
  const urlPaths = absolutePaths.map(absPath => {
    const relativePath = relative(join(process.cwd(), 'static'), absPath);
    // Ensure forward slashes on all platforms (Windows uses backslashes)
    return URL_PREFIX + '/' + relativePath.replace(/\\/g, '/').replace(/^rules\//, '');
  });

  return json(urlPaths, {
    headers: {
      // Short cache during development; can be increased in production
      'Cache-Control': 'max-age=10, must-revalidate',
    },
  });
};
