import { describe, expect, it } from "vitest";
import { SecretRedactor } from "./secret-redactor.js";
import { hermesV2Policy } from "./policy.js";

describe("R2-H1: überlappende Secrets am unveränderten Eingang", () => {
  const values = ["Q7SyntheticCredential7654321", 'Q7"\\\nSyntheticCredential7654321'];
  const positions = ["prefix", "middle", "suffix"] as const;
  for (const value of values) for (const position of positions) for (const shortFirst of [false, true]) {
    const short = position === "prefix" ? value.slice(0, 2) : position === "suffix" ? value.slice(-2) : value.slice(3, 6);
    it(`${JSON.stringify(value)}: ${position}, kurzer Wert zuerst=${shortFirst}, Raw/JSON und jede Chunkgrenze`, () => {
      const redactor = new SecretRedactor();
      for (const known of shortFirst ? [short, value] : [value, short]) redactor.remember(known);
      for (const variant of new Set([value, JSON.stringify(value).slice(1, -1)])) {
        const input = `before:${variant}:after`;
        expect(redactor.text(input)).toBe("before:***:after");
        expect(redactor.scrub({ echo: input })).toEqual({ echo: "before:***:after" });
        expect(redactor.boundedText(input, 10)).toBe("before:***");
        expect(redactor.boundedText(input, 10, true)).toBe("before:***");
        for (let split = 1; split < input.length; split++) {
          const channel = `${variant.length}:${split}`;
          expect(redactor.stream(channel, input.slice(0, split)) + redactor.stream(channel, input.slice(split))).toBe("before:***:after");
        }
        const channel = `${variant.length}:einzeln`;
        expect([...input].map((char) => redactor.stream(channel, char)).join("")).toBe("before:***:after");
      }
    });
  }
  it.each([false, true])("teilweise überlappende Treffer AB/BC vereinigen sich, Reihenfolge=%s", (reverse) => {
    const redactor = new SecretRedactor();
    for (const known of reverse ? ["BC", "AB"] : ["AB", "BC"]) redactor.remember(known);
    expect(redactor.text("xABCy")).toBe("x***y");
    for (let split = 1; split < 5; split++)
      expect(redactor.stream(String(split), "xABCy".slice(0, split)) + redactor.stream(String(split), "xABCy".slice(split))).toBe("x***y");
  });
  it("lange Präfixe bleiben roh zurückgehalten, auch bei schon vollständig bekanntem kurzem Präfix", () => {
    const redactor = new SecretRedactor({ ...hermesV2Policy, secretBufferBytes: 3 });
    redactor.remember("AB"); redactor.remember("ABCDEF");
    expect(redactor.stream("a", "AB")).toBe("");
    expect(redactor.stream("a", "CD")).toBe("***");
    expect(redactor.stream("a", "EF")).toBe("***");
    redactor.clear(); redactor.remember("AB");
    expect(redactor.stream("a", "AB!")).toBe("***!");
  });
  it("angrenzende Treffer bleiben getrennte Masken und Begrenzungen zählen ihr Wachstum", () => {
    const redactor = new SecretRedactor(); redactor.remember("Q");
    expect(redactor.bounded("QQ tail", 20)).toEqual({ text: "****** tail", truncated: false });
    expect(redactor.bounded("QQ tail", 8)).toEqual({ text: "****** t", truncated: true });
  });
});
