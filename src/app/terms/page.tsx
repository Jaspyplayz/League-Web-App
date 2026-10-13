import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal-page";
import { REPO_URL } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Terms of use",
};

// Riot asks every app applying for a production API key to link its terms of
// service. Written in plain language on purpose: a hobby project doesn't need
// pages of legal wording, just clear expectations.
export default function TermsPage() {
  return (
    <LegalPage title="Terms of use" updated="October 13, 2026">
      <p>
        By using Turnpoint you agree to these terms. If you don&apos;t agree, please don&apos;t
        use the site.
      </p>

      <h2>What Turnpoint is</h2>
      <p>
        Turnpoint is a free site for looking up League of Legends players and analyzing their
        games. It is a personal project and isn&apos;t endorsed by Riot Games. Game data comes
        from Riot Games&apos; official API.
      </p>

      <h2>Use it fairly</h2>
      <ul>
        <li>
          Don&apos;t send automated or bulk requests to the site, for example scripts that look up
          players in a loop. Turnpoint shares a limited number of Riot API requests between all
          visitors.
        </li>
        <li>Don&apos;t try to break, overload or get around the site&apos;s security.</li>
        <li>Follow Riot Games&apos; own terms when you use their game data.</li>
      </ul>

      <h2>No guarantees</h2>
      <p>
        Turnpoint is provided as is. The analysis is an automated reading of match data and
        can be wrong or incomplete, and the site may be unavailable at times, for example when
        Riot&apos;s API is down. Turnpoint isn&apos;t responsible for decisions made based on it.
      </p>

      <h2>Your data</h2>
      <p>
        The <Link href="/privacy">privacy policy</Link> explains what data the site handles.
      </p>

      <h2>Source code</h2>
      <p>
        Turnpoint&apos;s code is open source under the MIT license on{" "}
        <a href={REPO_URL}>GitHub</a>. League of Legends names, images and data belong to Riot
        Games.
      </p>

      <h2>Changes</h2>
      <p>
        These terms may change as the site grows. The date at the top of this page shows the
        latest version.
      </p>
    </LegalPage>
  );
}
