import { notFound } from "next/navigation";
import { Suspense } from "react";
import NotFound from "../not-found";

// Every address no other route matches, like /no-such-page, lands here and
// shows the not-found page. Next.js tries every other route first, so this
// can't take over a real one such as /player/... or /api/mcp.
//
// The route exists for the search boxes on that page. A search posts to the
// page's own address, and on Vercel an address with no route is answered from
// the stored 404 page without running any server code, so the search crashed
// into "Something went wrong" (JAS-136). Here the post reaches the server.
export default function UnmatchedAddress() {
  return (
    <>
      <NotFound />
      {/* Calling notFound() is what makes the answer a 404. Next.js stores
          this page when it builds the site; a notFound() outside Suspense
          would store an empty page that only fills in once JavaScript runs.
          Inside Suspense it stores the 404 and keeps the page above. */}
      <Suspense>
        <NotFoundStatus />
      </Suspense>
    </>
  );
}

function NotFoundStatus(): never {
  notFound();
}
