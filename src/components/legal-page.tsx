import type { ReactNode } from "react";

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
        <p className="text-note text-quiet">Last updated {updated}</p>
        <h1 className="text-title font-semibold tracking-[-0.01em] text-main">{title}</h1>
      </div>
      <div className="flex flex-col gap-4 text-body leading-relaxed text-quiet [&_a]:text-main [&_a]:underline [&_a]:decoration-quiet [&_a]:underline-offset-[3px] [&_a:hover]:decoration-main [&_h2]:pt-4 [&_h2]:text-heading [&_h2]:font-semibold [&_h2]:text-main [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-2 [&_ul]:pl-5">
        {children}
      </div>
    </main>
  );
}
