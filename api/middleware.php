<?php
/**
 * @file api/middleware.php
 * @description CORS, CSRF protection, and rate limiting middleware.
 *
 * PURPOSE:
 *   Provides three security middleware functions:
 *     1. applyCorsHeaders()  — CORS headers for cross-origin requests.
 *     2. verifyCsrfToken()   — CSRF protection for state-changing requests.
 *     3. checkRateLimit()    — File-based rate limiting to prevent abuse.
 *
 * CALL ORDER (from api/index.php router):
 *   1. applyCorsHeaders()        — First, so preflight OPTIONS requests are handled.
 *   2. checkRateLimit()          — Second, reject abusive IPs early.
 *   3. requireAuth() (auth.php)  — Third, verify session on protected routes.
 *   4. verifyCsrfToken()         — Fourth (POST/PUT/DELETE only), verify CSRF token.
 *
 * @see api/config.php for CORS_ALLOWED_ORIGINS, MAX_LOGIN_ATTEMPTS, LOCKOUT_DURATION_SECONDS.
 * @see api/auth.php for requireAuth() middleware.
 * @see ARCHITECTURE.md Phase 14.3 for the full specification.
 */

declare(strict_types=1);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/Logger.php';

// ============================================================
// 1. CORS MIDDLEWARE
// ============================================================

/**
 * Applies CORS headers to the current HTTP response.
 *
 * HOW CORS WORKS HERE:
 *   The browser sends an `Origin` header with every cross-origin request.
 *   If the origin is in our allowlist, we reflect it back in
 *   `Access-Control-Allow-Origin`. If it's not in the list, we don't send
 *   the header (effectively blocking the request at the browser level).
 *
 *   For preflight requests (HTTP OPTIONS), we return 200 immediately
 *   so the browser knows the actual request is allowed.
 *
 * WHY NOT `Access-Control-Allow-Origin: *`?
 *   Wildcard `*` would allow any website to call our API, enabling
 *   Cross-Site Request Forgery attacks. We explicitly whitelist only
 *   our own frontend origins.
 *
 * `Access-Control-Allow-Credentials: true` allows the browser to send
 * session cookies with cross-origin requests (required for our session auth).
 * NOTE: This CANNOT be combined with `Allow-Origin: *`.
 */
function applyCorsHeaders(): void
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';

    // Reflect the origin back only if it's in our allowlist
    if (in_array($origin, CORS_ALLOWED_ORIGINS, true)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Access-Control-Allow-Credentials: true');
        header('Access-Control-Allow-Methods: ' . implode(', ', CORS_ALLOWED_METHODS));
        header('Access-Control-Allow-Headers: ' . implode(', ', CORS_ALLOWED_HEADERS));
        header('Access-Control-Max-Age: 86400'); // Cache preflight for 24h
    }

    // Handle CORS preflight (browser OPTIONS request before the actual request)
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(200);
        httpExit();
    }
}

// ============================================================
// 2. CSRF PROTECTION
// ============================================================

/**
 * Generates or retrieves the CSRF token for the current session.
 *
 * The token is stored in $_SESSION and must be sent back by the client
 * in the `X-CSRF-Token` header (or request body) for state-changing requests.
 *
 * USAGE:
 *   The frontend fetches this token via GET /api/auth/me and stores it in
 *   memory. All POST/PUT/DELETE requests include it in the X-CSRF-Token header.
 *   The Vite proxy configuration (api/vite.config.ts Phase 14.7) passes
 *   this header through.
 *
 * @return string The CSRF token for the current session.
 */
