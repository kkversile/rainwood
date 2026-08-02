import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Staff Login', robots: { index: false, follow: false } };
export default function LoginLayout({ children }: { children: React.ReactNode }) { return children; }
