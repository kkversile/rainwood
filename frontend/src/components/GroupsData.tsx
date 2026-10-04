"use client";

import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiFileBlob, apiRequest } from "../lib/api";
import { useAdminProfile } from "./AdminData";

type Hotel = { id: string; name: string };
type Room = {
  id: string;
  name: string;
  code?: string;
  ratePlans?: { id: string; name: string }[];
};
type ImportError = { row: number; field: string; message: string };
type ImportPreview = {
  rowsRead: number;
  rowsValid: number;
  rowsInvalid: number;
  rowsImported?: number;
  committed?: boolean;
  errors: ImportError[];
};
type BulkResult = {
  entryId: string;
  status: "created" | "already_created" | "failed";
  reservationId?: string;
  reference?: string;
  message?: string;
};
type Group = {
  id: string;
  groupCode: string;
  groupName: string;
  status: string;
  groupType: string;
  arrivalDate: string;
  departureDate: string;
  cutoffDate?: string | null;
  hotel?: Hotel;
  primaryContactName: string;
  primaryContactMobile: string;
  primaryContactEmail?: string | null;
  summary: {
    roomsBlocked: number;
    pickup: number;
    remaining: number;
    roomingListTotal: number;
    roomingListCreated: number;
  };
  roomBlocks?: any[];
  roomingList?: any[];
  banquetEvents?: {
    id: string;
    eventCode: string;
    eventName: string;
    startDate: string;
    endDate: string;
    status: string;
  }[];
};
type PageInfo = { page: number; limit: number; total: number; pages: number };

const blank = {
  groupName: "",
  groupType: "CORPORATE",
  hotelId: "",
  arrivalDate: "",
  departureDate: "",
  primaryContactName: "",
  primaryContactMobile: "",
  primaryContactEmail: "",
  notes: "",
  billingInstruction: "INDIVIDUAL",
  cutoffDate: "",
};
const editableRoles = [
  "SUPER_ADMIN",
  "CORPORATE_ADMIN",
  "ADMIN",
  "RESERVATION",
];

