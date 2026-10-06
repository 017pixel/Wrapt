import { describe, expect, it } from "vitest";
import { assertPublicHttpUrl, createPublicLookup, isPublicAddress } from "./public-http.js";

describe("öffentliche HTTP-Ziele", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "fc00::1",
    "fe80::1",
    "febf::1",
    "64:ff9b::7f00:1",
    "64:ff9b:1::a00:1",
    "::ffff:127.0.0.1",
    "2001:db8::1",
  ])("blockiert private oder reservierte Adresse %s", (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])(
    "akzeptiert öffentliche Adresse %s",
    (address) => {
      expect(isPublicAddress(address)).toBe(true);
    },
  );

  it.each([
    "file:///etc/passwd",
    "http://localhost/admin",
    "http://service.local/internal",
    "http://127.0.0.1/",
    "http://[64:ff9b:1::7f00:1]/",
    "http://user:password@example.com/",
  ])("lehnt unsicheres Ziel %s vor dem Request ab", (url) => {
    expect(() => assertPublicHttpUrl(url)).toThrow();
  });

  it("liefert DNS-Ergebnisse im passenden Undici-Callback-Format", () => {
    const addresses = [{ address: "93.184.216.34", family: 4 }];
    const resolve = createPublicLookup((_hostname, _options, callback) => callback(null, addresses));
    const allResult: unknown[] = [];
    const singleResult: unknown[] = [];

    resolve("example.com", { all: true }, (...result) => allResult.push(...result));
    resolve("example.com", { all: false }, (...result) => singleResult.push(...result));

    expect(allResult).toEqual([null, addresses]);
    expect(singleResult).toEqual([null, "93.184.216.34", 4]);
  });
});
