import { AdminLayout } from '../../../components/Shell';
import { AdminInHouse } from '../../../components/AdminInHouse';
export const metadata = { title: 'In-house Guests', robots: { index: false, follow: false } };
export default function InHousePage() { return <AdminLayout title="In-house Guests"><AdminInHouse /></AdminLayout>; }
