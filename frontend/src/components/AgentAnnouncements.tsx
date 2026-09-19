'use client';

import { useState } from 'react';

const announcementTypes = ['Promotion', 'Package', 'Newsletter', 'Brochure'] as const;
type AnnouncementType = typeof announcementTypes[number];

export default function AgentAnnouncements() {
  const [activeType, setActiveType] = useState<AnnouncementType>('Promotion');
  return <section className="panel agentAnnouncementsPanel"><div className="agentAnnouncementsTabs" role="tablist" aria-label="Announcement types">{announcementTypes.map((type) => <button key={type} type="button" role="tab" aria-selected={activeType === type} className={activeType === type ? 'active' : ''} onClick={() => setActiveType(type)}>{type}</button>)}</div><div className="agentAnnouncementsTableWrap"><table className="agentAnnouncementsTable"><thead><tr><th>Published Date</th><th>Title</th><th>Details</th></tr></thead><tbody><tr><td colSpan={3}>There are no {activeType.toLowerCase()} announcements available.</td></tr></tbody></table></div><div className="agentAnnouncementsPager"><button type="button" disabled aria-label="First page">«</button><button type="button" disabled aria-label="Previous page">‹</button><button type="button" className="current" aria-label="Current page">0</button><button type="button" disabled aria-label="Next page">›</button><button type="button" disabled aria-label="Last page">»</button><span>0 - 0 of 0 items</span></div></section>;
}
