import type { NextRequest } from "next/server";
import { refreshSession } from "@/lib/supabase/proxy";

// Next.js runs this before every matching request (it was called Middleware
// before Next.js 16). Its only job here is keeping sign-ins fresh.
export async function proxy(request: NextRequest) {
  return refreshSession(request);
}

export const config = {
  // Skip Next.js's own files and images, which never need a signed-in user.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
