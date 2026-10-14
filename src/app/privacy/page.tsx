import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { REPO_URL } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Privacy policy",
};

// Riot asks every app applying for a production API key to link a privacy
// policy. Keep this page in step with what the code really does: if a change
// stores something new (accounts, analytics, cookies), update this text in the
// same pull request.
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="October 14, 2026">
      <p>
        Turnpoint is a free League of Legends stats site built by one student. This page
        explains what data it handles and why. The short version: there are no accounts, no
        ads and no tracking cookies.
      </p>

      <h2>Game data from Riot</h2>
      <p>
        When you look up a player, Turnpoint asks Riot Games&apos; official API for that
        player&apos;s public game data and keeps a copy so the next visit loads faster and the
        site stays within Riot&apos;s request limits. That copy includes:
      </p>
      <ul>
        <li>Riot ID (game name and tag), region, profile icon and summoner level</li>
        <li>Ranked tier, LP, wins and losses</li>
        <li>Match history, match details and minute-by-minute match timelines</li>
        <li>The analysis Turnpoint computes from those matches</li>
      </ul>
      <p>
        Turnpoint also saves recent ranked games of top players on the Challenger ladder, so
        it can compare your games with theirs.
      </p>
      <p>
        Finished matches never change, so they are kept. Ranks and match lists are refreshed
        from Riot after a short time. The data is stored in a Postgres database hosted by
        Supabase in the United States.
      </p>

      <h2>Stored in your browser</h2>
      <p>
        Turnpoint remembers the last few players you looked up, so you can click back to them
        from the home page. That list is kept in your own browser&apos;s local storage: it
        stays on your device and is never sent to Turnpoint. Remove a player with the ×
        next to their name, or clear all of it by clearing this site&apos;s data in your
        browser.
      </p>

      <h2>Technical data</h2>
      <ul>
        <li>
          The site is hosted on Vercel, which keeps standard request logs (such as IP address,
          browser and the page requested) for a limited time to run and protect the service.
        </li>
        <li>
          When something breaks, an error report is sent to Sentry with the page, browser type
          and technical details of the error, so it can be fixed.
        </li>
      </ul>
      <p>Turnpoint does not sell data, show ads or use cookies to track you.</p>

      <h2>Removing your data</h2>
      <p>
        To ask for a player&apos;s cached data to be removed, or with any other privacy
        question, open an issue on{" "}
        <a href={`${REPO_URL}/issues`}>Turnpoint&apos;s GitHub page</a>. Data that has been
        removed may be fetched again from Riot if someone looks the player up later.
      </p>

      <h2>Changes</h2>
      <p>
        If Turnpoint starts handling new kinds of data, for example a sign-in with your Riot
        account, this page will be updated before that feature goes live.
      </p>
    </LegalPage>
  );
}
