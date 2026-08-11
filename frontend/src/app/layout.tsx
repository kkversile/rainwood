import type { Metadata } from 'next';
import './globals.css';
import { Shell } from '../components/Shell';

export const metadata: Metadata = { metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'), title: { default: 'RainWood Hotels | Direct Booking', template: '%s | RainWood Hotels' }, description: 'Book RainWood Hotels directly with live availability, transparent rates and secure confirmation.', icons: { icon: 'https://rainwoodhotels.com/wp-content/webp-express/webp-images/uploads/2023/09/rwh-logo.png.webp', shortcut: 'https://rainwoodhotels.com/wp-content/webp-express/webp-images/uploads/2023/09/rwh-logo.png.webp', apple: 'https://rainwoodhotels.com/wp-content/webp-express/webp-images/uploads/2023/09/rwh-logo.png.webp' }, alternates: { canonical: '/' }, openGraph: { type: 'website', siteName: 'RainWood Hotels', title: 'RainWood Hotels | Direct Booking', description: 'Live availability and secure direct reservations.' }, twitter: { card: 'summary_large_image' } };

export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body><Shell>{children}</Shell></body></html>; }
