import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { Barlow_Condensed, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ThemeWatcher } from "@/components/theme-watcher";
import { THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

// Each font exposes a CSS variable that globals.css maps to font-display,
// font-sans and font-mono.
const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  weight: ["600", "700"],
  subsets: ["latin"],
});

// IBM Plex Sans is a variable font, so one file covers every weight.
const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Turnpoint · League of Legends match analysis",
    template: "%s · Turnpoint",
  },
  description:
    "Look up any League of Legends player and find the minute each game turned.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The server always sends dark; the script in <head> switches to light
    // before the page is drawn if that's what this browser picked. Because it
    // changes <html> before React starts, React is told not to warn that
    // data-theme differs from what the server sent.
    <html
      lang="en"
      data-theme="dark"
      suppressHydrationWarning
      className={`${barlowCondensed.variable} ${plexSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col font-sans">
        <SiteHeader />
        <div className="flex flex-1 flex-col">{children}</div>
        <SiteFooter />
        <ThemeWatcher />
        {/* Vercel Web Analytics counts page views without cookies. Under npm run
            dev it only logs them to the browser console instead of sending them. */}
        <Analytics />
      </body>
    </html>
  );
}
