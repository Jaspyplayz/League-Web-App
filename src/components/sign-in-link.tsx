"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// A client component only so it can read the current page's path and pass it
// along as ?next=, which brings the player back here after signing in. The
// header's button passes hideOnSignInPage, since it would only lead back to
// the page you're on.
export function SignInLink({
  className,
  hideOnSignInPage = false,
}: {
  className: string;
  hideOnSignInPage?: boolean;
}) {
  const pathname = usePathname();
  if (hideOnSignInPage && pathname.startsWith("/sign-in")) return null;
  const href = pathname.startsWith("/sign-in")
    ? "/sign-in"
    : `/sign-in?next=${encodeURIComponent(pathname)}`;

  return (
    <Link href={href} className={className}>
      Sign in
    </Link>
  );
}
