import { mediaAssetResponseSchema, type MediaAsset } from "@wrapt/contracts";
import { workbenchAccess } from "../workbenchAccess.js";
import { ApiClientError, errorPayload, requestSignal, WRAPT_SYNC_VERSION } from "./transport.js";

async function uploadMedia(file: File): Promise<MediaAsset> {
  workbenchAccess.assertAllowed();
  const form = new FormData();
  form.append("file", file, file.name);
  const response = await fetch("/api/v1/media", {
    method: "POST",
    credentials: "same-origin",
    signal: requestSignal(),
    headers: { Accept: "application/json", "X-Wrapt-Sync-Version": WRAPT_SYNC_VERSION },
    body: form,
  });
  if (!response.ok) {
    const payload = await errorPayload(response);
    const error = new ApiClientError(
      response.status,
      payload?.error.code ?? "MEDIA_UPLOAD_FAILED",
      payload?.error.message ?? "Die Datei konnte nicht hochgeladen werden.",
      payload?.error.requestId ?? response.headers.get("x-request-id"),
      payload?.error.retryable ?? false,
      payload?.error.details ?? null,
    );
    workbenchAccess.report(error);
    throw error;
  }
  return mediaAssetResponseSchema.parse(await response.json()).asset;
}

export const mediaApi = {
  uploadMedia,
  mediaUrl: (assetId: string) => `/api/v1/media/${encodeURIComponent(assetId)}`,
};
