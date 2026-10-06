// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PwaInstallProvider } from "./usePwaInstall";

const originalWorker = Object.getOwnPropertyDescriptor(navigator, "serviceWorker");
afterEach(() => {
  if (originalWorker) Object.defineProperty(navigator, "serviceWorker", originalWorker);
  else Reflect.deleteProperty(navigator, "serviceWorker");
  vi.unstubAllGlobals();
});

function setup(ready: Promise<ServiceWorkerRegistration>) {
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { ready, controller: {} } });
  return render(<PwaInstallProvider><div /></PwaInstallProvider>);
}

it("registriert nach dem Unmount keine verspätete Updateüberwachung", async () => {
  let resolve!: (value: ServiceWorkerRegistration) => void;
  const ready = new Promise<ServiceWorkerRegistration>((finish) => { resolve = finish; });
  const addEventListener = vi.fn();
  const view = setup(ready);
  view.unmount();
  await act(async () => { resolve({ addEventListener } as unknown as ServiceWorkerRegistration); await ready; });
  expect(addEventListener).not.toHaveBeenCalled();
});

it("entfernt Registrierung und Worker-Listener beim Unmount", async () => {
  const worker = { state: "installing", addEventListener: vi.fn(), removeEventListener: vi.fn() };
  const registration = { installing: worker, waiting: null, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  const view = setup(Promise.resolve(registration as unknown as ServiceWorkerRegistration));
  await act(async () => { await Promise.resolve(); });
  expect(worker.addEventListener).toHaveBeenCalledWith("statechange", expect.any(Function));
  view.unmount();
  expect(worker.removeEventListener).toHaveBeenCalledWith("statechange", expect.any(Function));
  expect(registration.removeEventListener).toHaveBeenCalledWith("updatefound", expect.any(Function));
});
