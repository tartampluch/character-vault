<?php
/**
 * @file tests/TestPhpInputStream.php
 * @description PHP stream wrapper that mocks php://input for PHPUnit tests.
 *
 * PURPOSE:
 *   Our controllers use `file_get_contents('php://input')` to read JSON request bodies.
 *   In CLI mode (PHPUnit), php://input is always empty.
 *   This stream wrapper intercepts calls to `php://input` and returns test data.
 *
 * USAGE (in test classes):
 *   stream_wrapper_unregister('php');
 *   stream_register_wrapper('php', TestPhpInputStream::class);
 *   TestPhpInputStream::$inputData = '{"name":"Test"}';
 *   // ... call controller
 *   stream_wrapper_restore('php');
 *
 * WHY A STREAM WRAPPER AND NOT runkit?
 *   runkit requires a non-standard PHP extension that may not be available.
 *   PHP's built-in stream wrapper mechanism is standard and always available.
 *   The 'php' scheme is registered by PHP itself; we temporarily override it
 *   to intercept file_get_contents('php://input').
 *
 * IMPORTANT:
 *   Always call `stream_wrapper_restore('php')` in a finally block to ensure
 *   the original PHP stream handler is restored even if the test fails.
 */

declare(strict_types=1);

/**
 * Stream wrapper that intercepts `file_get_contents('php://input')` in tests.
 */
class TestPhpInputStream
{
    /** @var string The input data to return when php://input is read. */
    public static string $inputData = '';

    /** @var int Current read position in $inputData. */
    private int $position = 0;

    /** @var mixed The stream context resource (required by PHP stream wrapper interface). */
    public mixed $context;

    /**
     * Called when the stream is opened (e.g., via file_get_contents('php://input')).
     */
    public function stream_open(string $path, string $mode, int $options, ?string &$opened_path): bool
    {
        $this->position = 0;
        return true;
    }

    /**
     * Called to read `$count` bytes from the stream.
     */
    public function stream_read(int $count): string
    {
        $result = substr(self::$inputData, $this->position, $count);
        $this->position += strlen($result);
        return $result;
    }

    /**
     * Returns true when the end of the stream has been reached.
     */
    public function stream_eof(): bool
    {
        return $this->position >= strlen(self::$inputData);
    }

    /**
     * Returns file statistics (required by PHP stream wrapper interface).
     * @return array<string, int>
     */
    public function stream_stat(): array
    {
        return [];
    }

    /**
     * Returns URL statistics (required by PHP stream wrapper interface).
     * Called by file_exists(), stat(), etc.
     * @return array<string, int>
     */
    public function url_stat(string $path, int $flags): array
    {
        return [];
    }
}
