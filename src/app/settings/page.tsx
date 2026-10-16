import type { Metadata } from "next";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Panel } from "@/components/ui/panel";
import { ThemePicker } from "./theme-picker";

export const metadata: Metadata = {
  title: "Settings",
};

// Settings are saved in this browser only (no account needed), so the page
// itself stays a plain prerendered page and each setting is a small client
// component. Theme is the first; new ones go in their own Panel below it.
export default function SettingsPage() {
  return (
    <main className="mx-auto flex w-full max-w-[860px] flex-col gap-6 px-6 pb-[88px] pt-14">
      <div className="flex flex-col gap-3">
        <Eyebrow>Your preferences</Eyebrow>
        <h1 className="font-display text-5xl font-bold uppercase tracking-[0.01em]">Settings</h1>
        <p className="text-body text-muted">
          Saved in this browser, so they apply whether or not you&apos;re signed in.
        </p>
      </div>
      <Panel className="p-5">
        <ThemePicker />
        <p className="mt-4 text-note text-faint">
          Blue still means you, ahead or the winning team, and red your opponent, behind or the
          losing team, in both themes.
        </p>
      </Panel>
    </main>
  );
}
