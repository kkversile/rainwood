import { AdminLayout } from '../../../components/Shell';
import { GroupsData } from '../../../components/GroupsData';

export const metadata = { title: 'Groups & Room Blocks', robots: { index: false, follow: false } };

export default function GroupsPage() { return <AdminLayout title="Groups & Room Blocks"><GroupsData /></AdminLayout>; }
