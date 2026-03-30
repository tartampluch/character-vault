<?php
/**
 * @file tests/TestCase.php
 * @description Base test class for all Character Vault API tests.
 *
 * PURPOSE:
 *   Provides a base class that all test classes extend.
 *   Handles common setup/teardown:
 *     - Reset the Database singleton (forces a fresh in-memory DB).
 *     - Run migrations to create the schema in the in-memory DB.
 *     - Provide helper methods for creating test fixtures.
 *
 * TEST ISOLATION:
 *   Each TEST CLASS gets its own in-memory SQLite database (via Database::reset()
 *   in setUp()). This means test classes don't interfere with each other.
 *   Individual tests within a class SHARE the same in-memory DB unless explicitly
 *   reset between tests (which is rare — tests in a class typically build on each other).
 *
 * SESSION MOCKING:
 *   The PHP session ($_SESSION) is simulated in tests by setting it directly.
 *   `simulateLogin($userId, $role)` sets the session variables that requireAuth() checks.
 *   The `role` parameter accepts 'admin', 'gm', or 'player'.
 *   `is_game_master` is automatically derived from the role for backward compatibility.
 *
 * @see api/Database.php for reset() method.
 * @see api/auth.php for requireAuth() (reads $_SESSION).
 */

declare(strict_types=1);

use PHPUnit\Framework\TestCase as PHPUnitTestCase;

abstract class TestCase extends PHPUnitTestCase
{
    /**
     * Called before each test class (but after the constructor).
     * Resets the database singleton and runs migrations.
     */
    protected function setUp(): void
    {
        parent::setUp();

        // Reset the singleton so each test class gets a fresh in-memory DB.
        Database::reset();

        // Create the schema in the fresh in-memory database.
        $pdo = Database::getInstance();
        migrate($pdo);

        // Initialize an empty PHP session for auth testing.
        // PHP native sessions don't work in CLI tests, so we use the superglobal directly.
        if (!isset($_SESSION)) {
            $_SESSION = [];
        }
        $_SESSION = []; // Clear any previous session state
    }

    /**
     * Called after each test.
     */
    protected function tearDown(): void
    {
        parent::tearDown();
        $_SESSION = [];
    }

    // ============================================================
    // FIXTURE HELPERS
    // ============================================================

    /**
     * Simulates an authenticated session as the given user.
     * Sets $_SESSION directly (bypasses PHP's session_start for CLI tests).
     *
     * The $role parameter controls all permission checks:
     *   'admin'  → is_game_master = true  (admin can do everything a GM can + user management)
     *   'gm'     → is_game_master = true
     *   'player' → is_game_master = false (default)
     *
     * is_game_master is derived from role to keep existing tests working unchanged.
     *
     * @param string $userId   - The user ID to authenticate as.
     * @param string $role     - Role: 'admin', 'gm', or 'player'. Pass true/false for
     *                           legacy compatibility (true maps to 'gm', false to 'player').
     * @param string $username - Display username.
     */
    protected function simulateLogin(string $userId, bool|string $role = 'player', string $username = 'testuser'): void
    {
        // Support legacy bool argument ($isGM = true/false) for existing tests.
        if (is_bool($role)) {
            $role = $role ? 'gm' : 'player';
        }

        $_SESSION['user_id']        = $userId;
        $_SESSION['username']       = $username;
        $_SESSION['display_name']   = ucfirst($username);
        $_SESSION['role']           = $role;
        // Derived for controller backward compatibility.
        $_SESSION['is_game_master'] = in_array($role, ['gm', 'admin'], true);
    }

    /**
     * Clears the simulated session (simulates being unauthenticated).
     */
    protected function simulateLogout(): void
    {
        $_SESSION = [];
    }

    /**
     * Creates a test user in the in-memory database.
     *
     * The $role parameter controls all permission checks:
     *   'admin'  → is_game_master = 1
     *   'gm'     → is_game_master = 1
     *   'player' → is_game_master = 0 (default)
     *
     * Pass $role as a bool for legacy compatibility (true = 'gm', false = 'player').
     * Pass an empty string for $password to create a no-password account (admin bootstrap pattern).
     *
     * @param string      $id          - User ID.
     * @param bool|string $role        - Role string ('admin'|'gm'|'player') or legacy bool.
     * @param string      $username    - Username.
     * @param string      $password    - Plaintext password; '' means no password set (sentinel).
     * @param bool        $isSuspended - Whether the account is suspended.
     * @return array The created user record.
     */
    protected function createUser(
        string $id = 'user_test_001',
        bool|string $role = 'player',
        string $username = 'testuser',
        string $password = 'password123',
        bool $isSuspended = false
    ): array {
        // Support legacy bool argument ($isGM = true/false).
        if (is_bool($role)) {
            $role = $role ? 'gm' : 'player';
        }

        $isGameMaster = in_array($role, ['gm', 'admin'], true);
        // Empty password means the user has no password set (no-password sentinel).
        $passwordHash = ($password === '') ? '' : hashPassword($password);

        $pdo = Database::getInstance();
        $stmt = $pdo->prepare(
            'INSERT INTO users (id, username, password_hash, display_name, role, is_game_master, is_suspended) VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $id,
            $username,
            $passwordHash,
            ucfirst($username),
            $role,
            $isGameMaster ? 1 : 0,
            $isSuspended  ? 1 : 0,
        ]);

