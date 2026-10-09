'use client';

import { useSearchParams } from 'next/navigation';
import { AdminLayout } from '../../../components/Shell';
import { HotelRateImportForm } from '../../../components/HotelRateImportForm';

export default function RatePlanRateImportPage() {
  const searchParams = useSearchParams();
  return <AdminLayout title="Rate Import"><section className="masterPanel">
    <div className="listToolbar"><div><span>Rate management</span><h2>Rate Import</h2><p>Import hotel room-type rates or common room-type rates with one Excel workbook.</p></div></div>
    <HotelRateImportForm initialHotelId={searchParams.get('hotelId') ?? ''} />
  </section></AdminLayout>;
}
