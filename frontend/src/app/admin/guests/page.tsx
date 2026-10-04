import { AdminLayout } from '../../../components/Shell';
import { GuestListData } from '../../../components/GuestData';
import Link from 'next/link';
export const metadata = { title: 'Guest CRM', robots: { index: false, follow: false } };
export default function GuestsPage() { return <AdminLayout title="Guests"><div className="contextualLogbookLink"><Link href="/admin/logbook?category=GUEST_REQUEST">Open guest logbook entries</Link></div><GuestListData /></AdminLayout>; }
