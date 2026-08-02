import { AdminLayout } from '../../../components/Shell';
import { ReservationData } from '../../../components/AdminData';
export const metadata = { title: 'Reservations', robots: { index: false, follow: false } };
export default function Page() { return <AdminLayout title="Reservations"><ReservationData /></AdminLayout>; }
