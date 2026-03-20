<?php
/**
 * @file tests/CharacterControllerTest.php
 * @description PHPUnit tests for CharacterController persistence.
 *
 * TESTS:
 *   - POST /api/characters: correctly saves character JSON to the DB.
 *   - GET /api/characters: correctly retrieves stored character JSON without corruption.
 *   - Nested JSON (activeFeatures, classLevels, gmOverrides) survives save/load.
 *   - gmOverrides are stored separately and not polluted into character_json.
 *
 * @see api/controllers/CharacterController.php
 * @see ARCHITECTURE.md Phase 16.2
 */

declare(strict_types=1);

require_once __DIR__ . '/TestCase.php';

class CharacterControllerTest extends TestCase
{
    private const GM_ID   = 'user_gm_001';
    private const USER_ID = 'user_player_001';
    private const CAMP_ID = 'camp_001';

    protected function setUp(): void
    {
        parent::setUp();
        $this->createUser(self::GM_ID, true, 'gmuser');
        $this->createUser(self::USER_ID, false, 'player');
        // Campaign owned by the player (so the player can create characters in it)
        $this->createCampaign(self::CAMP_ID, self::USER_ID);
    }

    // ============================================================
    // CREATE TESTS
    // ============================================================

    /**
     * POST /api/characters — saves a simple character correctly.
     */
    public function testCreateCharacterSavesBasicData(): void
    {
        $this->simulateLogin(self::USER_ID);

        $_POST = [];
        $GLOBALS['_INPUT'] = json_encode([
            'id'         => 'char_001',
            'name'       => 'Aragorn',
            'campaignId' => self::CAMP_ID,
            'isNPC'      => false,
            'classLevels' => ['class_ranger' => 5],
            'activeFeatures' => [],
        ]);

        // Override php://input for the test
        $response = $this->callControllerWithInput(
            fn() => CharacterController::create(),
            $GLOBALS['_INPUT']
        );

        $this->assertEquals(201, $response['status']);
        $this->assertEquals('Aragorn', $response['body']['name']);

        // Verify persisted correctly
        $pdo = Database::getInstance();
        $stmt = $pdo->prepare('SELECT character_json, gm_overrides_json FROM characters WHERE id = ?');
        $stmt->execute(['char_001']);
        $row = $stmt->fetch();

        $this->assertNotEmpty($row);
        $char = json_decode($row['character_json'], true);
        $this->assertEquals('Aragorn', $char['name']);
        $this->assertEquals(['class_ranger' => 5], $char['classLevels']);

        // gmOverrides should be empty (not in character_json)
        $this->assertEquals('[]', $row['gm_overrides_json']);
        $this->assertArrayNotHasKey('gmOverrides', $char);
    }

    /**
     * POST — saves complex nested JSON (activeFeatures, selections, linkedEntities).
     */
    public function testCreateCharacterSavesComplexNestedJson(): void
    {
        $this->simulateLogin(self::USER_ID);

        $complexChar = [
            'id'          => 'char_complex_001',
            'name'        => 'Gandalf',
            'campaignId'  => self::CAMP_ID,
            'isNPC'       => false,
            'classLevels' => ['class_wizard' => 15, 'class_cleric' => 5],
            'activeFeatures' => [
                [
                    'instanceId' => 'afi_wizard_001',
                    'featureId'  => 'class_wizard',
                    'isActive'   => true,
                    'selections' => ['domain_choice_1' => ['domain_war']],
                ],
                [
                    'instanceId' => 'afi_ring_narya',
                    'featureId'  => 'item_ring_narya',
                    'isActive'   => true,
                ],
            ],
            'attributes' => [
                'stat_int' => ['id' => 'stat_int', 'baseValue' => 22, 'totalValue' => 22, 'derivedModifier' => 6],
            ],
            'resources' => [
                'resources.hp' => ['id' => 'resources.hp', 'currentValue' => 120, 'temporaryValue' => 0, 'maxPipelineId' => 'combatStats.max_hp', 'resetCondition' => 'long_rest'],
            ],
            'linkedEntities' => [],
        ];

        $response = $this->callControllerWithInput(
            fn() => CharacterController::create(),
            json_encode($complexChar)
        );

        $this->assertEquals(201, $response['status']);

        // Retrieve and verify complex JSON is not corrupted
        $pdo = Database::getInstance();
        $stmt = $pdo->prepare('SELECT character_json FROM characters WHERE id = ?');
        $stmt->execute(['char_complex_001']);
        $row = $stmt->fetch();

        $this->assertNotEmpty($row, 'Character should be in DB');

        $retrieved = json_decode($row['character_json'], true);
        $this->assertNotNull($retrieved, 'character_json should be valid JSON');
        $this->assertEquals('Gandalf', $retrieved['name']);
        $this->assertEquals(['class_wizard' => 15, 'class_cleric' => 5], $retrieved['classLevels']);
        $this->assertCount(2, $retrieved['activeFeatures'], 'Should have 2 active features');
        $this->assertEquals(
            ['domain_choice_1' => ['domain_war']],
            $retrieved['activeFeatures'][0]['selections'],
            'Feature selections should survive round-trip'
        );
        $this->assertEquals(120, $retrieved['resources']['resources.hp']['currentValue']);
        $this->assertEquals(22, $retrieved['attributes']['stat_int']['baseValue']);
    }

