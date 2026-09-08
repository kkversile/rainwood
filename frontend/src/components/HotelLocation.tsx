'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, BusFront, Clock, CloudSun, Copy, ExternalLink, FileText, Image as ImageIcon, Info, LocateFixed, Map, MapPin, Mountain, Pencil, Plane, Plus, Route, Sun, Trash2, TrainFront } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { HotelLocationMap } from './HotelLocationMap';
import { useDialog } from './ReactDialog';

export type LocationHotel = {
  id: string;
  name: string;
  city: string;
  address?: string | null;
  country?: string | null;
  state?: string | null;
  pincode?: string | null;
  latitude?: string | null;
  longitude?: string | null;
};

type LocationProfile = {
  id?: string;
  addressLine1: string;
  addressLine2: string;
  timezone: string;
  bestTimeToVisit: string;
  elevation: string;
  weather: string;
  nearbyCity: string;
  accessRoad: string;
  notes: string;
};

type Attraction = { id: string; name: string; distance: string; sortOrder: number };
type Transport = { id: string; type: string; name: string; distance: string; sortOrder: number };

const defaultProfile: LocationProfile = {
  addressLine1: 'Upper Lake Road',
  addressLine2: 'Near Bryant Park',
  timezone: 'IST (UTC +5:30)',
  bestTimeToVisit: 'Oct – Mar',
  elevation: '2,133 meters (6,998 ft)',
  weather: 'Cool climate (10°C – 25°C)',
  nearbyCity: 'Dindigul (64 km)',
  accessRoad: 'Well connected by road',
  notes: 'Located close to Kodaikanal Lake with easy access to major attractions.',
};

const defaultAttractions = [
  ['Kodaikanal Lake', '1.2 km'], ['Bryant Park', '1.5 km'], ["Coaker's Walk", '1.8 km'], ['Silver Cascade Falls', '8.5 km'], ['Pillar Rocks', '9.0 km'],
];

const defaultTransport = [
  ['AIRPORT', 'Madurai Airport (IXM)', '120 km'], ['AIRPORT', 'Coimbatore Airport (CJB)', '170 km'], ['TRAIN', 'Kodaikanal Road (Railway Station)', '80 km'], ['BUS', 'Kodaikanal Bus Stand', '2.5 km'],
];

function normalizeProfile(value: Partial<LocationProfile> | null | undefined, addressFallback = ''): LocationProfile {
  return {
    addressLine1: value?.addressLine1?.trim() || addressFallback.trim() || defaultProfile.addressLine1,
    addressLine2: value?.addressLine2 ?? defaultProfile.addressLine2,
    timezone: value?.timezone ?? defaultProfile.timezone,
    bestTimeToVisit: value?.bestTimeToVisit ?? defaultProfile.bestTimeToVisit,
    elevation: value?.elevation ?? defaultProfile.elevation,
    weather: value?.weather ?? defaultProfile.weather,
    nearbyCity: value?.nearbyCity ?? defaultProfile.nearbyCity,
    accessRoad: value?.accessRoad ?? defaultProfile.accessRoad,
    notes: value?.notes ?? defaultProfile.notes,
  };
}

function normalizeHotel(value: LocationHotel): LocationHotel {
  return {
    ...value,
    city: value.city || 'Kodaikanal',
    state: value.state || 'Tamil Nadu',
    country: value.country || 'India',
    pincode: value.pincode || '624101',
    latitude: value.latitude || '10.2381',
    longitude: value.longitude || '77.4892',
  };
}

function EditIcon({ size = 14 }: { size?: number }) { return <Pencil aria-hidden="true" size={size} strokeWidth={2} />; }

function LocationCardHeading({ icon, title, detail, action }: { icon: React.ReactNode; title: string; detail: string; action?: React.ReactNode }) {
  return <div className="locationCardHeading"><div className="locationHeadingGroup"><span className="locationHeadingIcon">{icon}</span><div><h2>{title}</h2><p>{detail}</p></div></div>{action}</div>;
}

