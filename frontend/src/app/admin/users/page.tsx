import { AdminLayout } from '../../../components/Shell';
import { UsersData } from '../../../components/AdminData';
export const metadata = { title: 'Users & Roles', robots: { index: false, follow: false } };
export default function Page() { return <AdminLayout title="Users & Roles"><UsersData /></AdminLayout>; }
