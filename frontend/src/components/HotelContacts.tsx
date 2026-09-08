'use client';

import { FormEvent, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';

export type HotelContact = {
  id: string;
  contactType: string;
  name: string;
  designation?: string;
  department?: string;
  email: string;
  phone?: string;
  mobile?: string;
  preferredMode: string;
  primary: boolean;
  remarks?: string;
  active: boolean;
};

export type HotelContactDraft = Omit<HotelContact, 'id'>;

type Props = {
  contacts: HotelContact[];
  busy: boolean;
  onSave: (contact: HotelContactDraft, editingId?: string) => Promise<boolean>;
  onDelete: (id: string) => void;
};

const blankContact: HotelContactDraft = {
  contactType: 'General Manager',
  name: '',
  designation: '',
  department: '',
  email: '',
  phone: '',
  mobile: '',
  preferredMode: 'EMAIL',
  primary: false,
  remarks: '',
  active: true,
};

const typeOptions = ['General Manager', 'Reservations', 'Front Office', 'Accounts', 'Sales', 'Maintenance', 'Emergency', 'Other'];
const departmentOptions = ['Management', 'Reservations', 'Front Office', 'Finance', 'Sales'];

type ReferenceIconProps = {
  paths: string[];
  size?: number;
  fill?: string;
  strokeWidth?: number;
};

function ReferenceIcon({ paths, size = 16, fill = 'none', strokeWidth = 2 }: ReferenceIconProps) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    {paths.map((path, index) => <path key={`${path}-${index}`} d={path} />)}
  </svg>;
}

const referenceIcons = {
  contacts: ['M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z'],
  info: ['M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z'],
  generalManager: ['M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z'],
  sales: ['M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z'],
  reservations: ['M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z'],
  accounts: ['M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'],
  frontOffice: ['M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9'],
  maintenance: ['M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z', 'M15 12a3 3 0 11-6 0 3 3 0 016 0z'],
  emergency: ['M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z'],
  other: ['M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z'],
  search: ['M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z'],
  edit: ['M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.5-7.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 8.5-8.5z'],
  delete: ['M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16'],
  chevronDown: ['M19 9l-7 7-7-7'],
};

const contactTypes = [
  { label: 'General Manager', detail: 'Overall hotel operations', color: '#dbeafe', text: '#2563eb', icon: referenceIcons.generalManager },
  { label: 'Sales', detail: 'Corporate & group enquiries', color: '#fce7f3', text: '#db2777', icon: referenceIcons.sales },
  { label: 'Reservations', detail: 'Booking related queries', color: '#d1fae5', text: '#059669', icon: referenceIcons.reservations },
  { label: 'Accounts', detail: 'Invoices & payments', color: '#fef3c7', text: '#d97706', icon: referenceIcons.accounts },
  { label: 'Front Office', detail: 'Check-in / Check-out support', color: '#e0e7ff', text: '#4f46e5', icon: referenceIcons.frontOffice },
  { label: 'Maintenance', detail: 'Property maintenance issues', color: '#e2e8f0', text: '#475569', icon: referenceIcons.maintenance },
  { label: 'Emergency', detail: '24x7 emergency contact', color: '#ffe4e6', text: '#e11d48', icon: referenceIcons.emergency },
  { label: 'Other', detail: 'Any other contact', color: '#f3e8ff', text: '#9333ea', icon: referenceIcons.other },
];

function emptyDraftFrom(contact: HotelContact): HotelContactDraft {
  return {
    contactType: contact.contactType,
    name: contact.name,
    designation: contact.designation ?? '',
    department: contact.department ?? '',
    email: contact.email,
    phone: contact.phone ?? '',
    mobile: contact.mobile ?? '',
    preferredMode: contact.preferredMode,
    primary: contact.primary,
    remarks: contact.remarks ?? '',
    active: contact.active,
  };
}

function FieldLabel({ children, required = false }: { children: React.ReactNode; required?: boolean }) {
  return <span className="contactsFieldLabel">{children}{required && <em> *</em>}</span>;
}

