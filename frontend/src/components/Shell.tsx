 'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AdminAuthGate, invalidateStaffSession } from './AdminData';
import { apiRequest, clearAccessToken } from '../lib/api';

const links = [['/', 'Home'], ['/hotels', 'Hotels'], ['/booking', 'Book'], ['/contact', 'Contact'], ['/agent/login', 'Agent Login']];
const adminLinks = [['/admin/dashboard', 'Dashboard'], ['/admin/hotels', 'Manage Hotels'], ['/admin/rate-plans', 'Rate Plans'], ['/admin/agents', 'Agents'], ['/admin/agent-mappings', 'Agent Mappings'], ['/admin/reservations', 'Reservations'], ['/admin/contact-requests', 'Contact Requests'], ['/admin/payments', 'Payments'], ['/admin/reports', 'Reports'], ['/admin/axisrooms', 'AxisRooms'], ['/admin/jobs', 'Jobs'], ['/admin/users', 'Users'], ['/admin/settings', 'Site Settings'], ['/admin/audit-logs', 'Audit Logs']];
const fallbackLogoUrl = 'https://rainwoodhotels.com/wp-content/webp-express/webp-images/uploads/2023/09/rwh-logo.png.webp';

export function Shell({ children }: { children: React.ReactNode }) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  useEffect(() => { apiRequest<{ logoUrl: string | null }>('/site-settings/public').then((settings) => setLogoUrl(settings.logoUrl)).catch(() => undefined); }, []);
  useEffect(() => {
    const href = logoUrl || fallbackLogoUrl;
    for (const rel of ['icon', 'shortcut icon', 'apple-touch-icon']) {
      let link = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
      if (!link) { link = document.createElement('link'); link.rel = rel; document.head.appendChild(link); }
      link.href = href;
    }
  }, [logoUrl]);
  const pathname = usePathname();
  const visibleLinks = links.filter(([href]) => href !== '/agent/login' || !pathname.startsWith('/agent'));
  return <><div className="topbar">RainWood Hotels · Official direct booking</div><header className="siteHeader"><Link className="brand" href="/">{logoUrl ? <img className="siteLogo" src={logoUrl} alt="RainWood Hotels" style={{ display: 'block', maxWidth: '180px', maxHeight: '48px', width: 'auto', height: 'auto', objectFit: 'contain' }} /> : <>RAINWOOD <span>HOTELS</span></>}</Link><nav aria-label="Primary navigation">{visibleLinks.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}<StaffDashboardLink /></nav></header>{children}<footer><div><b>RainWood Hotels</b><p>Direct booking, transparent rates and reservation support.</p></div><div><Link href="/policies">Policies</Link> · <Link href="/contact">Contact</Link></div></footer></>;
}

function StaffDashboardLink() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => { const sync = () => setSignedIn(Boolean(window.localStorage.getItem('rainwood_access_token'))); sync(); window.addEventListener('rainwood-auth-change', sync); window.addEventListener('storage', sync); return () => { window.removeEventListener('rainwood-auth-change', sync); window.removeEventListener('storage', sync); }; }, []);
  const role = typeof window !== 'undefined' ? window.localStorage.getItem('rainwood_user_role') : null;
  return <Link href={signedIn ? (role === 'AGENT' ? '/agent' : '/admin/dashboard') : '/login'}>{signedIn ? 'Dashboard' : 'Staff Login'}</Link>;
}

export function AdminNav() {
  const pathname = usePathname();
  async function signOut() { try { await apiRequest('/auth/logout', { method: 'POST', body: JSON.stringify({ allDevices: false }) }); } catch { /* The local session is still cleared below. */ } finally { invalidateStaffSession(); clearAccessToken(); window.location.href = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/login`; } }
  return <aside className="adminNav" aria-label="Operations navigation">{adminLinks.map(([href, label]) => { const active = pathname === href || (href !== '/admin/dashboard' && pathname.startsWith(`${href}/`)); return <Link key={href} href={href} className={active ? 'active' : undefined} aria-current={active ? 'page' : undefined}>{label}</Link>; })}<button className="adminSignOut" type="button" onClick={() => void signOut()}>Sign out</button></aside>;
}

export function AgentShell({ title, user, onLogout, children }: { title: string; user: { name: string; email: string }; onLogout: () => void; children: React.ReactNode }) {
  const links = [['/agent', 'Dashboard'], ['/agent/rate-plans', 'My Rate Plans'], ['/agent/bookings', 'My Bookings'], ['/agent/wallet', 'Wallet'], ['/agent/book', 'Create Booking']] as const;
  return <main className="adminShell"><aside className="adminNav" aria-label="Agent navigation">{links.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}<button className="agentSignOut" type="button" onClick={onLogout}>Sign out</button></aside><section className="adminContent"><div className="pageTitle"><div><span>Agent portal</span><h1>{title}</h1><p>{user.name} · {user.email}</p></div></div>{children}</section></main>;
}

export function AdminLayout({ title, children }: { title: string; children: React.ReactNode }) {
  const editClass = title === 'Edit Hotel' ? ' hotelEditShell' : '';
  return <AdminAuthGate><main className={`adminShell${editClass}`}><AdminNav /><section className="adminContent"><div className="pageTitle"><div><span>Operations</span><h1>{title}</h1></div></div>{children}</section></main></AdminAuthGate>;
}
