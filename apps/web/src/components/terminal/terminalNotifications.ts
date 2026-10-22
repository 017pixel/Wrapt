import { create } from "zustand";

export interface TerminalNotice {
  id: string;
  message: string;
  tone: "info" | "error";
  action?: { label: string; run(): void };
}

interface TerminalNotices {
  notices: TerminalNotice[];
  show(notice: TerminalNotice): void;
  dismiss(id: string): void;
}

/** Gleiche Quelle ersetzt ihren Hinweis, statt den Bildschirm zu fluten. */
export const useTerminalNotices = create<TerminalNotices>((set) => ({
  notices: [],
  show: (notice) => set((state) => ({ notices: [...state.notices.filter((item) => item.id !== notice.id), notice].slice(-3) })),
  dismiss: (id) => set((state) => state.notices.some((item) => item.id === id)
    ? { notices: state.notices.filter((item) => item.id !== id) } : state),
}));
