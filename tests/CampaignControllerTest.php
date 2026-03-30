<?php
/**
 * @file tests/CampaignControllerTest.php
 * @description PHPUnit tests for CampaignController schema-change correctness.
 *
 * SCHEMA CHANGES UNDER TEST:
 *   1. title_json / description_json — columns renamed and always store
 *      JSON-encoded LocalizedString objects; API maps them to camelCase `title`
 *      / `description` in the response.
 *   2. poster_url REMOVED — no poster data returned in list or show responses.
 *   3. gm_global_overrides_text REMOVED from campaigns table — not accepted in
 *      the campaign PUT body; moved to server_settings table.
 *   4. banner_image_data — present in show() response, absent from index().
 *   5. index() camelCase mapping — posterUrl, ownerId, updatedAt correctly mapped.
 *
 * COVERAGE (10 test methods):
 *   (1)  GET /api/campaigns returns camelCase title, ownerId, updatedAt.
 *   (2)  GET /api/campaigns does NOT include posterUrl.
 *   (3)  GET /api/campaigns does NOT include banner_image_data.
 *   (4)  GET /api/campaigns/{id} (show) includes bannerImageData.
 *   (5)  GET /api/campaigns/{id} does NOT include gmGlobalOverrides.
 *   (6)  POST /api/campaigns creates campaign with title_json correctly.
 *   (7)  PUT /api/campaigns/{id} updates title_json via `title` body field.
 *   (8)  PUT /api/campaigns/{id} does NOT accept gmGlobalOverrides field.
 *   (9)  PUT /api/campaigns/{id} stores bannerImageData correctly.
 *   (10) PUT /api/campaigns/{id} clears banner when null is sent.
 *
 * @see api/controllers/CampaignController.php
 * @see api/migrate.php for the schema.
 */

declare(strict_types=1);

require_once __DIR__ . '/TestCase.php';

class CampaignControllerTest extends TestCase
{
    private const GM_ID   = 'user_cam_gm_001';
    private const CAMP_ID = 'camp_cam_test_001';

    protected function setUp(): void
    {
        parent::setUp();
        $this->createUser(self::GM_ID, 'gm', 'cam_gm');
        $this->createCampaign(self::CAMP_ID, self::GM_ID, 'My Test Campaign');
    }

    // =========================================================================
    // (1) GET /api/campaigns returns camelCase fields
    // =========================================================================

    /**
     * The campaign list response must use camelCase keys that match the
     * TypeScript Campaign interface: title, ownerId, updatedAt, chapters,
     * enabledRuleSources.
     *
     * WHY: The original bug was that index() returned snake_case keys
     * (poster_url, owner_id, updated_at) — the frontend read `posterUrl`
     * which was always undefined.
     */
    public function testListReturnsCamelCaseFields(): void
    {
        $this->simulateLogin(self::GM_ID, 'gm', 'cam_gm');

        $response = $this->callController(fn() => CampaignController::index());

        $this->assertEquals(200, $response['status']);
        $this->assertIsArray($response['body']);
        $this->assertCount(1, $response['body']);

        $c = $response['body'][0];

        // Required camelCase fields
        $this->assertArrayHasKey('id',               $c, 'id must be present');
        $this->assertArrayHasKey('title',            $c, 'title must be camelCase');
        $this->assertArrayHasKey('description',      $c, 'description must be camelCase');
        $this->assertArrayHasKey('ownerId',          $c, 'ownerId must be camelCase');
        $this->assertArrayHasKey('updatedAt',        $c, 'updatedAt must be camelCase');
        $this->assertArrayHasKey('chapters',         $c, 'chapters must be decoded array');
        $this->assertArrayHasKey('enabledRuleSources', $c, 'enabledRuleSources must be decoded array');

        // Raw snake_case columns must NOT appear in the response.
        $this->assertArrayNotHasKey('owner_id',   $c, 'owner_id must be remapped to ownerId');
        $this->assertArrayNotHasKey('updated_at', $c, 'updated_at must be remapped to updatedAt');
        $this->assertArrayNotHasKey('title_json', $c, 'title_json must be exposed as title');
        $this->assertArrayNotHasKey('description_json', $c, 'description_json must be exposed as description');

        // updatedAt must be an integer (Unix timestamp)
        $this->assertIsInt($c['updatedAt'], 'updatedAt must be an integer');
    }

