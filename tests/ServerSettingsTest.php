<?php
/**
 * @file tests/ServerSettingsTest.php
 * @description PHPUnit tests for ServerSettingsController — global GM overrides.
 *
 * TESTED ENDPOINTS:
 *   GET  /api/server-settings/gm-overrides  → ServerSettingsController::getGmOverrides()
 *   PUT  /api/server-settings/gm-overrides  → ServerSettingsController::setGmOverrides()
 *
 * DESIGN:
 *   GM global overrides are server-wide (not per-campaign).  Stored in the
 *   `server_settings` table under key `'gm_global_overrides'`.
 *
 * COVERAGE (15 test methods):
 *   (1)  GET returns empty array on fresh install.
 *   (2)  GET is accessible by non-GM players.
 *   (3)  GET returns 401 when unauthenticated.
 *   (4)  PUT by GM stores the JSON array correctly.
 *   (5)  GET after PUT returns the stored array (round-trip).
 *   (6)  PUT replaces the existing value (idempotent replace semantics).
 *   (7)  PUT returns 401 when unauthenticated.
 *   (8)  PUT returns 403 when called by a non-GM player.
 *   (9)  PUT returns 422 for invalid JSON body.
 *   (10) PUT returns 422 for JSON object at root (not array).
 *   (11) PUT returns 422 for JSON null at root.
 *   (12) PUT returns 413 via Content-Length gate (> 2 MB).
 *   (13) PUT returns 413 via strlen gate (> 2 MB, no Content-Length).
 *   (14) PUT with empty array clears all overrides.
 *   (15) Admin role can PUT (admin has full GM capabilities).
 *
 * @see api/controllers/ServerSettingsController.php
 * @see api/migrate.php for the server_settings table definition.
 */

declare(strict_types=1);

require_once __DIR__ . '/TestCase.php';

class ServerSettingsTest extends TestCase
{
    private const GM_ID     = 'user_ss_gm_001';
    private const PLAYER_ID = 'user_ss_player_001';
    private const ADMIN_ID  = 'user_ss_admin_001';

    /** A minimal valid JSON array payload (one Feature-like object). */
    private const PAYLOAD = [
        [
            'id'       => 'feat_test_override',
            'category' => 'feat',
            'label'    => ['en' => 'Test Override Feat'],
        ],
    ];

    protected function setUp(): void
    {
        parent::setUp();
        $this->createUser(self::GM_ID,     'gm',     'ss_gm');
        $this->createUser(self::PLAYER_ID, 'player', 'ss_player');
        $this->createUser(self::ADMIN_ID,  'admin',  'ss_admin');
    }

    // =========================================================================
    // (1) GET returns empty array on fresh install
    // =========================================================================

    /**
     * On a fresh database (after migrate()), the gm_global_overrides row is
     * bootstrapped with '[]'. GET must return that empty array.
     *
     * WHY: The DataLoader calls this at app init — it must always return a
     * valid JSON array even on a brand-new installation.
     */
    public function testGetReturnsEmptyArrayOnFreshInstall(): void
    {
        $this->simulateLogin(self::GM_ID, 'gm', 'ss_gm');

        $response = $this->callController(
            fn() => ServerSettingsController::getGmOverrides()
        );

        $this->assertEquals(200, $response['status'],
            'GET must return 200 on fresh install');
        $this->assertIsArray($response['body'],
            'Response must be a JSON array');
        $this->assertCount(0, $response['body'],
            'Fresh install must return an empty array');
    }

    // =========================================================================
    // (2) GET is accessible by non-GM players
    // =========================================================================

    /**
     * Any authenticated user (including players) can read global overrides.
     * The DataLoader runs for ALL users — restricting to GMs would break rule loading.
     */
    public function testGetIsAccessibleByPlayer(): void
    {
        $this->simulateLogin(self::PLAYER_ID, 'player', 'ss_player');

        $response = $this->callController(
            fn() => ServerSettingsController::getGmOverrides()
        );

        $this->assertEquals(200, $response['status'],
            'Non-GM player must be able to GET global overrides (200)');
        $this->assertIsArray($response['body']);
    }

