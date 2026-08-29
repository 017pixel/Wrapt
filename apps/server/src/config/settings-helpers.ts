import { z } from "zod";

export const integerFromEnvironment = (fallback: number) =>
  z.preprocess(
    (value) => (value === undefined || value === "" ? fallback : Number(value)),
    z.number().int().positive(),
  );

export const boundedIntegerFromEnvironment = (fallback: number, minimum: number, maximum: number) =>
  z.preprocess(
    (value) => (value === undefined || value === "" ? fallback : Number(value)),
    z.number().int().min(minimum).max(maximum),
  );

export const booleanFromEnvironment = (fallback: boolean) =>
  z.preprocess(
    (value) => (value === undefined || value === "" ? fallback : value === "true"),
    z.boolean(),
  );

export const profileHomesFromEnvironment = z.preprocess(
  (value) => (typeof value === "string" && value.length > 0 ? value.split(",").map((path) => path.trim()).filter(Boolean) : []),
  z.array(z.string().startsWith("/")),
);

export const commaSeparatedValues = z.preprocess(
  (value) => (typeof value === "string" && value.length > 0 ? value.split(",").map((item) => item.trim()).filter(Boolean) : []),
  z.array(z.string().min(1)),
);

export const localhostUrl = z.url().refine((value) => {
  const hostname = new URL(value).hostname;
  return hostname === "127.0.0.1" || hostname === "::1" || hostname === "localhost";
}, "CODEXBAR_BASE_URL muss auf einen lokalen Host zeigen.");
