import { describe, expect, it } from "vitest";
import { SecretRedactor } from "./secret-redactor.js";
import { hermesV2Policy } from "./policy.js";
import { credentialRanges } from "./redaction-ranges.js";
import { protectedText } from "./normalize-values.js";

const overlaps = [
  ["ABAB", "ABABABAB"],
  ["ABABA", "ABABABABA"],
  ["abcab", "abcabcab"],
  ["ABCDAB", "ABCDABCDAB"],
  ["AABAA", "AABAABAA"],
  ["AAAA", "AAAAAAA"],
  ["😀😀", "😀😀😀"],
] as const;

describe("Native Volltreffersuche mit unveränderten Rohpräfixbelegen", () => {
  it("nimmt am gleichen Start den längsten Wert, unabhängig von der Registrierung", () => {
    for (const values of [["a", "abc", "bc"], ["bc", "abc", "a"]]) {
      const redactor = new SecretRedactor();
      for (const value of values) redactor.remember(value);
      expect(redactor.bounded("LEFT[abcabc]END!", 100)).toEqual({ text: "LEFT[******]END!", truncated: false });
      expect(redactor.bounded("LEFT[ab", 100).text).toBe("LEFT[***");
    }
  });

  it.each(["a+b", "a.b", "a[b]", "a(b)", "a{b}", "a|b", "a^b$", "a\\b", "a?b*", "a/b", 'a"\nb'])(
    "behandelt Regexzeichen und JSONvarianten von %s wörtlich, auch in Streams", (secret) => {
      const redactor = new SecretRedactor(); redactor.remember("a"); redactor.remember(secret);
      for (const wire of new Set([secret, JSON.stringify(secret).slice(1, -1)])) {
        const raw = `LEFT[${wire}]END!`;
        expect(redactor.bounded(raw, 100).text).toBe("LEFT[***]END!");
        for (let split = 1; split < raw.length; split++) {
          expect(redactor.stream(String(split), raw.slice(0, split))
            + redactor.stream(String(split), raw.slice(split))).toBe("LEFT[***]END!");
        }
      }
    },
  );

  it("vereinigt UTF16-Treffer, auch wenn ein kürzerer Wert eine Surrogathälfte ist", () => {
    for (const values of [["\ud83d", "😀", "😀a", "a😀"], ["a😀", "😀a", "😀", "\ud83d"]]) {
      const redactor = new SecretRedactor();
      for (const value of values) redactor.remember(value);
      const raw = "LEFT[😀a😀]END!";
      expect(redactor.bounded(raw, 100).text).toBe("LEFT[***]END!");
      for (let split = 1; split < raw.length; split++) {
        expect(redactor.stream(String(split), raw.slice(0, split))
          + redactor.stream(String(split), raw.slice(split))).toBe("LEFT[***]END!");
      }
    }
  });

  it("vereinigt kurze und lange Suchpfade auch genau an der Optimierungsgrenze", () => {
    for (const length of [64, 65]) for (const reverse of [false, true]) {
      const long = "a".repeat(length - 1) + "Z";
      const redactor = new SecretRedactor();
      for (const value of reverse ? [long, "a", "ZZ"] : ["a", "ZZ", long]) redactor.remember(value);
      expect(redactor.bounded(long.repeat(2) + " PUBLIC-END!", 100)).toEqual({ text: "****** PUBLIC-END!", truncated: false });
      expect(redactor.stream("mixed", long.slice(0, -1))).toBe("");
      expect(redactor.stream("mixed", "Z PUBLIC-END!")).toBe("*** PUBLIC-END!");
    }
  });

  it.each(overlaps)("vereinigt alle Eigenüberlappungen von %s, auch über jede Chunkteilung", (secret, body) => {
    const input = `left[${body}]right!`;
    const redactor = new SecretRedactor(); redactor.remember(secret);
    expect(redactor.text(input)).toBe("left[***]right!");
    expect(redactor.bounded(input, 100)).toEqual({ text: "left[***]right!", truncated: false });
    for (let split = 1; split < input.length; split++) {
      const channel = String(split);
      expect(redactor.stream(channel, input.slice(0, split)) + redactor.stream(channel, input.slice(split))).toBe("left[***]right!");
    }
  });

  for (const secret of ['AB"\nCDEFAB', "abcabcab", "ABABABA"]) for (const reverse of [false, true]) {
    it(`bewahrt Raw-/Escapingüberlappungen und späte Cropbelege, umgekehrte Reihenfolge=${reverse}, Länge=${secret.length}`, () => {
      const short = secret.slice(0, 2);
      for (const wire of new Set([secret, JSON.stringify(secret).slice(1, -1)])) {
        const redactor = new SecretRedactor();
        const raw = `PUBLIC[${wire}]PUBLIC-END!`;
        const cached = redactor.boundedText(`PUBLIC[${wire}`, 7 + wire.length - 1);
        for (const value of reverse ? [secret, short] : [short, secret]) redactor.remember(value);
        expect(redactor.text(raw)).toBe("PUBLIC[***]PUBLIC-END!");
        expect(redactor.boundedText(cached, 1000)).toBe("PUBLIC[***");
        for (let split = 1; split < raw.length; split++) {
          expect(redactor.stream(String(split), raw.slice(0, split)) + redactor.stream(String(split), raw.slice(split))).toBe("PUBLIC[***]PUBLIC-END!");
        }
        redactor.clear();
      }
    });
  }

  it("lässt benachbarte Einzeltreffer wachsen und meldet den tatsächlichen Zeichen-/Byteverlust", () => {
    const redactor = new SecretRedactor(); redactor.remember("Q");
    expect(redactor.bounded("Q".repeat(66_666) + "END!", 200_000)).toEqual({ text: "***".repeat(66_666) + "EN", truncated: true });
    expect(redactor.bounded("äQQ!", 8, true)).toEqual({ text: "ä******", truncated: true });
    expect(redactor.bounded("äQ!", 6, true)).toEqual({ text: "ä***!", truncated: false });
  });

  it("begrenzt die Maskenexpansion eines maximal erlaubten Einzelkurzwert-Rohframes", () => {
    const redactor = new SecretRedactor(); redactor.remember("Q");
    expect(redactor.bounded("Q".repeat(hermesV2Policy.upstreamBytes - 1024), 200_000)).toEqual({ text: "*".repeat(200_000), truncated: true });
    redactor.clear();
  });

  it("vereinigt Treffer verschiedener Werte mit ursprünglichen statischen Schlüsselintervallen", () => {
    for (const reverse of [false, true]) {
      const redactor = new SecretRedactor();
      for (const secret of reverse ? ["BC", "AB", "word", "pass", "entials", "cred"] : ["cred", "entials", "pass", "word", "AB", "BC"]) redactor.remember(secret);
      const raw = 'PUBLIC {"credentials":"OPAQUE-ONE","password":"OPAQUE-TWO","safe":"ABC"} PUBLIC-END!';
      const result = protectedText(raw, redactor, 200_000).text;
      expect(result).not.toContain("OPAQUE-ONE"); expect(result).not.toContain("OPAQUE-TWO");
      expect(result).not.toContain("ABC"); expect(result).toContain("PUBLIC-END!");
      for (let split = 1; split < "ABC!".length; split++) {
        expect(redactor.stream(String(split), "ABC!".slice(0, split), credentialRanges)
          + redactor.stream(String(split), "ABC!".slice(split), credentialRanges)).toBe("***!");
      }
    }
  });

  it("behält den bisherigen Scan für einen 1MiB-periodischen Wert in 7MiB Rohtext", () => {
    const redactor = new SecretRedactor(); const secret = "Z".repeat(hermesV2Policy.secretBytes);
    redactor.remember(secret);
    expect(redactor.bounded(secret.repeat(7) + " PUBLIC-END!", 200_000)).toEqual({ text: "*** PUBLIC-END!", truncated: false });
    expect(redactor.stream("periodic", secret.slice(0, -1))).toBe("");
    expect(redactor.stream("periodic", "Z PUBLIC-END!")).toBe("*** PUBLIC-END!");
    redactor.clear();
  });

  it("schützt lange schwach überlappende Treffer und einen späteren echten Präfix", () => {
    const redactor = new SecretRedactor(); const secret = "L" + "m".repeat(524_286) + "L";
    redactor.remember(secret);
    const overlapping = secret + secret.slice(1);
    expect(redactor.bounded(overlapping + " PUBLIC-END!", 200_000)).toEqual({ text: "*** PUBLIC-END!", truncated: false });
    const channel = "weak-border";
    expect(redactor.stream(channel, overlapping + " PUBLIC[" + secret.slice(0, 500))).toBe("*** PUBLIC[");
    expect(redactor.stream(channel, secret.slice(500) + "]PUBLIC-END!")).toBe("***]PUBLIC-END!");
    redactor.clear();
  });

  it("maskiert lange nichtperiodische Werte neben vielen Kurztreffern ohne Eingangskürzung", () => {
    const secret = "A".repeat(524_287) + "Z";
    for (const reverse of [false, true]) {
      const redactor = new SecretRedactor(); for (const value of reverse ? [secret, "A"] : ["A", secret]) redactor.remember(value);
      expect(redactor.bounded(secret.repeat(7) + " PUBLIC-END!", 200_000)).toEqual({ text: "***".repeat(7) + " PUBLIC-END!", truncated: false });
      redactor.clear();
    }
  });
});