    /**
     * POST — gmOverrides in request body are stripped from character_json.
     */
    public function testCreateCharacterStripsGmOverridesFromCharacterJson(): void
    {
        $this->simulateLogin(self::USER_ID);

        $charWithOverrides = [
            'id'          => 'char_override_test',
            'name'        => 'Test Char',
            'campaignId'  => self::CAMP_ID,
            'isNPC'       => false,
            'classLevels' => [],
            'activeFeatures' => [],
            'gmOverrides' => [  // This should NOT end up in character_json
                ['instanceId' => 'gm_curse_001', 'featureId' => 'gm_custom_curse', 'isActive' => true],
            ],
        ];

        $response = $this->callControllerWithInput(
            fn() => CharacterController::create(),
            json_encode($charWithOverrides)
        );

        $this->assertEquals(201, $response['status']);

        $pdo = Database::getInstance();
        $stmt = $pdo->prepare('SELECT character_json, gm_overrides_json FROM characters WHERE id = ?');
        $stmt->execute(['char_override_test']);
        $row = $stmt->fetch();

        $char = json_decode($row['character_json'], true);

        // gmOverrides must NOT be in character_json
        $this->assertArrayNotHasKey('gmOverrides', $char, 'gmOverrides should not be in character_json');

        // gm_overrides_json should be empty (player create cannot set GM overrides)
        $this->assertEquals('[]', $row['gm_overrides_json']);
    }

    // ============================================================
    // READ TESTS
    // ============================================================

    /**
     * GET /api/characters — retrieves created character without corruption.
     */
    public function testGetCharacterReturnsCorrectData(): void
    {
        // Create character directly in DB
        $this->createCharacter(
            'char_retrieve_001',
            self::CAMP_ID,
            self::USER_ID,
            'Legolas',
            false,
            ['classLevels' => ['class_ranger' => 10]]
        );

        $this->simulateLogin(self::USER_ID);

        $_GET = ['campaignId' => self::CAMP_ID];
        $response = $this->callController(fn() => CharacterController::index());

        $this->assertEquals(200, $response['status']);
        $this->assertCount(1, $response['body']);
        $this->assertEquals('Legolas', $response['body'][0]['name']);
    }

    /**
     * GET — Player only sees their own characters, not other players'.
     */
    public function testGetCharactersFiltersToCurrentPlayer(): void
    {
        $this->createUser('other_player', false, 'otherplayer');

        $this->createCharacter('char_mine', self::CAMP_ID, self::USER_ID, 'My Hero');
        $this->createCharacter('char_other', self::CAMP_ID, 'other_player', 'Other Hero');

        $this->simulateLogin(self::USER_ID);

        $_GET = ['campaignId' => self::CAMP_ID];
        $response = $this->callController(fn() => CharacterController::index());

        $this->assertEquals(200, $response['status']);
        $this->assertCount(1, $response['body'], 'Player should only see their own character');
        $this->assertEquals('char_mine', $response['body'][0]['id']);
    }

