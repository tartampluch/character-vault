<?php
/**
 * @file tests/VisibilityTest.php
 * @description PHPUnit tests for character visibility and authorization rules.
 *
 * TESTS:
 *   GET VISIBILITY (own characters):
 *     - Non-GM sees only their own characters (NPC with default 'hidden' visibility excluded).
 *     - Non-GM cannot see other players' characters or hidden NPCs.
 *     - GM sees all characters.
 *     - GM response includes raw gmOverrides field.
 *
 *   NPC PLAYER VISIBILITY LEVELS:
 *     - 'hidden'     → NPC not included in player response (default).
 *     - 'name'       → player receives stub: id, name, playerName, posterUrl, npcType.
 *     - 'name_level' → player receives stub + classLevels.
 *     - 'full'       → player receives complete character data, flagged _playerRestricted.
 *
 *   WRITE AUTHORIZATION:
 *     - Non-GM cannot UPDATE another player's character (403).
 *     - Non-GM cannot DELETE another player's character (403).
 *     - GM can update any character.
 *     - Non-GM cannot access gm-overrides endpoint (403).
 *     - Unauthenticated request returns 401.
 *
 *   CAMPAIGN ISOLATION:
 *     - Player gets empty list for a campaign where they have no characters.
 *     - campaignId filter prevents character leakage between campaigns.
 *
 * @see api/controllers/CharacterController.php
 * @see ARCHITECTURE.md Phase 14.5 / 16.3
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

        // Create characters for each player + one NPC (no playerVisibility → defaults to 'hidden')
        $this->createCharacter(self::CHAR1_ID, self::CAMP_ID, self::PLAYER1_ID, 'Player1 Hero');
        $this->createCharacter(self::CHAR2_ID, self::CAMP_ID, self::PLAYER2_ID, 'Player2 Hero');
        $this->createCharacter(self::NPC_ID,   self::CAMP_ID, self::GM_ID,      'Villain NPC', true);
    }

    // ============================================================
    // GET VISIBILITY — own characters + hidden NPCs
    // ============================================================

    /**
     * A player should only see their own character(s).
     * NPCs with the default 'hidden' playerVisibility are excluded.
     */
    public function testPlayerOnlySeesOwnCharacters(): void
    {
        $this->simulateLogin(self::PLAYER1_ID);

        $_GET = ['campaignId' => self::CAMP_ID];
        $response = $this->callController(fn() => CharacterController::index());

        $this->assertEquals(200, $response['status']);
        $this->assertCount(1, $response['body'], 'Player should only see 1 character (NPC is hidden by default)');
        $this->assertEquals(self::CHAR1_ID, $response['body'][0]['id']);
    }

    /**
     * Player 2 cannot see Player 1's character or an NPC with default visibility.
     */
    public function testPlayerCannotSeeOtherPlayerCharacterOrHiddenNpc(): void
    {
        $this->simulateLogin(self::PLAYER2_ID);

        $_GET = ['campaignId' => self::CAMP_ID];
        $response = $this->callController(fn() => CharacterController::index());

        $this->assertEquals(200, $response['status']);

        $ids = array_column($response['body'], 'id');
        $this->assertNotContains(self::CHAR1_ID, $ids, 'Player 2 should not see Player 1\'s character');
        $this->assertNotContains(self::NPC_ID,   $ids, 'Player 2 should not see the NPC (playerVisibility = hidden)');
        $this->assertContains(self::CHAR2_ID,    $ids, 'Player 2 should see their own character');
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
        $this->assertContains(self::NPC_ID,   $ids);
    }

    /**
     * GM response includes gmOverrides as a separate field.
     */
    public function testGmReceivesRawGmOverridesField(): void
    {
        $pdo = Database::getInstance();
        $pdo->prepare('UPDATE characters SET gm_overrides_json = ? WHERE id = ?')
            ->execute([json_encode([['instanceId' => 'gm_test', 'featureId' => 'gm_buff', 'isActive' => true]]), self::CHAR1_ID]);

        $this->simulateLogin(self::GM_ID, true);
        $_GET = ['campaignId' => self::CAMP_ID];
        $response = $this->callController(fn() => CharacterController::index());

        $char1 = array_values(array_filter($response['body'], fn($c) => $c['id'] === self::CHAR1_ID))[0];
        $this->assertArrayHasKey('gmOverrides', $char1, 'GM response should have gmOverrides field');
        $this->assertCount(1, $char1['gmOverrides']);
        $this->assertEquals('gm_test', $char1['gmOverrides'][0]['instanceId']);
    }

    // ============================================================
    // NPC PLAYER VISIBILITY LEVELS
    // ============================================================

    /**
     * NPC with explicit playerVisibility = 'hidden' is not included in player response.
     */
    public function testNpcWithExplicitHiddenVisibilityNotIncludedForPlayer(): void
    {
        $pdo = Database::getInstance();
        $pdo->prepare("UPDATE characters SET character_json = json_set(character_json, '$.playerVisibility', 'hidden') WHERE id = ?")
            ->execute([self::NPC_ID]);

        $this->simulateLogin(self::PLAYER1_ID);
        $_GET = ['campaignId' => self::CAMP_ID];
        $response = $this->callController(fn() => CharacterController::index());

        $ids = array_column($response['body'], 'id');
        $this->assertNotContains(self::NPC_ID, $ids, "NPC with playerVisibility='hidden' must not appear for players");
    }

    /**
     * NPC with playerVisibility = 'name' exposes only display-safe stub fields:
     * id, name, playerName, posterUrl, npcType — no stats, levels, or features.
     */
    public function testNpcNameVisibilityExposesStubOnly(): void
    {
        $pdo = Database::getInstance();
        $pdo->prepare(
            "UPDATE characters SET character_json = json_set(character_json,
                '$.playerVisibility', 'name',
                '$.posterUrl',        'https://example.com/npc.jpg',
                '$.playerName',       'Game Master'
            ) WHERE id = ?"
        )->execute([self::NPC_ID]);

        $this->simulateLogin(self::PLAYER1_ID);
        $_GET = ['campaignId' => self::CAMP_ID];
        $response = $this->callController(fn() => CharacterController::index());

        $ids = array_column($response['body'], 'id');
        $this->assertContains(self::NPC_ID, $ids, "NPC with playerVisibility='name' must appear for players");

        $npc = array_values(array_filter($response['body'], fn($c) => $c['id'] === self::NPC_ID))[0];
        $this->assertEquals('Villain NPC',                  $npc['name']);
        $this->assertEquals('Game Master',                  $npc['playerName']);
        $this->assertEquals('https://example.com/npc.jpg', $npc['posterUrl']);
        $this->assertEquals('name',                         $npc['_playerVisibility']);
        $this->assertTrue($npc['_playerRestricted'],        '_playerRestricted must be true');

        $this->assertArrayNotHasKey('classLevels',    $npc, "classLevels must not be exposed at 'name' level");
        $this->assertArrayNotHasKey('activeFeatures', $npc, "activeFeatures must not be exposed at 'name' level");
    }

    /**
     * NPC with playerVisibility = 'name_level' exposes stub + classLevels.
     */
    public function testNpcNameLevelVisibilityExposesClassLevels(): void
    {
        $classLevels = [['classId' => 'fighter', 'level' => 5]];
        $pdo = Database::getInstance();
        $pdo->prepare(
            "UPDATE characters SET character_json = json_set(character_json,
                '$.playerVisibility', 'name_level',
                '$.classLevels',      json(?),
                '$.playerName',       'Game Master'
            ) WHERE id = ?"
        )->execute([json_encode($classLevels), self::NPC_ID]);

        $this->simulateLogin(self::PLAYER1_ID);
        $_GET = ['campaignId' => self::CAMP_ID];
        $response = $this->callController(fn() => CharacterController::index());

        $ids = array_column($response['body'], 'id');
        $this->assertContains(self::NPC_ID, $ids, "NPC with playerVisibility='name_level' must appear for players");

        $npc = array_values(array_filter($response['body'], fn($c) => $c['id'] === self::NPC_ID))[0];
        $this->assertEquals('name_level', $npc['_playerVisibility']);
        $this->assertTrue($npc['_playerRestricted']);
        $this->assertArrayHasKey('classLevels',    $npc, "classLevels must be present at 'name_level'");
        $this->assertCount(1, $npc['classLevels']);
        $this->assertEquals('fighter', $npc['classLevels'][0]['classId']);

        $this->assertArrayNotHasKey('activeFeatures', $npc, "activeFeatures must not be exposed at 'name_level'");
    }

    /**
     * NPC with playerVisibility = 'full' exposes the complete character data,
     * flagged as _playerRestricted. Raw gmOverrides is never included.
     */
    public function testNpcFullVisibilityExposesCompleteData(): void
    {
        $pdo = Database::getInstance();
        $pdo->prepare(
            "UPDATE characters SET character_json = json_set(character_json,
                '$.playerVisibility', 'full',
                '$.someStatField',    42
            ) WHERE id = ?"
        )->execute([self::NPC_ID]);
        // Set a gmOverrides to confirm it is stripped even at 'full' level
        $pdo->prepare('UPDATE characters SET gm_overrides_json = ? WHERE id = ?')
            ->execute([json_encode([['instanceId' => 'secret', 'featureId' => 'buff']]), self::NPC_ID]);

        $this->simulateLogin(self::PLAYER1_ID);
        $_GET = ['campaignId' => self::CAMP_ID];
        $response = $this->callController(fn() => CharacterController::index());

        $ids = array_column($response['body'], 'id');
        $this->assertContains(self::NPC_ID, $ids, "NPC with playerVisibility='full' must appear for players");

        $npc = array_values(array_filter($response['body'], fn($c) => $c['id'] === self::NPC_ID))[0];
        $this->assertEquals('full',  $npc['_playerVisibility']);
        $this->assertTrue($npc['_playerRestricted']);
        $this->assertEquals(42,      $npc['someStatField'], 'Full data should include all character fields');

        $this->assertArrayNotHasKey('gmOverrides', $npc, 'gmOverrides must never be exposed to players');
    }

    /**
     * An unrecognised playerVisibility value is treated as 'hidden'.
     */
    public function testNpcUnknownVisibilityValueTreatedAsHidden(): void
    {
        $pdo = Database::getInstance();
        $pdo->prepare(
            "UPDATE characters SET character_json = json_set(character_json, '$.playerVisibility', 'bogus_value') WHERE id = ?"
        )->execute([self::NPC_ID]);

        $this->simulateLogin(self::PLAYER1_ID);
        $_GET = ['campaignId' => self::CAMP_ID];
        $response = $this->callController(fn() => CharacterController::index());

        $ids = array_column($response['body'], 'id');
        $this->assertNotContains(self::NPC_ID, $ids, 'Unknown playerVisibility must be treated as hidden');
    }

    /**
     * Multiple NPCs with different visibility levels are all shaped correctly
     * in a single response (integration smoke test).
     */
    public function testMixedNpcVisibilityLevelsInOneResponse(): void
    {
        $this->createCharacter('npc_hidden',     self::CAMP_ID, self::GM_ID, 'Hidden Boss',   true, ['playerVisibility' => 'hidden']);
        $this->createCharacter('npc_name',       self::CAMP_ID, self::GM_ID, 'Named Ally',    true, ['playerVisibility' => 'name']);
        $this->createCharacter('npc_name_level', self::CAMP_ID, self::GM_ID, 'Rival Fighter', true, ['playerVisibility' => 'name_level', 'classLevels' => [['classId' => 'fighter', 'level' => 3]]]);
        $this->createCharacter('npc_full',       self::CAMP_ID, self::GM_ID, 'Allied Wizard',  true, ['playerVisibility' => 'full']);

        $this->simulateLogin(self::PLAYER1_ID);
        $_GET = ['campaignId' => self::CAMP_ID];
        $response = $this->callController(fn() => CharacterController::index());

        $this->assertEquals(200, $response['status']);
        $ids = array_column($response['body'], 'id');

        $this->assertContains(self::CHAR1_ID,    $ids, 'Own character must always be present');
        $this->assertNotContains(self::NPC_ID,   $ids, 'Default-hidden NPC must be absent');
        $this->assertNotContains('npc_hidden',   $ids, 'Explicit-hidden NPC must be absent');
        $this->assertContains('npc_name',        $ids);
        $this->assertContains('npc_name_level',  $ids);
        $this->assertContains('npc_full',        $ids);

        $byId = [];
        foreach ($response['body'] as $c) { $byId[$c['id']] = $c; }

        $this->assertEquals('name',       $byId['npc_name']['_playerVisibility']);
        $this->assertArrayNotHasKey('classLevels', $byId['npc_name']);

        $this->assertEquals('name_level', $byId['npc_name_level']['_playerVisibility']);
        $this->assertArrayHasKey('classLevels', $byId['npc_name_level']);

        $this->assertEquals('full',       $byId['npc_full']['_playerVisibility']);
        $this->assertArrayNotHasKey('gmOverrides', $byId['npc_full']);
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
        $this->simulateLogin(self::PLAYER1_ID);

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
        $this->simulateLogin(self::PLAYER1_ID);

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
        $this->simulateLogout();

        $_GET = ['campaignId' => self::CAMP_ID];
        $response = $this->callController(fn() => CharacterController::index());

        $this->assertEquals(401, $response['status']);
        $this->assertEquals('Unauthorized', $response['body']['error']);
    }

    // ============================================================
    // CAMPAIGN ISOLATION
    // ============================================================

    /**
     * A non-GM accessing a campaign where they have no characters receives
     * an empty list (not 403).
     */
    public function testPlayerGetsEmptyListForCampaignWhereTheyHaveNoCharacters(): void
    {
        $this->createCampaign('camp_other_001', self::GM_ID, 'Other Campaign');
        $this->createCharacter('char_other_camp', 'camp_other_001', self::GM_ID, 'GM Hero in other campaign');

        $this->simulateLogin(self::PLAYER1_ID);
        $_GET = ['campaignId' => 'camp_other_001'];
        $response = $this->callController(fn() => CharacterController::index());

        $this->assertEquals(200, $response['status']);
        $this->assertCount(0, $response['body'],
            'Player should see empty list for a campaign where they have no characters');
    }

    /**
     * Cross-campaign isolation: characters from Campaign A must not appear
     * when querying Campaign B.
     */
    public function testCampaignIdFilterPreventsCharacterLeakageBetweenCampaigns(): void
    {
        $this->createCampaign('camp_second_001', self::GM_ID, 'Second Campaign');
        $this->createCharacter('char_player1_in_camp2', 'camp_second_001', self::PLAYER1_ID, 'Player1 in Camp2');

        $this->simulateLogin(self::PLAYER1_ID);

        $_GET = ['campaignId' => self::CAMP_ID];
        $response1 = $this->callController(fn() => CharacterController::index());
        $ids1 = array_column($response1['body'], 'id');
        $this->assertContains(self::CHAR1_ID,             $ids1, 'Own character in camp1 should appear');
        $this->assertNotContains('char_player1_in_camp2', $ids1,
            'Character from camp2 must not appear when querying camp1');

        $_GET = ['campaignId' => 'camp_second_001'];
        $response2 = $this->callController(fn() => CharacterController::index());
        $ids2 = array_column($response2['body'], 'id');
        $this->assertContains('char_player1_in_camp2', $ids2, 'Own character in camp2 should appear');
        $this->assertNotContains(self::CHAR1_ID,       $ids2,
            'Character from camp1 must not appear when querying camp2');
    }
}
