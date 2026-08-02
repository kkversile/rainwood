import { AdminLayout } from '../../../components/Shell';
import { PaymentsData } from '../../../components/AdminData';
export const metadata = { title: 'Payments', robots: { index: false, follow: false } };
export default function Page() { return <AdminLayout title="Payments"><PaymentsData /></AdminLayout>; }
