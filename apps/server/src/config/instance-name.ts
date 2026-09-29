import { hostname } from "node:os";

export function defaultInstanceName(): string {
  if (process.platform === "darwin") return "MacBook";
  if (process.platform === "linux") return "Linux Server";
  if (process.platform === "win32") return "Windows Server";
  return "Wrapt";
}

export function resolveInstanceName(value?: string): string {
  const name = value?.trim();
  const currentHostname = hostname().trim();
  const isLegacyHostname = Boolean(name && currentHostname && name.toLowerCase() === currentHostname.toLowerCase());
  return !name || isLegacyHostname ? defaultInstanceName() : name;
}
