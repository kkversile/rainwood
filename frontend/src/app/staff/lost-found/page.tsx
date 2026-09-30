import { StaffAuthGate, StaffPwaShell } from '../../../components/StaffData';
import { StaffLostFoundData } from '../../../components/StaffLostFoundData';
export const metadata = { title: 'RainWood Lost & Found', robots: { index: false, follow: false } };
export default function Page() { return <StaffAuthGate><StaffPwaShell><StaffLostFoundData /></StaffPwaShell></StaffAuthGate>; }