    // =========================================================================
    // (3) GET returns 401 when unauthenticated
    // =========================================================================

    /**
     * Unauthenticated requests must be rejected with 401.
     * requireAuth() is called at the top of getGmOverrides().
     */
    public function testGetReturns401WhenUnauthenticated(): void
    {
        $this->simulateLogout();

        $response = $this->callController(
            fn() => ServerSettingsController::getGmOverrides()
        );

        $this->assertEquals(401, $response['status'],
            'Unauthenticated GET must return 401');
    }

    // =========================================================================
    // (4) PUT by GM stores the JSON array
    // =========================================================================

    /**
     * A valid PUT by a GM must persist the JSON array to the server_settings table.
     */
    public function testGmCanPutGmOverrides(): void
    {
        $this->simulateLogin(self::GM_ID, 'gm', 'ss_gm');

        $response = $this->callControllerWithInput(
            fn() => ServerSettingsController::setGmOverrides(),
            json_encode(self::PAYLOAD)
        );

        $this->assertEquals(200, $response['status'],
            'Valid GM PUT must return 200');
        $this->assertEquals('gm_global_overrides', $response['body']['key'] ?? '',
            'Response must include the key name');
        $this->assertArrayHasKey('updatedAt', $response['body'],
            'Response must include updatedAt timestamp');

        // Verify the DB row was actually updated.
        $pdo = Database::getInstance();
        $stmt = $pdo->prepare("SELECT value FROM server_settings WHERE key = 'gm_global_overrides'");
        $stmt->execute();
        $row = $stmt->fetch();

        $this->assertNotEmpty($row, 'server_settings row must exist');
        $storedArray = json_decode($row['value'], true);
        $this->assertIsArray($storedArray, 'Stored value must be a valid JSON array');
        $this->assertCount(1, $storedArray, 'Must have stored exactly 1 entity');
        $this->assertEquals('feat_test_override', $storedArray[0]['id'],
            'Stored entity id must match');
    }

    // =========================================================================
    // (5) GET after PUT — round-trip correctness
    // =========================================================================

    /**
     * After a PUT, GET must return exactly what was stored.
     * No field corruption, no extra encoding.
     */
    public function testGetAfterPutRoundTrip(): void
    {
        $this->simulateLogin(self::GM_ID, 'gm', 'ss_gm');

        // PUT
        $this->callControllerWithInput(
            fn() => ServerSettingsController::setGmOverrides(),
            json_encode(self::PAYLOAD)
        );

        // GET as a player (any authenticated user should see the same data).
        $this->simulateLogin(self::PLAYER_ID, 'player', 'ss_player');
        $response = $this->callController(
            fn() => ServerSettingsController::getGmOverrides()
        );

        $this->assertEquals(200, $response['status']);
        $this->assertIsArray($response['body']);
        $this->assertCount(1, $response['body'],
            'Round-trip must preserve 1 entity');
        $this->assertEquals(self::PAYLOAD[0]['id'], $response['body'][0]['id'],
            'Entity id must survive round-trip');
        $this->assertEquals(self::PAYLOAD[0]['category'], $response['body'][0]['category'],
            'Entity category must survive round-trip');
    }

    // =========================================================================
    // (6) PUT replaces the existing value
    // =========================================================================

