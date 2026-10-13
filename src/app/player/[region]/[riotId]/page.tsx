import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { isRegion, REGIONS } from "@/lib/regions";
import { fromSlug } from "@/lib/riot-id";

type Params = Promise<{ region: string; riotId: string }>;

export default function PlayerPage({ params }: { params: Params }) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-12">
      <Link href="/" className="text-sm text-zinc-600 hover:underline dark:text-zinc-400">
        ← New search
      </Link>
      <Suspense fallback={<p className="text-zinc-500">Loading player…</p>}>
        <PlayerHeader params={params} />
      </Suspense>
    </main>
  );
}

async function PlayerHeader({ params }: { params: Params }) {
  const { region, riotId } = await params;
  const player = fromSlug(riotId);
  if (!isRegion(region) || !player) notFound();

  return (
    <>
      <div>
        <h1 className="text-3xl font-semibold">
          {player.gameName}
          <span className="text-zinc-500"> #{player.tagLine}</span>
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">{REGIONS[region].label}</p>
      </div>
      <p className="rounded-lg border border-dashed border-zinc-300 p-6 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
        Match history is coming next. This page will show ranked info and recent games once
        the Riot API is connected.
      </p>
    </>
  );
}
