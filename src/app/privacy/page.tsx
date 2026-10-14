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
        explains what data it handles and why. The short version: accounts are optional, and
        there are no ads and no tracking cookies.
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
        Turnpoint also saves recent ranked games of players sampled from every rank, so it can
        compare your games with theirs. From those games it keeps every player&apos;s
        end-of-game numbers, such as kills and damage, without names or player IDs, to train
        its game score.
      </p>
      <p>
        Finished matches never change, so they are kept. A player&apos;s rank and lists of recent
        and this season&apos;s matches are refreshed from Riot after a day, or sooner when
        someone clicks Update. The data is stored in a Postgres database hosted by Supabase in the
        United States.
      </p>

      <h2>If you sign in</h2>
      <p>
        You can use Turnpoint without an account. If you choose to sign in with Google or
        Discord, that service tells Turnpoint your name, email address and profile picture.
        Turnpoint never sees your password. Supabase Auth, the sign-in service Turnpoint uses,
        stores:
      </p>
      <ul>
        <li>Your name, email address and profile picture link from Google or Discord</li>
        <li>Which service you signed in with, and your account ID there</li>
        <li>When your account was created and when you last signed in</li>
        <li>
          A log of sign-in events, including IP address, which Supabase keeps to protect
          accounts
        </li>
      </ul>
      <p>
        If you click This is me on a player&apos;s profile, Turnpoint saves which player you
        picked next to your account, so the header can link to it. Only you see it. Click the
        button again to remove it.
      </p>
      <p>
        While you&apos;re signed in, your browser keeps a sign-in cookie so you don&apos;t have
        to sign in on every page. Signing out removes it.
      </p>

      <h2>Stored in your browser</h2>
      <p>
        Turnpoint remembers the last few players you searched for, so you can click back to
        them from the home page. That list is kept in your own browser&apos;s local storage: it
        stays on your device and is never sent to Turnpoint. Remove a player with the ×
        next to their name, or the whole list with the Clear button.
      </p>
      <p>
        Players you pin with the star on their profile are saved the same way, so they stay on
        the home page until you unpin them.
      </p>
      <p>
        If you pick a focus goal on the Insights tab, Turnpoint saves which weakness you
        picked, for which player, and when, in the same local storage. It also stays on your
        device. Remove it with the Stop focusing button.
      </p>

      <h2>Technical data</h2>
      <ul>
        <li>
          The site is hosted on Vercel, which keeps standard request logs (such as IP address,
          browser and the page requested) for a limited time to run and protect the service.
        </li>
        <li>
          Vercel Web Analytics counts page views so Turnpoint can see which pages people use.
          For each view it records the page address (which can include the Riot ID of the
          player being looked up), the referring site, rough location (country and city),
          browser, operating system and device type. It uses no cookies and does not identify
          you: visitors are counted with a short-lived code worked out from the request, which
          Vercel discards after 24 hours.
        </li>
        <li>
          When something breaks, an error report is sent to Sentry with the page, browser type
          and technical details of the error, so it can be fixed.
        </li>
      </ul>
      <p>
        Turnpoint does not sell data, show ads or use cookies to track you. The only cookie
        it sets is the sign-in cookie above, and only if you sign in.
      </p>

      <h2>Removing your data</h2>
      <p>
        To ask for your account to be deleted, for a player&apos;s cached data to be removed,
        or with any other privacy question, open an issue on{" "}
        <a href={`${REPO_URL}/issues`}>Turnpoint&apos;s GitHub page</a>. Data that has been
        removed may be fetched again from Riot if someone looks the player up later.
      </p>

      <h2>Changes</h2>
      <p>
        If Turnpoint starts handling new kinds of data, for example signing in with your Riot
        account, this page will be updated before that feature goes live.
      </p>
    </LegalPage>
  );
}
