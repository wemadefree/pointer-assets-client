import { describe, expect, it, vi } from "vitest";
import {
  PointerAssetsApiError,
  PointerAssetsAuthenticationError,
  PointerAssetsClient,
  PointerAssetsInvalidArgumentError,
  PointerAssetsInvalidResponseError,
  MAX_UPLOAD_SIZE_BYTES,
  PointerAssetsNetworkError,
} from "../src";
import { asset, authClient, jsonResponse, upload } from "./helpers";

describe("typed errors", () => {
  it("throws an authentication error before fetch when the token is missing", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const client = createClient(fetch, null);

    await expect(client.get("asset-1")).rejects.toBeInstanceOf(
      PointerAssetsAuthenticationError,
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("parses Boom errors and request IDs", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      jsonResponse(
        {
          statusCode: 403,
          error: "Forbidden",
          message: "Customer portal access is required",
        },
        {
          status: 403,
          headers: {
            "content-type": "application/json",
            "x-request-id": "request-123",
          },
        },
      ),
    );
    const client = createClient(fetch);

    const promise = client.refreshSession();

    await expect(promise).rejects.toBeInstanceOf(PointerAssetsApiError);
    await expect(promise).rejects.toMatchObject({
      statusCode: 403,
      backendError: "Forbidden",
      message: "Customer portal access is required",
      requestId: "request-123",
    });
  });

  it("falls back to HTTP status for unknown error bodies", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response("<html>unavailable</html>", { status: 503 }));
    const client = createClient(fetch);

    await expect(client.refreshSession()).rejects.toMatchObject({
      statusCode: 503,
      message: "Pointer API request failed with status 503",
    });
  });

  it("throws an invalid response error for malformed successful DTOs", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      jsonResponse({
        asset: {
          ...asset,
          createdAt: "not-a-date",
        },
        upload,
      }),
    );
    const client = createClient(fetch);

    await expect(
      client.create({ name: "hello.txt", mimeType: "text/plain", size: 5 }),
    ).rejects.toBeInstanceOf(PointerAssetsInvalidResponseError);
  });

  it("throws a network error when fetch rejects", async () => {
    const cause = new TypeError("offline");
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(cause);
    const client = createClient(fetch);

    await expect(client.get("asset-1")).rejects.toMatchObject({
      name: "PointerAssetsNetworkError",
      code: "NETWORK",
      operation: "get",
      cause,
    } satisfies Partial<PointerAssetsNetworkError>);
  });

  it.each([0, MAX_UPLOAD_SIZE_BYTES + 1])(
    "rejects an upload size of %i bytes",
    async (size) => {
      const fetch = vi.fn<typeof globalThis.fetch>();
      const client = createClient(fetch);

      await expect(
        client.create({ name: "file", mimeType: "text/plain", size }),
      ).rejects.toBeInstanceOf(PointerAssetsInvalidArgumentError);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each([1, MAX_UPLOAD_SIZE_BYTES])(
    "accepts an upload size of %i bytes",
    async (size) => {
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValue(jsonResponse({ asset, upload }));
      const client = createClient(fetch);

      await expect(
        client.create({ name: "file", mimeType: "text/plain", size }),
      ).resolves.toEqual({ asset, upload });
      expect(JSON.parse(String(fetch.mock.calls[0]![1]?.body))).toMatchObject({
        size,
      });
    },
  );

  it("validates empty asset identifiers", async () => {
    const client = createClient(vi.fn<typeof globalThis.fetch>());

    await expect(client.get("")).rejects.toBeInstanceOf(
      PointerAssetsInvalidArgumentError,
    );
  });
});

function createClient(
  fetch: typeof globalThis.fetch,
  token: string | null = "access-token",
): PointerAssetsClient {
  return new PointerAssetsClient({
    apiBaseUrl: "https://pointer.example.com",
    tenantId: "tenant",
    authClient: authClient(token),
    fetch,
  });
}
