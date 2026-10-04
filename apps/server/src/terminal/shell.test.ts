import { describe, expect, it } from "vitest";
import { defaultTerminalSupervisor, resolveTerminalCliCommand, resolveTerminalShell, terminalShellEnvironment } from "./shell.js";

describe("Plattformgerechte Terminalprozesse", () => {
  it("verwendet Login-Shells auf Linux und macOS und erhält explizite Argumente", () => {
    expect(resolveTerminalShell({}, "linux", {})).toEqual({ file: "/bin/bash", args: ["--login"] });
    expect(resolveTerminalShell({}, "darwin", {})).toEqual({ file: "/bin/bash", args: ["--login"] });
    expect(resolveTerminalShell({ file: "/opt/homebrew/bin/fish" }, "darwin", {})).toEqual({ file: "/opt/homebrew/bin/fish", args: ["-l"] });
    expect(resolveTerminalShell({ file: "/bin/bash", args: ["--noprofile", "--norc"] }, "darwin", {})).toEqual({ file: "/bin/bash", args: ["--noprofile", "--norc"] });
  });
  it("startet natives PowerShell mit Profil und CWD-Meldung, ohne POSIX-Pfade", () => {
    const shell = resolveTerminalShell({}, "win32", { SYSTEMROOT: "D:\\Windows" });
    expect(shell.file).toBe("D:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe");
    expect(shell.args).toEqual(["-NoLogo", "-NoExit", "-EncodedCommand", expect.any(String)]);
    const script = Buffer.from(shell.args.at(-1)!, "base64").toString("utf16le");
    expect(script).toContain("$global:WraptOriginalPrompt = $function:prompt");
    expect(script).toContain("$location.ProviderPath");
    expect(script).toContain("]9;9;");
    expect(resolveTerminalShell({ file: "pwsh.exe" }, "win32", {}).args).toEqual(shell.args);
    expect(resolveTerminalShell({ file: "cmd.exe" }, "win32", {}).args).toEqual(["/Q"]);
  });
  it("übergibt Windows-Systemvariablen mit konsistenten Namen und isoliert das Home", () => {
    const shell = resolveTerminalShell({}, "win32", {});
    const environment = terminalShellEnvironment(shell, "C:\\Test\\Home", "win32", {
      SYSTEMROOT: "C:\\Windows", Path: "C:\\Programme\\bin", USERNAME: "test", APPDATA: "C:\\Test\\AppData\\Roaming", PATHEXT: ".EXE;.CMD", API_SECRET: "niemals-ins-terminal", USERPROFILE: "C:\\AnderePerson", SHELL: "/bin/bash",
    });
    expect(environment).toMatchObject({ SystemRoot: "C:\\Windows", PATH: "C:\\Programme\\bin", HOME: "C:\\Test\\Home", USERPROFILE: "C:\\Test\\Home", HOMEDRIVE: "C:", HOMEPATH: "\\Test\\Home", USERNAME: "test", PATHEXT: ".EXE;.CMD", APPDATA: "C:\\Test\\AppData\\Roaming" });
    expect(environment).not.toHaveProperty("API_SECRET");
    expect(environment).not.toHaveProperty("PROMPT_COMMAND");
    expect(environment.SHELL).toBe(shell.file);
  });
  it("gibt cmd und Bash passende CWD-Prompts, ohne diese an andere Shells zu senden", () => {
    expect(terminalShellEnvironment({ file: "cmd.exe", args: [] }, "C:\\Test", "win32", {}).PROMPT).toContain("$e]9;9;$P$e\\");
    expect(terminalShellEnvironment({ file: "/bin/bash", args: [] }, "/tmp/test", "linux", {}).PROMPT_COMMAND).toContain("]7;file://");
    expect(terminalShellEnvironment({ file: "/bin/zsh", args: [] }, "/tmp/test", "darwin", {})).not.toHaveProperty("PROMPT_COMMAND");
  });
  it("verwendet unter Windows ConPTY und lässt POSIX-Supervisoren bestehen", () => {
    expect(defaultTerminalSupervisor("win32")).toBe("direct");
    expect(defaultTerminalSupervisor("linux")).toBe("tmux");
    expect(defaultTerminalSupervisor("darwin")).toBe("tmux");
  });
  it("führt npm-Shims unter Windows aus und erhält native Programme auf allen Plattformen", () => {
    const command = resolveTerminalCliCommand("C:\\Tools\\mit Leerzeichen\\codex.cmd", ["login", "--device-auth"], "win32");
    const script = Buffer.from(command.args.at(-1)!, "base64").toString("utf16le");
    expect(script).toContain("& 'C:\\Tools\\mit Leerzeichen\\codex.cmd' 'login' '--device-auth'");
    expect(command.args).toContain("-NoProfile");
    expect(resolveTerminalCliCommand("codex.exe", [], "win32")).toEqual({ file: "codex.exe", args: [] });
    expect(resolveTerminalCliCommand("/usr/local/bin/codex", [], "darwin")).toEqual({ file: "/usr/local/bin/codex", args: [] });
  });
});
