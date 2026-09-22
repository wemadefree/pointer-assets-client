# @we-made/pointer-assets-client

Framework-independent browser SDK for Pointer/P2 portal asset uploads and CDN-protected downloads.

The SDK coordinates three services:

1. The Pointer API authenticates the user, manages asset metadata, issues the CDN session cookie, and returns a one-hour signed Google Cloud Storage (GCS) `PUT` URL.
2. The browser uploads the file directly to GCS with that signed URL. File bytes do not pass through the Pointer API.
3. The browser downloads from a stable Cloud CDN asset URL. Access is authorized by an HttpOnly `Cloud-CDN-Cookie` issued by the Pointer backend.

Signed cookies replace signed **download** URLs because one short-lived cookie can authorize stable, cache-friendly CDN URLs without putting signatures in every asset URL. They do not replace signed **upload** URLs: each upload is a write to one backend-selected GCS object and needs a short-lived, method- and header-constrained `PUT` credential. Cloud CDN serves reads; it does not authorize direct GCS writes.

The package does not accept bucket names or object paths, generate signatures, or contain signing keys.

## Install

```sh
npm install @we-made/pointer-assets-client
```

When using the existing Firebase auth integration:

```sh
npm install @we-made/pointer-assets-client @we-made/firebase-auth-client
```

## Browser setup

`PointerAssetsClient` needs a Pointer API base URL, tenant ID, and any auth client/token provider that implements `getAccessToken()`.

```ts
import { FirebaseAuthClient } from "@we-made/firebase-auth-client";
import { PointerAssetsClient } from "@we-made/pointer-assets-client";

const apiBaseUrl = "https://portal.example.com/api";

const authClient = new FirebaseAuthClient(
  apiBaseUrl,
  import.meta.env.VITE_POINTER_PORTAL_CONFIG_KEY,
);

await authClient.build();

const assets = new PointerAssetsClient({
  apiBaseUrl,
  tenantId: "pointer-tenant-id",
  authClient,
});

// Run after login and identity/customer context initialization.
await assets.refreshSession();
```

`@we-made/firebase-auth-client` is not a runtime dependency. A custom provider only needs this structural interface:

```ts
import type { AssetAuthClient } from "@we-made/pointer-assets-client";

const authClient: AssetAuthClient = {
  async getAccessToken() {
    return await applicationAuth.getAccessToken();
  },
};
```

The SDK is framework independent. The same instance can be provided through React context, Vue injection, Svelte context, a plain module, or any other application architecture.

## Client options

```ts
import { PointerAssetsClient } from "@we-made/pointer-assets-client";

const assets = new PointerAssetsClient({
  apiBaseUrl: "https://portal.example.com/api",
  tenantId: "pointer-tenant-id",
  authClient,
  getCustomerId: () => selectedCustomerId,
  // fetch: customFetch, // Optional; useful for tests or controlled runtimes.
});
```

| Option | Required | Description |
|---|---:|---|
| `apiBaseUrl` | Yes | Absolute Pointer API URL. A path prefix such as `/api` is preserved. |
| `tenantId` | Yes | Pointer tenant ID. The SDK URL-encodes it. |
| `authClient` | Yes | Shared token provider exposing `getAccessToken()`. |
| `getCustomerId` | No | Callback evaluated immediately before every API request. Use it for a runtime-selected admin customer. |
| `fetch` | No | Injected Fetch-compatible function. The default browser fetch is bound internally. |

### Customer context and runtime switching

Portal contacts (`r:cportal-user`) must omit `getCustomerId`; the backend derives their customer and does not let them choose another customer.

Admin and developer-admin users (`r:admin` / `r:admin-developer`) should return the currently selected customer:

```ts
let selectedCustomerId: string | undefined;

const assets = new PointerAssetsClient({
  apiBaseUrl,
  tenantId,
  authClient,
  getCustomerId: () => selectedCustomerId,
});

selectedCustomerId = "customer-a";
await assets.refreshSession();

// No client reconstruction is needed. The callback is evaluated per request.
selectedCustomerId = "customer-b";
await assets.refreshSession();
```

A non-empty value is sent only as the URL-encoded `customerId` query parameter. It is never added to create JSON or returned asset metadata. The backend validates the authenticated user's access to the selected customer. Refresh the session after changing customer context so the CDN cookie is scoped to the new customer.

## Authentication, cookies, and credentials

Call `refreshSession()` after authentication, identity, and customer selection are initialized, and again when the returned session approaches expiry or the identity/customer changes:

```ts
const session = await assets.refreshSession();
console.log(session.expiresAt);
```

The SDK deliberately separates credentials:

| Request | Credentials |
|---|---|
| Pointer metadata/session API | `Authorization: Bearer <token>` and `credentials: "include"` |
| Stable Cloud CDN download | `credentials: "include"`; no bearer token |
| Signed GCS upload | Exact backend-issued headers and `credentials: "omit"`; no bearer token |

