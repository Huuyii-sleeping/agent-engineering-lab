/** Visual themes supported by the Web console. */
export type ThemeMode = "dark" | "light";

const STORAGE_KEY = "agent-web-console-theme";

type ThemeStorage = Pick<Storage, "getItem" | "setItem">;

/** Returns a supported theme mode, falling back to dark for unknown values. */
export function resolveInitialTheme(value: string | null | undefined): ThemeMode {
  return value === "light" || value === "dark" ? value : "dark";
}

/** Reads the persisted theme from browser storage. */
export function readStoredTheme(storage: ThemeStorage | null | undefined): ThemeMode {
  if (!storage) {
    return "dark";
  }
  return resolveInitialTheme(storage.getItem(STORAGE_KEY));
}

/** Persists the selected theme to browser storage. */
export function writeStoredTheme(storage: ThemeStorage | null | undefined, theme: ThemeMode): void {
  storage?.setItem(STORAGE_KEY, theme);
}

/** Returns the opposite theme for the toggle control. */
export function getNextTheme(theme: ThemeMode): ThemeMode {
  return theme === "dark" ? "light" : "dark";
}
