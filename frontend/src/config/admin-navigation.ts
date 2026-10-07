export type AdminNavigationItem = {
  readonly key: string;
  readonly href: string;
  readonly label: string;
  readonly featureKey?: string;
  readonly superAdminOnly?: boolean;
};

// This is the single source of truth for the admin shell, feature settings and route mapping.
export const ADMIN_NAVIGATION = [
  { key: 'dashboard', href: '/admin/dashboard', label: 'Dashboard' },
  { key: 'revenueForecast', href: '/admin/revenue-forecast', label: 'Revenue Forecast', featureKey: 'revenueForecast' },
  { key: 'manageHotels', href: '/admin/hotels', label: 'Hotels' },
  { key: 'roomsInventory', href: '/admin/rooms-inventory', label: 'Rooms & Inventory', featureKey: 'roomsInventory' },
  { key: 'physicalRooms', href: '/admin/rooms', label: 'Physical Rooms', featureKey: 'physicalRooms' },
  { key: 'roomRack', href: '/admin/room-rack', label: 'Room Rack', featureKey: 'roomRack' },
  { key: 'housekeeping', href: '/admin/housekeeping', label: 'Housekeeping', featureKey: 'housekeeping' },
  { key: 'maintenance', href: '/admin/maintenance', label: 'Maintenance', featureKey: 'maintenance' },
  { key: 'logbook', href: '/admin/logbook', label: 'Operations Logbook', featureKey: 'logbook' },
  { key: 'banquets', href: '/admin/banquets', label: 'Banquets & Events', featureKey: 'banquets' },
  { key: 'functionSpaces', href: '/admin/function-spaces', label: 'Function Spaces', featureKey: 'functionSpaces' },
  { key: 'ratePlans', href: '/admin/rate-plans', label: 'Rate Plans', featureKey: 'ratePlans' },
  { key: 'rates', href: '/admin/rates', label: 'Rate Master', featureKey: 'rates' },
  { key: 'rateCalendar', href: '/admin/rate-calendar', label: 'Rate Calendar', featureKey: 'rates' },
  { key: 'rateSeasons', href: '/admin/rate-seasons', label: 'Rate Seasons', featureKey: 'rateSeasons' },
  { key: 'yieldRules', href: '/admin/yield-rules', label: 'Yield Rules', featureKey: 'yieldRules' },
  { key: 'rateSimulator', href: '/admin/rate-simulator', label: 'Rate Simulator', featureKey: 'rateSimulator' },
  { key: 'promotions', href: '/admin/promotions', label: 'Promotions', featureKey: 'promotions' },
  { key: 'rateImport', href: '/admin/base-rate-import', label: 'Rate Import', featureKey: 'rateImport' },
  { key: 'supplementaryCharges', href: '/admin/supplementary-charges', label: 'Supplementary Charges', featureKey: 'supplementaryCharges' },
  { key: 'expenses', href: '/admin/expenses', label: 'Expenses', featureKey: 'expenses' },
  { key: 'serviceItems', href: '/admin/service-items', label: 'Service Items', featureKey: 'serviceItems' },
  { key: 'cashier', href: '/admin/cashier', label: 'Cashier Shift', featureKey: 'cashier' },
  { key: 'taxSettings', href: '/admin/tax-settings', label: 'Tax Settings', featureKey: 'taxSettings' },
  { key: 'taxInvoices', href: '/admin/tax-invoices', label: 'Tax Invoices', featureKey: 'taxInvoices' },
  { key: 'creditNotes', href: '/admin/credit-notes', label: 'Credit Notes', featureKey: 'creditNotes' },
  { key: 'tds', href: '/admin/tds', label: 'TDS Register', featureKey: 'tds' },
  { key: 'agents', href: '/admin/agents', label: 'Agents', featureKey: 'agents' },
  { key: 'agentRateSlabs', href: '/admin/agent-rate-slabs', label: 'Agent Rate Slabs', featureKey: 'agents' },
  { key: 'corporates', href: '/admin/corporates', label: 'Corporates', featureKey: 'corporates' },
  { key: 'inquiries', href: '/admin/inquiries', label: 'Inquiries', featureKey: 'inquiries' },
  { key: 'reservations', href: '/admin/reservations', label: 'Reservations', featureKey: 'reservations' },
  { key: 'groups', href: '/admin/groups', label: 'Groups & Room Blocks', featureKey: 'groups' },
  { key: 'frontDesk', href: '/admin/front-desk', label: 'Front Desk', featureKey: 'frontDesk' },
  { key: 'arrivals', href: '/admin/arrivals', label: 'Arrivals', featureKey: 'arrivals' },
  { key: 'inHouse', href: '/admin/in-house', label: 'In-house', featureKey: 'inHouse' },
  { key: 'lostFound', href: '/admin/lost-found', label: 'Lost & Found', featureKey: 'lostFound' },
  { key: 'guests', href: '/admin/guests', label: 'Guests', featureKey: 'guests' },
  { key: 'nightAudit', href: '/admin/night-audit', label: 'Night Audit', featureKey: 'nightAudit' },
  { key: 'contactRequests', href: '/admin/contact-requests', label: 'Contact Requests', featureKey: 'contactRequests' },
  { key: 'payments', href: '/admin/payments', label: 'Payments', featureKey: 'payments' },
  { key: 'reports', href: '/admin/reports', label: 'Reports', featureKey: 'reports' },
  { key: 'axisRooms', href: '/admin/axisrooms', label: 'AxisRooms', featureKey: 'axisRooms' },
  { key: 'jobs', href: '/admin/jobs', label: 'Jobs', featureKey: 'jobs' },
  { key: 'users', href: '/admin/users', label: 'Users' },
  { key: 'siteSettings', href: '/admin/settings', label: 'Site Settings' },
  { key: 'features', href: '/admin/features', label: 'Features', superAdminOnly: true },
  { key: 'auditLogs', href: '/admin/audit-logs', label: 'Audit Logs' },
] as const satisfies readonly AdminNavigationItem[];

