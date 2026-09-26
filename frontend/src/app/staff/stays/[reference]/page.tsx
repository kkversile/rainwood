import { StaffAuthGate, StaffGuestData, StaffPwaShell } from '../../../../components/StaffData';
export const metadata = { title: 'Guest Stay | RainWood Staff', robots: { index: false, follow: false } };
export default async function Page({ params }: { params: Promise<{ reference: string }> }) { const { reference } = await params; return <StaffAuthGate><StaffPwaShell><StaffGuestData reference={reference} /></StaffPwaShell></StaffAuthGate>; }
