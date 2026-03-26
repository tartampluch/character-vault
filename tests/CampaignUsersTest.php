<?php
/**
 * @file tests/CampaignUsersTest.php
 * @description PHPUnit tests for Phase 22 campaign membership endpoints.
 *
 * TESTS (5 scenarios):
 *   (17) GM adds a user to a campaign → 201
 *   (18) Suspended user can be added to a campaign → 201
 *   (19) Adding a duplicate member returns 409 Conflict
 *   (20) GM removes a user from a campaign → 200
 *   (21) Player (non-GM) cannot manage campaign members → 403
 *
 * @see api/controllers/CampaignController.php (getUsers, addUser, removeUser)
 * @see ARCHITECTURE.md Phase 22.4
 */

declare(strict_types=1);

require_once __DIR__ . '/TestCase.php';

class CampaignUsersTest extends TestCase
{
    private const GM_ID       = 'user_cu_gm_001';
    private const PLAYER_ID   = 'user_cu_player_001';
    private const PLAYER2_ID  = 'user_cu_player_002';
    private const CAMP_ID     = 'camp_cu_test_001';

    protected function setUp(): void
    {
        parent::setUp();

        $this->createUser(self::GM_ID,      'gm',     'cu_gm',      'pass123');
        $this->createUser(self::PLAYER_ID,  'player', 'cu_player',  'pass123');
        $this->createUser(self::PLAYER2_ID, 'player', 'cu_player2', 'pass123');
        $this->createCampaign(self::CAMP_ID, self::GM_ID, 'CU Test Campaign');
    }

    // =========================================================================
    // (17) GM ADDS USER TO CAMPAIGN
    // =========================================================================

    /**
     * A GM can add an existing user to one of their campaigns.
     * Returns 201 with the new membership record.
     */
    public function testGmAddsUserToCampaign(): void
    {
        $this->simulateLogin(self::GM_ID, 'gm', 'cu_gm');

        $response = $this->callControllerWithInput(
            fn() => CampaignController::addUser(self::CAMP_ID),
            json_encode(['user_id' => self::PLAYER_ID])
        );

        $this->assertEquals(201, $response['status']);
        $this->assertEquals(self::CAMP_ID,   $response['body']['campaign_id']);
        $this->assertEquals(self::PLAYER_ID, $response['body']['user_id']);
        $this->assertArrayHasKey('joined_at', $response['body']);

        // Verify the membership row exists in the DB
        $pdo  = Database::getInstance();
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM campaign_users WHERE campaign_id = ? AND user_id = ?');
        $stmt->execute([self::CAMP_ID, self::PLAYER_ID]);
        $this->assertEquals(1, (int)$stmt->fetchColumn(), 'campaign_users row must be created');
    }

    // =========================================================================
    // (18) SUSPENDED USER CAN BE ADDED
    // =========================================================================

    /**
     * A suspended user can still be added to a campaign.
     * Suspended players may have active characters that the GM needs to manage.
     */
    public function testSuspendedUserCanBeAddedToCampaign(): void
    {
        // Create a suspended player
        $this->createUser('user_cu_suspended_001', 'player', 'cu_suspended', 'pass123', true);

        $this->simulateLogin(self::GM_ID, 'gm', 'cu_gm');

        $response = $this->callControllerWithInput(
            fn() => CampaignController::addUser(self::CAMP_ID),
            json_encode(['user_id' => 'user_cu_suspended_001'])
        );

        $this->assertEquals(201, $response['status'],
            'Suspended users must be addable to campaigns (they may have active characters)');
        $this->assertEquals('user_cu_suspended_001', $response['body']['user_id']);
    }

    // =========================================================================
    // (19) DUPLICATE MEMBER — 409
    // =========================================================================

    /**
     * Adding a user who is already a member of the campaign returns 409 Conflict.
     */
    public function testAddDuplicateMemberReturns409(): void
    {
        $this->simulateLogin(self::GM_ID, 'gm', 'cu_gm');

        // First add
        $this->callControllerWithInput(
            fn() => CampaignController::addUser(self::CAMP_ID),
            json_encode(['user_id' => self::PLAYER_ID])
        );

        // Second add (duplicate)
        $response = $this->callControllerWithInput(
            fn() => CampaignController::addUser(self::CAMP_ID),
            json_encode(['user_id' => self::PLAYER_ID])
        );

        $this->assertEquals(409, $response['status']);
        $this->assertEquals('Conflict', $response['body']['error']);
    }

    // =========================================================================
    // (20) GM REMOVES USER FROM CAMPAIGN
    // =========================================================================

