 'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { BedDouble, Menu } from 'lucide-react';
import { AdminAuthGate, invalidateStaffSession, useAdminProfile } from './AdminData';
import { apiAssetUrl, apiRequest, clearAccessToken } from '../lib/api';
import { FeatureGate } from './FeatureGate';
import { FEATURE_KEYS, useAdminFeatureAccess, type FeatureAccessStatus } from '../lib/admin-features';
import { ADMIN_GROUPS, ADMIN_NAVIGATION, type AdminNavigationItem } from '../config/admin-navigation';

const links = [['/', 'Home'], ['/hotels', 'Hotels'], ['/booking', 'Book'], ['/contact', 'Contact'], ['/agent/login', 'Agent Login']];
type AdminLink = AdminNavigationItem;
export const legacyAdminLinks = [
  { key: 'dashboard', href: '/admin/dashboard', label: 'Dashboard' },
  { key: 'revenueForecast', href: '/admin/revenue-forecast', label: 'Revenue Forecast' },
  { key: 'manageHotels', href: '/admin/hotels', label: 'Manage Hotels' },
  { key: 'roomsInventory', href: '/admin/rooms-inventory', label: 'Rooms & Inventory' },
  { key: 'physicalRooms', href: '/admin/rooms', label: 'Physical Rooms' },
  { key: 'roomRack', href: '/admin/room-rack', label: 'Room Rack' },
  { key: 'housekeeping', href: '/admin/housekeeping', label: 'Housekeeping' },
  { key: 'maintenance', href: '/admin/maintenance', label: 'Maintenance' },
  { key: 'logbook', href: '/admin/logbook', label: 'Operations Logbook' },
  { key: 'banquets', href: '/admin/banquets', label: 'Banquets & Events' },
  { key: 'functionSpaces', href: '/admin/function-spaces', label: 'Function Spaces' },
  { key: 'ratePlans', href: '/admin/rate-plans', label: 'Rate Plans' },
  { key: 'rates', href: '/admin/rates', label: 'Rate Master' },
  { key: 'rateCalendar', href: '/admin/rate-calendar', label: 'Rate Calendar' },
  { key: 'rateSeasons', href: '/admin/rate-seasons', label: 'Rate Seasons' },
  { key: 'yieldRules', href: '/admin/yield-rules', label: 'Yield Rules' },
  { key: 'rateSimulator', href: '/admin/rate-simulator', label: 'Rate Simulator' },
  { key: 'promotions', href: '/admin/promotions', label: 'Promotions' },
  { key: 'rateImport', href: '/admin/base-rate-import', label: 'Rate Import' },
  { key: 'supplementaryCharges', href: '/admin/supplementary-charges', label: 'Supplementary Charges' },
  { key: 'expenses', href: '/admin/expenses', label: 'Expenses' },
  { key: 'serviceItems', href: '/admin/service-items', label: 'Service Items' },
  { key: 'cashier', href: '/admin/cashier', label: 'Cashier Shift' },
  { key: 'taxSettings', href: '/admin/tax-settings', label: 'Tax Settings' },
  { key: 'taxInvoices', href: '/admin/tax-invoices', label: 'Tax Invoices' },
  { key: 'creditNotes', href: '/admin/credit-notes', label: 'Credit Notes' },
  { key: 'tds', href: '/admin/tds', label: 'TDS Register' },
  { key: 'agents', href: '/admin/agents', label: 'Agents' },
  { key: 'corporates', href: '/admin/corporates', label: 'Corporates' },
  { key: 'inquiries', href: '/admin/inquiries', label: 'Inquiries' },
  { key: 'reservations', href: '/admin/reservations', label: 'Reservations' },
  { key: 'groups', href: '/admin/groups', label: 'Groups & Room Blocks' },
  { key: 'frontDesk', href: '/admin/front-desk', label: 'Front Desk' },
  { key: 'arrivals', href: '/admin/arrivals', label: 'Arrivals' },
  { key: 'inHouse', href: '/admin/in-house', label: 'In-house' },
  { key: 'lostFound', href: '/admin/lost-found', label: 'Lost & Found' },
  { key: 'guests', href: '/admin/guests', label: 'Guests' },
  { key: 'nightAudit', href: '/admin/night-audit', label: 'Night Audit' },
  { key: 'contactRequests', href: '/admin/contact-requests', label: 'Contact Requests' },
  { key: 'payments', href: '/admin/payments', label: 'Payments' },
  { key: 'reports', href: '/admin/reports', label: 'Reports' },
  { key: 'axisRooms', href: '/admin/axisrooms', label: 'AxisRooms' },
  { key: 'jobs', href: '/admin/jobs', label: 'Jobs' },
  { key: 'users', href: '/admin/users', label: 'Users' },
  { key: 'siteSettings', href: '/admin/settings', label: 'Site Settings' },
  { key: 'features', href: '/admin/features', label: 'Features', superAdminOnly: true },
  { key: 'auditLogs', href: '/admin/audit-logs', label: 'Audit Logs' },
] as const satisfies readonly AdminLink[];
export const adminLinks = ADMIN_NAVIGATION as readonly AdminLink[];
const reservationLinks = new Set(['/admin/dashboard', '/admin/reservations', '/admin/front-desk', '/admin/room-rack', '/admin/arrivals', '/admin/in-house', '/admin/lost-found', '/admin/guests', '/admin/payments', '/admin/reports', '/admin/inquiries', '/admin/cashier', '/admin/tax-invoices', '/admin/logbook', '/admin/groups', '/admin/banquets', '/admin/function-spaces']);
const propertyHiddenLinks = new Set(['/admin/hotels', '/admin/settings', '/admin/axisrooms', '/admin/jobs', '/admin/audit-logs']);
export const legacyAdminGroupDefinitions = [
  { key: 'operations', label: 'Operations', itemKeys: ['roomsInventory', 'physicalRooms', 'roomRack', 'housekeeping', 'maintenance', 'logbook', 'banquets', 'functionSpaces', 'supplementaryCharges', 'expenses', 'serviceItems', 'cashier'] },
  { key: 'reservations', label: 'Reservations', itemKeys: ['reservations', 'groups', 'frontDesk', 'arrivals', 'inHouse', 'lostFound', 'payments', 'contactRequests'] },
  { key: 'revenue', label: 'Revenue', itemKeys: ['revenueForecast', 'ratePlans', 'rates', 'rateCalendar', 'rateSeasons', 'yieldRules', 'rateSimulator', 'promotions', 'rateImport'] },
  { key: 'crmSales', label: 'CRM & Sales', itemKeys: ['guests', 'agents', 'corporates', 'inquiries'] },
  { key: 'reports', label: 'Reports', itemKeys: ['reports', 'taxInvoices', 'creditNotes', 'tds', 'nightAudit'] },
  { key: 'system', label: 'System', itemKeys: ['manageHotels', 'taxSettings', 'axisRooms', 'jobs', 'users', 'siteSettings', 'features', 'auditLogs'] },
] as const;
const adminGroupDefinitions = ADMIN_GROUPS;

