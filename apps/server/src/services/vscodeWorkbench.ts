import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse, serialize, type DefaultTreeAdapterMap } from "parse5";
import { z } from "zod";

const proposalMapSchema = z.record(z.string(), z.array(z.string()));
type ProposalMap = z.infer<typeof proposalMapSchema>;
const copilotIdentifier = "github.copilot-chat";

interface WorkbenchConfiguration {
  callbackRoute?: string;
  productConfiguration?: { extensionEnabledApiProposals?: ProposalMap; [key: string]: unknown };
  [key: string]: unknown;
}

/** Ergänzt nur vom ausgelieferten, eingebauten Copilot deklarierte APIs. */
export function copilotProposalOverrides(product: { extensionEnabledApiProposals?: unknown }, manifest: {
  publisher?: string; name?: string; enabledApiProposals?: unknown;
}): ProposalMap | null {
  if (`${manifest.publisher}.${manifest.name}`.toLowerCase() !== copilotIdentifier) return null;
  const proposals = proposalMapSchema.safeParse(product.extensionEnabledApiProposals);
  const wanted = z.array(z.string()).safeParse(manifest.enabledApiProposals);
  if (!proposals.success || !wanted.success) return null;
  const key = Object.keys(proposals.data).find((name) => name.toLowerCase() === copilotIdentifier);
  if (!key) return null;
  const allowed = proposals.data[key]!;
  const missing = wanted.data.filter((proposal) => !allowed.includes(proposal));
  if (missing.length === 0) return null;
  return { ...proposals.data, [key]: [...new Set([...allowed, ...missing])] };
}

/** Öffentliche IWorkbenchConstructionOptions.productConfiguration, kein Binary-Patch. */
export function createVSCodeWorkbenchConfigurator(dataDirectory: string) {
  let cachedCommit: string | null = null;
  let cachedOverrides: Promise<ProposalMap | null> | null = null;
  const loadOverrides = (callbackRoute: unknown) => {
    const match = typeof callbackRoute === "string"
      ? /^\/editor\/(?:stable|insider)-([a-f0-9]{40})\/callback$/.exec(callbackRoute) : null;
    if (!match) return Promise.resolve(null);
    const commit = match[1]!;
    if (cachedCommit !== commit) {
      cachedCommit = commit;
      const root = join(dataDirectory, "cli", "serve-web", commit);
      cachedOverrides = Promise.all([
        readFile(join(root, "product.json"), "utf8"),
        readFile(join(root, "extensions", "copilot", "package.json"), "utf8"),
      ]).then(([product, manifest]) => copilotProposalOverrides(JSON.parse(product), JSON.parse(manifest)))
        .catch(() => null);
    }
    return cachedOverrides!;
  };

  return async (html: string): Promise<string> => {
    if (!html.includes("vscode-workbench-web-configuration")) return html;
    const document = parse(html);
    const stack: DefaultTreeAdapterMap["node"][] = [document];
    while (stack.length > 0) {
      const node = stack.pop()!;
      if ("childNodes" in node) stack.push(...node.childNodes);
      if (!("tagName" in node) || node.tagName !== "meta") continue;
      if (node.attrs.find((attribute) => attribute.name === "id")?.value !== "vscode-workbench-web-configuration") continue;
      const attribute = node.attrs.find((entry) => entry.name === "data-settings");
      if (!attribute) return html;
      let configuration: WorkbenchConfiguration;
      try { configuration = JSON.parse(attribute.value); } catch { return html; }
      if (!configuration || typeof configuration !== "object" || Array.isArray(configuration)) return html;
      const explicit = configuration.productConfiguration?.extensionEnabledApiProposals;
      // Eine explizite Upstream-Freigabe wird nicht erweitert oder ersetzt.
      if (explicit && Object.keys(explicit).some((key) => key.toLowerCase() === copilotIdentifier)) return html;
      const overrides = await loadOverrides(configuration.callbackRoute);
      if (!overrides) return html;
      configuration.productConfiguration = {
        ...configuration.productConfiguration,
        extensionEnabledApiProposals: { ...overrides, ...explicit },
      };
      attribute.value = JSON.stringify(configuration);
      return serialize(document);
    }
    return html;
  };
}
