<?php
/**
 * @file tests/DisplayNameTest.php
 * @description PHPUnit tests for two display-name / username features:
 *
 *   A. PUT /api/auth/display-name  — self-service rename for any authenticated user
 *      (1)  Authenticated user can rename themselves — 200, DB updated, session updated
 *      (2)  Empty display_name returns 400 BadRequest
 *      (3)  Whitespace-only display_name is treated as empty → 400
 *      (4)  Unauthenticated request returns 401
 *      (5)  Response body contains { id, display_name }
 *
 *   B. PUT /api/users/{id} — admin can now also update username (extended endpoint)
 *      (6)  Admin updates username only (player_name unchanged in body)
 *      (7)  Admin updates both username and player_name in one call
 *      (8)  Admin updates only player_name — username field absent → username unchanged
 *      (9)  Username conflict returns 409 Conflict
 *      (10) Changing to the same username is a no-op — accepted with 200
 *      (11) Empty username string returns 400 BadRequest
 *      (12) Response includes the new username field
 *      (13) Self-edit via admin endpoint still returns 400 (no regression)
 *      (14) Non-admin cannot call the endpoint — 403 Forbidden (no regression)
 *
 * @see api/auth.php                          handleUpdateDisplayName()
 * @see api/controllers/UserController.php    UserController::update()
 */

declare(strict_types=1);

require_once __DIR__ . '/TestCase.php';

class DisplayNameTest extends TestCase
{
    private const ADMIN_ID  = 'user_dn_admin_001';
    private const PLAYER_ID = 'user_dn_player_001';
    private const GM_ID     = 'user_dn_gm_001';
    private const PASSWORD  = 'SecureP@ssword!99';

    protected function setUp(): void
    {
        parent::setUp();
        $this->createUser(self::ADMIN_ID,  'admin',  'dnadmin',  self::PASSWORD);
        $this->createUser(self::PLAYER_ID, 'player', 'dnplayer', self::PASSWORD);
        $this->createUser(self::GM_ID,     'gm',     'dngm',     self::PASSWORD);
    }

    // =========================================================================
    // A. PUT /api/auth/display-name — self-service rename
    // =========================================================================

    /**
     * (1) Authenticated user can rename themselves.
     *     DB column display_name and the session variable are both updated.
     */
    public function testUpdateDisplayNameSuccess(): void
    {
        $this->simulateLogin(self::PLAYER_ID, 'player', 'dnplayer');

        $response = $this->callControllerWithInput(
            fn() => handleUpdateDisplayName(),
            json_encode(['display_name' => 'New Player Name'])
        );

        $this->assertEquals(200, $response['status']);

        // DB must reflect the new name
        $pdo  = Database::getInstance();
        $stmt = $pdo->prepare('SELECT display_name FROM users WHERE id = ?');
        $stmt->execute([self::PLAYER_ID]);
        $this->assertEquals('New Player Name', $stmt->fetchColumn(),
            'display_name column must be updated in the database');
    }

    /**
     * (2) Empty display_name is rejected with 400 BadRequest.
     */
    public function testUpdateDisplayNameEmptyReturns400(): void
    {
        $this->simulateLogin(self::PLAYER_ID, 'player', 'dnplayer');

        $response = $this->callControllerWithInput(
            fn() => handleUpdateDisplayName(),
            json_encode(['display_name' => ''])
        );

        $this->assertEquals(400, $response['status']);
        $this->assertEquals('BadRequest', $response['body']['error']);
    }

    /**
     * (3) Whitespace-only display_name is treated as empty and rejected with 400.
     *     PHP's trim() must strip the spaces before the empty-check.
     */
    public function testUpdateDisplayNameWhitespaceOnlyReturns400(): void
    {
        $this->simulateLogin(self::PLAYER_ID, 'player', 'dnplayer');

        $response = $this->callControllerWithInput(
            fn() => handleUpdateDisplayName(),
            json_encode(['display_name' => '   '])
        );

        $this->assertEquals(400, $response['status']);
        $this->assertEquals('BadRequest', $response['body']['error']);
    }

    /**
     * (4) Unauthenticated call returns 401 Unauthorized.
     */
    public function testUpdateDisplayNameUnauthenticatedReturns401(): void
    {
        $this->simulateLogout();

        $response = $this->callControllerWithInput(
            fn() => handleUpdateDisplayName(),
            json_encode(['display_name' => 'Hacker'])
        );

        $this->assertEquals(401, $response['status']);
        $this->assertEquals('Unauthorized', $response['body']['error']);
    }

