import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiRequest } from './api';
import { useAdminProfile } from '../components/AdminData';
import { ADMIN_GROUPS, FEATURE_NAVIGATION_ITEMS } from '../config/admin-navigation';
import { ADMIN_FEATURE_CATALOG } from '../config/admin-feature-catalog';

const UNIQUE_FEATURE_ITEMS = FEATURE_NAVIGATION_ITEMS.filter((item, index, items) => items.findIndex((candidate) => candidate.featureKey === item.featureKey) === index);
export const FEATURE_CATALOG = ADMIN_FEATURE_CATALOG;
export type AdminFeatureKey = string;
export const FEATURE_KEYS = FEATURE_CATALOG.map(([key]) => key) as readonly AdminFeatureKey[];
export const FEATURE_LABELS = Object.fromEntries(FEATURE_CATALOG.map(([key, label]) => [key, label])) as Record<AdminFeatureKey, string>;
export type FeatureAccessStatus = 'idle' | 'loading' | 'ready' | 'error';
export type FeatureNavigationState = { key: string; label: string; group: string; enabled: boolean; source?: string };

export function canResetFeatureOverride(isDirty: boolean) {
  return !isDirty;
}

export function orderFeatureRows(rows: Array<{ key: string; enabled: boolean; source?: string }>): FeatureNavigationState[] {
  const backendByKey = new Map(rows.map((row) => [row.key, row]));
  return FEATURE_CATALOG.map(([key, defaultLabel, defaultGroup]) => {
    const item = UNIQUE_FEATURE_ITEMS.find((candidate) => candidate.featureKey === key);
    const backend = backendByKey.get(key);
    const group = ADMIN_GROUPS.find((candidate) => candidate.itemKeys.some((key) => key === item?.key))?.label ?? defaultGroup;
    return { key, label: item?.label ?? defaultLabel, group, enabled: backend?.enabled ?? true, source: backend?.source };
  });
}

export const featureKeyForPath = (pathname: string): AdminFeatureKey | null => FEATURE_NAVIGATION_ITEMS.find(({ href }) => pathname === href || pathname.startsWith(`${href}/`))?.featureKey ?? null;

export function useAdminFeatureAccess() {
  const { profile } = useAdminProfile();
  const searchParams = useSearchParams();
  const hotelId = searchParams.get('hotelId') ?? profile?.staffHotelId ?? '';
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<FeatureAccessStatus>('idle');
  const [retryToken, setRetryToken] = useState(0);
  const bypass = profile?.role === 'SUPER_ADMIN';
  const retry = useCallback(() => setRetryToken((value) => value + 1), []);

  useEffect(() => {
    if (!profile) { setFeatures({}); setStatus('idle'); return; }
    if (bypass) { setFeatures({}); setStatus('ready'); return; }
    let active = true;
    setStatus('loading'); setFeatures({});
    const suffix = hotelId ? `?hotelId=${encodeURIComponent(hotelId)}` : '';
    apiRequest<{ features: { key: string; enabled: boolean }[] }>(`/features/effective${suffix}`)
      .then((body) => { if (active) { setFeatures(Object.fromEntries(body.features.map((item) => [item.key, item.enabled]))); setStatus('ready'); } })
      .catch(() => { if (active) { setFeatures({}); setStatus('error'); } });
    return () => { active = false; };
  }, [bypass, hotelId, profile, retryToken]);

  return useMemo(() => ({ bypass, status, loading: status === 'loading', features, retry, isEnabled: (key: string) => bypass || (status === 'ready' && features[key] === true) }), [bypass, features, retry, status]);
}