        return [
            'id'             => $id,
            'username'       => $username,
            'role'           => $role,
            'is_game_master' => $isGameMaster,
            'is_suspended'   => $isSuspended,
        ];
    }

    /**
     * Creates a test campaign in the in-memory database.
     *
     * SCHEMA NOTE:
     *   - title_json stores a JSON-encoded LocalizedString OR a plain string.
     *     For tests, we accept a plain string title and store it as-is in title_json
     *     (the CampaignController always stores JSON-encoded values, but for DB fixtures
     *      a plain string is acceptable since tests read directly from the DB).
     *   - description_json stores a LocalizedString JSON; we default to empty string.
     *   - poster_url and gm_global_overrides_text have been removed from the schema.
     */
    protected function createCampaign(
        string $id = 'camp_test_001',
        string $ownerId = 'user_test_001',
        string $title = 'Test Campaign'
    ): array {
        $pdo = Database::getInstance();
        // Store title_json as a JSON-encoded LocalizedString (matching what the API does).
        $titleJson = json_encode(['en' => $title]);
        $stmt = $pdo->prepare(
            'INSERT INTO campaigns
                (id, title_json, description_json, owner_id, chapters_json, enabled_rule_sources_json, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([$id, $titleJson, '', $ownerId, '[]', '[]', time()]);
        return ['id' => $id, 'title' => $title, 'owner_id' => $ownerId];
    }

    /**
     * Creates a test character in the in-memory database.
     */
    protected function createCharacter(
        string $id = 'char_test_001',
        string $campaignId = 'camp_test_001',
        string $ownerId = 'user_test_001',
        string $name = 'Test Hero',
        bool $isNPC = false,
        array $characterData = [],
        array $gmOverrides = []
    ): array {
        $pdo = Database::getInstance();
        $charJson = json_encode(array_merge(['id' => $id, 'name' => $name], $characterData));
        $gmJson   = json_encode($gmOverrides);
        $stmt = $pdo->prepare(
            'INSERT INTO characters (id, campaign_id, owner_id, name, is_npc, character_json, gm_overrides_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([$id, $campaignId, $ownerId, $name, $isNPC ? 1 : 0, $charJson, $gmJson, time()]);
        return ['id' => $id, 'name' => $name, 'campaign_id' => $campaignId, 'owner_id' => $ownerId];
    }

    /**
     * Runs a controller method and captures its JSON output.
     *
     * Since our controllers echo JSON directly (not return), we use output buffering
     * to capture the response and the HTTP status code.
     *
     * @param callable $controllerAction - e.g., fn() => CharacterController::index()
     * @return array ['status' => int, 'body' => array] The HTTP status and parsed JSON.
     */
    protected function callController(callable $controllerAction): array
    {
        ob_start();
        try {
            $controllerAction();
        } catch (HttpExitException) {
            // Controller sent a response and called httpExit() — this is expected.
            // The buffered output is still intact; we fall through to ob_get_clean().
        } catch (\Throwable $e) {
            ob_end_clean();
            throw $e;
        }
        $output = ob_get_clean();

        $status = http_response_code();
        $body = json_decode($output, true) ?? [];

        // Reset response code to a neutral value for next test
        http_response_code(200);

        return ['status' => $status, 'body' => $body];
    }

    /**
     * Calls a controller action with a custom JSON request body.
     *
     * Uses the TestPhpInputStream stream wrapper to mock php://input.
     * Always restores the original php stream wrapper in a finally block.
     *
     * @param callable $action    - The controller method to call.
     * @param string   $jsonBody  - The JSON body to inject as php://input.
     * @return array ['status' => int, 'body' => array]
     */
    protected function callControllerWithInput(callable $action, string $jsonBody): array
    {
        // Register our mock stream wrapper to intercept php://input reads
        stream_wrapper_unregister('php');
        stream_register_wrapper('php', TestPhpInputStream::class);
        TestPhpInputStream::$inputData = $jsonBody;

        ob_start();
        $httpExited = false;
        try {
            $action();
        } catch (HttpExitException) {
            // Controller sent a response and called httpExit() — expected.
            $httpExited = true;
        } finally {
            // IMPORTANT: always restore php stream wrapper, even if test fails
            stream_wrapper_restore('php');
        }
        // Suppress "unused variable" hint — $httpExited documents intent.
        unset($httpExited);
        $output = ob_get_clean();

        $status = http_response_code();
        http_response_code(200);

        return ['status' => $status, 'body' => json_decode($output, true) ?? []];
    }
}
