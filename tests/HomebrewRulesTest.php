<?php
/**
 * @file tests/HomebrewRulesTest.php
 * @description PHPUnit tests for the Campaign-Scope Homebrew Rules API.
 *
 * COVERAGE (Phase 21.7.1 — PROGRESS.md):
 *   1. Fresh campaign returns an empty array `[]`.
 *   2. GM PUT saves data; subsequent GET returns the persisted data.
 *   3. Non-GM PUT → 403 Forbidden.
 *   4. Invalid (non-JSON) body → 422 Unprocessable Entity.
 *   5. Body > 2 MB → 413 Request Entity Too Large (Content-Length gate).
 *   6. Body > 2 MB → 413 Request Entity Too Large (strlen gate, no Content-Length).
 *   7. `campaigns.updated_at` increases after a successful PUT.
 *   8. Well-formed Feature with unknown extra fields is accepted (no over-validation).
 *   9. Unauthenticated GET → 401 Unauthorized.
 *  10. GET on unknown campaign → 404 Not Found.
 *  11. PUT on unknown campaign → 404 Not Found.
 *  12. Non-array JSON root (object) → 422 Unprocessable Entity.
 *  13. PUT sends `[]` (empty array); GET returns `[]` (round-trip idempotency).
 *  14. PUT persists multiple entities; GET returns all of them in insertion order.
 *  15. Player (non-GM) can GET homebrew rules (they are not GM-only for reads).
 *
 * ARCHITECTURE REFERENCES:
 *   - ARCHITECTURE.md §21.1.1 — Campaign-scope homebrew rules design.
 *   - CampaignController::getHomebrewRules() — GET /api/campaigns/{id}/homebrew-rules
 *   - CampaignController::setHomebrewRules() — PUT /api/campaigns/{id}/homebrew-rules
 *
 * PATTERNS USED:
 *   - Extends TestCase (in-memory SQLite, migrate() called in setUp()).
 *   - callController() for GET requests.
 *   - callControllerWithInput() for PUT requests with a JSON body.
 *   - simulateLogin() / simulateLogout() for auth.
 *   - Injecting a past timestamp into the DB to test updated_at without sleep().
 *
 * @see tests/TestCase.php  Base class with fixture helpers.
 * @see api/controllers/CampaignController.php  The controller under test.
 */

declare(strict_types=1);

require_once __DIR__ . '/TestCase.php';

class HomebrewRulesTest extends TestCase
{
    // ============================================================
    // FIXTURE CONSTANTS
    // ============================================================

    private const GM_ID       = 'user_gm_hbr_001';
    private const PLAYER_ID   = 'user_player_hbr_001';
    private const CAMP_ID     = 'camp_hbr_001';
    private const UNKNOWN_ID  = 'camp_hbr_DOES_NOT_EXIST';

    /**
     * A minimal, well-formed Feature object to use in test payloads.
     * Uses only fields that are part of the Feature interface.
     * Extra/unknown fields are intentionally absent to keep the fixture small;
     * test #8 exercises the unknown-fields acceptance path.
     */
    private const FEAT_RACE = [
        'id'          => 'race_homebrew_orc_variant',
        'category'    => 'race',
        'label'       => ['en' => 'Orc Variant', 'fr' => 'Orque Variante'],
        'description' => ['en' => 'A custom orc variant.', 'fr' => "Une variante d'orque."],
        'ruleSource'  => 'user_homebrew',
        'tags'        => ['race_orc_variant'],
    ];

    private const FEAT_SPELL = [
        'id'          => 'spell_homebrew_fireball_ii',
        'category'    => 'magic',
        'label'       => ['en' => 'Fireball II', 'fr' => 'Boule de feu II'],
        'description' => ['en' => 'An enhanced fireball.'],
        'ruleSource'  => 'user_homebrew',
        'tags'        => ['spell_fire', 'spell_level_4'],
    ];

    // ============================================================
    // TEST SETUP
    // ============================================================

    /**
     * Create a GM, a regular player, and a campaign before each test.
     * The GM owns the campaign; the player is a non-GM participant.
     */
    protected function setUp(): void
    {
        parent::setUp();

        $this->createUser(self::GM_ID, true, 'gm_hbr');
        $this->createUser(self::PLAYER_ID, false, 'player_hbr');
        $this->createCampaign(self::CAMP_ID, self::GM_ID, 'Homebrew Test Campaign');
    }