export function HotelContacts({ contacts, busy, onSave, onDelete }: Props) {
  const [draft, setDraft] = useState<HotelContactDraft>({ ...blankContact });
  const [editingId, setEditingId] = useState<string>();
  const [search, setSearch] = useState('');

  const filteredContacts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return contacts;
    return contacts.filter((item) => [item.contactType, item.name, item.designation, item.department, item.email, item.phone, item.mobile].some((value) => value?.toLowerCase().includes(query)));
  }, [contacts, search]);

  function update<K extends keyof HotelContactDraft>(key: K, value: HotelContactDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function clear() {
    setDraft({ ...blankContact });
    setEditingId(undefined);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const saved = await onSave(draft, editingId);
    if (saved) clear();
  }

  return <div className="contactsWorkspace">
    <div className="contactsInfoGrid">
      <section className="contactsIntroCard">
        <div className="contactsIntroIcon"><ReferenceIcon paths={referenceIcons.contacts} size={20} /></div>
        <div>
          <h2>Hotel Contacts</h2>
          <p>Add and manage key contact persons for different departments. These contacts will be used for operational communication, booking support and emergency purposes.</p>
        </div>
      </section>
      <section className="contactsTipsCard">
        <ReferenceIcon paths={referenceIcons.info} size={16} fill="currentColor" strokeWidth={0} />
        <div><h3>Tips</h3><ul><li>Add at least one primary contact.</li><li>Provide direct phone numbers and email IDs.</li><li>Keep contacts updated for smooth operations.</li></ul></div>
      </section>
    </div>

    <div className="contactsFormGrid">
      <section className="contactsFormCard">
        <h2>{editingId ? 'Edit Contact' : 'Add New Contact'}</h2>
        <form onSubmit={submit}>
          <div className="contactsThreeColumns">
            <label><FieldLabel required>Contact Type</FieldLabel><select value={draft.contactType} onChange={(event) => update('contactType', event.target.value)}>{typeOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
            <label><FieldLabel required>Name</FieldLabel><input value={draft.name} onChange={(event) => update('name', event.target.value)} placeholder="Enter full name" required /></label>
            <label><FieldLabel>Designation</FieldLabel><input value={draft.designation} onChange={(event) => update('designation', event.target.value)} placeholder="Enter designation" /></label>
          </div>
          <div className="contactsThreeColumns">
            <label><FieldLabel required>Email Address</FieldLabel><input type="email" value={draft.email} onChange={(event) => update('email', event.target.value)} placeholder="Enter email address" required /></label>
            <label><FieldLabel required>Phone Number</FieldLabel><span className="contactsPhoneField"><span className="contactsCountryCode">+91 <span>⌄</span></span><input value={draft.phone} onChange={(event) => update('phone', event.target.value)} placeholder="Enter phone number" required /></span></label>
            <label><FieldLabel>Mobile Number</FieldLabel><span className="contactsPhoneField"><span className="contactsCountryCode">+91 <span>⌄</span></span><input value={draft.mobile} onChange={(event) => update('mobile', event.target.value)} placeholder="Enter mobile number" /></span></label>
          </div>
          <div className="contactsPreferenceRow">
            <label><FieldLabel>Department</FieldLabel><select value={draft.department} onChange={(event) => update('department', event.target.value)}><option value="">Select department</option>{departmentOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
            <fieldset><legend><FieldLabel>Preferred Contact Mode</FieldLabel></legend><div className="contactsRadioGroup">
              {[['EMAIL', 'Email'], ['PHONE', 'Phone'], ['WHATSAPP', 'WhatsApp']].map(([value, label]) => <label key={value}><input type="radio" name="preferred-contact-mode" checked={draft.preferredMode === value} onChange={() => update('preferredMode', value)} /><span>{label}</span></label>)}
            </div></fieldset>
            <label><FieldLabel>Is Primary Contact?</FieldLabel><span className="contactsSwitch"><input type="checkbox" checked={draft.primary} onChange={(event) => update('primary', event.target.checked)} /><i /></span></label>
          </div>
          <label className="contactsRemarks"><FieldLabel>Remarks (Optional)</FieldLabel><textarea rows={2} value={draft.remarks} onChange={(event) => update('remarks', event.target.value)} placeholder="Enter additional notes" /></label>
          <div className="contactsFormActions"><button type="button" className="contactsSecondaryButton" onClick={clear}>Clear</button><button type="submit" className="contactsPrimaryButton" disabled={busy}><Plus size={16} /> {editingId ? 'Update Contact' : 'Add Contact'}</button></div>
        </form>
      </section>

      <section className="contactsTypesCard">
        <div className="contactsSectionHeading"><h2>Contact Types</h2><p>You can add multiple contacts for each type.</p></div>
        <div className="contactsTypeGrid">{contactTypes.map(({ label, detail, color, text, icon }) => <button key={label} type="button" className="contactsTypeItem" onClick={() => update('contactType', label)}><span className="contactsTypeIcon" style={{ background: color, color: text }}><ReferenceIcon paths={icon} size={16} /></span><span><b>{label}</b><small>{detail}</small></span></button>)}</div>
      </section>
    </div>

    <section className="contactsExistingCard">
      <div className="contactsExistingHeader"><h2>Existing Contacts</h2><label className="contactsSearch"><ReferenceIcon paths={referenceIcons.search} size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name, department or email..." /></label></div>
      <div className="contactsTableScroll"><table className="contactsTable"><thead><tr><th>S.No</th><th>Contact Type</th><th>Name</th><th>Designation</th><th>Department</th><th>Email</th><th>Phone</th><th>Mobile</th><th>Primary</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        {filteredContacts.map((item, index) => <tr key={item.id}><td>{index + 1}</td><td>{item.contactType}</td><td>{item.name}</td><td>{item.designation || '—'}</td><td>{item.department || '—'}</td><td>{item.email}</td><td>{item.phone || '—'}</td><td>{item.mobile || '—'}</td><td><span className={`contactsPill ${item.primary ? 'yes' : 'no'}`}>{item.primary ? 'Yes' : 'No'}</span></td><td><span className={`contactsPill ${item.active ? 'active' : 'inactive'}`}>{item.active ? 'Active' : 'Inactive'}</span></td><td><span className="contactsActions"><button type="button" aria-label={`Edit ${item.name}`} title="Edit Contact" onClick={() => { setDraft(emptyDraftFrom(item)); setEditingId(item.id); }}><ReferenceIcon paths={referenceIcons.edit} size={14} /></button><button type="button" aria-label={`Delete ${item.name}`} title="Delete Contact" onClick={() => onDelete(item.id)}><ReferenceIcon paths={referenceIcons.delete} size={14} /></button></span></td></tr>)}
        {!filteredContacts.length && <tr><td colSpan={11} className="contactsEmpty">No contacts added yet.</td></tr>}
      </tbody></table></div>
    </section>
  </div>;
}