export function allowedAdminLinksForRole(role?: string | null): readonly AdminLink[] {
  if (!role) return [];
  if (role === 'SUPER_ADMIN') return adminLinks;
  if (role === 'RESERVATION') return adminLinks.filter((item) => reservationLinks.has(item.href));
  if (role === 'ADMIN') return adminLinks.filter((item) => !propertyHiddenLinks.has(item.href));
  if (role === 'CORPORATE_ADMIN') return adminLinks.filter((item) => item.href !== '/admin/settings');
  if (role === 'ACCOUNTS') return adminLinks.filter((item) => ['/admin/dashboard', '/admin/payments', '/admin/reports', '/admin/expenses', '/admin/corporates', '/admin/lost-found', '/admin/cashier', '/admin/tax-settings', '/admin/tax-invoices', '/admin/credit-notes', '/admin/tds', '/admin/logbook', '/admin/groups', '/admin/banquets', '/admin/function-spaces'].includes(item.href));
  if (role === 'VIEWER') return adminLinks.filter((item) => ['/admin/dashboard', '/admin/reports', '/admin/tax-invoices', '/admin/credit-notes', '/admin/tds', '/admin/logbook', '/admin/groups', '/admin/banquets', '/admin/function-spaces'].includes(item.href));
  return [];
}