    /**
     * A second PUT must fully replace the first value (idempotent replace semantics).
     * GET after the second PUT must return the new content.
     */
    public function testSecondPutReplacesExistingValue(): void
    {
        $payloadA = [['id' => 'feat_version_a', 'category' => 'feat']];
        $payloadB = [['id' => 'feat_version_b', 'category' => 'feat']];

        $this->simulateLogin(self::GM_ID, 'gm', 'ss_gm');

        $r1 = $this->callControllerWithInput(
            fn() => ServerSettingsController::setGmOverrides(),
            json_encode($payloadA)
        );
        $this->assertEquals(200, $r1['status'], 'First PUT must succeed');

        $r2 = $this->callControllerWithInput(
            fn() => ServerSettingsController::setGmOverrides(),
            json_encode($payloadB)
        );
        $this->assertEquals(200, $r2['status'], 'Second PUT must succeed');

        // GET must return payloadB, not payloadA.
        $response = $this->callController(
            fn() => ServerSettingsController::getGmOverrides()
        );

        $this->assertCount(1, $response['body'],
            'GET must return exactly one entity (the replaced value)');
        $this->assertEquals('feat_version_b', $response['body'][0]['id'],
            'GET must return the second payload, not the first');
    }

    // =========================================================================
    // (7) PUT returns 401 when unauthenticated
    // =========================================================================

    /**
     * Unauthenticated PUT must return 401.
     * requireGameMaster() calls requireAuth() first — 401 fires before the GM check.
     */
    public function testPutReturns401WhenUnauthenticated(): void
    {
        $this->simulateLogout();

        $response = $this->callControllerWithInput(
            fn() => ServerSettingsController::setGmOverrides(),
            json_encode(self::PAYLOAD)
        );

        $this->assertEquals(401, $response['status'],
            'Unauthenticated PUT must return 401');
    }

    // =========================================================================
    // (8) PUT returns 403 when called by a non-GM player
    // =========================================================================

    /**
     * Regular players cannot write global GM overrides.
     * Writing overrides affects ALL campaigns on the server — player access would
     * allow any player to inject malicious rule entities into everyone's games.
     */
    public function testPutReturns403ForPlayer(): void
    {
        $this->simulateLogin(self::PLAYER_ID, 'player', 'ss_player');

        $response = $this->callControllerWithInput(
            fn() => ServerSettingsController::setGmOverrides(),
            json_encode(self::PAYLOAD)
        );

        $this->assertEquals(403, $response['status'],
            'Non-GM player PUT must return 403 Forbidden');
        $this->assertEquals('Forbidden', $response['body']['error'] ?? '',
            'Error key must be Forbidden');
    }

    // =========================================================================
    // (9) PUT returns 422 for invalid JSON body
    // =========================================================================

    /**
     * A body that is not valid JSON must return 422 Unprocessable Entity.
     */
    public function testPutReturns422ForInvalidJson(): void
    {
        $this->simulateLogin(self::GM_ID, 'gm', 'ss_gm');

        $response = $this->callControllerWithInput(
            fn() => ServerSettingsController::setGmOverrides(),
            'not { valid: json }'
        );

        $this->assertEquals(422, $response['status'],
            'Invalid JSON body must return 422');
        $this->assertEquals('UnprocessableEntity', $response['body']['error'] ?? '');
    }

    // =========================================================================
    // (10) PUT returns 422 for JSON object at root (not array)
    // =========================================================================

    /**
     * The root value must be a JSON array.
     * DataLoader iterates the array — a top-level object would break loading.
     */
    public function testPutReturns422ForJsonObjectAtRoot(): void
    {
        $this->simulateLogin(self::GM_ID, 'gm', 'ss_gm');

        // 10a — JSON object at root
        $r1 = $this->callControllerWithInput(
            fn() => ServerSettingsController::setGmOverrides(),
            json_encode(['id' => 'feat_x', 'category' => 'feat'])
        );
        $this->assertEquals(422, $r1['status'],
            'JSON object at root must return 422');
        $this->assertEquals('UnprocessableEntity', $r1['body']['error'] ?? '');

        // 10b — JSON null at root
        $r2 = $this->callControllerWithInput(
            fn() => ServerSettingsController::setGmOverrides(),
            'null'
        );
        $this->assertEquals(422, $r2['status'],
            'JSON null at root must return 422');
    }

    // =========================================================================
    // (11) PUT returns 422 for JSON null at root
    // =========================================================================

