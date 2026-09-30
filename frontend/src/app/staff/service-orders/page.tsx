import { StaffAuthGate, StaffPwaShell } from '../../../components/StaffData';
import { StaffServiceOrdersData } from '../../../components/StaffServiceOrdersData';
export const metadata = { title: 'RainWood Guest Services', robots: { index: false, follow: false } };
export default function Page() { return <StaffAuthGate><StaffPwaShell><StaffServiceOrdersData /></StaffPwaShell></StaffAuthGate>; }
