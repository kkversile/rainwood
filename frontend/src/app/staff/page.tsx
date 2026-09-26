import { StaffAuthGate, StaffHomeData, StaffPwaShell } from '../../components/StaffData';
export const metadata = { title: 'RainWood Staff', robots: { index: false, follow: false } };
export default function Page() { return <StaffAuthGate><StaffPwaShell><StaffHomeData /></StaffPwaShell></StaffAuthGate>; }
