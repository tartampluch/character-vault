<?php
/**
 * @file api/Database.php
 * @description Singleton PDO wrapper for SQLite database access.
 *
 * PURPOSE:
 *   Provides a single, shared PDO connection to the SQLite database.
 *   Using the singleton pattern ensures only one PDO connection is opened
 *   per request, which is efficient for SQLite (file locking).
 *
 * USAGE:
 *   $db = Database::getInstance();
 *   $stmt = $db->prepare('SELECT * FROM campaigns WHERE id = ?');
 *   $stmt->execute([$id]);
 *   $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
 *
 * TESTING (PHPUnit):
 *   When `APP_TESTING = true` (set via environment variable), the singleton
 *   connects to `sqlite::memory:`. Each test class should call
 *   `Database::reset()` before setup to get a fresh in-memory database.
 *
 * ARCHITECTURE NOTE — WHY SINGLETON?
 *   In a long-running PHP process (PHP-FPM, FastCGI), re-opening a SQLite file
 *   on every query causes unnecessary overhead. The singleton pattern ensures
 *   the PDO connection is reused across all controller calls within a single
 *   HTTP request lifecycle.
 *
 *   In tests, `reset()` allows each test class to start with a clean DB state
 *   without interference from previous tests.
 *
 * @see api/config.php for DB_DSN and APP_TESTING constants.
 * @see ARCHITECTURE.md Phase 14.1 for the full specification.
 */

declare(strict_types=1);

require_once __DIR__ . '/config.php';

class Database
{
    /**
     * The single PDO instance for this request.
     * `null` means no connection has been opened yet.
     */
    private static ?PDO $instance = null;

    /**
     * Private constructor — prevents direct instantiation.
     * Use `Database::getInstance()` instead.
     */
    private function __construct() {}

    /**
     * Returns the singleton PDO instance, creating it on first call.
     *
     * PDO OPTIONS:
     *   - ERRMODE_EXCEPTION: PDO throws PDOException on errors (not silently fails).
     *     This ensures all database errors propagate up to the error handler
     *     and are logged, rather than being silently ignored.
     *   - DEFAULT_FETCH_ASSOC: fetch() returns associative arrays by default.
     *     This avoids the confusing mixed numeric+string index arrays.
     *   - SQLITE_JOURNAL_MODE = WAL: Write-Ahead Logging improves concurrent reads.
     *     WAL mode allows reads while a write is in progress — critical for a
     *     multiplayer game where GM and players may query simultaneously.
     *
     * @return PDO The active PDO connection.
     * @throws PDOException If the connection fails (e.g., file not writable).
     */
    public static function getInstance(): PDO
    {
        if (self::$instance === null) {
            self::$instance = self::createConnection(DB_DSN);
        }

        return self::$instance;
    }

    /**
     * Creates a new PDO connection to the given DSN.
     *
     * Separated from `getInstance()` to allow testing to inject custom DSNs
     * if needed (e.g., testing with a different in-memory DB).
     *
     * @param string $dsn - The PDO DSN string (e.g., 'sqlite::memory:' or 'sqlite:/path/to/db.sqlite')
     * @return PDO
     * @throws PDOException On connection failure.
     */
    private static function createConnection(string $dsn): PDO
    {
        $pdo = new PDO($dsn, null, null, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);

        // Enable WAL (Write-Ahead Logging) for better concurrent read performance.
        // This is especially important when multiple players are polling the sync endpoint
        // while the GM is writing character overrides simultaneously.
        // PRAGMA must be executed separately (not as part of a prepared statement).
        $pdo->exec('PRAGMA journal_mode = WAL;');

        // Enable foreign key support (SQLite disables it by default).
        // This enforces referential integrity between tables (e.g., characters.campaign_id → campaigns.id).
        $pdo->exec('PRAGMA foreign_keys = ON;');

        // Set busy_timeout to 5000ms (5 seconds).
        // If SQLite is locked (another connection writing), wait up to 5 seconds before failing.
        // This handles brief lock contention during concurrent writes without crashing.
        $pdo->exec('PRAGMA busy_timeout = 5000;');

        return $pdo;
    }

    /**
     * Resets the singleton instance.
     *
     * TESTING USE ONLY:
     *   Called at the start of each PHPUnit test class to clear the cached connection.
     *   This forces the next call to `getInstance()` to create a fresh connection,
     *   which for `sqlite::memory:` means a completely empty database.
     *
     *   Without this, the in-memory DB would persist data from one test class to the next.
     *
     *   Example PHPUnit usage:
     *   ```php
     *   protected function setUp(): void {
     *       Database::reset();
     *       $db = Database::getInstance();
     *       // Run migrations...
     *   }
     *   ```
     */
    public static function reset(): void
    {
        self::$instance = null;
    }

    /**
     * Executes a helper method to run the full schema migration.
     *
     * USAGE:
     *   Called by `api/migrate.php` to initialize the database schema.
     *   Also called at the start of PHPUnit test setup to create tables in
     *   the in-memory database.
     *
     * WHY HERE AND NOT IN migrate.php?
     *   Having the schema in a static method makes it callable from both the
     *   CLI migration script AND from PHPUnit test setup, without code duplication.
     *
     * @param PDO $pdo - The PDO connection to run migrations on.
     */
    public static function runMigrations(PDO $pdo): void
    {
        // Delegate to the migration file (keeps schema definition centralized).
        // The migration file will be created in Phase 14.4 and will define migrate($pdo).
        // Called from: api/migrate.php (CLI), PHPUnit setUp() (tests).
        if (file_exists(__DIR__ . '/migrate.php')) {
            require_once __DIR__ . '/migrate.php';
            if (function_exists('migrate')) {
                migrate($pdo);
            }
        }
    }

    /**
     * Executes a simple helper: begins a transaction, runs a callable, commits.
     * Rolls back automatically if the callable throws an exception.
     *
     * WHY USE TRANSACTIONS?
     *   SQLite performance is dramatically better when multiple INSERT/UPDATE/DELETE
     *   statements are wrapped in a single transaction. A campaign save that writes
     *   10 character records goes from ~10 disk syncs to 1.
     *
     * @param callable $operations - A callable that receives the PDO and performs DB operations.
     * @throws Throwable Re-throws any exception from the callable after rolling back.
     */
    public static function transaction(callable $operations): void
    {
        $pdo = self::getInstance();
        $pdo->beginTransaction();

        try {
            $operations($pdo);
            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
    }
}
