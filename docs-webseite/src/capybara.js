import {
  CAPYBARA_ANIMATIONS,
  buildCapybaraPartyPlan,
  capybaraActionForMotion,
  capybaraNapDelayMs,
  capybaraPhaseForHour,
  capybaraWeightsForHour,
  pickCapybaraAction,
  planCapybaraWalk,
} from "./capybaraMotion.js";

/**
 * Capybara-Easter-Egg der Doku-Seite. Läuft fest am unteren Fensterrand und
 * beherrscht dieselben Bewegungen wie das Maskottchen der Workbench. Die
 * Logik ist als Vanilla-Modul portiert; die App bleibt die Quelle der Wahrheit.
 */

const CAPYBARA_ITEM_WIDTH = 86;
const SPRITE_SIZE = 88;
const WALK_STEP_MS = 230;
const IDLE_POLL_MS = 250;
const ACTION_MIN_MS = 1_200;
const ACTION_SPAN_MS = 3_000;
const BLINK_MS = 170;
const BUBBLE_VISIBLE_MS = 4_200;
const SPRITE_BASE = "./assets/capybara/";

const FRAMES = {
  calm: "capybara-idle.png",
  blink: "capybara-blink.png",
  happyA: "capybara-happy-a.png",
  happyB: "capybara-happy-b.png",
  happyC: "capybara-happy-c.png",
  lookLeft: "capybara-look-left.png",
  lookRight: "capybara-look-right.png",
  walkA: "capybara-walk-a.png",
  walkB: "capybara-walk-b.png",
  sneezeA: "capybara-sneeze-a.png",
  sneezeB: "capybara-sneeze-b.png",
  sneezeC: "capybara-sneeze-c.png",
  hopA: "capybara-hop-a.png",
  hopB: "capybara-hop-b.png",
  hopC: "capybara-hop-c.png",
  worry: "capybara-worry.png",
  sleep: "capybara-sleep.png",
  yawnA: "capybara-yawn-a.png",
  yawnB: "capybara-yawn-b.png",
  party: "capybara-party.png",
};

const ANIMATED_ACTIONS = new Set(["hop", "sneeze", "yawn", "stretch", "sniff", "wave", "bow", "wiggle"]);
const IDLE_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel"];

/** Sprüche mit Doku-Bezug; die App-Sprüche zu Limits und Nutzung passen hier nicht. */
const DOCS_LINES = [
  "Willkommen in der Dokumentation.",
  "Ctrl / ⌘ K öffnet die Suche.",
  "Der Changelog lohnt sich.",
  "Nur nicht stressen. Lesen reicht.",
  "Ich lauf hier unten meine Runden.",
  "Fragen? Die Suche weiß mehr.",
  "Schön, dass du vorbeischaust.",
  "Alles entspannt hier unten.",
  "Weiterlesen, ich bin wach.",
  "Hast du die Previews schon gesehen?",
];

const celebrateStep = (step) => ({ ...step, action: "celebrate" });
const yawnStep = (step) => ({ ...step, action: "wake", facing: "right" });
const REDUCED_CELEBRATE = [{ frame: "happyB", action: "celebrate", duration: 300 }];

