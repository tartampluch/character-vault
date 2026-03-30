/**
 * @file src/tests/bannerImageUtils.test.ts
 * @description Unit tests for the banner image validation and conversion utilities.
 *
 * COVERAGE:
 *   validateBannerFile()  — MIME type check, size check, combined scenarios.
 *   fileToBase64DataUri() — happy path, FileReader error path.
 *   isImageDataUri()      — truthy / falsy patterns.
 *   bannerCache.ts        — getCachedBanner, setCachedBanner, evictStaleBannerEntries.
 *
 * WHY TEST THESE?
 *   These utilities contain the only client-side enforcement of the 5 MB limit
 *   and the accepted-format list. A regression here would silently allow oversized
 *   or malformed payloads to reach the database.
 *
 * ENVIRONMENT:
 *   Vitest with happy-dom / jsdom (from vitest.config.ts). sessionStorage is
 *   available in the test environment. FileReader is available globally in jsdom.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  validateBannerFile,
  fileToBase64DataUri,
  isImageDataUri,
  MAX_BANNER_BYTES,
  ACCEPTED_IMAGE_MIME_TYPES,
  BANNER_INPUT_ACCEPT,
} from '$lib/utils/bannerImageUtils';
import {
  getCachedBanner,
  setCachedBanner,
  evictStaleBannerEntries,
} from '$lib/utils/bannerCache';

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Creates a minimal File object for testing.
 * Vitest / jsdom provide a global `File` constructor.
 */
function makeFile(
  name: string,
  mimeType: string,
  sizeBytes: number,
): File {
  // Fill with zero bytes — content doesn't matter for validation tests.
  const blob = new Blob([new Uint8Array(sizeBytes)], { type: mimeType });
  return new File([blob], name, { type: mimeType });
}

// =============================================================================
// validateBannerFile()
// =============================================================================

describe('validateBannerFile', () => {

  // ── Happy paths ─────────────────────────────────────────────────────────────

  it('accepts a valid JPEG under the size limit', () => {
    const file = makeFile('banner.jpg', 'image/jpeg', 1024);
    expect(validateBannerFile(file)).toEqual({ ok: true });
  });

  it('accepts a valid PNG under the size limit', () => {
    const file = makeFile('banner.png', 'image/png', 512);
    expect(validateBannerFile(file)).toEqual({ ok: true });
  });

  it('accepts a valid WebP under the size limit', () => {
    const file = makeFile('banner.webp', 'image/webp', 2048);
    expect(validateBannerFile(file)).toEqual({ ok: true });
  });

  it('accepts a valid GIF under the size limit', () => {
    const file = makeFile('animated.gif', 'image/gif', 4096);
    expect(validateBannerFile(file)).toEqual({ ok: true });
  });

  it('accepts a file that is exactly MAX_BANNER_BYTES (boundary)', () => {
    const file = makeFile('exact.jpg', 'image/jpeg', MAX_BANNER_BYTES);
    expect(validateBannerFile(file)).toEqual({ ok: true });
  });

  // ── Type errors ──────────────────────────────────────────────────────────────

  it('rejects an unsupported MIME type (PDF)', () => {
    const file = makeFile('doc.pdf', 'application/pdf', 1024);
    const result = validateBannerFile(file);
    expect(result).toMatchObject({ ok: false, errorKey: 'error_type' });
  });

  it('rejects a plain text file', () => {
    const file = makeFile('data.txt', 'text/plain', 512);
    const result = validateBannerFile(file);
    expect(result).toMatchObject({ ok: false, errorKey: 'error_type' });
  });

  it('rejects an empty MIME type string', () => {
    const file = makeFile('noext', '', 256);
    const result = validateBannerFile(file);
    expect(result).toMatchObject({ ok: false, errorKey: 'error_type' });
  });

  it('rejects AVIF (not in accepted list)', () => {
    const file = makeFile('photo.avif', 'image/avif', 1024);
    const result = validateBannerFile(file);
    expect(result).toMatchObject({ ok: false, errorKey: 'error_type' });
  });

  // ── Size errors ──────────────────────────────────────────────────────────────

  it('rejects a file that is one byte over the limit', () => {
    const file = makeFile('large.jpg', 'image/jpeg', MAX_BANNER_BYTES + 1);
    const result = validateBannerFile(file);
    expect(result).toMatchObject({ ok: false, errorKey: 'error_size' });
  });

  it('includes a human-readable sizeMb in the error', () => {
    // 6 MiB file → ~5.72 MB displayed
    const sixMib = 6 * 1024 * 1024;
    const file   = makeFile('huge.png', 'image/png', sixMib);
    const result = validateBannerFile(file);
    expect(result.ok).toBe(false);
    if (!result.ok && result.errorKey === 'error_size') {
      // sizeMb should be a decimal string with 2 places
      expect(result.sizeMb).toMatch(/^\d+\.\d{2}$/);
      // Value should be > 5 (we passed a 6 MiB file)
      expect(parseFloat(result.sizeMb)).toBeGreaterThan(5);
    }
  });

  // ── Type checked before size ─────────────────────────────────────────────────

  it('reports error_type even when the file is also oversized (type check wins)', () => {
    // Wrong type AND too large — should report type error, not size error.
    const bigInvalidFile = makeFile('huge.exe', 'application/octet-stream', MAX_BANNER_BYTES + 1);
    const result = validateBannerFile(bigInvalidFile);
    expect(result).toMatchObject({ ok: false, errorKey: 'error_type' });
  });

});

