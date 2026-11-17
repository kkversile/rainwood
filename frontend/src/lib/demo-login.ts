export const demoLogin = {
  adminEmail: process.env.NEXT_PUBLIC_DEMO_ADMIN_EMAIL || 'admin@rainwood.demo',
  adminPassword: process.env.NEXT_PUBLIC_DEMO_ADMIN_PASSWORD || '',
  agentEmail: process.env.NEXT_PUBLIC_DEMO_AGENT_EMAIL || 'agent@rainwood.demo',
  agentPassword: process.env.NEXT_PUBLIC_DEMO_AGENT_PASSWORD || '',
  staffEmail: process.env.NEXT_PUBLIC_DEMO_STAFF_EMAIL || 'service.staff.test@rainwood.demo',
  staffPassword: process.env.NEXT_PUBLIC_DEMO_STAFF_PASSWORD || 'StaffDemo@2026!',
  maintenanceEmail: process.env.NEXT_PUBLIC_DEMO_MAINTENANCE_EMAIL || '',
  maintenancePassword: process.env.NEXT_PUBLIC_DEMO_MAINTENANCE_PASSWORD || '',
  fnbEmail: process.env.NEXT_PUBLIC_DEMO_FNB_EMAIL || '',
  fnbPassword: process.env.NEXT_PUBLIC_DEMO_FNB_PASSWORD || '',
  roomServiceEmail: process.env.NEXT_PUBLIC_DEMO_ROOM_SERVICE_EMAIL || '',
  roomServicePassword: process.env.NEXT_PUBLIC_DEMO_ROOM_SERVICE_PASSWORD || '',
};
