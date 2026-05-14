import { describe, expect, it } from "vitest";
import { CliComposerStore } from "../../src/cli-composer.js";

describe("cli-composer", () => {
  it("tracks draft lifecycle per session", () => {
    const composer = new CliComposerStore();

    expect(composer.isActive("s01")).toBe(false);
    composer.start("s01");
    composer.append("s01", "line one");
    composer.append("s01", "line two");

    expect(composer.preview("s01")).toEqual({
      lineCount: 2,
      charCount: "line one\nline two".length,
      content: "line one\nline two",
    });
    expect(composer.consume("s01")?.content).toBe("line one\nline two");
    expect(composer.isActive("s01")).toBe(false);
  });

  it("can preserve blank lines and pop recent draft lines without leaving compose mode", () => {
    const composer = new CliComposerStore();

    composer.start("s01");
    composer.append("s01", "alpha");
    composer.append("s01", "");
    composer.append("s01", "beta");

    expect(composer.preview("s01")).toEqual({
      lineCount: 3,
      charCount: "alpha\n\nbeta".length,
      content: "alpha\n\nbeta",
    });
    expect(composer.pop("s01", 2)).toEqual({
      removedLineCount: 2,
      lineCount: 1,
      charCount: "alpha".length,
      content: "alpha",
    });
    expect(composer.isActive("s01")).toBe(true);
    expect(composer.pop("s01", 5)).toEqual({
      removedLineCount: 1,
      lineCount: 0,
      charCount: 0,
      content: "",
    });
    expect(composer.preview("s01")).toEqual({
      lineCount: 0,
      charCount: 0,
      content: "",
    });
  });
});
