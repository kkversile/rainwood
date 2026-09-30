import { AdminLayout } from '../../../components/Shell';
import { RevenueForecast } from '../../../components/RevenueForecast';

export const metadata = { title: 'Revenue Forecast', robots: { index: false, follow: false } };

export default function RevenueForecastPage() {
  return <AdminLayout title="Revenue Forecast"><RevenueForecast /></AdminLayout>;
}
