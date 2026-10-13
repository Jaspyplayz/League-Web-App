import type { ReactNode } from "react";
import { Eyebrow } from "./ui/eyebrow";

type LegalPageProps = {
  title: string;
  // Shown under the title so readers can tell when the text last changed.
  updated: string;
  children: ReactNode;
};

// Shared layout for the privacy policy and terms of use. The site has no
// typography plugin, so the [&_h2] style selectors below style the plain
// h2, p and ul tags each page writes, instead of repeating classes on every tag.
export function LegalPage({ title, updated, children }: LegalPageProps) {
  return (
    <main className="mx-auto flex w-full max-w-[760px] flex-col gap-6 px-6 pb-[88px] pt-14">
      <div className="flex flex-col gap-3">
        <Eyebrow>Last updated {updated}</Eyebrow>
        <h1 className="font-display text-5xl font-bold uppercase tracking-[0.01em]">{title}</h1>
      </div>
      <div className="flex flex-col gap-4 text-[15px] leading-relaxed text-muted [&_a]:text-ahead-soft [&_a:hover]:text-ahead-bright [&_h2]:pt-4 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-ink [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-2 [&_ul]:pl-5">
        {children}
      </div>
    </main>
  );
}
