import type { MetadataRoute } from "next";

// Served as /robots.txt. Every player page spends Riot calls the first time
// it's opened (the account, its match list, up to 10 games) and saves those
// games for good, and each profile links to the 90 or so players in its
// games. A crawler following those links would use up the Riot allowance
// visitors share and fill the free database, so crawlers are asked to stay
// out of player pages and the API. The home page and the How it works,
// privacy and terms pages stay open to search engines.
//
// Link preview bots get their own rule. When someone pastes a match link on
// X, LinkedIn or Slack, that site's bot opens just that one page to draw the
// preview card (see opengraph-image.tsx) and doesn't follow its links, so it
// costs what one visitor does. A bot named in a group of its own follows
// only that group, so these may open player pages but still not the API.
// (Discord and iMessage don't read robots.txt, so their previews work
// either way.)
//
// robots.txt is only a request: polite crawlers follow it, others don't. See
// "Known limits" in ARCHITECTURE.md.
const PREVIEW_BOTS = ["Twitterbot", "LinkedInBot", "Slackbot"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: PREVIEW_BOTS, disallow: ["/api/"] },
      { userAgent: "*", disallow: ["/player/", "/api/"] },
    ],
  };
}
