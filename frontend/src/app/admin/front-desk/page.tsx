import { AdminLayout } from '../../../components/Shell';
import { FrontDeskWorkspace } from '../../../components/FrontDeskWorkspace';

export const metadata = { title: 'Front Desk', robots: { index: false, follow: false } };

export default function FrontDeskPage() {
  return <AdminLayout title="Front Desk"><FrontDeskWorkspace /></AdminLayout>;
}
