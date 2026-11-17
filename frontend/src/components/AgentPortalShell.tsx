'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { LockKeyhole, Menu, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import type { AgentUser } from './AgentData';
import { useNavigationDialog } from '../lib/use-navigation-dialog';

type AgentPortalShellProps = {
  title: string;
  user: AgentUser;
  onLogout: () => void;
  children: React.ReactNode;
};

function LockedLink({ label }: { label: string }) {
  return <span className="agentLockedLink" aria-disabled="true" title="Available after Admin approval">{label} <LockKeyhole size={14} aria-hidden="true" /><small>Available after Admin approval</small></span>;
}

export function AgentPortalShell({ title, user, onLogout, children }: AgentPortalShellProps) {
  const pathname = usePathname();
  const [navigationOpen, setNavigationOpen] = useState(false);
  useEffect(() => { setNavigationOpen(false); }, [pathname]);
  const [mobile, setMobile] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 820px)');
    const resize = () => { setMobile(media.matches); setNavigationOpen(false); };
    resize(); media.addEventListener('change', resize);
    return () => media.removeEventListener('change', resize);
  }, []);
  useNavigationDialog(mobile && navigationOpen, navRef, toggleRef, () => setNavigationOpen(false));
  const pending = user.onboardingStatus !== 'ACTIVE';
  const active = (href: string) => href === '/agent' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  const bookingPage = title === 'Create Booking';
  const bookingMenuActive = ['/agent/bookings', '/agent/wallet', '/agent/payment-advances', '/agent/billing-report', '/agent/special-offers', '/agent/transaction-report'].some((href) => active(href));
  const settingsMenuActive = ['/agent/settings', '/agent/profile'].some((href) => active(href));

  return <main className="legacyAgentShell rainwoodPortalShell rainwoodAgentWorkspace">
    <header className="legacyAgentHeader" inert={mobile && navigationOpen}>
      <button ref={toggleRef} className="rwPortalToggle" type="button" aria-label={navigationOpen ? 'Close agent navigation' : 'Open agent navigation'} aria-expanded={navigationOpen} aria-controls="agent-portal-navigation" onClick={() => setNavigationOpen(!navigationOpen)}>{navigationOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}</button>
      <div className="legacyAgentBrand"><span className="legacyAgentLogo">RW</span><b>RAINWOOD</b><small>HOTELS</small></div>
      <div className="legacyAgentGreeting">Hi, {user.name}<span>{pending ? 'Complete your onboarding' : 'RainWood Hotels'}</span></div>
      <div className="legacyAgentHeaderLinks"><Link href={pending ? '/agent/onboarding' : '/agent/profile'}>{pending ? 'Onboarding' : 'Profile'}</Link>{pending && <Link href="/agent/kyc">KYC</Link>}{!pending && <Link href="/agent/kyc">KYC</Link>}<button type="button" onClick={onLogout}>Sign out</button></div>
    </header>
    {navigationOpen && <button className="rwPortalBackdrop" type="button" aria-label="Dismiss agent navigation" tabIndex={-1} onClick={() => setNavigationOpen(false)} />}
    <nav ref={navRef} inert={mobile && !navigationOpen} aria-hidden={mobile && !navigationOpen ? true : undefined} role={mobile && navigationOpen ? "dialog" : undefined} aria-modal={mobile && navigationOpen ? true : undefined} id="agent-portal-navigation" className={`legacyAgentNav${navigationOpen ? ' is-open' : ''}`} aria-label="Agent navigation" onClick={(event) => { if ((event.target as HTMLElement).closest('a')) setNavigationOpen(false); }}>
      {mobile && navigationOpen && <button className="rwPortalDrawerClose" type="button" aria-label="Close agent navigation" onClick={() => setNavigationOpen(false)}><X size={20} aria-hidden="true" /></button>}
      <Link aria-current={active(pending ? '/agent/onboarding' : '/agent') ? 'page' : undefined} className={active(pending ? '/agent/onboarding' : '/agent') ? 'active' : undefined} href={pending ? '/agent/onboarding' : '/agent'}>{pending ? 'Onboarding' : 'Dashboard'}</Link>
      {pending ? <>
        <Link className={active('/agent/profile') ? 'active' : undefined} href="/agent/profile">Profile</Link>
        <Link className={active('/agent/kyc') ? 'active' : undefined} href="/agent/kyc">KYC Documents</Link>
        <Link className={active('/agent/onboarding') ? 'active' : undefined} href="/agent/onboarding">Onboarding Status</Link>
        <LockedLink label="Hotels" />
        <LockedLink label="Availability" />
        <LockedLink label="Bookings" />
        <LockedLink label="Wallet" />
      </> : <>
        <Link aria-current={active('/agent/rate-plans') ? 'page' : undefined} className={active('/agent/rate-plans') ? 'active' : undefined} href="/agent/rate-plans">My Rates</Link>
        <details open={bookingMenuActive} className={`legacyAgentDropdown${bookingMenuActive ? ' active' : ''}`}>
          <summary>My Bookings <span aria-hidden="true">⌄</span></summary>
          <div className="legacyAgentDropdownMenu"><Link className={active('/agent/payment-advances') ? 'active' : undefined} aria-current={active('/agent/payment-advances') ? 'page' : undefined} href="/agent/payment-advances">Payment Advances</Link><Link className={active('/agent/bookings') ? 'active' : undefined} aria-current={active('/agent/bookings') ? 'page' : undefined} href="/agent/bookings">Booking Tracker</Link><Link className={active('/agent/billing-report') ? 'active' : undefined} aria-current={active('/agent/billing-report') ? 'page' : undefined} href="/agent/billing-report">Billing Report</Link><Link className={active('/agent/special-offers') ? 'active' : undefined} aria-current={active('/agent/special-offers') ? 'page' : undefined} href="/agent/special-offers">Special Offers</Link><Link className={active('/agent/transaction-report') ? 'active' : undefined} aria-current={active('/agent/transaction-report') ? 'page' : undefined} href="/agent/transaction-report">Transaction Report</Link></div>
        </details>
        <details open={settingsMenuActive} className={`legacyAgentDropdown${settingsMenuActive ? ' active' : ''}`}>
          <summary>Settings <span aria-hidden="true">⌄</span></summary>
          <div className="legacyAgentDropdownMenu"><Link className={active('/agent/settings/api-mapping') ? 'active' : undefined} aria-current={active('/agent/settings/api-mapping') ? 'page' : undefined} href="/agent/settings/api-mapping">API Mapping Info</Link><Link className={active('/agent/settings/employees') ? 'active' : undefined} aria-current={active('/agent/settings/employees') ? 'page' : undefined} href="/agent/settings/employees">Manage Employee</Link><Link className={active('/agent/settings/company-profile') ? 'active' : undefined} aria-current={active('/agent/settings/company-profile') ? 'page' : undefined} href="/agent/settings/company-profile">Company Profile</Link><Link className={active('/agent/settings/tax-settings') ? 'active' : undefined} aria-current={active('/agent/settings/tax-settings') ? 'page' : undefined} href="/agent/settings/tax-settings">Tax Settings</Link></div>
        </details>
        <Link aria-current={active('/agent/announcements') ? 'page' : undefined} className={active('/agent/announcements') ? 'active' : undefined} href="/agent/announcements">Announcements</Link>
        <Link aria-current={active('/agent/wallet') ? 'page' : undefined} className={active('/agent/wallet') ? 'active' : undefined} href="/agent/wallet">Wallet</Link>
        <Link aria-current={active('/agent/book') ? 'page' : undefined} className={active('/agent/book') ? 'active' : undefined} href="/agent/book">Create Booking</Link>
      </>}
    </nav>
    <div className="legacyAgentSectionTitle">{bookingPage ? <><span className="legacyAgentRoomTitle">Room Reservation</span><span className="legacyAgentStayTitle">Choose your stay</span></> : title}</div>
    <section inert={mobile && navigationOpen} className={`legacyAgentContent${bookingPage ? '' : ' legacyAgentPortalContent'}`}>
      <div className="pageTitle legacyAgentPageTitle"><div><span>{pending ? 'Agent onboarding' : 'Agent portal'}</span><h1>{title}</h1><p>{user.name} · {user.email}</p></div></div>
      {children}
    </section>
  </main>;
}
