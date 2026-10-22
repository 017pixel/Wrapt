import type { HermesV2SummaryPage } from "@wrapt/contracts/hermes-v2";
import { organizationPolicy } from "./organization-policy";

/** Weitere Core-Rows existieren, sind jenseits dieser Grenze aber nicht abrufbar. */
export function isCatalogDepthEnd(page: HermesV2SummaryPage): boolean {
  return page.coverage === "partial" && page.offset + page.limit >= organizationPolicy.maxCatalogDepth;
}
