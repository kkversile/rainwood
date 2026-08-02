import { AdminLayout } from '../../../components/Shell';
import { DashboardData } from '../../../components/AdminData';
export const metadata = { title: 'Dashboard', robots: { index: false, follow: false } };
export default function Page() { return <AdminLayout title="Dashboard"><DashboardData /></AdminLayout>; }
