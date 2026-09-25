import { AdminLayout } from '../../../components/Shell';
import { AdminArrivals } from '../../../components/AdminArrivals';

export const metadata = { title: 'Expected Arrivals', robots: { index: false, follow: false } };

export default function ArrivalsPage() {
  return <AdminLayout title="Arrivals"><AdminArrivals /></AdminLayout>;
}
