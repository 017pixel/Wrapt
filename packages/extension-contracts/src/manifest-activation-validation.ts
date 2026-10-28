import type { z } from "zod";
import type { ExtensionManifestInput } from "./manifest-base.js";
import { activationEventBelongsToExtension, activationEventContributionId } from "./activation-events.js";

export function validateActivation(manifest: ExtensionManifestInput, context: z.RefinementCtx): void {

    const commandIds = new Set(
      (manifest.contributes.commands ?? []).map((command) => command.id),
    );
    const routeIds = new Set(
      (manifest.contributes.routes ?? []).map((route) => route.id),
    );
    const scheduledJobIds = new Set(
      (manifest.contributes.scheduledJobs ?? []).map((job) => job.id),
    );

    for (const [index, event] of manifest.activationEvents.entries()) {
      if (!activationEventBelongsToExtension(manifest.id, event)) {
        context.addIssue({
          code: "custom",
          message:
            "Referenzierte Contributions müssen zur deklarierenden Extension gehören.",
          path: ["activationEvents", index],
        });
        continue;
      }

      const contributionId = activationEventContributionId(event);
      if (
        event.startsWith("onCommand:") &&
        (contributionId === null || !commandIds.has(contributionId))
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Ein onCommand Activation Event benötigt eine deklarierte Command Contribution.",
          path: ["activationEvents", index],
        });
      }
      if (
        event.startsWith("onRoute:") &&
        (contributionId === null || !routeIds.has(contributionId))
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Ein onRoute Activation Event benötigt eine deklarierte Route Contribution.",
          path: ["activationEvents", index],
        });
      }
      if (
        event.startsWith("onSchedule:") &&
        (contributionId === null || !scheduledJobIds.has(contributionId))
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Ein onSchedule Activation Event benötigt eine deklarierte Scheduled Job Contribution.",
          path: ["activationEvents", index],
        });
      }
    }


}