    // =========================================================================
    // (2) GET /api/campaigns does NOT include posterUrl
    // =========================================================================

    /**
     * poster_url has been removed from the campaigns table.
     * The list response must never return a `posterUrl` field.
     *
     * WHY: Removing posterUrl is a deliberate design change — the banner image
     * (bannerImageData) is now the sole campaign visual.
     */
    public function testListDoesNotIncludePosterUrl(): void
    {
        $this->simulateLogin(self::GM_ID, 'gm', 'cam_gm');

        $response = $this->callController(fn() => CampaignController::index());

        $this->assertEquals(200, $response['status']);
        $c = $response['body'][0];

        $this->assertArrayNotHasKey('posterUrl',  $c, 'posterUrl must NOT appear in list response');
        $this->assertArrayNotHasKey('poster_url', $c, 'poster_url must NOT appear in list response');
    }

    // =========================================================================
    // (3) GET /api/campaigns does NOT include banner_image_data
    // =========================================================================

    /**
     * banner_image_data is excluded from the list for performance.
     * Each campaign card lazy-loads it from the show endpoint.
     */
    public function testListDoesNotIncludeBannerImageData(): void
    {
        // Seed a banner into the campaign row first so we know it's in the DB.
        $pdo = Database::getInstance();
        $pdo->prepare('UPDATE campaigns SET banner_image_data = ? WHERE id = ?')
            ->execute(['data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==', self::CAMP_ID]);

        $this->simulateLogin(self::GM_ID, 'gm', 'cam_gm');

        $response = $this->callController(fn() => CampaignController::index());

        $this->assertEquals(200, $response['status']);
        $c = $response['body'][0];

        $this->assertArrayNotHasKey('bannerImageData',  $c, 'bannerImageData must be excluded from list');
        $this->assertArrayNotHasKey('banner_image_data', $c, 'banner_image_data must be excluded from list');
    }

    // =========================================================================
    // (4) GET /api/campaigns/{id} (show) includes bannerImageData
    // =========================================================================

    /**
     * The show endpoint must return bannerImageData so the campaign detail page
     * and lazy-loading campaign cards can display the banner.
     */
    public function testShowIncludesBannerImageData(): void
    {
        $expectedBanner = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';

        // Seed the banner into the DB directly.
        $pdo = Database::getInstance();
        $pdo->prepare('UPDATE campaigns SET banner_image_data = ? WHERE id = ?')
            ->execute([$expectedBanner, self::CAMP_ID]);

        $this->simulateLogin(self::GM_ID, 'gm', 'cam_gm');

        $response = $this->callController(
            fn() => CampaignController::show(self::CAMP_ID)
        );

        $this->assertEquals(200, $response['status']);
        $this->assertArrayHasKey('bannerImageData', $response['body'],
            'bannerImageData must be present in show response');
        $this->assertEquals($expectedBanner, $response['body']['bannerImageData'],
            'bannerImageData must match the stored value');
    }

    // =========================================================================
    // (5) GET /api/campaigns/{id} does NOT include gmGlobalOverrides
    // =========================================================================

    /**
     * gmGlobalOverrides has been removed from the campaigns table.
     * The show endpoint must NOT return gmGlobalOverrides.
     * GMs should fetch global overrides from GET /api/server-settings/gm-overrides.
     */
    public function testShowDoesNotIncludeGmGlobalOverrides(): void
    {
        $this->simulateLogin(self::GM_ID, 'gm', 'cam_gm');

        $response = $this->callController(
            fn() => CampaignController::show(self::CAMP_ID)
        );

        $this->assertEquals(200, $response['status']);
        $this->assertArrayNotHasKey('gmGlobalOverrides',       $response['body'],
            'gmGlobalOverrides must NOT appear in campaign show response');
        $this->assertArrayNotHasKey('gm_global_overrides_text', $response['body'],
            'gm_global_overrides_text must NOT appear in campaign show response');
    }

    // =========================================================================
    // (6) POST /api/campaigns creates campaign with title_json
    // =========================================================================

