import { redirect } from "next/navigation";

// Ask used to be a profile tab at /player/na/Name-TAG/ask. It now sits
// beside the replay on each match page (src/components/ask/), so the old
// address, from bookmarks and old links, goes to the player's profile.
// A temporary (307) redirect, so browsers don't remember it if Ask ever
// gets an address of its own again.
export async function GET(
  _request: Request,
  ctx: RouteContext<"/player/[region]/[riotId]/ask">,
) {
  const { region, riotId } = await ctx.params;
  redirect(`/player/${encodeURIComponent(region)}/${encodeURIComponent(riotId)}`);
}
