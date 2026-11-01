import { redirect } from "next/navigation";

// The Log used to be a profile tab at /player/na/Name-TAG/log. It is now the
// By day view of the Matches tab (JAS-106), so the old address, from
// bookmarks and old links, goes there. A temporary (307) redirect, like the
// old Ask address, so browsers don't remember it if the address changes again.
export async function GET(
  _request: Request,
  ctx: RouteContext<"/player/[region]/[riotId]/log">,
) {
  const { region, riotId } = await ctx.params;
  redirect(`/player/${encodeURIComponent(region)}/${encodeURIComponent(riotId)}?view=day`);
}
