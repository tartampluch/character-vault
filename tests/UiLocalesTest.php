<?php
/**
 * @file tests/UiLocalesTest.php
 * @description Unit tests for UiLocalesController — the GET /api/locales endpoint.
 *
 * COVERAGE TARGET
 *   UiLocalesController::index() — 100 % statement / branch coverage.
 *
 * WHAT IS TESTED
 *   1.  Missing directory → empty array.
 *   2.  Empty directory  → empty array.
 *   3.  Valid locale file → correct descriptor.
 *   4.  English locale (code = "en") is always excluded.
 *   5.  File with malformed JSON is silently skipped.
 *   6.  File that is not readable is silently skipped.
 *   7.  File whose JSON root is not an array/object is skipped.
 *   8.  File with no $meta key is skipped.
 *   9.  File with $meta but missing "code" is skipped.
 *   10. File with $meta but missing "language" is skipped.
 *   11. File with $meta but empty "code" string is skipped.
 *   12. Invalid unitSystem value is normalised to "imperial".
 *   13. Missing unitSystem defaults to "imperial".
 *   14. Explicit unitSystem "metric" is preserved.
 *   15. Multiple valid files are returned sorted alphabetically by code.
 *   16. Results exclude "en" even when present among multiple files.
 *   17. $meta containing only partial fields doesn't leak into valid set.
 *   18. Real fr.json (from static/locales/) parses correctly as a sanity check.
 *
 * ISOLATION
 *   Each test writes temporary locale JSON files into a private temp directory
 *   created in setUp() and removed in tearDown(). The controller is instantiated
 *   with that directory so the real static/locales/ tree is never touched.
 *
 * @see api/controllers/UiLocalesController.php  The controller under test.
 * @see tests/TestCase.php                        Base class with callController().
 */

declare(strict_types=1);

require_once __DIR__ . '/TestCase.php';

class UiLocalesTest extends TestCase
{
    /** Temporary directory for this test class's locale files. */
    private string $tempDir = '';

    protected function setUp(): void
    {
        parent::setUp();
        $this->tempDir = sys_get_temp_dir() . '/cv_locales_test_' . uniqid('', true);
        mkdir($this->tempDir, 0777, true);
    }

