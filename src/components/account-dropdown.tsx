"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDownIcon } from "./icons";

// The signed-in player's spot in the header: a button showing who you are
// that opens a small menu underneath. The contents come from AccountMenu
// (a Server Component); this part only opens and closes it. It closes when
// you click anywhere else, press Escape, or move to another page.
export function AccountDropdown({
  trigger,
  children,
}: {
  trigger: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // A new page means the menu did its job.
  const [shownFor, setShownFor] = useState(pathname);
  if (shownFor !== pathname) {
    setShownFor(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-3 py-1 text-left text-ink"
      >
        {trigger}
        <ChevronDownIcon />
      </button>
      {open && (
        <div className="soft-round absolute top-full right-0 z-20 mt-2 flex w-56 flex-col border border-frame bg-surface py-1.5 shadow-lg">
          {children}
        </div>
      )}
    </div>
  );
}
