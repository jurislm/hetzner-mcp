/** Extracts a safe, credential-free string from an unknown thrown value. */
export function formatStartupError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
