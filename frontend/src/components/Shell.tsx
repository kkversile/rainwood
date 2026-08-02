import Link from 'next/link';
import { AdminAuthGate } from './AdminData';

const links = [['/', 'Home'], ['/hotels', 'Hotels'], ['/booking', 'Book'], ['/contact', 'Contact'], ['/login', 'Staff']];
const adminLinks = [['/admin/dashboard', 'Dashboard'], ['/admin/reservations', 'Reservations'], ['/admin/payments', 'Payments'], ['/admin/reports', 'Reports'], ['/admin/axisrooms', 'AxisRooms'], ['/admin/jobs', 'Jobs'], ['/admin/users', 'Users'], ['/admin/audit-logs', 'Audit Logs']];

export function Shell({ children }: { children: React.ReactNode }) {
  return <><div className="topbar">RainWood Hotels · Official direct booking</div><header className="siteHeader"><Link className="brand" href="/">RAINWOOD <span>HOTELS</span></Link><nav aria-label="Primary navigation">{links.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}</nav></header>{children}<footer><div><b>RainWood Hotels</b><p>Direct booking, transparent rates and reservation support.</p></div><div><Link href="/policies">Policies</Link> · <Link href="/contact">Contact</Link></div></footer></>;
}

export function AdminNav() { return <aside className="adminNav" aria-label="Operations navigation">{adminLinks.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}<Link href="/login">Sign out</Link></aside>; }

export function AdminLayout({ title, children }: { title: string; children: React.ReactNode }) {
  return <AdminAuthGate><main className="adminShell"><AdminNav /><section className="adminContent"><div className="pageTitle"><div><span>Operations</span><h1>{title}</h1></div></div>{children}</section></main></AdminAuthGate>;
}