    // ============================================================
    // TEST 1 — Fresh campaign returns an empty array
    // ============================================================

    /**
     * GET /api/campaigns/{id}/homebrew-rules on a freshly-created campaign
     * must return an empty JSON array `[]` — not null, not an object.
     *
     * WHY: The DB column defaults to '[]'. The controller parses it and returns
     * the array directly. The frontend DataLoader relies on receiving [] when
     * no homebrew content exists.
     */
    public function testFreshCampaignReturnsEmptyArray(): void
    {
        $this->simulateLogin(self::GM_ID, true);

        $response = $this->callController(
            fn() => CampaignController::getHomebrewRules(self::CAMP_ID)
        );

        $this->assertEquals(200, $response['status'],
            'GET /homebrew-rules on a fresh campaign should return 200');
        $this->assertIsArray($response['body'],
            'Response body must be a JSON array, not null or an object');
        $this->assertCount(0, $response['body'],
            'Fresh campaign must have an empty homebrew-rules array');
    }

    // ============================================================
    // TEST 2 — GM PUT saves data; GET returns the persisted data
    // ============================================================

    /**
     * A GM can PUT a non-empty homebrew array. Subsequent GET must return
     * exactly the same entities (round-trip with no data loss or mutation).
     *
     * WHY: This is the core save/load cycle used by HomebrewStore.svelte.ts.
     * If the array is mutated (extra fields stripped, field reordered, etc.)
     * the frontend store will diverge from the backend on the next load.
     */
    public function testGmCanSaveAndReloadHomebrewRules(): void
    {
        $this->simulateLogin(self::GM_ID, true);

        $payload = [self::FEAT_RACE];

        // PUT the entity array
        $putResponse = $this->callControllerWithInput(
            fn() => CampaignController::setHomebrewRules(self::CAMP_ID),
            json_encode($payload)
        );

        $this->assertEquals(200, $putResponse['status'],
            'GM PUT should return 200 on success');
        $this->assertArrayHasKey('id', $putResponse['body'],
            'PUT response must include the campaign id');
        $this->assertArrayHasKey('updatedAt', $putResponse['body'],
            'PUT response must include updatedAt timestamp');
        $this->assertEquals(self::CAMP_ID, $putResponse['body']['id'],
            'PUT response id must match the campaign id');

        // GET the homebrew rules
        $getResponse = $this->callController(
            fn() => CampaignController::getHomebrewRules(self::CAMP_ID)
        );

        $this->assertEquals(200, $getResponse['status'],
            'GET after PUT should return 200');
        $this->assertCount(1, $getResponse['body'],
            'GET must return exactly 1 entity after saving 1');

        $entity = $getResponse['body'][0];
        $this->assertEquals(self::FEAT_RACE['id'], $entity['id'],
            'Retrieved entity id must match the saved entity');
        $this->assertEquals(self::FEAT_RACE['category'], $entity['category'],
            'Retrieved entity category must match');
        $this->assertEquals(self::FEAT_RACE['ruleSource'], $entity['ruleSource'],
            'Retrieved entity ruleSource must match');
    }

    // ============================================================
    // TEST 3 — Non-GM PUT → 403 Forbidden
    // ============================================================

    /**
     * A regular player (non-GM) attempting PUT /homebrew-rules must receive
     * 403 Forbidden. Only GMs are authorised to write homebrew rules.
     *
     * WHY: The homebrew editors are a GM-only feature (ARCHITECTURE.md §21).
     * The backend must enforce this, not just the frontend.
     */
    public function testNonGmPutReturns403(): void
    {
        $this->simulateLogin(self::PLAYER_ID, false);

        $response = $this->callControllerWithInput(
            fn() => CampaignController::setHomebrewRules(self::CAMP_ID),
            json_encode([self::FEAT_RACE])
        );

        $this->assertEquals(403, $response['status'],
            'Non-GM PUT must return 403 Forbidden');
        $this->assertEquals('Forbidden', $response['body']['error'] ?? '',
            'Error key must be "Forbidden" for the frontend to identify the cause');
    }

    // ============================================================
    // TEST 4 — Invalid JSON body → 422 Unprocessable Entity
    // ============================================================

