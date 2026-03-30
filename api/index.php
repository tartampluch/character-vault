<?php
/**
 * @file api/index.php
 * @description Main entry point and URL router for the Character Vault PHP API.
 *
 * ROUTING TABLE:
 *   Auth:
 *     POST   /api/auth/login            → handleLogin()          (auth.php)
 *     POST   /api/auth/logout           → handleLogout()         (auth.php)
 *     GET    /api/auth/me               → handleMe()             (auth.php)
  *     PUT    /api/auth/setup-password   → handleSetupPassword()  (auth.php)
 *     PUT    /api/auth/change-password  → handleChangePassword() (auth.php)
 *     PUT    /api/auth/display-name     → handleUpdateDisplayName() (auth.php)
 *
 *   Campaigns:
 *     GET    /api/campaigns                               → CampaignController::index()
 *     POST   /api/campaigns                               → CampaignController::create()
 *     GET    /api/campaigns/{id}                          → CampaignController::show($id)
 *     PUT    /api/campaigns/{id}                          → CampaignController::update($id)
 *     GET    /api/campaigns/{id}/sync-status              → CampaignController::syncStatus($id)
 *     GET    /api/campaigns/{id}/homebrew-rules           → CampaignController::getHomebrewRules($id)
 *     PUT    /api/campaigns/{id}/homebrew-rules           → CampaignController::setHomebrewRules($id)
 *     GET    /api/campaigns/{id}/users                    → CampaignController::getUsers($id)
 *     POST   /api/campaigns/{id}/users                    → CampaignController::addUser($id)
 *     DELETE /api/campaigns/{id}/users/{userId}           → CampaignController::removeUser($id, $userId)
 *     GET    /api/campaigns/{id}/roster                   → CampaignController::getRoster($id)
 *     GET    /api/campaigns/{id}/characters              → CampaignController::getCharacters($id)
 *     GET    /api/campaigns/{id}/characters?all=1        → CampaignController::getCharacters($id)
 *     POST   /api/campaigns/{id}/characters              → CampaignController::addCharacters($id)
 *     DELETE /api/campaigns/{id}/characters/{charId}     → CampaignController::removeCharacter($id, $charId)
 *
 *   Characters:
 *     GET    /api/characters              → CharacterController::index()  (global: all/own)
 *     GET    /api/characters?campaignId=X → CharacterController::index()  (campaign-scoped)
 *     POST   /api/characters              → CharacterController::create()
 *     PUT    /api/characters/{id}         → CharacterController::update($id)
 *     PUT    /api/characters/{id}/gm-overrides → CharacterController::updateGmOverrides($id)
 *     DELETE /api/characters/{id}         → CharacterController::delete($id)
 *
 *   Rules:
 *     GET    /api/rules/list                    → RulesController::list()  (returns available source files)
 *
 *   Users (Phase 22.3 — admin-only):
 *     GET    /api/users                    → UserController::index()
 *     POST   /api/users                    → UserController::create()
 *     PUT    /api/users/{id}               → UserController::update($id)
 *     PUT    /api/users/{id}/role          → UserController::updateRole($id)
 *     POST   /api/users/{id}/suspend       → UserController::suspend($id)
 *     POST   /api/users/{id}/reinstate     → UserController::reinstate($id)
 *     POST   /api/users/{id}/reset-password → UserController::resetPassword($id)
 *     DELETE /api/users/{id}               → UserController::delete($id)
 *
 *   Global Rule Sources (Phase 21.1.2 + 21.1.3):
 *     GET    /api/global-rules                  → GlobalRulesController::list()
 *     GET    /api/global-rules/{filename}       → GlobalRulesController::getFileContent($filename)
 *     PUT    /api/global-rules/{filename}       → GlobalRulesController::put($filename)
 *     DELETE /api/global-rules/{filename}       → GlobalRulesController::delete($filename)
 *
 * MIDDLEWARE CALL ORDER:
 *   1. applyCorsHeaders()     — CORS (must be first to handle OPTIONS preflight)
 *   2. checkRateLimit()       — Global rate limiting
 *   3. initSession()          — Start PHP session
 *   4. route()                — Dispatch to the correct handler
 *     Inside route handlers:
 *       5. requireAuth()      — 401 if not authenticated (for protected endpoints)
 *       6. verifyCsrfToken()  — 403 if CSRF token missing (for POST/PUT/DELETE)
 *       7. Controller logic   — Business logic with ownership/GM verification
 *
 * @see api/auth.php            for auth handlers and requireAuth()
 * @see api/middleware.php      for CORS, CSRF, and rate limiting
 * @see api/controllers/        for campaign and character controllers
 * @see ARCHITECTURE.md Phase 14.5 for the full specification.
 */

