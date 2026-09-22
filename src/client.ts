import { PointerAssetsInvalidArgumentError } from "./errors";
import {
  assetPath,
  createUploadPath,
  parseAssetResponse,
  parseAssetSession,
  parseCreateAssetResult,
  refreshSessionPath,
} from "./internal/contract";
import { ApiHttpClient } from "./internal/http";
import { downloadAsset, uploadAsset } from "./internal/upload";
import type {
  Asset,
  AssetSession,
  AssetUploadData,
  AssetUploadTarget,
  CreateAndUploadInput,
  CreateAssetInput,
  CreateAssetResult,
  PointerAssetsClientOptions,
} from "./types";

export class PointerAssetsClient {
  private readonly tenantId: string;
  private readonly fetch: typeof globalThis.fetch;
  private readonly http: ApiHttpClient;

  constructor(options: PointerAssetsClientOptions) {
    if (!options.tenantId) {
      throw new PointerAssetsInvalidArgumentError("tenantId is required");
    }
    const fetchImplementation = options.fetch ?? globalThis.fetch;
    if (typeof fetchImplementation !== "function") {
      throw new PointerAssetsInvalidArgumentError(
        "A fetch implementation is required",
      );
    }

    this.tenantId = options.tenantId;
    this.fetch = fetchImplementation;
    this.http = new ApiHttpClient(
      options.apiBaseUrl,
      options.authClient,
      fetchImplementation,
    );
  }

  async refreshSession(): Promise<AssetSession> {
    const response = await this.http.requestJson(
      "refreshSession",
      "POST",
      refreshSessionPath(this.tenantId),
    );
    return parseAssetSession(response);
  }

  async create(input: CreateAssetInput): Promise<CreateAssetResult> {
    validateCreateInput(input);
    const response = await this.http.requestJson(
      "create",
      "POST",
      createUploadPath(this.tenantId),
      input,
    );
    return parseCreateAssetResult(response);
  }

  async upload(target: AssetUploadTarget, data: AssetUploadData): Promise<void> {
    await uploadAsset(this.fetch, target, data);
  }

  async createAndUpload(input: CreateAndUploadInput): Promise<Asset> {
    const createInput = createInputFromData(input);
    const created = await this.create(createInput);
    await this.upload(created.upload, input.data);
    return created.asset;
  }

  async get(assetId: string): Promise<Asset> {
    validateAssetId(assetId);
    const response = await this.http.requestJson(
      "get",
      "GET",
      assetPath(this.tenantId, assetId),
    );
    return parseAssetResponse(response);
  }

  async download(assetId: string): Promise<Blob> {
    const asset = await this.get(assetId);
    await this.refreshSession();
    return downloadAsset(this.fetch, this.http.resolveAssetUrl(asset.url));
  }

  async delete(assetId: string): Promise<void> {
    validateAssetId(assetId);
    await this.http.requestDelete(
      "delete",
      assetPath(this.tenantId, assetId),
    );
  }
}

function validateAssetId(assetId: string): void {
  if (!assetId) {
    throw new PointerAssetsInvalidArgumentError("assetId is required");
  }
}

function validateCreateInput(input: CreateAssetInput): void {
  if (!input.name) {
    throw new PointerAssetsInvalidArgumentError("name is required");
  }
  if (!input.mimeType) {
    throw new PointerAssetsInvalidArgumentError("mimeType is required");
  }
  if (!Number.isSafeInteger(input.size) || input.size < 0) {
    throw new PointerAssetsInvalidArgumentError(
      "size must be a non-negative safe integer",
    );
  }
}

function createInputFromData(input: CreateAndUploadInput): CreateAssetInput {
  const file =
    typeof File !== "undefined" && input.data instanceof File ? input.data : undefined;
  const blob = input.data instanceof Blob ? input.data : undefined;
  const name = input.name ?? file?.name;
  const mimeType = input.mimeType ?? blob?.type;

  if (!name) {
    throw new PointerAssetsInvalidArgumentError(
      "name is required when data is not a File",
    );
  }
  if (!mimeType) {
    throw new PointerAssetsInvalidArgumentError(
      "mimeType is required when binary data has no type",
    );
  }

  const size = assetDataSize(input.data);
  return { name, mimeType, size };
}

function assetDataSize(data: AssetUploadData): number {
  if (data instanceof Blob) {
    return data.size;
  }
  return data.byteLength;
}
