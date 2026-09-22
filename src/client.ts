import { PointerAssetsInvalidArgumentError } from "./errors";
import { MAX_UPLOAD_SIZE_BYTES } from "./constants";
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
  private readonly getCustomerId: (() => string | null | undefined) | undefined;
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
    this.getCustomerId = options.getCustomerId;
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
      this.apiPath(refreshSessionPath(this.tenantId)),
    );
    return parseAssetSession(response);
  }

  async create(input: CreateAssetInput): Promise<CreateAssetResult> {
    validateCreateInput(input);
    const response = await this.http.requestJson(
      "create",
      "POST",
      this.apiPath(createUploadPath(this.tenantId)),
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
      this.apiPath(assetPath(this.tenantId, assetId)),
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
      this.apiPath(assetPath(this.tenantId, assetId)),
    );
  }

  private apiPath(path: string): string {
    const customerId = this.getCustomerId?.();
    return customerId
      ? `${path}?customerId=${encodeURIComponent(customerId)}`
      : path;
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
  if (
    !Number.isSafeInteger(input.size) ||
    input.size < 1 ||
    input.size > MAX_UPLOAD_SIZE_BYTES
  ) {
    throw new PointerAssetsInvalidArgumentError(
      `size must be an integer between 1 and ${MAX_UPLOAD_SIZE_BYTES} bytes`,
    );
  }
  if (
    (input.entityType === undefined) !==
    (input.entityId === undefined)
  ) {
    throw new PointerAssetsInvalidArgumentError(
      "entityType and entityId must be supplied together",
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
  return {
    name,
    mimeType,
    size,
    ...(input.entityType === undefined ? {} : { entityType: input.entityType }),
    ...(input.entityId === undefined ? {} : { entityId: input.entityId }),
  };
}

function assetDataSize(data: AssetUploadData): number {
  if (data instanceof Blob) {
    return data.size;
  }
  return data.byteLength;
}
