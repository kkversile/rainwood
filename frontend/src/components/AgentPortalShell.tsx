'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { AgentUser } from './AgentData';

type AgentPortalShellProps = {
  title: string;
  user: AgentUser;
  onLogout: () => void;
  children: React.ReactNode;
};

function LockedLink({ label }: { label: string }) {
  return <span className="agentLockedLink" aria-disabled="true" title="Available after Admin approval">{label} 🔒<small>Available after Admin approval</small></span>;
}

export function AgentPortalShell({ title, user, onLogout, children }: AgentPortalShellProps) {
  const pathname = usePathname();
  const pending = user.onboardingStatus !== 'ACTIVE';
  const active = (href: string) => href === '/agent' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  const bookingPage = title === 'Create Booking';
  const bookingMenuActive = ['/agent/bookings', '/agent/wallet', '/agent/payment-advances', '/agent/billing-report', '/agent/special-offers', '/agent/transaction-report'].some((href) => active(href));
  const settingsMenuActive = ['/agent/settings', '/agent/profile'].some((href) => active(href));

  return <main className="legacyAgentShell">
    <header className="legacyAgentHeader">
      <div className="legacyAgentBrand"><span className="legacyAgentLogo">RW</span><b>RAINWOOD</b><small>HOTELS</small></div>
      <div className="legacyAgentGreeting">Hi, {user.name}<span>{pending ? 'Complete your onboarding' : 'RainWood Hotels'}</span></div>
      <div className="legacyAgentHeaderLinks"><Link href={pending ? '/agent/onboarding' : '/agent/profile'}>{pending ? 'Onboarding' : 'Profile'}</Link>{pending && <Link href="/agent/kyc">KYC</Link>}{!pending && <Link href="/agent/kyc">KYC</Link>}<button type="button" onClick={onLogout}>Sign out</button></div>
    </header>
    <nav className="legacyAgentNav" aria-label="Agent navigation">
      <Link className={active(pending ? '/agent/onboarding' : '/agent') ? 'active' : undefined} href={pending ? '/agent/onboarding' : '/agent'}>{pending ? 'Onboarding' : 'Dashboard'}</Link>
      {pending ? <>
        <Link className={active('/agent/profile') ? 'active' : undefined} href="/agent/profile">Profile</Link>
        <Link className={active('/agent/kyc') ? 'active' : undefined} href="/agent/kyc">KYC Documents</Link>
        <Link className={active('/agent/onboarding') ? 'active' : undefined} href="/agent/onboarding">Onboarding Status</Link>
        <LockedLink label="Hotels" />
        <LockedLink label="Availability" />
        <LockedLink label="Bookings" />
        <LockedLink label="Wallet" />
      </> : <>
        <Link className={active('/agent/rate-plans') ? 'active' : undefined} href="/agent/rate-plans">My Rate Plans</Link>
        <details className={`legacyAgentDropdown${bookingMenuActive ? ' active' : ''}`}>
          <summary>My Bookings <span aria-hidden="true">⌄</span></summary>
          <div className="legacyAgentDropdownMenu"><Link href="/agent/payment-advances">Payment Advances</Link><Link href="/agent/bookings">Booking Tracker</Link><Link href="/agent/billing-report">Billing Report</Link><Link href="/agent/special-offers">Special Offers</Link><Link href="/agent/transaction-report">Transaction Report</Link></div>
        </details>
        <details className={`legacyAgentDropdown${settingsMenuActive ? ' active' : ''}`}>
          <summary>Settings <span aria-hidden="true">⌄</span></summary>
          <div className="legacyAgentDropdownMenu"><Link href="/agent/settings/api-mapping">API Mapping Info</Link><Link href="/agent/settings/employees">Manage Employee</Link><Link href="/agent/settings/company-profile">Company Profile</Link><Link href="/agent/settings/tax-settings">Tax Settings</Link></div>
        </details>
        <Link className={active('/agent/wallet') ? 'active' : undefined} href="/agent/wallet">Wallet</Link>
        <Link className={active('/agent/book') ? 'active' : undefined} href="/agent/book">Create Booking</Link>
      </>}
    </nav>
    <div className="legacyAgentSectionTitle">{bookingPage ? <><span className="legacyAgentRoomTitle">Room Reservation</span><span className="legacyAgentStayTitle">Choose your stay</span></> : title}</div>
    <section className={`legacyAgentContent${bookingPage ? '' : ' legacyAgentPortalContent'}`}>
      {!bookingPage && <div className="pageTitle legacyAgentPageTitle"><div><span>{pending ? 'Agent onboarding' : 'Agent portal'}</span><h1>{title}</h1><p>{user.name} · {user.email}</p></div></div>}
      {children}
    </section>
  </main>;
}
