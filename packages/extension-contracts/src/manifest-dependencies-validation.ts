import type { z } from "zod";
import type { ExtensionManifestInput } from "./manifest-base.js";

export function validateDependencies(manifest: ExtensionManifestInput, context: z.RefinementCtx): void {
    const requiredDependencies = manifest.extensionDependencies ?? {};
    const optionalDependencies = manifest.optionalExtensionDependencies ?? {};

    if (Object.hasOwn(requiredDependencies, manifest.id)) {
      context.addIssue({
        code: "custom",
        message: "Eine Extension darf nicht von sich selbst abhängen.",
        path: ["extensionDependencies", manifest.id],
      });
    }
    if (Object.hasOwn(optionalDependencies, manifest.id)) {
      context.addIssue({
        code: "custom",
        message:
          "Eine Extension darf sich nicht selbst als optionale Abhängigkeit deklarieren.",
        path: ["optionalExtensionDependencies", manifest.id],
      });
    }

    for (const dependencyId of Object.keys(optionalDependencies)) {
      if (!Object.hasOwn(requiredDependencies, dependencyId)) continue;
      context.addIssue({
        code: "custom",
        message:
          "Eine Extension darf nicht zugleich Pflicht- und optionale Abhängigkeit sein.",
        path: ["optionalExtensionDependencies", dependencyId],
      });
    }

    for (const [index, conflict] of (
      manifest.extensionConflicts ?? []
    ).entries()) {
      if (conflict.id === manifest.id) {
        context.addIssue({
          code: "custom",
          message:
            "Eine Extension darf keinen Konflikt mit sich selbst deklarieren.",
          path: ["extensionConflicts", index, "id"],
        });
      }
      if (
        !Object.hasOwn(requiredDependencies, conflict.id) &&
        !Object.hasOwn(optionalDependencies, conflict.id)
      ) {
        continue;
      }
      context.addIssue({
        code: "custom",
        message:
          "Eine Abhängigkeit darf nicht zugleich als Konflikt deklariert sein.",
        path: ["extensionConflicts", index, "id"],
      });
    }

}