export function filterAdminLinksByFeatures(allowedLinks: readonly AdminLink[], role: string | null | undefined, features: Record<string, boolean>, status: FeatureAccessStatus = 'ready') {
  return allowedLinks.filter((item) => {
    if (role === 'SUPER_ADMIN') return true;
    if (item.superAdminOnly) return false;
    const featureKey = item.featureKey ?? item.key;
    if (!FEATURE_KEYS.includes(featureKey as any)) return true;
    return status === 'ready' && features[featureKey] === true;
  });
}

export function canAccessAdminRoute(role: string | null | undefined, href: string) {
  return allowedAdminLinksForRole(role).some((item) => item.href === href && (!item.superAdminOnly || role === 'SUPER_ADMIN'));
}

export function linksForRole(role?: string | null) {
  return allowedAdminLinksForRole(role).map(({ href, label }) => [href, label] as const);
}

export function buildNavigationGroups(allowedLinks: readonly AdminLink[]) {
  const allowedByKey = new Map(allowedLinks.map((item) => [item.key, item]));
  return adminGroupDefinitions.map((group) => ({ ...group, items: group.itemKeys.map((key) => allowedByKey.get(key)).filter((item): item is AdminLink => Boolean(item)) })).filter((group) => group.items.length > 0);
}

export function isAdminRouteActive(pathname: string, href: string) {
  return href === '/admin/dashboard' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function GroupedAdminNavigation({ links: allowedLinks, pathname, collapsed, onNavigate }: { links: readonly AdminLink[]; pathname: string; collapsed: boolean; onNavigate?: () => void }) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const groups = buildNavigationGroups(allowedLinks);
  const dashboard = allowedLinks.find((item) => item.key === 'dashboard');

  useEffect(() => {
    if (!openGroup) return;
    const onPointerDown = (event: PointerEvent) => { if (!navRef.current?.contains(event.target as Node)) setOpenGroup(null); };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpenGroup(null); };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('pointerdown', onPointerDown); document.removeEventListener('keydown', onKeyDown); };
  }, [openGroup]);

  return <aside ref={navRef} className={`adminSidebar${collapsed ? ' is-collapsed' : ''}`} aria-label="Admin navigation">
    <div className="adminSidebarBrand"><span className="legacyAgentLogo">RW</span><span className="adminSidebarBrandText"><b>RAINWOOD</b><small>HOTELS</small></span></div>
    <div className="adminSidebarSearch"><UiIcon name="search" size={16} /><span>Search menu...</span></div>
    <nav className="adminSidebarNav">
      {dashboard && <Link className={isAdminRouteActive(pathname, dashboard.href) ? 'active' : undefined} aria-current={isAdminRouteActive(pathname, dashboard.href) ? 'page' : undefined} href={dashboard.href} onClick={onNavigate}><span className="adminNavIcon" aria-hidden="true">▦</span><span className="adminNavLabel">{dashboard.label}</span></Link>}
    {groups.map((group) => {
      const active = group.items.some((item) => isAdminRouteActive(pathname, item.href));
      const open = openGroup === group.key;
      return <div className={`adminNavGroup adminNavGroup-${group.key}${open ? ' is-open' : ''}`} key={group.key}>
        <button className={`adminNavGroupButton${active ? ' active' : ''}${open ? ' open' : ''}`} type="button" aria-haspopup="menu" aria-expanded={open} aria-controls={`admin-nav-menu-${group.key}`} onClick={() => setOpenGroup(openGroup === group.key ? null : group.key)}>{group.label}<span aria-hidden="true">⌄</span></button>
        <div className={`adminNavDropdown${open ? ' is-visible' : ''}`} id={`admin-nav-menu-${group.key}`} role="menu" aria-label={`${group.label} navigation`} aria-hidden={!open}>{group.items.map((item) => <Link key={item.key} role="menuitem" className={isAdminRouteActive(pathname, item.href) ? 'active' : undefined} aria-current={isAdminRouteActive(pathname, item.href) ? 'page' : undefined} href={item.href} onClick={onNavigate}>{item.label}</Link>)}</div>
      </div>;
    })}
    </nav>
  </aside>;
}
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
  if (pathname.startsWith('/staff')) return <>{children}</>;
  return <><div className="topbar">RainWood Hotels · Official direct booking</div><header className="siteHeader"><Link className="brand" href="/">{logoUrl ? <img className="siteLogo" src={apiAssetUrl(logoUrl)} alt="RainWood Hotels" style={{ display: 'block', maxWidth: '180px', maxHeight: '48px', width: 'auto', height: 'auto', objectFit: 'contain' }} /> : <>RAINWOOD <span>HOTELS</span></>}</Link><nav aria-label="Primary navigation">{visibleLinks.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}<StaffDashboardLink /></nav></header>{children}<footer><div><b>RainWood Hotels</b><p>Direct booking, transparent rates and reservation support.</p></div><div><Link href="/policies">Policies</Link> · <Link href="/contact">Contact</Link></div></footer></>;
}

