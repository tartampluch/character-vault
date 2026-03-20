<?php
/**
 * @file tests/VisibilityTest.php
 * @description PHPUnit tests for character visibility and authorization rules.
 *
 * TESTS:
 *   - Non-GM cannot see another player's characters (filtered out).
 *   - Non-GM attempting to GET another player's character via campaignId: not in response.
 *   - Non-GM attempting to UPDATE another player's character: 403 Forbidden.
 *   - Non-GM attempting to DELETE another player's character: 403 Forbidden.
 *   - GM can see all characters in the campaign.
 *   - Non-GM cannot access gm-overrides endpoint (403).
 *
 * @see api/controllers/CharacterController.php
 * @see ARCHITECTURE.md Phase 16.3
 */

declare(strict_types=1);

require_once __DIR__ . '/TestCase.php';

class VisibilityTest extends TestCase
{
    private const GM_ID      = 'user_gm_001';
    private const PLAYER1_ID = 'user_player1_001';
    private const PLAYER2_ID = 'user_player2_001';
    private const CAMP_ID    = 'camp_visibility_001';
    private const CHAR1_ID   = 'char_player1_001';
    private const CHAR2_ID   = 'char_player2_001';
    private const NPC_ID     = 'char_npc_001';

    protected function setUp(): void
    {
        parent::setUp();

        // Create users
        $this->createUser(self::GM_ID, true, 'gmuser');
        $this->createUser(self::PLAYER1_ID, false, 'player1');
        $this->createUser(self::PLAYER2_ID, false, 'player2');

        // Create campaign owned by GM
        $this->createCampaign(self::CAMP_ID, self::GM_ID);

        // Create characters for each player + one NPC
        $this->createCharacter(self::CHAR1_ID, self::CAMP_ID, self::PLAYER1_ID, 'Player1 Hero');
        $this->createCharacter(self::CHAR2_ID, self::CAMP_ID, self::PLAYER2_ID, 'Player2 Hero');
        $this->createCharacter(self::NPC_ID, self::CAMP_ID, self::GM_ID, 'Villain NPC', true);
    }

    // ============================================================
    // GET VISIBILITY
    // ============================================================

    /**
     * A player should only see their own character(s), not other players'.
     * CHECKPOINTS.md: "A non-GM: does it return ONLY characters where owner_id = session_user_id?"
     */
    public function testPlayerOnlySeesOwnCharacters(): void
    {
        $this->simulateLogin(self::PLAYER1_ID);

        $_GET = ['campaignId' => self::CAMP_ID];
        $response = $this->callController(fn() => CharacterController::index());

        $this->assertEquals(200, $response['status']);
        $this->assertCount(1, $response['body'], 'Player should only see 1 character');
        $this->assertEquals(self::CHAR1_ID, $response['body'][0]['id']);
    }

    /**
     * Player cannot see the other player's character by changing the query.
     * Even if they guess the campaignId, they only get their own.
     */
    public function testPlayerCannotSeeOtherPlayerCharacter(): void
    {
        $this->simulateLogin(self::PLAYER2_ID);

        $_GET = ['campaignId' => self::CAMP_ID];
        $response = $this->callController(fn() => CharacterController::index());

        $this->assertEquals(200, $response['status']);

        $ids = array_column($response['body'], 'id');
        $this->assertNotContains(self::CHAR1_ID, $ids, 'Player 2 should not see Player 1\'s character');
        $this->assertNotContains(self::NPC_ID, $ids, 'Player 2 should not see the NPC');
        $this->assertContains(self::CHAR2_ID, $ids, 'Player 2 should see their own character');
    }

    /**
     * GM sees ALL characters including NPCs and other players' characters.
     */
    public function testGmSeesAllCharacters(): void
    {
        $this->simulateLogin(self::GM_ID, true);

        $_GET = ['campaignId' => self::CAMP_ID];
        $response = $this->callController(fn() => CharacterController::index());

        $this->assertEquals(200, $response['status']);
        $this->assertCount(3, $response['body'], 'GM should see all 3 characters');

        $ids = array_column($response['body'], 'id');
        $this->assertContains(self::CHAR1_ID, $ids);
        $this->assertContains(self::CHAR2_ID, $ids);
        $this->assertContains(self::NPC_ID, $ids);
    }