    /**
     * A PUT with a syntactically invalid JSON body (not parseable) must return
     * 422 Unprocessable Entity. The server never stores corrupt data.
     *
     * WHY: json_decode() returns null AND sets json_last_error() != JSON_ERROR_NONE.
     * The controller checks json_last_error() — not the null value — to distinguish
     * "invalid JSON" from "literal null JSON value".
     */
    public function testInvalidJsonBodyReturns422(): void
    {
        $this->simulateLogin(self::GM_ID, true);

        $response = $this->callControllerWithInput(
            fn() => CampaignController::setHomebrewRules(self::CAMP_ID),
            'this is { not: valid JSON }'
        );

        $this->assertEquals(422, $response['status'],
            'Invalid JSON body must return 422 Unprocessable Entity');
        $this->assertEquals('UnprocessableEntity', $response['body']['error'] ?? '',
            'Error key must be "UnprocessableEntity"');
    }

    // ============================================================
    // TEST 5 — Body > 2 MB rejected via Content-Length header → 413
    // ============================================================

    /**
     * When the Content-Length header signals a body > 2 MB, the controller must
     * reject it immediately with 413 before reading the body.
     *
     * WHY: Reading a 2+ MB body into memory is expensive. The Content-Length gate
     * lets the server fail fast. The controller checks $_SERVER['CONTENT_LENGTH']
     * before calling file_get_contents('php://input').
     */
    public function testBodyOverLimitViaContentLengthHeaderReturns413(): void
    {
        $this->simulateLogin(self::GM_ID, true);

        // Simulate a 3 MB Content-Length header (over the 2 MB limit)
        $_SERVER['CONTENT_LENGTH'] = 3 * 1024 * 1024; // 3 MB

        try {
            $response = $this->callControllerWithInput(
                fn() => CampaignController::setHomebrewRules(self::CAMP_ID),
                json_encode([]) // body content is irrelevant — gate fires first
            );

            $this->assertEquals(413, $response['status'],
                'Content-Length > 2 MB must return 413 Request Entity Too Large');
            $this->assertEquals('RequestTooLarge', $response['body']['error'] ?? '',
                'Error key must be "RequestTooLarge"');
        } finally {
            // Always clean up the SERVER superglobal to avoid leaking state between tests.
            unset($_SERVER['CONTENT_LENGTH']);
        }
    }

    // ============================================================
    // TEST 6 — Body > 2 MB rejected via strlen gate (no Content-Length) → 413
    // ============================================================

    /**
     * When Content-Length is absent (chunked transfer encoding, for example),
     * the controller must still reject bodies > 2 MB after reading them via strlen().
     *
     * WHY: The Content-Length gate (Test 5) is a fast guard but not reliable in all
     * environments. The strlen() gate after file_get_contents() is the definitive check.
     *
     * IMPLEMENTATION NOTE:
     *   We construct a string that is exactly 2 097 153 bytes (2 MB + 1 byte) to
     *   trigger the post-read size check. The string is ASCII padding (not valid JSON),
     *   but the size check happens before JSON parsing.
     */
    public function testBodyOverLimitViaStrlenGateReturns413(): void
    {
        $this->simulateLogin(self::GM_ID, true);

        // Ensure CONTENT_LENGTH is absent so the strlen gate is the only guard.
        unset($_SERVER['CONTENT_LENGTH']);

        // 2 MB + 1 byte (exceeds the 2 * 1024 * 1024 = 2 097 152 byte limit)
        $oversizedBody = str_repeat('A', 2 * 1024 * 1024 + 1);

        $response = $this->callControllerWithInput(
            fn() => CampaignController::setHomebrewRules(self::CAMP_ID),
            $oversizedBody
        );

        $this->assertEquals(413, $response['status'],
            'Body strlen > 2 MB (with no Content-Length header) must return 413');
        $this->assertEquals('RequestTooLarge', $response['body']['error'] ?? '',
            'Error key must be "RequestTooLarge"');
    }

    // ============================================================
    // TEST 7 — campaigns.updated_at increases after a successful PUT
    // ============================================================