// =============================================================================
// ACCEPTED_IMAGE_MIME_TYPES / BANNER_INPUT_ACCEPT constants
// =============================================================================

describe('ACCEPTED_IMAGE_MIME_TYPES', () => {

  it('includes exactly the four expected formats', () => {
    expect(ACCEPTED_IMAGE_MIME_TYPES).toEqual([
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
    ]);
  });

  it('BANNER_INPUT_ACCEPT joins them as a comma-separated string', () => {
    expect(BANNER_INPUT_ACCEPT).toBe('image/jpeg,image/png,image/webp,image/gif');
  });

});

// =============================================================================
// isImageDataUri()
// =============================================================================

describe('isImageDataUri', () => {

  it('returns true for a JPEG data URI', () => {
    expect(isImageDataUri('data:image/jpeg;base64,/9j/4AAQ')).toBe(true);
  });

  it('returns true for a PNG data URI', () => {
    expect(isImageDataUri('data:image/png;base64,iVBOR')).toBe(true);
  });

  it('returns true for a WebP data URI', () => {
    expect(isImageDataUri('data:image/webp;base64,UklGR')).toBe(true);
  });

  it('returns false for null', () => {
    expect(isImageDataUri(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isImageDataUri(undefined)).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(isImageDataUri('')).toBe(false);
  });

  it('returns false for a plain URL', () => {
    expect(isImageDataUri('https://example.com/banner.jpg')).toBe(false);
  });

  it('returns false for a non-image data URI (PDF)', () => {
    expect(isImageDataUri('data:application/pdf;base64,JVBERi0x')).toBe(false);
  });

});

// =============================================================================
// fileToBase64DataUri()
// =============================================================================
//
// The Vitest environment is `node` (see vite.config.ts), so FileReader is not
// natively available. We install a lightweight mock before each test and restore
// the global afterwards so the fake never leaks into other test suites.
//
// Mock contract:
//   - readAsDataURL() is called by fileToBase64DataUri() — our mock calls the
//     handler on the next tick, mirroring the real async behaviour.
//   - The `result` property is set on the instance before `onload` fires.
//   - For the error path, `onerror` is called with `error` set on the instance.
// =============================================================================

describe('fileToBase64DataUri', () => {

  // The Vitest environment is `node` — FileReader is not native to Node.
  // We use vi.stubGlobal() to install a minimal class-based mock per test,
  // then vi.unstubAllGlobals() in afterEach to guarantee clean state.
  // Class syntax is used (not vi.fn()) because `new FileReader()` requires
  // a constructor-compatible value.

  const FAKE_DATA_URI = 'data:image/png;base64,iVBORw0KGgo=';

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves to a data URI string (mock FileReader, happy path)', async () => {
    // Minimal FileReader that calls onload with a fake data URI.
    class MockFileReaderOk {
      result: string | null     = null;
      onload:  (() => void) | null = null;
      onerror: (() => void) | null = null;
      error:   DOMException | null = null;

      readAsDataURL(_file: File): void {
        // Simulate async completion on the next microtask.
        Promise.resolve().then(() => {
          this.result = FAKE_DATA_URI;
          this.onload?.();
        });
      }
    }

    vi.stubGlobal('FileReader', MockFileReaderOk);

    const file   = makeFile('tiny.png', 'image/png', 4);
    const result = await fileToBase64DataUri(file);
    expect(result).toBe(FAKE_DATA_URI);
  });

  it('rejects when FileReader.onerror fires (mock FileReader, error path)', async () => {
    // Minimal FileReader that calls onerror with a fake DOMException.
    class MockFileReaderFail {
      result: string | null     = null;
      onload:  (() => void) | null = null;
      onerror: (() => void) | null = null;
      error:   DOMException | null = null;

      readAsDataURL(_file: File): void {
        Promise.resolve().then(() => {
          this.error = new DOMException('Simulated read error', 'NotReadableError');
          this.onerror?.();
        });
      }
    }

    vi.stubGlobal('FileReader', MockFileReaderFail);

    const file = makeFile('bad.png', 'image/png', 4);
    await expect(fileToBase64DataUri(file)).rejects.toThrow('FileReader error');
  });

});

