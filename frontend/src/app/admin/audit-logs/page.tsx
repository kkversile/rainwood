import { AdminLayout } from '../../../components/Shell';
import { AuditData } from '../../../components/AdminData';
export const metadata = { title: 'Audit Logs', robots: { index: false, follow: false } };
export default function Page() { return <AdminLayout title="Audit Logs"><AuditData /></AdminLayout>; }
