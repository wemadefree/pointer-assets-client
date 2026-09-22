import type { Asset, AssetUploadTarget } from "../src";

export const asset: Asset = {
  id: "asset-1",
  name: "hello world.txt",
  url: "/assets/portal/tenant/customers/customer/fileUploads/asset-1/hello%20world.txt",
  mimeType: "text/plain",
  size: 5,
  createdAt: "2026-09-22T10:00:00.000Z",
  updatedAt: "2026-09-22T10:00:00.000Z",
};

export const upload: AssetUploadTarget = {
  method: "PUT",
  url: "https://storage.googleapis.com/upload?signature=opaque",
  headers: {
    "content-type": "text/plain",
  },
  expiresAt: "2026-09-22T10:05:00.000Z",
};

export function jsonResponse(
  body: unknown,
  init?: ResponseInit,
): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
    ...init,
  });
}

export function authClient(token: string | null = "access-token") {
  return {
    getAccessToken: async () => token,
  };
}
