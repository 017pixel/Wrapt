// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { expect, test } from "vitest";
import { useStatusHoverCard } from "./useStatusHoverCard";

test("Escape schließt die Statuskarte und gibt den Fokus an den Auslöser zurück", () => {
  const trigger = document.createElement("button");
  const contentLink = document.createElement("a");
  contentLink.href = "#changelog";
  document.body.append(trigger, contentLink);
  const { result, unmount } = renderHook(useStatusHoverCard);
  act(() => result.current.triggerRef(trigger));
  act(() => result.current.toggle());
  expect(result.current.open).toBe(true);
  contentLink.focus();
  act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", cancelable: true })));
  expect(result.current.open).toBe(false);
  expect(document.activeElement).toBe(trigger);
  unmount();
  trigger.remove();
  contentLink.remove();
});
