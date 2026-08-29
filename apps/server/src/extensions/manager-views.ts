import type { ExtensionRegistryDetail } from "@wrapt/extension-contracts";
import type { ExtensionDatabase } from "./database.js";

export function withOpenReview(database: ExtensionDatabase, detail: ExtensionRegistryDetail): ExtensionRegistryDetail {
  if (detail.lifecycle !== "permissions-pending") return detail;
  const review = database.openReview(detail.id);
  if (review === null) return detail;
  return { ...detail, permissionReview: review };
}