function StaffDashboardLink() {
  const [signedIn, setSignedIn] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  useEffect(() => { const sync = () => { apiRequest<{ user: { role: string } }>('/auth/me').then((body) => { setSignedIn(true); setRole(body.user.role); }).catch(() => { setSignedIn(false); setRole(null); }); }; sync(); window.addEventListener('rainwood-auth-change', sync); return () => window.removeEventListener('rainwood-auth-change', sync); }, []);
  return <Link href={signedIn ? (role === 'AGENT' ? '/agent' : role === 'SERVICE_STAFF' ? '/staff' : '/admin/dashboard') : '/login'}>{signedIn ? 'Dashboard' : 'Staff Login'}</Link>;
}

export function AdminNav() {
  const pathname = usePathname();
  const { profile } = useAdminProfile();
  const role = profile?.role;
  const featureAccess = useAdminFeatureAccess();
  async function signOut() { try { await apiRequest('/auth/logout', { method: 'POST', body: JSON.stringify({ allDevices: false }) }); } catch { /* The local session is still cleared below. */ } finally { invalidateStaffSession(); clearAccessToken(); window.location.href = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/login`; } }
  const visible = filterAdminLinksByFeatures(allowedAdminLinksForRole(role), role, featureAccess.features, featureAccess.status);
  return <aside className="adminNav" aria-label="Operations navigation">{visible.map(({ href, label }) => { const active = pathname === href || (href !== '/admin/dashboard' && pathname.startsWith(`${href}/`)); return <Link key={href} href={href} className={active ? 'active' : undefined} aria-current={active ? 'page' : undefined}>{label === 'Rooms & Inventory' ? <BedDouble size={15} aria-hidden="true" /> : <UiIcon name="grid" size={15} />}<span>{label}</span></Link>; })}<button className="adminSignOut" type="button" onClick={() => void signOut()}>Sign out</button></aside>;
}

function LegacyAgentShell({ title, user, onLogout, children }: { title: string; user: { name: string; email: string }; onLogout: () => void; children: React.ReactNode }) {
  const links = [['/agent', 'Dashboard'], ['/agent/rate-plans', 'My Rates'], ['/agent/bookings', 'My Bookings'], ['/agent/wallet', 'Wallet'], ['/agent/book', 'Create Booking']] as const;
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
  return <main className="legacyAgentShell"><header className="legacyAgentHeader"><div className="legacyAgentBrand"><span className="legacyAgentLogo">RW</span><b>RAINWOOD</b><small>HOTELS</small></div><div className="legacyAgentGreeting">Hi, {user.name}<span>RainWood Hotels</span></div><div className="legacyAgentHeaderLinks"><Link href="/agent">Profile</Link><Link href="/agent/rate-plans">KYC</Link><Link href="/agent">Announcements</Link><button type="button" onClick={onLogout}>Sign out</button></div></header><nav className="legacyAgentNav" aria-label="Agent navigation"><Link className={active('/agent') ? 'active' : undefined} href="/agent">Dashboard</Link><Link className={active('/agent/rate-plans') ? 'active' : undefined} href="/agent/rate-plans">My Rates</Link><Link className={active('/agent/bookings') ? 'active' : undefined} href="/agent/bookings">My Bookings</Link><Link className={active('/agent/wallet') ? 'active' : undefined} href="/agent/wallet">Wallet</Link><Link className={active('/agent/book') ? 'active' : undefined} href="/agent/book">Create Booking</Link></nav><div className="legacyAgentSectionTitle">{bookingPage ? 'Room Reservation' : title}</div><section className={`legacyAgentContent${bookingPage ? '' : ' legacyAgentPortalContent'}`}>{!bookingPage && <div className="pageTitle legacyAgentPageTitle"><div><span>Agent portal</span><h1>{title}</h1><p>{user.name} · {user.email}</p></div></div>}{children}</section></main>;
}

function AdminTopShell({ title, editClass, children }: { title: string; editClass: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const { profile } = useAdminProfile();
  const role = profile?.role;
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const featureAccess = useAdminFeatureAccess();
  const visibleAdminLinks = filterAdminLinksByFeatures(allowedAdminLinksForRole(role), role, featureAccess.features, featureAccess.status);
  async function signOut() { try { await apiRequest('/auth/logout', { method: 'POST', body: JSON.stringify({ allDevices: false }) }); } catch { /* Local session is cleared below. */ } finally { invalidateStaffSession(); clearAccessToken(); window.location.href = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/login`; } }
  const greeting = profile?.name ?? 'Staff';
  const organization = profile?.role === 'CORPORATE_ADMIN' ? 'Corporate Administration' : profile?.staffHotel?.name ?? (profile?.role === 'RESERVATION' ? 'Front Office' : 'RainWood Hotels');
  const contactRequestsVisible = featureAccess.status === 'ready' && featureAccess.isEnabled('contactRequests');
  const toggleNavigation = () => { if (window.innerWidth <= 820) setMobileNavOpen((open) => !open); else setSidebarCollapsed((collapsed) => !collapsed); };
  return <main className={`legacyAgentShell adminTopShell adminSidebarShell${editClass}${sidebarCollapsed ? ' is-sidebar-collapsed' : ''}${mobileNavOpen ? ' is-mobile-nav-open' : ''}`}><GroupedAdminNavigation links={visibleAdminLinks} pathname={pathname} collapsed={sidebarCollapsed} onNavigate={() => setMobileNavOpen(false)} /><div className="adminSidebarMain"><header className="adminSidebarTopbar"><button className="adminSidebarToggle" type="button" aria-label={mobileNavOpen || !sidebarCollapsed ? 'Collapse navigation' : 'Expand navigation'} aria-expanded={mobileNavOpen || !sidebarCollapsed} onClick={toggleNavigation}><Menu size={20} aria-hidden="true" /></button><div className="adminSidebarGreeting">Hi, {greeting}<span>{organization}</span></div><div className="adminSidebarHeaderLinks">{canAccessAdminRoute(role, '/admin/contact-requests') && contactRequestsVisible && <Link href="/admin/contact-requests" onClick={() => setMobileNavOpen(false)}>Contact Requests</Link>}{canAccessAdminRoute(role, '/admin/reservations') && <Link href="/agent/login" onClick={() => setMobileNavOpen(false)}>Agent Login</Link>}<button type="button" onClick={() => void signOut()}>Sign out</button></div></header>{pathname === '/admin/dashboard' && <OperationsCommandBar role={role} featureAccess={featureAccess} />}<div className="legacyAgentSectionTitle">{title}</div><section className="adminContent legacyAgentContent legacyAgentPortalContent adminTopContent"><FeatureGate>{children}</FeatureGate></section></div></main>;
}