    /**
     * GM response includes gmOverrides as a separate field.
     * Player response does NOT expose the field separately (it's merged in).
     * CHECKPOINTS.md: "For a non-GM: does the response include gmOverrides merged invisibly?"
     */
    public function testGmReceivesRawGmOverridesField(): void
    {
        // Add GM overrides to char1
        $pdo = Database::getInstance();
        $pdo->prepare('UPDATE characters SET gm_overrides_json = ? WHERE id = ?')
            ->execute([json_encode([['instanceId' => 'gm_test', 'featureId' => 'gm_buff', 'isActive' => true]]), self::CHAR1_ID]);

        // GM sees both character data AND separate gmOverrides field
        $this->simulateLogin(self::GM_ID, true);
        $_GET = ['campaignId' => self::CAMP_ID];
        $response = $this->callController(fn() => CharacterController::index());

        $char1 = array_values(array_filter($response['body'], fn($c) => $c['id'] === self::CHAR1_ID))[0];
        $this->assertArrayHasKey('gmOverrides', $char1, 'GM response should have gmOverrides field');
        $this->assertCount(1, $char1['gmOverrides']);
        $this->assertEquals('gm_test', $char1['gmOverrides'][0]['instanceId']);
    }

    // ============================================================
    // WRITE AUTHORIZATION
    // ============================================================

    /**
     * Non-GM attempting to UPDATE another player's character should get 403.
     * CHECKPOINTS.md: "PUT /api/characters/{id}: Does it verify ownership OR GM status?"
     */
    public function testPlayerCannotUpdateOtherPlayerCharacter(): void
    {
        $this->simulateLogin(self::PLAYER1_ID);  // Player 1 tries to update Player 2's char

        $response = $this->callControllerWithInput(
            fn() => CharacterController::update(self::CHAR2_ID),
            json_encode(['id' => self::CHAR2_ID, 'name' => 'Hacked Name'])
        );

        $this->assertEquals(403, $response['status']);
        $this->assertEquals('Forbidden', $response['body']['error']);
    }

    /**
     * Non-GM attempting to DELETE another player's character should get 403.
     */
    public function testPlayerCannotDeleteOtherPlayerCharacter(): void
    {
        $this->simulateLogin(self::PLAYER1_ID);  // Player 1 tries to delete Player 2's char

        $response = $this->callController(fn() => CharacterController::delete(self::CHAR2_ID));

        $this->assertEquals(403, $response['status']);
        $this->assertEquals('Forbidden', $response['body']['error']);
    }

    /**
     * GM CAN update any character.
     */
    public function testGmCanUpdateAnyCharacter(): void
    {
        $this->simulateLogin(self::GM_ID, true);

        $response = $this->callControllerWithInput(
            fn() => CharacterController::update(self::CHAR1_ID),
            json_encode(['id' => self::CHAR1_ID, 'name' => 'GM Updated Name'])
        );

        $this->assertEquals(200, $response['status']);
    }

    /**
     * Non-GM cannot access PUT /api/characters/{id}/gm-overrides — 403.
     * CHECKPOINTS.md: "PUT /api/characters/{id}/gm-overrides: Is it restricted to GM only?"
     */
    public function testNonGmCannotAccessGmOverridesEndpoint(): void
    {
        $this->simulateLogin(self::PLAYER1_ID);

        $response = $this->callControllerWithInput(
            fn() => CharacterController::updateGmOverrides(self::CHAR2_ID),
            json_encode(['gmOverrides' => []])
        );

        $this->assertEquals(403, $response['status']);
        $this->assertEquals('Forbidden', $response['body']['error']);
    }

    /**
     * Unauthenticated request to any endpoint returns 401.
     */
    public function testUnauthenticatedRequestReturns401(): void
    {
        $this->simulateLogout();  // No session

        $_GET = ['campaignId' => self::CAMP_ID];
        $response = $this->callController(fn() => CharacterController::index());

        $this->assertEquals(401, $response['status']);
        $this->assertEquals('Unauthorized', $response['body']['error']);
    }

}
