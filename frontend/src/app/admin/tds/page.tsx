import { AdminLayout } from '../../../components/Shell';
import { StatutoryRegisterData } from '../../../components/AdminTaxData';
export const metadata = { title: 'TDS Register', robots: { index: false, follow: false } };
export default function Page() { return <AdminLayout title="TDS Register"><StatutoryRegisterData kind="tds" title="Corporate TDS" /></AdminLayout>; }
