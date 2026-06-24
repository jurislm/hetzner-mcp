/** Extracts a safe, credential-free string from an unknown thrown value. */
export function formatStartupError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * True when `s` is safe to interpolate as a single URL path segment.
 *
 * Callers already restrict the character set (no "/" or "\\"), so the only
 * residual path-traversal vector is a segment consisting solely of dots
 * (".", "..", "..."). An upstream proxy may normalise such a segment to reach
 * a parent resource — e.g. DELETE /storage_boxes/1/subaccounts/.. could resolve
 * to DELETE /storage_boxes/1. Reject dot-only segments to close that gap.
 */
export function isSafePathSegment(s: string): boolean {
  return s.length > 0 && !/^\.+$/.test(s);
}

/** Escapes HTML special characters to prevent XSS in markdown tool output. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}
