import { describe, expect, it, vi } from "vitest";
import { PointerAssetsClient } from "../src";
import { asset, authClient, jsonResponse, upload } from "./helpers";

describe("PointerAssetsClient request construction", () => {
  it("refreshes the cookie session with the encoded tenant and credentials", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      jsonResponse({ expiresAt: "2026-09-22T11:00:00.000Z" }),
    );
    const client = createClient(fetch, "tenant/with spaces");

    await expect(client.refreshSession()).resolves.toEqual({
      expiresAt: "2026-09-22T11:00:00.000Z",
    });

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://pointer.example.com/xrm-db/v1beta1/tenants/tenant%2Fwith%20spaces/portalAssets:refreshSession",
    );
    expect(init).toMatchObject({
      method: "POST",
      credentials: "include",
    });
    expect(init?.body).toBeUndefined();
    expect(new Headers(init?.headers).get("authorization")).toBe(
      "Bearer access-token",
    );
  });

  it("creates an upload with the exact backend DTO", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      jsonResponse({ asset, upload }),
    );
    const client = createClient(fetch);

    await expect(
      client.create({
        name: "hello world.txt",
        mimeType: "text/plain",
        size: 5,
      }),
    ).resolves.toEqual({ asset, upload });

    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://pointer.example.com/xrm-db/v1beta1/tenants/tenant/portalAssets:createUpload",
    );
    expect(init).toMatchObject({
      method: "POST",
      credentials: "include",
      body: JSON.stringify({
        name: "hello world.txt",
        mimeType: "text/plain",
        size: 5,
      }),
    });
    expect(new Headers(init?.headers).get("content-type")).toBe(
      "application/json",
    );
  });

  it("forwards an optional entity association exactly", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      jsonResponse({ asset, upload }),
    );
    const client = createClient(fetch);

    await client.create({
      name: "hello world.txt",
      mimeType: "text/plain",
      size: 5,
      entityType: "projects",
      entityId: "project/123",
    });

    expect(JSON.parse(String(fetch.mock.calls[0]![1]?.body))).toEqual({
      name: "hello world.txt",
      mimeType: "text/plain",
      size: 5,
      entityType: "projects",
      entityId: "project/123",
    });
  });

  it("encodes asset IDs for get and delete", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(jsonResponse({ asset }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = createClient(fetch);

    await client.get("asset/with spaces");
    await client.delete("asset/with spaces");

    const expected =
      "https://pointer.example.com/xrm-db/v1beta1/tenants/tenant/portalAssets/asset%2Fwith%20spaces";
    expect(String(fetch.mock.calls[0]![0])).toBe(expected);
    expect(fetch.mock.calls[0]![1]?.method).toBe("GET");
    expect(String(fetch.mock.calls[1]![0])).toBe(expected);
    expect(fetch.mock.calls[1]![1]).toMatchObject({
      method: "DELETE",
      credentials: "include",
    });
  });

  it("gets metadata, refreshes the session, then downloads without bearer auth", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(jsonResponse({ asset }))
      .mockResolvedValueOnce(
        jsonResponse({ expiresAt: "2026-09-22T11:00:00.000Z" }),
      )
      .mockResolvedValueOnce(
        new Response("hello", {
          status: 200,
          headers: { "content-type": "text/plain" },
        }),
      );
    const client = createClient(fetch);

    const result = await client.download("asset-1");

    expect(await result.text()).toBe("hello");
    expect(fetch).toHaveBeenCalledTimes(3);
    const [cdnUrl, cdnInit] = fetch.mock.calls[2]!;
    expect(String(cdnUrl)).toBe(
      "https://pointer.example.com/assets/portal/tenant/customers/customer/fileUploads/asset-1/hello%20world.txt",
    );
    expect(cdnInit).toEqual({
      method: "GET",
      credentials: "include",
    });
    expect(cdnInit?.headers).toBeUndefined();
  });

  it("creates and uploads File metadata in one operation", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(jsonResponse({ asset, upload }))
      .mockResolvedValueOnce(new Response(null, { status: 201 }));
    const client = createClient(fetch);
    const data = new File(["hello"], "hello world.txt", { type: "text/plain" });

    await expect(
      client.createAndUpload({
        data,
        entityType: "projects",
        entityId: "project-123",
      }),
    ).resolves.toEqual(asset);

    expect(JSON.parse(String(fetch.mock.calls[0]![1]?.body))).toEqual({
      name: "hello world.txt",
      mimeType: "text/plain",
      size: 5,
      entityType: "projects",
      entityId: "project-123",
    });
    expect(fetch.mock.calls[1]![1]?.body).toBe(data);
  });
});

function createClient(
  fetch: typeof globalThis.fetch,
  tenantId = "tenant",
): PointerAssetsClient {
  return new PointerAssetsClient({
    apiBaseUrl: "https://pointer.example.com/api-prefix/",
    tenantId,
    authClient: authClient(),
    fetch,
  });
}
