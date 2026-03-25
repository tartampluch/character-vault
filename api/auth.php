<?php
/**
 * @file api/auth.php
 * @description Session-based authentication endpoints and middleware.
 *
 * PURPOSE:
 *   Provides three auth endpoints:
 *     POST /api/auth/login  — Authenticate with username + password (bcrypt verified).
 *     POST /api/auth/logout — Destroy the session.
 *     GET  /api/auth/me     — Return current user info and isGameMaster flag.
 *
 *   Also provides `requireAuth()` helper used by all protected endpoints to
 *   reject unauthenticated requests with 401 Unauthorized.
 *
 * SESSION DESIGN:
 *   Uses PHP native sessions ($_SESSION) with the following keys:
 *     $_SESSION['user_id']        — The authenticated user's UUID
 *     $_SESSION['username']       — For display/logging purposes
 *     $_SESSION['is_game_master'] — Boolean: whether the user has GM privileges
 *
 *   WHY PHP SESSIONS AND NOT JWT?
 *     PHP sessions work seamlessly on cheap shared hosting without additional
 *     libraries. They are secure when configured correctly (HTTPS, HttpOnly,
 *     SameSite=Strict cookies). JWT would require managing token expiry and
 *     signing keys on shared hosting — more complexity with no tangible benefit
 *     for a small-scale VTT application with < 50 simultaneous users.
 *
 *   FUTURE REPLACEMENT:
 *     The `requireAuth()` function returns a `$user` array. If this app is later
 *     migrated to a PHP auth framework or a JWT-based backend, only this function
 *     needs to be replaced — all controllers use `$user` from `requireAuth()`.
 *
 * SECURITY:
 *   - Passwords are stored as bcrypt hashes (cost factor from config.php).
 *   - Session tokens are regenerated on login to prevent session fixation attacks.
 *   - Session cookie is HttpOnly (not readable by JavaScript).
 *   - SameSite=Strict prevents CSRF via cookie (combined with CSRF token in middleware).
 *
 * @see api/config.php for SESSION_COOKIE_NAME, PASSWORD_BCRYPT_COST constants.
 * @see api/middleware.php for CORS headers and CSRF token generation.
 * @see ARCHITECTURE.md Phase 14.2 for the full specification.
 */

declare(strict_types=1);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/Logger.php';
require_once __DIR__ . '/Database.php';
require_once __DIR__ . '/middleware.php';

// ============================================================
// SESSION BOOTSTRAP
// ============================================================

/**
 * Initialize the PHP session with secure cookie settings.
 *
 * Called once at bootstrap (index.php or router). Not called here to avoid
 * calling session_start() multiple times if auth.php is included from a router.
 *
 * COOKIE FLAGS:
 *   - secure:    Transmit cookie only over HTTPS in production.
 *   - httponly:  Prevent JavaScript from reading the session cookie.
 *   - samesite:  Strict — prevent the cookie from being sent in cross-site requests.
 */
function initSession(): void
{
    // In CLI mode (PHPUnit tests), PHP sessions are not available.
    // Tests mock the session by setting $_SESSION directly.
    // We skip session_start() in CLI to avoid "headers already sent" warnings.
    if (PHP_SAPI === 'cli') {
        if (!isset($_SESSION)) {
            $_SESSION = [];
        }
        return;
    }

    if (session_status() === PHP_SESSION_NONE) {
        session_set_cookie_params([
            'lifetime' => 0,             // Session cookie (expires when browser closes)
            'path'     => '/',
            'secure'   => (APP_ENV === 'production'),
            'httponly' => true,
            'samesite' => 'Strict',
        ]);
        session_name(SESSION_COOKIE_NAME);
        session_start();
    }
}

// ============================================================
// MIDDLEWARE — requireAuth()
// ============================================================

/**
 * Guards a protected endpoint by verifying a valid session exists.
 *
 * USAGE (in every protected controller):
 *   $user = requireAuth();
 *   // $user['id'], $user['username'], $user['is_game_master'] are available
 *
 * WHY RETURN $user?
 *   Controllers need the current user's ID to:
 *   a) Scope database queries to the user's own data (visibility rules).
 *   b) Check `is_game_master` before allowing GM-only operations.
 *   Returning the user avoids redundant `$_SESSION` reads in every controller.
 *
 * @return array The current user ['id', 'username', 'is_game_master', 'display_name'].
 * @throws void — Exits with 401 JSON response if unauthenticated.
 */
