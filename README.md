# @we-made/pointer-assets-client

Framework-independent browser SDK for uploading and downloading Pointer/P2 portal assets.

Uploads use short-lived GCS `PUT` URLs authorized by the Pointer backend. Downloads use stable Cloud CDN URLs protected by an HttpOnly signed cookie. This package never creates signed download URLs and never accepts bucket names or object paths.

## Install

```sh
npm install @we-made/pointer-assets-client @we-made/firebase-auth-client
```

## Usage

```ts
import { FirebaseAuthClient } from "@we-made/firebase-auth-client";
import { PointerAssetsClient } from "@we-made/pointer-assets-client";

const apiBaseUrl = "https://pointer.example.com";

const authClient = new FirebaseAuthClient(
  apiBaseUrl,
  import.meta.env.VITE_POINTER_PORTAL_CONFIG_KEY,
);

await authClient.build();

const assets = new PointerAssetsClient({
  apiBaseUrl,
  tenantId: "your-pointer-tenant-id",
  authClient,
});

const file = new File(["hello"], "hello.txt", { type: "text/plain" });
const asset = await assets.createAndUpload({ data: file });

const downloaded = await assets.download(asset.id);
```

`FirebaseAuthClient` is not a runtime dependency. Any auth client with this structural interface can be used:

```ts
interface AssetAuthClient {
  getAccessToken(): Promise<string | null | undefined>;
}
```

The authenticated user must have the Pointer `r:cportal-user` role.

## API

### `new PointerAssetsClient(options)`

```ts
const assets = new PointerAssetsClient({
  apiBaseUrl: "https://pointer.example.com",
  tenantId: "tenant-id",
  authClient,
});
```

Options:

- `apiBaseUrl`: Pointer API origin/base URL.
- `tenantId`: Pointer tenant ID. It is URL-encoded by the SDK.
- `authClient`: structural auth client exposing `getAccessToken()`.
- `fetch`: optional `fetch` implementation, primarily for controlled runtimes and tests.

### `refreshSession()`

```ts
const session = await assets.refreshSession();
console.log(session.expiresAt);
```

Requests a fresh HttpOnly Cloud CDN cookie using `credentials: "include"`.

### `create(input)`

```ts
const created = await assets.create({
  name: file.name,
  mimeType: file.type,
  size: file.size,
});

await assets.upload(created.upload, file);
```

Returns asset metadata and an opaque, short-lived upload target.

### `upload(target, data)`

Uploads a `Blob`, `ArrayBuffer`, or typed-array view directly to the backend-authorized URL. The SDK sends exactly the signed headers returned by the backend, uses `credentials: "omit"`, and never forwards the Pointer access token.

### `createAndUpload(input)`

```ts
const asset = await assets.createAndUpload({
  data: file,
});
```

For a browser `File`, `name`, `mimeType`, and `size` are inferred. For other binary values, provide `name` and `mimeType`:

```ts
const asset = await assets.createAndUpload({
  data: arrayBuffer,
  name: "report.pdf",
  mimeType: "application/pdf",
});
```

### `get(assetId)`

Returns metadata for an owned asset.

### `download(assetId)`

Gets current metadata, refreshes the CDN cookie, and downloads the stable relative asset URL with `credentials: "include"`. The bearer token is not sent to the CDN URL.

### `delete(assetId)`

Deletes the asset. Backend deletion is idempotent and does not disclose whether an asset belongs to another customer.

## Errors

Failures are thrown, never returned as successful values:

- `PointerAssetsAuthenticationError`: no access token is available.
- `PointerAssetsApiError`: a Pointer API request returned a non-2xx response.
- `PointerAssetsUploadError`: the signed GCS upload failed.
- `PointerAssetsDownloadError`: the CDN download failed.
- `PointerAssetsNetworkError`: `fetch` failed before receiving a response.
- `PointerAssetsInvalidResponseError`: a successful backend response did not match the contract.

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

## Browser and server configuration

- The API and CDN must allow the browser origin and credentialed requests.
- Cookie issuance and CDN downloads require `credentials: "include"`.
- The Cloud CDN signed cookie is HttpOnly and path-scoped by the backend.
- Direct uploads require GCS CORS to allow `PUT` and the backend-issued `content-type` header.
- The package uses standard browser `fetch`, `Blob`, `URL`, and `File` APIs.

## Security model

- Ownership, customer, bucket, and object path are resolved by the backend.
- The public SDK accepts no bucket or object-path controls.
- Upload URLs are short-lived and backend-authorized.
- Asset `url` values are stable same-origin relative CDN URLs, not signed URLs.
- API bearer credentials are never sent to upload or CDN requests.

## License

MIT