function OperationsCommandBar({ role, featureAccess }: { role?: string; featureAccess: ReturnType<typeof useAdminFeatureAccess> }) {
  const router = useRouter();
  const barRef = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState('');
  const [hotelId, setHotelId] = useState('');
  const [businessDate, setBusinessDate] = useState('');
  const [hotels, setHotels] = useState<{ id: string; name: string }[]>([]);
  const [results, setResults] = useState<{ reference: string; guestName: string; checkIn: string; status: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeResultIndex, setActiveResultIndex] = useState(-1);
  const reservationAccess = canAccessAdminRoute(role, '/admin/reservations') && featureAccess.status === 'ready' && featureAccess.isEnabled('reservations');
  useEffect(() => { if (!reservationAccess) return; apiRequest<{ id: string; name: string }[]>('/hotels').then(setHotels).catch(() => setHotels([])); }, [reservationAccess]);
  useEffect(() => {
    const query = value.trim();
    if (!reservationAccess || !query) { setResults([]); setSearching(false); return;
    }
    setSearching(true);
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ search: query, page: '1', limit: '5' });
      if (hotelId) params.set('hotelId', hotelId);
      apiRequest<{ items: { reference: string; guestName: string; checkIn: string; status: string }[] }>(`/reservations?${params}`)
        .then((body) => { setResults(body.items); setActiveResultIndex(-1); })
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [hotelId, reservationAccess, value]);
  useEffect(() => {
    const input = barRef.current?.querySelector('input');
    const panel = barRef.current?.querySelector('.operationsCommandResults');
    if (!input) return;
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-expanded', String(Boolean(open && value.trim())));
    input.setAttribute('aria-controls', 'operations-command-results');
    if (panel) {
      panel.id = 'operations-command-results';
      panel.setAttribute('role', 'listbox');
      panel.querySelectorAll('a').forEach((option, index) => {
        option.setAttribute('role', 'option');
        option.id = `operations-command-result-${index}`;
        option.setAttribute('aria-selected', String(index === activeResultIndex));
        option.classList.toggle('active', index === activeResultIndex);
      });
      if (activeResultIndex >= 0 && activeResultIndex < results.length) input.setAttribute('aria-activedescendant', `operations-command-result-${activeResultIndex}`);
      else input.removeAttribute('aria-activedescendant');
    }
  }, [activeResultIndex, open, results, value]);
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as Node | null;
      if (!open || !value.trim() || !barRef.current?.contains(target) || !results.length) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault(); event.stopPropagation();
        setActiveResultIndex((current) => event.key === 'ArrowDown' ? (current + 1) % results.length : (current <= 0 ? results.length - 1 : current - 1));
      } else if (event.key === 'Enter' && activeResultIndex >= 0) {
        event.preventDefault(); event.stopPropagation();
        router.push(`/admin/reservations?open=${encodeURIComponent(results[activeResultIndex].reference)}`); setOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [activeResultIndex, open, results, router, value]);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!barRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  if (!reservationAccess) return null;
  function search() { const params = new URLSearchParams(); if (value.trim()) params.set('search', value.trim()); if (hotelId) params.set('hotelId', hotelId); if (businessDate) { params.set('from', businessDate); params.set('to', businessDate); } router.push(`/admin/reservations${params.toString() ? `?${params.toString()}` : ''}`); setOpen(false); }
  return <div ref={barRef} className="operationsCommandBar"><label><span className="srOnly">Search reservations</span><input value={value} onFocus={() => setOpen(Boolean(value.trim()))} onChange={(event) => { setValue(event.target.value); setOpen(Boolean(event.target.value.trim())); }} onKeyDown={(event) => { if (event.key === 'Enter') search(); if (event.key === 'Escape') { setValue(''); setResults([]); setOpen(false); } }} placeholder="Search booking, guest, mobile or email…" /></label><label><span className="srOnly">Operations scope</span><select aria-label="Operations scope" value={hotelId} onChange={(event) => setHotelId(event.target.value)}><option value="">All hotels</option>{hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name}</option>)}</select></label><label><span className="srOnly">Business date</span><input aria-label="Business date" type="date" value={businessDate} onChange={(event) => setBusinessDate(event.target.value)} /></label><button className="smallBtn" type="button" onClick={search}>Search</button><Link className="smallBtn secondary" href="/admin/reservations?create=1">+ New Reservation</Link>{open && value.trim() && <div className="operationsCommandResults" role="dialog" aria-label="Reservation search results">{searching ? <p role="status">Searching reservations…</p> : results.length ? results.map((item) => <Link key={item.reference} href={`/admin/reservations?search=${encodeURIComponent(item.reference)}`} onClick={() => setOpen(false)}><b>{item.reference}</b><span>{item.guestName} · {item.checkIn.slice(0, 10)} · {item.status}</span></Link>) : <p role="status">No reservations found. Press Enter to open the full search.</p>}</div>}</div>;
}

