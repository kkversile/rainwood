 'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { BedDouble } from 'lucide-react';
import { AdminAuthGate, invalidateStaffSession } from './AdminData';
import { apiAssetUrl, apiRequest, clearAccessToken } from '../lib/api';

const links = [['/', 'Home'], ['/hotels', 'Hotels'], ['/booking', 'Book'], ['/contact', 'Contact'], ['/agent/login', 'Agent Login']];
const adminLinks = [['/admin/dashboard', 'Dashboard'], ['/admin/hotels', 'Manage Hotels'], ['/admin/rooms-inventory', 'Rooms & Inventory'], ['/admin/rate-plans', 'Rate Plans'], ['/admin/agents', 'Agents'], ['/admin/agent-mappings', 'Agent Mappings'], ['/admin/reservations', 'Reservations'], ['/admin/contact-requests', 'Contact Requests'], ['/admin/payments', 'Payments'], ['/admin/reports', 'Reports'], ['/admin/axisrooms', 'AxisRooms'], ['/admin/jobs', 'Jobs'], ['/admin/users', 'Users'], ['/admin/settings', 'Site Settings'], ['/admin/audit-logs', 'Audit Logs']];
const fallbackLogoUrl = 'https://rainwoodhotels.com/wp-content/webp-express/webp-images/uploads/2023/09/rwh-logo.png.webp';
function UiIcon({ name, size = 17 }: { name: 'search' | 'bell' | 'chevron' | 'grid'; size?: number }) {
  const paths = { search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></>, bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>, chevron: <path d="m7 10 5 5 5-5" />, grid: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></> };
  return <svg className="uiIcon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

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
  if (pathname.startsWith('/admin')) return <>{children}</>;
  if (pathname === '/login') return <>{children}</>;
  if (pathname.startsWith('/agent') && pathname !== '/agent/login' && pathname !== '/agent/register') return <>{children}</>;
  return <><div className="topbar">RainWood Hotels · Official direct booking</div><header className="siteHeader"><Link className="brand" href="/">{logoUrl ? <img className="siteLogo" src={apiAssetUrl(logoUrl)} alt="RainWood Hotels" style={{ display: 'block', maxWidth: '180px', maxHeight: '48px', width: 'auto', height: 'auto', objectFit: 'contain' }} /> : <>RAINWOOD <span>HOTELS</span></>}</Link><nav aria-label="Primary navigation">{visibleLinks.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}<StaffDashboardLink /></nav></header>{children}<footer><div><b>RainWood Hotels</b><p>Direct booking, transparent rates and reservation support.</p></div><div><Link href="/policies">Policies</Link> · <Link href="/contact">Contact</Link></div></footer></>;
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
  return <aside className="adminNav" aria-label="Operations navigation">{adminLinks.map(([href, label]) => { const active = pathname === href || (href !== '/admin/dashboard' && pathname.startsWith(`${href}/`)); return <Link key={href} href={href} className={active ? 'active' : undefined} aria-current={active ? 'page' : undefined}>{label === 'Rooms & Inventory' ? <BedDouble size={15} aria-hidden="true" /> : <UiIcon name="grid" size={15} />}<span>{label}</span></Link>; })}<button className="adminSignOut" type="button" onClick={() => void signOut()}>Sign out</button></aside>;
}

