import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { Rubik } from "next/font/google";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ThemeWatcher } from "@/components/theme-watcher";
import { THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

// The site's only font. It's a variable font, so one file covers every weight
// the site uses (400 to 700). font-sans in globals.css reads its CSS variable.
const rubik = Rubik({
  variable: "--font-rubik",
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
    // before the page is drawn if that's what this browser picked with the
    // header's theme switch. Because it
    // changes <html> before React starts, React is told not to warn that
    // data-theme differs from what the server sent.
    <html
      lang="en"
      data-theme="dark"
      suppressHydrationWarning
      className={`${rubik.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col font-sans">
        <SiteHeader />
        {/* At least a screen tall, so the footer starts below the fold. Pages
            stream in a piece at a time, and a footer in view would jump down
            with every piece (Lighthouse counts that as layout shift). */}
        <div className="flex min-h-svh flex-1 flex-col">{children}</div>
        <SiteFooter />
        <ThemeWatcher />
        {/* Vercel Web Analytics counts page views without cookies. Under npm run
            dev it only logs them to the browser console instead of sending them. */}
        <Analytics />
      </body>
    </html>
  );
}
