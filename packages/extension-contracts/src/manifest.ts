import type { z } from "zod";
import { extensionManifestBaseSchema } from "./manifest-base.js";
export * from "./manifest-base.js";
import { validateActivation } from "./manifest-activation-validation.js";
import { validateIdentities } from "./manifest-identities-validation.js";
import { validateNavigation } from "./manifest-navigation-validation.js";
import { validateMenus } from "./manifest-menus-validation.js";
import { validateTopbarFiles } from "./manifest-topbar-files-validation.js";
import { validateProviders } from "./manifest-providers-validation.js";
import { validateRequirements } from "./manifest-requirements-validation.js";
import { validateDependencies } from "./manifest-dependencies-validation.js";

export const extensionManifestV1Schema = extensionManifestBaseSchema
.superRefine(validateActivation)
.superRefine(validateIdentities)
.superRefine(validateNavigation)
.superRefine(validateMenus)
.superRefine(validateTopbarFiles)
.superRefine(validateProviders)
.superRefine(validateRequirements)
.superRefine(validateDependencies);
export type ExtensionManifestV1 = z.infer<typeof extensionManifestV1Schema>;