declare(strict_types=1);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/Logger.php';
require_once __DIR__ . '/Database.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/middleware.php';
require_once __DIR__ . '/controllers/CampaignController.php';
require_once __DIR__ . '/controllers/CharacterController.php';
require_once __DIR__ . '/controllers/RulesController.php';
require_once __DIR__ . '/controllers/GlobalRulesController.php';
require_once __DIR__ . '/controllers/UiLocalesController.php';
require_once __DIR__ . '/controllers/UserController.php';

// ============================================================
// GLOBAL MIDDLEWARE
// ============================================================

// 1. CORS (must be before any output)
applyCorsHeaders();

// 2. Global rate limiting (60 requests per 60 seconds per IP)
checkRateLimit('global', 60, 60);

// 3. Set JSON content type for all responses
header('Content-Type: application/json');

// 4. Initialize session
initSession();

// ============================================================
// ROUTER
// ============================================================

$method = $_SERVER['REQUEST_METHOD'];
$uri    = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

// Strip the /api prefix from the URI for matching
$path = preg_replace('#^/api#', '', $uri);
$path = rtrim($path, '/') ?: '/';

// Parse path segments
$segments = array_values(array_filter(explode('/', $path)));

// Capture start time for response-timing logs.
$_requestStart = microtime(true);

// Log every request in dev mode.  The response line is written by a shutdown
// function so it fires after http_response_code() is finalised.
Logger::request($method, $path);
register_shutdown_function(function () use ($method, $path, $_requestStart): void {
    $status = http_response_code();
    Logger::response(is_int($status) ? $status : 200, $method, $path, $_requestStart);
});

