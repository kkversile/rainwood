export type FeatureGroup = 'Operations' | 'Reservations' | 'Revenue' | 'CRM & Sales' | 'Reports';
export type FeatureEnforcementType = 'DOMAIN_API' | 'ROUTE_UI' | 'SHARED_API';

export const FEATURE_CATALOG = [
  ['revenueForecast', 'Revenue Forecast', 'Revenue'], ['roomsInventory', 'Rooms & Inventory', 'Operations'], ['physicalRooms', 'Physical Rooms', 'Operations'], ['roomRack', 'Room Rack', 'Operations'], ['housekeeping', 'Housekeeping', 'Operations'], ['maintenance', 'Maintenance', 'Operations'], ['logbook', 'Operations Logbook', 'Operations'], ['banquets', 'Banquets & Events', 'Operations'], ['functionSpaces', 'Function Spaces', 'Operations'], ['ratePlans', 'Rate Plans', 'Revenue'], ['rates', 'Rates', 'Revenue'], ['rateSeasons', 'Rate Seasons', 'Revenue'], ['yieldRules', 'Yield Rules', 'Revenue'], ['rateSimulator', 'Rate Simulator', 'Revenue'], ['promotions', 'Promotions', 'Revenue'], ['rateImport', 'Rate Import', 'Revenue'], ['supplementaryCharges', 'Supplementary Charges', 'Operations'], ['expenses', 'Expenses', 'Operations'], ['serviceItems', 'Service Items', 'Operations'], ['cashier', 'Cashier Shift', 'Operations'], ['taxSettings', 'Tax Settings', 'Reports'], ['taxInvoices', 'Tax Invoices', 'Reports'], ['creditNotes', 'Credit Notes', 'Reports'], ['tds', 'TDS Register', 'Reports'], ['agents', 'Agents', 'CRM & Sales'], ['corporates', 'Corporates', 'CRM & Sales'], ['inquiries', 'Inquiries', 'CRM & Sales'], ['reservations', 'Reservations', 'Reservations'], ['groups', 'Groups & Room Blocks', 'Reservations'], ['frontDesk', 'Front Desk', 'Reservations'], ['arrivals', 'Arrivals', 'Reservations'], ['inHouse', 'In-house', 'Reservations'], ['lostFound', 'Lost & Found', 'Reservations'], ['guests', 'Guests', 'CRM & Sales'], ['nightAudit', 'Night Audit', 'Reports'], ['contactRequests', 'Contact Requests', 'Reservations'], ['payments', 'Payments', 'Reservations'], ['reports', 'Reports', 'Reports'], ['axisRooms', 'AxisRooms', 'Operations'], ['jobs', 'Jobs', 'Operations'],
] as const satisfies readonly (readonly [string, string, FeatureGroup])[];

export const FEATURE_KEYS = FEATURE_CATALOG.map(([key]) => key);
export type FeatureKey = (typeof FEATURE_KEYS)[number];
export const isKnownFeatureKey = (key: string): key is FeatureKey => (FEATURE_KEYS as readonly string[]).includes(key);

// DOMAIN_API is enforced at the business endpoint, ROUTE_UI is an admin-only
// navigation surface, and SHARED_API is used by both admin screens and
// operational/shared screens. Public booking endpoints intentionally do not
// inherit a feature gate merely because they share a domain module.
export const FEATURE_ENFORCEMENT: Record<FeatureKey, FeatureEnforcementType> = Object.fromEntries(
  FEATURE_KEYS.map((key) => [key, ['frontDesk', 'arrivals', 'inHouse'].includes(key) ? 'SHARED_API' : key === 'axisRooms' ? 'ROUTE_UI' : 'DOMAIN_API']),
) as Record<FeatureKey, FeatureEnforcementType>;
