import { AdminLayout } from '../../../components/Shell';
import { ManagementDashboard } from '../../../components/ManagementDashboard';
export const metadata = { title: 'Dashboard', robots: { index: false, follow: false } };
export default function Page() { return <AdminLayout title="Dashboard"><ManagementDashboard /></AdminLayout>; }
