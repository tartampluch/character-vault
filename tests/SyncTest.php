<?php
/**
 * @file tests/SyncTest.php
 * @description PHPUnit tests for the sync/polling timestamp mechanism.
 *
 * TESTS:
 *   - Modifying a character updates its updated_at.
 *   - GET /campaigns/{id}/sync-status returns correct timestamps.
 *   - Modifying GM overrides also updates the character's updated_at.
 *   - sync-status visibility: player only sees their own character timestamps.
 *   - sync-status visibility: GM sees all character timestamps.
 *
 * @see api/controllers/CampaignController.php (syncStatus method)
 * @see ARCHITECTURE.md Phase 16.6, section 19
 */

declare(strict_types=1);

require_once __DIR__ . '/TestCase.php';

class SyncTest extends TestCase
{
    private const GM_ID     = 'user_gm_sync_001';
    private const PLAYER_ID = 'user_player_sync_001';
    private const CAMP_ID   = 'camp_sync_001';
    private const CHAR1_ID  = 'char_sync_001';
    private const CHAR2_ID  = 'char_sync_002';

    protected function setUp(): void
    {
        parent::setUp();

        $this->createUser(self::GM_ID, true, 'gm');
        $this->createUser(self::PLAYER_ID, false, 'player');
        $this->createCampaign(self::CAMP_ID, self::GM_ID);
        $this->createCharacter(self::CHAR1_ID, self::CAMP_ID, self::PLAYER_ID, 'Hero1');
        $this->createCharacter(self::CHAR2_ID, self::CAMP_ID, self::GM_ID, 'NPC1', true);
    }

    // ============================================================
    // UPDATED_AT TESTS
    // ============================================================

    /**
     * Modifying a character via PUT /api/characters/{id} updates its updated_at.
     * CHECKPOINTS.md Phase 16.6: "Test that modifying a character updates its updated_at."
     */
    public function testModifyingCharacterUpdatesTimestamp(): void
    {
        $pdo = Database::getInstance();
        $stmt = $pdo->prepare('SELECT updated_at FROM characters WHERE id = ?');
        $stmt->execute([self::CHAR1_ID]);
        $originalTs = (int)$stmt->fetchColumn();

        sleep(1);

        $this->simulateLogin(self::PLAYER_ID);
        $this->callControllerWithInput(
            fn() => CharacterController::update(self::CHAR1_ID),
            json_encode(['id' => self::CHAR1_ID, 'name' => 'Hero1 Updated', 'activeFeatures' => []])
        );

        $stmt->execute([self::CHAR1_ID]);
        $newTs = (int)$stmt->fetchColumn();

        $this->assertGreaterThan($originalTs, $newTs,
            'Character updated_at should increase after a PUT update');
    }

    /**
     * Modifying GM overrides also updates the character's updated_at.
     * CHECKPOINTS.md Phase 16.6: "Test that modifying GM overrides also updates the character's updated_at."
     */
    public function testModifyingGmOverridesUpdatesCharacterTimestamp(): void
    {
        $pdo = Database::getInstance();
        $stmt = $pdo->prepare('SELECT updated_at FROM characters WHERE id = ?');
        $stmt->execute([self::CHAR1_ID]);
        $originalTs = (int)$stmt->fetchColumn();

        sleep(1);

        $this->simulateLogin(self::GM_ID, true);
        $this->callControllerWithInput(
            fn() => CharacterController::updateGmOverrides(self::CHAR1_ID),
            json_encode(['gmOverrides' => [['instanceId' => 'gm_001', 'featureId' => 'gm_curse', 'isActive' => true]]])
        );

        $stmt->execute([self::CHAR1_ID]);
        $newTs = (int)$stmt->fetchColumn();

        $this->assertGreaterThan($originalTs, $newTs,
            'GM override save must update character\'s updated_at so polling detects the change');
    }

    // ============================================================
    // SYNC-STATUS ENDPOINT TESTS
    // ============================================================

    /**
     * GET /api/campaigns/{id}/sync-status returns campaignUpdatedAt and characterTimestamps.
     * CHECKPOINTS.md Phase 16.6: "Test that GET /campaigns/{id}/sync-status returns correct timestamps."
     */
    public function testSyncStatusReturnsCorrectPayload(): void
    {
        $this->simulateLogin(self::GM_ID, true);

        // Use $m variable trick since syncStatus expects a string $id (not from URL)
        $response = $this->callController(fn() => CampaignController::syncStatus(self::CAMP_ID));

        $this->assertEquals(200, $response['status']);
        $this->assertArrayHasKey('campaignUpdatedAt', $response['body'],
            'Response must contain campaignUpdatedAt');
        $this->assertArrayHasKey('characterTimestamps', $response['body'],
            'Response must contain characterTimestamps');

        // Timestamps should be positive integers
        $this->assertIsInt($response['body']['campaignUpdatedAt']);
        $this->assertGreaterThan(0, $response['body']['campaignUpdatedAt']);

        // Should have character timestamps
        $this->assertIsArray($response['body']['characterTimestamps']);
    }

    /**
     * sync-status for GM includes ALL character timestamps (CHAR1 + CHAR2/NPC).
     */
    public function testSyncStatusGmSeesAllCharacterTimestamps(): void
    {
        $this->simulateLogin(self::GM_ID, true);

        $response = $this->callController(fn() => CampaignController::syncStatus(self::CAMP_ID));

        $this->assertEquals(200, $response['status']);
        $timestamps = $response['body']['characterTimestamps'];

        $this->assertArrayHasKey(self::CHAR1_ID, $timestamps, 'GM should see player\'s char timestamp');
        $this->assertArrayHasKey(self::CHAR2_ID, $timestamps, 'GM should see NPC timestamp');
    }

    /**
     * sync-status for Player only includes THEIR OWN character timestamps.
     * ARCHITECTURE.md section 19.2: Visibility filter applies to sync-status too.
     */
    public function testSyncStatusPlayerOnlySeesOwnCharacterTimestamps(): void
    {
        $this->simulateLogin(self::PLAYER_ID);

        $response = $this->callController(fn() => CampaignController::syncStatus(self::CAMP_ID));

        $this->assertEquals(200, $response['status']);
        $timestamps = $response['body']['characterTimestamps'];

        $this->assertArrayHasKey(self::CHAR1_ID, $timestamps, 'Player should see own char timestamp');
        $this->assertArrayNotHasKey(self::CHAR2_ID, $timestamps, 'Player should NOT see NPC timestamp');
    }

    /**
     * Campaign updated_at changes when campaign settings are updated.
     */
    public function testCampaignTimestampUpdatesOnCampaignChange(): void
    {
        $this->simulateLogin(self::GM_ID, true);

        // Get initial timestamp
        $response1 = $this->callController(fn() => CampaignController::syncStatus(self::CAMP_ID));
        $ts1 = $response1['body']['campaignUpdatedAt'];

        sleep(1);

        // Update the campaign
        $this->callControllerWithInput(
            fn() => CampaignController::update(self::CAMP_ID),
            json_encode(['title' => 'Updated Campaign Title'])
        );

        // Check timestamp increased
        $response2 = $this->callController(fn() => CampaignController::syncStatus(self::CAMP_ID));
        $ts2 = $response2['body']['campaignUpdatedAt'];

        $this->assertGreaterThan($ts1, $ts2,
            'Campaign updated_at must increase after a settings update');
    }
}
