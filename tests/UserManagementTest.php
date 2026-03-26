<?php
/**
 * @file tests/UserManagementTest.php
 * @description PHPUnit tests for Phase 22 user management: auth changes, UserController.
 *
 * TESTS (21 scenarios):
 *
 * Auth / no-password flow:
 *   (1)  Admin bootstrap — empty DB seeds admin user with empty password hash
 *   (2)  No-password login within 7 days returns 200 + needs_password_setup: true
 *   (3)  No-password login after 7 days returns 403 AccountExpired and sets is_suspended=1
 *   (4)  PUT /api/auth/setup-password stores bcrypt hash and clears session flag
 *   (5)  Subsequent login with password works normally
 *   (6)  Suspended account login returns 403 AccountSuspended
 *   (7)  Reinstated account (was suspended) can log in again
 *
 * UserController (admin-only CRUD):
 *   (8)  Admin creates user (username + player_name, no password, role=player)
 *   (9)  Duplicate username returns 409
 *   (10) Admin updates player_name
 *   (11) Admin changes role
 *   (12) Admin suspends a user
 *   (13) Admin reinstates a user
 *   (14) Admin deletes a user
 *   (15) Self-edit, self-suspend, and self-delete all return 400
 *   (16) Non-admin user requesting any /api/users endpoint returns 403
 *
 * @see api/auth.php
 * @see api/controllers/UserController.php
 * @see ARCHITECTURE.md Phase 22
 */

declare(strict_types=1);

require_once __DIR__ . '/TestCase.php';

class UserManagementTest extends TestCase
{
    private const ADMIN_ID  = 'user_admin_test_001';
    private const PLAYER_ID = 'user_player_test_001';
    private const GM_ID     = 'user_gm_test_001';
    private const PASSWORD  = 'SecureP@ssword!';

    protected function setUp(): void
    {
        parent::setUp();
        // Create a standard admin user for most tests.
        // Note: parent::setUp() already ran migrate(), which bootstraps the
        // real 'admin' user if the DB was empty. We create ADDITIONAL test users.
        $this->createUser(self::ADMIN_ID,  'admin',  'testadmin',  self::PASSWORD);
        $this->createUser(self::PLAYER_ID, 'player', 'testplayer', self::PASSWORD);
        $this->createUser(self::GM_ID,     'gm',     'testgm',     self::PASSWORD);
    }

    // =========================================================================
    // (1) ADMIN BOOTSTRAP
    // =========================================================================

    /**
     * When the database is freshly created (users table empty), migrate() seeds
     * a default 'admin' user with an empty password hash and role='admin'.
     */
    public function testAdminBootstrapCreatesAdminOnEmptyDb(): void
    {
        // Reset to a truly empty DB and re-run migrations.
        Database::reset();
        $pdo = Database::getInstance();
        migrate($pdo);

        $stmt = $pdo->prepare('SELECT * FROM users WHERE username = ?');
        $stmt->execute(['admin']);
        $admin = $stmt->fetch(PDO::FETCH_ASSOC);

        $this->assertNotFalse($admin, 'Admin user should be created on first migration');
        $this->assertEquals('admin', $admin['username']);
        $this->assertEquals('',      $admin['password_hash'], 'Bootstrap admin must have empty password hash');
        $this->assertEquals('admin', $admin['role']);
        $this->assertEquals(0,       (int)$admin['is_suspended']);
    }

    // =========================================================================
    // (2) NO-PASSWORD LOGIN — within 7-day window
    // =========================================================================

    /**
     * A new account with empty password_hash can log in within 7 days.
     * The response contains needs_password_setup: true.
     */
    public function testNoPasswordLoginWithin7DaysReturnsNeedsSetup(): void
    {
        // Create a no-password account (created_at = now)
        $this->createUser('user_nopass_001', 'player', 'newuser', '');

        $response = $this->callControllerWithInput(
            fn() => handleLogin(),
            json_encode(['username' => 'newuser', 'password' => ''])
        );

        $this->assertEquals(200, $response['status'], 'No-password login within 7 days should succeed');
        $this->assertTrue($response['body']['needs_password_setup'] ?? false,
            'Response must include needs_password_setup: true');
        $this->assertEquals('player', $response['body']['role']);
        $this->assertTrue($_SESSION['needs_password_setup'] ?? false,
            'Session flag needs_password_setup must be set');
    }

