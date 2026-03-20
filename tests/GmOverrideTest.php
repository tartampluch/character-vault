<?php
/**
 * @file tests/GmOverrideTest.php
 * @description PHPUnit tests for GM override visibility rules.
 *
 * TESTS:
 *   - Player fetching their own character receives gmOverrides merged in (cannot see raw column).
 *   - GM fetching the same character receives both base data and raw gmOverrides separately.
 *   - GM can save per-character overrides via PUT /characters/{id}/gm-overrides.
 *   - Player cannot save GM overrides (403).
 *   - Saving GM overrides updates the character's updated_at timestamp.
 *
 * @see api/controllers/CharacterController.php
 * @see ARCHITECTURE.md Phase 16.5
 */

declare(strict_types=1);

require_once __DIR__ . '/TestCase.php';

class GmOverrideTest extends TestCase
{
    private const GM_ID     = 'user_gm_override_001';
    private const PLAYER_ID = 'user_player_override_001';
    private const CAMP_ID   = 'camp_override_001';
    private const CHAR_ID   = 'char_override_001';

    private array $gmOverrideData = [];

    protected function setUp(): void
    {
        parent::setUp();

        $this->createUser(self::GM_ID, true, 'gm');
        $this->createUser(self::PLAYER_ID, false, 'player');
        $this->createCampaign(self::CAMP_ID, self::GM_ID);

        // Create a character with GM overrides already set
        $this->gmOverrideData = [
            [
                'instanceId' => 'gm_curse_001',
                'featureId'  => 'gm_custom_curse_weakness',
                'isActive'   => true,
            ],
            [
                'instanceId' => 'gm_darkvision_001',
                'featureId'  => 'gm_custom_darkvision',
                'isActive'   => true,
            ],
        ];

        $this->createCharacter(
            self::CHAR_ID,
            self::CAMP_ID,
            self::PLAYER_ID,
            'Test Hero',
            false,
            ['classLevels' => ['class_fighter' => 5]],
            $this->gmOverrideData  // Pre-set GM overrides
        );
    }

    // ============================================================
    // PLAYER VISIBILITY TESTS
    // ============================================================

    /**
     * Player fetching their character receives the data WITH gmOverrides embedded.
     * CHECKPOINTS.md: "Test that a player fetching their own character receives
     * the merged result (with GM overrides applied invisibly)."
     *
     * The key: the player receives gmOverrides as a field in the character object
     * (so the GameEngine can process them), but the PLAYER cannot see the raw
     * gm_overrides_json column separately (which would reveal the GM's intent).
     */
    public function testPlayerReceivesGmOverridesEmbeddedInCharacter(): void
    {
        $this->simulateLogin(self::PLAYER_ID);

        $_GET = ['campaignId' => self::CAMP_ID];
        $response = $this->callController(fn() => CharacterController::index());

        $this->assertEquals(200, $response['status']);
        $this->assertCount(1, $response['body']);

        $char = $response['body'][0];

        // The player's response INCLUDES gmOverrides (so GameEngine can use them)
        $this->assertArrayHasKey('gmOverrides', $char,
            'Player response must include gmOverrides for the GameEngine to process');
        $this->assertCount(2, $char['gmOverrides'],
            'Both GM override instances should be included');
        $this->assertEquals('gm_curse_001', $char['gmOverrides'][0]['instanceId']);
    }

    // ============================================================
    // GM VISIBILITY TESTS
    // ============================================================

    /**
     * GM fetching the character receives BOTH the base character data
     * AND the raw gmOverrides as a separate field.
     * CHECKPOINTS.md: "Test that a GM fetching the same character receives
     * both the base data and the raw gmOverrides separately."
     */
    public function testGmReceivesBothBaseDataAndRawGmOverrides(): void
    {
        $this->simulateLogin(self::GM_ID, true);

        $_GET = ['campaignId' => self::CAMP_ID];
        $response = $this->callController(fn() => CharacterController::index());

        $this->assertEquals(200, $response['status']);
        $char = $response['body'][0];

        // GM sees gmOverrides as a separate array
        $this->assertArrayHasKey('gmOverrides', $char);
        $this->assertCount(2, $char['gmOverrides']);

        // GM also sees the base character data
        $this->assertEquals('Test Hero', $char['name']);
        $this->assertEquals(['class_fighter' => 5], $char['classLevels']);
    }

