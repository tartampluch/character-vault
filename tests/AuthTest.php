<?php
/**
 * @file tests/AuthTest.php
 * @description PHPUnit tests for authentication endpoints.
 *
 * TESTS:
 *   - Login with valid credentials: sets session, returns user data.
 *   - Login with wrong password: returns 401.
 *   - Login with unknown username: returns 401 (no timing leak).
 *   - Protected endpoints reject unauthenticated requests with 401.
 *   - Session persists across multiple requireAuth() calls.
 *   - Logout clears session state.
 *   - handleMe() returns user info + CSRF token when authenticated.
 *
 * @see api/auth.php
 * @see ARCHITECTURE.md Phase 16.4
 */

declare(strict_types=1);

require_once __DIR__ . '/TestCase.php';

class AuthTest extends TestCase
{
    private const TEST_USER_ID    = 'user_auth_test_001';
    private const TEST_GM_ID      = 'user_gm_auth_test_001';
    private const TEST_PASSWORD   = 'SecureP@ssw0rd!';
    private const TEST_WRONG_PASS = 'WrongPassword123';

    protected function setUp(): void
    {
        parent::setUp();
        $this->createUser(self::TEST_USER_ID, false, 'authuser', self::TEST_PASSWORD);
        $this->createUser(self::TEST_GM_ID, true, 'gmuser', self::TEST_PASSWORD);
    }

    // ============================================================
    // LOGIN TESTS
    // ============================================================

    /**
     * Login with valid credentials returns 200 and user data.
     */
    public function testLoginWithValidCredentialsReturns200(): void
    {
        $response = $this->callControllerWithInput(
            fn() => handleLogin(),
            json_encode(['username' => 'authuser', 'password' => self::TEST_PASSWORD])
        );

        $this->assertEquals(200, $response['status']);
        $this->assertEquals(self::TEST_USER_ID, $response['body']['id']);
        $this->assertEquals('authuser', $response['body']['username']);
        $this->assertFalse($response['body']['is_game_master']);
    }

    /**
     * Login sets the session variables correctly.
     */
    public function testLoginSetsSessionVariables(): void
    {
        $this->callControllerWithInput(
            fn() => handleLogin(),
            json_encode(['username' => 'authuser', 'password' => self::TEST_PASSWORD])
        );

        // After login, session should be populated
        $this->assertEquals(self::TEST_USER_ID, $_SESSION['user_id'] ?? null);
        $this->assertEquals('authuser', $_SESSION['username'] ?? null);
        $this->assertFalse((bool)($_SESSION['is_game_master'] ?? true));
    }

    /**
     * GM login returns is_game_master: true.
     */
    public function testGmLoginReturnsIsGameMasterTrue(): void
    {
        $response = $this->callControllerWithInput(
            fn() => handleLogin(),
            json_encode(['username' => 'gmuser', 'password' => self::TEST_PASSWORD])
        );

        $this->assertEquals(200, $response['status']);
        $this->assertTrue($response['body']['is_game_master']);
    }

    /**
     * Login with wrong password returns 401.
     */
    public function testLoginWithWrongPasswordReturns401(): void
    {
        $response = $this->callControllerWithInput(
            fn() => handleLogin(),
            json_encode(['username' => 'authuser', 'password' => self::TEST_WRONG_PASS])
        );

        $this->assertEquals(401, $response['status']);
        $this->assertEquals('InvalidCredentials', $response['body']['error']);
    }

    /**
     * Login with unknown username returns 401 (not 404).
     * IMPORTANT: Must return the same error as wrong password to prevent
     * username enumeration attacks.
     */
    public function testLoginWithUnknownUsernameReturns401(): void
    {
        $response = $this->callControllerWithInput(
            fn() => handleLogin(),
            json_encode(['username' => 'nosuchuser', 'password' => 'anypassword'])
        );

        $this->assertEquals(401, $response['status']);
        $this->assertEquals('InvalidCredentials', $response['body']['error'],
            'Unknown username should return InvalidCredentials, not NotFound (prevents enumeration)');
    }

    /**
     * Login with empty credentials returns 400.
     */
    public function testLoginWithEmptyCredentialsReturns400(): void
    {
        $response = $this->callControllerWithInput(
            fn() => handleLogin(),
            json_encode(['username' => '', 'password' => ''])
        );

        $this->assertEquals(400, $response['status']);
        $this->assertEquals('BadRequest', $response['body']['error']);
    }

    // ============================================================
    // REQUIREAUTH TESTS
    // ============================================================

    /**
     * Unauthenticated request to a protected endpoint returns 401.
     * CHECKPOINTS.md: "Test that protected endpoints reject unauthenticated requests with 401."
     */
    public function testUnauthenticatedRequestReturns401(): void
    {
        $this->simulateLogout();  // Ensure no session

        // Try to access a protected endpoint
        $_GET = ['campaignId' => 'camp_test'];
        $response = $this->callController(fn() => CharacterController::index());

        $this->assertEquals(401, $response['status']);
        $this->assertEquals('Unauthorized', $response['body']['error']);
    }

    /**
     * Multiple calls to requireAuth() in the same session work correctly.
     * Simulates what happens during a request cycle where auth is checked multiple times.
     */
    public function testSessionPersistsAcrossRequireAuthCalls(): void
    {
        $this->simulateLogin(self::TEST_USER_ID, false, 'authuser');

        // First call
        $user1 = requireAuth();
        $this->assertEquals(self::TEST_USER_ID, $user1['id']);

        // Second call (should return same data without re-querying DB)
        $user2 = requireAuth();
        $this->assertEquals(self::TEST_USER_ID, $user2['id']);
        $this->assertEquals($user1['id'], $user2['id']);
    }

    // ============================================================
    // LOGOUT TESTS
    // ============================================================

    /**
     * Logout clears the session.
     * CHECKPOINTS.md: "Test that session persists across requests."
     * (Inverse: after logout, session is gone.)
     */
    public function testLogoutClearsSession(): void
    {
        // Login first
        $this->simulateLogin(self::TEST_USER_ID, false, 'authuser');
        $this->assertNotEmpty($_SESSION['user_id'], 'Session should be set after login');

        // Logout
        $response = $this->callController(fn() => handleLogout());

        $this->assertEquals(200, $response['status']);
        $this->assertEmpty($_SESSION['user_id'] ?? '', 'Session should be cleared after logout');
    }

    // ============================================================
    // handleMe() TESTS
    // ============================================================

    /**
     * GET /api/auth/me returns current user info + CSRF token.
     */
    public function testHandleMeReturnsUserInfoAndCsrfToken(): void
    {
        $this->simulateLogin(self::TEST_USER_ID, false, 'authuser');

        $response = $this->callController(fn() => handleMe());

        $this->assertEquals(200, $response['status']);
        $this->assertEquals(self::TEST_USER_ID, $response['body']['id']);
        $this->assertEquals('authuser', $response['body']['username']);
        $this->assertFalse($response['body']['is_game_master']);
        $this->assertArrayHasKey('csrfToken', $response['body'],
            'handleMe() must return csrfToken for frontend to use in requests');
        $this->assertNotEmpty($response['body']['csrfToken']);
    }

    /**
     * GET /api/auth/me returns 401 if not authenticated.
     */
    public function testHandleMeReturns401WhenUnauthenticated(): void
    {
        $this->simulateLogout();

        $response = $this->callController(fn() => handleMe());

        $this->assertEquals(401, $response['status']);
    }
}
