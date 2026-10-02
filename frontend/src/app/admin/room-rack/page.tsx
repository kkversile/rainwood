import { AdminLayout } from '../../../components/Shell';
import { RoomRackWorkspace } from '../../../components/RoomRackWorkspace';

export const metadata = { title: 'Room Rack', robots: { index: false, follow: false } };

export default function RoomRackPage() {
  return <AdminLayout title="Room Rack"><RoomRackWorkspace /></AdminLayout>;
}
