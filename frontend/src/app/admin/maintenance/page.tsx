import { AdminLayout } from '../../../components/Shell';
import { MaintenanceBoard } from '../../../components/MaintenanceBoard';
import Link from 'next/link';

export default function MaintenancePage() { return <AdminLayout title="Maintenance"><div className="contextualLogbookLink"><Link href="/admin/logbook?category=MAINTENANCE">Open maintenance logbook entries</Link></div><MaintenanceBoard /></AdminLayout>; }