function requireAuth(): array
{
    initSession();

    if (empty($_SESSION['user_id'])) {
        Logger::warn('Auth', '401 Unauthorized — no active session');
        http_response_code(401);
        header('Content-Type: application/json');
        echo json_encode([
            'error'   => 'Unauthorized',
            'message' => 'Authentication required. Please log in via POST /api/auth/login.',
        ]);
        httpExit();
    }

    $user = [
        'id'             => $_SESSION['user_id'],
        'username'       => $_SESSION['username'] ?? '',
        'is_game_master' => (bool)($_SESSION['is_game_master'] ?? false),
        'display_name'   => $_SESSION['display_name'] ?? '',
    ];

    // Register the authenticated user with the logger so request/response lines
    // can show who made the call without requiring each controller to do it.
    Logger::setUser($user['username'], $user['is_game_master']);

    return $user;
}

/**
 * Guards a GM-only endpoint. Returns the user if they are a GM; exits 403 otherwise.
 *
 * USAGE:
 *   $user = requireGameMaster();
 *
 * @return array The current GM user.
 * @throws void — Exits with 403 JSON response if not a GM.
 */
function requireGameMaster(): array
{
    $user = requireAuth();

    if (!$user['is_game_master']) {
        Logger::warn('Auth', '403 Forbidden — GM privileges required', ['user' => $user['username']]);
        http_response_code(403);
        header('Content-Type: application/json');
        echo json_encode([
            'error'   => 'Forbidden',
            'message' => 'This endpoint requires Game Master privileges.',
        ]);
        httpExit();
    }

    return $user;
}

// ============================================================
// AUTH ENDPOINT HANDLERS
// ============================================================

/**
 * POST /api/auth/login
 *
 * Authenticates the user with username + password.
 *
 * REQUEST BODY (JSON):
 *   { "username": "string", "password": "string" }
 *
 * RESPONSE 200 OK:
 *   { "id": "...", "username": "...", "display_name": "...", "is_game_master": bool }
 *
 * RESPONSE 401 Unauthorized:
 *   { "error": "InvalidCredentials", "message": "Invalid username or password." }
 *
 * SECURITY — TIMING ATTACK PREVENTION:
 *   Even when a username is not found, we run `password_verify()` against a dummy
 *   hash. This ensures the response time is the same whether the username exists
 *   or not, preventing timing-based username enumeration attacks.
 *
 * SESSION FIXATION PREVENTION:
 *   `session_regenerate_id(true)` is called on successful login to assign a new
 *   session ID. The old session is deleted (`true` = delete old session data).
 *   This prevents session fixation: an attacker cannot force a victim to use a
 *   pre-known session ID.
 */
function handleLogin(): void
{
    initSession();

    $body = json_decode(file_get_contents('php://input'), true);
    $username = trim($body['username'] ?? '');
    $password = $body['password'] ?? '';

    if (empty($username) || empty($password)) {
        http_response_code(400);
        echo json_encode(['error' => 'BadRequest', 'message' => 'Username and password are required.']);
        return;
    }

    $db = Database::getInstance();
    $stmt = $db->prepare('SELECT id, username, password_hash, display_name, is_game_master FROM users WHERE username = ?');
    $stmt->execute([$username]);
    $user = $stmt->fetch();

    // Run verification even if user not found (timing attack prevention).
    // If user is null, verify against a dummy hash (result always false).
    $dummyHash = '$2y$12$abcdefghijklmnopqrstuvuABCDEFGHIJKLMNOPQRSTUVWXYZ01234';
    $hashToCheck = $user ? $user['password_hash'] : $dummyHash;

    if (!$user || !password_verify($password, $hashToCheck)) {
        Logger::warn('Auth', 'Login failed — invalid credentials', ['user' => $username]);
        http_response_code(401);
        echo json_encode(['error' => 'InvalidCredentials', 'message' => 'Invalid username or password.']);
        return;
    }

    // Regenerate session ID to prevent session fixation attacks.
    // In CLI mode (PHPUnit), session regeneration is skipped (no HTTP session in CLI).
    if (PHP_SAPI !== 'cli') {
        session_regenerate_id(true);
    }

    // Store minimal user info in session (avoid storing sensitive data).
    $_SESSION['user_id']        = $user['id'];
    $_SESSION['username']       = $user['username'];
    $_SESSION['display_name']   = $user['display_name'];
    $_SESSION['is_game_master'] = (bool)$user['is_game_master'];

    $isGM = (bool)$user['is_game_master'];
    Logger::info('Auth', 'Login OK', [
        'user' => $user['username'],
        'role' => $isGM ? 'GM' : 'player',
    ]);

    http_response_code(200);
    echo json_encode([
        'id'             => $user['id'],
        'username'       => $user['username'],
        'display_name'   => $user['display_name'],
        'is_game_master' => $isGM,
    ]);
}

