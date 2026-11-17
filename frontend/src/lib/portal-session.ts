export function portalLoginPath(pathname: string, search = '', basePath = '') {
  const normalized = basePath && pathname.startsWith(`${basePath}/`) ? pathname.slice(basePath.length) : pathname;
  const portal = normalized === '/agent' || normalized.startsWith('/agent/') ? '/agent/login' : normalized === '/staff' || normalized.startsWith('/staff/') ? '/staff/login' : '/login';
  return `${basePath}${portal}?next=${encodeURIComponent(`${pathname}${search}`)}`;
}
