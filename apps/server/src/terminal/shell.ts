import { homedir, userInfo } from "node:os";
import { basename, win32 } from "node:path";

export interface TerminalShellCommand { file: string; args: string[]; }
export interface TerminalShellConfiguration { file?: string | undefined; args?: string[] | undefined; }

// Profile und ihr Prompt bleiben erhalten; nur diese Sitzung meldet ihren CWD.
const powershellIntegration = [
  "$global:WraptOriginalPrompt = $function:prompt",
  "function global:prompt {",
  "  $location = $executionContext.SessionState.Path.CurrentLocation",
  "  if ($location.Provider.Name -eq 'FileSystem') {",
  "    [Console]::Write(\"$([char]27)]9;9;`\"$($location.ProviderPath)`\"$([char]27)\\\")",
  "  }",
  "  & $global:WraptOriginalPrompt",
  "}",
].join("\n");

function environmentValue(environment: NodeJS.ProcessEnv, name: string): string | undefined {
  return environment[Object.keys(environment).find((key) => key.toLowerCase() === name.toLowerCase()) ?? name];
}

/** POSIX behält Bash als bisherigen Standard; andere Login-Shells sind konfigurierbar. */
export function resolveTerminalShell(
  configuration: TerminalShellConfiguration = {},
  platform: NodeJS.Platform = process.platform,
  environment: NodeJS.ProcessEnv = process.env,
): TerminalShellCommand {
  const file = configuration.file ?? (platform === "win32"
    ? win32.join(environmentValue(environment, "SystemRoot") ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
    : "/bin/bash");
  if (configuration.args) return { file, args: [...configuration.args] };
  const name = (platform === "win32" ? win32.basename(file) : basename(file)).toLowerCase();
  if (platform === "win32") {
    if (/^(powershell|pwsh)(\.exe)?$/.test(name)) {
      return { file, args: ["-NoLogo", "-NoExit", "-EncodedCommand", Buffer.from(powershellIntegration, "utf16le").toString("base64")] };
    }
    return { file, args: name === "cmd.exe" ? ["/Q"] : [] };
  }
  return { file, args: name === "bash" ? ["--login"] : ["-l"] };
}

/** Nur benötigte Systemvariablen übernehmen, keine Backend-Zugangsdaten. */
export function terminalShellEnvironment(
  shell: TerminalShellCommand,
  homeDirectory: string | undefined,
  platform: NodeJS.Platform = process.platform,
  source: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const home = homeDirectory ?? environmentValue(source, platform === "win32" ? "USERPROFILE" : "HOME") ?? homedir();
  const environment: Record<string, string> = {
    TERM: "xterm-256color", COLORTERM: "truecolor", HOME: home,
    USER: environmentValue(source, platform === "win32" ? "USERNAME" : "USER") ?? userInfo().username,
    SHELL: shell.file,
    PATH: environmentValue(source, "PATH") ?? (platform === "win32" ? win32.join(environmentValue(source, "SystemRoot") ?? "C:\\Windows", "System32") : "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"),
    LANG: source.LANG ?? "C.UTF-8",
  };
  if (platform === "win32") {
    for (const key of ["SystemRoot", "windir", "ComSpec", "PATHEXT", "TEMP", "TMP", "APPDATA", "LOCALAPPDATA", "ProgramFiles", "ProgramFiles(x86)", "ProgramData", "PSModulePath", "USERDOMAIN"]) {
      const value = environmentValue(source, key);
      if (value !== undefined) environment[key] = value;
    }
    environment.SystemRoot ??= "C:\\Windows";
    environment.USERNAME = environment.USER!;
    environment.USERPROFILE = home;
    const root = win32.parse(home).root;
    environment.HOMEDRIVE = root.replace(/[\\/]$/, "");
    environment.HOMEPATH = home.slice(environment.HOMEDRIVE.length);
    if (win32.basename(shell.file).toLowerCase() === "cmd.exe") environment.PROMPT = "$e]9;9;$P$e\\" + (source.PROMPT ?? "$P$G");
  } else if (basename(shell.file) === "bash") {
    environment.PROMPT_COMMAND = `printf '\\e]7;file://%s%s\\e\\' "$HOSTNAME" "$PWD"`;
  }
  return environment;
}

/** tmux ist ein POSIX-Supervisor. Native Windows-Terminals verwenden ConPTY. */
export function defaultTerminalSupervisor(platform: NodeJS.Platform = process.platform): "tmux" | "direct" {
  return platform === "win32" ? "direct" : "tmux";
}

/** npm-Shims sind unter Windows .cmd-Dateien und keine CreateProcess-Programme. */
export function resolveTerminalCliCommand(file: string, args: string[], platform: NodeJS.Platform = process.platform): TerminalShellCommand {
  if (platform !== "win32" || /\.exe$/i.test(file)) return { file, args };
  const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
  const script = `$ErrorActionPreference = 'Stop'; & ${[file, ...args].map(quote).join(" ")}; if ($null -ne $LASTEXITCODE) { exit $LASTEXITCODE }`;
  return {
    file: resolveTerminalShell({}, platform).file,
    args: ["-NoLogo", "-NoProfile", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")],
  };
}