    /**
     * A successful PUT /homebrew-rules must bump `campaigns.updated_at`
     * so the sync-status polling endpoint notify connected clients of the change.
     *
     * WHY: ARCHITECTURE.md §21.1.1 specifies: "Updates `campaigns.updated_at` on PUT."
     * Without this, live-sync polling would miss homebrew changes.
     *
     * APPROACH:
     *   Inject a timestamp 100 s in the past to create a guaranteed gap, then
     *   verify the stored timestamp is strictly greater after the PUT. This avoids
     *   any real-time dependency (no sleep() calls).
     */
    public function testPutUpdatesUpdatedAt(): void
    {
        $pdo = Database::getInstance();

        // Inject a past timestamp for the test campaign
        $pastTimestamp = time() - 100;
        $pdo->prepare('UPDATE campaigns SET updated_at = ? WHERE id = ?')
            ->execute([$pastTimestamp, self::CAMP_ID]);

        // Confirm the injection
        $stmt = $pdo->prepare('SELECT updated_at FROM campaigns WHERE id = ?');
        $stmt->execute([self::CAMP_ID]);
        $beforeTs = (int)$stmt->fetchColumn();
        $this->assertEquals($pastTimestamp, $beforeTs,
            'Test setup: injected past timestamp is correctly stored');

        // Perform the PUT
        $this->simulateLogin(self::GM_ID, true);
        $this->callControllerWithInput(
            fn() => CampaignController::setHomebrewRules(self::CAMP_ID),
            json_encode([self::FEAT_RACE])
        );

        // Verify the timestamp increased
        $stmt->execute([self::CAMP_ID]);
        $afterTs = (int)$stmt->fetchColumn();

        $this->assertGreaterThan($beforeTs, $afterTs,
            'campaigns.updated_at must increase after a PUT /homebrew-rules');
    }

    // ============================================================
    // TEST 8 — Well-formed Feature with unknown extra fields is accepted
    // ============================================================

    /**
     * The backend stores Feature objects verbatim (it never interprets D&D rules).
     * A Feature containing extra fields not in the current PHP schema must be
     * accepted without a 422 or 400 error.
     *
     * WHY: The JSON is opaque to the PHP layer. Over-validation on the server would
     * break forward compatibility whenever the TypeScript Feature interface is extended
     * on the frontend. The server's only concern is: is it a valid JSON array?
     *
     * NOTE: This test also implicitly verifies that the persisted JSON round-trips
     * all unknown fields untouched (no PHP-side field stripping occurs).
     */
    public function testUnknownExtraFieldsAreAccepted(): void
    {
        $this->simulateLogin(self::GM_ID, true);

        // A Feature with an extra field that is not in the current Feature interface.
        // This simulates a forward-compatible extension (e.g., a new field added in
        // a future Phase).
        $featureWithExtras = array_merge(self::FEAT_RACE, [
            'unknownFutureField'       => 'some_value',
            'anotherUnknownArrayField' => [1, 2, 3],
        ]);

        $putResponse = $this->callControllerWithInput(
            fn() => CampaignController::setHomebrewRules(self::CAMP_ID),
            json_encode([$featureWithExtras])
        );

        $this->assertEquals(200, $putResponse['status'],
            'PUT with extra/unknown fields must return 200 (no over-validation)');

        // Verify the extra fields are preserved in the GET response
        $getResponse = $this->callController(
            fn() => CampaignController::getHomebrewRules(self::CAMP_ID)
        );

        $this->assertCount(1, $getResponse['body'],
            'GET should return 1 entity');
        $entity = $getResponse['body'][0];

        $this->assertArrayHasKey('unknownFutureField', $entity,
            'Unknown extra fields must be preserved verbatim in the stored JSON');
        $this->assertEquals('some_value', $entity['unknownFutureField'],
            'Unknown field value must round-trip unchanged');
        $this->assertEquals([1, 2, 3], $entity['anotherUnknownArrayField'],
            'Unknown array field must round-trip unchanged');
    }

    // ============================================================
    // TEST 9 — Unauthenticated GET → 401 Unauthorized
    // ============================================================

