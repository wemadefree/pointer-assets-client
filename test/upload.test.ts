import { describe, expect, it, vi } from "vitest";
import {
  PointerAssetsClient,
  PointerAssetsInvalidResponseError,
  PointerAssetsUploadError,
} from "../src";
import { authClient, upload } from "./helpers";

describe("direct upload", () => {
  it("uses the backend-issued target without API credentials", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response(null, { status: 299 }));
    const client = createClient(fetch);
    const data = new Blob(["hello"], { type: "text/plain" });

    await client.upload(upload, data);

    expect(fetch).toHaveBeenCalledWith(upload.url, {
      method: "PUT",
      headers: upload.headers,
      body: data,
      credentials: "omit",
    });
    const headers = new Headers(fetch.mock.calls[0]![1]?.headers);
    expect(headers.get("content-type")).toBe("text/plain");
    expect(headers.has("authorization")).toBe(false);
  });

  it("rejects upload targets with extra headers", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const client = createClient(fetch);

    await expect(
      client.upload(
        {
          ...upload,
          headers: {
            "content-type": "text/plain",
            authorization: "Bearer must-not-leak",
          },
        },
        new Blob(["hello"]),
      ),
    ).rejects.toBeInstanceOf(PointerAssetsInvalidResponseError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("throws a typed upload error for non-2xx responses", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response("SignatureDoesNotMatch", { status: 403 }));
    const client = createClient(fetch);

    const promise = client.upload(upload, new ArrayBuffer(5));

    await expect(promise).rejects.toBeInstanceOf(PointerAssetsUploadError);
    await expect(promise).rejects.toMatchObject({
      statusCode: 403,
      message: "SignatureDoesNotMatch",
    });
  });
});

function createClient(fetch: typeof globalThis.fetch): PointerAssetsClient {
  return new PointerAssetsClient({
    apiBaseUrl: "https://pointer.example.com",
    tenantId: "tenant",
    authClient: authClient(),
    fetch,
  });
}
