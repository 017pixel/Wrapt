import { z } from "zod";

export const pushEndpointSchema = z.url().max(2_048).refine(
  (value) => new URL(value).protocol === "https:",
  "Push-Endpunkte müssen HTTPS verwenden.",
);