    /**
     * An unauthenticated request (no session) to GET /homebrew-rules must fail
     * with 401. Homebrew rules are campaign content; guests may not read them.
     *
     * WHY: requireAuth() is called at the top of getHomebrewRules(). The test
     * verifies the auth guard is actually in place and not accidentally bypassed.
     */
    public function testUnauthenticatedGetReturns401(): void
    {
        $this->simulateLogout(); // Ensure no session is active

        $response = $this->callController(
            fn() => CampaignController::getHomebrewRules(self::CAMP_ID)
        );

        $this->assertEquals(401, $response['status'],
            'Unauthenticated GET must return 401 Unauthorized');
    }

    // ============================================================
    // TEST 10 — GET on unknown campaign → 404 Not Found
    // ============================================================

    /**
     * GET /api/campaigns/{id}/homebrew-rules on a non-existent campaign ID
     * must return 404 Not Found (not 200 with null or empty data).
     *
     * WHY: Silently returning [] for a missing campaign would mask data-integrity
     * issues on the frontend (e.g., the user navigated to a deleted campaign).
     */
    public function testGetOnUnknownCampaignReturns404(): void
    {
        $this->simulateLogin(self::GM_ID, true);

        $response = $this->callController(
            fn() => CampaignController::getHomebrewRules(self::UNKNOWN_ID)
        );

        $this->assertEquals(404, $response['status'],
            'GET on a non-existent campaign must return 404 Not Found');
        $this->assertEquals('NotFound', $response['body']['error'] ?? '',
            'Error key must be "NotFound"');
    }

    // ============================================================
    // TEST 11 — PUT on unknown campaign → 404 Not Found
    // ============================================================

    /**
     * PUT /api/campaigns/{id}/homebrew-rules on a non-existent campaign ID
     * must return 404 Not Found.
     *
     * WHY: The controller checks campaign existence after auth and size validation
     * (in the right concern order). The 404 must still surface for GMs
     * who reference a stale/deleted campaign ID.
     */
    public function testPutOnUnknownCampaignReturns404(): void
    {
        $this->simulateLogin(self::GM_ID, true);

        $response = $this->callControllerWithInput(
            fn() => CampaignController::setHomebrewRules(self::UNKNOWN_ID),
            json_encode([self::FEAT_RACE])
        );

        $this->assertEquals(404, $response['status'],
            'PUT on a non-existent campaign must return 404 Not Found');
        $this->assertEquals('NotFound', $response['body']['error'] ?? '',
            'Error key must be "NotFound"');
    }

    // ============================================================
    // TEST 12 — Non-array JSON root (object) → 422 Unprocessable Entity
    // ============================================================

    /**
     * The request body must be a JSON **array** (not an object, number, string,
     * or boolean). A JSON object `{}` at the root must be rejected with 422.
     *
     * WHY: The DataLoader expects an array of Feature objects. If the root is an
     * object, the PHP controller would try to iterate over it as if it were an
     * indexed array, potentially causing silent data corruption.
     *
     * ALSO TESTS: Literal `null` (valid JSON but not an array), a plain number (42),
     * and a top-level string — all should be rejected identically.
     */
    public function testNonArrayJsonRootReturns422(): void
    {
        $this->simulateLogin(self::GM_ID, true);

        // 12a — JSON object at root
        $responseObject = $this->callControllerWithInput(
            fn() => CampaignController::setHomebrewRules(self::CAMP_ID),
            json_encode(['id' => 'race_elf', 'category' => 'race']) // object, not array
        );
        $this->assertEquals(422, $responseObject['status'],
            'A JSON object at root must return 422 (only arrays are accepted)');
        $this->assertEquals('UnprocessableEntity', $responseObject['body']['error'] ?? '');

        // 12b — JSON null at root
        $responseNull = $this->callControllerWithInput(
            fn() => CampaignController::setHomebrewRules(self::CAMP_ID),
            'null'
        );
        $this->assertEquals(422, $responseNull['status'],
            'A JSON null at root must return 422');

        // 12c — JSON number at root
        $responseNumber = $this->callControllerWithInput(
            fn() => CampaignController::setHomebrewRules(self::CAMP_ID),
            '42'
        );
        $this->assertEquals(422, $responseNumber['status'],
            'A JSON number at root must return 422');
    }

    // ============================================================
    // TEST 13 — PUT empty array [] round-trips as []
    // ============================================================