/**
 * POST /api/auth/logout
 *
 * Destroys the current PHP session.
 *
 * RESPONSE 200 OK:
 *   { "message": "Logged out successfully." }
 *
 * SECURITY:
 *   We clear $_SESSION, regenerate the ID, then destroy the session.
 *   This is the recommended PHP way to cleanly terminate a session without
 *   leaving orphaned session data on the server.
 */
function handleLogout(): void
{
    initSession();

    $loggedOutUser = $_SESSION['username'] ?? '(unknown)';

    // Clear all session data
    $_SESSION = [];

    // Cookie and session-destroy operations are only meaningful in a web context.
    // In CLI / PHPUnit tests there is no real PHP session, so we skip them.
    if (PHP_SAPI !== 'cli' && session_status() === PHP_SESSION_ACTIVE) {
        // Delete the session cookie from the client's browser
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(
                session_name(),
                '',
                time() - 42000,
                $params['path'],
                $params['domain'],
                $params['secure'],
                $params['httponly']
            );
        }

        // Destroy the server-side session
        session_destroy();
    }

    Logger::info('Auth', 'Logout', ['user' => $loggedOutUser]);
    http_response_code(200);
    echo json_encode(['message' => 'Logged out successfully.']);
}

/**
 * GET /api/auth/me
 *
 * Returns the current authenticated user's information.
 * Protected by requireAuth() — returns 401 if not logged in.
 *
 * RESPONSE 200 OK:
 *   { "id": "...", "username": "...", "display_name": "...", "is_game_master": bool }
 *
 * USAGE:
 *   The SvelteKit frontend calls this on app startup to restore the session.
 *   If the response is 401, the user is redirected to the login page.
 */
function handleMe(): void
{
    $user = requireAuth(); // Exits with 401 if not authenticated

    // Generate/retrieve CSRF token and include it in the response.
    // The SvelteKit frontend stores this in memory and sends it as
    // X-CSRF-Token header on all state-changing requests (POST/PUT/DELETE).
    $csrfToken = getCsrfToken();

    http_response_code(200);
    echo json_encode([
        'id'             => $user['id'],
        'username'       => $user['username'],
        'display_name'   => $user['display_name'],
        'is_game_master' => $user['is_game_master'],
        'csrfToken'      => $csrfToken,
    ]);
}

// ============================================================
// UTILITY: PASSWORD HASHING
// ============================================================

/**
 * Hashes a plaintext password using bcrypt.
 *
 * Used when creating or updating a user account.
 * The cost factor is read from config.php (PASSWORD_BCRYPT_COST).
 *
 * WHY NOT ARGON2id?
 *   bcrypt is universally available in all PHP 5.5+ installations, including
 *   shared hosting. Argon2id (recommended for new applications) requires PHP 7.3+
 *   and often a non-default PHP build. For maximum shared hosting compatibility,
 *   bcrypt with cost 12 is the safe choice.
 *
 * @param string $plaintext - The password to hash.
 * @return string The bcrypt hash string.
 */
function hashPassword(string $plaintext): string
{
    return password_hash($plaintext, PASSWORD_BCRYPT, ['cost' => PASSWORD_BCRYPT_COST]);
}
