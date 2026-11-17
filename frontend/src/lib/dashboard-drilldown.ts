/** Preserve the property on every operational drilldown, and dates on period reports. */
export function dashboardDrilldownHref(href: string, hotelId: string, from: string, to: string) {
  const query = new URLSearchParams({ hotelId });
  if (href === '/admin/arrivals' || href === '/admin/front-desk') {
    query.set('from', from);
    query.set('to', to);
  }
  if (href === '/admin/front-desk') query.set('view', 'departures');
  return `${href}?${query}`;
}
