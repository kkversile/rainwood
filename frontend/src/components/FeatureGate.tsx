'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAdminFeatureAccess, featureKeyForPath, FEATURE_LABELS } from '../lib/admin-features';
import { useAdminProfile } from './AdminData';

export function FeatureGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { profile } = useAdminProfile();
  const access = useAdminFeatureAccess();
  const key = featureKeyForPath(pathname);
  if (!key || profile?.role === 'SUPER_ADMIN' || (access.status === 'ready' && access.isEnabled(key))) return <>{children}</>;
  if (access.status === 'idle' || access.status === 'loading') return <section className="featureCheckState" role="status"><h2>Checking feature access</h2><p>Verifying access for this hotel...</p></section>;
  if (access.status === 'error') return <section className="featureCheckState featureCheckError" role="alert"><h2>Unable to verify feature access</h2><p>The feature is temporarily unavailable until access can be verified.</p><button className="btn" type="button" onClick={access.retry}>Retry</button></section>;
  return <section className="featureUnavailable" role="alert"><span>Feature not available</span><h2>{FEATURE_LABELS[key]}</h2><p>This feature is not enabled for this hotel. Contact a system administrator if you need access.</p><Link className="btn" href="/admin/dashboard">Back to Dashboard</Link></section>;
}
