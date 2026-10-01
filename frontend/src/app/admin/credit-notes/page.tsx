import { AdminLayout } from '../../../components/Shell';
import { StatutoryRegisterData } from '../../../components/AdminTaxData';
export const metadata = { title: 'Credit Notes', robots: { index: false, follow: false } };
export default function Page() { return <AdminLayout title="Credit Notes"><StatutoryRegisterData kind="credit-notes" title="Credit notes" /></AdminLayout>; }
