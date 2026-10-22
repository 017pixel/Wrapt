import { expect, it } from "vitest";
import { wraptQueries } from "./queryOptions.js";

it("zeigt beim Zeitraumwechsel keine Auswertung des vorherigen Nutzungsfilters", () => {
  expect(wraptQueries.usageDashboard("7d").placeholderData).toBeUndefined();
});