/** Startet das Maskottchen, sofern die Bühne im Dokument vorhanden ist. */
export function initCapybara() {
  const track = document.querySelector("#capybara-track");
  const stage = document.querySelector("#capybara-stage");
  const button = document.querySelector("#capybara-button");
  const sprite = document.querySelector("#capybara-sprite");
  const zzz = document.querySelector("#capybara-zzz");
  const confetti = document.querySelector("#capybara-confetti");
  const bubbleAnchor = document.querySelector("#capybara-bubble-anchor");
  const bubble = document.querySelector("#capybara-bubble");
  if (!track || !stage || !button || !sprite || !zzz || !confetti || !bubbleAnchor || !bubble) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  track.style.setProperty("--capy-item-width", `${CAPYBARA_ITEM_WIDTH}px`);
  track.style.setProperty("--capy-sprite-size", `${SPRITE_SIZE}px`);
  track.style.setProperty("--capy-step", `${WALK_STEP_MS}ms`);
  track.dataset.sleeping = "false";

  let frame = "calm";
  let facing = "right";
  let offset = 0;
  let maxOffset = 0;
  let sleeping = false;
  let busy = false;
  let sequenceTimers = [];
  let idleTimer = 0;
  let bubbleTimer = 0;
  let lastLine = "";

  function wait(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  function setPoseFrame(nextFrame, nextAction, nextFacing) {
    if (nextFrame !== frame) {
      frame = nextFrame;
      sprite.src = SPRITE_BASE + FRAMES[nextFrame];
    }
    track.dataset.action = nextAction;
    if (nextFacing && nextFacing !== facing) {
      facing = nextFacing;
      track.dataset.facing = facing;
    }
    confetti.hidden = frame !== "party";
  }

  function applyPosition(nextOffset) {
    offset = Math.min(maxOffset, Math.max(0, nextOffset));
    track.style.setProperty("--capy-offset", `${offset}px`);
  }

  function showIdle() {
    setPoseFrame(sleeping ? "sleep" : "calm", sleeping ? "sleep" : "idle");
  }

  function setSleeping(nextSleeping) {
    if (sleeping === nextSleeping) return;
    sleeping = nextSleeping;
    track.dataset.sleeping = String(sleeping);
    zzz.hidden = !sleeping;
    if (!busy) showIdle();
  }

  function stopSequence() {
    sequenceTimers.forEach((timer) => window.clearTimeout(timer));
    sequenceTimers = [];
    busy = false;
  }

  /** Spielt feste Frame-Sequenzen und hält die Zufallsschleife so lange an. */
  function runSequence(steps) {
    stopSequence();
    busy = true;
    let elapsed = 0;
    for (const step of steps) {
      const timer = window.setTimeout(() => {
        setPoseFrame(step.frame, step.action, step.facing);
        if (step.offset !== undefined) applyPosition(step.offset);
      }, elapsed);
      sequenceTimers.push(timer);
      elapsed += step.duration;
    }
    const finish = window.setTimeout(() => {
      sequenceTimers = [];
      busy = false;
      showIdle();
    }, elapsed);
    sequenceTimers.push(finish);
  }

  /** Partytanz als Sequenz, geclampt auf die Laufspur. */
  function partySequence(origin, limit, random) {
    const plan = buildCapybaraPartyPlan(random);
    const clamp = (value) => Math.min(limit, Math.max(0, value));
    return {
      duration: plan.reduce((sum, step) => sum + step.duration, 0),
      steps: plan.map((step) => ({
        frame: step.frame,
        action: step.action,
        duration: step.duration,
        facing: step.facing,
        offset: clamp(origin + step.offsetDelta),
      })),
    };
  }

  function show(nextFrame, nextAction) {
    if (!busy) setPoseFrame(nextFrame, nextAction);
  }

  async function playAnimation(name) {
    for (const step of CAPYBARA_ANIMATIONS[name]) {
      show(step.frame, name);
      await wait(step.duration);
    }
  }

  async function performAction(nextAction) {
    if (nextAction === "walk") {
      if (maxOffset <= 24) {
        show("lookRight", "look");
        await wait(600);
        return;
      }
      const plan = planCapybaraWalk(offset, maxOffset, Math.random);
      const steps = Math.max(2, Math.ceil(plan.distance / 16));
      for (let step = 1; step <= steps; step += 1) {
        if (!busy) {
          setPoseFrame(step % 2 === 0 ? "walkA" : "walkB", "walk", plan.direction);
          applyPosition(plan.from + ((plan.to - plan.from) * step) / steps);
        }
        await wait(WALK_STEP_MS);
      }
      return;
    }
    if (nextAction === "look") {
      show(Math.random() < 0.5 ? "lookLeft" : "lookRight", "look");
      await wait(700 + Math.random() * 700);
      return;
    }
    if (nextAction === "party") {
      const party = partySequence(offset, maxOffset, Math.random);
      runSequence(party.steps);
      await wait(party.duration);
      return;
    }
    if (ANIMATED_ACTIONS.has(nextAction)) {
      await playAnimation(nextAction);
      return;
    }
    if (nextAction === "doubleBlink") {
      show("blink", "blink");
      await wait(BLINK_MS);
      show("calm", "idle");
      await wait(130);
      show("blink", "blink");
      await wait(BLINK_MS);
      return;
    }
    show("blink", "blink");
    await wait(BLINK_MS);
  }

  /** Zufallsschleife: viel laufen, dazwischen kurze Aufmerksamkeitsgesten. */
  async function runLoop() {
    for (;;) {
      await wait(ACTION_MIN_MS + Math.random() * ACTION_SPAN_MS);
      while (busy || sleeping) await wait(IDLE_POLL_MS);
      if (busy) continue;
      const weights = capybaraWeightsForHour(new Date().getHours());
      const nextAction = capybaraActionForMotion(pickCapybaraAction(Math.random, weights), reducedMotion.matches);
      await performAction(nextAction);
      if (!busy) showIdle();
    }
  }

  function showLine() {
    const candidates = DOCS_LINES.filter((line) => line !== lastLine);
    const pool = candidates.length > 0 ? candidates : DOCS_LINES;
    lastLine = pool[Math.floor(Math.random() * pool.length)] ?? DOCS_LINES[0];
    bubble.textContent = lastLine;
    bubbleAnchor.hidden = false;
    window.clearTimeout(bubbleTimer);
    bubbleTimer = window.setTimeout(() => {
      bubbleAnchor.hidden = true;
    }, BUBBLE_VISIBLE_MS);
  }

  function poke() {
    if (sleeping) {
      setSleeping(false);
      runSequence(CAPYBARA_ANIMATIONS.yawn.map(yawnStep));
    } else {
      runSequence(reducedMotion.matches ? REDUCED_CELEBRATE : CAPYBARA_ANIMATIONS.celebrate.map(celebrateStep));
    }
    showLine();
  }

  function armIdle() {
    window.clearTimeout(idleTimer);
    const delay = capybaraNapDelayMs(capybaraPhaseForHour(new Date().getHours()));
    idleTimer = window.setTimeout(() => setSleeping(true), delay);
  }

  function handleActivity() {
    const wasSleeping = sleeping;
    if (wasSleeping) setSleeping(false);
    if (wasSleeping && !busy) runSequence(CAPYBARA_ANIMATIONS.yawn.map(yawnStep));
    armIdle();
  }

  function updateStage() {
    maxOffset = Math.max(0, stage.clientWidth - CAPYBARA_ITEM_WIDTH);
    if (offset > maxOffset) applyPosition(maxOffset);
  }

  button.addEventListener("click", poke);
  IDLE_EVENTS.forEach((name) => window.addEventListener(name, handleActivity, { passive: true }));
  const observer = new ResizeObserver(updateStage);
  observer.observe(stage);
  updateStage();
  if (maxOffset > 0) applyPosition(maxOffset * (0.15 + Math.random() * 0.7));
  showIdle();
  armIdle();
  void runLoop();
}
