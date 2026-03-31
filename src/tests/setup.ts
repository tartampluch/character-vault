/**
 * @file src/tests/setup.ts
 * @description Global Vitest setup file — run once before every test file.
 *
 * PURPOSE:
 *   The engine emits structured diagnostic messages via console.warn/debug/error
 *   whenever it exercises an error-handling path (unknown formula paths, invalid
 *   JSON overrides, network unavailability, etc.). These messages are INTENTIONAL
 *   and correct — they inform developers at runtime. In the test suite, however,
 *   they pollute output with noise that makes genuine test failures hard to spot.
 *
 *   This file installs lightweight console interceptors that silence messages
 *   bearing a known engine log prefix. Tests that explicitly ASSERT that a
 *   diagnostic fires use `vi.spyOn(console, 'warn').mockImplementation(() => {})`
 *   which wraps our interceptors — those spies still capture every call correctly
 *   (vitest records args before calling through), so assertion-based tests are
 *   completely unaffected.
 *
 * KNOWN ENGINE LOG PREFIXES (silenced globally):
 *   [MathParser]     — path resolution failures, unsupported types, parse errors
 *   [DataLoader]     — missing backend, malformed JSON, invalid entity fields
 *   [GameEngine]     — duplicate instances, missing pipelines, guard messages
 *   [Guard]          — cursed item removal blocks
 *   [SessionContext] — auth server unreachable, goto() not available in Node.js
 *   [LogicEvaluator] — unknown node types, NaN comparisons
 *   [DiceEngine]     — unknown dice expression tokens
 *
 * HOW IT INTERACTS WITH vi.spyOn:
 *   1. Setup replaces console.warn/error/debug with our filtered versions.
 *   2. Test calls `vi.spyOn(console, 'warn').mockImplementation(() => {})`.
 *   3. vitest wraps our filtered console.warn with a spy proxy.
 *   4. Engine calls console.warn('[MathParser] ...')
 *      → spy proxy records the args  ← assertion-observable
 *      → spy's mock implementation () => {} runs (no output)
 *   5. `expect(spy).toHaveBeenCalledWith(...)` passes correctly.
 *   6. `spy.mockRestore()` restores console.warn to our filtered version.
 *
 * NON-ENGINE messages (unexpected errors from broken test logic) are NOT
 * filtered and pass through to the terminal unchanged.
 *
 * @see vite.config.ts — setupFiles configuration
 */

// ---------------------------------------------------------------------------
// PROCESS-LEVEL WARNING FILTER
// ---------------------------------------------------------------------------
// vitest v4 passes `--localstorage-file` to its worker threads without a
// valid path when the test environment is 'node' (no real localStorage).
// Node.js emits a process-level Warning to stderr for each affected worker.
//
// process.on('warning') adds a listener but does NOT suppress the default
// stderr print — Node.js writes it anyway.  The only reliable suppression
// is to override process.emitWarning before any module triggers it, so the
// default stderr handler is never invoked for this specific message.
const _originalEmitWarning = process.emitWarning.bind(process);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(process as any).emitWarning = function (
  warning: string | Error,
  ...rest: unknown[]
): void {
  const msg =
    typeof warning === 'string'
      ? warning
      : (warning as Error)?.message ?? '';
  if (msg.includes('--localstorage-file')) return; // suppress vitest internal noise
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (_originalEmitWarning as any)(warning, ...rest);
};

/**
 * Engine / i18n log prefixes that are always expected in the test suite.
 *
 * These are intentional diagnostic messages emitted when tests exercise
 * error-handling or fallback paths.  Adding them here silences the noise so
 * genuine failures remain easy to spot in the output.
 *
 * [i18n] — "Missing UI string key" warnings emitted by the i18n module when
 *           tests deliberately look up unknown ability keys to assert the
 *           derived-abbreviation fallback behaviour.
 */
const KNOWN_ENGINE_PREFIXES: readonly string[] = [
  '[MathParser]',
  '[DataLoader]',
  '[GameEngine]',
  '[Guard]',
  '[SessionContext]',
  '[LogicEvaluator]',
  '[DiceEngine]',
  '[i18n]',
];

/**
 * Returns `true` if the first argument is a string that starts with one of
 * the known engine log prefixes — meaning the message is an expected
 * diagnostic, not an unexpected error from broken test logic.
 */
function isKnownEngineDiagnostic(firstArg: unknown): boolean {
  if (typeof firstArg !== 'string') return false;
  return KNOWN_ENGINE_PREFIXES.some(prefix => firstArg.startsWith(prefix));
}

// --- Save originals before replacing ---
const _originalWarn  = console.warn.bind(console);
const _originalError = console.error.bind(console);
const _originalDebug = console.debug.bind(console);

/**
 * Filtered console.warn: silences known engine diagnostics.
 * Unknown messages pass through to the real terminal output.
 */
console.warn = (...args: unknown[]): void => {
  if (isKnownEngineDiagnostic(args[0])) return;
  _originalWarn(...args);
};

/**
 * Filtered console.error: silences known engine diagnostics.
 * Genuine unexpected errors (broken test logic) still surface.
 */
console.error = (...args: unknown[]): void => {
  if (isKnownEngineDiagnostic(args[0])) return;
  _originalError(...args);
};

/**
 * Filtered console.debug: silences known engine diagnostics.
 * The DataLoader uses console.debug for "no backend" messages in tests.
 */
console.debug = (...args: unknown[]): void => {
  if (isKnownEngineDiagnostic(args[0])) return;
  _originalDebug(...args);
};
