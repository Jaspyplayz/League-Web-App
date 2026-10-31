import { SAMPLE_MATCH_HREF } from "@/lib/sample-match";

// Shared looks for the header's links and buttons (JAS-86, take D).

// The header's two links, on the left on wide screens and in the menu on
// phones (JAS-79).
export const HEADER_LINKS = [
  { href: SAMPLE_MATCH_HREF, label: "Example game" },
  { href: "/how-it-works", label: "How it works" },
] as const;

// Hover fades to the text color on a soft fill, like deeplol: quickly in
// (0.12s) and slowly out (0.32s). The slow time is the normal one and hover
// swaps in the quick one, so the fade in uses 0.12s and the fade out 0.32s.
// Nothing fades for a visitor who asks for reduced motion, and the theme
// switch turns fading off while it changes the colors (src/lib/theme.ts).
export const hoverFade =
  "transition-colors duration-320 ease-out hover:bg-select hover:text-main hover:duration-120 motion-reduce:transition-none";

// A square icon button: 44px on phones so it's easy to tap, 40px on wide
// screens as in the mockup.
export const iconButton = `inline-flex size-11 shrink-0 items-center justify-center rounded-md text-quiet lg:size-10 ${hoverFade}`;

// Example game and How it works. The page you're on shows in the text color
// with the soft fill; the others are quiet until hovered.
export function headerLinkClass(current: boolean, inMenu = false): string {
  const shape = inMenu
    ? "flex h-12 items-center rounded-md px-3 text-base font-medium"
    : "flex h-9 items-center whitespace-nowrap rounded-md px-3 text-body font-medium";
  return `${shape} ${hoverFade} ${current ? "bg-select text-main" : "text-quiet"}`;
}
