import { describe, expect, it } from "vitest";
import { cleanNote, MAX_NOTE_LENGTH } from "./match-note";

describe("cleanNote", () => {
  it("trims the note and keeps line breaks", () => {
    expect(cleanNote("  ward river before 3:15\nback on cannon wave  ")).toEqual({
      ok: true,
      text: "ward river before 3:15\nback on cannon wave",
    });
  });

  it("turns Windows line breaks into single ones before counting", () => {
    const lines = "a\r\n".repeat(MAX_NOTE_LENGTH / 2);
    const result = cleanNote(lines);
    expect(result).toEqual({ ok: true, text: "a\n".repeat(MAX_NOTE_LENGTH / 2).trim() });
  });

  it("accepts an empty note, which means delete it", () => {
    expect(cleanNote("   ")).toEqual({ ok: true, text: "" });
  });

  it("rejects notes that are too long", () => {
    expect(cleanNote("x".repeat(MAX_NOTE_LENGTH))).toEqual({
      ok: true,
      text: "x".repeat(MAX_NOTE_LENGTH),
    });
    expect(cleanNote("x".repeat(MAX_NOTE_LENGTH + 1))).toEqual({ ok: false });
  });

  it.each([null, undefined, 42, {}])("rejects %j", (value) => {
    expect(cleanNote(value)).toEqual({ ok: false });
  });
});
