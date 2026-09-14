/**
 * Pixel-Vorlagen des Capybara-Maskottchens (Easter Egg). Jeder Frame ist ein
 * Raster aus 20 × 14 Zeichen; `o` Kontur, `f` Fell, `l` helle Schnauze,
 * `e` Auge, `n` Nase, `.` transparent. Die Frames sind bewusst klein und
 * frontale Ansicht, damit die Figur bei 2 px je Pixel erkennbar bleibt.
 */
export const CAPYBARA_GRID = { width: 20, height: 14 } as const;

export type CapybaraTone = "line" | "fur" | "light" | "eye" | "nose";

export type CapybaraFrameName =
  | "calm"
  | "blink"
  | "lookLeft"
  | "lookRight"
  | "walkA"
  | "walkB"
  | "jump"
  | "worry"
  | "sleep";

const TONE_BY_CHAR: Readonly<Record<string, CapybaraTone>> = {
  o: "line",
  f: "fur",
  l: "light",
  e: "eye",
  n: "nose",
};

const CALM: readonly string[] = [
  "....................",
  ".....oo....oo.......",
  "....offo..offo......",
  "...ooffffffffffoo...",
  "..ooffffffffffffoo..",
  "..offfffffffffffffo.",
  "..offfeffffffefffo..",
  "..offfffffffffffffo.",
  "..offllllnnllllffo..",
  "..offfffffffffffffo.",
  "..offfffffffffffffo.",
  "..offfffffffffffffo.",
  "..ooffffffffffffoo..",
  "..oo..oo....oo..oo..",
];

function patch(rows: Readonly<Record<number, string>>): readonly string[] {
  return CALM.map((row, index) => rows[index] ?? row);
}

/** Augen zu: aus den beiden Augen wird eine schmale dunkle Linie. */
const BLINK = patch({ 6: "..offfoffffffofffo.." });

/** Augenbrauen über den Augen; der sorgenvolle Blick bei knappen Limits. */
const WORRY = patch({ 5: "..offfoffffffofffo.." });

const FRAMES: Readonly<Record<CapybaraFrameName, readonly string[]>> = {
  calm: CALM,
  blink: BLINK,
  lookLeft: patch({ 6: "..offeffffffeffffo.." }),
  lookRight: patch({ 6: "..offffeffffffeffo.." }),
  walkA: patch({ 13: "...oo.oo....oo.oo..." }),
  walkB: patch({ 13: "..oo...oo..oo...oo.." }),
  jump: patch({ 12: "..ooffffffffffffoo..", 13: "....ooo....ooo......" }),
  worry: WORRY,
  sleep: BLINK,
};

export const CAPYBARA_FRAMES = Object.freeze(FRAMES);

export interface CapybaraPixel {
  readonly x: number;
  readonly y: number;
  readonly tone: CapybaraTone;
}

/** Wandelt einen Frame in sichtbare Pixel um; transparente Zellen entfallen. */
export function framePixels(frame: readonly string[]): CapybaraPixel[] {
  const pixels: CapybaraPixel[] = [];
  frame.forEach((row, y) => {
    [...row].forEach((character, x) => {
      const tone = TONE_BY_CHAR[character];
      if (tone !== undefined) pixels.push({ x, y, tone });
    });
  });
  return pixels;
}

/** Strukturprüfung für Tests: exaktes Raster und nur bekannte Zeichen. */
export function frameIsValid(frame: readonly string[]): boolean {
  if (frame.length !== CAPYBARA_GRID.height) return false;
  return frame.every(
    (row) =>
      row.length === CAPYBARA_GRID.width &&
      [...row].every((character) => character === "." || TONE_BY_CHAR[character] !== undefined),
  );
}