export function AdminLayout({ title, children }: { title: string; children: React.ReactNode }) {
  const hotelLayout = title === 'Hotels' || title === 'Edit Hotel' || title === 'Add Hotel';
  const editClass = hotelLayout ? ' hotelEditShell' : '';
  const oldHeaderLinks = [['/', 'Home'], ['/hotels', 'Hotels'], ['/booking', 'Book'], ['/contact', 'Contact'], ['/policies', 'Policies']];
  if (process.env.NEXT_PUBLIC_ADMIN_TOP_NAV !== 'false') return <AdminAuthGate><AdminTopShell title={title} editClass={editClass}>{children}</AdminTopShell></AdminAuthGate>;
  return <AdminAuthGate><main className={`adminShell adminAppShell${editClass}`}><header className="hotelGlobalHeader"><Link className="hotelHeaderBrand" href="/"><img src={fallbackLogoUrl} alt="RainWood Hotels" /><span className="hotelBrandFallback"><b>RAINWOOD</b><small>HOTELS</small></span></Link><label className="hotelHeaderSearch"><UiIcon name="search" size={17} /><input placeholder="Search by hotel name, code or city..." /></label><div className="hotelHeaderUser"><span className="hotelBell"><UiIcon name="bell" size={20} /><i>3</i></span><LegacyAdminIdentity /><details className="hotelLinksMenu"><summary aria-label="Open website links"><UiIcon name="chevron" size={15} /></summary><div>{oldHeaderLinks.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}<Link href="/login">Staff Login</Link></div></details></div></header><AdminNav /><section className="adminContent"><div className="pageTitle"><div><span>Operations</span><h1>{title}</h1></div></div>{children}</section></main></AdminAuthGate>;
}

function LegacyAdminIdentity() {
  const { profile } = useAdminProfile();
  const name = profile?.name ?? 'Staff';
  const role = profile?.role?.replace(/_/g, ' ') ?? 'Staff';
  const hotel = profile?.role === 'CORPORATE_ADMIN' ? 'Corporate Administration' : profile?.staffHotel?.name ?? 'RainWood Hotels';
  return <><span className="hotelAvatar">{name.slice(0, 1).toUpperCase()}</span><span className="hotelUserText"><b>{name}</b><small>{role} · {hotel}</small></span></>;
}
