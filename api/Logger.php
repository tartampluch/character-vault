<?php
/**
 * @file api/Logger.php
 * @description Structured request / event logger for development mode.
 *
 * ACTIVATION:
 *   Active only when APP_ENV === 'development' and APP_TESTING is false.
 *   Completely silent in production and during PHPUnit runs — zero overhead.
 *
 * OUTPUT:
 *   Writes directly to STDERR so output appears in the PHP built-in server
 *   terminal alongside its own connection events, with no "PHP message:" prefix.
 *
 * FORMAT:
 *   [D M d H:i:s Y] [LEVEL] [Tag      ] message  key=value  key=value
 *
 * REQUEST / RESPONSE FRAMING (in index.php + shutdown fn):
 *   [timestamp]   >>  PUT    /api/campaigns/camp_abc  body=1.2KB
 *   [timestamp] [INFO ] [Campaign ] Updated camp_abc  fields=chapters,settings
 *   [timestamp]   <<  200  PUT    /api/campaigns/camp_abc  user=gm_001 [GM]  12ms
 *
 * COLORS (ANSI, disabled when NO_COLOR env var is set):
 *   >> / <<    cyan bold
 *   [INFO ]    cyan        [WARN ]  yellow      [ERROR]  red bold    [DEBUG]  dim
 *   2xx status green       4xx      yellow       5xx     red bold
 *   Tag        magenta
 *
 * USAGE:
 *   // In index.php — frame every request
 *   Logger::request($method, $path);
 *   register_shutdown_function(fn() => Logger::response(
 *       http_response_code() ?: 200, $method, $path, $startTime
 *   ));
 *
 *   // In auth.php — after successful requireAuth()
 *   Logger::setUser($user['username'], (bool)$user['is_game_master']);
 *
 *   // In any controller
 *   Logger::info('Campaign', 'Updated', ['id' => $id, 'fields' => 'chapters']);
 *   Logger::warn('Auth',     'Login failed', ['user' => $username]);
 *   Logger::error('DB',      $e->getMessage());
 */

declare(strict_types=1);

class Logger
{
    /** Authenticated user for the current request — set by requireAuth(). */
    private static ?string $currentUser = null;
    private static ?bool   $currentIsGM = null;

    /**
     * Cached stderr stream handle.
     * We use fopen('php://stderr') instead of the STDERR constant because
     * STDERR is only predefined in CLI mode — the built-in web server runs
     * as cli-server SAPI where the constant is not available.
     *
     * @var resource|null
     */
    private static $stderr = null;

    private static function stderr()
    {
        if (self::$stderr === null) {
            self::$stderr = fopen('php://stderr', 'w');
        }
        return self::$stderr;
    }

    // =========================================================================
    // Activation guard
    // =========================================================================

    private static function enabled(): bool
    {
        return defined('APP_ENV')     && APP_ENV === 'development'
            && defined('APP_TESTING') && !APP_TESTING;
    }

    // =========================================================================
    // User tracking
    // =========================================================================

    /**
     * Record the authenticated user for this request.
     * Called automatically from requireAuth() in auth.php on successful auth.
     */
    public static function setUser(string $username, bool $isGM): void
    {
        self::$currentUser = $username;
        self::$currentIsGM = $isGM;
    }

    // =========================================================================
    // ANSI colour helpers
    // =========================================================================

    /**
     * Wrap $text in an ANSI escape sequence.
     * Returns $text unchanged when NO_COLOR is set (https://no-color.org/).
     */
    private static function ansi(string $code, string $text): string
    {
        if (getenv('NO_COLOR') !== false) return $text;
        return "\033[{$code}m{$text}\033[0m";
    }

    // =========================================================================
    // Internal formatting
    // =========================================================================

    /** Timestamp matching PHP built-in server format: [Wed Mar 25 18:11:01 2026] */
    private static function ts(): string
    {
        return date('[D M d H:i:s Y]');
    }

    /**
     * Format a context array as "  key=value  key=value".
     * Arrays are joined with commas; booleans become true/false.
     */
    private static function fmtCtx(array $data): string
    {
        if (empty($data)) return '';
        $parts = [];
        foreach ($data as $k => $v) {
            if (is_array($v))    $v = implode(',', array_map('strval', $v));
            elseif (is_bool($v)) $v = $v ? 'true' : 'false';
            elseif (is_null($v)) $v = '—';
            $parts[] = self::ansi('2', $k . '=') . $v;
        }
        return '  ' . implode('  ', $parts);
    }

