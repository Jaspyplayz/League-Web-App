"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navTabClass } from "./nav-tab-style";

// A link in the header, drawn as a tab: uppercase, with a blue line along
// the bottom of the header while you're on that page. A client component
// only so it can read the current path, which is why the header wraps it in
// <Suspense>.
export function NavTab({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={navTabClass(active)}>
      {children}
    </Link>
  );
}
