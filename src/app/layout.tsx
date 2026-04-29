import type { Metadata, Viewport } from "next";
import localFont from 'next/font/local';
import "./globals.css";

const hkGrotesk = localFont({
  src: [
    {
      path: '../../public/fonts/hkgrotesk/hkgrotesk-light-webfont.woff2',
      weight: '300',
      style: 'normal',
    },
    {
      path: '../../public/fonts/hkgrotesk/hkgrotesk-regular-webfont.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../../public/fonts/hkgrotesk/hkgrotesk-bold-webfont.woff2',
      weight: '700',
      style: 'normal',
    },
  ],
  variable: '--font-sans',
});

export const metadata: Metadata = {
  title: "Earnest Page",
  description: "Stop reacting. Start commanding. Build your real-life character bible.",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  interactiveWidget: "resizes-content",
};

// Root layout — provides <html> and <body> tags required by Next.js 16+.
// All i18n providers remain in [locale]/layout.tsx.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* TikTok Pixel */}
        <script
          dangerouslySetInnerHTML={{
            __html: `!function (w, d, t) {
  w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(
var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};n=document.createElement("script")
;n.type="text/javascript",n.async=!0,n.src=r+"?sdkid="+e+"&lib="+t;e=document.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};
  ttq.load('D7P4ND3C77U0PIQHJP8G');
  ttq.page();
}(window, document, 'ttq');`,
          }}
        />
      </head>
      <body
        className={`${hkGrotesk.variable} antialiased font-sans bg-zinc-950 text-white`}
      >
        {children}
      </body>
    </html>
  );
}