    /**
     * Core write — assembles one log line and sends it to STDERR.
     *
     * @param string $level      e.g. '[INFO ]'
     * @param string $levelColor ANSI code for the level, e.g. '36' for cyan
     * @param string $tag        Short category label, padded to 9 chars
     * @param string $msg        Human-readable message
     * @param array  $ctx        Key/value context pairs
     */
    private static function write(
        string $level,
        string $levelColor,
        string $tag,
        string $msg,
        array  $ctx = []
    ): void {
        if (!self::enabled()) return;

        $ts   = self::ts();
        $lvl  = self::ansi($levelColor, $level);
        $t    = self::ansi('35', str_pad($tag, 9));   // magenta, padded
        $line = "{$ts} {$lvl} [{$t}] {$msg}" . self::fmtCtx($ctx) . "\n";

        fwrite(self::stderr(), $line);
    }

    // =========================================================================
    // Log-level methods
    // =========================================================================

    public static function debug(string $tag, string $msg, array $ctx = []): void
    {
        self::write('[DEBUG]', '2',    $tag, $msg, $ctx);   // dim
    }

    public static function info(string $tag, string $msg, array $ctx = []): void
    {
        self::write('[INFO ]', '36',   $tag, $msg, $ctx);   // cyan
    }

    public static function warn(string $tag, string $msg, array $ctx = []): void
    {
        self::write('[WARN ]', '33',   $tag, $msg, $ctx);   // yellow
    }

    public static function error(string $tag, string $msg, array $ctx = []): void
    {
        self::write('[ERROR]', '31;1', $tag, $msg, $ctx);   // red bold
    }

    // =========================================================================
    // Request / response framing
    // =========================================================================

    /**
     * Log the incoming HTTP request.
     * Call at the start of index.php routing, before dispatching to a controller.
     *
     * @param string $method  HTTP verb (GET, POST, PUT, …)
     * @param string $path    Normalised path without /api prefix (e.g. '/campaigns/camp_abc')
     */
    public static function request(string $method, string $path): void
    {
        if (!self::enabled()) return;

        $ctx = [];
        $len = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
        if ($len > 0) $ctx['body'] = self::humanBytes($len);

        $arrow = self::ansi('36;1', '>>');
        $m     = self::ansi('1',    str_pad($method, 7));
        $line  = self::ts() . "   {$arrow}  {$m}{$path}" . self::fmtCtx($ctx) . "\n";
        fwrite(self::stderr(), $line);
    }

    /**
     * Log the outgoing HTTP response with timing and (if known) the authenticated user.
     * Call from register_shutdown_function() in index.php, passing microtime(true) captured
     * at the start of the request.
     *
     * @param int    $status    Final HTTP status code
     * @param string $method    HTTP verb
     * @param string $path      Normalised path
     * @param float  $startTime microtime(true) captured before routing began
     */
    public static function response(int $status, string $method, string $path, float $startTime): void
    {
        if (!self::enabled()) return;

        $ms = (int)round((microtime(true) - $startTime) * 1000);

        $ctx = [];
        if (self::$currentUser !== null) {
            $ctx['user'] = self::$currentUser . (self::$currentIsGM ? ' [GM]' : '');
        }
        $ctx['ms'] = $ms;

        $statusColor = $status >= 500 ? '31;1'
                     : ($status >= 400 ? '33'
                     : ($status >= 300 ? '36' : '32'));

        $arrow = self::ansi('36;1', '<<');
        $s     = self::ansi($statusColor, (string)$status);
        $m     = self::ansi('1', str_pad($method, 7));
        $line  = self::ts() . "   {$arrow}  {$s}  {$m}{$path}" . self::fmtCtx($ctx) . "\n";
        fwrite(self::stderr(), $line);
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    private static function humanBytes(int $bytes): string
    {
        if ($bytes >= 1_048_576) return round($bytes / 1_048_576, 1) . 'MB';
        if ($bytes >= 1_024)     return round($bytes / 1_024,     1) . 'KB';
        return $bytes . 'B';
    }
}
