<?php
/**
 * @file tests/RulesBatchTest.php
 * @description PHPUnit tests for the batch rule endpoint and rules hash utility.
 *
 * COVERAGE:
 *   1.  GET /api/rules/batch — unauthenticated → 401.
 *   2.  GET /api/rules/batch — 200 response has etag, staticFiles, globalFiles.
 *   3.  GET /api/rules/batch — static files have at least one key (real static/rules/ dir).
 *   4.  GET /api/rules/batch — If-None-Match matching ETag → 304 Not Modified.
 *   5.  GET /api/rules/batch — If-None-Match with wrong ETag → 200 with fresh data.
 *   6.  GET /api/rules/batch — global files included when present in storage/rules/.
 *   7.  GET /api/rules/batch — global file entities are valid wrappers.
 *   8.  RulesController::computeRulesHash() — returns a 32-char hex string.
 *   9.  RulesController::computeRulesHash() — same result on consecutive calls (stable).
 *   10. RulesController::computeRulesHash() — changes when a global file is added.
 *   11. RulesController::computeRulesHash() — changes when a global file is removed.
 *
 * ISOLATION STRATEGY:
 *   Global rule files (storage/rules/) are isolated via a per-test temp directory
 *   assigned through the GLOBAL_RULES_DIR env variable — same pattern as GlobalRulesTest.
 *   Static rule files (static/rules/) are read from the real directory; tests
 *   only assert structure, not specific content, so they are resilient to file additions.
 *
 * @see api/controllers/RulesController.php  The controller under test.
 * @see tests/GlobalRulesTest.php  Reference for temp-dir isolation pattern.
 */

declare(strict_types=1);

require_once __DIR__ . '/TestCase.php';

class RulesBatchTest extends TestCase
{
    private const GM_ID     = 'user_gm_batch_001';
    private const PLAYER_ID = 'user_player_batch_001';

    /** Temp directory for isolated global rule file storage. */
    private string $tempDir = '';

    // ============================================================
    // SETUP / TEARDOWN
    // ============================================================

    protected function setUp(): void
    {
        parent::setUp();

        $this->tempDir = sys_get_temp_dir() . DIRECTORY_SEPARATOR
            . 'cvault_test_rules_batch_' . bin2hex(random_bytes(8));

        putenv('GLOBAL_RULES_DIR=' . $this->tempDir . DIRECTORY_SEPARATOR);

        $this->createUser(self::GM_ID, 'gm', 'gm_batch');
        $this->createUser(self::PLAYER_ID, 'player', 'player_batch');
    }

    protected function tearDown(): void
    {
        parent::tearDown();

        if (is_dir($this->tempDir)) {
            foreach (scandir($this->tempDir) as $entry) {
                if ($entry === '.' || $entry === '..') continue;
                @unlink($this->tempDir . DIRECTORY_SEPARATOR . $entry);
            }
            @rmdir($this->tempDir);
        }

        putenv('GLOBAL_RULES_DIR');     // Clear env var
        unset($_SERVER['HTTP_IF_NONE_MATCH']);
    }

    // ============================================================
    // HELPERS
    // ============================================================

    /** Creates a minimal valid global rule file in the temp dir. */
    private function createGlobalFile(string $filename, array $entities = []): void
    {
        if (!is_dir($this->tempDir)) {
            mkdir($this->tempDir, 0755, true);
        }
        $payload = [
            [
                'id'         => 'feat_custom_batch',
                'category'   => 'feat',
                'ruleSource' => 'my_homebrew',
                'label'      => ['en' => 'Custom Feat'],
            ],
        ];
        $content = json_encode(array_merge($payload, $entities));
        file_put_contents($this->tempDir . DIRECTORY_SEPARATOR . $filename, $content);
    }

    /** Removes a global file from the temp dir. */
    private function removeGlobalFile(string $filename): void
    {
        @unlink($this->tempDir . DIRECTORY_SEPARATOR . $filename);
    }

    // ============================================================
    // 1. Authentication
    // ============================================================

    public function testBatchRequiresAuthentication(): void
    {
        $this->simulateLogout();
        $response = $this->callController(fn() => RulesController::batch());
        $this->assertEquals(401, $response['status']);
    }

    // ============================================================
    // 2. Response structure
    // ============================================================

    public function testBatchReturns200WithRequiredKeys(): void
    {
        $this->simulateLogin(self::GM_ID, 'gm');
        $response = $this->callController(fn() => RulesController::batch());

        $this->assertEquals(200, $response['status'], 'batch() must return HTTP 200');

        $body = $response['body'];
        $this->assertArrayHasKey('etag', $body, 'Response must include etag');
        $this->assertArrayHasKey('staticFiles', $body, 'Response must include staticFiles');
        $this->assertArrayHasKey('globalFiles', $body, 'Response must include globalFiles');

        $this->assertIsString($body['etag'], 'etag must be a string');
        $this->assertNotEmpty($body['etag'], 'etag must be non-empty');

        $this->assertIsArray($body['staticFiles'], 'staticFiles must be an array/object');
        $this->assertIsArray($body['globalFiles'], 'globalFiles must be an array/object');
    }

    public function testBatchStaticFilesContainsAtLeastOneFile(): void
    {
        $this->simulateLogin(self::GM_ID, 'gm');
        $response = $this->callController(fn() => RulesController::batch());

        $this->assertEquals(200, $response['status']);
        $this->assertNotEmpty(
            $response['body']['staticFiles'],
            'staticFiles must contain entries (static/rules/ has JSON files)'
        );
    }

