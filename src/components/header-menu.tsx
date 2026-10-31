"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { HeaderLink } from "./header-link";
import { HEADER_LINKS, iconButton } from "./header-style";
import { CloseIcon, MenuIcon } from "./icons";

// The phone menu (JAS-86): a button at the left of the header that drops a
// list under it with Example game, How it works and, when signed in, Sign out
// (passed in as `signOut`, since only the server knows who's signed in).
// Wide screens show the links in the header instead, so all of this is hidden
// there. The menu closes on a pick, Escape, or a click anywhere else.
export function HeaderMenu({ signOut }: { signOut: ReactNode }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    // Not positioned itself, so the list lines up with the whole header (the
    // nearest positioned box) instead of this button.
    <div ref={box} className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="header-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        className={iconButton}
      >
        {open ? <CloseIcon /> : <MenuIcon />}
      </button>
      {open && (
        // Fades in over 0.22s as it appears (starting: is the style it fades
        // from), except under reduced motion.
        <nav
          id="header-menu"
          aria-label="Main"
          className="absolute inset-x-0 top-full z-30 flex flex-col border-b border-divider bg-page px-3 pt-2 pb-3 transition-[opacity,translate] duration-220 ease-out starting:-translate-y-1.5 starting:opacity-0 motion-reduce:transition-none"
        >
          {HEADER_LINKS.map((link) => (
            <HeaderLink key={link.href} href={link.href} inMenu onClick={() => setOpen(false)}>
              {link.label}
            </HeaderLink>
          ))}
          {signOut}
        </nav>
      )}
    </div>
  );
}
