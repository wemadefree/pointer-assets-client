export interface AssetAuthClient {
  getAccessToken(): Promise<string | null | undefined>;
}

export interface PointerAssetsClientOptions {
  apiBaseUrl: string;
  tenantId: string;
  authClient: AssetAuthClient;
  fetch?: typeof globalThis.fetch;
}

export interface Asset {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  size: number;
  createdAt: string;
  updatedAt: string;
}

export interface AssetSession {
  expiresAt: string;
}

export interface CreateAssetInput {
  name: string;
  mimeType: string;
  size: number;
  entityType?: string;
  entityId?: string;
}

export interface AssetUploadTarget {
  method: "PUT";
  url: string;
  headers: Readonly<Record<string, string>>;
  expiresAt: string;
}

export interface CreateAssetResult {
  asset: Asset;
  upload: AssetUploadTarget;
}

export type AssetUploadData = Blob | ArrayBuffer | ArrayBufferView<ArrayBuffer>;

export interface CreateAndUploadInput {
  data: AssetUploadData;
  name?: string;
  mimeType?: string;
  entityType?: string;
  entityId?: string;
}
