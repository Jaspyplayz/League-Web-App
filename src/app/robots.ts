import type { MetadataRoute } from "next";

// Served as /robots.txt. Every player page spends Riot calls the first time
// it's opened (the account, its match list, up to 10 games) and saves those
// games for good, and each profile links to the 90 or so players in its
// games. A crawler following those links would use up the Riot allowance
// visitors share and fill the free database, so crawlers are asked to stay
// out of player pages and the API. The home page and the How it works,
// privacy and terms pages stay open to search engines.
//
// robots.txt is only a request: polite crawlers follow it, others don't. See
// "Known limits" in ARCHITECTURE.md.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: ["/player/", "/api/"],
    },
  };
}
