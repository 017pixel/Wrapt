import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse, type DefaultTreeAdapterMap } from "parse5";
import { afterEach, describe, expect, it } from "vitest";
import { copilotProposalOverrides, createVSCodeWorkbenchConfigurator } from "./vscodeWorkbench.js";

const directories: string[] = [];
const commit = "a".repeat(40);
const callbackRoute = `/editor/stable-${commit}/callback`;
const product = { extensionEnabledApiProposals: {
  "GitHub.copilot-chat": ["chatProvider"], "vscode.other": ["otherApi"],
} };
const manifest = { publisher: "GitHub", name: "copilot-chat", enabledApiProposals: ["chatProvider", "authIssuers"] };

afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function document(configuration: unknown) {
  const encoded = JSON.stringify(configuration).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
  return `<!doctype html><html><head><meta id="vscode-workbench-web-configuration" data-settings="${encoded}"></head><body><script nonce="native">window.nativeBootstrap = true;</script></body></html>`;
}

function configurationFrom(html: string) {
  const stack: DefaultTreeAdapterMap["node"][] = [parse(html)];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if ("childNodes" in node) stack.push(...node.childNodes);
    if ("tagName" in node && node.tagName === "meta") {
      const attribute = node.attrs.find((entry) => entry.name === "data-settings");
      if (attribute) return JSON.parse(attribute.value);
    }
  }
  throw new Error("Test-Konfiguration fehlt.");
}

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "wrapt-vscode-config-"));
  directories.push(directory);
  const root = join(directory, "cli", "serve-web", commit);
  await mkdir(join(root, "extensions", "copilot"), { recursive: true });
  await writeFile(join(root, "product.json"), JSON.stringify(product));
  await writeFile(join(root, "extensions", "copilot", "package.json"), JSON.stringify(manifest));
  return createVSCodeWorkbenchConfigurator(directory);
}

describe("Offizielle VS-Code-Einbettung", () => {
  it("ergänzt nur die fehlenden APIs des eingebauten GitHub-Copilot und erhält andere Freigaben", () => {
    expect(copilotProposalOverrides(product, manifest)).toEqual({
      "GitHub.copilot-chat": ["chatProvider", "authIssuers"], "vscode.other": ["otherApi"],
    });
    expect(product.extensionEnabledApiProposals["GitHub.copilot-chat"]).toEqual(["chatProvider"]);
  });

  it("ändert keine passenden Versionen, fremden Erweiterungen oder ungültigen Manifeste", () => {
    expect(copilotProposalOverrides(product, { ...manifest, enabledApiProposals: ["chatProvider"] })).toBeNull();
    expect(copilotProposalOverrides(product, { ...manifest, publisher: "fremd" })).toBeNull();
    expect(copilotProposalOverrides(product, { ...manifest, enabledApiProposals: "*" })).toBeNull();
    expect(copilotProposalOverrides({ extensionEnabledApiProposals: null }, manifest)).toBeNull();
  });

  it("nutzt die öffentliche Startkonfiguration und erhält Callback, Geheimnisspeicher und Script-Nonce", async () => {
    const configure = await fixture();
    const html = document({ callbackRoute, secretStorageProvider: { test: "unverändert" }, productConfiguration: { embedderIdentifier: "server-distro" } });
    const result = await configure(html);
    const configuration = configurationFrom(result);
    expect(configuration.callbackRoute).toBe(callbackRoute);
    expect(configuration.secretStorageProvider).toEqual({ test: "unverändert" });
    expect(configuration.productConfiguration.embedderIdentifier).toBe("server-distro");
    expect(configuration.productConfiguration.extensionEnabledApiProposals["GitHub.copilot-chat"]).toContain("authIssuers");
    expect(result).toContain('<script nonce="native">window.nativeBootstrap = true;</script>');
  });

  it("respektiert explizite Upstream-Freigaben und erhält zusätzliche Tabelleneinträge", async () => {
    const configure = await fixture();
    const explicit = document({ callbackRoute, productConfiguration: { extensionEnabledApiProposals: { "github.copilot-chat": [] } } });
    expect(await configure(explicit)).toBe(explicit);
    const custom = document({ callbackRoute, productConfiguration: { extensionEnabledApiProposals: { "example.addon": ["customApi"] } } });
    expect(configurationFrom(await configure(custom)).productConfiguration.extensionEnabledApiProposals["example.addon"]).toEqual(["customApi"]);
  });

  it("lässt Callback-Seiten, kaputte Metadaten und Pfade ohne gültigen Commit unverändert", async () => {
    const configure = await fixture();
    const callback = "<!doctype html><title>Callback</title>";
    const invalid = '<meta id="vscode-workbench-web-configuration" data-settings="broken">';
    const path = document({ callbackRoute: "/editor/stable-../../private/callback" });
    expect(await configure(callback)).toBe(callback);
    expect(await configure(invalid)).toBe(invalid);
    expect(await configure(path)).toBe(path);
  });

  it("bricht den Editor bei fehlenden Installationsdateien nicht ab", async () => {
    const configure = createVSCodeWorkbenchConfigurator(join(tmpdir(), "nicht-vorhandenes-vscode-testverzeichnis"));
    const html = document({ callbackRoute });
    expect(await configure(html)).toBe(html);
  });
});