    // =========================================================================
    // (3) NO-PASSWORD LOGIN — after 7-day window
    // =========================================================================

    /**
     * A no-password account whose created_at is > 7 days ago is auto-suspended
     * on login and the response is 403 AccountExpired.
     */
    public function testNoPasswordLoginAfter7DaysReturns403AndSuspendsAccount(): void
    {
        $eightDaysAgo = time() - (8 * 24 * 3600);
        $pdo = Database::getInstance();
        $pdo->exec("
            INSERT INTO users (id, username, password_hash, display_name, role, is_game_master, is_suspended, created_at)
            VALUES ('user_expired_001', 'expireduser', '', 'Expired', 'player', 0, 0, {$eightDaysAgo})
        ");

        $response = $this->callControllerWithInput(
            fn() => handleLogin(),
            json_encode(['username' => 'expireduser', 'password' => ''])
        );

        $this->assertEquals(403, $response['status']);
        $this->assertEquals('AccountExpired', $response['body']['error']);

        // Verify account was auto-suspended in the DB
        $stmt = $pdo->prepare('SELECT is_suspended FROM users WHERE id = ?');
        $stmt->execute(['user_expired_001']);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        $this->assertEquals(1, (int)$row['is_suspended'],
            'Auto-suspend should set is_suspended=1 in the database');
    }

    // =========================================================================
    // (4) PUT /api/auth/setup-password — stores hash, clears session flag
    // =========================================================================

    /**
     * setup-password stores the bcrypt hash, clears the session flag, and
     * returns the updated user object.
     */
    public function testSetupPasswordStoresHashAndClearsFlag(): void
    {
        // Simulate a no-password account that just logged in
        $this->createUser('user_nopass_002', 'player', 'freshuser', '');
        $this->simulateLogin('user_nopass_002', 'player', 'freshuser');
        $_SESSION['needs_password_setup'] = true;

        $response = $this->callControllerWithInput(
            fn() => handleSetupPassword(),
            json_encode(['password' => 'NewPassword123!'])
        );

        $this->assertEquals(200, $response['status']);
        $this->assertArrayHasKey('id', $response['body']);

        // Session flag must be cleared
        $this->assertEmpty($_SESSION['needs_password_setup'] ?? '',
            'needs_password_setup session flag must be cleared after setup');

        // Password hash must be stored (non-empty) in the DB
        $pdo  = Database::getInstance();
        $stmt = $pdo->prepare('SELECT password_hash FROM users WHERE id = ?');
        $stmt->execute(['user_nopass_002']);
        $hash = $stmt->fetchColumn();
        $this->assertNotEmpty($hash, 'password_hash must be stored after setup');
        $this->assertTrue(password_verify('NewPassword123!', $hash),
            'Stored hash must verify the new password');
    }

    // =========================================================================
    // (5) SUBSEQUENT LOGIN WITH PASSWORD
    // =========================================================================

    /**
     * After setup-password, the user can log in with their new password.
     */
    public function testLoginWithPasswordAfterSetupWorks(): void
    {
        // Set up: create account, store a password hash manually (as setup would)
        $pdo = Database::getInstance();
        $hash = password_hash('MyNewPass99!', PASSWORD_BCRYPT, ['cost' => 4]);
        $pdo->exec("INSERT INTO users (id, username, password_hash, display_name, role, is_game_master)
                    VALUES ('user_postsetup_001', 'postsetup', '{$hash}', 'PostSetup', 'player', 0)");

        $response = $this->callControllerWithInput(
            fn() => handleLogin(),
            json_encode(['username' => 'postsetup', 'password' => 'MyNewPass99!'])
        );

        $this->assertEquals(200, $response['status']);
        $this->assertEquals('postsetup', $response['body']['username']);
        // needs_password_setup should NOT be in the response when the user has a password
        $this->assertArrayNotHasKey('needs_password_setup', $response['body']);
    }

    // =========================================================================
    // (6) SUSPENDED ACCOUNT — login returns 403
    // =========================================================================

    /**
     * A suspended account is rejected before any password check with 403 AccountSuspended.
     */
    public function testSuspendedAccountLoginReturns403(): void
    {
        $this->createUser('user_suspended_001', 'player', 'suspendeduser', self::PASSWORD, true);

        $response = $this->callControllerWithInput(
            fn() => handleLogin(),
            json_encode(['username' => 'suspendeduser', 'password' => self::PASSWORD])
        );

        $this->assertEquals(403, $response['status']);
        $this->assertEquals('AccountSuspended', $response['body']['error']);
    }

    // =========================================================================
    // (7) REINSTATED ACCOUNT — can log in
    // =========================================================================

    /**
     * After admin reinstates a suspended user, that user can log in again.
     */
    public function testReinstatedAccountCanLogin(): void
    {
        // Create a suspended user
        $this->createUser('user_reinstated_001', 'player', 'reinstateduser', self::PASSWORD, true);

        // Admin reinstates them directly in DB (bypassing controller to isolate this test)
        $pdo = Database::getInstance();
        $pdo->prepare('UPDATE users SET is_suspended = 0 WHERE id = ?')
            ->execute(['user_reinstated_001']);

        $response = $this->callControllerWithInput(
            fn() => handleLogin(),
            json_encode(['username' => 'reinstateduser', 'password' => self::PASSWORD])
        );

        $this->assertEquals(200, $response['status']);
        $this->assertEquals('reinstateduser', $response['body']['username']);
    }

    // =========================================================================
    // (8) ADMIN CREATES USER
    // =========================================================================

    /**
     * Admin can create a new user with username + player_name.
     * The new account has: password_hash='', role='player', is_suspended=0.
     */
    public function testAdminCreatesUser(): void
    {
        $this->simulateLogin(self::ADMIN_ID, 'admin', 'testadmin');

        $response = $this->callControllerWithInput(
            fn() => UserController::create(),
            json_encode(['username' => 'brandnewuser', 'player_name' => 'Brand New'])
        );

        $this->assertEquals(201, $response['status']);
        $this->assertEquals('brandnewuser', $response['body']['username']);
        $this->assertEquals('Brand New',    $response['body']['player_name']);
        $this->assertEquals('player',       $response['body']['role']);
        $this->assertFalse($response['body']['is_suspended']);

        // Verify in DB: password_hash is empty sentinel
        $pdo  = Database::getInstance();
        $stmt = $pdo->prepare('SELECT password_hash FROM users WHERE username = ?');
        $stmt->execute(['brandnewuser']);
        $this->assertEquals('', $stmt->fetchColumn(), 'New user must have empty password hash');
    }

    // =========================================================================
    // (9) DUPLICATE USERNAME — 409
    // =========================================================================

    /**
     * Creating a user with an already-taken username returns 409 Conflict.
     */
    public function testCreateUserDuplicateUsernameReturns409(): void
    {
        $this->simulateLogin(self::ADMIN_ID, 'admin', 'testadmin');

        $response = $this->callControllerWithInput(
            fn() => UserController::create(),
            json_encode(['username' => 'testplayer', 'player_name' => 'Duplicate'])
        );

        $this->assertEquals(409, $response['status']);
        $this->assertEquals('Conflict', $response['body']['error']);
    }

    // =========================================================================
    // (10) ADMIN UPDATES PLAYER NAME
    // =========================================================================

    /**
     * Admin can update a user's player_name (display_name in DB).
     */
    public function testAdminUpdatesPlayerName(): void
    {
        $this->simulateLogin(self::ADMIN_ID, 'admin', 'testadmin');

        $response = $this->callControllerWithInput(
            fn() => UserController::update(self::PLAYER_ID),
            json_encode(['player_name' => 'Updated Player Name'])
        );

        $this->assertEquals(200, $response['status']);
        $this->assertEquals('Updated Player Name', $response['body']['player_name']);

        // Verify in DB
        $pdo  = Database::getInstance();
        $stmt = $pdo->prepare('SELECT display_name FROM users WHERE id = ?');
        $stmt->execute([self::PLAYER_ID]);
        $this->assertEquals('Updated Player Name', $stmt->fetchColumn());
    }

    // =========================================================================
    // (11) ADMIN CHANGES ROLE
    // =========================================================================

    /**
     * Admin can promote a player to GM or admin.
     */
    public function testAdminChangesRole(): void
    {
        $this->simulateLogin(self::ADMIN_ID, 'admin', 'testadmin');

        $response = $this->callControllerWithInput(
            fn() => UserController::updateRole(self::PLAYER_ID),
            json_encode(['role' => 'gm'])
        );

        $this->assertEquals(200, $response['status']);
        $this->assertEquals('gm',  $response['body']['role']);
        $this->assertTrue($response['body']['is_game_master']);

        // Verify is_game_master column was also updated
        $pdo  = Database::getInstance();
        $stmt = $pdo->prepare('SELECT role, is_game_master FROM users WHERE id = ?');
        $stmt->execute([self::PLAYER_ID]);
        $row  = $stmt->fetch(PDO::FETCH_ASSOC);
        $this->assertEquals('gm', $row['role']);
        $this->assertEquals(1,    (int)$row['is_game_master']);
    }

    // =========================================================================
    // (12) ADMIN SUSPENDS A USER
    // =========================================================================

    /**
     * Admin can suspend a user account.
     */
    public function testAdminSuspendsUser(): void
    {
        $this->simulateLogin(self::ADMIN_ID, 'admin', 'testadmin');

        $response = $this->callController(
            fn() => UserController::suspend(self::PLAYER_ID)
        );

        $this->assertEquals(200, $response['status']);
        $this->assertTrue($response['body']['is_suspended']);

        $pdo  = Database::getInstance();
        $stmt = $pdo->prepare('SELECT is_suspended FROM users WHERE id = ?');
        $stmt->execute([self::PLAYER_ID]);
        $this->assertEquals(1, (int)$stmt->fetchColumn());
    }

    // =========================================================================
    // (13) ADMIN REINSTATES A USER
    // =========================================================================

    /**
     * Admin can reinstate a suspended user.
     */
    public function testAdminReinstate(): void
    {
        // First suspend the player
        $this->createUser('user_torestore_001', 'player', 'torestore', self::PASSWORD, true);
        $this->simulateLogin(self::ADMIN_ID, 'admin', 'testadmin');

        $response = $this->callController(
            fn() => UserController::reinstate('user_torestore_001')
        );

        $this->assertEquals(200, $response['status']);
        $this->assertFalse($response['body']['is_suspended']);

        $pdo  = Database::getInstance();
        $stmt = $pdo->prepare('SELECT is_suspended FROM users WHERE id = ?');
        $stmt->execute(['user_torestore_001']);
        $this->assertEquals(0, (int)$stmt->fetchColumn());
    }

    // =========================================================================
    // (14) ADMIN DELETES A USER
    // =========================================================================

    /**
     * Admin can delete a user account.
     */
    public function testAdminDeletesUser(): void
    {
        $this->simulateLogin(self::ADMIN_ID, 'admin', 'testadmin');

        $response = $this->callController(
            fn() => UserController::delete(self::PLAYER_ID)
        );

        $this->assertEquals(200, $response['status']);
        $this->assertTrue($response['body']['deleted']);

        $pdo  = Database::getInstance();
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM users WHERE id = ?');
        $stmt->execute([self::PLAYER_ID]);
        $this->assertEquals(0, (int)$stmt->fetchColumn(), 'User must be removed from DB');
    }

    // =========================================================================
    // (15) SELF-EDIT / SELF-SUSPEND / SELF-DELETE — all return 400
    // =========================================================================

    /**
     * Admin cannot edit their own player_name via PUT /api/users/{id}.
     */
    public function testAdminCannotEditOwnAccount(): void
    {
        $this->simulateLogin(self::ADMIN_ID, 'admin', 'testadmin');

        $response = $this->callControllerWithInput(
            fn() => UserController::update(self::ADMIN_ID),
            json_encode(['player_name' => 'Self Edit Attempt'])
        );

        $this->assertEquals(400, $response['status']);
        $this->assertEquals('BadRequest', $response['body']['error']);
    }

    /**
     * Admin cannot change their own role.
     */
    public function testAdminCannotChangeOwnRole(): void
    {
        $this->simulateLogin(self::ADMIN_ID, 'admin', 'testadmin');

        $response = $this->callControllerWithInput(
            fn() => UserController::updateRole(self::ADMIN_ID),
            json_encode(['role' => 'player'])
        );

        $this->assertEquals(400, $response['status']);
        $this->assertEquals('BadRequest', $response['body']['error']);
    }

    /**
     * Admin cannot suspend their own account.
     */
    public function testAdminCannotSuspendOwnAccount(): void
    {
        $this->simulateLogin(self::ADMIN_ID, 'admin', 'testadmin');

        $response = $this->callController(
            fn() => UserController::suspend(self::ADMIN_ID)
        );

        $this->assertEquals(400, $response['status']);
        $this->assertEquals('BadRequest', $response['body']['error']);
    }

    /**
     * Admin cannot delete their own account.
     */
    public function testAdminCannotDeleteOwnAccount(): void
    {
        $this->simulateLogin(self::ADMIN_ID, 'admin', 'testadmin');

        $response = $this->callController(
            fn() => UserController::delete(self::ADMIN_ID)
        );

        $this->assertEquals(400, $response['status']);
        $this->assertEquals('BadRequest', $response['body']['error']);
    }

    // =========================================================================
    // (16) NON-ADMIN — all /api/users endpoints return 403
    // =========================================================================

    /**
     * A player (non-admin) requesting GET /api/users receives 403 Forbidden.
     */
    public function testNonAdminCannotListUsers(): void
    {
        $this->simulateLogin(self::PLAYER_ID, 'player', 'testplayer');

        $response = $this->callController(fn() => UserController::index());

        $this->assertEquals(403, $response['status']);
        $this->assertEquals('Forbidden', $response['body']['error']);
    }

    /**
     * A GM (non-admin) requesting POST /api/users receives 403 Forbidden.
     */
    public function testGmCannotCreateUsers(): void
    {
        $this->simulateLogin(self::GM_ID, 'gm', 'testgm');

        $response = $this->callControllerWithInput(
            fn() => UserController::create(),
            json_encode(['username' => 'gmcreated', 'player_name' => 'GM Created'])
        );

        $this->assertEquals(403, $response['status']);
        $this->assertEquals('Forbidden', $response['body']['error']);
    }

    /**
     * A player requesting PUT /api/users/{id}/role receives 403.
     */
    public function testPlayerCannotChangeRoles(): void
    {
        $this->simulateLogin(self::PLAYER_ID, 'player', 'testplayer');

        $response = $this->callControllerWithInput(
            fn() => UserController::updateRole(self::GM_ID),
            json_encode(['role' => 'admin'])
        );

        $this->assertEquals(403, $response['status']);
    }

    // =========================================================================
    // ADDITIONAL: GET /api/users returns all users with campaign data
    // =========================================================================

    /**
     * GET /api/users returns all users with correct fields including campaigns array.
     */
    public function testListUsersReturnsAllUsersWithCampaigns(): void
    {
        $this->simulateLogin(self::ADMIN_ID, 'admin', 'testadmin');

        $response = $this->callController(fn() => UserController::index());

        $this->assertEquals(200, $response['status']);
        $this->assertIsArray($response['body']);

        // Should have at least the 3 test users + the migrate-created admin
        $this->assertGreaterThanOrEqual(3, count($response['body']));

        // Each user must have the required fields
        $user = $response['body'][0];
        $this->assertArrayHasKey('id',            $user);
        $this->assertArrayHasKey('username',      $user);
        $this->assertArrayHasKey('player_name',   $user);
        $this->assertArrayHasKey('role',          $user);
        $this->assertArrayHasKey('is_suspended',  $user);
        $this->assertArrayHasKey('created_at',    $user);
        $this->assertArrayHasKey('last_login_at', $user);
        $this->assertArrayHasKey('campaigns',     $user);
        $this->assertIsArray($user['campaigns']);
    }

    // =========================================================================
    // ADDITIONAL: role returned in login response
    // =========================================================================

    /**
     * Login response includes 'role' field (Phase 22).
     */
    public function testLoginResponseIncludesRole(): void
    {
        $response = $this->callControllerWithInput(
            fn() => handleLogin(),
            json_encode(['username' => 'testadmin', 'password' => self::PASSWORD])
        );

        $this->assertEquals(200, $response['status']);
        $this->assertArrayHasKey('role', $response['body']);
        $this->assertEquals('admin', $response['body']['role']);
    }

    /**
     * setup-password rejects empty password with 400.
     */
    public function testSetupPasswordRejectsEmptyPassword(): void
    {
        $this->createUser('user_nopass_003', 'player', 'freshuser2', '');
        $this->simulateLogin('user_nopass_003', 'player', 'freshuser2');
        $_SESSION['needs_password_setup'] = true;

        $response = $this->callControllerWithInput(
            fn() => handleSetupPassword(),
            json_encode(['password' => ''])
        );

        $this->assertEquals(400, $response['status']);
        $this->assertEquals('BadRequest', $response['body']['error']);
    }

    /**
     * setup-password without the session flag returns 403.
     */
    public function testSetupPasswordWithoutFlagReturns403(): void
    {
        $this->simulateLogin(self::PLAYER_ID, 'player', 'testplayer');
        // Intentionally NOT setting $_SESSION['needs_password_setup']

        $response = $this->callControllerWithInput(
            fn() => handleSetupPassword(),
            json_encode(['password' => 'ValidPass123!'])
        );

        $this->assertEquals(403, $response['status']);
        $this->assertEquals('Forbidden', $response['body']['error']);
    }

    // =========================================================================
    // CHANGE PASSWORD (Phase 22.14)
    // =========================================================================

    /**
     * A user can change their own password when they supply the correct current password.
     * The new hash is stored and needs_password_setup is cleared.
     */
    public function testChangePasswordSuccessWithCorrectCurrentPassword(): void
    {
        $this->simulateLogin(self::PLAYER_ID, 'player', 'testplayer');

        $response = $this->callControllerWithInput(
            fn() => handleChangePassword(),
            json_encode([
                'current_password' => self::PASSWORD,
                'new_password'     => 'NewSecurePass99!',
            ])
        );

        $this->assertEquals(200, $response['status']);
        $this->assertEquals('testplayer', $response['body']['username']);

        // Verify new hash works
        $pdo  = Database::getInstance();
        $stmt = $pdo->prepare('SELECT password_hash FROM users WHERE id = ?');
        $stmt->execute([self::PLAYER_ID]);
        $newHash = $stmt->fetchColumn();
        $this->assertTrue(password_verify('NewSecurePass99!', $newHash),
            'New password hash must verify correctly');
    }

    /**
     * Wrong current password returns 400 WrongPassword.
     */
    public function testChangePasswordWrongCurrentPasswordReturns400(): void
    {
        $this->simulateLogin(self::PLAYER_ID, 'player', 'testplayer');

        $response = $this->callControllerWithInput(
            fn() => handleChangePassword(),
            json_encode([
                'current_password' => 'WrongCurrentPassword!',
                'new_password'     => 'NewSecurePass99!',
            ])
        );

        $this->assertEquals(400, $response['status']);
        $this->assertEquals('WrongPassword', $response['body']['error']);
    }

    /**
     * Empty new password returns 400 BadRequest.
     */
    public function testChangePasswordEmptyNewPasswordReturns400(): void
    {
        $this->simulateLogin(self::PLAYER_ID, 'player', 'testplayer');

        $response = $this->callControllerWithInput(
            fn() => handleChangePassword(),
            json_encode([
                'current_password' => self::PASSWORD,
                'new_password'     => '',
            ])
        );

        $this->assertEquals(400, $response['status']);
        $this->assertEquals('BadRequest', $response['body']['error']);
    }

    /**
     * No-password account (password_hash = '') skips the current_password check.
     * The user just supplies the new password and it is accepted.
     */
    public function testChangePasswordSkipsCurrentPasswordForNoPasswordAccount(): void
    {
        $this->createUser('user_nopass_cp_001', 'player', 'nopwcp', '');
        $this->simulateLogin('user_nopass_cp_001', 'player', 'nopwcp');

        $response = $this->callControllerWithInput(
            fn() => handleChangePassword(),
            json_encode([
                'current_password' => '', // blank — should be accepted
                'new_password'     => 'FirstTimePassword1!',
            ])
        );

        $this->assertEquals(200, $response['status']);

        // Verify hash is stored
        $pdo  = Database::getInstance();
        $stmt = $pdo->prepare('SELECT password_hash FROM users WHERE id = ?');
        $stmt->execute(['user_nopass_cp_001']);
        $hash = $stmt->fetchColumn();
        $this->assertTrue(password_verify('FirstTimePassword1!', $hash));
    }

    /**
     * Unauthenticated call to change-password returns 401.
     */
    public function testChangePasswordUnauthenticatedReturns401(): void
    {
        $this->simulateLogout();

        $response = $this->callControllerWithInput(
            fn() => handleChangePassword(),
            json_encode([
                'current_password' => 'anything',
                'new_password'     => 'NewPass123!',
            ])
        );

        $this->assertEquals(401, $response['status']);
    }

    // =========================================================================
    // RESET PASSWORD (Phase 22.14)
    // =========================================================================

    /**
     * Admin can reset any user's password (blanks password_hash).
     * There is no self-edit restriction for reset-password.
     */
    public function testAdminResetsUserPassword(): void
    {
        $this->simulateLogin(self::ADMIN_ID, 'admin', 'testadmin');

        $response = $this->callController(
            fn() => UserController::resetPassword(self::PLAYER_ID)
        );

        $this->assertEquals(200, $response['status']);
        $this->assertTrue($response['body']['password_reset']);

        // Verify password_hash was blanked in DB
        $pdo  = Database::getInstance();
        $stmt = $pdo->prepare('SELECT password_hash FROM users WHERE id = ?');
        $stmt->execute([self::PLAYER_ID]);
        $this->assertEquals('', $stmt->fetchColumn(),
            'password_hash must be empty after reset');
    }

    /**
     * Admin CAN reset their own password (no self-restriction on this endpoint).
     */
    public function testAdminCanResetOwnPassword(): void
    {
        $this->simulateLogin(self::ADMIN_ID, 'admin', 'testadmin');

        $response = $this->callController(
            fn() => UserController::resetPassword(self::ADMIN_ID)
        );

        $this->assertEquals(200, $response['status'],
            'reset-password must have no self-edit restriction');
    }

    /**
     * Non-admin cannot reset passwords — returns 403.
     */
    public function testNonAdminCannotResetPassword(): void
    {
        $this->simulateLogin(self::PLAYER_ID, 'player', 'testplayer');

        $response = $this->callController(
            fn() => UserController::resetPassword(self::GM_ID)
        );

        $this->assertEquals(403, $response['status']);
        $this->assertEquals('Forbidden', $response['body']['error']);
    }

    /**
     * Resetting the password of a non-existent user returns 404.
     */
    public function testResetPasswordUnknownUserReturns404(): void
    {
        $this->simulateLogin(self::ADMIN_ID, 'admin', 'testadmin');

        $response = $this->callController(
            fn() => UserController::resetPassword('user_nonexistent_999')
        );

        $this->assertEquals(404, $response['status']);
        $this->assertEquals('NotFound', $response['body']['error']);
    }

    /**
     * After reset, the user's next login returns needs_password_setup: true.
     */
    public function testAfterResetUserGetsForcedToSetupPassword(): void
    {
        // Reset the player's password via admin endpoint
        $this->simulateLogin(self::ADMIN_ID, 'admin', 'testadmin');
        UserController::resetPassword(self::PLAYER_ID);

        // Now log in as the player (no password)
        $this->simulateLogout();
        $response = $this->callControllerWithInput(
            fn() => handleLogin(),
            json_encode(['username' => 'testplayer', 'password' => ''])
        );

        $this->assertEquals(200, $response['status']);
        $this->assertTrue($response['body']['needs_password_setup'] ?? false,
            'After password reset, next login must return needs_password_setup: true');
    }
}
