import blink from "./assets/capybara-blink.png";
import happyA from "./assets/capybara-happy-a.png";
import happyB from "./assets/capybara-happy-b.png";
import happyC from "./assets/capybara-happy-c.png";
import hopA from "./assets/capybara-hop-a.png";
import hopB from "./assets/capybara-hop-b.png";
import hopC from "./assets/capybara-hop-c.png";
import idle from "./assets/capybara-idle.png";
import lookLeft from "./assets/capybara-look-left.png";
import lookRight from "./assets/capybara-look-right.png";
import party from "./assets/capybara-party.png";
import sleep from "./assets/capybara-sleep.png";
import sneezeA from "./assets/capybara-sneeze-a.png";
import sneezeB from "./assets/capybara-sneeze-b.png";
import sneezeC from "./assets/capybara-sneeze-c.png";
import walkA from "./assets/capybara-walk-a.png";
import walkB from "./assets/capybara-walk-b.png";
import worry from "./assets/capybara-worry.png";
import yawnA from "./assets/capybara-yawn-a.png";
import yawnB from "./assets/capybara-yawn-b.png";
import zzzLarge from "./assets/capybara-zzz-large.png";
import zzzMedium from "./assets/capybara-zzz-medium.png";
import zzzSmall from "./assets/capybara-zzz-small.png";

/** Alle gelieferten Sprites teilen sich bewusst dieselbe 64×64-Pixel-Bühne. */
export const CAPYBARA_GRID = { width: 64, height: 64 } as const;

export type CapybaraFrameName =
  | "calm"
  | "blink"
  | "happyA"
  | "happyB"
  | "happyC"
  | "lookLeft"
  | "lookRight"
  | "walkA"
  | "walkB"
  | "sneezeA"
  | "sneezeB"
  | "sneezeC"
  | "hopA"
  | "hopB"
  | "hopC"
  | "worry"
  | "sleep"
  | "yawnA"
  | "yawnB"
  | "party";

/**
 * Die PNGs kommen aus dem neuen 64×64-Set. Die Namen bleiben im Code
 * semantisch, damit Animationen nicht von Dateinamen abhängig sind.
 */
export const CAPYBARA_FRAMES: Readonly<Record<CapybaraFrameName, string>> = Object.freeze({
  calm: idle,
  blink,
  happyA,
  happyB,
  happyC,
  lookLeft,
  lookRight,
  walkA,
  walkB,
  sneezeA,
  sneezeB,
  sneezeC,
  hopA,
  hopB,
  hopC,
  worry,
  sleep,
  yawnA,
  yawnB,
  party,
});

/** Die Zzz-Frames steigen schwebend über dem schlafenden Capybara auf. */
export const CAPYBARA_ZZZ_FRAMES: readonly string[] = Object.freeze([
  zzzSmall,
  zzzMedium,
  zzzLarge,
]);
