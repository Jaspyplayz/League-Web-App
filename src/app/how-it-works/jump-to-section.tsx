"use client";

import { SECTIONS } from "./sections";

// On a phone the "On this page" list would push the page down, so a select
// takes its place: picking a section scrolls to it.
export function JumpToSection() {
  return (
    <label className="flex flex-col gap-1.5 text-note text-quiet md:hidden">
      Jump to a section
      <select
        defaultValue=""
        onChange={(e) => {
          document.getElementById(e.target.value)?.scrollIntoView({ behavior: "smooth" });
          // Back to "Pick a section", so the same one can be picked again.
          e.target.value = "";
        }}
        className="h-11 rounded-md bg-panel px-2.5 text-body text-main"
      >
        <option value="" disabled>
          Pick a section
        </option>
        {SECTIONS.map((s) => (
          <option key={s.id} value={s.id}>
            {s.title}
          </option>
        ))}
      </select>
    </label>
  );
}