function getCsrfToken(): string
{
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

/**
 * Verifies the CSRF token for state-changing requests (POST, PUT, DELETE).
 *
 * WHY CSRF EVEN WITH SAMESITE STRICT COOKIES?
 *   SameSite=Strict cookies provide strong CSRF protection in modern browsers.
 *   However, double-submit cookie pattern (CSRF token) is defense-in-depth:
 *   it protects older browsers, browser bugs, and non-standard request mechanisms.
 *   The combination of SameSite cookies + CSRF token is the recommended approach
 *   by OWASP for high-security applications.
 *
 * TOKEN LOOKUP ORDER:
 *   1. X-CSRF-Token HTTP header (preferred for API clients)
 *   2. _csrf_token in the request body (fallback for form-encoded requests)
 *
 * @throws void — Exits with 403 if the token is missing or invalid.
 */
function verifyCsrfToken(): void
{
    // Only verify on state-changing methods
    $method = $_SERVER['REQUEST_METHOD'];
    if (!in_array($method, ['POST', 'PUT', 'DELETE', 'PATCH'], true)) {
        return;
    }

    // Read from header first, then body
    $clientToken = $_SERVER['HTTP_X_CSRF_TOKEN']
        ?? $_POST['_csrf_token']
        ?? null;

    $sessionToken = $_SESSION['csrf_token'] ?? null;

    // hash_equals() prevents timing attacks on token comparison
    if ($clientToken === null || $sessionToken === null || !hash_equals($sessionToken, $clientToken)) {
        $reason = $clientToken === null ? 'token absent' : ($sessionToken === null ? 'no session token' : 'mismatch');
        Logger::warn('CSRF', '403 — CSRF check failed', ['method' => $method, 'reason' => $reason]);
        http_response_code(403);
        header('Content-Type: application/json');
        echo json_encode([
            'error'   => 'InvalidCsrfToken',
            'message' => 'CSRF token missing or invalid. Please re-fetch the token from GET /api/auth/me.',
        ]);
        httpExit();
    }
}

// ============================================================
// 3. RATE LIMITING
// ============================================================

/**
 * Checks the rate limit for the current client IP.
 *
 * IMPLEMENTATION:
 *   Simple file-based counter stored in /tmp/ (or OS temp dir).
 *   One file per (IP + endpoint_key) with format: "count|first_request_timestamp"
 *
 *   WHY FILE-BASED AND NOT IN-MEMORY (APCu) OR REDIS?
 *     Shared hosting typically has no APCu or Redis available.
 *     PHP-FPM workers don't share memory.
 *     Files stored in /tmp/ are writable on virtually all shared hosting plans.
 *
 *   LIMITATIONS:
 *     File-based rate limiting has race conditions under extreme concurrency.
 *     For < 100 simultaneous users (a tabletop game), this is acceptable.
 *     A production high-traffic deployment should use Redis or memcached.
 *
 * @param string $key        — Identifier for the endpoint (e.g., 'login', 'api_global').
 * @param int    $maxRequests — Maximum requests allowed in the window.
 * @param int    $windowSec   — Time window in seconds.
 * @throws void — Exits with 429 Too Many Requests if limit exceeded.
 */
function checkRateLimit(string $key = 'global', int $maxRequests = 60, int $windowSec = 60): void
{
    $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';

    // Sanitize IP and key for use in filename (prevent path traversal)
    $safeIp  = preg_replace('/[^a-fA-F0-9:.]/', '_', $ip);
    $safeKey = preg_replace('/[^a-zA-Z0-9_]/', '_', $key);

    $filePath = sys_get_temp_dir() . '/cvault_rl_' . $safeKey . '_' . md5($safeIp) . '.txt';

    $now = time();

    // Read existing rate limit data
    $count          = 0;
    $windowStart    = $now;

    if (file_exists($filePath)) {
        $data = @file_get_contents($filePath);
        if ($data !== false) {
            [$storedCount, $storedTimestamp] = explode('|', $data . '|0');
            $storedTimestamp = (int)$storedTimestamp;

            if ($now - $storedTimestamp < $windowSec) {
                // Still within the current window
                $count       = (int)$storedCount;
                $windowStart = $storedTimestamp;
            }
            // else: window has expired, reset count to 0
        }
    }

    $count++;

    // Write updated count
    @file_put_contents($filePath, $count . '|' . $windowStart, LOCK_EX);

    if ($count > $maxRequests) {
        $retryAfter = $windowStart + $windowSec - $now;
        Logger::warn('RateLimit', '429 — limit exceeded', [
            'key'   => $key,
            'ip'    => $ip,
            'count' => $count,
            'max'   => $maxRequests,
            'retry' => $retryAfter . 's',
        ]);
        http_response_code(429);
        header('Content-Type: application/json');
        header('Retry-After: ' . max(0, $retryAfter));
        echo json_encode([
            'error'       => 'TooManyRequests',
            'message'     => "Rate limit exceeded. Max {$maxRequests} requests per {$windowSec} seconds.",
            'retry_after' => max(0, $retryAfter),
        ]);
        httpExit();
    }
}

/**
 * Stricter rate limit for authentication endpoints.
 * Max 5 login attempts per 15 minutes.
 *
 * USAGE (from router for POST /api/auth/login):
 *   checkLoginRateLimit();
 */
function checkLoginRateLimit(): void
{
    checkRateLimit('login', MAX_LOGIN_ATTEMPTS, LOCKOUT_DURATION_SECONDS);
}
