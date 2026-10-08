// Skaliert aufgenommene PNGs auf die Zielgröße, damit die 2-fache Aufnahme
// scharf bleibt. macOS nutzt sips, Linux fällt auf ffmpeg zurück (zur Not das
// Playwright-Bündel), damit die Maße auf jeder Maschine stimmen.
import { execFileSync } from "node:child_process";
import { rename } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

export async function scaleImage(target, width, height) {
  try {
    execFileSync("sips", ["-z", String(height), String(width), target], { stdio: "ignore" });
    return;
  } catch {
    // Kein macOS: weiter mit ffmpeg.
  }
  const temp = join(tmpdir(), `wrapt-shot-${Date.now()}.png`);
  const candidates = ["ffmpeg", join(homedir(), ".cache/ms-playwright/ffmpeg-1011/ffmpeg-linux")];
  for (const binary of candidates) {
    try {
      execFileSync(binary, ["-y", "-v", "error", "-i", target, "-vf", `scale=${width}:${height}`, temp], { stdio: "ignore" });
      await rename(temp, target);
      return;
    } catch {
      // Nächster Kandidat.
    }
  }
  console.log(`  Hinweis: ${target} bleibt in Aufnahmeauflösung (kein Skalierer gefunden).`);
}