    /**
     * Creating a campaign via the API must store title_json as a JSON-encoded
     * LocalizedString and return the plain title in the 201 response.
     */
    public function testCreateStorestitleJsonCorrectly(): void
    {
        $this->simulateLogin(self::GM_ID, 'gm', 'cam_gm');

        $response = $this->callControllerWithInput(
            fn() => CampaignController::create(),
            json_encode(['title' => 'Brand New Campaign'])
        );

        $this->assertEquals(201, $response['status'],
            'Create must return 201 Created');
        $this->assertEquals('Brand New Campaign', $response['body']['title'],
            'Response must include the plain title');
        $this->assertArrayHasKey('id', $response['body'],
            'Response must include the generated id');

        // Verify the DB row stores title_json, not a plain `title` column.
        $pdo = Database::getInstance();
        $stmt = $pdo->prepare('SELECT title_json FROM campaigns WHERE id = ?');
        $stmt->execute([$response['body']['id']]);
        $row = $stmt->fetch();

        $this->assertNotEmpty($row, 'Campaign row must exist in DB');
        $decoded = json_decode($row['title_json'], true);
        $this->assertIsArray($decoded, 'title_json must be a JSON object');
        $this->assertEquals('Brand New Campaign', $decoded['en'],
            'title_json must contain the English title');
    }

    // =========================================================================
    // (7) PUT /api/campaigns/{id} updates title_json via `title` body field
    // =========================================================================

    /**
     * The `title` field in the PUT request body must be written to `title_json`.
     * The plain `title` column no longer exists.
     */
    public function testUpdateWritesToTitleJson(): void
    {
        $this->simulateLogin(self::GM_ID, 'gm', 'cam_gm');

        $newTitle = ['en' => 'Updated Title', 'fr' => 'Titre Mis à Jour'];

        $response = $this->callControllerWithInput(
            fn() => CampaignController::update(self::CAMP_ID),
            json_encode(['title' => $newTitle])
        );

        $this->assertEquals(200, $response['status']);

        // Verify the DB row was updated in the title_json column.
        $pdo = Database::getInstance();
        $stmt = $pdo->prepare('SELECT title_json FROM campaigns WHERE id = ?');
        $stmt->execute([self::CAMP_ID]);
        $row = $stmt->fetch();

        $decoded = json_decode($row['title_json'], true);
        $this->assertEquals('Updated Title',   $decoded['en']);
        $this->assertEquals('Titre Mis à Jour', $decoded['fr']);
    }

    // =========================================================================
    // (8) PUT /api/campaigns/{id} does NOT accept gmGlobalOverrides
    // =========================================================================

    /**
     * Sending gmGlobalOverrides in the campaign PUT body must be silently ignored
     * (no error, but the data is not written to the campaigns table since the
     * column no longer exists).
     *
     * WHY: Old frontend code might still send gmGlobalOverrides. The server must
     * not crash or return an error — it just ignores the field.
     */
    public function testUpdateIgnoresGmGlobalOverrides(): void
    {
        $this->simulateLogin(self::GM_ID, 'gm', 'cam_gm');

        // Send a gmGlobalOverrides field along with a valid title update.
        $response = $this->callControllerWithInput(
            fn() => CampaignController::update(self::CAMP_ID),
            json_encode([
                'title'             => 'Updated Title',
                'gmGlobalOverrides' => '[{"id":"test","category":"feat"}]',
            ])
        );

        // Must succeed (200) — the gmGlobalOverrides is silently ignored.
        $this->assertEquals(200, $response['status'],
            'Campaign update must succeed even when gmGlobalOverrides is included in body');

        // Verify no gm_global_overrides column in the DB (the column was removed).
        $pdo = Database::getInstance();
        $cols = array_column(
            $pdo->query('PRAGMA table_info(campaigns)')->fetchAll(PDO::FETCH_ASSOC),
            'name'
        );
        $this->assertNotContains('gm_global_overrides_text', $cols,
            'gm_global_overrides_text column must not exist in the campaigns table');
    }

    // =========================================================================
    // (9) PUT /api/campaigns/{id} stores bannerImageData correctly
    // =========================================================================

