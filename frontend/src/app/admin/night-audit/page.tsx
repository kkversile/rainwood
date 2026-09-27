import { AdminLayout } from '../../../components/Shell';
import { NightAuditBoard } from '../../../components/NightAuditBoard';

export const metadata = { title: 'Night Audit', robots: { index: false, follow: false } };

export default function NightAuditPage() { return <AdminLayout title="Night Audit"><NightAuditBoard /></AdminLayout>; }
