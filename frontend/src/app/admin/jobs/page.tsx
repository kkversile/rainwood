import { AdminLayout } from '../../../components/Shell';
import { JobsData } from '../../../components/AdminData';
export const metadata = { title: 'Background Jobs', robots: { index: false, follow: false } };
export default function Page() { return <AdminLayout title="Background Jobs"><JobsData /></AdminLayout>; }