    /**
     * A GM can remove a user from a campaign. Only the membership row is removed;
     * the user's characters are NOT deleted.
     */
    public function testGmRemovesUserFromCampaign(): void
    {
        // Add the player first
        $pdo = Database::getInstance();
        $pdo->prepare('INSERT INTO campaign_users (campaign_id, user_id, joined_at) VALUES (?, ?, ?)')
            ->execute([self::CAMP_ID, self::PLAYER_ID, time()]);

        $this->simulateLogin(self::GM_ID, 'gm', 'cu_gm');

        $response = $this->callController(
            fn() => CampaignController::removeUser(self::CAMP_ID, self::PLAYER_ID)
        );

        $this->assertEquals(200, $response['status']);
        $this->assertTrue($response['body']['removed']);

        // Verify row is gone
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM campaign_users WHERE campaign_id = ? AND user_id = ?');
        $stmt->execute([self::CAMP_ID, self::PLAYER_ID]);
        $this->assertEquals(0, (int)$stmt->fetchColumn(), 'campaign_users row must be deleted');
    }

    // =========================================================================
    // (21) PLAYER CANNOT MANAGE CAMPAIGN MEMBERS — 403
    // =========================================================================

    /**
     * A player (role='player') cannot add users to campaigns.
     */
    public function testPlayerCannotAddMemberToCampaign(): void
    {
        $this->simulateLogin(self::PLAYER_ID, 'player', 'cu_player');

        $response = $this->callControllerWithInput(
            fn() => CampaignController::addUser(self::CAMP_ID),
            json_encode(['user_id' => self::PLAYER2_ID])
        );

        $this->assertEquals(403, $response['status']);
        $this->assertEquals('Forbidden', $response['body']['error']);
    }

    /**
     * A player cannot remove users from campaigns.
     */
    public function testPlayerCannotRemoveMemberFromCampaign(): void
    {
        // Add player2 so there is a membership to attempt to remove
        $pdo = Database::getInstance();
        $pdo->prepare('INSERT INTO campaign_users (campaign_id, user_id, joined_at) VALUES (?, ?, ?)')
            ->execute([self::CAMP_ID, self::PLAYER2_ID, time()]);

        $this->simulateLogin(self::PLAYER_ID, 'player', 'cu_player');

        $response = $this->callController(
            fn() => CampaignController::removeUser(self::CAMP_ID, self::PLAYER2_ID)
        );

        $this->assertEquals(403, $response['status']);
        $this->assertEquals('Forbidden', $response['body']['error']);
    }

    /**
     * A player cannot list campaign members.
     */
    public function testPlayerCannotListCampaignMembers(): void
    {
        $this->simulateLogin(self::PLAYER_ID, 'player', 'cu_player');

        $response = $this->callController(
            fn() => CampaignController::getUsers(self::CAMP_ID)
        );

        $this->assertEquals(403, $response['status']);
    }

    // =========================================================================
    // ADDITIONAL: getUsers returns members with correct shape
    // =========================================================================

    /**
     * GET /api/campaigns/{id}/users returns all members with correct fields.
     * Suspended members are included.
     */
    public function testGetCampaignUsersReturnsCorrectShape(): void
    {
        // Seed a suspended member and a regular member
        $this->createUser('user_cu_suspended_002', 'player', 'cu_sus2', 'pass123', true);
        $pdo = Database::getInstance();
        $pdo->prepare('INSERT INTO campaign_users (campaign_id, user_id, joined_at) VALUES (?, ?, ?)')
            ->execute([self::CAMP_ID, self::PLAYER_ID, time()]);
        $pdo->prepare('INSERT INTO campaign_users (campaign_id, user_id, joined_at) VALUES (?, ?, ?)')
            ->execute([self::CAMP_ID, 'user_cu_suspended_002', time()]);

        $this->simulateLogin(self::GM_ID, 'gm', 'cu_gm');

        $response = $this->callController(
            fn() => CampaignController::getUsers(self::CAMP_ID)
        );

        $this->assertEquals(200, $response['status']);
        $this->assertIsArray($response['body']);
        $this->assertCount(2, $response['body'], 'Both active and suspended members should be returned');

        $member = $response['body'][0];
        $this->assertArrayHasKey('user_id',      $member);
        $this->assertArrayHasKey('username',     $member);
        $this->assertArrayHasKey('player_name',  $member);
        $this->assertArrayHasKey('role',         $member);
        $this->assertArrayHasKey('is_suspended', $member);
        $this->assertArrayHasKey('joined_at',    $member);

        // Find the suspended member and verify the flag
        $suspended = array_filter($response['body'], fn($m) => $m['user_id'] === 'user_cu_suspended_002');
        $this->assertCount(1, $suspended, 'Suspended member should appear in the list');
        $suspendedMember = array_values($suspended)[0];
        $this->assertTrue($suspendedMember['is_suspended'], 'Suspended member must have is_suspended: true');
    }
}
