import { beforeEach } from "vitest";

const values = new Map<string, string>();
const sessionValues = new Map<string, string>();

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const storage: Storage = {
  get length() { return values.size; },
  clear: () => values.clear(),
  getItem: (key) => values.get(key) ?? null,
  key: (index) => [...values.keys()][index] ?? null,
  removeItem: (key) => { values.delete(key); },
  setItem: (key, value) => { values.set(key, String(value)); },
};

const sessionStorage: Storage = {
  get length() { return sessionValues.size; },
  clear: () => sessionValues.clear(),
  getItem: (key) => sessionValues.get(key) ?? null,
  key: (index) => [...sessionValues.keys()][index] ?? null,
  removeItem: (key) => { sessionValues.delete(key); },
  setItem: (key, value) => { sessionValues.set(key, String(value)); },
};

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: storage,
});
Object.defineProperty(globalThis, "sessionStorage", {
  configurable: true,
  value: sessionStorage,
});

if (typeof window !== "undefined") {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: storage,
  });
  Object.defineProperty(window, "sessionStorage", {
    configurable: true,
    value: sessionStorage,
  });
}

beforeEach(() => {
  sessionValues.clear();
});
