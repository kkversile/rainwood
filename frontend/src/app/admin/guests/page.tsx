import { AdminLayout } from '../../../components/Shell';
import { GuestListData } from '../../../components/GuestData';
export const metadata = { title: 'Guest CRM', robots: { index: false, follow: false } };
export default function GuestsPage() { return <AdminLayout title="Guests"><GuestListData /></AdminLayout>; }