function lastBlockDate(departure: string) {
  if (!departure) return undefined;
  const value = new Date(`${departure}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

export function GroupsData() {
  const { profile } = useAdminProfile();
  const searchParams = useSearchParams();
  const canManage = editableRoles.includes(profile?.role ?? "");
  const globalReadOnly = ["ACCOUNTS", "VIEWER"].includes(profile?.role ?? "");
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [rows, setRows] = useState<Group[]>([]);
  const [pagination, setPagination] = useState<PageInfo>({
    page: 1,
    limit: 25,
    total: 0,
    pages: 0,
  });
  const [selected, setSelected] = useState<Group | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [form, setForm] = useState(blank);
  const [editForm, setEditForm] = useState(blank);
  const [block, setBlock] = useState({
    roomTypeId: "",
    ratePlanId: "",
    date: "",
    roomsBlocked: "1",
  });
  const [guest, setGuest] = useState({
    guestName: "",
    roomTypeId: "",
    checkIn: "",
    checkOut: "",
    adults: "1",
    children: "0",
    email: "",
    mobile: "",
    specialRequest: "",
  });
  const [roomingFile, setRoomingFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(
    null,
  );
  const [selectedEntries, setSelectedEntries] = useState<string[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [bulkResult, setBulkResult] = useState<{
    results: BulkResult[];
    summary: { created: number; alreadyCreated: number; failed: number };
  } | null>(null);
  const [hotelFilter, setHotelFilter] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [arrivalFrom, setArrivalFrom] = useState("");
  const [arrivalTo, setArrivalTo] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const query = new URLSearchParams({
      page: String(pagination.page),
      limit: String(pagination.limit),
    });
    const listHotelId = profile?.staffHotelId || hotelFilter;
    if (listHotelId) query.set("hotelId", listHotelId);
    if (search.trim()) query.set("search", search.trim());
    if (statusFilter) query.set("status", statusFilter);
    if (arrivalFrom) query.set("arrivalFrom", arrivalFrom);
    if (arrivalTo) query.set("arrivalTo", arrivalTo);
    const result = await apiRequest<{ items: Group[]; pagination: PageInfo }>(
      `/groups?${query.toString()}`,
    );
    setRows(result.items);
    setPagination(result.pagination);
    if (selected) {
      const detailQuery =
        globalReadOnly && hotelFilter
          ? `?hotelId=${encodeURIComponent(hotelFilter)}`
          : "";
      setSelected(
        await apiRequest<Group>(`/groups/${selected.id}${detailQuery}`),
      );
    }
  };
  useEffect(() => {
    void apiRequest<Hotel[]>("/hotels")
      .then((hotelRows) => {
        setHotels(hotelRows);
        const defaultHotelId = profile?.staffHotelId || "";
        if (defaultHotelId) {
          setHotelFilter(defaultHotelId);
          setForm((current) => ({
            ...current,
            hotelId: current.hotelId || defaultHotelId,
          }));
        } else if (hotelRows[0])
          setForm((current) => ({
            ...current,
            hotelId: current.hotelId || hotelRows[0].id,
          }));
      })
      .catch((reason) =>
        setError(
          reason instanceof Error ? reason.message : "Could not load hotels",
        ),
      );
  }, [profile?.staffHotelId]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch((reason) =>
        setError(
          reason instanceof Error ? reason.message : "Could not load groups",
        ),
      );
    }, 250);
    return () => window.clearTimeout(timer);
  }, [
    pagination.page,
    pagination.limit,
    search,
    statusFilter,
    arrivalFrom,
    arrivalTo,
    hotelFilter,
    profile?.staffHotelId,
  ]);
  useEffect(() => {
    if (!form.hotelId) return;
    apiRequest<{ rooms: Room[] }>(`/hotels/${form.hotelId}/catalog`)
      .then((catalog) => setRooms(catalog.rooms))
      .catch(() => setRooms([]));
  }, [form.hotelId]);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!canManage) return;
    setBusy(true);
    setError("");
    try {
      const created = await apiRequest<Group>("/groups", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          primaryContactEmail: form.primaryContactEmail || undefined,
          cutoffDate: form.cutoffDate || undefined,
        }),
      });
      setStatus(`Created ${created.groupCode}.`);
      setForm({ ...blank, hotelId: form.hotelId });
      setSelected(created);
      setPagination((current) => ({ ...current, page: 1 }));
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not create group",
      );
    } finally {
      setBusy(false);
    }
  }
  async function open(id: string) {
    setBusy(true);
    setError("");
    try {
      const detailQuery =
        globalReadOnly && hotelFilter
          ? `?hotelId=${encodeURIComponent(hotelFilter)}`
          : "";
      const group = await apiRequest<Group>(`/groups/${id}${detailQuery}`);
      setSelected(group);
      setEditForm({
        ...blank,
        hotelId: group.hotel?.id ?? "",
        groupName: group.groupName,
        groupType: group.groupType,
        arrivalDate: group.arrivalDate.slice(0, 10),
        departureDate: group.departureDate.slice(0, 10),
        primaryContactName: group.primaryContactName,
        primaryContactMobile: group.primaryContactMobile,
        primaryContactEmail: group.primaryContactEmail ?? "",
        cutoffDate: group.cutoffDate?.slice(0, 10) ?? "",
      });
      setSelectedEntries([]);
      setForm((current) => ({
        ...current,
        hotelId: group.hotel?.id ?? current.hotelId,
      }));
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not load group",
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const requested = searchParams.get("open");
    if (requested && !selected) void open(requested);
  }, [searchParams, selected]);
  async function action(path: string, body?: unknown, message = "Saved.") {
    if (!selected || !canManage) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest(`/groups/${selected.id}${path}`, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      });
      setStatus(message);
      await open(selected.id);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not save group",
      );
    } finally {
      setBusy(false);
    }
  }
  async function updateGroup(event: FormEvent) {
    event.preventDefault();
    if (!selected || !canManage) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest(`/groups/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...editForm,
          primaryContactEmail: editForm.primaryContactEmail || undefined,
          cutoffDate: editForm.cutoffDate || null,
        }),
      });
      setStatus("Group details updated.");
      await open(selected.id);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not update group",
      );
    } finally {
      setBusy(false);
    }
  }
  async function addBlock(event: FormEvent) {
    event.preventDefault();
    await action(
      "/blocks",
      {
        roomTypeId: block.roomTypeId,
        ratePlanId: block.ratePlanId || undefined,
        nights: [
          { date: block.date, roomsBlocked: Number(block.roomsBlocked) },
        ],
      },
      "Room block night added.",
    );
  }
  async function addGuest(event: FormEvent) {
    event.preventDefault();
    await action(
      "/rooming-list",
      {
        guestName: guest.guestName,
        roomTypeId: guest.roomTypeId,
        checkIn: guest.checkIn,
        checkOut: guest.checkOut,
        adults: Number(guest.adults),
        children: Number(guest.children),
        email: guest.email || undefined,
        mobile: guest.mobile || undefined,
        specialRequest: guest.specialRequest || undefined,
      },
      "Rooming-list guest added.",
    );
  }
  async function pickup(entryId: string) {
    await action(
      `/rooming-list/${entryId}/pickup`,
      {},
      "Reservation created from rooming list.",
    );
  }
  async function bulkPickup() {
    if (!selected || !selectedEntries.length || !canManage) return;
    setBusy(true);
    setError("");
    try {
      const result = await apiRequest<{
        results: BulkResult[];
        summary: { created: number; alreadyCreated: number; failed: number };
      }>(`/groups/${selected.id}/rooming-list/create-reservations`, {
        method: "POST",
        body: JSON.stringify({ entryIds: selectedEntries }),
      });
      setBulkResult(result);
      setStatus(
        `${result.summary.created} reservation(s) created, ${result.summary.alreadyCreated} already existed, ${result.summary.failed} failed.`,
      );
      setSelectedEntries([]);
      setReviewOpen(false);
      await open(selected.id);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not create pickup reservations",
      );
    } finally {
      setBusy(false);
    }
  }
  async function downloadTemplate() {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const blob = await apiFileBlob(
        `/groups/${selected.id}/rooming-list/template.xlsx`,
      );
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "rainwood-rooming-list-template.xlsx";
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not download rooming-list template",
      );
    } finally {
      setBusy(false);
    }
  }
  async function importRooming(commit: boolean) {
    if (!selected || !roomingFile) return;
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.append("file", roomingFile);
      body.append("commit", String(commit));
      const result = await apiRequest<ImportPreview>(
        `/groups/${selected.id}/rooming-list/import`,
        { method: "POST", body },
      );
      setImportPreview(result);
      if (result.committed) {
        setStatus(
          `${result.rowsImported ?? result.rowsValid} rooming-list rows imported.`,
        );
        setRoomingFile(null);
        await open(selected.id);
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not import rooming list",
      );
    } finally {
      setBusy(false);
    }
  }

  const selectedRoom = rooms.find((room) => room.id === block.roomTypeId);
  const readyEntries =
    selected?.roomingList?.filter((entry: any) => entry.status === "READY") ??
    [];
  const reviewEntries = readyEntries.filter((entry: any) =>
    selectedEntries.includes(entry.id),
  );
  const reviewRoomTypes = [
    ...reviewEntries
      .reduce((map, entry: any) => {
        const key = entry.roomType?.name || entry.roomTypeId;
        const current = map.get(key) ?? { name: key, guests: 0, roomNights: 0 };
        const nights = Math.max(
          1,
          Math.round(
            (new Date(entry.checkOut).getTime() -
              new Date(entry.checkIn).getTime()) /
              86400000,
          ),
        );
        current.guests += 1;
        current.roomNights += nights;
        map.set(key, current);
        return map;
      }, new Map<string, { name: string; guests: number; roomNights: number }>())
      .values(),
  ];
  return (
    <section className="pageSection">
      <header className="pageTitle">
        <div>
          <span>Reservations</span>
          <h1>Groups &amp; room blocks</h1>
          <p>
            Manage group commitments by room type and convert rooming-list
            guests through normal reservations.
          </p>
        </div>
      </header>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {status && (
        <p className="notice" role="status">
          {status}
        </p>
      )}
      {canManage ? (
        <section className="panel">
          <h2>Create group</h2>
          <form className="formCard" onSubmit={create}>
            <div className="three">
              <label>
                Hotel
                <select
                  required
                  value={form.hotelId}
                  onChange={(event) =>
                    setForm({ ...form, hotelId: event.target.value })
                  }
                >
                  {hotels.map((hotel) => (
                    <option key={hotel.id} value={hotel.id}>
                      {hotel.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Group name
                <input
                  required
                  value={form.groupName}
                  onChange={(event) =>
                    setForm({ ...form, groupName: event.target.value })
                  }
                  placeholder="Annual partner meeting"
                />
              </label>
              <label>
                Type
                <select
                  value={form.groupType}
                  onChange={(event) =>
                    setForm({ ...form, groupType: event.target.value })
                  }
                >
                  {[
                    "CORPORATE",
                    "CONFERENCE",
                    "WEDDING",
                    "TOUR",
                    "CREW",
                    "FAMILY",
                    "EVENT",
                    "OTHER",
                  ].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label>
                Arrival
                <input
                  required
                  type="date"
                  value={form.arrivalDate}
                  onChange={(event) =>
                    setForm({ ...form, arrivalDate: event.target.value })
                  }
                />
              </label>
              <label>
                Departure
                <input
                  required
                  type="date"
                  value={form.departureDate}
                  onChange={(event) =>
                    setForm({ ...form, departureDate: event.target.value })
                  }
                />
              </label>
              <label>
                Cutoff date
                <input
                  type="date"
                  max={form.arrivalDate || undefined}
                  value={form.cutoffDate}
                  onChange={(event) =>
                    setForm({ ...form, cutoffDate: event.target.value })
                  }
                />
              </label>
              <label>
                Contact name
                <input
                  required
                  value={form.primaryContactName}
                  onChange={(event) =>
                    setForm({ ...form, primaryContactName: event.target.value })
                  }
                />
              </label>
              <label>
                Contact mobile
                <input
                  required
                  value={form.primaryContactMobile}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      primaryContactMobile: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                Contact email
                <input
                  type="email"
                  value={form.primaryContactEmail}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      primaryContactEmail: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                Billing
                <select
                  value={form.billingInstruction}
                  onChange={(event) =>
                    setForm({ ...form, billingInstruction: event.target.value })
                  }
                >
                  <option>INDIVIDUAL</option>
                  <option>ROOM_TO_MASTER</option>
                  <option>ALL_TO_MASTER</option>
                </select>
              </label>
            </div>
            <label>
              Notes
              <textarea
                value={form.notes}
                onChange={(event) =>
                  setForm({ ...form, notes: event.target.value })
                }
              />
            </label>
            <div className="formActions">
              <button className="btn" disabled={busy}>
                {busy ? "Saving..." : "Create group"}
              </button>
            </div>
          </form>
        </section>
      ) : (
        <section className="panel">
          <h2>Groups &amp; room blocks</h2>
          <p className="mutedText">
            This role has read-only access. Reservation, block, rooming-list,
            and pickup controls are hidden.
          </p>
        </section>
      )}
      <section className="panel">
        <div className="rangeSectionHeader">
          <h2>Group reservations</h2>
          <div className="filterBar">
            {globalReadOnly && (
              <label>
                Hotel
                <select
                  aria-label="Group hotel"
                  value={hotelFilter}
                  onChange={(event) => {
                    setHotelFilter(event.target.value);
                    setPagination((current) => ({ ...current, page: 1 }));
                  }}
                >
                  <option value="">All hotels</option>
                  {hotels.map((hotel) => (
                    <option key={hotel.id} value={hotel.id}>
                      {hotel.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {!globalReadOnly && profile?.staffHotelId && (
              <span className="mutedText">
                Hotel:{" "}
                {profile.staffHotel?.name ||
                  hotels.find((hotel) => hotel.id === profile.staffHotelId)
                    ?.name ||
                  "Assigned property"}
              </span>
            )}
            <input
              aria-label="Search groups"
              placeholder="Search code, group or contact"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPagination((current) => ({ ...current, page: 1 }));
              }}
            />
            <select
              aria-label="Group status"
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value);
                setPagination((current) => ({ ...current, page: 1 }));
              }}
            >
              <option value="">All statuses</option>
              {[
                "INQUIRY",
                "TENTATIVE",
                "CONFIRMED",
                "IN_HOUSE",
                "COMPLETED",
                "CANCELLED",
              ].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
            <input
              aria-label="Arrival from"
              type="date"
              value={arrivalFrom}
              onChange={(event) => {
                setArrivalFrom(event.target.value);
                setPagination((current) => ({ ...current, page: 1 }));
              }}
            />
            <input
              aria-label="Arrival to"
              type="date"
              value={arrivalTo}
              onChange={(event) => {
                setArrivalTo(event.target.value);
                setPagination((current) => ({ ...current, page: 1 }));
              }}
            />
          </div>
        </div>
        {rows.length ? (
          <div className="dataTableWrap">
            <table className="dataTable">
              <thead>
                <tr>
                  <th>Group</th>
                  <th>Hotel</th>
                  <th>Dates</th>
                  <th>Status</th>
                  <th>Blocked room-nights</th>
                  <th>Picked-up room-nights</th>
                  <th>Remaining room-nights</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <b>{row.groupCode}</b>
                      <br />
                      {row.groupName}
                    </td>
                    <td>{row.hotel?.name}</td>
                    <td>
                      {row.arrivalDate.slice(0, 10)} &rarr;{" "}
                      {row.departureDate.slice(0, 10)}
                    </td>
                    <td>{row.status}</td>
                    <td>{row.summary.roomsBlocked}</td>
                    <td>{row.summary.pickup}</td>
                    <td>{row.summary.remaining}</td>
                    <td>
                      <button
                        className="smallBtn"
                        type="button"
                        onClick={() => void open(row.id)}
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">No group reservations found.</p>
        )}
        <div className="formActions">
          <button
            className="smallBtn secondary"
            disabled={pagination.page <= 1}
            onClick={() =>
              setPagination((current) => ({
                ...current,
                page: current.page - 1,
              }))
            }
          >
            Previous
          </button>
          <span>
            Page {pagination.page} of {Math.max(1, pagination.pages)} &middot;{" "}
            {pagination.total} total
          </span>
          <button
            className="smallBtn secondary"
            disabled={!pagination.pages || pagination.page >= pagination.pages}
            onClick={() =>
              setPagination((current) => ({
                ...current,
                page: current.page + 1,
              }))
            }
          >
            Next
          </button>
        </div>
      </section>
      {selected && (
        <section className="panel">
          <div className="rangeSectionHeader">
            <div>
              <h2>{selected.groupName}</h2>
              <p className="mutedText">
                {selected.groupCode} &middot; {selected.status} &middot;{" "}
                {selected.arrivalDate.slice(0, 10)} &rarr;{" "}
                {selected.departureDate.slice(0, 10)}
                {selected.cutoffDate
                  ? ` · Cutoff ${selected.cutoffDate.slice(0, 10)}`
                  : ""}
              </p>
            </div>
            <div className="listActions">
              {canManage && selected.status === "INQUIRY" && (
                <button
                  className="smallBtn"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void action(
                      "/tentative",
                      undefined,
                      "Group marked tentative.",
                    )
                  }
                >
                  Mark tentative
                </button>
              )}
              {canManage &&
                ["INQUIRY", "TENTATIVE"].includes(selected.status) && (
                  <button
                    className="smallBtn"
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void action(
                        "/confirm",
                        undefined,
                        "Group confirmed and inventory committed.",
                      )
                    }
                  >
                    Confirm group
                  </button>
                )}
              {canManage &&
                ["INQUIRY", "TENTATIVE", "CONFIRMED", "IN_HOUSE"].includes(
                  selected.status,
                ) && (
                  <button
                    className="smallBtn secondary"
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void action(
                        "/cancel",
                        undefined,
                        "Group cancelled; unused block released and pickups preserved.",
                      )
                    }
                  >
                    Cancel group
                  </button>
                )}
              {canManage &&
                ["CONFIRMED", "IN_HOUSE"].includes(selected.status) &&
                selected.summary.remaining > 0 && (
                  <button
                    className="smallBtn secondary"
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void action(
                        "/release",
                        undefined,
                        "Unused group block released.",
                      )
                    }
                  >
                    Release unused block
                  </button>
                )}
            </div>
          </div>
          {canManage && (
            <form className="formCard" onSubmit={updateGroup}>
              <h3>Edit group</h3>
              <div className="three">
                <label>
                  Group name
                  <input
                    required
                    value={editForm.groupName}
                    onChange={(event) =>
                      setEditForm({
                        ...editForm,
                        groupName: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Arrival
                  <input
                    required
                    type="date"
                    value={editForm.arrivalDate}
                    onChange={(event) =>
                      setEditForm({
                        ...editForm,
                        arrivalDate: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Departure
                  <input
                    required
                    type="date"
                    value={editForm.departureDate}
                    onChange={(event) =>
                      setEditForm({
                        ...editForm,
                        departureDate: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Contact name
                  <input
                    required
                    value={editForm.primaryContactName}
                    onChange={(event) =>
                      setEditForm({
                        ...editForm,
                        primaryContactName: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Contact mobile
                  <input
                    required
                    value={editForm.primaryContactMobile}
                    onChange={(event) =>
                      setEditForm({
                        ...editForm,
                        primaryContactMobile: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Cutoff date
                  <input
                    type="date"
                    max={editForm.arrivalDate || undefined}
                    value={editForm.cutoffDate}
                    onChange={(event) =>
                      setEditForm({
                        ...editForm,
                        cutoffDate: event.target.value,
                      })
                    }
                  />
                </label>
              </div>
              <div className="formActions">
                <button className="smallBtn" disabled={busy}>
                  Save group details
                </button>
              </div>
            </form>
          )}
          <div className="three">
            <div>
              <b>Blocked room-nights</b>
              <p>{selected.summary.roomsBlocked}</p>
            </div>
            <div>
              <b>Picked-up room-nights</b>
              <p>{selected.summary.pickup}</p>
            </div>
            <div>
              <b>Remaining room-nights</b>
              <p>{selected.summary.remaining}</p>
            </div>
          </div>
          {canManage && (
            <>
              <h3>Nightly room block</h3>
              <form className="formCard" onSubmit={addBlock}>
                <div className="four">
                  <label>
                    Room type
                    <select
                      required
                      value={block.roomTypeId}
                      onChange={(event) =>
                        setBlock({
                          ...block,
                          roomTypeId: event.target.value,
                          ratePlanId: "",
                        })
                      }
                    >
                      <option value="">Select room type</option>
                      {rooms.map((room) => (
                        <option key={room.id} value={room.id}>
                          {room.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Rate plan
                    <select
                      value={block.ratePlanId}
                      disabled={!selectedRoom?.ratePlans?.length}
                      onChange={(event) =>
                        setBlock({ ...block, ratePlanId: event.target.value })
                      }
                    >
                      <option value="">Default rate plan</option>
                      {selectedRoom?.ratePlans?.map((ratePlan) => (
                        <option key={ratePlan.id} value={ratePlan.id}>
                          {ratePlan.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Date
                    <input
                      required
                      type="date"
                      min={selected.arrivalDate.slice(0, 10)}
                      max={lastBlockDate(selected.departureDate.slice(0, 10))}
                      value={block.date}
                      onChange={(event) =>
                        setBlock({ ...block, date: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Rooms
                    <input
                      required
                      min="1"
                      type="number"
                      value={block.roomsBlocked}
                      onChange={(event) =>
                        setBlock({ ...block, roomsBlocked: event.target.value })
                      }
                    />
                  </label>
                  <div className="formActions">
                    <button className="smallBtn" disabled={busy}>
                      Add block night
                    </button>
                  </div>
                </div>
              </form>
            </>
          )}
          {selected.roomBlocks?.length ? (
            <div className="dataTableWrap">
              <table className="dataTable">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Room type / rate plan</th>
                    <th>Blocked rooms</th>
                    <th>Picked up</th>
                    <th>Remaining</th>
                    <th>Inventory</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.roomBlocks.flatMap((item: any) =>
                    item.nights.map((night: any) => (
                      <tr key={night.id}>
                        <td>{night.date.slice(0, 10)}</td>
                        <td>
                          {item.roomType?.name}
                          {item.ratePlan?.name
                            ? ` · ${item.ratePlan.name}`
                            : ""}
                        </td>
                        <td>{night.roomsBlocked}</td>
                        <td>{night.roomsPickedUp}</td>
                        <td>
                          {night.roomsBlocked -
                            night.roomsPickedUp -
                            night.roomsReleased}
                        </td>
                        <td>
                          {item.inventoryCommitted ? "Committed" : "Tentative"}
                        </td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty">No room-type block has been added.</p>
          )}
          <h3>Rooming list</h3>
          {canManage && (
            <>
              <section className="formCard">
                <div className="rangeSectionHeader">
                  <div>
                    <b>Excel rooming list</b>
                    <p className="mutedText">
                      Preview every row before importing it into the group.
                    </p>
                  </div>
                  <button
                    className="smallBtn secondary"
                    type="button"
                    disabled={busy}
                    onClick={() => void downloadTemplate()}
                  >
                    Download template
                  </button>
                </div>
                <div className="formActions">
                  <input
                    type="file"
                    accept=".xlsx,.xlsm"
                    disabled={busy}
                    onChange={(event) => {
                      setRoomingFile(event.target.files?.[0] ?? null);
                      setImportPreview(null);
                    }}
                  />
                  <button
                    className="smallBtn"
                    type="button"
                    disabled={busy || !roomingFile}
                    onClick={() => void importRooming(false)}
                  >
                    Preview Excel
                  </button>
                  <button
                    className="smallBtn"
                    type="button"
                    disabled={
                      busy ||
                      !roomingFile ||
                      !importPreview ||
                      importPreview.rowsInvalid > 0 ||
                      importPreview.rowsValid === 0
                    }
                    onClick={() => void importRooming(true)}
                  >
                    Import valid rows
                  </button>
                </div>
                {importPreview && (
                  <div className="importPreview" role="status">
                    <p>
                      <b>{importPreview.rowsValid}</b> valid /{" "}
                      <b>{importPreview.rowsInvalid}</b> invalid rows from{" "}
                      {importPreview.rowsRead} read.
                    </p>
                    {importPreview.errors.length > 0 && (
                      <ul>
                        {importPreview.errors.map((item, index) => (
                          <li key={`${item.row}-${item.field}-${index}`}>
                            Row {item.row || "all"} &middot; {item.field}:{" "}
                            {item.message}
                          </li>
                        ))}
                      </ul>
                    )}
                    {importPreview.committed && (
                      <p>Import completed successfully.</p>
                    )}
                  </div>
                )}
              </section>
              <form className="formCard" onSubmit={addGuest}>
                <div className="four">
                  <label>
                    Guest name
                    <input
                      required
                      value={guest.guestName}
                      onChange={(event) =>
                        setGuest({ ...guest, guestName: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Room type
                    <select
                      required
                      value={guest.roomTypeId}
                      onChange={(event) =>
                        setGuest({ ...guest, roomTypeId: event.target.value })
                      }
                    >
                      <option value="">Select room type</option>
                      {rooms.map((room) => (
                        <option key={room.id} value={room.id}>
                          {room.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Check-in
                    <input
                      required
                      type="date"
                      value={guest.checkIn}
                      onChange={(event) =>
                        setGuest({ ...guest, checkIn: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Check-out
                    <input
                      required
                      type="date"
                      value={guest.checkOut}
                      onChange={(event) =>
                        setGuest({ ...guest, checkOut: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Adults
                    <input
                      min="1"
                      required
                      type="number"
                      value={guest.adults}
                      onChange={(event) =>
                        setGuest({ ...guest, adults: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Children
                    <input
                      min="0"
                      required
                      type="number"
                      value={guest.children}
                      onChange={(event) =>
                        setGuest({ ...guest, children: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Email
                    <input
                      type="email"
                      value={guest.email}
                      onChange={(event) =>
                        setGuest({ ...guest, email: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Mobile
                    <input
                      value={guest.mobile}
                      onChange={(event) =>
                        setGuest({ ...guest, mobile: event.target.value })
                      }
                    />
                  </label>
                </div>
                <div className="formActions">
                  <button className="smallBtn" disabled={busy}>
                    Add guest
                  </button>
                </div>
              </form>
            </>
          )}
          {selected.roomingList?.length ? (
            <div className="dataTableWrap">
              <table className="dataTable">
                <thead>
                  <tr>
                    <th>
                      <input
                        aria-label="Select all ready guests"
                        type="checkbox"
                        checked={
                          readyEntries.length > 0 &&
                          readyEntries.every((entry: any) =>
                            selectedEntries.includes(entry.id),
                          )
                        }
                        onChange={(event) =>
                          setSelectedEntries(
                            event.target.checked
                              ? readyEntries.map((entry: any) => entry.id)
                              : [],
                          )
                        }
                      />
                    </th>
                    <th>Guest</th>
                    <th>Room type</th>
                    <th>Dates</th>
                    <th>PAX</th>
                    <th>Status</th>
                    <th>Reservation</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.roomingList.map((entry: any) => (
                    <tr key={entry.id}>
                      <td>
                        {entry.status === "READY" && (
                          <input
                            aria-label={`Select ${entry.guestName}`}
                            type="checkbox"
                            checked={selectedEntries.includes(entry.id)}
                            onChange={(event) =>
                              setSelectedEntries((current) =>
                                event.target.checked
                                  ? [...new Set([...current, entry.id])]
                                  : current.filter((id) => id !== entry.id),
                              )
                            }
                          />
                        )}
                      </td>
                      <td>{entry.guestName}</td>
                      <td>{entry.roomType?.name}</td>
                      <td>
                        {entry.checkIn.slice(0, 10)} &rarr;{" "}
                        {entry.checkOut.slice(0, 10)}
                      </td>
                      <td>
                        {entry.adults}A / {entry.children}C
                      </td>
                      <td>
                        {entry.status}
                        {entry.errorMessage ? (
                          <small>{entry.errorMessage}</small>
                        ) : null}
                      </td>
                      <td>
                        {entry.reservation?.reference ? (
                          <a
                            href={`/rainwood/admin/reservations?search=${encodeURIComponent(entry.reservation.reference)}&open=${encodeURIComponent(entry.reservation.reference)}`}
                          >
                            {entry.reservation.reference}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        {canManage && entry.status === "READY" && (
                          <button
                            className="smallBtn"
                            type="button"
                            disabled={busy}
                            onClick={() => void pickup(entry.id)}
                          >
                            Create reservation
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty">No rooming-list guests yet.</p>
          )}
          {canManage && readyEntries.length > 0 && (
            <div className="formActions">
              <button
                className="smallBtn"
                type="button"
                disabled={busy || !selectedEntries.length}
                onClick={() => setReviewOpen(true)}
              >
                Review &amp; create {selectedEntries.length || ""} reservations
              </button>
              <span>{readyEntries.length} ready guest(s)</span>
            </div>
          )}
        </section>
      )}
      {reviewOpen && selected && (
        <div className="arrivalDetailsBackdrop">
          <section
            className="arrivalFolioDialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="group-pickup-review-title"
          >
            <header>
              <div>
                <span className="eyebrow">Rooming list pickup</span>
                <h2 id="group-pickup-review-title">
                  Review reservation creation
                </h2>
              </div>
              <button
                className="uiModalClose"
                type="button"
                onClick={() => setReviewOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </header>
            <p className="mutedText">
              Review the selected guests before creating standard reservations.
              Prices and totals are calculated by the server during pickup.
            </p>
            <div className="reviewGrid">
              <div>
                <span>Selected guests</span>
                <b>{reviewEntries.length}</b>
              </div>
              <div>
                <span>Room-nights</span>
                <b>
                  {reviewRoomTypes.reduce(
                    (sum, item) => sum + item.roomNights,
                    0,
                  )}
                </b>
              </div>
              <div>
                <span>Group</span>
                <b>{selected.groupCode}</b>
              </div>
            </div>
            <div className="dataTableWrap">
              <table className="dataTable">
                <thead>
                  <tr>
                    <th>Guest</th>
                    <th>Room type</th>
                    <th>Stay</th>
                    <th>PAX</th>
                  </tr>
                </thead>
                <tbody>
                  {reviewEntries.map((entry: any) => (
                    <tr key={entry.id}>
                      <td>{entry.guestName}</td>
                      <td>{entry.roomType?.name}</td>
                      <td>
                        {entry.checkIn.slice(0, 10)} →{" "}
                        {entry.checkOut.slice(0, 10)}
                      </td>
                      <td>
                        {entry.adults}A / {entry.children}C
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3>Room-type summary</h3>
            <ul>
              {reviewRoomTypes.map((item) => (
                <li key={item.name}>
                  {item.name}: {item.guests} guest(s), {item.roomNights}{" "}
                  room-night(s)
                </li>
              ))}
            </ul>
            <footer>
              <button
                className="smallBtn secondary"
                type="button"
                disabled={busy}
                onClick={() => setReviewOpen(false)}
              >
                Cancel
              </button>
              <button
                className="smallBtn"
                type="button"
                disabled={busy || !reviewEntries.length}
                onClick={() => void bulkPickup()}
              >
                {busy ? "Creating…" : "Create reservations"}
              </button>
            </footer>
          </section>
        </div>
      )}
      {bulkResult && (
        <section className="panel" aria-live="polite">
          <div className="rangeSectionHeader">
            <div>
              <span className="eyebrow">Bulk pickup result</span>
              <h2>Reservation creation results</h2>
            </div>
            <button
              className="smallBtn secondary"
              type="button"
              onClick={() => setBulkResult(null)}
            >
              Dismiss
            </button>
          </div>
          <div className="three">
            <div>
              <b>Created</b>
              <p>{bulkResult.summary.created}</p>
            </div>
            <div>
              <b>Already created</b>
              <p>{bulkResult.summary.alreadyCreated}</p>
            </div>
            <div>
              <b>Failed</b>
              <p>{bulkResult.summary.failed}</p>
            </div>
          </div>
          {bulkResult.results.some((item) => item.status === "failed") && (
            <ul>
              {bulkResult.results
                .filter((item) => item.status === "failed")
                .map((item) => (
                  <li key={item.entryId}>
                    Guest {item.entryId}: {item.message || "Pickup failed"}
                  </li>
                ))}
            </ul>
          )}
        </section>
      )}
      {selected && (
        <section className="panel">
          <div className="rangeSectionHeader">
            <div>
              <h3>Banquet events</h3>
              <p className="mutedText">
                Linked catering and function-space operations for this group.
              </p>
            </div>
            {canManage && (
              <a
                className="smallBtn"
                href={`/rainwood/admin/banquets?hotelId=${encodeURIComponent(selected.hotel?.id ?? "")}&groupId=${encodeURIComponent(selected.id)}`}
              >
                Add banquet event
              </a>
            )}
          </div>
          {selected.banquetEvents?.length ? (
            <div className="dataTableWrap">
              <table className="dataTable">
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Dates</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.banquetEvents.map((event) => (
                    <tr key={event.id}>
                      <td>
                        <b>{event.eventCode}</b>
                        <br />
                        {event.eventName}
                      </td>
                      <td>
                        {event.startDate.slice(0, 10)} &rarr;{" "}
                        {event.endDate.slice(0, 10)}
                      </td>
                      <td>{event.status}</td>
                      <td>
                        <a
                          className="smallBtn secondary"
                          href={`/rainwood/admin/banquets?event=${encodeURIComponent(event.id)}`}
                        >
                          Open event
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty">No banquet events linked to this group yet.</p>
          )}
        </section>
      )}
    </section>
  );
}
