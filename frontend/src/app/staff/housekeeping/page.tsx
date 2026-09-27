import { HousekeepingData } from '../../../components/HousekeepingData';
import { StaffAuthGate, StaffPwaShell } from '../../../components/StaffData';

export const metadata = { title: 'RainWood Housekeeping', robots: { index: false, follow: false } };
export default function HousekeepingPage() { return <StaffAuthGate><StaffPwaShell><HousekeepingData /></StaffPwaShell></StaffAuthGate>; }