    /**
     * (5) Response body on success contains { id, display_name }.
     */
    public function testUpdateDisplayNameResponseShape(): void
    {
        $this->simulateLogin(self::PLAYER_ID, 'player', 'dnplayer');

        $response = $this->callControllerWithInput(
            fn() => handleUpdateDisplayName(),
            json_encode(['display_name' => 'Shape Test'])
        );

        $this->assertEquals(200, $response['status']);
        $this->assertArrayHasKey('id',           $response['body']);
        $this->assertArrayHasKey('display_name', $response['body']);
        $this->assertEquals(self::PLAYER_ID, $response['body']['id']);
        $this->assertEquals('Shape Test',    $response['body']['display_name']);
    }

    /**
     * Session variable is updated so subsequent GET /api/auth/me calls
     * reflect the new name without requiring a fresh DB query.
     */
    public function testUpdateDisplayNameUpdatesSession(): void
    {
        $this->simulateLogin(self::PLAYER_ID, 'player', 'dnplayer');

        $this->callControllerWithInput(
            fn() => handleUpdateDisplayName(),
            json_encode(['display_name' => 'Session Name'])
        );

        $this->assertEquals('Session Name', $_SESSION['display_name'] ?? null,
            '$_SESSION[display_name] must be kept in sync after a successful rename');
    }

    /**
     * Admin can also rename themselves via this endpoint
     * (unlike PUT /api/users/{id} which blocks self-edits).
     */
    public function testAdminCanRenameViaDisplayNameEndpoint(): void
    {
        $this->simulateLogin(self::ADMIN_ID, 'admin', 'dnadmin');

        $response = $this->callControllerWithInput(
            fn() => handleUpdateDisplayName(),
            json_encode(['display_name' => 'Admin Renamed'])
        );

        $this->assertEquals(200, $response['status']);
        $this->assertEquals('Admin Renamed', $response['body']['display_name']);
    }

    // =========================================================================
    // B. PUT /api/users/{id} — admin can update username (extended)
    // =========================================================================

    /**
     * (6) Admin updates username only (player_name still required in body but
     *     can be the same as the existing value so it is unchanged in spirit).
     */
    public function testAdminUpdatesUsername(): void
    {
        $this->simulateLogin(self::ADMIN_ID, 'admin', 'dnadmin');

        $response = $this->callControllerWithInput(
            fn() => UserController::update(self::PLAYER_ID),
            json_encode([
                'username'    => 'dnplayer_renamed',
                'player_name' => 'Dnplayer',  // unchanged display name
            ])
        );

        $this->assertEquals(200, $response['status']);
        $this->assertEquals('dnplayer_renamed', $response['body']['username']);

        // Verify in DB
        $pdo  = Database::getInstance();
        $stmt = $pdo->prepare('SELECT username FROM users WHERE id = ?');
        $stmt->execute([self::PLAYER_ID]);
        $this->assertEquals('dnplayer_renamed', $stmt->fetchColumn(),
            'username column must be updated in the database');
    }

    /**
     * (7) Admin updates both username and player_name in a single PUT call.
     */
    public function testAdminUpdatesBothUsernameAndPlayerName(): void
    {
        $this->simulateLogin(self::ADMIN_ID, 'admin', 'dnadmin');

        $response = $this->callControllerWithInput(
            fn() => UserController::update(self::PLAYER_ID),
            json_encode([
                'username'    => 'completely_new',
                'player_name' => 'Completely New Player',
            ])
        );

        $this->assertEquals(200, $response['status']);
        $this->assertEquals('completely_new',        $response['body']['username']);
        $this->assertEquals('Completely New Player', $response['body']['player_name']);

        // Verify both columns in DB
        $pdo  = Database::getInstance();
        $stmt = $pdo->prepare('SELECT username, display_name FROM users WHERE id = ?');
        $stmt->execute([self::PLAYER_ID]);
        $row  = $stmt->fetch(\PDO::FETCH_ASSOC);
        $this->assertEquals('completely_new',        $row['username']);
        $this->assertEquals('Completely New Player', $row['display_name']);
    }

    /**
     * (8) When username is absent from the body, only player_name is updated —
     *     the existing username is preserved.
     */
    public function testAdminUpdatesPlayerNameWithoutChangingUsername(): void
    {
        $this->simulateLogin(self::ADMIN_ID, 'admin', 'dnadmin');

        $response = $this->callControllerWithInput(
            fn() => UserController::update(self::PLAYER_ID),
            json_encode(['player_name' => 'Display Only Change'])
        );

        $this->assertEquals(200, $response['status']);
        $this->assertEquals('Display Only Change', $response['body']['player_name']);

        // Original username must be unchanged in DB
        $pdo  = Database::getInstance();
        $stmt = $pdo->prepare('SELECT username FROM users WHERE id = ?');
        $stmt->execute([self::PLAYER_ID]);
        $this->assertEquals('dnplayer', $stmt->fetchColumn(),
            'username must remain unchanged when not included in the PUT body');
    }

