/**
 * @file src/routes/rules/+server.ts
 * @description SvelteKit server endpoint for auto-discovery of JSON rule source files.
 *
 * PURPOSE:
 *   Replaces the static `manifest.json` approach with a real-time directory scan.
 *   Per ARCHITECTURE.md section 18.1: "The DataLoader scans this directory recursively
 *   and loads all `.json` files in alphabetical order."
 *
 *   WHY THIS IS NEEDED:
 *   Content creators (GMs and community modders) should be able to drop a new `.json`
 *   file into `static/rules/` and have it automatically discovered — no manual manifest
 *   maintenance required. This is the "Open Content Ecosystem" promise from
 *   ARCHITECTURE.md section 1.
 *
 * USAGE BY THE DATALOADER:
 *   The DataLoader first tries `GET /rules` (this endpoint). If the server responds
 *   with a sorted file list, it uses that. If this endpoint is unavailable (e.g., during
 *   static builds or testing), it falls back to `GET /rules/manifest.json`.
 *
 * LOADING ORDER:
 *   Files are returned sorted ALPHABETICALLY by their relative path (case-insensitive).
 *   This is the canonical override priority: files loaded later override files loaded
 *   earlier when entities share the same `id` (for `merge: "replace"` semantics).
 *
 *   Naming convention (from ARCHITECTURE.md section 18.1):
 *   ```
 *   static/rules/
 *     00_srd_core/             ← loaded first (lowest priority)
 *       00_races.json
 *       01_classes.json
 *     50_homebrew/             ← loaded after core (higher priority)
 *       00_custom_feats.json
 *     90_campaign_overrides/   ← loaded last (highest file-level priority)
 *       00_custom_rules.json
 *   ```
 *
 * RESPONSE FORMAT:
 *   Returns a JSON array of URL paths (strings), ready to be fetched by the DataLoader.
 *   Example:
 *   ```json
 *   [
 *     "/rules/00_srd_core/00_races.json",
 *     "/rules/00_srd_core/01_classes.json",
 *     "/rules/50_homebrew/00_custom_feats.json"
 *   ]
 *   ```
 *
 * ENVIRONMENT:
 *   This endpoint runs on the SvelteKit NODE adapter server. The `static/` directory
 *   is served at the root URL `/` during development AND accessible via the filesystem
 *   at `./static/` relative to the project root.
 *
 *   In production (PHP + SvelteKit hybrid):
 *   The PHP backend provides `GET /api/rules/list` with the same response format (Phase 14).
 *   The DataLoader will be updated in Phase 14.6 to prefer the PHP API endpoint.
 *
 * @see src/lib/engine/DataLoader.ts for the loadRuleSources() consumer.
 * @see ARCHITECTURE.md section 18.1 for file discovery and loading order specification.
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
 * Recursively walks a directory and collects all `.json` file paths.
 *
 * WHY RECURSIVE?
 *   Rule source files are organised into subdirectories by source name
 *   (e.g., `00_srd_core/`, `50_homebrew/`). The engine must discover
 *   files across ALL subdirectory levels.
 *
 * ALPHABETICAL SORT:
 *   Each directory's entries are sorted before recursion. This guarantees that
 *   the final alphabetically-sorted list reflects the intended loading order
 *   (numeric prefixes like `00_`, `50_`, `90_` give deterministic priority).
 *
 * @param dir - Absolute path to the directory to scan.
 * @returns Sorted array of absolute file paths to `.json` files.
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
      // Recurse into subdirectory
      const subFiles = await collectJsonFiles(fullPath);
      files.push(...subFiles);
    } else if (entry.endsWith('.json') && !['manifest.json', 'test_mock.json', 'test_override.json'].includes(entry)) {
        // Exclude: manifest (meta-file), test_mock and test_override (test-suite only,
        // not intended for production/API use).
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
