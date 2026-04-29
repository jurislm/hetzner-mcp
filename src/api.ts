import axios, { AxiosError, AxiosInstance } from "axios";

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
    // I-2: surface fallback to the user — Cloud-project tokens often won't
    // authenticate against the unified API, so the request will likely 401.
    // We log once (cached client means this fires only on first creation).
    console.warn(
      "[hetzner-mcp] HETZNER_API_TOKEN_UNIFIED is not set; falling back to HETZNER_API_TOKEN " +
      "for the unified Storage Box API. If you see 401 errors, generate an account-level " +
      `unified token at: ${UNIFIED_TOKEN_CONSOLE_URL}`
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

export async function makeStorageBoxApiRequest<T>(
  endpoint: string,
  method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
  data?: unknown,
  params?: Record<string, unknown>
): Promise<T> {
  const client = getStorageBoxApiClient();
  const response = await client.request<T>({
    url: endpoint,
    method,
    data,
    params
  });
  return response.data;
}

export async function makeApiRequest<T>(
  endpoint: string,
  method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
  data?: unknown,
  params?: Record<string, unknown>
): Promise<T> {
  const client = getApiClient();
  const response = await client.request<T>({
    url: endpoint,
    method,
    data,
    params
  });
  return response.data;
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

// I-4: Test-only reset hook for clearing cached clients between tests.
// Guarded against accidental production use.
export function __resetClientsForTesting(): void {
  if (process.env.NODE_ENV === "production") {
    return;
  }
  apiClient = null;
  storageBoxApiClient = null;
}
