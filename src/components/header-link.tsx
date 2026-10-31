"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { headerLinkClass } from "./header-style";

// A link in the header, shown as current while you're on its page. A client
// component only so it can read the address, which is why the header wraps
// it in <Suspense> with a plain link (HeaderLinkFallback) as the stand-in.
export function HeaderLink({
  href,
  inMenu = false,
  onClick,
  children,
}: {
  href: string;
  inMenu?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const current = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={current ? "page" : undefined}
      className={headerLinkClass(current, inMenu)}
    >
      {children}
    </Link>
  );
}
