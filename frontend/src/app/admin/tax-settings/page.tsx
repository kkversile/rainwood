import { AdminLayout } from '../../../components/Shell';
import { TaxSettingsData } from '../../../components/AdminTaxData';
export const metadata = { title: 'Tax Settings', robots: { index: false, follow: false } };
export default function Page() { return <AdminLayout title="Tax Settings"><TaxSettingsData /></AdminLayout>; }
