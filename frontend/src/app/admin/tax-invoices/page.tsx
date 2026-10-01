import { AdminLayout } from '../../../components/Shell';
import { TaxInvoicesData } from '../../../components/AdminTaxData';
export const metadata = { title: 'Tax Invoices', robots: { index: false, follow: false } };
export default function Page() { return <AdminLayout title="Tax Invoices"><TaxInvoicesData /></AdminLayout>; }
