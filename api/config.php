<?php
/**
 * @file api/config.php
 * @description Application configuration for the Character Vault PHP backend.
 *
 * PURPOSE:
 *   Central configuration file for the REST API backend.
 *   Defines database path, environment mode, and application-wide constants.
 *
 * ARCHITECTURE:
 *   This backend is designed for cheap shared PHP hosting (e.g., OVH shared hosting).
 *   It uses SQLite as the sole database driver via PDO — no MySQL/PostgreSQL required.
 *   See ARCHITECTURE.md Phase 14.1 for the full specification.
 *
 * ENVIRONMENT VARIABLES:
 *   Variables are resolved with the following priority (highest to lowest):
 *     1. Server/process environment  (set by the web server, Docker, or the shell)
 *     2. .env file in the project root  (for shared hosting or simple local setups)
 *     3. Hard-coded defaults below  (safe fallback for zero-config development)
 *
 *   Supported variables:
 *     APP_ENV          'development' | 'production' | 'test'  (default: development)
 *     APP_TESTING      '1' when running PHPUnit (uses sqlite::memory:)
 *     DB_PATH          Absolute path to the SQLite file in production
 *                      (default: /var/lib/character-vault/database.sqlite)
 *     CORS_ORIGIN      Extra allowed CORS origin (e.g. https://yourdomain.com)
 *
 *   On shared hosting (OVH, etc.) where server-level env vars cannot be set,
 *   create a .env file at the project root (next to this api/ directory):
 *     APP_ENV=production
 *     DB_PATH=/home/user/private/cvault.sqlite
 *
 *   Never commit .env to version control — it is listed in .gitignore.
 *   Copy .env.example to .env and fill in your values.
 *
 * SECURITY:
 *   - The SQLite database file should be stored OUTSIDE the web root.
 *   - The web server should deny direct access to /api/ (see .htaccess).
 *   - Never expose config.php to the public.
 *
 * @see api/Database.php for the PDO connection singleton.
 * @see .env.example     for a documented template of all variables.
 * @see ARCHITECTURE.md Phase 14.1 for the specification.
 */

declare(strict_types=1);

// ============================================================
// .ENV LOADER
// ============================================================

/**
 * Loads a .env file and populates $_ENV / putenv() for variables that are
 * not already set in the process environment.
 *
 * Rules:
 *   - Lines starting with # are comments.
 *   - Empty lines are ignored.
 *   - Format: KEY=value  or  KEY="quoted value"
 *   - Existing environment variables are NEVER overridden (env wins over .env).
 *   - Quotes (single or double) around the value are stripped.
 *
 * @param string $path Absolute path to the .env file.
 */
function _loadDotEnv(string $path): void
{
    if (!is_file($path) || !is_readable($path)) {
        return;
    }

    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($lines === false) {
        return;
    }

    foreach ($lines as $line) {
        $line = trim($line);

        // Skip comments and invalid lines
        if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) {
            continue;
        }

        [$name, $value] = explode('=', $line, 2);
        $name  = trim($name);
        $value = trim($value);

        // Strip surrounding quotes
        if (
            strlen($value) >= 2
            && (($value[0] === '"'  && $value[-1] === '"')
             || ($value[0] === "'"  && $value[-1] === "'"))
        ) {
            $value = substr($value, 1, -1);
        }

        // Only set if not already defined in the process environment
        if ($name !== '' && getenv($name) === false) {
            putenv("{$name}={$value}");
            $_ENV[$name] = $value;
        }
    }
}

// Load .env from the project root (one level above api/).
// This is the right place for shared-hosting deployments where server-level
// environment variables cannot be configured.
_loadDotEnv(dirname(__DIR__) . '/.env');

// ============================================================
// ENVIRONMENT DETECTION
// ============================================================

/**
 * Application environment.
 *
 * Values: 'development' | 'production' | 'test'
 * Set via APP_ENV environment variable, .env file, or defaults to 'development'.
 */
define('APP_ENV', getenv('APP_ENV') ?: 'development');

/**
 * Whether the application is running unit tests (PHPUnit).
 * When true, the database uses `sqlite::memory:` (no file created).
 */
define('APP_TESTING', (bool)getenv('APP_TESTING'));

// ============================================================
// DATABASE CONFIGURATION
// ============================================================

