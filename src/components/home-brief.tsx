import Link from "next/link";
import { panelClass } from "@/components/ui/panel";
import type { HomeBriefModel } from "@/lib/home-ledger";

export function HomeBrief({ brief }: { brief: HomeBriefModel }) {
  return (
    <Link
      href={brief.href}
      className={`${panelClass} flex h-full w-full min-w-0 flex-col gap-3 p-7 hover:border-ahead`}
    >
      <p className="font-mono text-sm text-ahead">{brief.kicker}</p>
      <h3 className="text-xl font-semibold">{brief.title}</h3>
      <p className="text-[15px] text-muted">{brief.body}</p>
    </Link>
  );
}
