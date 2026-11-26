import { expect, test, vi } from "vitest";
import { discardUnclaimedRuntime } from "./runtimeOwnership.js";

test("meldet eine fehlgeschlagene Löschung für den späteren Retry", async () => {
  const supervisor = { terminate: vi.fn(() => { throw new Error("tmux weg"); }) };
  const failed = vi.fn();
  const discarded = vi.fn();

  await discardUnclaimedRuntime(supervisor, "wrapt-pane", true, false, discarded, failed);

  expect(failed).toHaveBeenCalledWith("wrapt-pane");
  expect(discarded).not.toHaveBeenCalled();
});

test("meldet eine erfolgreiche Löschung nur als Cache-Invalidierung", async () => {
  const supervisor = { terminate: vi.fn(() => undefined) };
  const failed = vi.fn();
  const discarded = vi.fn();

  await discardUnclaimedRuntime(supervisor, "wrapt-pane", true, false, discarded, failed);

  expect(discarded).toHaveBeenCalledWith("wrapt-pane");
  expect(failed).not.toHaveBeenCalled();
});
