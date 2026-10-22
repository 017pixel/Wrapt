import {
  saveUiSettingsRequestSchema,
  uiSettingsDocumentSchema,
  type SaveUiSettingsRequest,
  type UiSettingsDocument,
} from "@wrapt/contracts";
import { mutate, request } from "./transport.js";

export const settingsApi = {
  uiSettings: (signal?: AbortSignal): Promise<UiSettingsDocument> =>
    request("/settings/ui", uiSettingsDocumentSchema, signal),
  saveUiSettings: (body: SaveUiSettingsRequest): Promise<UiSettingsDocument | undefined> =>
    mutate("/settings/ui", "PUT", uiSettingsDocumentSchema, saveUiSettingsRequestSchema.parse(body)),
};