    /**
     * (9) Attempting to change a username to one already taken returns 409 Conflict.
     */
    public function testUpdateUsernameConflictReturns409(): void
    {
        $this->simulateLogin(self::ADMIN_ID, 'admin', 'dnadmin');

        // Try to rename player to the GM's username
        $response = $this->callControllerWithInput(
            fn() => UserController::update(self::PLAYER_ID),
            json_encode([
                'username'    => 'dngm',  // already taken by GM_ID
                'player_name' => 'Dnplayer',
            ])
        );

        $this->assertEquals(409, $response['status']);
        $this->assertEquals('Conflict', $response['body']['error']);

        // Player's username must be unchanged
        $pdo  = Database::getInstance();
        $stmt = $pdo->prepare('SELECT username FROM users WHERE id = ?');
        $stmt->execute([self::PLAYER_ID]);
        $this->assertEquals('dnplayer', $stmt->fetchColumn(),
            'Username must not be changed on 409 conflict');
    }

    /**
     * (10) Changing to the same username (no actual change) must succeed with 200.
     *      No false "conflict" should be raised against the user's own row.
     */
    public function testUpdateUsernameToSameValueSucceeds(): void
    {
        $this->simulateLogin(self::ADMIN_ID, 'admin', 'dnadmin');

        $response = $this->callControllerWithInput(
            fn() => UserController::update(self::PLAYER_ID),
            json_encode([
                'username'    => 'dnplayer',  // same as existing
                'player_name' => 'Dnplayer',
            ])
        );

        $this->assertEquals(200, $response['status'],
            'Re-submitting the same username must not raise a 409 conflict');
        $this->assertEquals('dnplayer', $response['body']['username']);
    }

    /**
     * (11) An empty-string username is rejected with 400.
     */
    public function testUpdateUsernameEmptyStringReturns400(): void
    {
        $this->simulateLogin(self::ADMIN_ID, 'admin', 'dnadmin');

        $response = $this->callControllerWithInput(
            fn() => UserController::update(self::PLAYER_ID),
            json_encode([
                'username'    => '',
                'player_name' => 'Dnplayer',
            ])
        );

        $this->assertEquals(400, $response['status']);
        $this->assertEquals('BadRequest', $response['body']['error']);
    }

    /**
     * (12) Successful update response includes both username and player_name fields.
     */
    public function testUpdateResponseIncludesUsernameField(): void
    {
        $this->simulateLogin(self::ADMIN_ID, 'admin', 'dnadmin');

        $response = $this->callControllerWithInput(
            fn() => UserController::update(self::PLAYER_ID),
            json_encode(['player_name' => 'Any Name'])
        );

        $this->assertEquals(200, $response['status']);
        $this->assertArrayHasKey('username',    $response['body'],
            'Response must include username field');
        $this->assertArrayHasKey('player_name', $response['body'],
            'Response must include player_name field');
    }

    /**
     * (13) Self-edit via admin endpoint still returns 400 — no regression.
     *      Admins must use PUT /api/auth/display-name for their own account.
     */
    public function testAdminCannotEditOwnUsernameViaAdminEndpoint(): void
    {
        $this->simulateLogin(self::ADMIN_ID, 'admin', 'dnadmin');

        $response = $this->callControllerWithInput(
            fn() => UserController::update(self::ADMIN_ID),
            json_encode([
                'username'    => 'dnadmin_new',
                'player_name' => 'Dnadmin',
            ])
        );

        $this->assertEquals(400, $response['status']);
        $this->assertEquals('BadRequest', $response['body']['error']);
    }

    /**
     * (14) Non-admin users cannot use PUT /api/users/{id} — 403 Forbidden.
     *      No regression on the access-control guard.
     */
    public function testNonAdminCannotUpdateUsername(): void
    {
        $this->simulateLogin(self::PLAYER_ID, 'player', 'dnplayer');

        $response = $this->callControllerWithInput(
            fn() => UserController::update(self::GM_ID),
            json_encode([
                'username'    => 'hacked_gm',
                'player_name' => 'Hacked GM',
            ])
        );

        $this->assertEquals(403, $response['status']);
        $this->assertEquals('Forbidden', $response['body']['error']);
    }
}
