import {
  PointerAssetsDownloadError,
  PointerAssetsNetworkError,
  PointerAssetsUploadError,
} from "../errors";
import type { AssetUploadData, AssetUploadTarget } from "../types";
import { validateUploadTarget } from "./contract";

export async function uploadAsset(
  fetchImplementation: typeof globalThis.fetch,
  target: AssetUploadTarget,
  data: AssetUploadData,
): Promise<void> {
  validateUploadTarget(target);

  let response: Response;
  try {
    response = await fetchImplementation(target.url, {
      method: "PUT",
      headers: target.headers,
      body: data,
      credentials: "omit",
    });
  } catch (cause) {
    throw new PointerAssetsNetworkError("upload", cause);
  }

  if (!response.ok) {
    throw new PointerAssetsUploadError(
      await responseMessage(response, "Upload failed"),
      response.status,
    );
  }
}

export async function downloadAsset(
  fetchImplementation: typeof globalThis.fetch,
  url: URL,
): Promise<Blob> {
  let response: Response;
  try {
    response = await fetchImplementation(url, {
      method: "GET",
      credentials: "include",
    });
  } catch (cause) {
    throw new PointerAssetsNetworkError("download", cause);
  }

  if (!response.ok) {
    throw new PointerAssetsDownloadError(
      await responseMessage(response, "Download failed"),
      response.status,
    );
  }
  return response.blob();
}

async function responseMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const text = await response.text();
    return text.length > 0 ? text : `${fallback} with status ${response.status}`;
  } catch {
    return `${fallback} with status ${response.status}`;
  }
}