    // ============================================================
    // UPDATE TESTS
    // ============================================================

    /**
     * PUT /api/characters/{id} — updates character correctly.
     */
    public function testUpdateCharacterSavesUpdatedData(): void
    {
        $this->createCharacter('char_update', self::CAMP_ID, self::USER_ID, 'Old Name');
        $this->simulateLogin(self::USER_ID);

        $response = $this->callControllerWithInput(
            fn() => CharacterController::update('char_update'),
            json_encode([
                'id'   => 'char_update',
                'name' => 'New Name',
                'classLevels' => ['class_fighter' => 7],
                'activeFeatures' => [],
            ])
        );

        $this->assertEquals(200, $response['status']);

        // Verify the updated data
        $pdo = Database::getInstance();
        $stmt = $pdo->prepare('SELECT name, character_json FROM characters WHERE id = ?');
        $stmt->execute(['char_update']);
        $row = $stmt->fetch();

        $this->assertEquals('New Name', $row['name']);
        $char = json_decode($row['character_json'], true);
        $this->assertEquals(['class_fighter' => 7], $char['classLevels']);
    }

    // ============================================================
    // HELPER
    // ============================================================

    /**
     * Calls a controller action with a custom JSON input body.
     * Mocks php://input by using a stream wrapper or direct override.
     */
    protected function callControllerWithInput(callable $action, string $jsonBody): array
    {
        // Override php://input by using a global that the controller reads
        // We use a stream wrapper hack since we can't easily override php://input in tests.
        // Instead, we directly call the controller with the parsed body available.
        //
        // WORKAROUND: Create a file_get_contents('php://input') override using
        // a PHP test double. For simplicity, we write the body to a temp file
        // and override the $_SERVER input stream.
        //
        // PRACTICAL APPROACH: Use runkit or stream wrappers for php://input mocking.
        // For this implementation, we use a simpler approach: mock the internal
        // json_decode(file_get_contents('php://input')) by setting a global.

        // PHPUnit best practice: use a wrapper function in controllers that can be mocked.
        // Since our controllers use file_get_contents('php://input') directly,
        // we use PHP's stream wrapper to override it.

        $tmpFile = tempnam(sys_get_temp_dir(), 'phpunit_input_');
        file_put_contents($tmpFile, $jsonBody);

        // Use a custom stream wrapper to intercept php://input reads
        stream_wrapper_unregister('php');
        stream_register_wrapper('php', TestPhpInputStream::class);
        TestPhpInputStream::$inputData = $jsonBody;

        ob_start();
        try {
            $action();
        } finally {
            stream_wrapper_restore('php');
            unlink($tmpFile);
        }
        $output = ob_get_clean();

        $status = http_response_code();
        http_response_code(200);

        return ['status' => $status, 'body' => json_decode($output, true) ?? []];
    }
}

/**
 * PHP stream wrapper to mock php://input in tests.
 *
 * WHY NEEDED?
 *   Our controllers use `file_get_contents('php://input')` to read the request body.
 *   In CLI tests (PHPUnit), php://input is empty. This stream wrapper intercepts
 *   calls to `php://input` and returns our test data instead.
 *
 * USAGE:
 *   stream_wrapper_unregister('php');
 *   stream_register_wrapper('php', TestPhpInputStream::class);
 *   TestPhpInputStream::$inputData = '{"key":"value"}';
 *   // ... run controller
 *   stream_wrapper_restore('php');
 */
class TestPhpInputStream
{
    /** @var string The data to return when php://input is read. */
    public static string $inputData = '';

    /** @var int Current read position. */
    private int $position = 0;

    /** @var string The context (not used but required by PHP stream wrapper interface). */
    public mixed $context;

    public function stream_open(string $path, string $mode, int $options, ?string &$opened_path): bool
    {
        $this->position = 0;
        return true;
    }

    public function stream_read(int $count): string
    {
        $result = substr(self::$inputData, $this->position, $count);
        $this->position += strlen($result);
        return $result;
    }

    public function stream_eof(): bool
    {
        return $this->position >= strlen(self::$inputData);
    }

    public function stream_stat(): array
    {
        return [];
    }

    public function url_stat(string $path, int $flags): array
    {
        return [];
    }
}
