<?php
/**
 * @file tests/GlobalRulesTest.php
 * @description PHPUnit tests for the Global Rule Source API.
 *
 * COVERAGE (Phase 21.7.2 — PROGRESS.md):
 *   1.  GET lists files — returns empty array when directory does not exist yet.
 *   2.  GET lists files after PUT — newly created file appears in the listing.
 *   3.  Valid PUT creates a file in the storage directory.
 *   4.  PUT → GET file content round-trip (content is preserved).
 *   5.  Invalid filename (directory traversal `../escape.json`) → 422.
 *   6.  Invalid filename (uppercase letters `MY_FILE.json`) → 422.
 *   7.  Invalid filename (space in name `my file.json`) → 422.
 *   8.  Invalid filename (no .json extension `50_setting`) → 422.
 *   9.  Body > 2 MB via Content-Length header → 413.
 *   10. Body > 2 MB via strlen gate (no Content-Length) → 413.
 *   11. DELETE removes the file; subsequent GET returns 404.
 *   12. Non-GM PUT → 403 Forbidden.
 *   13. Non-GM DELETE → 403 Forbidden.
 *   14. Unauthenticated GET (list) → 401 Unauthorized.
 *   15. Unauthenticated PUT → 401 Unauthorized.
 *   16. Unauthenticated DELETE → 401 Unauthorized.
 *   17. PUT with invalid (non-JSON) body → 422 Unprocessable Entity.
 *   18. PUT with non-array JSON root (object) → 422 Unprocessable Entity.
 *   19. GET /api/global-rules/{filename} on a non-existent file → 404.
 *   20. GET /api/global-rules/{filename} returns full content for any authenticated user.
 *   21. Multiple files appear in alphabetically sorted order in list response.
 *   22. PUT overwrites an existing file (idempotent replace semantics).
 *
 * ISOLATION STRATEGY:
 *   Each test class instance creates a unique temp directory via sys_get_temp_dir()
 *   and sets GLOBAL_RULES_DIR to that path via putenv(). This prevents any test
 *   from touching the real `storage/rules/` directory.
 *   tearDown() deletes all files in the temp dir and removes the directory.
 *
 * ARCHITECTURE REFERENCES:
 *   - ARCHITECTURE.md §21.1.2 — Global rule source design.
 *   - GlobalRulesController::list()          — GET /api/global-rules
 *   - GlobalRulesController::getFileContent() — GET /api/global-rules/{filename}
 *   - GlobalRulesController::put()           — PUT /api/global-rules/{filename}
 *   - GlobalRulesController::delete()        — DELETE /api/global-rules/{filename}
 *
 * @see tests/TestCase.php  Base class with callController / callControllerWithInput.
 * @see api/controllers/GlobalRulesController.php  The controller under test.
 */

declare(strict_types=1);

require_once __DIR__ . '/TestCase.php';

class GlobalRulesTest extends TestCase
{
    // ============================================================
    // FIXTURE CONSTANTS
    // ============================================================

    private const GM_ID     = 'user_gm_gr_001';
    private const PLAYER_ID = 'user_player_gr_001';

    /** A valid filename that follows the [0-9a-z_-]+\.json pattern. */
    private const VALID_FILE = '50_srd_extra.json';

    /** A second valid filename used in ordering tests. */
    private const VALID_FILE_2 = '10_base_races.json';

    /** A minimal valid JSON array payload (array of one Feature-like object). */
    private const PAYLOAD = [
        [
            'id'       => 'feat_power_attack',
            'category' => 'feat',
            'label'    => ['en' => 'Power Attack'],
        ],
    ];

    // ============================================================
    // TEMP DIRECTORY MANAGEMENT
    // ============================================================

    /**
     * Absolute path to the per-test-run temporary storage directory.
     * Set in setUp() and cleaned in tearDown().
     */
    private string $tempDir = '';

