import { create } from "zustand";

type View = "studio" | "sleep";
type Panel = "library" | "pipeline";

interface UIState {
  view: View;
  openPanels: Set<Panel>;
  setView: (view: View) => void;
  togglePanel: (panel: Panel) => void;
}

export const useUIStore = create<UIState>((set) => ({
  view: "studio",
  openPanels: new Set<Panel>(["library"]),
  setView: (view) => set({ view }),
  togglePanel: (panel) =>
    set((state) => {
      const next = new Set(state.openPanels);
      if (next.has(panel)) {
        next.delete(panel);
      } else {
        next.add(panel);
      }
      return { openPanels: next };
    }),
}));
