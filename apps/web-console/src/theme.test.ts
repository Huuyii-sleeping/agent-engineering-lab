import { describe, expect, it, vi } from "vitest";
import { getNextTheme, readStoredTheme, resolveInitialTheme, writeStoredTheme } from "./theme";

describe("web-console theme helpers", () => {
  it("normalizes stored theme values and falls back to dark", () => {
    expect(resolveInitialTheme(null)).toBe("dark");
    expect(resolveInitialTheme("unknown")).toBe("dark");
    expect(resolveInitialTheme("light")).toBe("light");
    expect(resolveInitialTheme("dark")).toBe("dark");
  });

  it("toggles between light and dark themes", () => {
    expect(getNextTheme("dark")).toBe("light");
    expect(getNextTheme("light")).toBe("dark");
  });

  it("reads and writes theme through local storage", () => {
    const storage = {
      getItem: vi.fn(() => "light"),
      setItem: vi.fn(),
    };

    expect(readStoredTheme(storage)).toBe("light");
    writeStoredTheme(storage, "dark");

    expect(storage.getItem).toHaveBeenCalledWith("agent-web-console-theme");
    expect(storage.setItem).toHaveBeenCalledWith("agent-web-console-theme", "dark");
  });
});