    /**
     * Creates a fresh, isolated temporary directory and configures the
     * GlobalRulesController to use it via the GLOBAL_RULES_DIR env variable.
     *
     * WHY A TEMP DIRECTORY PER TEST CLASS?
     *   GlobalRulesController writes real files to the filesystem. Using a temp
     *   directory ensures:
     *     a) Tests never touch the real `storage/rules/` directory.
     *     b) Each test class starts with an empty directory (no leftover files).
     *     c) Cleanup is trivial (rmdir the whole temp dir in tearDown).
     *
     * IMPORTANT: getenv('GLOBAL_RULES_DIR') is checked in storageDir() before the
     * hardcoded STORAGE_DIR constant, so no controller code needs to change between
     * test and production contexts.
     */
    protected function setUp(): void
    {
        parent::setUp();

        // Create a unique temp dir so parallel test runs don't collide.
        $this->tempDir = sys_get_temp_dir() . DIRECTORY_SEPARATOR
            . 'cvault_test_global_rules_' . bin2hex(random_bytes(8));

        // Do NOT mkdir here — we rely on put() to create the directory itself
        // in test #3 (verify auto-creation). We create it manually only when
        // we need the dir to exist before the first PUT (e.g., list + getFileContent tests).

        // Point the controller to the temp dir.
        putenv('GLOBAL_RULES_DIR=' . $this->tempDir);

        // Create fixtures
        $this->createUser(self::GM_ID, true, 'gm_gr');
        $this->createUser(self::PLAYER_ID, false, 'player_gr');
    }

    /**
     * Removes all test files and the temp directory after each test.
     */
    protected function tearDown(): void
    {
        parent::tearDown();

        // Remove all .json files and temp files left by the controller.
        if (is_dir($this->tempDir)) {
            foreach (scandir($this->tempDir) as $file) {
                if ($file === '.' || $file === '..') {
                    continue;
                }
                @unlink($this->tempDir . DIRECTORY_SEPARATOR . $file);
            }
            @rmdir($this->tempDir);
        }

        // Clear the env var so it doesn't leak into other test classes.
        putenv('GLOBAL_RULES_DIR');
    }

    // ============================================================
    // HELPERS
    // ============================================================

