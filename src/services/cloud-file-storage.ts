/**
 * Cloud File Storage — pure, server-side helpers.
 *
 * This module holds ONLY pure logic: filename/key sanitization (anti
 * path-traversal), MIME/size validation, project-prefix isolation, and the
 * metering cost math. It performs no I/O.
 *
 * SECURITY CONTRACT
 * - No secrets live here. The Supabase service_role, the Management token, and
 *   any storage key live only in server.ts / the environment and are NEVER
 *   imported, returned, or logged by this module.
 * - Every object key is forced under the owning project's prefix
 *   (`<projectId>/...`). A caller can never escape its project's space:
 *   isSafeObjectName() rejects slashes, `..`, absolute paths and control chars,
 *   and keyBelongsToProject() re-checks the final key.
 * - Validation is allow-list based (ALLOWED_STORAGE_MIME) with a bounded size.
 *
 * Pricing knobs are PLACEHOLDERS mirroring cloud-metering.ts. Set them to your
 * real Supabase provider unit costs before relying on the debited amounts.
 */

/** Single shared, PRIVATE bucket. Per-project isolation is by key prefix. */
export const STORAGE_BUCKET = 'project-files';

/** Hard upper bound per uploaded file. Kept under the server's 8 MB JSON body
 *  limit once base64-inflated (~1.37x), so proxied uploads never 413. */
export const MAX_STORAGE_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

/** Allow-list of accepted content types (extends the project-asset set). */
export const ALLOWED_STORAGE_MIME = new Set<string>([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'image/avif',
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'audio/mpeg',
  'audio/wav',
  'video/mp4',
  'video/webm',
  'application/zip',
  'application/octet-stream',
]);

// Control characters (U+0000–U+001F) and DEL (U+007F) are forbidden in keys.
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const CONTROL_CHARS_GLOBAL = /[\u0000-\u001f\u007f]/g;

// ── Pricing (USD). PLACEHOLDERS — replace with real provider costs. ───────────
const MARKUP = 2.0;
const FILE_STORAGE_PER_GB_MONTH = 0.021; // TODO: real Supabase $/GB-month
const NETWORK_PER_GB = 0.09; // TODO: real egress $/GB
const BYTES_PER_GB = 1e9;

/** Billable storage charge (with markup) for newly stored bytes, one cycle. */
export function storageChargeUsd(bytesStored: number): number {
  const bytes = Number(bytesStored);
  if (!Number.isFinite(bytes) || bytes <= 0) return 0;
  return (bytes / BYTES_PER_GB) * FILE_STORAGE_PER_GB_MONTH * MARKUP;
}

/** Billable egress charge (with markup) for served bytes. */
export function egressChargeUsd(bytesServed: number): number {
  const bytes = Number(bytesServed);
  if (!Number.isFinite(bytes) || bytes <= 0) return 0;
  return (bytes / BYTES_PER_GB) * NETWORK_PER_GB * MARKUP;
}

export type UploadValidation = { ok: true } | { ok: false; code: string; error: string };

/** Validate a proposed upload against the MIME allow-list and the size bound. */
export function validateUpload(input: { mimeType: unknown; sizeBytes: unknown }): UploadValidation {
  const mimeType = String(input.mimeType || '').toLowerCase().trim();
  const sizeBytes = Number(input.sizeBytes);
  if (!mimeType || !ALLOWED_STORAGE_MIME.has(mimeType)) {
    return { ok: false, code: 'unsupported_type', error: `Type de fichier non autorisé${mimeType ? ` (${mimeType})` : ''}.` };
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return { ok: false, code: 'empty_file', error: 'Fichier vide.' };
  }
  if (sizeBytes > MAX_STORAGE_FILE_BYTES) {
    return { ok: false, code: 'too_large', error: `Fichier trop volumineux. Maximum ${Math.round(MAX_STORAGE_FILE_BYTES / (1024 * 1024))} Mo.` };
  }
  return { ok: true };
}

/**
 * Reduce an arbitrary user filename to a single safe basename. Strips any
 * directory component (defeats `../` and absolute paths) and control chars.
 */
export function sanitizeStorageFilename(raw: unknown): string {
  let name = String(raw == null ? '' : raw);
  // Drop everything up to the last slash/backslash → keep the basename only.
  name = name.split(/[\\/]/).pop() || '';
  // Remove control characters, then restrict to a safe key charset.
  name = name.replace(CONTROL_CHARS_GLOBAL, '').replace(/[^A-Za-z0-9._ -]/g, '-');
  // Collapse leading dots so the name can never become `..` / hidden traversal.
  name = name.replace(/^\.+/, '');
  name = name.trim().replace(/\s+/g, ' ').slice(0, 120);
  return name || 'file';
}

/**
 * True only for a single, safe object-name segment (the part AFTER the project
 * prefix). Rejects slashes, `..`, leading dots, control chars and over-length.
 * This is the guard applied to any name the client sends for download/delete.
 */
export function isSafeObjectName(name: unknown): boolean {
  const value = String(name == null ? '' : name);
  if (!value || value.length > 200) return false;
  if (value.includes('/') || value.includes('\\')) return false;
  if (value.includes('..')) return false;
  if (CONTROL_CHARS.test(value)) return false;
  return /^[A-Za-z0-9][A-Za-z0-9._ -]*$/.test(value);
}

/** The storage key prefix that scopes a project. Always ends with a slash. */
export function buildProjectPrefix(projectId: string): string {
  return `${String(projectId)}/`;
}

/**
 * Build the full object key for a new upload: `<projectId>/<fileId>-<safeName>`.
 * The result is guaranteed to live under the project's prefix.
 */
export function buildObjectKey(projectId: string, fileId: string, filename: string): string {
  const safeName = sanitizeStorageFilename(filename);
  return `${buildProjectPrefix(projectId)}${fileId}-${safeName}`;
}

/**
 * Resolve a client-supplied object name to a full key under the project prefix,
 * or null when the name is unsafe. Used by download/delete so the client can
 * never reach another project's space or traverse out of the bucket.
 */
export function resolveObjectKey(projectId: string, objectName: unknown): string | null {
  if (!isSafeObjectName(objectName)) return null;
  return `${buildProjectPrefix(projectId)}${String(objectName)}`;
}

/** Defensive final check that a fully-formed key belongs to the project. */
export function keyBelongsToProject(key: string, projectId: string): boolean {
  const prefix = buildProjectPrefix(projectId);
  if (!String(key).startsWith(prefix)) return false;
  const rest = String(key).slice(prefix.length);
  return isSafeObjectName(rest);
}

/** Strip the project prefix to obtain the client-facing object name. */
export function objectNameFromKey(key: string, projectId: string): string {
  const prefix = buildProjectPrefix(projectId);
  return String(key).startsWith(prefix) ? String(key).slice(prefix.length) : String(key);
}
