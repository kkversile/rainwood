const roleDefaults: Record<string, string> = {
  SUPER_ADMIN: '/admin/dashboard',
  CORPORATE_ADMIN: '/admin/dashboard',
  ADMIN: '/admin/dashboard',
  RESERVATION: '/admin/arrivals',
  ACCOUNTS: '/admin/cashier',
  SERVICE_STAFF: '/staff',
  VIEWER: '/admin/reports',
  AGENT: '/agent',
};

const rolePrefixes: Record<string, string[]> = {
  SUPER_ADMIN: ['/admin/'],
  CORPORATE_ADMIN: ['/admin/'],
  ADMIN: ['/admin/'],
  RESERVATION: ['/admin/dashboard', '/admin/reservations', '/admin/front-desk', '/admin/room-rack', '/admin/logbook', '/admin/arrivals', '/admin/in-house', '/admin/lost-found', '/admin/guests', '/admin/payments', '/admin/reports', '/admin/inquiries', '/admin/cashier', '/admin/tax-invoices', '/admin/groups', '/admin/banquets', '/admin/banquets/calendar', '/admin/function-spaces'],
  ACCOUNTS: ['/admin/dashboard', '/admin/payments', '/admin/reports', '/admin/expenses', '/admin/corporates', '/admin/lost-found', '/admin/cashier', '/admin/tax-settings', '/admin/tax-invoices', '/admin/credit-notes', '/admin/tds', '/admin/logbook', '/admin/groups', '/admin/banquets', '/admin/banquets/calendar', '/admin/function-spaces'],
  VIEWER: ['/admin/dashboard', '/admin/reports', '/admin/tax-invoices', '/admin/credit-notes', '/admin/tds', '/admin/logbook', '/admin/groups', '/admin/banquets', '/admin/banquets/calendar', '/admin/function-spaces'],
  SERVICE_STAFF: ['/staff'],
  AGENT: ['/agent'],
};

export function getDefaultRouteForRole(role?: string | null) {
  return (role && roleDefaults[role]) || '/login';
}

export function isRoleRouteAllowed(role: string | null | undefined, pathname: string) {
  if (!role || pathname.startsWith('//')) return false;
  const prefixes = rolePrefixes[role];
  return Boolean(prefixes?.some((prefix) => {
    const normalizedPrefix = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
    return pathname === normalizedPrefix || pathname.startsWith(`${normalizedPrefix}/`);
  }));
}

export function getSafePostLoginRoute(role: string, requestedPath?: string | null) {
  const rawPath = requestedPath ?? '';
  const [rawPathname, query = ''] = rawPath.split('?');
  const pathname = rawPathname === '/rainwood' ? '/' : rawPathname.startsWith('/rainwood/') ? rawPathname.slice('/rainwood'.length) : rawPathname;
  return isRoleRouteAllowed(role, pathname) ? `${pathname}${query ? `?${query}` : ''}` : getDefaultRouteForRole(role);
}
