import { create } from "zustand";

export const useShortcutState = create<{ showingNumbers: boolean; recording: boolean }>(() => ({ showingNumbers: false, recording: false }));
