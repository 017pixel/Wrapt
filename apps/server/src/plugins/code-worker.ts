import { PluginRpcPeer } from "./code-rpc.js";
import { PluginWorkerContext, type PluginWorkerBoot } from "./code-worker-context.js";
import { defaultPluginRuntimeConfig } from "../config/plugin-settings.js";

// Dieses Modul wird ausschließlich als privater Plugin-Kindprozess gestartet.
let runtime: PluginWorkerContext | undefined;
const peer: PluginRpcPeer = new PluginRpcPeer((message) => {
  if (!process.send) throw new Error("Der Plugin-Prozess benötigt einen IPC-Kanal.");
  process.send(message);
}, async (method, input): Promise<unknown> => {
  if (method === "boot") {
    if (runtime) throw new Error("Die Plugin-Laufzeit wurde bereits initialisiert.");
    const boot = input as PluginWorkerBoot;
    peer.setTimeoutMs(boot.requestTimeoutMs ?? defaultPluginRuntimeConfig.requestTimeoutMs);
    runtime = new PluginWorkerContext(boot, peer);
    return runtime.setup();
  }
  if (!runtime) throw new Error("Das Plugin wurde noch nicht initialisiert.");
  return runtime.invoke(method, input);
}, defaultPluginRuntimeConfig.requestTimeoutMs);

process.on("message", (message) => peer.receive(message));
process.on("disconnect", () => { peer.close(); process.exit(0); });
