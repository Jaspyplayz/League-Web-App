import { notFound } from "next/navigation";

// Every address no other route matches, like /no-such-page, lands here and
// shows not-found.tsx with a 404. Next.js tries every other route first, so
// this can't take over a real one such as /player/... or /api/mcp.
//
// The route exists for the search boxes on that page. A search posts to the
// page's own address, and on Vercel an address with no route is answered from
// the stored 404 page without running any server code, so the search crashed
// into "Something went wrong" (JAS-136). Here the post reaches the server.
//
// The cost: Next.js stores this answer as an empty page that fills in once
// JavaScript loads. Rendering the page here and calling notFound() inside
// <Suspense> kept the HTML, but React rebuilt the page as it loaded, wiping a
// half-typed search, and link-preview bots like Discord's got a 200.
//
// It also makes lint read every <a href="/..."> as a link to a page, so
// @next/next/no-html-link-for-pages asks for <Link> even for a route handler
// such as /api/mcp. Keep the <a> there, with an eslint-disable comment and why.
export default function UnmatchedAddress(): never {
  notFound();
}
