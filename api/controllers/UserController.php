<?php
/**
 * @file api/controllers/UserController.php
 * @description REST controller for user account management.
 *
 * ENDPOINTS (all admin-only via requireAdmin()):
 *   GET    /api/users              → index()
 *   POST   /api/users              → create()
 *   PUT    /api/users/{id}         → update($id)
 *   PUT    /api/users/{id}/role    → updateRole($id)
 *   POST   /api/users/{id}/suspend    → suspend($id)
 *   POST   /api/users/{id}/reinstate  → reinstate($id)
 *   DELETE /api/users/{id}         → delete($id)
 *
 * ROLE MODEL:
 *   'admin'  — Can manage all user accounts (this controller).
 *              Has full GM capabilities as well.
 *   'gm'     — Game Master. Can manage campaigns and characters.
 *              Cannot access this controller (admin-only).
 *   'player' — Regular player. No user-management access.
 *
 * SELF-EDIT RESTRICTION:
 *   Admins cannot modify or delete their own account via this API.
 *   This prevents accidental self-lockout. A separate account must perform
 *   any changes to the currently-logged-in admin's account.
 *
 * NEW USER FLOW:
 *   Users created by POST /api/users are assigned an empty password hash ('').
 *   On their first login attempt within 7 days, they receive needs_password_setup:true
 *   and are immediately redirected to the password setup page.
 *   Accounts that never log in within 7 days are auto-suspended at login time
 *   (no cron required — see auth.php handleLogin for the auto-suspend logic).
 *
 * @see api/auth.php for requireAdmin()
 * @see api/migrate.php for the users and campaign_users schema
 * @see ARCHITECTURE.md Phase 22 for the full specification.
 */

declare(strict_types=1);

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../Logger.php';
require_once __DIR__ . '/../Database.php';
require_once __DIR__ . '/../auth.php';

class UserController
{
    // ============================================================
    // GET /api/users
    // ============================================================

