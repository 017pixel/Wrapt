import { DASHBOARD_CONTRIBUTIONS_MAX_COUNT, DASHBOARD_ORDER_MIN, DASHBOARD_ORDER_MAX, DASHBOARD_REFRESH_INTERVAL_MIN_MS, DASHBOARD_REFRESH_INTERVAL_MAX_MS, contributionTitleSchema, contributionDescriptionSchema, contributionIconReferenceSchema } from "./contribution-values.js";
import { z } from "zod";
import { contributionIdSchema } from "./ids.js";

export const dashboardContributionKinds = [
  "metric",
  "status",
  "card",
  "quick-action",
  "list",
  "chart",
  "error-indicator",
  "health-indicator",
] as const;
export const dashboardContributionKindSchema = z.enum(
  dashboardContributionKinds,
);
export type DashboardContributionKind = z.infer<
  typeof dashboardContributionKindSchema
>;

export const dashboardContributionSizes = [
  "small",
  "medium",
  "large",
  "full",
] as const;
export const dashboardContributionSizeSchema = z.enum(
  dashboardContributionSizes,
);
export type DashboardContributionSize = z.infer<
  typeof dashboardContributionSizeSchema
>;

export const dashboardMetricFormats = [
  "number",
  "percentage",
  "duration",
  "bytes",
  "text",
] as const;
export const dashboardMetricFormatSchema = z.enum(dashboardMetricFormats);
export type DashboardMetricFormat = z.infer<typeof dashboardMetricFormatSchema>;

export const dashboardChartTypes = ["line", "bar", "area", "donut"] as const;
export const dashboardChartTypeSchema = z.enum(dashboardChartTypes);
export type DashboardChartType = z.infer<typeof dashboardChartTypeSchema>;

export const dashboardRefreshSchema = z.discriminatedUnion("mode", [
  z.strictObject({ mode: z.literal("on-demand") }),
  z.strictObject({
    mode: z.literal("interval"),
    intervalMilliseconds: z
      .number()
      .int()
      .min(DASHBOARD_REFRESH_INTERVAL_MIN_MS)
      .max(DASHBOARD_REFRESH_INTERVAL_MAX_MS),
  }),
  z.strictObject({ mode: z.literal("realtime") }),
]);

export type DashboardRefresh = z.infer<typeof dashboardRefreshSchema>;

const dashboardContributionBaseShape = {
  id: contributionIdSchema,
  title: contributionTitleSchema,
  description: contributionDescriptionSchema.optional(),
  icon: contributionIconReferenceSchema.optional(),
  defaultSize: dashboardContributionSizeSchema.default("medium"),
  order: z.number().int().min(DASHBOARD_ORDER_MIN).max(DASHBOARD_ORDER_MAX),
  projectContext: z.boolean().default(false),
  visibleByDefault: z.boolean().default(true),
};

const dashboardProviderShape = {
  provider: contributionIdSchema,
  refresh: dashboardRefreshSchema.default({ mode: "on-demand" }),
};

export const dashboardMetricContributionSchema = z.strictObject({
  ...dashboardContributionBaseShape,
  ...dashboardProviderShape,
  kind: z.literal("metric"),
  format: dashboardMetricFormatSchema.default("number"),
});

export const dashboardStatusContributionSchema = z.strictObject({
  ...dashboardContributionBaseShape,
  ...dashboardProviderShape,
  kind: z.literal("status"),
});

export const dashboardCardContributionSchema = z.strictObject({
  ...dashboardContributionBaseShape,
  ...dashboardProviderShape,
  kind: z.literal("card"),
});

export const dashboardQuickActionContributionSchema = z.strictObject({
  ...dashboardContributionBaseShape,
  kind: z.literal("quick-action"),
  commandId: contributionIdSchema,
});

export const dashboardListContributionSchema = z.strictObject({
  ...dashboardContributionBaseShape,
  ...dashboardProviderShape,
  kind: z.literal("list"),
});

export const dashboardChartContributionSchema = z.strictObject({
  ...dashboardContributionBaseShape,
  ...dashboardProviderShape,
  kind: z.literal("chart"),
  chartType: dashboardChartTypeSchema,
});

export const dashboardErrorIndicatorContributionSchema = z.strictObject({
  ...dashboardContributionBaseShape,
  ...dashboardProviderShape,
  kind: z.literal("error-indicator"),
});

export const dashboardHealthIndicatorContributionSchema = z.strictObject({
  ...dashboardContributionBaseShape,
  ...dashboardProviderShape,
  kind: z.literal("health-indicator"),
});

export const dashboardContributionSchema = z.discriminatedUnion("kind", [
  dashboardMetricContributionSchema,
  dashboardStatusContributionSchema,
  dashboardCardContributionSchema,
  dashboardQuickActionContributionSchema,
  dashboardListContributionSchema,
  dashboardChartContributionSchema,
  dashboardErrorIndicatorContributionSchema,
  dashboardHealthIndicatorContributionSchema,
]);

export type DashboardContribution = z.infer<typeof dashboardContributionSchema>;

export const dashboardContributionsSchema = z
  .array(dashboardContributionSchema)
  .min(1)
  .max(DASHBOARD_CONTRIBUTIONS_MAX_COUNT)
  .superRefine((items, context) => {
    const seen = new Set<string>();
    for (const [index, item] of items.entries()) {
      if (seen.has(item.id)) {
        context.addIssue({
          code: "custom",
          message: "Jede Dashboard Contribution ID darf nur einmal vorkommen.",
          path: [index, "id"],
        });
      }
      seen.add(item.id);
    }
  })
  .meta({ uniqueItems: true });

export type DashboardContributions = z.infer<
  typeof dashboardContributionsSchema
>;