    /**
     * Sending a valid base64 data URI as bannerImageData must store it in the
     * banner_image_data column.
     */
    public function testUpdateStoresBannerImageData(): void
    {
        $this->simulateLogin(self::GM_ID, 'gm', 'cam_gm');

        // Use a minimal valid JPEG data URI prefix.
        $banner = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBD';

        $response = $this->callControllerWithInput(
            fn() => CampaignController::update(self::CAMP_ID),
            json_encode(['bannerImageData' => $banner])
        );

        $this->assertEquals(200, $response['status'],
            'Update with valid banner must return 200');

        // Verify the banner was written to the DB.
        $pdo = Database::getInstance();
        $stmt = $pdo->prepare('SELECT banner_image_data FROM campaigns WHERE id = ?');
        $stmt->execute([self::CAMP_ID]);
        $row = $stmt->fetch();

        $this->assertEquals($banner, $row['banner_image_data'],
            'banner_image_data must match the sent value');
    }

    // =========================================================================
    // (10) PUT /api/campaigns/{id} clears banner when null is sent
    // =========================================================================

    /**
     * Sending `bannerImageData: null` must set banner_image_data to NULL in the DB.
     * This is how the GM removes a campaign banner.
     */
    public function testUpdateClearsBannerWhenNullSent(): void
    {
        // First seed a banner.
        $pdo = Database::getInstance();
        $pdo->prepare('UPDATE campaigns SET banner_image_data = ? WHERE id = ?')
            ->execute(['data:image/png;base64,iVBORw0KGg==', self::CAMP_ID]);

        $this->simulateLogin(self::GM_ID, 'gm', 'cam_gm');

        $response = $this->callControllerWithInput(
            fn() => CampaignController::update(self::CAMP_ID),
            json_encode(['bannerImageData' => null])
        );

        $this->assertEquals(200, $response['status']);

        // Verify the banner was cleared.
        $stmt = $pdo->prepare('SELECT banner_image_data FROM campaigns WHERE id = ?');
        $stmt->execute([self::CAMP_ID]);
        $row = $stmt->fetch();

        $this->assertNull($row['banner_image_data'],
            'banner_image_data must be NULL after sending null');
    }

    // =========================================================================
    // ADDITIONAL: schema integrity checks
    // =========================================================================

    /**
     * The campaigns table must have the expected columns and must NOT have
     * columns that were removed in the schema refactor.
     */
    public function testCampaignsTableHasCorrectSchema(): void
    {
        $pdo = Database::getInstance();
        $cols = array_column(
            $pdo->query('PRAGMA table_info(campaigns)')->fetchAll(PDO::FETCH_ASSOC),
            'name'
        );

        // Columns that MUST exist.
        $this->assertContains('id',                        $cols);
        $this->assertContains('title_json',                $cols, 'title_json must exist');
        $this->assertContains('description_json',          $cols, 'description_json must exist');
        $this->assertContains('banner_image_data',         $cols, 'banner_image_data must exist');
        $this->assertContains('owner_id',                  $cols);
        $this->assertContains('chapters_json',             $cols);
        $this->assertContains('enabled_rule_sources_json', $cols);
        $this->assertContains('homebrew_rules_json',       $cols);
        $this->assertContains('campaign_settings_json',    $cols);
        $this->assertContains('updated_at',                $cols);

        // Columns that must NOT exist (removed in schema refactor).
        $this->assertNotContains('title',                    $cols, 'plain title column must not exist');
        $this->assertNotContains('description',              $cols, 'plain description column must not exist');
        $this->assertNotContains('poster_url',               $cols, 'poster_url must not exist');
        $this->assertNotContains('gm_global_overrides_text', $cols, 'gm_global_overrides_text must not exist');
    }

    /**
     * The server_settings table must exist and the gm_global_overrides key
     * must be bootstrapped by migrate().
     */
    public function testServerSettingsTableExists(): void
    {
        $pdo = Database::getInstance();

        // Table existence check.
        $tables = array_column(
            $pdo->query("SELECT name FROM sqlite_master WHERE type='table'")->fetchAll(PDO::FETCH_ASSOC),
            'name'
        );
        $this->assertContains('server_settings', $tables,
            'server_settings table must exist after migration');

        // Bootstrap row check.
        $stmt = $pdo->prepare("SELECT value FROM server_settings WHERE key = 'gm_global_overrides'");
        $stmt->execute();
        $row = $stmt->fetch();

        $this->assertNotEmpty($row, "gm_global_overrides row must be seeded by migrate()");
        $this->assertEquals('[]', $row['value'],
            'Initial gm_global_overrides value must be an empty JSON array');
    }
}