The API and CDN should be served from the same public origin in production. This gives the HttpOnly cookie a predictable host/path relationship and avoids cross-origin cookie policy differences.

## Upload assets

### Create, then upload

`create()` registers metadata and returns an `AssetUploadTarget`. Pass that target back to `upload()` unchanged.

```ts
import { MAX_UPLOAD_SIZE_BYTES } from "@we-made/pointer-assets-client";

const file = fileInput.files?.[0];
if (!file) throw new Error("Choose a file");
if (file.size > MAX_UPLOAD_SIZE_BYTES) throw new Error("File is too large");

const created = await assets.create({
  name: file.name,
  mimeType: file.type,
  size: file.size,
});

await assets.upload(created.upload, file);

console.log(created.asset.id, created.asset.url);
```

`size` must be an integer from 1 byte through 50 MiB. The upload target is an opaque bearer credential: do not log it, persist it, place it in analytics, or send it to another user. It expires after one hour.

### Associate an asset with an entity

`entityType` and `entityId` are optional but must be provided together. The backend validates entity access and customer ownership.

```ts
const created = await assets.create({
  name: file.name,
  mimeType: file.type,
  size: file.size,
  entityType: "projects",
  entityId: "project-123",
});

await assets.upload(created.upload, file);
```

The public request and asset DTOs do not expose backend relation internals, customer ownership, buckets, or object paths.

### Create and upload in one call

For a browser `File`, the SDK infers `name`, `mimeType`, and `size`:

```ts
const asset = await assets.createAndUpload({
  data: file,
  entityType: "projects",
  entityId: "project-123",
});
```

For `Blob`, `ArrayBuffer`, or a typed-array view, provide any metadata that cannot be inferred:

```ts
const asset = await assets.createAndUpload({
  data: reportArrayBuffer,
  name: "report.pdf",
  mimeType: "application/pdf",
});
```

## Read, download, and delete

### Get metadata

```ts
const asset = await assets.get("asset-id");

console.log({
  id: asset.id,
  name: asset.name,
  url: asset.url,
  mimeType: asset.mimeType,
  size: asset.size,
  createdAt: asset.createdAt,
  updatedAt: asset.updatedAt,
});
```

`asset.url` is a stable, root-relative CDN URL. It is not a signed URL.

### Download bytes

```ts
const blob = await assets.download("asset-id");
const objectUrl = URL.createObjectURL(blob);

try {
  downloadLink.href = objectUrl;
  downloadLink.download = "asset.bin";
  downloadLink.click();
} finally {
  URL.revokeObjectURL(objectUrl);
}
```

`download()` gets fresh metadata, calls `refreshSession()`, then fetches the stable asset URL with the CDN cookie. It does not send the API bearer token to the CDN.

### Delete

```ts
await assets.delete("asset-id");
```

Deletion is idempotent and non-disclosing for missing assets or assets owned by another customer.

## Errors

Failures are thrown rather than returned as successful values:

- `PointerAssetsAuthenticationError`: no access token is available.
- `PointerAssetsApiError`: the Pointer API returned a non-2xx response.
- `PointerAssetsUploadError`: GCS rejected the signed upload.
- `PointerAssetsDownloadError`: the CDN download failed.
- `PointerAssetsNetworkError`: fetch failed before a response arrived.
- `PointerAssetsInvalidResponseError`: a successful response did not match the public contract.
- `PointerAssetsInvalidArgumentError`: caller input failed client-side validation.

```ts
import {
  PointerAssetsApiError,
  PointerAssetsError,
} from "@we-made/pointer-assets-client";

try {
  await assets.get("asset-id");
} catch (error) {
  if (error instanceof PointerAssetsApiError) {
    console.error(error.statusCode, error.backendError, error.requestId);
  } else if (error instanceof PointerAssetsError) {
    console.error(error.code, error.message);
  }
}
```

## Development proxy

The SDK preserves a configured API base path. A Vite development server can proxy API and asset traffic through one browser origin:

```ts
// vite.config.ts
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    proxy: {
      "/api": {
        target: "https://pointer-api.example.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
      "/assets": {
        target: "https://assets.example.com",
        changeOrigin: true,
      },
    },
  },
});
```

```ts
const assets = new PointerAssetsClient({
  apiBaseUrl: `${window.location.origin}/api`,
  tenantId,
  authClient,
});
```

Keep `/api` in `apiBaseUrl`; the SDK appends Pointer routes beneath it. Asset URLs remain root-relative and resolve through `/assets`, never `/api/assets`. Configure the proxy and cookie attributes for your actual development hosts.

## Backend route contract

For `apiBaseUrl = https://portal.example.com/api`, the SDK calls:

| Method | Path | Result |
|---|---|---|
| `POST` | `/api/xrm-db/v1beta1/tenants/{tenantId}/portalAssets:refreshSession` | `{ expiresAt }`; sets `Cloud-CDN-Cookie` |
| `POST` | `/api/xrm-db/v1beta1/tenants/{tenantId}/portalAssets:createUpload` | `{ asset, upload }` |
| `GET` | `/api/xrm-db/v1beta1/tenants/{tenantId}/portalAssets/{assetId}` | `{ asset }` |
| `DELETE` | `/api/xrm-db/v1beta1/tenants/{tenantId}/portalAssets/{assetId}` | `204` |

When `getCustomerId()` returns a value, the SDK adds `?customerId=<encoded>` to each API route. Tenant IDs, asset IDs, and customer IDs are URL-encoded.

Create request:

```ts
interface CreateAssetInput {
  name: string;
  mimeType: string;
  size: number;
  entityType?: string;
  entityId?: string;
}
```

The backend must derive customer ownership, bucket, and object path; issue only authorized, short-lived upload targets; return root-relative stable asset URLs; set the HttpOnly signed cookie; and return standard Hapi/Boom errors for non-2xx API responses.

## Deployment requirements

These are backend and infrastructure responsibilities, not SDK options:

- The portal GCS bucket CORS policy must allow the browser origin to send direct `PUT` requests and the signed `Content-Type` header.
- The Cloud CDN backend bucket must have the configured signed-cookie key.
- The Cloud CDN cache-fill service account must have `roles/storage.objectViewer` on the portal asset bucket.
- `/assets/portal/*` routing must remove/rewrite the public prefix before GCS object lookup.
- The cookie `URLPrefix`, public host, route path, CDN key name/value, and generated GCS object path must describe the same resource namespace.
- API responses that set the cookie must support credentialed browser requests.
- Stable asset URLs must be served by the same public origin as the cookie in production.

The SDK cannot repair a mismatched CDN key, cookie scope, route rewrite, IAM policy, bucket CORS policy, or object path.

## Troubleshooting

### `refreshSession()` succeeds but no cookie appears

- Confirm the response contains `Set-Cookie: Cloud-CDN-Cookie=...`.
- Verify the request used the intended public host and `credentials: "include"`.
- Check cookie `Secure`, domain/host, path, SameSite, expiry, and browser third-party-cookie policy.
- Ensure login and customer context were initialized before refreshing.
- HttpOnly cookies do not appear in `document.cookie`; inspect browser storage/network tools.

### API requests return 404 behind `/api`

Pass the complete base path:

```ts
new PointerAssetsClient({
  apiBaseUrl: "http://localhost:8081/api",
  tenantId,
  authClient,
});
```

Current versions preserve `/api` with or without a trailing slash. Ensure the development proxy strips or forwards the prefix exactly once.

### Browser reports `Failed to execute 'fetch' on 'Window': Illegal invocation`

Current versions bind the ambient browser fetch internally. Do not extract and invoke an older client's unbound fetch implementation. When injecting `fetch`, provide a callable implementation suitable for your runtime.

### Direct upload fails with a CORS error

- Confirm GCS bucket CORS allows the portal origin and `PUT`.
- Allow the backend-issued `Content-Type` header.
- Do not add headers, cookies, or bearer authorization to the signed upload.
- Send the same MIME type used when creating the upload.
- Check that the one-hour upload URL has not expired.

### CDN returns 403 even though `Cloud-CDN-Cookie` exists

- Confirm the cookie path/`URLPrefix` covers the requested stable asset URL.
- Verify the public host and HTTPS scheme match.
- Verify the CDN backend bucket has the same signed-cookie key name and value used by the backend.
- Confirm the cache-fill service account has `roles/storage.objectViewer`.
- Confirm the `/assets/portal/*` rewrite maps to the exact GCS object path.
- Refresh after changing identity or selected customer.

### CDN returns 404

Verify the upload completed, then check the public-prefix rewrite and backend-generated object path. A valid cookie authorizes access but cannot correct a route that points at the wrong GCS object.

## Browser and runtime support

The SDK targets modern browsers with `fetch`, `Headers`, `Response`, `Blob`, `URL`, and optionally `File`. It publishes ESM and CommonJS entry points with TypeScript declarations. Node 18+ can load the package, but the primary runtime is a browser; supply compatible Web APIs or an injected `fetch` in controlled non-browser runtimes.

## Security expectations

- Never place CDN signing keys, cookie key values, service-account credentials, or GCS signing credentials in browser code.
- Treat signed upload URLs as bearer credentials until they expire.
- Do not log or persist upload targets.
- Do not add bearer tokens or cookies to GCS upload requests.
- Do not send API bearer tokens to stable CDN URLs.
- Let the backend select customer ownership, bucket, and object path.
- Portal contacts must not provide arbitrary customer context.
- Keep the package framework independent; integrate it through the application's existing auth and state layers.

## License

MIT