// Route matching
try {
    // 5. Auto-run database migrations (idempotent — creates tables and adds missing columns).
    //    Runs inside the try/catch so any unexpected migration error returns a proper
    //    JSON 500 response instead of a bare PHP fatal error.
    //    The migration uses PRAGMA table_info() checks so it is a true no-op when
    //    the schema is already up to date (no ALTER TABLE attempted).
    Database::runMigrations(Database::getInstance());
    if ($path === '/auth/login' && $method === 'POST') {
        checkLoginRateLimit(); // Stricter limit for login
        handleLogin();

    } elseif ($path === '/auth/logout' && $method === 'POST') {
        // CSRF protection on logout prevents cross-site logout attacks
        // (an attacker forcing a player to log out during a game session)
        verifyCsrfToken();
        handleLogout();

    } elseif ($path === '/locales' && $method === 'GET') {
        // Public — no auth required (locale metadata is not sensitive)
        (new UiLocalesController())->index();

    } elseif ($path === '/auth/me' && $method === 'GET') {
        handleMe();

    } elseif ($path === '/auth/setup-password' && $method === 'PUT') {
        // First-login password activation. Requires auth + needs_password_setup session flag.
        verifyCsrfToken();
        handleSetupPassword();

    } elseif ($path === '/auth/change-password' && $method === 'PUT') {
        // Self-service password change for any authenticated user.
        // Requires current_password (unless account has no password yet).
        verifyCsrfToken();
        handleChangePassword();

    } elseif ($path === '/auth/display-name' && $method === 'PUT') {
        // Self-service display name update for any authenticated user.
        handleUpdateDisplayName();

    } elseif ($path === '/campaigns' && $method === 'GET') {
        CampaignController::index();

    } elseif ($path === '/campaigns' && $method === 'POST') {
        verifyCsrfToken();
        CampaignController::create();

    } elseif (preg_match('#^/campaigns/([^/]+)$#', $path, $m) && $method === 'GET') {
        CampaignController::show($m[1]);

    } elseif (preg_match('#^/campaigns/([^/]+)$#', $path, $m) && $method === 'PUT') {
        verifyCsrfToken();
        CampaignController::update($m[1]);

    } elseif (preg_match('#^/campaigns/([^/]+)/sync-status$#', $path, $m) && $method === 'GET') {
        CampaignController::syncStatus($m[1]);

    } elseif (preg_match('#^/campaigns/([^/]+)/homebrew-rules$#', $path, $m) && $method === 'GET') {
        // Homebrew rules are readable by any authenticated user in the campaign.
        // No CSRF token needed for GET requests.
        CampaignController::getHomebrewRules($m[1]);

    } elseif (preg_match('#^/campaigns/([^/]+)/homebrew-rules$#', $path, $m) && $method === 'PUT') {
        // CSRF protection required: this mutates DB state and is GM-only.
        verifyCsrfToken();
        CampaignController::setHomebrewRules($m[1]);

    // ── Campaign membership (Phase 22.4 — GM+Admin) ──────────────────────────
    // These routes must be matched BEFORE the bare /campaigns/{id} patterns to
    // avoid the {id} segment swallowing the /users sub-path.
    } elseif (preg_match('#^/campaigns/([^/]+)/users$#', $path, $m) && $method === 'GET') {
        CampaignController::getUsers($m[1]);

    } elseif (preg_match('#^/campaigns/([^/]+)/users$#', $path, $m) && $method === 'POST') {
        verifyCsrfToken();
        CampaignController::addUser($m[1]);

    } elseif (preg_match('#^/campaigns/([^/]+)/users/([^/]+)$#', $path, $m) && $method === 'DELETE') {
        verifyCsrfToken();
        CampaignController::removeUser($m[1], $m[2]);

    } elseif (preg_match('#^/campaigns/([^/]+)/roster$#', $path, $m) && $method === 'GET') {
        // Party roster — accessible to any campaign member (and GMs).
        // Returns player names + non-NPC character names/levels only; no stats.
        CampaignController::getRoster($m[1]);

    // ── Campaign character enrollment (GM+Admin) ──────────────────────────────
    // Must be matched BEFORE the bare /campaigns/{id} patterns.
    } elseif (preg_match('#^/campaigns/([^/]+)/characters$#', $path, $m) && $method === 'GET') {
        CampaignController::getCharacters($m[1]);

    } elseif (preg_match('#^/campaigns/([^/]+)/characters$#', $path, $m) && $method === 'POST') {
        verifyCsrfToken();
        CampaignController::addCharacters($m[1]);

    } elseif (preg_match('#^/campaigns/([^/]+)/characters/([^/]+)$#', $path, $m) && $method === 'DELETE') {
        verifyCsrfToken();
        CampaignController::removeCharacter($m[1], $m[2]);

    } elseif ($path === '/characters' && $method === 'GET') {
        CharacterController::index();

    } elseif ($path === '/characters' && $method === 'POST') {
        verifyCsrfToken();
        CharacterController::create();

    } elseif (preg_match('#^/characters/([^/]+)$#', $path, $m) && $method === 'PUT') {
        verifyCsrfToken();
        CharacterController::update($m[1]);

    } elseif (preg_match('#^/characters/([^/]+)/gm-overrides$#', $path, $m) && $method === 'PUT') {
        verifyCsrfToken();
        CharacterController::updateGmOverrides($m[1]);

    } elseif (preg_match('#^/characters/([^/]+)$#', $path, $m) && $method === 'DELETE') {
        verifyCsrfToken();
        CharacterController::delete($m[1]);

    } elseif ($path === '/rules/list' && $method === 'GET') {
        RulesController::list();

    } elseif ($path === '/global-rules' && $method === 'GET') {
        // Lists all *.json files in storage/rules/ with filename + byte size.
        // Accessible by all authenticated users — DataLoader calls this at app init.
        GlobalRulesController::list();

    } elseif (preg_match('#^/global-rules/([^/]+)$#', $path, $m) && $method === 'GET') {
        // Serves the raw JSON content of a named global rule file.
        // Accessible by all authenticated users — DataLoader fetches file content for all users.
        GlobalRulesController::getFileContent($m[1]);

    } elseif (preg_match('#^/global-rules/([^/]+)$#', $path, $m) && $method === 'PUT') {
        // Creates or replaces a named rule file in storage/rules/.
        // Filename is validated inside the controller (422 on bad name, 413 on size, 422 on bad JSON).
        verifyCsrfToken();
        GlobalRulesController::put($m[1]);

    } elseif (preg_match('#^/global-rules/([^/]+)$#', $path, $m) && $method === 'DELETE') {
        // Removes a named rule file from storage/rules/.
        verifyCsrfToken();
        GlobalRulesController::delete($m[1]);

    // ── User Management (Phase 22.3 — admin-only) ────────────────────────────
    } elseif ($path === '/users' && $method === 'GET') {
        UserController::index();

    } elseif ($path === '/users' && $method === 'POST') {
        verifyCsrfToken();
        UserController::create();

    } elseif (preg_match('#^/users/([^/]+)/role$#', $path, $m) && $method === 'PUT') {
        // Must be matched before the bare /users/{id} PUT to avoid route shadowing.
        verifyCsrfToken();
        UserController::updateRole($m[1]);

    } elseif (preg_match('#^/users/([^/]+)/suspend$#', $path, $m) && $method === 'POST') {
        verifyCsrfToken();
        UserController::suspend($m[1]);

    } elseif (preg_match('#^/users/([^/]+)/reinstate$#', $path, $m) && $method === 'POST') {
        verifyCsrfToken();
        UserController::reinstate($m[1]);

    } elseif (preg_match('#^/users/([^/]+)$#', $path, $m) && $method === 'PUT') {
        verifyCsrfToken();
        UserController::update($m[1]);

    } elseif (preg_match('#^/users/([^/]+)/reset-password$#', $path, $m) && $method === 'POST') {
        verifyCsrfToken();
        UserController::resetPassword($m[1]);

    } elseif (preg_match('#^/users/([^/]+)$#', $path, $m) && $method === 'DELETE') {
        verifyCsrfToken();
        UserController::delete($m[1]);

    } else {
        http_response_code(404);
        echo json_encode(['error' => 'NotFound', 'message' => "Endpoint {$method} {$path} not found."]);
    }
} catch (\PDOException $e) {
    $msg = $e->getMessage();
    error_log('[CharacterVault API] PDOException: ' . $msg);
    Logger::error('DB', $msg, ['code' => $e->getCode()]);
    http_response_code(500);
    echo json_encode([
        'error'   => 'DatabaseError',
        'message' => APP_ENV === 'development' ? $msg : 'An internal database error occurred.',
    ]);
} catch (\Exception $e) {
    $msg = $e->getMessage();
    error_log('[CharacterVault API] Exception: ' . $msg);
    Logger::error('Server', $msg, ['class' => get_class($e)]);
    http_response_code(500);
    echo json_encode([
        'error'   => 'ServerError',
        'message' => APP_ENV === 'development' ? $msg : 'An internal server error occurred.',
    ]);
}