/**
 * Path to the SQLite database file.
 *
 * Resolved from (highest to lowest priority):
 *   1. DB_PATH environment variable / .env entry
 *   2. Default per APP_ENV:
 *        production  → /var/lib/character-vault/database.sqlite  (outside web root)
 *        development → <project-root>/database.sqlite             (gitignored)
 *
 * On shared hosting, set DB_PATH in .env to a directory outside the web root:
 *   DB_PATH=/home/user/private/cvault.sqlite
 *
 * TEST: Ignored — in-memory DB is used when APP_TESTING=1.
 */
define('DB_PATH', (string)(getenv('DB_PATH') ?: (
    APP_ENV === 'production'
        ? '/var/lib/character-vault/database.sqlite'
        : __DIR__ . '/../database.sqlite'
)));

/**
 * SQLite DSN string.
 *
 * In test mode, uses `sqlite::memory:` so PHPUnit never touches the filesystem.
 * In all other modes, uses the file path defined in DB_PATH.
 *
 * WHY SQLITE?
 *   Shared hosting plans rarely offer MySQL/PostgreSQL with persistent connections.
 *   SQLite requires no server process, no separate credentials, and works perfectly
 *   for multi-table applications with moderate concurrency (a tabletop RPG session).
 *   Performance is excellent for < 100 simultaneous users.
 */
define('DB_DSN', APP_TESTING
    ? 'sqlite::memory:'
    : 'sqlite:' . DB_PATH
);

// ============================================================
// APPLICATION CONSTANTS
// ============================================================

/**
 * Current API version prefix for all endpoint URIs.
 * Example: GET /api/campaigns → served by api/controllers/CampaignController.php
 */
define('API_BASE_PATH', '/api');

/**
 * JWT / session token name used in cookies.
 * Using a non-standard name reduces collision risk with other PHP apps on shared hosting.
 */
define('SESSION_COOKIE_NAME', 'cvault_session');

/**
 * Password hashing cost factor for bcrypt (used by auth.php).
 * Higher cost = more secure but slower. 12 is the recommended minimum in 2024.
 */
define('PASSWORD_BCRYPT_COST', 12);

/**
 * Maximum number of failed login attempts before temporary lockout.
 * Rate limiting is implemented as a file-based counter (see api/middleware.php).
 */
define('MAX_LOGIN_ATTEMPTS', 5);

/**
 * Duration (in seconds) of rate-limiting lockout after MAX_LOGIN_ATTEMPTS.
 */
define('LOCKOUT_DURATION_SECONDS', 900); // 15 minutes

// ============================================================
// CORS CONFIGURATION
// ============================================================

/**
 * Allowed CORS origins.
 *
 * WHY ARRAY?
 *   In development, the SvelteKit dev server runs on a different port than PHP.
 *   The CORS middleware (api/middleware.php) checks if the `Origin` header matches
 *   one of these values and reflects it back in `Access-Control-Allow-Origin`.
 *
 * PRODUCTION: Set CORS_ORIGIN in server environment or .env:
 *   CORS_ORIGIN=https://yourvtt.example.com
 * Do NOT use '*' in production — it would allow any site to call your API.
 */
$_corsExtraOrigin = (string)(getenv('CORS_ORIGIN') ?: '');
define('CORS_ALLOWED_ORIGINS', array_filter(array_unique([
    'http://localhost:5173',    // SvelteKit dev server (default port)
    'http://localhost:4173',    // SvelteKit preview server
    'http://localhost:3000',    // Alternative dev server port
    'http://localhost:8080',    // run.sh / run-docker.sh local server
    'http://127.0.0.1:5173',   // Some systems use 127.0.0.1 instead of localhost
    'http://127.0.0.1:8080',   // run.sh on 127.0.0.1
    $_corsExtraOrigin,          // CORS_ORIGIN env var (e.g. production domain)
])));

/**
 * HTTP methods allowed by CORS preflight requests.
 */
define('CORS_ALLOWED_METHODS', ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']);

/**
 * HTTP headers allowed by CORS preflight requests.
 */
define('CORS_ALLOWED_HEADERS', ['Content-Type', 'Authorization', 'X-CSRF-Token']);

// ============================================================
// DEBUG / ERROR HANDLING
// ============================================================

if (APP_ENV === 'production') {
    // In production: hide all errors from users, log them server-side only
    error_reporting(0);
    ini_set('display_errors', '0');
    ini_set('log_errors', '1');
} else {
    // In development/test: show all errors (safe for local use only)
    error_reporting(E_ALL);
    ini_set('display_errors', '1');
}
