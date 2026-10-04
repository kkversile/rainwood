import { AdminLayout } from '../../../../components/Shell';
import { GuestProfileData } from '../../../../components/GuestData';
import Link from 'next/link';
export const metadata = { title: 'Guest Profile', robots: { index: false, follow: false } };
export default async function GuestProfilePage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <AdminLayout title="Guest Profile"><div className="contextualLogbookLink"><Link href={`/admin/logbook?guestProfileId=${encodeURIComponent(id)}&category=GUEST_REQUEST`}>Add to Logbook</Link></div><GuestProfileData id={id} /></AdminLayout>; }