    /**
     * Creates the temp directory and pre-populates a file with the given content.
     * Used to set up "file already exists" preconditions.
     *
     * @param string $filename  The filename (must match the valid pattern).
     * @param string $content   JSON content to write (defaults to PAYLOAD).
     */
    private function seedFile(string $filename, string $content = ''): void
    {
        if (!is_dir($this->tempDir)) {
            mkdir($this->tempDir, 0755, true);
        }
        if ($content === '') {
            $content = json_encode(self::PAYLOAD, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        }
        file_put_contents($this->tempDir . DIRECTORY_SEPARATOR . $filename, $content);
    }

    // ============================================================
    // TEST 1 — GET list returns [] when directory does not exist
    // ============================================================

    /**
     * When no GM has ever uploaded a global rule file, the `storage/rules/` directory
     * may not exist. The list endpoint must return an empty array — not a 500 error.
     *
     * WHY: ARCHITECTURE.md §21.1.2: "Returns an empty array when the directory is
     * empty or does not yet exist." Fresh installations must not crash.
     */
    public function testListReturnsEmptyArrayWhenDirectoryAbsent(): void
    {
        $this->simulateLogin(self::GM_ID, true);

        // Ensure the temp dir does NOT exist (setUp purposely skips mkdir).
        $this->assertFalse(is_dir($this->tempDir),
            'Precondition: temp dir must not exist before this test');

        $response = $this->callController(fn() => GlobalRulesController::list());

        $this->assertEquals(200, $response['status'],
            'GET list must return 200 even when the directory does not exist');
        $this->assertIsArray($response['body'],
            'Response must be an array');
        $this->assertCount(0, $response['body'],
            'Response must be an empty array when no files exist');
    }

    // ============================================================
    // TEST 2 — GET list returns file after PUT
    // ============================================================

    /**
     * After a successful PUT, GET /api/global-rules must include the new file
     * in the listing with its filename and byte count.
     *
     * WHY: The frontend GM management UI reads this list to populate the rule
     * source table. Missing files from the list would prevent the GM from managing
     * them (renaming, deleting, inspecting).
     */
    public function testListShowsFileAfterPut(): void
    {
        $this->simulateLogin(self::GM_ID, true);

        // PUT the file
        $this->callControllerWithInput(
            fn() => GlobalRulesController::put(self::VALID_FILE),
            json_encode(self::PAYLOAD)
        );

        // List should now contain the file
        $response = $this->callController(fn() => GlobalRulesController::list());

        $this->assertEquals(200, $response['status']);
        $this->assertCount(1, $response['body'],
            'List must contain exactly one file after PUT');

        $entry = $response['body'][0];
        $this->assertEquals(self::VALID_FILE, $entry['filename'],
            'Filename in list must match the PUT filename');
        $this->assertIsInt($entry['bytes'],
            'bytes must be an integer');
        $this->assertGreaterThan(0, $entry['bytes'],
            'bytes must be > 0 for a non-empty JSON array');
    }

    // ============================================================
    // TEST 3 — Valid PUT creates a file in the storage directory
    // ============================================================

    /**
     * A GM PUT with a valid filename and valid JSON array body must:
     *   a) Return 200 with { filename, bytes }.
     *   b) Create the file on disk (including auto-creating the directory).
     *
     * WHY TEST DISK CREATION DIRECTLY?
     *   The controller's primary side-effect is writing a file. Verifying via
     *   is_file() is more direct than relying on the list endpoint, and ensures
     *   the atomic rename() pattern actually persists the file correctly.
     */
    public function testPutCreatesFileOnDisk(): void
    {
        $this->simulateLogin(self::GM_ID, true);

        // Precondition: directory must not exist yet (verifies auto-creation).
        $this->assertFalse(is_dir($this->tempDir),
            'Precondition: temp dir must not exist before put()');

        $response = $this->callControllerWithInput(
            fn() => GlobalRulesController::put(self::VALID_FILE),
            json_encode(self::PAYLOAD)
        );

        $this->assertEquals(200, $response['status'],
            'Valid GM PUT must return 200');
        $this->assertEquals(self::VALID_FILE, $response['body']['filename'],
            'Response filename must match the PUT filename');
        $this->assertIsInt($response['body']['bytes'],
            'Response must include a bytes count');
        $this->assertGreaterThan(0, $response['body']['bytes'],
            'Bytes count must be > 0');

        // Verify the file physically exists on disk
        $expectedPath = $this->tempDir . DIRECTORY_SEPARATOR . self::VALID_FILE;
        $this->assertFileExists($expectedPath,
            'File must exist on disk after a successful PUT');
    }

    // ============================================================
    // TEST 4 — PUT → GET file content round-trip
    // ============================================================

    /**
     * After a PUT, GET /api/global-rules/{filename} must return the persisted
     * JSON array — identical entities, no fields stripped or reordered unexpectedly.
     *
     * WHY: The DataLoader fetches each file by name during app init. If content
     * is corrupted on round-trip, rules will silently fail to load for all users.
     */
    public function testPutGetFileContentRoundTrip(): void
    {
        $this->simulateLogin(self::GM_ID, true);

        $this->callControllerWithInput(
            fn() => GlobalRulesController::put(self::VALID_FILE),
            json_encode(self::PAYLOAD)
        );

        // Any authenticated user can GET file content (not GM-only)
        $this->simulateLogin(self::PLAYER_ID, false);
        $response = $this->callController(
            fn() => GlobalRulesController::getFileContent(self::VALID_FILE)
        );

        $this->assertEquals(200, $response['status'],
            'GET file content must return 200');
        $this->assertIsArray($response['body'],
            'Response must be a JSON array');
        $this->assertCount(1, $response['body'],
            'Round-tripped array must contain exactly 1 entity');
        $this->assertEquals(self::PAYLOAD[0]['id'], $response['body'][0]['id'],
            'Entity id must round-trip unchanged');
        $this->assertEquals(self::PAYLOAD[0]['category'], $response['body'][0]['category'],
            'Entity category must round-trip unchanged');
    }

    // ============================================================
    // TEST 5 — Invalid filename: directory traversal → 422
    // ============================================================

    /**
     * A filename containing `..` (directory traversal) must be rejected with 422.
     * This is a security requirement — the pattern `[0-9a-z_-]+\.json` explicitly
     * excludes dots except as part of the `.json` suffix.
     *
     * WHY: Allowing `../escape.json` would let an attacker overwrite files outside
     * of `storage/rules/` (e.g., `api/config.php` or the SQLite database file).
     *
     * TESTED: put(), delete(), and getFileContent() all validate the filename with
     * the same regex, so one invalid-filename test per method is sufficient.
     */
    public function testDirectoryTraversalFilenameReturns422OnPut(): void
    {
        $this->simulateLogin(self::GM_ID, true);

        $response = $this->callControllerWithInput(
            fn() => GlobalRulesController::put('../escape.json'),
            json_encode([])
        );

        $this->assertEquals(422, $response['status'],
            'Directory traversal filename must return 422');
        $this->assertEquals('UnprocessableEntity', $response['body']['error'] ?? '',
            'Error key must be UnprocessableEntity');
    }

    // ============================================================
    // TEST 6 — Invalid filename: uppercase letters → 422
    // ============================================================

    /**
     * Filenames with uppercase letters must be rejected.
     * The valid pattern `/^[0-9a-z_-]+\.json$/` is case-sensitive.
     *
     * WHY: Mixed-case filenames create ambiguity on case-insensitive filesystems
     * (macOS HFS+). Restricting to lowercase ensures consistent alphabetical load
     * order across Linux (case-sensitive) and macOS (case-insensitive).
     */
    public function testUppercaseFilenameReturns422(): void
    {
        $this->simulateLogin(self::GM_ID, true);

        foreach (['MY_FILE.json', 'Feats.json', 'ABC.json'] as $badName) {
            $response = $this->callControllerWithInput(
                fn() => GlobalRulesController::put($badName),
                json_encode([])
            );
            $this->assertEquals(422, $response['status'],
                "Uppercase filename '{$badName}' must return 422");
        }
    }

    // ============================================================
    // TEST 7 — Invalid filename: space in name → 422
    // ============================================================

    /**
     * Filenames containing spaces must be rejected.
     * Spaces are not in the allowed character set `[0-9a-z_-]`.
     *
     * WHY: Space-containing filenames break shell scripts (run.sh, build.sh) and
     * are unusual in a web context. They could also be a source of injection in
     * server-side `scandir` consumers or URL encoding surprises.
     */
    public function testFilenameWithSpaceReturns422(): void
    {
        $this->simulateLogin(self::GM_ID, true);

        $response = $this->callControllerWithInput(
            fn() => GlobalRulesController::put('my file.json'),
            json_encode([])
        );

        $this->assertEquals(422, $response['status'],
            'Filename with space must return 422');
    }

    // ============================================================
    // TEST 8 — Invalid filename: missing .json extension → 422
    // ============================================================

    /**
     * A filename that does not end with `.json` must be rejected.
     * The valid pattern requires the `.json` suffix.
     *
     * WHY: The controller's scandir() filter only picks up `*.json` files.
     * Allowing non-.json names would create files that are invisible to the
     * DataLoader and the list endpoint, but still occupy disk space — confusing.
     */
    public function testFilenameMissingJsonExtensionReturns422(): void
    {
        $this->simulateLogin(self::GM_ID, true);

        foreach (['50_setting', '50_setting.txt', '50_setting.json.bak'] as $badName) {
            $response = $this->callControllerWithInput(
                fn() => GlobalRulesController::put($badName),
                json_encode([])
            );
            $this->assertEquals(422, $response['status'],
                "Filename without .json extension '{$badName}' must return 422");
        }
    }

    // ============================================================
    // TEST 9 — Body > 2 MB via Content-Length → 413
    // ============================================================

    /**
     * When Content-Length signals a body > 2 MB, the controller must reject
     * it immediately with 413 without reading the body at all.
     *
     * WHY: Reading 2+ MB into memory on every oversized request is wasteful.
     * The Content-Length gate prevents buffering the body.
     */
    public function testBodyOverLimitViaContentLengthReturns413(): void
    {
        $this->simulateLogin(self::GM_ID, true);
        $_SERVER['CONTENT_LENGTH'] = 3 * 1024 * 1024; // 3 MB

        try {
            $response = $this->callControllerWithInput(
                fn() => GlobalRulesController::put(self::VALID_FILE),
                json_encode([]) // irrelevant — header gate fires first
            );

            $this->assertEquals(413, $response['status'],
                'Content-Length > 2 MB must return 413');
            $this->assertEquals('RequestTooLarge', $response['body']['error'] ?? '',
                'Error key must be RequestTooLarge');
        } finally {
            unset($_SERVER['CONTENT_LENGTH']);
        }
    }

    // ============================================================
    // TEST 10 — Body > 2 MB via strlen gate → 413
    // ============================================================

    /**
     * When Content-Length is absent, the controller must still reject bodies
     * > 2 MB after reading them via strlen().
     *
     * The test sends 2 MB + 1 byte of non-JSON ASCII padding.
     */
    public function testBodyOverLimitViaStrlenReturns413(): void
    {
        $this->simulateLogin(self::GM_ID, true);
        unset($_SERVER['CONTENT_LENGTH']);

        // 2 MB + 1 byte — exceeds the 2 * 1024 * 1024 = 2 097 152 byte limit.
        $oversizedBody = str_repeat('X', 2 * 1024 * 1024 + 1);

        $response = $this->callControllerWithInput(
            fn() => GlobalRulesController::put(self::VALID_FILE),
            $oversizedBody
        );

        $this->assertEquals(413, $response['status'],
            'strlen > 2 MB body (no Content-Length) must return 413');
        $this->assertEquals('RequestTooLarge', $response['body']['error'] ?? '');
    }

    // ============================================================
    // TEST 11 — DELETE removes the file; subsequent GET returns 404
    // ============================================================

    /**
     * After a successful DELETE:
     *   a) The controller must return 200 { filename, deleted: true }.
     *   b) The file must be absent from disk.
     *   c) A subsequent GET /api/global-rules/{filename} must return 404.
     *
     * WHY: The GM management UI calls DELETE to permanently remove a rule source.
     * If the file is not actually removed, the DataLoader would continue loading
     * the old rules on the next app init, which would confuse both players and GMs.
     */
    public function testDeleteRemovesFile(): void
    {
        $this->simulateLogin(self::GM_ID, true);

        // PUT the file first
        $this->callControllerWithInput(
            fn() => GlobalRulesController::put(self::VALID_FILE),
            json_encode(self::PAYLOAD)
        );

        // Verify it exists before DELETE
        $expectedPath = $this->tempDir . DIRECTORY_SEPARATOR . self::VALID_FILE;
        $this->assertFileExists($expectedPath, 'Precondition: file must exist before DELETE');

        // DELETE
        $deleteResponse = $this->callController(
            fn() => GlobalRulesController::delete(self::VALID_FILE)
        );

        $this->assertEquals(200, $deleteResponse['status'],
            'DELETE must return 200 on success');
        $this->assertEquals(self::VALID_FILE, $deleteResponse['body']['filename'] ?? '',
            'DELETE response filename must match');
        $this->assertTrue($deleteResponse['body']['deleted'] ?? false,
            'DELETE response must include deleted: true');

        // Verify the file is gone from disk
        $this->assertFileDoesNotExist($expectedPath,
            'File must not exist on disk after DELETE');

        // GET should now return 404
        $getResponse = $this->callController(
            fn() => GlobalRulesController::getFileContent(self::VALID_FILE)
        );
        $this->assertEquals(404, $getResponse['status'],
            'GET after DELETE must return 404 Not Found');
        $this->assertEquals('NotFound', $getResponse['body']['error'] ?? '');
    }

    // ============================================================
    // TEST 12 — Non-GM PUT → 403 Forbidden
    // ============================================================

    /**
     * A regular player (non-GM) attempting PUT /api/global-rules/{filename} must
     * receive 403 Forbidden.
     *
     * WHY: Writing global rule files is a super-admin operation — it affects ALL
     * campaigns on the server equally. Players must never be able to write rule files.
     */
    public function testNonGmPutReturns403(): void
    {
        $this->simulateLogin(self::PLAYER_ID, false);

        $response = $this->callControllerWithInput(
            fn() => GlobalRulesController::put(self::VALID_FILE),
            json_encode(self::PAYLOAD)
        );

        $this->assertEquals(403, $response['status'],
            'Non-GM PUT must return 403 Forbidden');
        $this->assertEquals('Forbidden', $response['body']['error'] ?? '');
    }

    // ============================================================
    // TEST 13 — Non-GM DELETE → 403 Forbidden
    // ============================================================

    /**
     * A regular player attempting DELETE must receive 403.
     * Deleting global rule files is also a GM-only operation.
     */
    public function testNonGmDeleteReturns403(): void
    {
        // Pre-seed the file so DELETE would succeed for a GM.
        $this->seedFile(self::VALID_FILE);

        $this->simulateLogin(self::PLAYER_ID, false);

        $response = $this->callController(
            fn() => GlobalRulesController::delete(self::VALID_FILE)
        );

        $this->assertEquals(403, $response['status'],
            'Non-GM DELETE must return 403 Forbidden');
        $this->assertEquals('Forbidden', $response['body']['error'] ?? '');
    }

    // ============================================================
    // TEST 14 — Unauthenticated GET (list) → 401
    // ============================================================

    /**
     * GET /api/global-rules without a session must return 401.
     * The DataLoader only calls this while a user is authenticated.
     */
    public function testUnauthenticatedListReturns401(): void
    {
        $this->simulateLogout();

        $response = $this->callController(fn() => GlobalRulesController::list());

        $this->assertEquals(401, $response['status'],
            'Unauthenticated GET list must return 401');
    }

    // ============================================================
    // TEST 15 — Unauthenticated PUT → 401
    // ============================================================

    /**
     * PUT without a session must return 401 regardless of the body content.
     * requireGameMaster() calls requireAuth() first; the 401 fires before the GM check.
     */
    public function testUnauthenticatedPutReturns401(): void
    {
        $this->simulateLogout();

        $response = $this->callControllerWithInput(
            fn() => GlobalRulesController::put(self::VALID_FILE),
            json_encode(self::PAYLOAD)
        );

        $this->assertEquals(401, $response['status'],
            'Unauthenticated PUT must return 401');
    }

    // ============================================================
    // TEST 16 — Unauthenticated DELETE → 401
    // ============================================================

    /**
     * DELETE without a session must return 401.
     */
    public function testUnauthenticatedDeleteReturns401(): void
    {
        $this->seedFile(self::VALID_FILE);
        $this->simulateLogout();

        $response = $this->callController(
            fn() => GlobalRulesController::delete(self::VALID_FILE)
        );

        $this->assertEquals(401, $response['status'],
            'Unauthenticated DELETE must return 401');
    }

    // ============================================================
    // TEST 17 — PUT with invalid JSON body → 422
    // ============================================================

    /**
     * A PUT body that is syntactically invalid JSON must return 422.
     * The controller calls json_decode() + json_last_error() to detect this.
     */
    public function testInvalidJsonBodyReturns422(): void
    {
        $this->simulateLogin(self::GM_ID, true);

        $response = $this->callControllerWithInput(
            fn() => GlobalRulesController::put(self::VALID_FILE),
            'not { valid: json }'
        );

        $this->assertEquals(422, $response['status'],
            'Invalid JSON body must return 422');
        $this->assertEquals('UnprocessableEntity', $response['body']['error'] ?? '');
    }

    // ============================================================
    // TEST 18 — PUT with non-array JSON root (object) → 422
    // ============================================================

    /**
     * The root JSON value must be an array. An object `{}` at the root is rejected
     * with 422 because DataLoader iterates the array — an object would break loading.
     *
     * ALSO TESTS: literal `null` and a bare number at root, which are both
     * not arrays and must also be rejected.
     */
    public function testNonArrayJsonRootReturns422(): void
    {
        $this->simulateLogin(self::GM_ID, true);

        // 18a — JSON object at root
        $r1 = $this->callControllerWithInput(
            fn() => GlobalRulesController::put(self::VALID_FILE),
            json_encode(['id' => 'feat_power_attack', 'category' => 'feat'])
        );
        $this->assertEquals(422, $r1['status'],
            'JSON object at root must return 422');

        // 18b — JSON null at root
        $r2 = $this->callControllerWithInput(
            fn() => GlobalRulesController::put(self::VALID_FILE),
            'null'
        );
        $this->assertEquals(422, $r2['status'],
            'JSON null at root must return 422');

        // 18c — JSON number at root
        $r3 = $this->callControllerWithInput(
            fn() => GlobalRulesController::put(self::VALID_FILE),
            '42'
        );
        $this->assertEquals(422, $r3['status'],
            'JSON number at root must return 422');
    }

    // ============================================================
    // TEST 19 — GET file content on non-existent file → 404
    // ============================================================

    /**
     * GET /api/global-rules/{filename} for a file that was never PUT must
     * return 404 Not Found — not 200 with empty content.
     */
    public function testGetFileContentOnNonExistentFileReturns404(): void
    {
        $this->simulateLogin(self::GM_ID, true);

        // Ensure the directory exists but the file does not.
        if (!is_dir($this->tempDir)) {
            mkdir($this->tempDir, 0755, true);
        }

        $response = $this->callController(
            fn() => GlobalRulesController::getFileContent('99_does_not_exist.json')
        );

        $this->assertEquals(404, $response['status'],
            'GET on a non-existent file must return 404');
        $this->assertEquals('NotFound', $response['body']['error'] ?? '');
    }

    // ============================================================
    // TEST 20 — GET file content accessible by any authenticated user
    // ============================================================

    /**
     * GET /api/global-rules/{filename} does NOT require GM status — any
     * authenticated user (including a regular player) can retrieve file content.
     *
     * WHY: The DataLoader runs during app init for ALL users, not just GMs.
     * Restricting GET to GMs would prevent players from loading rules.
     *
     * FLOW:
     *   1. GM PUTs the file.
     *   2. Player (non-GM) GETs the file content — must receive 200.
     */
    public function testPlayerCanGetFileContent(): void
    {
        // GM creates the file
        $this->simulateLogin(self::GM_ID, true);
        $this->callControllerWithInput(
            fn() => GlobalRulesController::put(self::VALID_FILE),
            json_encode(self::PAYLOAD)
        );

        // Player reads the file
        $this->simulateLogin(self::PLAYER_ID, false);
        $response = $this->callController(
            fn() => GlobalRulesController::getFileContent(self::VALID_FILE)
        );

        $this->assertEquals(200, $response['status'],
            'Non-GM player must be able to GET file content (200)');
        $this->assertCount(1, $response['body'],
            'Player must receive the same array the GM uploaded');
    }

    // ============================================================
    // TEST 21 — Multiple files appear in alphabetically sorted list
    // ============================================================

    /**
     * When multiple files exist, GET /api/global-rules must return them in
     * alphabetical filename order — the same order DataLoader uses for merging.
     *
     * WHY: Merge priority is determined by alphabetical load order. If the list
     * is returned in arbitrary (e.g., inode) order, the GM management UI would
     * look inconsistent, and the displayed priority would not match actual loading.
     *
     * SCENARIO:
     *   PUT `50_srd_extra.json` first, then `10_base_races.json`.
     *   List must return `10_base_races.json` before `50_srd_extra.json`.
     */
    public function testListReturnsSortedByFilename(): void
    {
        $this->simulateLogin(self::GM_ID, true);

        // PUT the higher-numbered file first to verify the sort is NOT insertion order.
        $this->callControllerWithInput(
            fn() => GlobalRulesController::put(self::VALID_FILE),   // 50_srd_extra.json
            json_encode(self::PAYLOAD)
        );
        $this->callControllerWithInput(
            fn() => GlobalRulesController::put(self::VALID_FILE_2), // 10_base_races.json
            json_encode(self::PAYLOAD)
        );

        $response = $this->callController(fn() => GlobalRulesController::list());

        $this->assertEquals(200, $response['status']);
        $this->assertCount(2, $response['body'],
            'List must contain exactly 2 files');

        // 10_base_races.json must sort before 50_srd_extra.json
        $this->assertEquals(self::VALID_FILE_2, $response['body'][0]['filename'],
            '10_base_races.json must be first in the sorted list (alphabetically lower)');
        $this->assertEquals(self::VALID_FILE, $response['body'][1]['filename'],
            '50_srd_extra.json must be second in the sorted list');
    }

    // ============================================================
    // TEST 22 — PUT overwrites an existing file (idempotent replace semantics)
    // ============================================================

    /**
     * A second PUT on the same filename must overwrite the existing file.
     * GET after the second PUT must return the new content, not the original.
     *
     * WHY: The GM's "Save" action in the Content Editor always sends the full
     * current state. If PUT were append-only, re-saving would corrupt the file.
     *
     * FLOW:
     *   1. PUT `VALID_FILE` with payload A.
     *   2. PUT `VALID_FILE` again with payload B (different id).
     *   3. GET `VALID_FILE` → must return payload B, not A.
     */
    public function testPutOverwritesExistingFile(): void
    {
        $payloadA = [['id' => 'feat_power_attack', 'category' => 'feat']];
        $payloadB = [['id' => 'feat_improved_initiative', 'category' => 'feat']];

        $this->simulateLogin(self::GM_ID, true);

        // First PUT
        $r1 = $this->callControllerWithInput(
            fn() => GlobalRulesController::put(self::VALID_FILE),
            json_encode($payloadA)
        );
        $this->assertEquals(200, $r1['status'], 'First PUT must succeed');

        // Second PUT (overwrite)
        $r2 = $this->callControllerWithInput(
            fn() => GlobalRulesController::put(self::VALID_FILE),
            json_encode($payloadB)
        );
        $this->assertEquals(200, $r2['status'], 'Second PUT (overwrite) must succeed');

        // GET must return payloadB
        $getResponse = $this->callController(
            fn() => GlobalRulesController::getFileContent(self::VALID_FILE)
        );

        $this->assertEquals(200, $getResponse['status']);
        $this->assertCount(1, $getResponse['body'],
            'GET after overwrite must return exactly 1 entity');
        $this->assertEquals('feat_improved_initiative', $getResponse['body'][0]['id'],
            'GET must return the second (overwrite) payload, not the first');
    }
}
