import {
  PointerAssetsApiError,
  PointerAssetsAuthenticationError,
  PointerAssetsInvalidResponseError,
  PointerAssetsNetworkError,
} from "../errors";
import type { AssetAuthClient } from "../types";

interface BoomError {
  statusCode?: number;
  error?: string;
  message?: string;
}

export class ApiHttpClient {
  private readonly baseUrl: URL;
  private readonly authClient: AssetAuthClient;
  private readonly fetch: typeof globalThis.fetch;

  constructor(
    apiBaseUrl: string,
    authClient: AssetAuthClient,
    fetchImplementation: typeof globalThis.fetch,
  ) {
    try {
      this.baseUrl = new URL(apiBaseUrl);
    } catch {
      throw new TypeError("apiBaseUrl must be an absolute URL");
    }
    this.authClient = authClient;
    this.fetch = fetchImplementation;
  }

  resolveApiPath(path: string): URL {
    return new URL(path, this.baseUrl);
  }

  resolveAssetUrl(path: string): URL {
    if (!path.startsWith("/")) {
      throw new PointerAssetsInvalidResponseError(
        "download",
        "Asset URL must be root-relative",
      );
    }
    const resolved = new URL(path, this.baseUrl);
    if (resolved.origin !== this.baseUrl.origin) {
      throw new PointerAssetsInvalidResponseError(
        "download",
        "Asset URL must be same-origin",
      );
    }
    return resolved;
  }

  async requestJson(
    operation: string,
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    const token = await this.authClient.getAccessToken();
    if (!token) {
      throw new PointerAssetsAuthenticationError();
    }

    const headers = new Headers({
      accept: "application/json",
      authorization: `Bearer ${token}`,
    });
    let serializedBody: string | undefined;
    if (body !== undefined) {
      headers.set("content-type", "application/json");
      serializedBody = JSON.stringify(body);
    }

    const response = await this.execute(operation, this.resolveApiPath(path), {
      method,
      headers,
      credentials: "include",
      ...(serializedBody === undefined ? {} : { body: serializedBody }),
    });

    if (!response.ok) {
      throw await createApiError(response);
    }

    try {
      return await response.json();
    } catch {
      throw new PointerAssetsInvalidResponseError(operation, "Response was not valid JSON");
    }
  }

  async requestDelete(operation: string, path: string): Promise<void> {
    const token = await this.authClient.getAccessToken();
    if (!token) {
      throw new PointerAssetsAuthenticationError();
    }

    const response = await this.execute(operation, this.resolveApiPath(path), {
      method: "DELETE",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
      },
      credentials: "include",
    });

    if (!response.ok) {
      throw await createApiError(response);
    }
  }

  async execute(
    operation: string,
    input: URL | string,
    init: RequestInit,
  ): Promise<Response> {
    try {
      return await this.fetch(input, init);
    } catch (cause) {
      throw new PointerAssetsNetworkError(operation, cause);
    }
  }
}

async function createApiError(response: Response): Promise<PointerAssetsApiError> {
  const body = await readErrorBody(response);
  const requestId =
    response.headers.get("x-request-id") ??
    response.headers.get("x-correlation-id") ??
    undefined;
  const statusCode =
    typeof body.statusCode === "number" ? body.statusCode : response.status;
  const message =
    typeof body.message === "string" && body.message.length > 0
      ? body.message
      : `Pointer API request failed with status ${response.status}`;

  return new PointerAssetsApiError(message, statusCode, {
    ...(typeof body.error === "string" ? { backendError: body.error } : {}),
    ...(requestId === undefined ? {} : { requestId }),
  });
}

async function readErrorBody(response: Response): Promise<BoomError> {
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null && !Array.isArray(body)) {
      return body as BoomError;
    }
  } catch {
    // Unknown error bodies use the HTTP status fallback.
  }
  return {};
}