    /**
     * A GM can PUT an empty array `[]` to clear all homebrew rules for a campaign.
     * The subsequent GET must also return `[]`.
     *
     * WHY: This is the "delete all homebrew" flow. HomebrewStore.ts will call PUT
     * with an empty array when the user deletes the last entity.
     * The server must store `[]` (not null, not omit the column).
     */
    public function testPutEmptyArrayRoundTrips(): void
    {
        $this->simulateLogin(self::GM_ID, true);

        // First, save some entities
        $this->callControllerWithInput(
            fn() => CampaignController::setHomebrewRules(self::CAMP_ID),
            json_encode([self::FEAT_RACE, self::FEAT_SPELL])
        );

        // Then, clear them by sending an empty array
        $putResponse = $this->callControllerWithInput(
            fn() => CampaignController::setHomebrewRules(self::CAMP_ID),
            json_encode([])
        );
        $this->assertEquals(200, $putResponse['status'],
            'PUT [] (clear all) must return 200');

        // GET should now return []
        $getResponse = $this->callController(
            fn() => CampaignController::getHomebrewRules(self::CAMP_ID)
        );
        $this->assertEquals(200, $getResponse['status']);
        $this->assertIsArray($getResponse['body'],
            'GET after clearing must still return an array (not null)');
        $this->assertCount(0, $getResponse['body'],
            'GET after PUT [] must return an empty array');
    }

    // ============================================================
    // TEST 14 — Multiple entities persist and return in insertion order
    // ============================================================

    /**
     * PUT with multiple Feature entities: the subsequent GET must return ALL of
     * them, in the same order as submitted.
     *
     * WHY: The DataLoader builds the virtual "user_homebrew" source in array
     * order. Entity order matters for last-wins merge semantics when the same
     * `id` appears twice (unlikely but possible during authoring).
     */
    public function testMultipleEntitiesPersistAndReturnInOrder(): void
    {
        $this->simulateLogin(self::GM_ID, true);

        $payload = [self::FEAT_RACE, self::FEAT_SPELL];

        $this->callControllerWithInput(
            fn() => CampaignController::setHomebrewRules(self::CAMP_ID),
            json_encode($payload)
        );

        $getResponse = $this->callController(
            fn() => CampaignController::getHomebrewRules(self::CAMP_ID)
        );

        $this->assertEquals(200, $getResponse['status']);
        $this->assertCount(2, $getResponse['body'],
            'GET must return exactly 2 entities after saving 2');

        // Order must be preserved (index 0 = FEAT_RACE, index 1 = FEAT_SPELL)
        $this->assertEquals(self::FEAT_RACE['id'], $getResponse['body'][0]['id'],
            'First entity in GET must match first entity in PUT (order preserved)');
        $this->assertEquals(self::FEAT_SPELL['id'], $getResponse['body'][1]['id'],
            'Second entity in GET must match second entity in PUT (order preserved)');
    }

    // ============================================================
    // TEST 15 — Non-GM (player) can GET homebrew rules
    // ============================================================

    /**
     * GET /api/campaigns/{id}/homebrew-rules is readable by all authenticated
     * users — not just GMs. Players need the homebrew entities for their
     * DataLoader to function correctly in-session.
     *
     * WHY: ARCHITECTURE.md §21.1.1 — "accessible to GM and players".
     * Only PUT is restricted to GMs; GET is open to all session participants.
     *
     * FLOW:
     *   1. GM saves a homebrew entity.
     *   2. Player (non-GM) queries GET — must receive 200 + the entity.
     */
    public function testPlayerCanReadHomebrewRules(): void
    {
        // GM saves an entity first
        $this->simulateLogin(self::GM_ID, true);
        $this->callControllerWithInput(
            fn() => CampaignController::setHomebrewRules(self::CAMP_ID),
            json_encode([self::FEAT_RACE])
        );

        // Player reads the homebrew rules
        $this->simulateLogin(self::PLAYER_ID, false);
        $response = $this->callController(
            fn() => CampaignController::getHomebrewRules(self::CAMP_ID)
        );

        $this->assertEquals(200, $response['status'],
            'Non-GM authenticated user must be able to read homebrew rules (200)');
        $this->assertCount(1, $response['body'],
            'Player GET must return the entity the GM saved');
        $this->assertEquals(self::FEAT_RACE['id'], $response['body'][0]['id'],
            'Entity id must match what the GM saved');
    }
}