function LegacyAgentShell({ title, user, onLogout, children }: { title: string; user: { name: string; email: string }; onLogout: () => void; children: React.ReactNode }) {
  const links = [['/agent', 'Dashboard'], ['/agent/rate-plans', 'My Rate Plans'], ['/agent/bookings', 'My Bookings'], ['/agent/wallet', 'Wallet'], ['/agent/book', 'Create Booking']] as const;
  const agentPathname = usePathname();
  const activeAgentLink = (href: string) => href === '/agent' ? agentPathname === href : agentPathname === href || agentPathname.startsWith(`${href}/`);
  if (title !== 'Create Booking') return <main className="legacyAgentShell"><header className="legacyAgentHeader"><div className="legacyAgentBrand"><span className="legacyAgentLogo">RW</span><b>RAINWOOD</b><small>HOTELS</small></div><div className="legacyAgentGreeting">Hi, {user.name}<span>RainWood Hotels</span></div><div className="legacyAgentHeaderLinks"><Link href="/agent">Profile</Link><Link href="/agent/rate-plans">KYC</Link><Link href="/agent">Announcements</Link><button type="button" onClick={onLogout}>Sign out</button></div></header><nav className="legacyAgentNav" aria-label="Agent navigation"><Link className={activeAgentLink('/agent') ? 'active' : undefined} href="/agent">Dashboard</Link><Link className={activeAgentLink('/agent/bookings') ? 'active' : undefined} href="/agent/bookings">My Bookings⌄</Link><Link className={activeAgentLink('/agent/rate-plans') || agentPathname === '/agent/wallet' ? 'active' : undefined} href="/agent/rate-plans">Settings⌄</Link><Link href="/agent/book">BOOK NOW</Link></nav><div className="legacyAgentSectionTitle">{title}</div><section className="legacyAgentContent legacyAgentPortalContent"><div className="pageTitle legacyAgentPageTitle"><div><span>Agent portal</span><h1>{title}</h1><p>{user.name} · {user.email}</p></div></div>{children}</section></main>;
  if (title === 'Create Booking') return <main className="legacyAgentShell"><header className="legacyAgentHeader"><div className="legacyAgentBrand"><span className="legacyAgentLogo">RW</span><b>RAINWOOD</b><small>HOTELS</small></div><div className="legacyAgentGreeting">Hi, {user.name}<span>RainWood Hotels</span></div><div className="legacyAgentHeaderLinks"><Link href="/agent">Profile</Link><Link href="/agent/rate-plans">KYC</Link><Link href="/agent">Announcements</Link><button type="button" onClick={onLogout}>Sign out</button></div></header><nav className="legacyAgentNav"><Link href="/agent">Dashboard</Link><Link href="/agent/bookings">My Bookings⌄</Link><Link href="/agent/rate-plans">Settings⌄</Link><Link className="active" href="/agent/book">BOOK NOW</Link></nav><div className="legacyAgentSectionTitle">Room Reservation</div><section className="legacyAgentContent">{children}</section></main>;
  return <main className="adminShell"><aside className="adminNav" aria-label="Agent navigation">{links.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}<button className="agentSignOut" type="button" onClick={onLogout}>Sign out</button></aside><section className="adminContent"><div className="pageTitle"><div><span>Agent portal</span><h1>{title}</h1><p>{user.name} · {user.email}</p></div></div>{children}</section></main>;
}

