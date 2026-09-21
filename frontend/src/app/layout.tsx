import type { Metadata } from 'next';
import 'leaflet/dist/leaflet.css';
import './globals.css';
import './agent-booking-selection.css';
import './agent-reports.css';
import './agent-report-tweaks.css';
import './agent-settings.css';
import './agent-announcements.css';
import './amenities-final.css';
import './amenities-icons.css';
import './amenities-icons-fix.css';
import './amenities-room-fix.css';
import './amenities-semantic-icons.css';
import './amenities-stitch-icons.css';
import './hotel-map.css';
import './images-media.css';
import { Shell } from '../components/Shell';
import { DialogProvider } from '../components/ReactDialog';

export const metadata: Metadata = { metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'), title: { default: 'RainWood Hotels | Direct Booking', template: '%s | RainWood Hotels' }, description: 'Book RainWood Hotels directly with live availability, transparent rates and secure confirmation.', icons: { icon: 'https://rainwoodhotels.com/wp-content/webp-express/webp-images/uploads/2023/09/rwh-logo.png.webp', shortcut: 'https://rainwoodhotels.com/wp-content/webp-express/webp-images/uploads/2023/09/rwh-logo.png.webp', apple: 'https://rainwoodhotels.com/wp-content/webp-express/webp-images/uploads/2023/09/rwh-logo.png.webp' }, alternates: { canonical: '/' }, openGraph: { type: 'website', siteName: 'RainWood Hotels', title: 'RainWood Hotels | Direct Booking', description: 'Live availability and secure direct reservations.' }, twitter: { card: 'summary_large_image' } };

export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en" data-scroll-behavior="smooth"><head><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" /></head><body><DialogProvider><Shell>{children}</Shell></DialogProvider></body></html>; }
