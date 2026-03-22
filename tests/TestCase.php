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
 *   `simulateLogin($userId, $isGM)` sets the session variables that requireAuth() checks.
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
     * @param string $userId     - The user ID to authenticate as.
     * @param bool   $isGM       - Whether the user is a Game Master.
     * @param string $username   - Display username.
     */
    protected function simulateLogin(string $userId, bool $isGM = false, string $username = 'testuser'): void
    {
        $_SESSION['user_id']        = $userId;
        $_SESSION['username']       = $username;
        $_SESSION['display_name']   = ucfirst($username);
        $_SESSION['is_game_master'] = $isGM;
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
     * @param string $id        - User ID (UUID).
     * @param bool   $isGM      - Whether the user is a Game Master.
     * @param string $username  - Username.
     * @param string $password  - Plaintext password (hashed internally).
     * @return array The created user row.
     */
    protected function createUser(
        string $id = 'user_test_001',
        bool $isGM = false,
        string $username = 'testuser',
        string $password = 'password123'
    ): array {
        $pdo = Database::getInstance();
        $stmt = $pdo->prepare(
            'INSERT INTO users (id, username, password_hash, display_name, is_game_master) VALUES (?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $id,
            $username,
            hashPassword($password),
            ucfirst($username),
            $isGM ? 1 : 0,
        ]);

        return ['id' => $id, 'username' => $username, 'is_game_master' => $isGM];
    }

    /**
     * Creates a test campaign in the in-memory database.
     */
    protected function createCampaign(
        string $id = 'camp_test_001',
        string $ownerId = 'user_test_001',
        string $title = 'Test Campaign'
    ): array {
        $pdo = Database::getInstance();
        $stmt = $pdo->prepare(
            'INSERT INTO campaigns (id, title, description, owner_id, chapters_json, enabled_rule_sources_json, gm_global_overrides_text, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([$id, $title, '', $ownerId, '[]', '[]', '[]', time()]);
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
