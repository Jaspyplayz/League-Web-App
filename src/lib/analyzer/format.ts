// Number and time formatting shared by the analyzer's sentences and the page.

// 1230 -> "+1,230", -420 -> "−420" (with a real minus sign), 0 -> "0".
export function formatSigned(value: number): string {
  const rounded = Math.round(value);
  if (rounded === 0) return "0";
  const sign = rounded > 0 ? "+" : "−";
  return sign + Math.abs(rounded).toLocaleString("en-US");
}

// Game clock from milliseconds: 490000 -> "8:10".
export function formatClock(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// 1 -> "once", 2 -> "twice", 3 -> "3 times".
export function times(count: number): string {
  if (count === 1) return "once";
  if (count === 2) return "twice";
  return `${count} times`;
}

// 1, "plate" -> "1 plate"; 2, "plate" -> "2 plates".
export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

// ["Lee Sin"] -> "Lee Sin"; ["Lee Sin", "Syndra"] -> "Lee Sin and Syndra";
// three or more -> "Lee Sin, Syndra and Darius".
export function listNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}