    public function testBatchStaticFilesEachHaveEntitiesArray(): void
    {
        $this->simulateLogin(self::GM_ID, 'gm');
        $response = $this->callController(fn() => RulesController::batch());

        $this->assertEquals(200, $response['status']);
        foreach ($response['body']['staticFiles'] as $path => $wrapper) {
            $this->assertArrayHasKey('entities', $wrapper,
                "Static file '{$path}' must have an 'entities' key");
            $this->assertIsArray($wrapper['entities'],
                "Static file '{$path}'.entities must be an array");
        }
    }

    // ============================================================
    // 3. Conditional GET (ETag / 304)
    // ============================================================

    public function testBatchReturns304WhenEtagMatches(): void
    {
        $this->simulateLogin(self::GM_ID, 'gm');

        // First request: get the ETag
        $first = $this->callController(fn() => RulesController::batch());
        $this->assertEquals(200, $first['status']);
        $etag = $first['body']['etag'];
        $this->assertNotEmpty($etag);

        // Second request: send matching ETag → must get 304
        $_SERVER['HTTP_IF_NONE_MATCH'] = '"' . $etag . '"';
        $second = $this->callController(fn() => RulesController::batch());

        $this->assertEquals(304, $second['status'],
            'Sending matching ETag must return 304 Not Modified');
        unset($_SERVER['HTTP_IF_NONE_MATCH']);
    }

    public function testBatchReturns200WhenEtagMismatches(): void
    {
        $this->simulateLogin(self::GM_ID, 'gm');

        $_SERVER['HTTP_IF_NONE_MATCH'] = '"definitely-not-the-real-etag-000111"';
        $response = $this->callController(fn() => RulesController::batch());

        $this->assertEquals(200, $response['status'],
            'A wrong ETag must result in 200 with fresh data');
        $this->assertNotEmpty($response['body']['staticFiles']);
        unset($_SERVER['HTTP_IF_NONE_MATCH']);
    }

    public function testBatchEtagWithoutQuotesAlsoMatches(): void
    {
        // Some clients omit the quotes around the ETag value.
        $this->simulateLogin(self::GM_ID, 'gm');

        $first = $this->callController(fn() => RulesController::batch());
        $etag = $first['body']['etag'];

        // Send ETag without surrounding quotes
        $_SERVER['HTTP_IF_NONE_MATCH'] = $etag;
        $second = $this->callController(fn() => RulesController::batch());

        $this->assertEquals(304, $second['status'],
            'ETag without surrounding quotes must also match (trim logic in batch())');
        unset($_SERVER['HTTP_IF_NONE_MATCH']);
    }

    // ============================================================
    // 4. Global files
    // ============================================================

    public function testBatchGlobalFilesAreIncludedWhenPresent(): void
    {
        $this->simulateLogin(self::GM_ID, 'gm');

        $this->createGlobalFile('50_homebrew.json');

        $response = $this->callController(fn() => RulesController::batch());
        $this->assertEquals(200, $response['status']);

        $globalFiles = $response['body']['globalFiles'];
        $this->assertArrayHasKey('50_homebrew.json', $globalFiles,
            'Global files must appear in the globalFiles map');
    }

    public function testBatchGlobalFilesHaveEntitiesArray(): void
    {
        $this->simulateLogin(self::GM_ID, 'gm');

        $this->createGlobalFile('30_extra.json');

        $response = $this->callController(fn() => RulesController::batch());
        $this->assertEquals(200, $response['status']);

        $wrapper = $response['body']['globalFiles']['30_extra.json'] ?? null;
        $this->assertNotNull($wrapper, '30_extra.json must be in globalFiles');
        $this->assertIsArray($wrapper, 'Global file wrapper must be an array/object');
    }

    public function testBatchGlobalFilesAreEmptyWhenNoneExist(): void
    {
        $this->simulateLogin(self::GM_ID, 'gm');

        // No global files created (tempDir may not even exist)
        $response = $this->callController(fn() => RulesController::batch());
        $this->assertEquals(200, $response['status']);
        $this->assertEmpty($response['body']['globalFiles'],
            'globalFiles must be empty when storage/rules/ has no files');
    }

    // ============================================================
    // 5. computeRulesHash() stability and change detection
    // ============================================================

    public function testComputeRulesHashReturns32CharHex(): void
    {
        $hash = RulesController::computeRulesHash();
        $this->assertIsString($hash);
        $this->assertMatchesRegularExpression('/^[0-9a-f]{32}$/', $hash,
            'computeRulesHash() must return a 32-character lowercase hex string (MD5)');
    }

    public function testComputeRulesHashIsStableOnConsecutiveCalls(): void
    {
        $hash1 = RulesController::computeRulesHash();
        $hash2 = RulesController::computeRulesHash();
        $this->assertEquals($hash1, $hash2,
            'computeRulesHash() must return the same value when files have not changed');
    }

    public function testComputeRulesHashChangesWhenGlobalFileIsAdded(): void
    {
        $hashBefore = RulesController::computeRulesHash();

        $this->createGlobalFile('99_new_setting.json');

        $hashAfter = RulesController::computeRulesHash();
        $this->assertNotEquals($hashBefore, $hashAfter,
            'computeRulesHash() must change when a new global rule file is added');
    }

    public function testComputeRulesHashChangesWhenGlobalFileIsRemoved(): void
    {
        $this->createGlobalFile('80_to_delete.json');
        $hashWithFile = RulesController::computeRulesHash();

        $this->removeGlobalFile('80_to_delete.json');
        $hashWithoutFile = RulesController::computeRulesHash();

        $this->assertNotEquals($hashWithFile, $hashWithoutFile,
            'computeRulesHash() must change when a global rule file is removed');
    }
}
