/**
 * @file src/lib/utils/bannerImageUtils.ts
 * @description Pure utility functions for campaign banner image processing.
 *
 * DESIGN PHILOSOPHY — WHY BASE64 STORAGE?
 *   Banner images are stored as base64-encoded data URIs directly in the SQLite
 *   database column `campaigns.banner_image_data`. This approach:
 *   - Requires zero file-system setup (no uploads/ directory, no CDN).
 *   - Works on cheap shared hosting with only PHP + SQLite.
 *   - Keeps the application fully self-contained and trivially back-up-able.
 *
 *   The trade-off is payload size (~4/3 overhead for base64 encoding).
 *   A 5 MB source image becomes ~6.7 MB encoded. The 5 MB client-side
 *   limit keeps the DB rows and HTTP responses manageable.
 *
 * PURITY CONTRACT:
 *   Every export in this file is a pure function or constant — no Svelte
 *   reactivity, no DOM side-effects (except the Promise-based FileReader
 *   which is isolated in fileToBase64DataUri). This makes the module fully
 *   unit-testable in a Node/JSDOM environment without a browser.
 */

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Maximum allowed source-file size in bytes (5 MiB).
 *
 * WHY 5 MB?
 *   A 5 MB JPEG / PNG is already a very high-resolution banner image.
 *   Base64-encoding a 5 MB file produces ~6.7 MB of text, which SQLite
 *   stores and retrieves efficiently as a TEXT column.
 *   Larger images would slow page loads noticeably on mobile connections.
 */
export const MAX_BANNER_BYTES = 5 * 1024 * 1024; // 5 MiB

/**
 * Accepted MIME types for banner images.
 * The file input's `accept` attribute should mirror this list.
 *
 * GIF is included to support animated banners (rare but valid use case).
 * AVIF / HEIC are excluded — browser support is still inconsistent.
 */
export const ACCEPTED_IMAGE_MIME_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];

/**
 * Convenience string for the HTML <input accept="…"> attribute.
 * Derived from ACCEPTED_IMAGE_MIME_TYPES to keep them in sync.
 */
export const BANNER_INPUT_ACCEPT = ACCEPTED_IMAGE_MIME_TYPES.join(',');

// =============================================================================
// TYPES
// =============================================================================

/**
 * Result of validateBannerFile().
 * Discriminated union — callers MUST check `ok` before reading error fields.
 *
 * On success:   { ok: true }
 * On type error: { ok: false; errorKey: 'error_type' }
 * On size error: { ok: false; errorKey: 'error_size'; sizeMb: string }
 *   `sizeMb` is a pre-formatted string (2 decimal places) for display in the UI.
 */
export type BannerValidationResult =
  | { ok: true }
  | { ok: false; errorKey: 'error_type' }
  | { ok: false; errorKey: 'error_size'; sizeMb: string };

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validates a File before it is converted to a base64 banner.
 *
 * Checks performed (in order):
 *   1. MIME type — must be one of ACCEPTED_IMAGE_MIME_TYPES.
 *      (Type is checked first: a wrong-type file should report "wrong format"
 *       rather than a potentially misleading "too large" message.)
 *   2. Size — must not exceed MAX_BANNER_BYTES (5 MB).
 *
 * NOTE ON BROWSER MIME TYPES:
 *   `file.type` is set by the browser from the OS file-type registry.
 *   A user can rename a .exe to .jpg and trick the MIME type — the server
 *   side must also validate the actual file magic bytes. However, for the
 *   client-side UX check, browser MIME sniffing is good enough.
 *
 * @param file - The File object from `<input type="file">`.
 * @returns Discriminated union: `{ ok: true }` or an error descriptor.
 */
export function validateBannerFile(file: File): BannerValidationResult {
  // Type check first — wrong type trumps the size check for UX clarity.
  if (!ACCEPTED_IMAGE_MIME_TYPES.includes(file.type)) {
    return { ok: false, errorKey: 'error_type' };
  }

  if (file.size > MAX_BANNER_BYTES) {
    // Round to 2 decimal places for a readable "{size} MB" error message.
    const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
    return { ok: false, errorKey: 'error_size', sizeMb };
  }

  return { ok: true };
}

// =============================================================================
// CONVERSION
// =============================================================================

/**
 * Converts a File to a base64-encoded data URI using the FileReader API.
 *
 * The returned string has the canonical data URI form:
 *   `data:<mimeType>;base64,<encodedPayload>`
 *
 * This string:
 *   - Is directly usable as the value of an `<img src>` attribute.
 *   - Is stored verbatim in `campaigns.banner_image_data` in the database.
 *   - Is cached client-side in sessionStorage by `bannerCache.ts`.
 *
 * USAGE:
 *   ```ts
 *   const result = validateBannerFile(file);
 *   if (result.ok) {
 *     const dataUri = await fileToBase64DataUri(file);
 *     // use dataUri
 *   }
 *   ```
 *
 * @param file - A File that has already been validated via validateBannerFile().
 * @returns A Promise resolving to the data URI string.
 * @throws Error if the FileReader encounters an I/O error (e.g. file revoked
 *         by the OS before reading completes — rare but possible).
 */
export function fileToBase64DataUri(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      // `readAsDataURL` always sets result to a string on success.
      resolve(reader.result as string);
    };

    reader.onerror = () => {
      reject(
        new Error(
          `FileReader error reading "${file.name}": ${reader.error?.message ?? 'unknown error'}`,
        ),
      );
    };

    reader.readAsDataURL(file);
  });
}

// =============================================================================
// DATA URI HELPERS
// =============================================================================

/**
 * Returns true when `value` looks like a base64 image data URI.
 *
 * Used to distinguish a stored banner (data URI) from an empty / null value
 * without performing a full parse.
 *
 * Pattern matched: `data:image/<subtype>;base64,`
 *
 * @param value - Any string (or null/undefined) to test.
 */
export function isImageDataUri(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^data:image\/[a-z+]+;base64,/.test(value);
}