    protected function tearDown(): void
    {
        parent::tearDown();
        // Remove all files in the temp directory, then the directory itself.
        if (is_dir($this->tempDir)) {
            foreach (glob($this->tempDir . '/*') as $file) {
                if (is_file($file)) unlink($file);
            }
            rmdir($this->tempDir);
        }
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    /** Writes a locale file into the temp directory. */
    private function putLocale(string $code, array $data): void
    {
        file_put_contents($this->tempDir . '/' . $code . '.json', json_encode($data));
    }

    /** Calls the controller and returns the decoded JSON body. */
    private function getLocales(?string $dir = null): array
    {
        $result = $this->callController(
            fn() => (new UiLocalesController($dir ?? $this->tempDir))->index()
        );
        $this->assertSame(200, $result['status']);
        return $result['body'];
    }

    // =========================================================================
    // 1 — Missing directory
    // =========================================================================

    public function test_missing_directory_returns_empty_array(): void
    {
        $result = $this->getLocales('/tmp/absolutely_does_not_exist_' . uniqid('', true));
        $this->assertSame([], $result);
    }

    // =========================================================================
    // 2 — Empty directory
    // =========================================================================

    public function test_empty_directory_returns_empty_array(): void
    {
        $result = $this->getLocales();
        $this->assertSame([], $result);
    }

    // =========================================================================
    // 3 — Single valid locale file
    // =========================================================================

    public function test_valid_locale_file_returns_descriptor(): void
    {
        $this->putLocale('de', [
            '$meta' => ['code' => 'de', 'language' => 'Deutsch', 'countryCode' => 'de', 'unitSystem' => 'metric'],
            'nav.campaigns' => 'Kampagnen',
        ]);

        $result = $this->getLocales();

        $this->assertCount(1, $result);
        $this->assertSame('de',      $result[0]['code']);
        $this->assertSame('Deutsch', $result[0]['language']);
        $this->assertSame('metric',  $result[0]['unitSystem']);
    }

    // =========================================================================
    // 4 — English locale is excluded
    // =========================================================================

    public function test_english_locale_is_always_excluded(): void
    {
        $this->putLocale('en', [
            '$meta' => ['code' => 'en', 'language' => 'English', 'unitSystem' => 'imperial'],
        ]);

        $result = $this->getLocales();
        $this->assertSame([], $result);
    }

    // =========================================================================
    // 5 — Malformed JSON is skipped
    // =========================================================================

    public function test_malformed_json_file_is_skipped(): void
    {
        file_put_contents($this->tempDir . '/broken.json', '{ this is not json }');

        $result = $this->getLocales();
        $this->assertSame([], $result);
    }

    // =========================================================================
    // 6 — Unreadable file is skipped
    // =========================================================================

    public function test_unreadable_file_is_skipped(): void
    {
        $path = $this->tempDir . '/unreadable.json';
        file_put_contents($path, json_encode(['$meta' => ['code' => 'ur', 'language' => 'Unreadable']]));
        chmod($path, 0000);

        $result = $this->getLocales();
        $this->assertSame([], $result);

        // Restore permissions so tearDown() can delete the file.
        chmod($path, 0644);
    }

    // =========================================================================
    // 7 — Non-array/non-object JSON root is skipped
    // =========================================================================

    public function test_json_root_string_is_skipped(): void
    {
        file_put_contents($this->tempDir . '/string.json', '"just a string"');
        $result = $this->getLocales();
        $this->assertSame([], $result);
    }

    public function test_json_root_number_is_skipped(): void
    {
        file_put_contents($this->tempDir . '/number.json', '42');
        $result = $this->getLocales();
        $this->assertSame([], $result);
    }

    // =========================================================================
    // 8 — File with no $meta key is skipped
    // =========================================================================

    public function test_file_without_meta_is_skipped(): void
    {
        $this->putLocale('nometacode', ['nav.campaigns' => 'Kampagnen']);
        $result = $this->getLocales();
        $this->assertSame([], $result);
    }

    // =========================================================================
    // 9 — $meta present but "code" missing
    // =========================================================================

    public function test_meta_without_code_is_skipped(): void
    {
        $this->putLocale('nocode', ['$meta' => ['language' => 'NoCode Language', 'unitSystem' => 'metric']]);
        $result = $this->getLocales();
        $this->assertSame([], $result);
    }

    // =========================================================================
    // 10 — $meta present but "language" missing
    // =========================================================================

    public function test_meta_without_language_is_skipped(): void
    {
        $this->putLocale('nolang', ['$meta' => ['code' => 'nolang', 'unitSystem' => 'metric']]);
        $result = $this->getLocales();
        $this->assertSame([], $result);
    }

    // =========================================================================
    // 11 — $meta with empty "code" string is skipped
    // =========================================================================

    public function test_meta_with_empty_code_is_skipped(): void
    {
        $this->putLocale('emptycode', ['$meta' => ['code' => '', 'language' => 'Empty', 'unitSystem' => 'metric']]);
        $result = $this->getLocales();
        $this->assertSame([], $result);
    }

    // =========================================================================
    // 11b — $meta with missing countryCode is skipped
    // =========================================================================

    public function test_meta_without_country_code_is_skipped(): void
    {
        // countryCode is mandatory so the language picker can render the flag icon.
        // A locale file that omits it is considered incomplete and must be skipped.
        $this->putLocale('nocountry', ['$meta' => ['code' => 'nocountry', 'language' => 'NoCo', 'unitSystem' => 'metric']]);
        $result = $this->getLocales();
        $this->assertSame([], $result);
    }

    // =========================================================================
    // 11c — $meta with empty countryCode string is skipped
    // =========================================================================

    public function test_meta_with_empty_country_code_is_skipped(): void
    {
        $this->putLocale('emptycountry', ['$meta' => ['code' => 'emptycountry', 'language' => 'EmptyCo', 'countryCode' => '', 'unitSystem' => 'metric']]);
        $result = $this->getLocales();
        $this->assertSame([], $result);
    }

    // =========================================================================
    // 12 — Invalid unitSystem is normalised to "imperial"
    // =========================================================================

    public function test_invalid_unit_system_normalised_to_imperial(): void
    {
        $this->putLocale('pl', [
            '$meta' => ['code' => 'pl', 'language' => 'Polski', 'countryCode' => 'pl', 'unitSystem' => 'whatever'],
        ]);

        $result = $this->getLocales();
        $this->assertCount(1, $result);
        $this->assertSame('imperial', $result[0]['unitSystem']);
    }

    // =========================================================================
    // 13 — Missing unitSystem defaults to "imperial"
    // =========================================================================

    public function test_missing_unit_system_defaults_to_imperial(): void
    {
        $this->putLocale('cs', [
            '$meta' => ['code' => 'cs', 'language' => 'Čeština', 'countryCode' => 'cz'],
        ]);

        $result = $this->getLocales();
        $this->assertCount(1, $result);
        $this->assertSame('imperial', $result[0]['unitSystem']);
    }

    // =========================================================================
    // 14 — Explicit "metric" is preserved
    // =========================================================================

    public function test_metric_unit_system_is_preserved(): void
    {
        $this->putLocale('es', [
            '$meta' => ['code' => 'es', 'language' => 'Español', 'countryCode' => 'es', 'unitSystem' => 'metric'],
        ]);

        $result = $this->getLocales();
        $this->assertCount(1, $result);
        $this->assertSame('metric', $result[0]['unitSystem']);
    }

    // =========================================================================
    // 15 — Multiple valid files returned sorted alphabetically by code
    // =========================================================================

    public function test_multiple_locales_returned_sorted_by_code(): void
    {
        $this->putLocale('zh', ['$meta' => ['code' => 'zh', 'language' => '中文',      'countryCode' => 'cn', 'unitSystem' => 'metric']]);
        $this->putLocale('de', ['$meta' => ['code' => 'de', 'language' => 'Deutsch',   'countryCode' => 'de', 'unitSystem' => 'metric']]);
        $this->putLocale('it', ['$meta' => ['code' => 'it', 'language' => 'Italiano',  'countryCode' => 'it', 'unitSystem' => 'metric']]);

        $result = $this->getLocales();

        $this->assertCount(3, $result);
        $this->assertSame('de', $result[0]['code']);
        $this->assertSame('it', $result[1]['code']);
        $this->assertSame('zh', $result[2]['code']);
    }

    // =========================================================================
    // 16 — Multiple files: "en" excluded, others retained
    // =========================================================================

    public function test_en_excluded_while_others_are_returned(): void
    {
        $this->putLocale('en', ['$meta' => ['code' => 'en', 'language' => 'English',  'countryCode' => 'gb', 'unitSystem' => 'imperial']]);
        $this->putLocale('de', ['$meta' => ['code' => 'de', 'language' => 'Deutsch',  'countryCode' => 'de', 'unitSystem' => 'metric']]);
        $this->putLocale('fr', ['$meta' => ['code' => 'fr', 'language' => 'Français', 'countryCode' => 'fr', 'unitSystem' => 'metric']]);

        $result = $this->getLocales();

        $codes = array_column($result, 'code');
        $this->assertNotContains('en', $codes);
        $this->assertContains('de', $codes);
        $this->assertContains('fr', $codes);
        $this->assertCount(2, $result);
    }

    // =========================================================================
    // 17 — $meta with all valid fields: non-meta translation keys ignored
    // =========================================================================

    public function test_translation_keys_not_leaked_into_descriptor(): void
    {
        $this->putLocale('pt', [
            '$meta'        => ['code' => 'pt', 'language' => 'Português', 'countryCode' => 'pt', 'unitSystem' => 'metric'],
            'nav.campaigns' => 'Campanhas',
            'nav.vault'     => 'Cofre',
        ]);

        $result = $this->getLocales();
        $this->assertCount(1, $result);
        $descriptor = $result[0];
        // Only code, language, countryCode, and unitSystem should be present — not raw translation keys.
        $this->assertArrayHasKey('code',        $descriptor);
        $this->assertArrayHasKey('language',    $descriptor);
        $this->assertArrayHasKey('countryCode', $descriptor);
        $this->assertArrayHasKey('unitSystem',  $descriptor);
        $this->assertArrayNotHasKey('nav.campaigns', $descriptor);
        $this->assertArrayNotHasKey('nav.vault',     $descriptor);
        $this->assertCount(4, $descriptor);
    }

    // =========================================================================
    // 18 — Real fr.json integration sanity check
    // =========================================================================

    public function test_real_fr_json_parses_as_valid_locale(): void
    {
        // Resolve the path to the shipped fr.json regardless of CWD.
        $frPath = realpath(__DIR__ . '/../static/locales/fr.json');

        if ($frPath === false || !is_file($frPath)) {
            $this->markTestSkipped('static/locales/fr.json not found — skipping integration check.');
        }

        // Create a temp dir containing just a symlink/copy of fr.json.
        $dir   = sys_get_temp_dir() . '/cv_real_fr_' . uniqid('', true);
        mkdir($dir, 0777, true);
        copy($frPath, $dir . '/fr.json');

        try {
            $result = $this->getLocales($dir);
        } finally {
            @unlink($dir . '/fr.json');
            @rmdir($dir);
        }

        $this->assertCount(1, $result, 'Expected exactly one locale descriptor from fr.json');
        $this->assertSame('fr',     $result[0]['code']);
        $this->assertSame('metric', $result[0]['unitSystem']);
        $this->assertNotEmpty($result[0]['language']);
    }
}
