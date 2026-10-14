"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// A client component only so it can read the current page's path and pass it
// along as ?next=, which brings the player back here after signing in.
export function SignInLink({ className }: { className: string }) {
  const pathname = usePathname();
  const href = pathname.startsWith("/sign-in")
    ? "/sign-in"
    : `/sign-in?next=${encodeURIComponent(pathname)}`;

  return (
    <Link href={href} className={className}>
      Sign in
    </Link>
  );
}