export const ADMIN_GROUPS = [
  { key: 'operations', label: 'Operations', itemKeys: ['roomsInventory', 'physicalRooms', 'roomRack', 'housekeeping', 'maintenance', 'logbook', 'banquets', 'functionSpaces', 'supplementaryCharges', 'expenses', 'serviceItems', 'cashier'] },
  { key: 'reservations', label: 'Reservations', itemKeys: ['reservations', 'groups', 'frontDesk', 'arrivals', 'inHouse', 'lostFound', 'payments', 'contactRequests'] },
  { key: 'revenue', label: 'Revenue', itemKeys: ['revenueForecast', 'ratePlans', 'rateCalendar', 'rateSeasons', 'yieldRules', 'rateSimulator', 'promotions', 'rateImport'] },
  { key: 'crmSales', label: 'CRM & Sales', itemKeys: ['guests', 'agentRateSlabs', 'corporates', 'inquiries'] },
  { key: 'reports', label: 'Reports', itemKeys: ['reports', 'taxInvoices', 'creditNotes', 'tds', 'nightAudit'] },
  { key: 'system', label: 'System', itemKeys: ['taxSettings', 'axisRooms', 'jobs', 'users', 'siteSettings', 'features', 'auditLogs'] },
] as const;

export const FEATURE_NAVIGATION_ITEMS = ADMIN_NAVIGATION.filter((item): item is Extract<(typeof ADMIN_NAVIGATION)[number], { featureKey: string }> => Boolean((item as AdminNavigationItem).featureKey));

export type AdminIconKey =
  | 'layoutDashboard' | 'hotel' | 'calendarRange' | 'usersRound'
  | 'clipboardList' | 'calendarCheck' | 'revenue' | 'contactRound'
  | 'chartColumn' | 'settings' | 'trendingUp' | 'layers' | 'calendarDays'
  | 'calendarClock' | 'slidersHorizontal' | 'calculator' | 'badgePercent'
  | 'fileUp' | 'bedDouble' | 'doorOpen' | 'grid2X2' | 'brushCleaning'
  | 'wrench' | 'bookOpenCheck' | 'utensilsCrossed' | 'panelsTopLeft'
  | 'receiptText' | 'walletCards' | 'package' | 'banknote' | 'receiptIndianRupee'
  | 'fileText' | 'fileMinus2' | 'fileCheck2' | 'percent' | 'building2'
  | 'messageSquareText' | 'users' | 'conciergeBell' | 'logIn' | 'packageSearch'
  | 'moonStar' | 'messagesSquare' | 'creditCard' | 'briefcaseBusiness'
  | 'userRound' | 'cable' | 'settings2' | 'blocks' | 'fileClock';

// The visual icon language is centralized here so route metadata and permission filtering stay unchanged.
export const ADMIN_NAV_ICON_BY_KEY: Readonly<Record<string, AdminIconKey>> = {
  dashboard: 'layoutDashboard', revenueForecast: 'trendingUp', manageHotels: 'hotel',
  roomsInventory: 'bedDouble', physicalRooms: 'doorOpen', roomRack: 'grid2X2', housekeeping: 'brushCleaning',
  maintenance: 'wrench', logbook: 'bookOpenCheck', banquets: 'utensilsCrossed', functionSpaces: 'panelsTopLeft',
  ratePlans: 'layers', rates: 'calendarRange', rateCalendar: 'calendarDays', rateSeasons: 'calendarClock',
  yieldRules: 'slidersHorizontal', rateSimulator: 'calculator', promotions: 'badgePercent', rateImport: 'fileUp',
  supplementaryCharges: 'receiptText', expenses: 'walletCards', serviceItems: 'package', cashier: 'banknote',
  taxSettings: 'receiptIndianRupee', taxInvoices: 'fileText', creditNotes: 'fileMinus2', tds: 'fileCheck2',
  agents: 'usersRound', agentRateSlabs: 'percent', corporates: 'building2', inquiries: 'messageSquareText',
  reservations: 'calendarCheck', groups: 'users', frontDesk: 'conciergeBell', arrivals: 'logIn', inHouse: 'hotel',
  lostFound: 'packageSearch', guests: 'contactRound', nightAudit: 'moonStar', contactRequests: 'messagesSquare',
  payments: 'creditCard', reports: 'chartColumn', axisRooms: 'cable', jobs: 'briefcaseBusiness', users: 'userRound',
  siteSettings: 'settings2', features: 'blocks', auditLogs: 'fileClock',
};

export const ADMIN_GROUP_ICON_BY_KEY: Readonly<Record<string, AdminIconKey>> = {
  operations: 'clipboardList', reservations: 'calendarCheck', revenue: 'revenue',
  crmSales: 'contactRound', reports: 'chartColumn', system: 'settings',
};