function LocationField({ label, value, required, onChange, placeholder }: { label: string; value: string; required?: boolean; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="locationFieldControl"><span>{label}{required && <em> *</em>}</span><input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>;
}

export function HotelLocation({ hotel: initialHotel, busy, onHotelChange }: { hotel: LocationHotel; busy: boolean; onHotelChange: (hotel: LocationHotel) => void }) {
  const dialog = useDialog();
  const [hotel, setHotel] = useState(() => normalizeHotel(initialHotel));
  const [profile, setProfile] = useState<LocationProfile>(defaultProfile);
  const [attractions, setAttractions] = useState<Attraction[]>([]);
  const [transports, setTransports] = useState<Transport[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => setHotel(normalizeHotel(initialHotel)), [initialHotel.id, initialHotel.city, initialHotel.state, initialHotel.country, initialHotel.pincode, initialHotel.latitude, initialHotel.longitude, initialHotel.address]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    apiRequest<{ profile: Partial<LocationProfile> | null; attractions: Attraction[]; transports: Transport[] }>(`/hotels/${initialHotel.id}/location`)
      .then((data) => {
        if (!active) return;
        const storedAddressLine1 = data.profile?.addressLine1?.trim() || initialHotel.address?.split(',')[0]?.trim() || defaultProfile.addressLine1;
        setProfile(normalizeProfile(data.profile, storedAddressLine1));
        setAttractions(data.attractions.length ? data.attractions : defaultAttractions.map(([name, distance], index) => ({ id: `default-attraction-${index}`, name, distance, sortOrder: index })));
        setTransports(data.transports.length ? data.transports : defaultTransport.map(([type, name, distance], index) => ({ id: `default-transport-${index}`, type, name, distance, sortOrder: index })));
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load location details'))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [initialHotel.id, initialHotel.address]);

  const mapUrl = useMemo(() => `https://www.google.com/maps?q=${hotel.latitude ?? ''},${hotel.longitude ?? ''}`, [hotel.latitude, hotel.longitude]);
  const updateHotel = (next: Partial<LocationHotel>) => { const value = { ...hotel, ...next }; setHotel(value); onHotelChange(value); };

  async function saveAll(event?: FormEvent) {
    event?.preventDefault();
    setMessage(''); setError(''); setSaving(true);
    try {
      const address = [profile.addressLine1, profile.addressLine2, hotel.city, hotel.state, hotel.pincode].filter(Boolean).join(', ');
      const savedHotel = await apiRequest<LocationHotel>(`/hotels/${hotel.id}`, { method: 'PATCH', body: JSON.stringify({ address, city: hotel.city, state: hotel.state, country: hotel.country, pincode: hotel.pincode, latitude: hotel.latitude, longitude: hotel.longitude, location: profile.addressLine1 }) });
      const savedProfile = await apiRequest<Partial<LocationProfile>>(`/hotels/${hotel.id}/location`, { method: 'PUT', body: JSON.stringify(normalizeProfile(profile)) });
      const mergedProfile = normalizeProfile({ ...profile, ...savedProfile }, profile.addressLine1);
      setProfile(mergedProfile);
      updateHotel(savedHotel);
      setMessage('Location updated successfully.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update location'); }
    finally { setSaving(false); }
  }

  async function currentLocation() {
    setMessage(''); setError('');
    if (!navigator.geolocation) { setError('Current location is not available in this browser.'); return; }
    navigator.geolocation.getCurrentPosition((position) => updateHotel({ latitude: position.coords.latitude.toFixed(6), longitude: position.coords.longitude.toFixed(6) }), () => setError('Could not read your current location.'));
  }

  async function reverseDetails(details: { address?: string; city?: string; state?: string; country?: string; pincode?: string }) {
    updateHotel({ city: details.city || hotel.city, state: details.state || hotel.state, country: details.country || hotel.country, pincode: details.pincode || hotel.pincode, address: details.address || hotel.address });
    if (details.address) setProfile((current) => ({ ...current, addressLine1: details.address ?? current.addressLine1 }));
  }

  async function addAttraction() {
    const name = await dialog.prompt({ title: 'Add Attraction', label: 'Attraction name', placeholder: 'e.g. Kodaikanal Lake', confirmLabel: 'Continue' });
    if (!name?.trim()) return;
    const distance = await dialog.prompt({ title: 'Add Attraction', label: 'Distance', defaultValue: '1.0 km', placeholder: 'e.g. 1.2 km', confirmLabel: 'Add Attraction' });
    if (!distance?.trim()) return;
    const saved = await apiRequest<Attraction>(`/hotels/${hotel.id}/location/attractions`, { method: 'POST', body: JSON.stringify({ name, distance, sortOrder: attractions.length }) });
    setAttractions((current) => [...current.filter((item) => !item.id.startsWith('default-')), saved]);
  }

  async function editAttraction(item: Attraction) {
    const name = await dialog.prompt({ title: 'Edit Attraction', label: 'Attraction name', defaultValue: item.name, confirmLabel: 'Continue' });
    if (!name?.trim()) return;
    const distance = await dialog.prompt({ title: 'Edit Attraction', label: 'Distance', defaultValue: item.distance, confirmLabel: 'Save Changes' });
    if (!distance?.trim()) return;
    if (item.id.startsWith('default-')) { setAttractions((current) => current.map((row) => row.id === item.id ? { ...row, name, distance } : row)); return; }
    const saved = await apiRequest<Attraction>(`/hotels/location/attractions/${item.id}`, { method: 'PATCH', body: JSON.stringify({ name, distance }) });
    setAttractions((current) => current.map((row) => row.id === item.id ? saved : row));
  }

  async function deleteAttraction(item: Attraction) {
    if (item.id.startsWith('default-')) { setAttractions((current) => current.filter((row) => row.id !== item.id)); return; }
    await apiRequest(`/hotels/location/attractions/${item.id}`, { method: 'DELETE' });
    setAttractions((current) => current.filter((row) => row.id !== item.id));
  }

  async function addTransport() {
    const name = await dialog.prompt({ title: 'Add Transport', label: 'Transport name', placeholder: 'e.g. Madurai Airport (IXM)', confirmLabel: 'Continue' });
    if (!name?.trim()) return;
    const distance = await dialog.prompt({ title: 'Add Transport', label: 'Distance', defaultValue: '10 km', placeholder: 'e.g. 120 km', confirmLabel: 'Continue' });
    if (!distance?.trim()) return;
    const type = (await dialog.prompt({ title: 'Add Transport', label: 'Type: AIRPORT, TRAIN, BUS, or OTHER', defaultValue: 'OTHER', confirmLabel: 'Add Transport' }))?.toUpperCase() || 'OTHER';
    if (!['AIRPORT', 'TRAIN', 'BUS', 'OTHER'].includes(type)) return;
    const saved = await apiRequest<Transport>(`/hotels/${hotel.id}/location/transports`, { method: 'POST', body: JSON.stringify({ type, name, distance, sortOrder: transports.length }) });
    setTransports((current) => [...current.filter((item) => !item.id.startsWith('default-')), saved]);
  }

  async function editTransport(item: Transport) {
    const name = await dialog.prompt({ title: 'Edit Transport', label: 'Transport name', defaultValue: item.name, confirmLabel: 'Continue' });
    if (!name?.trim()) return;
    const distance = await dialog.prompt({ title: 'Edit Transport', label: 'Distance', defaultValue: item.distance, confirmLabel: 'Save Changes' });
    if (!distance?.trim()) return;
    if (item.id.startsWith('default-')) { setTransports((current) => current.map((row) => row.id === item.id ? { ...row, name, distance } : row)); return; }
    const saved = await apiRequest<Transport>(`/hotels/location/transports/${item.id}`, { method: 'PATCH', body: JSON.stringify({ name, distance }) });
    setTransports((current) => current.map((row) => row.id === item.id ? saved : row));
  }

  async function deleteTransport(item: Transport) {
    if (item.id.startsWith('default-')) { setTransports((current) => current.filter((row) => row.id !== item.id)); return; }
    await apiRequest(`/hotels/location/transports/${item.id}`, { method: 'DELETE' });
    setTransports((current) => current.filter((row) => row.id !== item.id));
  }

  async function editProfile(key: keyof LocationProfile, label: string) {
    const value = await dialog.prompt({ title: `Edit ${label}`, label, defaultValue: profile[key], confirmLabel: 'Save Changes' });
    if (value !== null) setProfile((current) => ({ ...current, [key]: value }));
  }

  return <div className="locationWorkspace">
    {error && <p className="error" role="alert">{error}</p>}
    {message && <p className="notice" role="status">{message}</p>}
    <section className="locationUpperGrid">
      <form className="locationFormCard" onSubmit={saveAll}>
        <LocationCardHeading icon={<MapPin size={22} />} title="Hotel Location" detail="Set the exact location of your hotel for better visibility and navigation." action={<button className="locationOutlineButton" type="button" onClick={() => void currentLocation()}><LocateFixed size={14} /> Get Current Location</button>} />
        <div className="locationFormBody">
          <div className="locationTwoColumns"><LocationField label="Address Line 1" required value={profile.addressLine1} onChange={(value) => setProfile({ ...profile, addressLine1: value })} /><LocationField label="Address Line 2" value={profile.addressLine2} onChange={(value) => setProfile({ ...profile, addressLine2: value })} /></div>
          <div className="locationThreeColumns"><LocationField label="City / Destination" required value={hotel.city} onChange={(value) => updateHotel({ city: value })} /><LocationField label="Pincode" required value={hotel.pincode ?? ''} onChange={(value) => updateHotel({ pincode: value })} /><label className="locationFieldControl"><span>State<em> *</em></span><select value={hotel.state ?? ''} onChange={(event) => updateHotel({ state: event.target.value })}><option>Tamil Nadu</option><option>Kerala</option><option>Karnataka</option><option>Telangana</option><option>Other</option></select></label></div>
          <label className="locationFieldControl"><span>Country<em> *</em></span><select value={hotel.country ?? ''} onChange={(event) => updateHotel({ country: event.target.value })}><option>India</option><option>Other</option></select></label>
          <div className="locationTwoColumns"><LocationField label="Latitude" required value={hotel.latitude ?? ''} onChange={(value) => updateHotel({ latitude: value })} placeholder="10.2381" /><LocationField label="Longitude" required value={hotel.longitude ?? ''} onChange={(value) => updateHotel({ longitude: value })} placeholder="77.4892" /></div>
        </div>
      </form>
      <section className="locationMapCard">
        <LocationCardHeading icon={<Map size={22} />} title="Map Preview" detail="Drag the marker to adjust the exact location" action={<a className="locationOutlineButton" href={mapUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} /> View on Google Maps</a>} />
        <div className="locationMapFrame"><HotelLocationMap latitude={hotel.latitude} longitude={hotel.longitude} onChange={(latitude, longitude) => updateHotel({ latitude, longitude })} onReverseGeocode={(details) => void reverseDetails(details)} /></div>
        <div className="locationUrlBar"><div><MapPin size={16} /><span><b>Location URL</b><small>{mapUrl}</small></span></div><button type="button" onClick={() => void navigator.clipboard?.writeText(mapUrl)}><Copy size={14} /> Copy Link</button></div>
      </section>
    </section>

    <section className="locationLowerGrid">
      <section className="locationDataCard"><LocationCardHeading icon={<ImageIcon size={17} />} title="Nearby Attractions" detail="Add popular attractions near the hotel" action={<button className="locationAddButton" type="button" onClick={() => void addAttraction()}><Plus size={14} /> Add Attraction</button>} /><div className="locationTableWrap"><table className="locationDataTable"><thead><tr><th>S.No</th><th>Attraction Name</th><th>Distance</th><th>Action</th></tr></thead><tbody>{attractions.map((item, index) => <tr key={item.id}><td>{index + 1}</td><td><b>{item.name}</b></td><td>{item.distance}</td><td><button aria-label={`Edit ${item.name}`} type="button" onClick={() => void editAttraction(item)}><EditIcon /></button><button aria-label={`Delete ${item.name}`} type="button" onClick={() => void deleteAttraction(item)}><Trash2 size={14} /></button></td></tr>)}</tbody></table></div></section>
      <section className="locationDataCard"><LocationCardHeading icon={<ArrowLeftRight size={17} />} title="Travel Information" detail="Add nearby transport options" action={<button className="locationAddButton" type="button" onClick={() => void addTransport()}><Plus size={14} /> Add Transport</button>} /><div className="locationTableWrap"><table className="locationDataTable locationTravelTable"><thead><tr><th>Type</th><th>Name</th><th>Distance</th><th>Action</th></tr></thead><tbody>{transports.map((item) => <tr key={item.id}><td><span className="locationTransportIcon">{item.type === 'AIRPORT' ? <Plane size={16} fill="currentColor" /> : item.type === 'TRAIN' ? <TrainFront size={16} /> : item.type === 'BUS' ? <BusFront size={16} /> : <Route size={16} />}</span></td><td><b>{item.name}</b></td><td>{item.distance}</td><td><button aria-label={`Edit ${item.name}`} type="button" onClick={() => void editTransport(item)}><EditIcon /></button><button aria-label={`Delete ${item.name}`} type="button" onClick={() => void deleteTransport(item)}><Trash2 size={14} /></button></td></tr>)}</tbody></table></div></section>
      <section className="locationDataCard locationLocalCard"><LocationCardHeading icon={<Info size={17} />} title="Local Information" detail="Useful information for guests" /><div className="locationFacts">
        {([['timezone', 'Local Time Zone', <Clock size={14} />], ['bestTimeToVisit', 'Best Time to Visit', <Sun size={14} />], ['elevation', 'Elevation', <Mountain size={14} />], ['weather', 'Weather', <CloudSun size={14} />], ['nearbyCity', 'Nearby City', <Info size={14} />], ['accessRoad', 'Access Road', <Route size={14} />] ] as [keyof LocationProfile, string, React.ReactNode][]).map(([key, label, icon]) => <div className="locationFact" key={key}><span><i>{icon}</i>{label}</span><b>{profile[key]}</b><button type="button" aria-label={`Edit ${label}`} onClick={() => void editProfile(key, label)}><EditIcon size={12} /></button></div>)}
      </div><div className="locationNotes"><div><FileText size={16} /><span><b>Location Notes</b><small>{profile.notes}</small></span></div><button type="button" aria-label="Edit Location Notes" onClick={() => editProfile('notes', 'Location Notes')}><EditIcon size={13} /></button></div></section>
    </section>
    <div className="locationSaveBar"><button className="btn" type="button" disabled={busy || saving || loading} onClick={() => void saveAll()}>{busy || saving ? 'Saving...' : 'Update & Continue'}</button></div>
  </div>;
}
