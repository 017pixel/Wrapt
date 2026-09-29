// @vitest-environment jsdom
import { useEffect, useState } from "react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router";
import { WRAPT_LIMITS } from "@wrapt/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PersistentOutlet } from "./PersistentOutlet";

afterEach(cleanup);

let mountsA = 0;

function PageA() {
  useEffect(() => {
    mountsA += 1;
  }, []);
  return <p>Fläche A</p>;
}

function PageB() {
  return <p>Fläche B</p>;
}

let evictedPages = 0;

function EvictionPage({ id }: { id: number }) {
  useEffect(() => () => { evictedPages += 1; }, []);
  return <p>Eviction {id}</p>;
}

function Shell() {
  return <PersistentOutlet />;
}

function PreviewRouteSwitch() {
  const navigate = useNavigate();
  return (
    <>
      <button onClick={() => navigate("/orbit/previews")}>Preview-Hub im Orbit</button>
      <button onClick={() => navigate("/previews")}>Preview-Hub direkt</button>
      <button onClick={() => navigate("/orbit")}>Orbit öffnen</button>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/orbit" element={<iframe title="Preview im Orbit" />} />
          <Route path="/orbit/previews" element={<p>Preview-Hub im Orbit</p>} />
          <Route path="/previews" element={<p>Preview-Hub</p>} />
        </Route>
      </Routes>
    </>
  );
}

function TestApp() {
  const [index, setIndex] = useState(0);
  const navigate = useNavigate();
  const target = index === 0 ? "/a" : "/b";
  return (
    <div>
      <button onClick={() => { setIndex((current) => 1 - current); navigate(index === 0 ? "/b" : "/a"); }}>Wechseln</button>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/a" element={<PageA />} />
          <Route path="/b" element={<PageB />} />
        </Route>
      </Routes>
      <span data-testid="route">{target}</span>
    </div>
  );
}

describe("PersistentOutlet", () => {
  it("hält die aktive Fläche aktiv und parkt die vorherige", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/a"]}>
        <TestApp />
      </MemoryRouter>,
    );
    expect(screen.getByText("Fläche A")).toBeTruthy();
    const parkedBefore = container.querySelector('[data-route-cache-key="/a"].is-active');
    expect(parkedBefore).not.toBeNull();

    fireEvent.click(screen.getByText("Wechseln"));

    const a = container.querySelector('[data-route-cache-key="/a"]');
    const b = container.querySelector('[data-route-cache-key="/b"]');
    expect(a).not.toBeNull();
    expect(a?.classList.contains("is-parked")).toBe(true);
    expect(b?.classList.contains("is-active")).toBe(true);
    expect(screen.getByText("Fläche B")).toBeTruthy();
  });

  it("hängt eine zurückgekehrte Fläche ohne Remount wieder ein", () => {
    mountsA = 0;
    const { container } = render(
      <MemoryRouter initialEntries={["/a"]}>
        <TestApp />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText("Wechseln"));
    fireEvent.click(screen.getByText("Wechseln"));

    const a = container.querySelector('[data-route-cache-key="/a"]');
    expect(a?.classList.contains("is-active")).toBe(true);
    expect(mountsA).toBe(1);
  });

  it("behält dasselbe Preview-iframe über Orbit und beide Preview-Hub-Pfade", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/orbit"]}>
        <PreviewRouteSwitch />
      </MemoryRouter>,
    );
    const iframe = container.querySelector("iframe[title='Preview im Orbit']");
    expect(iframe).not.toBeNull();

    fireEvent.click(screen.getByText("Preview-Hub im Orbit"));
    expect(container.querySelector("iframe[title='Preview im Orbit']")).toBe(iframe);
    fireEvent.click(screen.getByText("Preview-Hub direkt"));
    expect(container.querySelector("iframe[title='Preview im Orbit']")).toBe(iframe);
    fireEvent.click(screen.getByText("Orbit öffnen"));
    expect(container.querySelector("iframe[title='Preview im Orbit']")).toBe(iframe);
  });

  it("entfernt die älteste inaktive Route und führt ihren Cleanup aus", () => {
    evictedPages = 0;
    function EvictionApp() {
      const navigate = useNavigate();
      const [index, setIndex] = useState(0);
      const routeCount = WRAPT_LIMITS.maxCachedRoutes + 1;
      return (
        <>
          <button type="button" onClick={() => { const next = Math.min(index + 1, routeCount - 1); setIndex(next); navigate(`/eviction-${next}`); }}>Nächste Fläche</button>
          <Routes>
            <Route element={<PersistentOutlet />}>
              {Array.from({ length: routeCount }, (_, routeIndex) => (
                <Route key={routeIndex} path={`/eviction-${routeIndex}`} element={<EvictionPage id={routeIndex} />} />
              ))}
            </Route>
          </Routes>
        </>
      );
    }

    const { container } = render(
      <MemoryRouter initialEntries={["/eviction-0"]}>
        <EvictionApp />
      </MemoryRouter>,
    );
    for (let index = 0; index < WRAPT_LIMITS.maxCachedRoutes; index += 1) fireEvent.click(screen.getByText("Nächste Fläche"));

    expect(container.querySelector('[data-route-cache-key="/eviction-0"]')).toBeNull();
    expect(container.querySelector(`[data-route-cache-key="/eviction-${WRAPT_LIMITS.maxCachedRoutes}"]`)?.classList.contains("is-active")).toBe(true);
    expect(evictedPages).toBeGreaterThan(0);
  });
});