export function AgentShell({ title, user, onLogout, children }: { title: string; user: { name: string; email: string }; onLogout: () => void; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = (href: string) => href === '/agent' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  const bookingPage = title === 'Create Booking';
  return <main className="legacyAgentShell"><header className="legacyAgentHeader"><div className="legacyAgentBrand"><span className="legacyAgentLogo">RW</span><b>RAINWOOD</b><small>HOTELS</small></div><div className="legacyAgentGreeting">Hi, {user.name}<span>RainWood Hotels</span></div><div className="legacyAgentHeaderLinks"><Link href="/agent">Profile</Link><Link href="/agent/rate-plans">KYC</Link><Link href="/agent">Announcements</Link><button type="button" onClick={onLogout}>Sign out</button></div></header><nav className="legacyAgentNav" aria-label="Agent navigation"><Link className={active('/agent') ? 'active' : undefined} href="/agent">Dashboard</Link><Link className={active('/agent/rate-plans') ? 'active' : undefined} href="/agent/rate-plans">My Rate Plans</Link><Link className={active('/agent/bookings') ? 'active' : undefined} href="/agent/bookings">My Bookings</Link><Link className={active('/agent/wallet') ? 'active' : undefined} href="/agent/wallet">Wallet</Link><Link className={active('/agent/book') ? 'active' : undefined} href="/agent/book">Create Booking</Link></nav><div className="legacyAgentSectionTitle">{bookingPage ? 'Room Reservation' : title}</div><section className={`legacyAgentContent${bookingPage ? '' : ' legacyAgentPortalContent'}`}>{!bookingPage && <div className="pageTitle legacyAgentPageTitle"><div><span>Agent portal</span><h1>{title}</h1><p>{user.name} · {user.email}</p></div></div>}{children}</section></main>;
}

function AdminTopShell({ title, editClass, children }: { title: string; editClass: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = (href: string) => href === '/admin/dashboard' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  async function signOut() { try { await apiRequest('/auth/logout', { method: 'POST', body: JSON.stringify({ allDevices: false }) }); } catch { /* Local session is cleared below. */ } finally { invalidateStaffSession(); clearAccessToken(); window.location.href = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/login`; } }
  return <main className={`legacyAgentShell adminTopShell${editClass}`}><header className="legacyAgentHeader"><div className="legacyAgentBrand"><span className="legacyAgentLogo">RW</span><b>RAINWOOD</b><small>HOTELS</small></div><div className="legacyAgentGreeting">Hi, Admin<span>RainWood Hotels</span></div><div className="legacyAgentHeaderLinks"><Link href="/admin/dashboard">Profile</Link><Link href="/admin/contact-requests">Announcements</Link><button type="button" onClick={() => void signOut()}>Sign out</button></div></header><nav className="legacyAgentNav adminTopNav" aria-label="Admin navigation">{adminLinks.map(([href, label]) => <Link key={href} className={active(href) ? 'active' : undefined} href={href}>{label}</Link>)}</nav><div className="legacyAgentSectionTitle">{title}</div><section className="adminContent legacyAgentContent legacyAgentPortalContent adminTopContent"><div className="pageTitle legacyAgentPageTitle"><div><span>Operations</span><h1>{title}</h1></div></div>{children}</section></main>;
}

export function AdminLayout({ title, children }: { title: string; children: React.ReactNode }) {
  const hotelLayout = title === 'Hotels' || title === 'Edit Hotel' || title === 'Add Hotel';
  const editClass = hotelLayout ? ' hotelEditShell' : '';
  const oldHeaderLinks = [['/', 'Home'], ['/hotels', 'Hotels'], ['/booking', 'Book'], ['/contact', 'Contact'], ['/policies', 'Policies']];
  if (process.env.NEXT_PUBLIC_ADMIN_TOP_NAV !== 'false') return <AdminAuthGate><AdminTopShell title={title} editClass={editClass}>{children}</AdminTopShell></AdminAuthGate>;
  return <AdminAuthGate><main className={`adminShell adminAppShell${editClass}`}><header className="hotelGlobalHeader"><Link className="hotelHeaderBrand" href="/"><img src={fallbackLogoUrl} alt="RainWood Hotels" /><span className="hotelBrandFallback"><b>RAINWOOD</b><small>HOTELS</small></span></Link><label className="hotelHeaderSearch"><UiIcon name="search" size={17} /><input placeholder="Search by hotel name, code or city..." /></label><div className="hotelHeaderUser"><span className="hotelBell"><UiIcon name="bell" size={20} /><i>3</i></span><span className="hotelAvatar">A</span><span className="hotelUserText"><b>Admin</b><small>Hotel Manager</small></span><details className="hotelLinksMenu"><summary aria-label="Open website links"><UiIcon name="chevron" size={15} /></summary><div>{oldHeaderLinks.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}<Link href="/login">Staff Login</Link></div></details></div></header><AdminNav /><section className="adminContent"><div className="pageTitle"><div><span>Operations</span><h1>{title}</h1></div></div>{children}</section></main></AdminAuthGate>;
}
