import { create } from "zustand";
import type { Range } from "@tiptap/core";
import type { SlashCommandItem } from "./slashCommands.js";

export interface SlashMenuRect {
  left: number;
  top: number;
  bottom: number;
}

interface SlashMenuState {
  open: boolean;
  query: string;
  items: SlashCommandItem[];
  index: number;
  rect: SlashMenuRect | null;
  range: Range | null;
  execute: ((item: SlashCommandItem) => void) | null;
  set: (patch: Partial<Omit<SlashMenuState, "set" | "close">>) => void;
  move: (delta: number) => void;
  close: () => void;
}

/** Zustand des Slash-Menüs; der Vorschlags-Plugin schreibt, die React-UI liest. */
export const useSlashMenuStore = create<SlashMenuState>((set, get) => ({
  open: false,
  query: "",
  items: [],
  index: 0,
  rect: null,
  range: null,
  execute: null,
  set: (patch) => set(patch),
  move: (delta) => {
    const { items, index } = get();
    if (items.length === 0) return;
    const next = (index + delta + items.length) % items.length;
    set({ index: next });
  },
  close: () => set({ open: false, query: "", items: [], index: 0, rect: null, range: null, execute: null }),
}));
