#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";

const [action, id, ...rest] = process.argv.slice(2);
const origin = process.env.WRAPT_PLUGIN_URL ?? "http://127.0.0.1:3010";
const user = process.env.WRAPT_PLUGIN_USER;
const pathId = encodeURIComponent(id ?? "");
async function api(path, body, method = "POST") {
  const response = await fetch(new URL(`/api/v1/plugins/${path}`, origin), {
    method,
    headers: { ...(user ? { "tailscale-user-login": user } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(result?.message ?? result?.error?.message ?? `HTTP ${response.status}`);
  return result;
}

try {
  let result;
  if (action === "init") {
    const [pluginId, ...nameParts] = rest;
    if (!id || !pluginId) throw new Error('Aufruf: pnpm plugin init <neuer-ordner> <personal.id> "Name"');
    const source = await api("code/template", { id: pluginId, name: nameParts.join(" ") || pluginId });
    const directory = resolve(id);
    await mkdir(directory, { recursive: false, mode: 0o700 });
    for (const file of [{ path: "plugin.json", content: `${JSON.stringify(source.definition, null, 2)}\n` }, ...source.files]) {
      const path = join(directory, file.path);
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      await writeFile(path, file.content, { flag: "wx", mode: 0o600 });
    }
    result = { directory, next: `pnpm plugin register ${directory}` };
  } else if (action === "list") result = await api("code", undefined, "GET");
  else if (action === "api") result = await api("api", undefined, "GET");
  else if (action === "register" && id) result = await api("code/register", { directory: resolve(id) });
  else if (action === "build" && id) result = await api(`code/${pathId}/build`);
  else if (action === "activate" && id) result = await api(`code/${pathId}/activate`, { trust: rest.includes("--trust") });
  else if (action === "inspect" && id) result = await api(`code/${pathId}/inspector`, undefined, "GET");
  else if (action === "dev" && id) result = await api(`code/${pathId}/development`, { enabled: rest[0] !== "off" }, "PATCH");
  else if (["enable", "disable", "reload", "uninstall", "rollback", "update"].includes(action) && id) result = await api(`code/${pathId}/actions`, { action, ...(rest[0] ? { targetVersion: rest[0] } : {}) });
  else throw new Error("Aufruf: pnpm plugin <init|register|list|build|activate|inspect|dev|enable|disable|reload|rollback|uninstall|update|api> [ID oder Ordner]");
  console.log(JSON.stringify(result, null, 2));
} catch (error) { console.error(error instanceof Error ? error.message : "Plugin-Aktion fehlgeschlagen"); process.exitCode = 1; }