    /**
     * A bare JSON number at root must also return 422.
     */
    public function testPutReturns422ForJsonNumberAtRoot(): void
    {
        $this->simulateLogin(self::GM_ID, 'gm', 'ss_gm');

        $response = $this->callControllerWithInput(
            fn() => ServerSettingsController::setGmOverrides(),
            '42'
        );

        $this->assertEquals(422, $response['status'],
            'JSON number at root must return 422');
    }

    // =========================================================================
    // (12) PUT returns 413 via Content-Length gate
    // =========================================================================

    /**
     * When Content-Length signals a body > 2 MB, the controller must reject
     * it immediately with 413 without reading the body.
     */
    public function testPutReturns413ViaContentLengthGate(): void
    {
        $this->simulateLogin(self::GM_ID, 'gm', 'ss_gm');
        $_SERVER['CONTENT_LENGTH'] = 3 * 1024 * 1024; // 3 MB

        try {
            $response = $this->callControllerWithInput(
                fn() => ServerSettingsController::setGmOverrides(),
                json_encode([]) // body is irrelevant — header gate fires first
            );

            $this->assertEquals(413, $response['status'],
                'Content-Length > 2 MB must return 413');
            $this->assertEquals('RequestTooLarge', $response['body']['error'] ?? '');
        } finally {
            unset($_SERVER['CONTENT_LENGTH']);
        }
    }

    // =========================================================================
    // (13) PUT returns 413 via strlen gate (no Content-Length)
    // =========================================================================

    /**
     * When Content-Length is absent, the controller must still reject bodies
     * > 2 MB after reading them.
     */
    public function testPutReturns413ViaStrlenGate(): void
    {
        $this->simulateLogin(self::GM_ID, 'gm', 'ss_gm');
        unset($_SERVER['CONTENT_LENGTH']);

        $oversizedBody = str_repeat('X', 2 * 1024 * 1024 + 1); // 2 MB + 1 byte

        $response = $this->callControllerWithInput(
            fn() => ServerSettingsController::setGmOverrides(),
            $oversizedBody
        );

        $this->assertEquals(413, $response['status'],
            'Body > 2 MB (no Content-Length) must return 413');
        $this->assertEquals('RequestTooLarge', $response['body']['error'] ?? '');
    }

    // =========================================================================
    // (14) PUT with empty array clears all overrides
    // =========================================================================

    /**
     * Sending `[]` must overwrite any existing overrides with an empty array.
     * This is how the GM resets the global overrides to the default (no overrides).
     */
    public function testPutWithEmptyArrayClearsOverrides(): void
    {
        // Seed some overrides first.
        $pdo = Database::getInstance();
        $pdo->prepare("INSERT OR REPLACE INTO server_settings (key, value) VALUES ('gm_global_overrides', ?)")
            ->execute([json_encode(self::PAYLOAD)]);

        $this->simulateLogin(self::GM_ID, 'gm', 'ss_gm');

        $response = $this->callControllerWithInput(
            fn() => ServerSettingsController::setGmOverrides(),
            '[]'
        );

        $this->assertEquals(200, $response['status'],
            'PUT with [] must succeed');

        // GET must now return an empty array.
        $getResponse = $this->callController(
            fn() => ServerSettingsController::getGmOverrides()
        );

        $this->assertCount(0, $getResponse['body'],
            'After PUT [], GET must return empty array');
    }

    // =========================================================================
    // (15) Admin role can PUT
    // =========================================================================

    /**
     * Admin users have full GM capabilities, so they must be able to write
     * global overrides.  requireGameMaster() returns true for both 'gm' and 'admin'.
     */
    public function testAdminCanPutGmOverrides(): void
    {
        $this->simulateLogin(self::ADMIN_ID, 'admin', 'ss_admin');

        $response = $this->callControllerWithInput(
            fn() => ServerSettingsController::setGmOverrides(),
            json_encode(self::PAYLOAD)
        );

        $this->assertEquals(200, $response['status'],
            'Admin role must be able to PUT global overrides');
    }
}
