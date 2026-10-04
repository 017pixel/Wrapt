/** Standard-Schriftgröße eines Desktop-Terminals. */
export const baseTerminalFontSize = 14;
// 13 px bleiben auf Touch-Geräten lesbar und geben weiterhin genug Spalten
// für gängige TUI-Oberflächen frei.
export const compactTerminalFontSize = 13;
export const minimumCompensatedRenderScale = 0.1;
export const maximumCompensatedRenderScale = 2.2;

// Größere geparkte Puffer werden vollständig an xterm übergeben, damit
// Speicher begrenzt bleibt, ohne ANSI-Sequenzen oder Ausgabe abzuschneiden.
export const maximumParkedOutputBytes = 1_000_000;

export const mouseReportingModes = ["1000", "1002", "1003"];

/** Grenzen für Verbindungsaufbau und Erholung eines gemeinsamen Sockets. */
export const terminalConnectTimeoutMs = 8_000;
export const terminalReconnectDelayMs = 250;
export const terminalMaxReconnectDelayMs = 3_000;
export const terminalHeartbeatIntervalMs = 15_000;
export const terminalHeartbeatTimeoutMs = 10_000;

/** Sondertasten der mobilen Bedienleiste und ihre Terminalsequenzen. */
export const terminalSpecialKeys: Record<string, string> = {
  Esc: "\x1b",
  Tab: "\t",
  "↑": "\x1b[A",
  "↓": "\x1b[B",
  "←": "\x1b[D",
  "→": "\x1b[C",
  Pos1: "\x1b[H",
  Ende: "\x1b[F",
};
