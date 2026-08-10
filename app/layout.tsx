import type { Metadata, Viewport } from 'next';
import './globals.css';

/**
 * The share card is what people judge the link by. 'ENTER ACCESS CODE' as the
 * description, with no image, reads as a credential-harvesting page — which is
 * the opposite of the intended effect and the main reason an invite goes
 * unopened. The title and description here say plainly what the link is; the
 * terminal on the other side can stay as cold as it likes.
 *
 * Still noindex: unlisted, just not unexplained.
 */
/* Resolved from the deployment, never hardcoded. hyperlink.nyc does NOT serve
   this app — it points at the Studio Hyperlink site — so pinning metadataBase
   there made og:image resolve to a 404 and the share card silently vanished,
   which is the exact failure the card exists to prevent. */
const SITE =
  process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: 'HYPERLINK — you’re invited',
  description:
    'An invite-only party in East Williamsburg. Someone used their one invitation on you. Tap to open it.',
  robots: { index: false, follow: false },
  openGraph: {
    type: 'website',
    siteName: 'HYPERLINK',
    title: 'HYPERLINK — you’re invited',
    description:
      'An invite-only party in East Williamsburg. Someone used their one invitation on you. Tap to open it.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'HYPERLINK — you’re invited',
    description: 'An invite-only party in East Williamsburg. Tap to open your invitation.',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
  themeColor: '#030904',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
