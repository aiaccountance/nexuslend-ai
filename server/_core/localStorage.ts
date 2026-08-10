/**
 * Local-disk storage, used when no S3-backed storage service is configured.
 *
 * The hosted template uploads through a presigned-URL service; without it the
 * app could not accept a single photo, which makes running or trialling it
 * anywhere else impossible. Writing to a directory on disk closes that gap.
 *
 * Suitable for local development and single-box v1 testing. It is not suitable
 * for a multi-instance deployment — the files live on one machine's disk and
 * vanish with it — so configure real object storage before scaling out.
 */
import path from "path";
import { ENV } from "./env";

/** True when uploads should be written to disk rather than pushed to S3. */
export function isLocalStorage(): boolean {
  return !ENV.forgeApiUrl || !ENV.forgeApiKey;
}

export function localStorageRoot(): string {
  return path.resolve(process.cwd(), ENV.localStorageDir);
}

/**
 * Resolves a storage key to an absolute path inside the storage root.
 *
 * Keys reach us straight from request URLs, so a key of `../../.env` must not
 * be able to read outside the storage directory. Anything that escapes the
 * root is rejected rather than clamped.
 */
export function localStoragePath(key: string): string {
  const root = localStorageRoot();
  const resolved = path.resolve(root, key);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error("Invalid storage key");
  }
  return resolved;
}
