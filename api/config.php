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
 * ENVIRONMENT:
 *   The `APP_ENV` constant controls behaviour:
 *     - 'production': Real SQLite file, strict error handling, no debug output.
 *     - 'development': Real SQLite file, verbose error messages (safe for local dev).
 *     - 'test': In-memory SQLite (`sqlite::memory:`), used by PHPUnit tests.
 *       Detected automatically when the `APP_TESTING` environment variable is set.
 *
 * SECURITY:
 *   - The SQLite database file is stored OUTSIDE the web root in production.
 *   - The web server should deny direct access to /api/ path (configure .htaccess).
 *   - Never expose `config.php` to the public.
 *
 * @see api/Database.php for the PDO connection singleton.
 * @see ARCHITECTURE.md Phase 14.1 for the specification.
 */

declare(strict_types=1);

// ============================================================
// ENVIRONMENT DETECTION
// ============================================================

/**
 * Application environment.
 *
 * WHY NOT `.env` FILES?
 *   Shared hosting (OVH, etc.) often doesn't support .env file loading.
 *   Using a PHP constant is the most portable approach for this target.
 *   In production, change this to 'production' before deploying.
 *
 * Values: 'development' | 'production' | 'test'
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
 * PRODUCTION: Store OUTSIDE the web root.
 *   Example: '/var/lib/character-vault/database.sqlite'
 *   Never inside `public/`, `www/`, or any web-accessible directory.
 *
 * DEVELOPMENT: Store relative to the project root.
 *   The `.sqlite` extension is excluded from git via `.gitignore`.
 *
 * TEST: Ignored — in-memory DB is used instead.
 */
define('DB_PATH', APP_ENV === 'production'
    ? '/var/lib/character-vault/database.sqlite'       // Production: outside web root
    : __DIR__ . '/../database.sqlite'                   // Development: project root (gitignored)
);

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
 * PRODUCTION: Replace with your actual domain, e.g., 'https://yourvtt.example.com'.
 * Do NOT use '*' in production — it would allow any site to call your API.
 */
define('CORS_ALLOWED_ORIGINS', [
    'http://localhost:5173',    // SvelteKit dev server (default port)
    'http://localhost:4173',    // SvelteKit preview server
    'http://localhost:3000',    // Alternative dev server port
    'http://127.0.0.1:5173',   // Some systems use 127.0.0.1 instead of localhost
]);

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
