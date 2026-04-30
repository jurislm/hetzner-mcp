import axios, { AxiosError, AxiosInstance } from "axios";
import { z } from "zod";

const API_BASE_URL = "https://api.hetzner.cloud/v1";
const STORAGE_BOX_API_BASE_URL = "https://api.hetzner.com/v1";
const UNIFIED_TOKEN_CONSOLE_URL = "https://console.hetzner.com/account/security/api-tokens";

let apiClient: AxiosInstance | null = null;
let storageBoxApiClient: AxiosInstance | null = null;

function resolveCloudToken(): string {
  const token = process.env.HETZNER_API_TOKEN;
  if (!token) {
    throw new Error("HETZNER_API_TOKEN environment variable is required");
  }
  return token;
}

function resolveUnifiedToken(): string {
  const unified = process.env.HETZNER_API_TOKEN_UNIFIED;
  if (unified) {
    return unified;
  }
  const fallback = process.env.HETZNER_API_TOKEN;
  if (fallback) {
    // I-2 + I-4: surface fallback to the operator — Cloud-project tokens
    // often won't authenticate against the unified API, so the request will
    // likely 401. We write directly to process.stderr (more explicit than
    // console.warn). Note: in stdio MCP transports, child-process stderr
    // may be discarded by the host (Claude Desktop, Cursor, etc.). Operators
    // who can't see the warning should set NODE_OPTIONS or capture stderr.
    // See README "Storage Boxes — Different Token Required".
    process.stderr.write(
      "[hetzner-mcp] WARN: HETZNER_API_TOKEN_UNIFIED is not set; falling back to HETZNER_API_TOKEN " +
      "for the unified Storage Box API. If you see 401 errors, generate an account-level " +
      `unified token at: ${UNIFIED_TOKEN_CONSOLE_URL}\n`
    );
    return fallback;
  }
  throw new Error(
    "Storage Box API requires an account-level token.\n" +
    "Set HETZNER_API_TOKEN_UNIFIED (preferred) or HETZNER_API_TOKEN.\n" +
    `Generate a unified-API token at: ${UNIFIED_TOKEN_CONSOLE_URL}\n` +
    "Note: Cloud-project tokens (console.hetzner.cloud) do NOT authenticate against the unified API."
  );
}

function createHetznerClient(baseURL: string, token: string): AxiosInstance {
  return axios.create({
    baseURL,
    timeout: 30000,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    }
  });
}

export function getApiClient(): AxiosInstance {
  if (!apiClient) {
    apiClient = createHetznerClient(API_BASE_URL, resolveCloudToken());
  }
  return apiClient;
}

export function getStorageBoxApiClient(): AxiosInstance {
  if (!storageBoxApiClient) {
    storageBoxApiClient = createHetznerClient(STORAGE_BOX_API_BASE_URL, resolveUnifiedToken());
  }
  return storageBoxApiClient;
}

// C-1: All Storage Box API responses are validated with a Zod schema at the
// boundary. An unexpected API shape throws ZodError (handled in handleApiError)
// instead of silently coercing to undefined downstream.
export async function makeStorageBoxApiRequest<T>(
  endpoint: string,
  schema: z.ZodType<T>,
  method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
  data?: unknown,
  params?: Record<string, unknown>
): Promise<T> {
  const client = getStorageBoxApiClient();
  const response = await client.request<unknown>({
    url: endpoint,
    method,
    data,
    params
  });
  return schema.parse(response.data);
}

// C-2: Cloud API responses are now validated with a Zod schema at the
// boundary, matching makeStorageBoxApiRequest. An unexpected API shape
// throws ZodError (handled in handleApiError).
export async function makeApiRequest<T>(
  endpoint: string,
  schema: z.ZodType<T>,
  method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
  data?: unknown,
  params?: Record<string, unknown>
): Promise<T> {
  const client = getApiClient();
  const response = await client.request<unknown>({
    url: endpoint,
    method,
    data,
    params
  });
  return schema.parse(response.data);
}

// C-4: narrow error.response.data before treating it as HetznerAPIError.
function extractHetznerErrorMessage(data: unknown): string | undefined {
  if (
    typeof data === "object" &&
    data !== null &&
    "error" in data &&
    typeof (data as { error: unknown }).error === "object" &&
    (data as { error: unknown }).error !== null
  ) {
    const inner = (data as { error: { message?: unknown } }).error;
    if (typeof inner.message === "string") {
      return inner.message;
    }
  }
  return undefined;
}

export function handleApiError(error: unknown): string {
  // C-1: ZodError = API response shape didn't match our schema. This is
  // distinct from a network or HTTP error — the request succeeded but the
  // payload is unexpected (API change, partial response, wrong endpoint).
  if (error instanceof z.ZodError) {
    const firstIssue = error.issues[0];
    const path = firstIssue.path.length > 0 ? firstIssue.path.join(".") : "<root>";
    return (
      `Error: Hetzner API returned an unexpected response shape at "${path}": ${firstIssue.message}. ` +
      "This may indicate an API change. Please report this issue."
    );
  }
  if (error instanceof AxiosError) {
    if (error.response) {
      const status = error.response.status;
      const message = extractHetznerErrorMessage(error.response.data);

      switch (status) {
        case 401:
          return "Error: Authentication failed. Please check your HETZNER_API_TOKEN (or HETZNER_API_TOKEN_UNIFIED for Storage Box endpoints).";
        case 403:
          return `Error: Permission denied. ${message || "You don't have access to this resource."}`;
        case 404:
          return `Error: Resource not found. ${message || "Please check the ID is correct."}`;
        case 409:
          return `Error: Conflict. ${message || "The resource is in a conflicting state."}`;
        case 422:
          return `Error: Invalid request. ${message || "Please check your parameters."}`;
        case 429:
          return "Error: Rate limit exceeded. Please wait a moment before making more requests.";
        case 503:
          return "Error: Hetzner API is temporarily unavailable. Please try again later.";
        default:
          return `Error: API request failed (${status}). ${message || error.message}`;
      }
    }
    // I-3: cover the common network error codes axios surfaces.
    switch (error.code) {
      case "ECONNABORTED":
      case "ETIMEDOUT":
        return "Error: Request timed out. Please try again.";
      case "ENOTFOUND":
      case "EAI_AGAIN":
        return "Error: Could not resolve Hetzner API hostname. Please check your DNS or internet connection.";
      case "ECONNRESET":
      case "ECONNREFUSED":
        return "Error: Connection to Hetzner API was reset or refused. Please retry.";
    }
  }

  if (error instanceof Error) {
    return `Error: ${error.message}`;
  }

  return "Error: An unexpected error occurred.";
}

// I-5: Test-only reset hook for clearing cached clients between tests.
// Throws in production so an accidental call surfaces immediately instead
// of silently no-op'ing and leaving the test author with stale state.
export function __resetClientsForTesting(): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("__resetClientsForTesting must not be called in production");
  }
  apiClient = null;
  storageBoxApiClient = null;
}
