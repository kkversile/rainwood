import { AdminLayout } from '../../../components/Shell';
import { HousekeepingBoard } from '../../../components/HousekeepingBoard';
import Link from 'next/link';

export default function HousekeepingPage() { return <AdminLayout title="Housekeeping"><div className="contextualLogbookLink"><Link href="/admin/logbook?category=HOUSEKEEPING">Open housekeeping logbook entries</Link></div><HousekeepingBoard /></AdminLayout>; }