    /**
     * Lists all users in the system with their campaign memberships and
     * per-campaign character counts.
     *
     * RESPONSE (200):
     *   Array of user objects:
     *   {
     *     id, username, player_name, role, is_suspended,
     *     created_at, last_login_at (null if never),
     *     campaigns: [{ id, title, character_count }]
     *   }
     *
     * The 'player_name' field maps to the `display_name` column — the name
     * the player uses in-game, distinct from their login username.
     *
     * Campaigns are computed from campaign_users JOIN campaigns, with
     * character_count = number of characters owned by this user in that campaign.
     */
    public static function index(): void
    {
        requireAdmin();
        $db = Database::getInstance();

        // ── Step 1: All users ────────────────────────────────────────────────
        $users = $db->query('
            SELECT id, username, display_name AS player_name,
                   role, is_suspended, created_at, last_login_at
            FROM users
            ORDER BY username ASC
        ')->fetchAll(PDO::FETCH_ASSOC);

        // ── Step 2: Campaign memberships with character counts ───────────────
        // For each (user, campaign) pair, COUNT the characters owned by that
        // user in that campaign. LEFT JOIN on characters so campaigns with zero
        // characters still appear in the result.
        $memberships = $db->query('
            SELECT
                cu.user_id,
                c.id           AS campaign_id,
                c.title,
                COUNT(ch.id)   AS character_count
            FROM campaign_users cu
            JOIN campaigns c  ON c.id  = cu.campaign_id
            LEFT JOIN characters ch
                ON ch.campaign_id = cu.campaign_id
               AND ch.owner_id    = cu.user_id
            GROUP BY cu.user_id, cu.campaign_id
            ORDER BY c.title ASC
        ')->fetchAll(PDO::FETCH_ASSOC);

        // ── Step 3: Pivot memberships by user_id ────────────────────────────
        $campaignsByUser = [];
        foreach ($memberships as $m) {
            $campaignsByUser[$m['user_id']][] = [
                'id'              => $m['campaign_id'],
                'title'           => $m['title'],
                'character_count' => (int)$m['character_count'],
            ];
        }

        // ── Step 4: Attach campaigns and normalise types ─────────────────────
        foreach ($users as &$u) {
            $u['is_suspended']  = (bool)$u['is_suspended'];
            $u['created_at']    = (int)$u['created_at'];
            // last_login_at is NULL when the user has never logged in.
            $u['last_login_at'] = $u['last_login_at'] !== null ? (int)$u['last_login_at'] : null;
            $u['campaigns']     = $campaignsByUser[$u['id']] ?? [];
        }
        unset($u);

        Logger::info('User', 'List', ['count' => count($users)]);
        http_response_code(200);
        echo json_encode($users);
    }

    // ============================================================
    // POST /api/users
    // ============================================================

    /**
     * Creates a new user account with no password set.
     *
     * REQUEST BODY (JSON):
     *   { "username": "string", "player_name": "string" }
     *
     * Both fields are required. The new account has:
     *   password_hash = '' (empty sentinel — no-password account)
     *   role          = 'player'
     *   is_suspended  = 0
     *
     * RESPONSE 201 Created:
     *   { id, username, player_name, role, is_suspended, created_at, last_login_at, campaigns }
     *
     * RESPONSE 400 BadRequest  — username or player_name is empty.
     * RESPONSE 409 Conflict    — username already taken.
     */
    public static function create(): void
    {
        requireAdmin();

        $body       = json_decode(file_get_contents('php://input'), true) ?? [];
        $username   = trim($body['username']    ?? '');
        $playerName = trim($body['player_name'] ?? '');

        if ($username === '' || $playerName === '') {
            http_response_code(400);
            echo json_encode([
                'error'   => 'BadRequest',
                'message' => 'username and player_name are required.',
            ]);
            return;
        }

        $db  = Database::getInstance();
        $id  = 'user_' . bin2hex(random_bytes(8));
        $now = time();

        // Attempt the INSERT. A UNIQUE constraint violation on username
        // produces a PDOException with SQLite code 19 (SQLITE_CONSTRAINT).
        // We catch it and return 409 Conflict.
        try {
            $db->prepare('
                INSERT INTO users
                    (id, username, password_hash, display_name, role, is_game_master, is_suspended, created_at)
                VALUES
                    (?, ?, ?, ?, ?, ?, ?, ?)
            ')->execute([$id, $username, '', $playerName, 'player', 0, 0, $now]);
        } catch (\PDOException $e) {
            // SQLITE_CONSTRAINT = error code 19; message contains "UNIQUE constraint failed"
            if (str_contains($e->getMessage(), 'UNIQUE constraint failed')) {
                http_response_code(409);
                echo json_encode([
                    'error'   => 'Conflict',
                    'message' => "Username '{$username}' is already taken.",
                ]);
                return;
            }
            throw $e; // Re-throw unexpected DB errors to the global handler
        }

        Logger::info('User', 'Created', ['id' => $id, 'username' => $username]);
        http_response_code(201);
        echo json_encode([
            'id'            => $id,
            'username'      => $username,
            'player_name'   => $playerName,
            'role'          => 'player',
            'is_suspended'  => false,
            'created_at'    => $now,
            'last_login_at' => null,
            'campaigns'     => [],
        ]);
    }

    // ============================================================
    // PUT /api/users/{id}
    // ============================================================

    /**
     * Updates a user's player name (display_name).
     *
     * SELF-EDIT RESTRICTION: admins cannot edit their own account via this
     * endpoint. This prevents accidental username/name changes that could
     * confuse active sessions.
     *
     * REQUEST BODY (JSON):
     *   { "player_name": "string" }
     *
     * RESPONSE 200:  { id, player_name }
     * RESPONSE 400:  self-edit attempt, or empty player_name
     * RESPONSE 404:  user not found
     */
    public static function update(string $id): void
    {
        $admin = requireAdmin();

        // Self-edit restriction.
        if ($admin['id'] === $id) {
            http_response_code(400);
            echo json_encode([
                'error'   => 'BadRequest',
                'message' => 'Administrators cannot edit their own account via this endpoint.',
            ]);
            return;
        }

        $db   = Database::getInstance();
        $user = self::findUserOrFail($db, $id);
        if ($user === null) return;

        $body       = json_decode(file_get_contents('php://input'), true) ?? [];
        $playerName = trim($body['player_name'] ?? '');

        if ($playerName === '') {
            http_response_code(400);
            echo json_encode(['error' => 'BadRequest', 'message' => 'player_name must not be empty.']);
            return;
        }

        $db->prepare('UPDATE users SET display_name = ? WHERE id = ?')
           ->execute([$playerName, $id]);

        Logger::info('User', 'Updated player_name', ['id' => $id, 'player_name' => $playerName]);
        http_response_code(200);
        echo json_encode(['id' => $id, 'player_name' => $playerName]);
    }

    // ============================================================
    // PUT /api/users/{id}/role
    // ============================================================

    /**
     * Promotes or demotes a user's role.
     *
     * SELF-EDIT RESTRICTION: admins cannot change their own role (they could
     * accidentally demote themselves and lose admin access permanently).
     *
     * REQUEST BODY (JSON):
     *   { "role": "admin" | "gm" | "player" }
     *
     * SIDE EFFECT on is_game_master:
     *   The legacy `is_game_master` column is kept in sync with the new role
     *   so that any code still reading that column remains consistent.
     *
     * RESPONSE 200:  { id, role, is_game_master }
     * RESPONSE 400:  self-edit attempt or invalid role value
     * RESPONSE 404:  user not found
     */
    public static function updateRole(string $id): void
    {
        $admin = requireAdmin();

        if ($admin['id'] === $id) {
            http_response_code(400);
            echo json_encode([
                'error'   => 'BadRequest',
                'message' => 'Administrators cannot change their own role.',
            ]);
            return;
        }

        $db   = Database::getInstance();
        $user = self::findUserOrFail($db, $id);
        if ($user === null) return;

        $body = json_decode(file_get_contents('php://input'), true) ?? [];
        $role = $body['role'] ?? '';

        $validRoles = ['admin', 'gm', 'player'];
        if (!in_array($role, $validRoles, true)) {
            http_response_code(400);
            echo json_encode([
                'error'   => 'BadRequest',
                'message' => "Invalid role '{$role}'. Must be one of: admin, gm, player.",
            ]);
            return;
        }

        // Keep the legacy is_game_master column in sync.
        $isGameMaster = in_array($role, ['gm', 'admin'], true) ? 1 : 0;

        $db->prepare('UPDATE users SET role = ?, is_game_master = ? WHERE id = ?')
           ->execute([$role, $isGameMaster, $id]);

        Logger::info('User', 'Role updated', ['id' => $id, 'new_role' => $role]);
        http_response_code(200);
        echo json_encode([
            'id'             => $id,
            'role'           => $role,
            'is_game_master' => (bool)$isGameMaster,
        ]);
    }

    // ============================================================
    // POST /api/users/{id}/suspend
    // ============================================================

    /**
     * Suspends a user account. Suspended users cannot log in.
     *
     * SELF-SUSPEND RESTRICTION: admins cannot suspend themselves.
     *
     * IDEMPOTENT: suspending an already-suspended account returns 200.
     *
     * RESPONSE 200: { id, is_suspended: true }
     * RESPONSE 400: self-suspend attempt
     * RESPONSE 404: user not found
     */
    public static function suspend(string $id): void
    {
        $admin = requireAdmin();

        if ($admin['id'] === $id) {
            http_response_code(400);
            echo json_encode([
                'error'   => 'BadRequest',
                'message' => 'Administrators cannot suspend their own account.',
            ]);
            return;
        }

        $db   = Database::getInstance();
        $user = self::findUserOrFail($db, $id);
        if ($user === null) return;

        $db->prepare('UPDATE users SET is_suspended = 1 WHERE id = ?')->execute([$id]);

        Logger::info('User', 'Suspended', ['id' => $id, 'username' => $user['username']]);
        http_response_code(200);
        echo json_encode(['id' => $id, 'is_suspended' => true]);
    }

    // ============================================================
    // POST /api/users/{id}/reinstate
    // ============================================================

    /**
     * Reinstates a suspended user account, allowing them to log in again.
     *
     * IDEMPOTENT: reinstating an active account returns 200.
     *
     * WHY NO SELF-REINSTATE RESTRICTION?
     *   A suspended admin cannot log in, so they cannot call this endpoint.
     *   Another admin must reinstate them. Self-reinstate is therefore
     *   structurally impossible for suspended users.
     *
     * RESPONSE 200: { id, is_suspended: false }
     * RESPONSE 404: user not found
     */
    public static function reinstate(string $id): void
    {
        requireAdmin();

        $db   = Database::getInstance();
        $user = self::findUserOrFail($db, $id);
        if ($user === null) return;

        $db->prepare('UPDATE users SET is_suspended = 0 WHERE id = ?')->execute([$id]);

        Logger::info('User', 'Reinstated', ['id' => $id, 'username' => $user['username']]);
        http_response_code(200);
        echo json_encode(['id' => $id, 'is_suspended' => false]);
    }

    // ============================================================
    // DELETE /api/users/{id}
    // ============================================================

    /**
     * Permanently deletes a user account and all their owned characters
     * (cascade via foreign key).
     *
     * SELF-DELETE RESTRICTION: admins cannot delete their own account.
     *
     * WHY HARD DELETE AND NOT SOFT DELETE?
     *   Suspension serves the "keep the account but block access" use case.
     *   Delete is reserved for genuine removal (GDPR erasure, test cleanup, etc.).
     *   Characters cascade-delete because they belong to the user. Campaign
     *   membership rows are also cascade-deleted via campaign_users FK.
     *
     * RESPONSE 200: { id, deleted: true }
     * RESPONSE 400: self-delete attempt
     * RESPONSE 404: user not found
     */
    public static function delete(string $id): void
    {
        $admin = requireAdmin();

        if ($admin['id'] === $id) {
            http_response_code(400);
            echo json_encode([
                'error'   => 'BadRequest',
                'message' => 'Administrators cannot delete their own account.',
            ]);
            return;
        }

        $db   = Database::getInstance();
        $user = self::findUserOrFail($db, $id);
        if ($user === null) return;

        // ON DELETE CASCADE on characters.owner_id and campaign_users.user_id
        // means all related rows are removed automatically.
        $db->prepare('DELETE FROM users WHERE id = ?')->execute([$id]);

        Logger::info('User', 'Deleted', ['id' => $id, 'username' => $user['username']]);
        http_response_code(200);
        echo json_encode(['id' => $id, 'deleted' => true]);
    }

    // ============================================================
    // PRIVATE HELPERS
    // ============================================================

    /**
     * Fetches a user row by ID, or responds with 404 and returns null.
     *
     * Centralises the "user not found" response so every endpoint stays DRY.
     * When null is returned, the caller must return immediately — the 404
     * response has already been sent.
     *
     * @param \PDO   $db  - Active database connection.
     * @param string $id  - The user ID to look up.
     * @return array|null The user row, or null (+ 404 already sent).
     */
    private static function findUserOrFail(\PDO $db, string $id): ?array
    {
        $stmt = $db->prepare('SELECT id, username, role FROM users WHERE id = ?');
        $stmt->execute([$id]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$user) {
            http_response_code(404);
            echo json_encode([
                'error'   => 'NotFound',
                'message' => "User '{$id}' not found.",
            ]);
            return null;
        }

        return $user;
    }
}
