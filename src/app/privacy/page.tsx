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
    <LegalPage title="Privacy policy" updated="November 2, 2026">
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
        <li>
          Ranked tier, LP, wins and losses, plus a dated copy each time they change, to draw the
          LP graph on the player&apos;s profile
        </li>
        <li>Match history, match details and minute-by-minute match timelines</li>
        <li>The analysis Turnpoint computes from those matches</li>
      </ul>
      <p>
        A saved game covers everyone who played in it, not only the player looked up: every
        player&apos;s Riot ID, PUUID (the ID Riot gives Turnpoint for that player, which stays
        the same if they change their Riot ID) and stats from that game. That&apos;s ten players
        in most games and 16 in Arena. They are kept for as long as the match is, and finished
        matches are kept with no end date.
      </p>
      <p>
        Turnpoint also saves recent ranked solo games of players sampled from every rank, so it
        can compare your games with theirs. The players are picked from Riot&apos;s ranked
        ladders, whether or not they have ever used the site. For each one it keeps their PUUID,
        region and rank tier, and a short summary of each of their games, such as their
        champion, result and gold lead at 10 minutes. To train its game score and win chance, it
        also keeps every player&apos;s end-of-game numbers from those games, such as kills and
        damage, and each team&apos;s totals at every minute, such as gold and towers. Those
        training rows have no names or PUUIDs, but they keep each game&apos;s match ID, so they
        can be linked back to the game and to the sampled player&apos;s summary of it.
      </p>
      <p>
        Nothing deletes these on a timer. They are collected by a job that is run by hand, and
        it clears out old ones as it runs. For each player it samples, it deletes the summaries
        of their games that are no longer among their latest 20 ranked solo games. At the end of
        the run, it deletes the summaries and minute-by-minute totals of games played more than
        60 days before the run. The end-of-game numbers are never deleted. Moving Turnpoint to a
        new Riot API key also deletes the summaries collected with the old key.
      </p>
      <p>
        Finished matches never change, so they are kept. For the season&apos;s champion stats,
        Turnpoint also keeps each player&apos;s champion, result, kills, deaths, assists and CS, and
        the game&apos;s mode, start time and length, for every game of the season. A player&apos;s rank and lists of recent and this season&apos;s
        matches are refreshed from Riot after a day, or sooner when someone clicks Update. Once a
        day, Turnpoint also saves the new games of players someone marked with This is me. The
        data is stored in a Postgres database hosted by Supabase in the United States.
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
        picked next to your account, so the header can link to it, and saves that player&apos;s
        new games once a day so their season stats stay complete. Only you see which player you
        picked. Click the button again to remove it.
      </p>
      <p>
        If you write notes on a match, Turnpoint saves them with your account. Only you see
        them. Clear a note and save it to delete it.
      </p>
      <p>
        The same goes for notes you write on a day in your Log tab: Turnpoint saves the note
        and the date with your account, and only you see them. Clear a note and save it to
        delete it.
      </p>
      <p>
        While you&apos;re signed in, your browser keeps a sign-in cookie so you don&apos;t have
        to sign in on every page. Signing out removes it.
      </p>
      <p>
        Starting to sign in, by choosing Google or Discord on the Sign in page, also saves a few
        small helper cookies before that service opens, even if you then cancel. They hold a
        random code that lets Turnpoint finish signing you in safely, and they identify nobody.
        They last up to 400 days, or until you sign out or clear this site&apos;s cookies in
        your browser.
      </p>

      <h2>AI recaps</h2>
      <p>
        If you click Write recap on a match page, Turnpoint sends that game&apos;s stats (such as
        champions, kills, gold gaps and objective timings, worked out from Riot&apos;s match
        data) to Anthropic, which runs the Claude AI model, and saves the recap it writes. No
        account details, Riot IDs or notes are sent. Anyone looking at that game sees the saved
        recap. Turnpoint also records when your account asks for a recap, including tries that
        fail, only to limit how many one account can request a day. It keeps no more than your
        last 20 of these records, and deleting your account deletes them. Older recaps also
        record which account asked for them, until that account is deleted.
      </p>

      <h2>Ask</h2>
      <p>
        If you ask a question in the Ask panel on a match page, Turnpoint sends your question, that
        player&apos;s Riot ID and their game stats (the same ones shown on their match pages) to
        Anthropic, which runs the Claude AI model, so it can write the answer. No account
        details or notes are sent. Turnpoint saves your question, the answer and which games it read with
        your account, so you can see them again; only you see them. It also counts your
        questions and what they cost, to limit how many one account can ask a day and spend a
        month. Deleting your account deletes your questions. Separately, Turnpoint keeps what
        each question cost and when it was asked, with no account, question or answer
        attached, to keep the whole site within its monthly budget.
      </p>

      <h2>AI apps (MCP)</h2>
      <p>
        Turnpoint has a public address, /api/mcp on this site, that AI apps such as Claude can
        connect to. MCP (Model Context Protocol) is a standard way for AI apps to use a
        website&apos;s tools. Through it, an AI app can look up a player&apos;s rank and recent
        games and read Turnpoint&apos;s analysis of a game: the same public game data the
        website shows, with no sign-in. It saves nothing beyond what opening the same pages on
        the website would save. Turnpoint sees only the lookups the app makes, such as a Riot ID
        and region, and the usual request logs described under Technical data, not your
        conversation with the app. Your questions and the answers go to whichever AI app you
        connected, under that app&apos;s own privacy policy.
      </p>

      <h2>Stored in your browser</h2>
      <p>
        Turnpoint remembers the last few players you searched for, so you can click back to
        them from the box under the search. That list is kept in your own browser&apos;s local
        storage. When you click into a search, your browser sends the Riot IDs on it to Turnpoint, which
        uses them only to read each player&apos;s saved rank and doesn&apos;t keep them. Remove a
        player with the × next to their name.
      </p>
      <p>
        Players you pin with the star are saved and looked up the same way, so they stay in that
        box until you unpin them.
      </p>
      <p>
        When you search for a player, the search is held in that tab&apos;s session storage
        until their profile opens, so they can be added to Recent. It counts for only a minute
        and never leaves your browser.
      </p>
      <p>
        If you pick a focus goal on the Insights tab, Turnpoint saves which weakness you
        picked, for which player, and when, in the same local storage. It also stays on your
        device. Remove it with the Stop focusing button.
      </p>
      <p>
        The theme you pick with the sun and moon button in the header (dark or light, or &quot;system&quot; if you picked it on the old
        Settings page) is saved
        in the same local storage, so the site looks the way you chose on your next visit.
      </p>
      <p>
        Whether you picked Short or Detailed day cards on the Log tab is saved there too.
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
        Turnpoint does not sell data, show ads or use cookies to track you. The only cookies
        it sets are the sign-in cookie and the helper cookies above, and only once you start
        signing in.
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
