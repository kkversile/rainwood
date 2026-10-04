import { AdminLayout } from '../../../components/Shell';
import { OperationsLogbookData } from '../../../components/OperationsLogbookData';

export const metadata = { title: 'Operations Logbook', robots: { index: false, follow: false } };

export default function OperationsLogbookPage() {
  return <AdminLayout title="Operations Logbook"><OperationsLogbookData /></AdminLayout>;
}
