import { AdminLayout } from '../../../components/Shell';
import { ReportsData } from '../../../components/AdminData';
export const metadata = { title: 'Reports', robots: { index: false, follow: false } };
export default function Page() { return <AdminLayout title="Reports"><ReportsData /></AdminLayout>; }
