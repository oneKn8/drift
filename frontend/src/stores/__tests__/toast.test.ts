import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useToastStore } from "../toast";

describe("toast store", () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts with no toasts", () => {
    expect(useToastStore.getState().toasts).toEqual([]);
  });

  it("adds a toast", () => {
    useToastStore.getState().addToast("success", "Upload complete");
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].type).toBe("success");
    expect(toasts[0].message).toBe("Upload complete");
  });

  it("removes a toast manually", () => {
    useToastStore.getState().addToast("error", "Failed");
    const id = useToastStore.getState().toasts[0].id;
    useToastStore.getState().removeToast(id);
    expect(useToastStore.getState().toasts).toEqual([]);
  });

  it("auto-removes after 5 seconds", () => {
    useToastStore.getState().addToast("info", "Processing");
    expect(useToastStore.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(5000);
    expect(useToastStore.getState().toasts).toEqual([]);
  });

  it("queues multiple toasts", () => {
    useToastStore.getState().addToast("success", "First");
    useToastStore.getState().addToast("error", "Second");
    expect(useToastStore.getState().toasts).toHaveLength(2);
  });
});
