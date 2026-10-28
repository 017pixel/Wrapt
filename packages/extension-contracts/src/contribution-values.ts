import { z } from "zod";
import { contributionIdSchema } from "./ids.js";

export const CONTRIBUTION_TITLE_MAX_LENGTH = 120;
export const CONTRIBUTION_DESCRIPTION_MAX_LENGTH = 500;
export const CONTRIBUTION_CATEGORY_MAX_LENGTH = 80;
export const COMMAND_CONTRIBUTIONS_MAX_COUNT = 256;
export const PAGE_CONTRIBUTIONS_MAX_COUNT = 128;
export const ROUTE_CONTRIBUTIONS_MAX_COUNT = 128;
export const NAVIGATION_CONTRIBUTIONS_MAX_COUNT = 256;
export const DASHBOARD_CONTRIBUTIONS_MAX_COUNT = 256;
export const ROUTE_ALIASES_MAX_COUNT = 16;
export const ROUTE_PATH_MAX_LENGTH = 256;
export const NAVIGATION_ORDER_MIN = 0;
export const NAVIGATION_ORDER_MAX = 10_000;
export const DASHBOARD_ORDER_MIN = 0;
export const DASHBOARD_ORDER_MAX = 10_000;
export const DASHBOARD_REFRESH_INTERVAL_MIN_MS = 1_000;
export const DASHBOARD_REFRESH_INTERVAL_MAX_MS = 600_000;

export function containsControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
  });
}

function contributionTextSchema(maxLength: number, fieldName: string) {
  return z
    .string()
    .min(1)
    .max(maxLength)
    .refine(
      (value) => value === value.trim() && !containsControlCharacter(value),
      `${fieldName} darf keine äußeren Leerzeichen oder Steuerzeichen enthalten.`,
    );
}

export const contributionTitleSchema = contributionTextSchema(
  CONTRIBUTION_TITLE_MAX_LENGTH,
  "Der Titel",
);
export const contributionDescriptionSchema = contributionTextSchema(
  CONTRIBUTION_DESCRIPTION_MAX_LENGTH,
  "Die Beschreibung",
);
export const contributionCategorySchema = contributionTextSchema(
  CONTRIBUTION_CATEGORY_MAX_LENGTH,
  "Die Kategorie",
);

// `extension` verwendet das sichere lokale Manifest-Icon. Eine namespaced ID wird später
// durch den UI-Entrypoint gegen die kontrollierte Icon Registry aufgelöst.
export const contributionIconReferenceSchema = z.union([
  z.literal("extension"),
  contributionIdSchema,
]);
export type ContributionIconReference = z.infer<
  typeof contributionIconReferenceSchema
>;
