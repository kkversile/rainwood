'use client';

import { useSearchParams } from 'next/navigation';
import { AdminLayout } from '../../../components/Shell';
import { RatePlanRateImportForm } from '../../../components/RatePlanRateImportForm';

export default function RatePlanRateImportPage() {
  const searchParams = useSearchParams();
  return <AdminLayout title="Rate Import"><section className="masterPanel">
    <div className="listToolbar"><div><span>Rate management</span><h2>Rate Plan Rate Import</h2><p>Import daily room rates for an existing hotel rate plan.</p></div></div>
    <RatePlanRateImportForm mode="page" initialHotelId={searchParams.get('hotelId') ?? ''} initialMasterId={searchParams.get('masterId') ?? ''} lockContext={false} />
  </section></AdminLayout>;
}