// =============================================================================
// bannerCache — getCachedBanner / setCachedBanner / evictStaleBannerEntries
// =============================================================================

describe('bannerCache', () => {

  // Clear sessionStorage before each test to avoid cross-test pollution.
  beforeEach(() => {
    sessionStorage.clear();
  });

  const CAMPAIGN_ID = 'camp_test_001';
  const UPDATED_AT  = 1700000000;
  const DATA_URI    = 'data:image/jpeg;base64,/9j/4AAQ==';

  // ── getCachedBanner ──────────────────────────────────────────────────────────

  it('returns null when the cache is empty', () => {
    expect(getCachedBanner(CAMPAIGN_ID, UPDATED_AT)).toBeNull();
  });

  it('returns null when updatedAt does not match (stale key)', () => {
    setCachedBanner(CAMPAIGN_ID, UPDATED_AT, DATA_URI);
    expect(getCachedBanner(CAMPAIGN_ID, UPDATED_AT + 1)).toBeNull();
  });

  // ── setCachedBanner ──────────────────────────────────────────────────────────

  it('stores and retrieves a banner data URI', () => {
    setCachedBanner(CAMPAIGN_ID, UPDATED_AT, DATA_URI);
    expect(getCachedBanner(CAMPAIGN_ID, UPDATED_AT)).toBe(DATA_URI);
  });

  it('evicts the old entry when a new updatedAt is stored', () => {
    const oldTs = UPDATED_AT;
    const newTs = UPDATED_AT + 60;

    setCachedBanner(CAMPAIGN_ID, oldTs, DATA_URI);
    setCachedBanner(CAMPAIGN_ID, newTs, 'data:image/png;base64,abc');

    // Old entry must be gone.
    expect(getCachedBanner(CAMPAIGN_ID, oldTs)).toBeNull();
    // New entry must be present.
    expect(getCachedBanner(CAMPAIGN_ID, newTs)).toBe('data:image/png;base64,abc');
  });

  it('does not evict entries for a different campaign', () => {
    const OTHER_ID = 'camp_other_002';
    setCachedBanner(CAMPAIGN_ID, UPDATED_AT, DATA_URI);
    setCachedBanner(OTHER_ID, UPDATED_AT, 'data:image/png;base64,other');

    // The other campaign's entry must survive.
    expect(getCachedBanner(OTHER_ID, UPDATED_AT)).toBe('data:image/png;base64,other');
  });

  // ── evictStaleBannerEntries ───────────────────────────────────────────────────

  it('removes all entries for a campaign when keepUpdatedAt = -1', () => {
    setCachedBanner(CAMPAIGN_ID, UPDATED_AT,      DATA_URI);
    setCachedBanner(CAMPAIGN_ID, UPDATED_AT + 10, 'data:image/png;base64,v2');

    // Must clear storage first so we can insert both manually.
    sessionStorage.clear();
    // Insert two stale entries manually (bypass eviction in setCachedBanner).
    sessionStorage.setItem(`cvault_banner_${CAMPAIGN_ID}_${UPDATED_AT}`,      DATA_URI);
    sessionStorage.setItem(`cvault_banner_${CAMPAIGN_ID}_${UPDATED_AT + 10}`, 'data:image/png;base64,v2');

    evictStaleBannerEntries(CAMPAIGN_ID);

    expect(getCachedBanner(CAMPAIGN_ID, UPDATED_AT)).toBeNull();
    expect(getCachedBanner(CAMPAIGN_ID, UPDATED_AT + 10)).toBeNull();
  });

  it('preserves the entry matching keepUpdatedAt', () => {
    sessionStorage.clear();
    sessionStorage.setItem(`cvault_banner_${CAMPAIGN_ID}_${UPDATED_AT}`,      DATA_URI);
    sessionStorage.setItem(`cvault_banner_${CAMPAIGN_ID}_${UPDATED_AT + 10}`, 'data:image/png;base64,v2');

    evictStaleBannerEntries(CAMPAIGN_ID, UPDATED_AT);

    expect(getCachedBanner(CAMPAIGN_ID, UPDATED_AT)).toBe(DATA_URI);
    expect(getCachedBanner(CAMPAIGN_ID, UPDATED_AT + 10)).toBeNull();
  });

});
