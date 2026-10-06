import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach } from "vitest";
import type { LocalPort, Project } from "@wrapt/contracts";
import { PreviewDevServerManager, type PreviewRuntimePublication } from "../DevServerManager.js";
import { PreviewDevServerDatabase } from "../devServerDatabase.js";

const cleanup: Array<() => Promise<unknown> | unknown> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });

export async function harness() {
  const directory = await mkdtemp(join(tmpdir(), "workbench-dev-server-"));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  const projectPath = join(directory, "projekt");
  await mkdir(projectPath);
  await writeFile(join(projectPath, "package.json"), JSON.stringify({ scripts: { dev: "vite" } }));
  const database = new PreviewDevServerDatabase(join(directory, "workbench.sqlite"));
  cleanup.push(() => database.close());
  const project: Project = {
    id: "projekt",
    name: "Projekt",
    description: "",
    path: projectPath,
    enabled: true,
    sortOrder: 1,
    availability: "available",
    activity: { lastWorkbenchUseAt: null, lastFilesystemChangeAt: null, lastGitCommitAt: null, effectiveAt: null },
    previews: [],
    links: { t3Code: null, codeServer: null },
  };
  const projects = new Map([[project.id, project]]);
  const addProject = async (id: string) => {
    const path = join(directory, id);
    await mkdir(path);
    await writeFile(join(path, "package.json"), JSON.stringify({ scripts: { dev: "vite" } }));
    const value: Project = { ...project, id, name: id, path };
    projects.set(id, value);
    return value;
  };
  const ports: LocalPort[] = [];
  interface FakePane { name: string; dead: boolean; exitCode: number | null }
  const createSession = (panes: FakePane[]) => ({
    options: {} as Record<string, string>,
    panes,
    get dead() { return panes.every((pane) => pane.dead); },
    set dead(value: boolean) { for (const pane of panes) { pane.dead = value; if (!value) pane.exitCode = null; } },
    get exitCode(): number | null { return panes.find((pane) => pane.dead)?.exitCode ?? null; },
    set exitCode(value: number | null) { for (const pane of panes) if (pane.dead) pane.exitCode = value; },
  });
  const supervisor = {
    exists: false,
    dead: false,
    exitCode: null as number | null,
    output: "\u001b[31merror\u001b[0m\nready on http://localhost:5173\n",
    commands: [] as string[][],
    sessions: new Map<string, ReturnType<typeof createSession>>(),
  };
  const runner = (args: string[]) => {
    supervisor.commands.push(args);
    const target = () => args[args.indexOf("-t") + 1] ?? "";
    if (args[0] === "list-sessions") {
      return { status: 0, stdout: [...supervisor.sessions.keys()].join("\n"), stderr: "" };
    }
    if (args[0] === "list-panes") {
      const session = supervisor.sessions.get(target());
      if (!session) return { status: 1, stdout: "", stderr: "missing" };
      // tmux listet ohne `-s` nur das aktuelle Fenster (im Fake das erste).
      const panes = args.includes("-s") ? session.panes : session.panes.slice(0, 1);
      return { status: 0, stdout: panes.map((pane) => `${pane.name}\t${pane.dead ? 1 : 0}\t${pane.dead ? pane.exitCode ?? "" : ""}\t4242\t1700000000`).join("\n") + "\n", stderr: "" };
    }
    if (args[0] === "new-session") {
      const name = args[3]!;
      supervisor.sessions.set(name, createSession([{ name: args[5] ?? "frontend", dead: false, exitCode: null }]));
      supervisor.exists = true;
      supervisor.dead = false;
      supervisor.exitCode = null;
      return { status: 0, stdout: "", stderr: "" };
    }
    if (args[0] === "kill-session") {
      supervisor.sessions.delete(target());
      supervisor.exists = false;
      return { status: 0, stdout: "", stderr: "" };
    }
    if (args[0] === "new-window") {
      const session = supervisor.sessions.get(target());
      if (session) session.panes.push({ name: args[5] ?? `dienst-${session.panes.length + 1}`, dead: false, exitCode: null });
      return { status: 0, stdout: "", stderr: "" };
    }
    if (args[0] === "capture-pane") return { status: 0, stdout: supervisor.output, stderr: "" };
    if (args[0] === "set-option") {
      const session = supervisor.sessions.get(args[2] ?? "");
      if (session && args[3]) session.options[args[3]] = args[4] ?? "";
      return { status: 0, stdout: "", stderr: "" };
    }
    if (args[0] === "show-options") {
      const session = supervisor.sessions.get(args[2] ?? "");
      const value = session?.options[args[4] ?? ""] ?? "";
      return { status: 0, stdout: value ? `${value}\n` : "", stderr: "" };
    }
    return { status: 0, stdout: "", stderr: "" };
  };
  const create = (publishRuntime?: () => Promise<PreviewRuntimePublication>) => new PreviewDevServerManager({
    database,
    tmuxExecutable: "/usr/bin/tmux",
    allowedProjectPorts: [1234, 1223, 8000, 8080, 8888, 4444, 1233, 6000, 6060, 4040],
    logBytes: 16_384,
    startTimeoutMilliseconds: 5_000,
    project: async (id) => { const value = projects.get(id); if (!value) throw new Error("missing"); return value; },
    localPorts: async () => ports,
    ...(publishRuntime ? { publishRuntime } : {}),
    runner,
  });
  return { create, database, supervisor, project, addProject };
}

