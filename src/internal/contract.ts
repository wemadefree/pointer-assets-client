import { PointerAssetsInvalidResponseError } from "../errors";
import type {
  Asset,
  AssetSession,
  AssetUploadTarget,
  CreateAssetResult,
} from "../types";

interface UnknownRecord {
  [key: string]: unknown;
}

export function tenantBasePath(tenantId: string): string {
  return `/xrm-db/v1beta1/tenants/${encodeURIComponent(tenantId)}`;
}

export function refreshSessionPath(tenantId: string): string {
  return `${tenantBasePath(tenantId)}/portalAssets:refreshSession`;
}

export function createUploadPath(tenantId: string): string {
  return `${tenantBasePath(tenantId)}/portalAssets:createUpload`;
}

export function assetPath(tenantId: string, assetId: string): string {
  return `${tenantBasePath(tenantId)}/portalAssets/${encodeURIComponent(assetId)}`;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isIsoDate(value: unknown): value is string {
  return (
    isNonEmptyString(value) &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function parseAsset(value: unknown, operation: string): Asset {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.name) ||
    !isNonEmptyString(value.url) ||
    !value.url.startsWith("/") ||
    !isNonEmptyString(value.mimeType) ||
    typeof value.size !== "number" ||
    !Number.isSafeInteger(value.size) ||
    value.size < 0 ||
    !isIsoDate(value.createdAt) ||
    !isIsoDate(value.updatedAt)
  ) {
    throw new PointerAssetsInvalidResponseError(operation);
  }

  return {
    id: value.id,
    name: value.name,
    url: value.url,
    mimeType: value.mimeType,
    size: value.size,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function parseUploadTarget(value: unknown, operation: string): AssetUploadTarget {
  if (
    !isRecord(value) ||
    value.method !== "PUT" ||
    !isNonEmptyString(value.url) ||
    !isRecord(value.headers) ||
    !isIsoDate(value.expiresAt)
  ) {
    throw new PointerAssetsInvalidResponseError(operation);
  }

  const headers = Object.entries(value.headers);
  if (
    headers.length !== 1 ||
    headers[0]?.[0] !== "content-type" ||
    !isNonEmptyString(headers[0][1])
  ) {
    throw new PointerAssetsInvalidResponseError(operation);
  }

  let uploadUrl: URL;
  try {
    uploadUrl = new URL(value.url);
  } catch {
    throw new PointerAssetsInvalidResponseError(operation, "Upload URL is invalid");
  }

  if (uploadUrl.protocol !== "https:") {
    throw new PointerAssetsInvalidResponseError(operation, "Upload URL must use HTTPS");
  }

  return {
    method: "PUT",
    url: value.url,
    headers: { "content-type": headers[0][1] },
    expiresAt: value.expiresAt,
  };
}

export function parseAssetSession(value: unknown): AssetSession {
  if (!isRecord(value) || !isIsoDate(value.expiresAt)) {
    throw new PointerAssetsInvalidResponseError("refreshSession");
  }
  return { expiresAt: value.expiresAt };
}

export function parseCreateAssetResult(value: unknown): CreateAssetResult {
  if (!isRecord(value)) {
    throw new PointerAssetsInvalidResponseError("create");
  }
  return {
    asset: parseAsset(value.asset, "create"),
    upload: parseUploadTarget(value.upload, "create"),
  };
}

export function parseAssetResponse(value: unknown): Asset {
  if (!isRecord(value)) {
    throw new PointerAssetsInvalidResponseError("get");
  }
  return parseAsset(value.asset, "get");
}

export function validateUploadTarget(target: AssetUploadTarget): void {
  parseUploadTarget(target, "upload");
}