    // ============================================================
    // GM OVERRIDE SAVE TESTS
    // ============================================================

    /**
     * GM can save per-character overrides.
     * The overrides are stored in gm_overrides_json, not in character_json.
     */
    public function testGmCanSavePerCharacterOverrides(): void
    {
        $this->simulateLogin(self::GM_ID, true);

        $newOverrides = [
            ['instanceId' => 'gm_buff_001', 'featureId' => 'gm_haste', 'isActive' => true],
        ];

        $response = $this->callControllerWithInput(
            fn() => CharacterController::updateGmOverrides(self::CHAR_ID),
            json_encode(['gmOverrides' => $newOverrides])
        );

        $this->assertEquals(200, $response['status']);

        // Verify the override is in gm_overrides_json
        $pdo = Database::getInstance();
        $stmt = $pdo->prepare('SELECT gm_overrides_json, character_json FROM characters WHERE id = ?');
        $stmt->execute([self::CHAR_ID]);
        $row = $stmt->fetch();

        $gmOverrides = json_decode($row['gm_overrides_json'], true);
        $this->assertCount(1, $gmOverrides);
        $this->assertEquals('gm_buff_001', $gmOverrides[0]['instanceId']);

        // The override should NOT be in character_json
        $charJson = json_decode($row['character_json'], true);
        $this->assertArrayNotHasKey('gmOverrides', $charJson,
            'GM overrides must not be stored in character_json');
    }

    /**
     * Non-GM cannot save GM overrides: 403.
     */
    public function testPlayerCannotSaveGmOverrides(): void
    {
        $this->simulateLogin(self::PLAYER_ID);

        $response = $this->callControllerWithInput(
            fn() => CharacterController::updateGmOverrides(self::CHAR_ID),
            json_encode(['gmOverrides' => []])
        );

        $this->assertEquals(403, $response['status']);
        $this->assertEquals('Forbidden', $response['body']['error']);
    }

    /**
     * Saving GM overrides updates the character's updated_at timestamp.
     * This ensures the polling mechanism detects the change.
     * CHECKPOINTS.md Phase 16.5: "Modifying GM overrides also updates the character's updated_at."
     *
     * IMPROVED APPROACH (MINOR fix #2 — removes sleep(1) flakiness):
     *   Injects a known past timestamp (-100 seconds) into the DB before the test.
     *   Any real time() call in the controller will be strictly greater, making
     *   the test deterministic regardless of system clock speed or resolution.
     */
    public function testSavingGmOverridesUpdatesTimestamp(): void
    {
        $pdo = Database::getInstance();

        // Inject a timestamp 100 seconds in the past to guarantee a detectable difference
        $pastTimestamp = time() - 100;
        $pdo->prepare('UPDATE characters SET updated_at = ? WHERE id = ?')
            ->execute([$pastTimestamp, self::CHAR_ID]);

        $stmt = $pdo->prepare('SELECT updated_at FROM characters WHERE id = ?');
        $stmt->execute([self::CHAR_ID]);
        $originalTs = (int)$stmt->fetchColumn();
        $this->assertEquals($pastTimestamp, $originalTs, 'Test setup: past timestamp injected correctly');

        $this->simulateLogin(self::GM_ID, true);

        $this->callControllerWithInput(
            fn() => CharacterController::updateGmOverrides(self::CHAR_ID),
            json_encode(['gmOverrides' => [['instanceId' => 'gm_new', 'featureId' => 'gm_test', 'isActive' => true]]])
        );

        // Check updated_at changed (will be at least 100 seconds greater than the injected value)
        $stmt->execute([self::CHAR_ID]);
        $newTs = (int)$stmt->fetchColumn();

        $this->assertGreaterThan($originalTs, $newTs,
            'Saving GM overrides must update the character\'s updated_at timestamp');
    }
}
