import { createHash, timingSafeEqual } from "node:crypto";

function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

/**
 * Constant-time comparison of the submitted credentials against the
 * configured ones. Both values are always compared (no early exit), and
 * hashing first makes the comparison length-independent.
 */
export function credentialsMatch(
  submitted: { username: string; password: string },
  expected: { username: string; password: string }
): boolean {
  const userOk = timingSafeEqual(digest(submitted.username), digest(expected.username));
  const passOk = timingSafeEqual(digest(submitted.password), digest(expected.password));
  return userOk && passOk;
}
