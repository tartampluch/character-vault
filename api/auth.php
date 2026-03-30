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
 *     $_SESSION['role']           — User role: 'admin' | 'gm' | 'player'
 *     $_SESSION['is_game_master'] — Derived boolean: true when role is 'gm' or 'admin'
 *                                   (kept for backward compatibility with controllers)
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
 * @return array The current user ['id', 'username', 'role', 'is_game_master', 'display_name'].
 *              'is_game_master' is DERIVED from 'role' (true when role is 'gm' or 'admin').
 *              All existing controllers continue to use 'is_game_master' unchanged.
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

    // Derive is_game_master from role so all existing controllers remain unchanged.
    // Both 'gm' and 'admin' have full game-master privileges.
    $role           = $_SESSION['role'] ?? 'player';
    $isGameMaster   = in_array($role, ['gm', 'admin'], true);

    $user = [
        'id'             => $_SESSION['user_id'],
        'username'       => $_SESSION['username'] ?? '',
        'display_name'   => $_SESSION['display_name'] ?? '',
        'role'           => $role,
        // Derived for backward compatibility — controllers may use either field.
        'is_game_master' => $isGameMaster,
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

    // Both 'gm' and 'admin' roles have GM privileges.
    // is_game_master is already derived from role in requireAuth().
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

/**
 * Guards an admin-only endpoint. Returns the user only if role === 'admin'.
 *
 * The 'admin' role is distinct from 'gm': admins can manage user accounts,
 * promote/suspend/delete users, and do everything a GM can.
 *
 * USAGE:
 *   $user = requireAdmin();
 *
 * @return array The current admin user.
 * @throws void — Exits with 403 JSON response if not an admin.
 */
function requireAdmin(): array
{
    $user = requireAuth();

    if ($user['role'] !== 'admin') {
        Logger::warn('Auth', '403 Forbidden — admin privileges required', ['user' => $user['username']]);
        http_response_code(403);
        header('Content-Type: application/json');
        echo json_encode([
            'error'   => 'Forbidden',
            'message' => 'This endpoint requires administrator privileges.',
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

    // Only the username is strictly required. The password may be absent for
    // no-password accounts (new users and the admin bootstrap account).
    // The password field is validated contextually below.
    if (empty($username)) {
        http_response_code(400);
        echo json_encode(['error' => 'BadRequest', 'message' => 'Username is required.']);
        return;
    }

    $db = Database::getInstance();
    // Select role, is_suspended, and last_login_at alongside legacy is_game_master.
    // is_game_master is kept in the SELECT for backward compatibility but GM status
    // is now derived from role IN ('gm', 'admin') at the application layer.
    $stmt = $db->prepare('
        SELECT id, username, password_hash, display_name,
               role, is_game_master, is_suspended, last_login_at, created_at
        FROM users
        WHERE username = ?
    ');
    $stmt->execute([$username]);
    $user = $stmt->fetch();

    // ── Suspended account check (before any password verification) ──────────
    // Suspension is checked first so that suspended users cannot probe whether
    // their password is correct — they receive a generic "account suspended" error.
    if ($user && (bool)$user['is_suspended']) {
        Logger::warn('Auth', 'Login rejected — account suspended', ['user' => $username]);
        http_response_code(403);
        echo json_encode([
            'error'   => 'AccountSuspended',
            'message' => 'This account has been suspended. Contact an administrator.',
        ]);
        return;
    }

    // ── No-password accounts (new users, admin bootstrap) ───────────────────
    // A new user created by an admin has password_hash = '' (empty string sentinel).
    // They can log in without a password — but only within 7 days of account creation.
    // After 7 days the account is auto-suspended at login time (no cron required).
    $hasNoPassword = $user && $user['password_hash'] === '';
    if ($hasNoPassword) {
        // No-password accounts only accept an empty submitted password.
        // Submitting a non-empty password is rejected as wrong credentials
        // (generic error to avoid leaking that this account has no password).
        if ($password !== '') {
            Logger::warn('Auth', 'Login failed — password submitted for no-password account', ['user' => $username]);
            http_response_code(401);
            echo json_encode(['error' => 'InvalidCredentials', 'message' => 'Invalid username or password.']);
            return;
        }

        // Check the 7-day no-login window.
        $sevenDaysInSeconds = 7 * 24 * 3600;
        $createdAt = (int)($user['created_at'] ?? 0);
        if ($createdAt > 0 && (time() - $createdAt) > $sevenDaysInSeconds) {
            // Auto-suspend: account was never activated within the allowed window.
            $db->prepare('UPDATE users SET is_suspended = 1 WHERE id = ?')
               ->execute([$user['id']]);
            Logger::warn('Auth', 'Login rejected — account expired (7-day window)', ['user' => $username]);
            http_response_code(403);
            echo json_encode([
                'error'   => 'AccountExpired',
                'message' => 'This account was not activated within 7 days and has been suspended. Contact an administrator.',
            ]);
            return;
        }

        // Within the window: allow login without a password.
        // Fall through to session creation below, but mark needs_password_setup.
    } else {
        // Standard password verification path.
        // Run verify even if user not found (timing attack prevention).
        $dummyHash = '$2y$12$abcdefghijklmnopqrstuvuABCDEFGHIJKLMNOPQRSTUVWXYZ01234';
        $hashToCheck = $user ? $user['password_hash'] : $dummyHash;

        if (!$user || !password_verify($password, $hashToCheck)) {
            Logger::warn('Auth', 'Login failed — invalid credentials', ['user' => $username]);
            http_response_code(401);
            echo json_encode(['error' => 'InvalidCredentials', 'message' => 'Invalid username or password.']);
            return;
        }
    }

    // At this point authentication succeeded (either no-password or correct password).

    // Regenerate session ID to prevent session fixation attacks.
    // In CLI mode (PHPUnit), session regeneration is skipped (no HTTP session in CLI).
    if (PHP_SAPI !== 'cli') {
        session_regenerate_id(true);
    }

    // Derive GM status from role (both 'gm' and 'admin' are game masters).
    $role         = $user['role'] ?? 'player';
    $isGameMaster = in_array($role, ['gm', 'admin'], true);

    // Store minimal user info in session (avoid storing sensitive data).
    $_SESSION['user_id']             = $user['id'];
    $_SESSION['username']            = $user['username'];
    $_SESSION['display_name']        = $user['display_name'];
    $_SESSION['role']                = $role;
    $_SESSION['is_game_master']      = $isGameMaster; // kept for controller backward compat
    $_SESSION['needs_password_setup'] = $hasNoPassword;

    // Record the login timestamp for the admin user-list view.
    $db->prepare('UPDATE users SET last_login_at = ? WHERE id = ?')
       ->execute([time(), $user['id']]);

    Logger::info('Auth', 'Login OK', [
        'user'              => $user['username'],
        'role'              => $role,
        'needsPasswordSetup' => $hasNoPassword ? 'yes' : 'no',
    ]);

    http_response_code(200);
    $response = [
        'id'                 => $user['id'],
        'username'           => $user['username'],
        'display_name'       => $user['display_name'],
        'role'               => $role,
        'is_game_master'     => $isGameMaster,
    ];
    // Signal the frontend to redirect to the password-setup page.
    if ($hasNoPassword) {
        $response['needs_password_setup'] = true;
    }
    echo json_encode($response);
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
    $response = [
        'id'             => $user['id'],
        'username'       => $user['username'],
        'display_name'   => $user['display_name'],
        'role'           => $user['role'],
        'is_game_master' => $user['is_game_master'],
        'csrfToken'      => $csrfToken,
    ];
    // Include needs_password_setup if the session flag is set.
    if (!empty($_SESSION['needs_password_setup'])) {
        $response['needs_password_setup'] = true;
    }
    echo json_encode($response);
}

// ============================================================
// SETUP PASSWORD ENDPOINT
// ============================================================

/**
 * PUT /api/auth/setup-password
 *
 * Sets the password for a user who logged in without one (new account or admin
 * bootstrap). This endpoint is the mandatory next step after any login that
 * returns `needs_password_setup: true`.
 *
 * GUARDS:
 *   1. requireAuth()          — user must be authenticated (401 otherwise).
 *   2. $_SESSION flag check   — `needs_password_setup` must be true in the session,
 *                               preventing already-configured accounts from using
 *                               this shortcut to change their password.
 *
 * WHY A SEPARATE ENDPOINT (not PUT /api/users/{id})?
 *   PUT /api/users/{id} requires admin privileges. This endpoint is accessible
 *   to any authenticated user whose account has no password yet — it's the
 *   self-service activation step before normal app usage begins.
 *
 * REQUEST BODY (JSON):
 *   { "password": "string" }  — new plaintext password; must be non-empty.
 *
 * RESPONSE 200 OK:
 *   { "id": "...", "username": "...", "display_name": "...",
 *     "role": "...", "is_game_master": bool }
 *
 * RESPONSE 400 BadRequest  — password field absent or empty.
 * RESPONSE 403 Forbidden   — session `needs_password_setup` flag is not set
 *                            (account already has a password).
 * RESPONSE 401 Unauthorized — not authenticated.
 */
function handleSetupPassword(): void
{
    // Requires active authentication.
    $user = requireAuth();

    // Guard: only accounts that logged in via the no-password flow may use this
    // endpoint. Accounts that already have a password must use a different path
    // (future: PUT /api/users/{id}/change-password with current-password check).
    if (empty($_SESSION['needs_password_setup'])) {
        Logger::warn('Auth', 'setup-password rejected — needs_password_setup flag not set',
            ['user' => $user['username']]);
        http_response_code(403);
        echo json_encode([
            'error'   => 'Forbidden',
            'message' => 'This endpoint is only available during first-login password setup.',
        ]);
        return;
    }

    $body     = json_decode(file_get_contents('php://input'), true) ?? [];
    $password = $body['password'] ?? '';

    // Validate: the new password must not be empty.
    // The frontend enforces min-length but the backend must validate independently.
    if ($password === '') {
        http_response_code(400);
        echo json_encode([
            'error'   => 'BadRequest',
            'message' => 'Password must not be empty.',
        ]);
        return;
    }

    // Hash and persist the new password.
    $hash = hashPassword($password);
    $db   = Database::getInstance();
    $db->prepare('UPDATE users SET password_hash = ? WHERE id = ?')
       ->execute([$hash, $user['id']]);

    // Clear the setup flag from the session so this endpoint cannot be reused.
    unset($_SESSION['needs_password_setup']);

    Logger::info('Auth', 'Password set via setup-password', ['user' => $user['username']]);

    // Return the updated user object (mirrors the /api/auth/me response shape).
    http_response_code(200);
    echo json_encode([
        'id'             => $user['id'],
        'username'       => $user['username'],
        'display_name'   => $user['display_name'],
        'role'           => $user['role'],
        'is_game_master' => $user['is_game_master'],
    ]);
}

// ============================================================
// CHANGE PASSWORD ENDPOINT
// ============================================================

/**
 * PUT /api/auth/change-password
 *
 * Self-service password change for any authenticated user.
 *
 * This endpoint differs from PUT /api/auth/setup-password in two ways:
 *   1. It is available to any authenticated user regardless of whether the
 *      needs_password_setup session flag is set.
 *   2. When the account already has a password it requires the caller to prove
 *      knowledge of the current password before accepting the new one.
 *
 * FLOW:
 *   a) Reject if new_password is empty.
 *   b) Fetch the current password_hash from the DB.
 *   c) If password_hash === '' (no-password account): skip current_password check.
 *   d) Otherwise: verify current_password; return 400 WrongPassword on mismatch.
 *   e) Store new bcrypt hash; clear needs_password_setup session flag.
 *   f) Return updated user object.
 *
 * REQUEST BODY (JSON):
 *   { "current_password": "string", "new_password": "string" }
 *
 * RESPONSE 200:  { id, username, display_name, role, is_game_master }
 * RESPONSE 400 BadRequest    — new_password is empty.
 * RESPONSE 400 WrongPassword — current_password does not match stored hash.
 * RESPONSE 401 Unauthorized  — not authenticated.
 */
function handleChangePassword(): void
{
    $user = requireAuth();

    $body            = json_decode(file_get_contents('php://input'), true) ?? [];
    $currentPassword = $body['current_password'] ?? '';
    $newPassword     = $body['new_password']     ?? '';

    if ($newPassword === '') {
        http_response_code(400);
        echo json_encode([
            'error'   => 'BadRequest',
            'message' => 'New password must not be empty.',
        ]);
        return;
    }

    $db   = Database::getInstance();
    $stmt = $db->prepare('SELECT password_hash FROM users WHERE id = ?');
    $stmt->execute([$user['id']]);
    $row  = $stmt->fetch(PDO::FETCH_ASSOC);

    // If the account has a password already, require the current one.
    // If password_hash === '' (no-password / first-login state), skip this check —
    // the user may not have a password yet (e.g., admin bootstrap + ongoing setup).
    $hasExistingPassword = $row && $row['password_hash'] !== '';
    if ($hasExistingPassword && !password_verify($currentPassword, $row['password_hash'])) {
        Logger::warn('Auth', 'change-password rejected — wrong current password',
            ['user' => $user['username']]);
        http_response_code(400);
        echo json_encode([
            'error'   => 'WrongPassword',
            'message' => 'Current password is incorrect.',
        ]);
        return;
    }

    $hash = hashPassword($newPassword);
    $db->prepare('UPDATE users SET password_hash = ? WHERE id = ?')
       ->execute([$hash, $user['id']]);

    // Clear setup flag in case the user was in the first-login flow.
    unset($_SESSION['needs_password_setup']);

    Logger::info('Auth', 'Password changed', ['user' => $user['username']]);

    http_response_code(200);
    echo json_encode([
        'id'             => $user['id'],
        'username'       => $user['username'],
        'display_name'   => $user['display_name'],
        'role'           => $user['role'],
        'is_game_master' => $user['is_game_master'],
    ]);
}

// ============================================================
// UPDATE DISPLAY NAME ENDPOINT
// ============================================================

/**
 * PUT /api/auth/display-name
 *
 * Allows any authenticated user to change their own display name
 * (the in-game name shown to GMs and other players).
 *
 * This is intentionally separate from PUT /api/users/{id}, which is
 * admin-only and cannot target the admin's own account.
 *
 * REQUEST BODY (JSON):
 *   { "display_name": "string" }  — new name; must be non-empty.
 *
 * RESPONSE 200 OK:
 *   { "id": "...", "display_name": "..." }
 *
 * RESPONSE 400 BadRequest  — display_name absent or empty.
 * RESPONSE 401 Unauthorized — not authenticated.
 */
function handleUpdateDisplayName(): void
{
    verifyCsrfToken();
    $user = requireAuth();

    $body        = json_decode(file_get_contents('php://input'), true) ?? [];
    $displayName = trim($body['display_name'] ?? '');

    if ($displayName === '') {
        http_response_code(400);
        echo json_encode(['error' => 'BadRequest', 'message' => 'display_name must not be empty.']);
        return;
    }

    $db = Database::getInstance();
    $db->prepare('UPDATE users SET display_name = ? WHERE id = ?')
       ->execute([$displayName, $user['id']]);

    // Keep the session in sync so subsequent GET /api/auth/me calls reflect the new name.
    $_SESSION['display_name'] = $displayName;

    Logger::info('Auth', 'UpdateDisplayName', ['id' => $user['id'], 'display_name' => $displayName]);
    http_response_code(200);
    echo json_encode(['id' => $user['id'], 'display_name' => $displayName]);
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
