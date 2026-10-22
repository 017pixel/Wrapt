import { describe, expect, it } from "vitest";
import { SecretRedactor } from "./secret-redactor.js";

describe("R3-H1: schon gekürzte Rawpräfixe vor Kurzmasken schützen", () => {
  for (const secret of ["R3SyntheticCredential87654321", 'R3"\\\nÄCredential87654321']) {
    for (const position of ["prefix", "middle", "suffix"] as const) for (const reverse of [false, true]) {
      it(`${JSON.stringify(secret)}: ${position}, lang zuerst=${reverse}, Zeichen und UTF8`, () => {
        const short = position === "prefix" ? secret.slice(0, 2) : position === "middle" ? secret.slice(7, 9) : secret.slice(-3, -1);
        for (const variant of new Set([secret, JSON.stringify(secret).slice(1, -1)])) for (const bytes of [false, true]) {
          const redactor = new SecretRedactor(); const partial = variant.slice(0, -1);
          const prefix = bytes ? "ä".repeat(100) : "v".repeat(200);
          const limit = bytes ? Buffer.byteLength(prefix + partial) : prefix.length + partial.length;
          const cached = redactor.boundedText(prefix + variant, limit, bytes);
          expect(cached).toBe(prefix + partial);
          for (const known of reverse ? [secret, short] : [short, secret]) redactor.remember(known);
          expect(redactor.boundedText(cached, limit, bytes)).toBe(prefix + "***");
        }
      });
    }
  }
});
