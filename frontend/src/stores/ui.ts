import { create } from "zustand";

type MainView = "waveform" | "timeline";
type Panel = "library" | "pipeline";

interface UIState {
  mainView: MainView;
  openPanels: Set<Panel>;
  setMainView: (view: MainView) => void;
  togglePanel: (panel: Panel) => void;
}

export const useUIStore = create<UIState>((set) => ({
  mainView: "waveform",
  openPanels: new Set<Panel>(["library"]),
  setMainView: (view) => set({ mainView: view }),
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
