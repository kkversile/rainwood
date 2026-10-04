"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { apiRequest } from "../lib/api";
import { formatHotelDateTime } from "../lib/hotel-date-time";
import { useAdminProfile } from "./AdminData";

const categories = [
  "GUEST_REQUEST",
  "VIP",
  "COMPLAINT",
  "PAYMENT_FOLLOWUP",
  "ARRIVAL",
  "DEPARTURE",
  "ROOM",
  "HOUSEKEEPING",
  "MAINTENANCE",
  "TRANSPORT",
  "SECURITY",
  "GENERAL",
];
const priorities = ["NORMAL", "IMPORTANT", "URGENT"];
const departments = [
  "FOOD_BEVERAGE",
  "HOUSEKEEPING",
  "MAINTENANCE",
  "ROOM_SERVICE",
  "FRONT_OFFICE",
  "OTHER",
];
const statuses = ["OPEN", "ACKNOWLEDGED", "RESOLVED"];
const human = (value: string) =>
  value
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
const dateLabel = (value?: string | null) =>
  value
    ? new Date(`${value.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      })
    : "—";

type Hotel = { id: string; name: string; timezoneName?: string };
type Log = {
  id: string;
  hotelId: string;
  businessDate: string;
  category: string;
  priority: string;
  title: string;
  details: string;
  status: string;
  assignedDepartment?: string | null;
  assignedUser?: { id: string; name: string } | null;
  createdBy?: { name: string } | null;
  hotel?: Hotel;
  reservation?: { id: string; reference: string; guestName: string } | null;
  guestProfile?: {
    id: string;
    displayName: string;
    vipLevel?: string | null;
  } | null;
  room?: { id: string; roomNumber: string } | null;
  maintenanceTicket?: { id: string; title: string; status: string } | null;
  housekeepingTask?: {
    id: string;
    status: string;
    room?: { roomNumber: string } | null;
  } | null;
  dueAt?: string | null;
  dueLabel?: string | null;
  dueState?: string | null;
  carriedForward?: boolean;
  ageLabel?: string | null;
  updates?: {
    id: string;
    note: string;
    createdAt: string;
    author?: { name: string };
  }[];
};
type Result = {
  hotel: Hotel;
  businessDate: string;
  currentBusinessDate?: string;
  items: Log[];
  pagination: { page: number; limit: number; total: number; pages: number };
  handoverPagination?: {
    totalActive: number;
    returnedActive: number;
    hasMore: boolean;
    hasPrevious?: boolean;
    limit: number;
  };
  summary: {
    open: number;
    acknowledged: number;
    resolved: number;
    urgent: number;
    overdue: number;
    dueSoon: number;
    scheduled: number;
    due: number;
  };
};
type Options = {
  hotel: Hotel;
  users: {
    id: string;
    name: string;
    role: string;
    staffDepartment?: string | null;
  }[];
  reservations: { id: string; reference: string; guestName: string }[];
  rooms: { id: string; roomNumber: string }[];
  maintenanceTickets: {
    id: string;
    title: string;
    room?: { roomNumber: string } | null;
  }[];
  housekeepingTasks: {
    id: string;
    status: string;
    room?: { roomNumber: string } | null;
  }[];
  guests: { id: string; displayName: string }[];
};
type Form = {
  hotelId: string;
  category: string;
  priority: string;
  title: string;
  details: string;
  assignedDepartment: string;
  assignedUserId: string;
  dueAt: string;
  reservationId: string;
  guestProfileId: string;
  roomId: string;
  maintenanceTicketId: string;
  housekeepingTaskId: string;
};
type Capabilities = {
  canCreate: boolean;
  canUpdate: boolean;
  canAcknowledge: boolean;
  canResolve: boolean;
  canAssign: boolean;
  categories: string[];
};

export function getOperationsLogbookCapabilities(
  role?: string | null,
  department?: string | null,
): Capabilities {
  if (!role || role === "VIEWER")
    return {
      canCreate: false,
      canUpdate: false,
      canAcknowledge: false,
      canResolve: false,
      canAssign: false,
      categories: [],
    };
  if (role === "ACCOUNTS")
    return {
      canCreate: true,
      canUpdate: true,
      canAcknowledge: true,
      canResolve: true,
      canAssign: false,
      categories: ["PAYMENT_FOLLOWUP"],
    };
  if (role === "SERVICE_STAFF") {
    const scoped =
      department === "HOUSEKEEPING"
        ? [
            "HOUSEKEEPING",
            "ROOM",
            "GENERAL",
            "GUEST_REQUEST",
            "VIP",
            "COMPLAINT",
          ]
        : department === "MAINTENANCE"
          ? [
              "MAINTENANCE",
              "ROOM",
              "GENERAL",
              "GUEST_REQUEST",
              "VIP",
              "COMPLAINT",
            ]
          : ["GUEST_REQUEST", "VIP", "COMPLAINT", "GENERAL"];
    return {
      canCreate: true,
      canUpdate: true,
      canAcknowledge: true,
      canResolve: true,
      canAssign: false,
      categories: scoped,
    };
  }
  return {
    canCreate: true,
    canUpdate: true,
    canAcknowledge: true,
    canResolve: true,
    canAssign: ["SUPER_ADMIN", "CORPORATE_ADMIN", "ADMIN"].includes(role),
    categories,
  };
}

function emptyForm(
  hotelId: string,
  params: URLSearchParams,
  allowedCategories = categories,
): Form {
  const requestedCategory = params.get("category") ?? "";
  const contextualCreate = params.get("new") === "1";
  const safePrefill = (key: string, limit: number) =>
    contextualCreate ? (params.get(key) ?? "").slice(0, limit) : "";
  return {
    hotelId,
    category: allowedCategories.includes(requestedCategory)
      ? requestedCategory
      : (allowedCategories[0] ?? "GENERAL"),
    priority: "NORMAL",
    title: safePrefill("title", 180),
    details: safePrefill("details", 2000),
    assignedDepartment: "",
    assignedUserId: "",
    dueAt: "",
    reservationId: params.get("reservationId") ?? "",
    guestProfileId: params.get("guestProfileId") ?? "",
    roomId: params.get("roomId") ?? "",
    maintenanceTicketId: params.get("maintenanceTicketId") ?? "",
    housekeepingTaskId: params.get("housekeepingTaskId") ?? "",
  };
}

export function OperationsLogbookData() {
  const { profile } = useAdminProfile();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [hotelId, setHotelId] = useState(
    params.get("hotelId") ?? profile?.staffHotelId ?? "",
  );
  const [businessDate, setBusinessDate] = useState(
    params.get("businessDate") ?? "",
  );
  const [status, setStatus] = useState(params.get("status") ?? "");
  const [priority, setPriority] = useState(params.get("priority") ?? "");
  const [category, setCategory] = useState(params.get("category") ?? "");
  const [department, setDepartment] = useState(params.get("department") ?? "");
  const [search, setSearch] = useState(params.get("search") ?? "");
  const [page, setPage] = useState(Number(params.get("page") ?? 1) || 1);
  const [result, setResult] = useState<Result | null>(null);
  const [options, setOptions] = useState<Options | null>(null);
  const [selected, setSelected] = useState<Log | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [handover, setHandover] = useState(params.get("view") === "handover");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const capabilities = getOperationsLogbookCapabilities(
    profile?.role,
    profile?.staffDepartment,
  );
  const requiresHotelSelection = [
    "SUPER_ADMIN",
    "CORPORATE_ADMIN",
    "ACCOUNTS",
    "VIEWER",
  ].includes(profile?.role ?? "");
  const reservationRef = params.get("reservationRef") ?? "";
  const [form, setForm] = useState<Form>(() =>
    emptyForm(hotelId, params, capabilities.categories),
  );
  const queryString = useMemo(() => {
    const query = new URLSearchParams({
      hotelId,
      page: String(page),
      limit: handover ? "100" : "25",
    });
    if (!handover && businessDate) query.set("businessDate", businessDate);
    if (status) query.set("status", status);
    if (priority) query.set("priority", priority);
    if (category) query.set("category", category);
    if (department) query.set("assignedDepartment", department);
    if (search.trim()) query.set("search", search.trim());
    return query.toString();
  }, [
    businessDate,
    category,
    department,
    handover,
    hotelId,
    page,
    priority,
    search,
    status,
  ]);

  useEffect(() => {
    if (profile?.staffHotelId && !hotelId) setHotelId(profile.staffHotelId);
  }, [hotelId, profile?.staffHotelId]);
  useEffect(() => {
    if (!requiresHotelSelection) return;
    apiRequest<Hotel[]>("/hotels")
      .then((items) => {
        setHotels(items);
        if (!hotelId && items[0]) setHotelId(items[0].id);
      })
      .catch((reason) =>
        setError(
          reason instanceof Error ? reason.message : "Could not load hotels.",
        ),
      );
  }, [hotelId, requiresHotelSelection]);
  useEffect(() => {
    if (!hotelId || !capabilities.canCreate) {
      if (!capabilities.canCreate) setOptions(null);
      return;
    }
    setForm((previous) =>
      previous.hotelId === hotelId ? previous : { ...previous, hotelId },
    );
    const contextQuery = reservationRef
      ? `&reservationRef=${encodeURIComponent(reservationRef)}`
      : "";
    apiRequest<Options>(
      `/operations-logbook/options?hotelId=${encodeURIComponent(hotelId)}${contextQuery}`,
    )
      .then(setOptions)
      .catch((reason) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "Could not load logbook options.",
        ),
      );
  }, [capabilities.canCreate, hotelId, reservationRef]);
  useEffect(() => {
    if (!hotelId) return;
    setLoading(true);
    setError("");
    const path = handover
      ? `/operations-logbook/handover?${queryString}`
      : `/operations-logbook?${queryString}`;
    apiRequest<Result>(path)
      .then(setResult)
      .catch((reason) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "Could not load the operations logbook.",
        ),
      )
      .finally(() => setLoading(false));
  }, [handover, hotelId, queryString]);
  useEffect(() => {
    const next = new URLSearchParams();
    if (hotelId) next.set("hotelId", hotelId);
    if (!handover && businessDate) next.set("businessDate", businessDate);
    if (status) next.set("status", status);
    if (priority) next.set("priority", priority);
    if (category) next.set("category", category);
    if (department) next.set("department", department);
    if (search.trim()) next.set("search", search.trim());
    if (page > 1) next.set("page", String(page));
    if (handover) next.set("view", "handover");
    for (const key of [
      "new",
      "title",
      "details",
      "reservationRef",
      "reservationId",
      "guestProfileId",
      "roomId",
      "maintenanceTicketId",
      "housekeepingTaskId",
    ]) {
      const value = params.get(key);
      if (value) next.set(key, value);
    }
    router.replace(`${pathname}?${next}`, { scroll: false });
  }, [
    businessDate,
    category,
    department,
    handover,
    hotelId,
    page,
    pathname,
    priority,
    router,
    search,
    status,
  ]);
  useEffect(() => {
    const hasContext =
      params.get("new") === "1" ||
      reservationRef ||
      params.get("reservationId") ||
      params.get("roomId") ||
      params.get("maintenanceTicketId") ||
      params.get("housekeepingTaskId") ||
      params.get("guestProfileId");
    if (!hasContext || !hotelId || !options) return;
    const reservationId =
      params.get("reservationId") ??
      options.reservations.find((item) => item.reference === reservationRef)
        ?.id ??
      "";
    setForm({
      ...emptyForm(hotelId, params, capabilities.categories),
      reservationId,
    });
    setShowForm(true);
  }, [capabilities.categories, hotelId, options, params, reservationRef]);

  const currentBusinessDate =
    result?.currentBusinessDate ?? result?.businessDate ?? "";
  const updateFilters = (setter: (value: string) => void, value: string) => {
    setter(value);
    setPage(1);
  };
  const context = (item: Log) =>
    [
      item.reservation ? `Reservation ${item.reservation.reference}` : "",
      item.reservation?.guestName ?? item.guestProfile?.displayName ?? "",
      item.room ? `Room ${item.room.roomNumber}` : "",
      item.maintenanceTicket
        ? `Maintenance ${item.maintenanceTicket.title}`
        : "",
      item.housekeepingTask
        ? `Housekeeping ${item.housekeepingTask.status}`
        : "",
    ]
      .filter(Boolean)
      .join(" · ");
  async function reload() {
    if (!hotelId) return;
    try {
      const path = handover
        ? `/operations-logbook/handover?${queryString}`
        : `/operations-logbook?${queryString}`;
      setResult(await apiRequest<Result>(path));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not refresh the logbook.",
      );
    }
  }
  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy("create");
    setError("");
    try {
      const body = {
        ...form,
        assignedDepartment: form.assignedDepartment || undefined,
        assignedUserId: form.assignedUserId || undefined,
        dueAt: form.dueAt || undefined,
        reservationId: form.reservationId || undefined,
        guestProfileId: form.guestProfileId || undefined,
        roomId: form.roomId || undefined,
        maintenanceTicketId: form.maintenanceTicketId || undefined,
        housekeepingTaskId: form.housekeepingTaskId || undefined,
      };
      await apiRequest<Log>("/operations-logbook", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setShowForm(false);
      setForm(
        emptyForm(hotelId, new URLSearchParams(), capabilities.categories),
      );
      setPage(1);
      await reload();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not create logbook entry.",
      );
    } finally {
      setBusy("");
    }
  }
  async function action(path: string, body?: unknown) {
    setBusy(path);
    setError("");
    try {
      const updated = await apiRequest<Log>(path, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!path.endsWith("/updates")) setSelected(updated);
      await reload();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not update the entry.",
      );
    } finally {
      setBusy("");
    }
  }
  const groups = (result as Result & { groups?: Record<string, Log[]> })
    ?.groups;

  return (
    <section className="operationsLogbookPage">
      <header className="operationsLogbookHero">
        <div>
          <span className="eyebrow">Hotel operations</span>
          <h1>Operations Logbook</h1>
          <p>
            Shift handover notes, follow-ups, and accountable operational work
            for the hotel business day.
          </p>
        </div>
        <div className="operationsLogbookHeaderActions">
          <button
            className="smallBtn secondary"
            type="button"
            onClick={() => window.print()}
          >
            Print handover
          </button>
          {capabilities.canCreate && (
            <button
              className="smallBtn"
              type="button"
              onClick={() => {
                setForm(
                  emptyForm(
                    hotelId,
                    new URLSearchParams(),
                    capabilities.categories,
                  ),
                );
                setShowForm(true);
              }}
            >
              + New entry
            </button>
          )}
        </div>
      </header>
      <section className="operationsLogbookToolbar panel">
        <div className="operationsLogbookToolbarRow">
          {requiresHotelSelection && (
            <label>
              Hotel
              <select
                value={hotelId}
                onChange={(event) => {
                  setHotelId(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">Select hotel</option>
                {hotels.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Business Date
            <input
              aria-label="Business Date"
              type="date"
              value={businessDate || currentBusinessDate}
              max={currentBusinessDate || undefined}
              onChange={(event) => {
                setHandover(false);
                updateFilters(setBusinessDate, event.target.value);
              }}
            />
          </label>
          <button
            className="smallBtn secondary"
            type="button"
            onClick={() => {
              setBusinessDate("");
              setHandover(true);
              setPage(1);
            }}
          >
            Current Business Day
          </button>
          <label>
            Search
            <input
              value={search}
              onChange={(event) => updateFilters(setSearch, event.target.value)}
              placeholder="Title, guest, reservation or room"
            />
          </label>
          <label>
            Status
            <select
              value={status}
              onChange={(event) => updateFilters(setStatus, event.target.value)}
            >
              <option value="">All statuses</option>
              {statuses.map((item) => (
                <option key={item}>{human(item)}</option>
              ))}
            </select>
          </label>
          <label>
            Priority
            <select
              value={priority}
              onChange={(event) =>
                updateFilters(setPriority, event.target.value)
              }
            >
              <option value="">All priorities</option>
              {priorities.map((item) => (
                <option key={item}>{human(item)}</option>
              ))}
            </select>
          </label>
          <label>
            Category
            <select
              value={category}
              onChange={(event) =>
                updateFilters(setCategory, event.target.value)
              }
            >
              <option value="">All categories</option>
              {capabilities.categories.map((item) => (
                <option key={item}>{human(item)}</option>
              ))}
            </select>
          </label>
          <label>
            Department
            <select
              value={department}
              onChange={(event) =>
                updateFilters(setDepartment, event.target.value)
              }
            >
              <option value="">All departments</option>
              {departments.map((item) => (
                <option key={item}>{human(item)}</option>
              ))}
            </select>
          </label>
          <button
            className={`smallBtn ${handover ? "" : "secondary"}`}
            type="button"
            onClick={() => {
              setHandover(!handover);
              if (!handover) setBusinessDate("");
              setPage(1);
            }}
          >
            {handover ? "History view" : "Handover view"}
          </button>
        </div>
        <p className="operationsLogbookViewNote">
          History uses 25 items per page. Current Shift Handover uses 100 items
          per page and includes unresolved carried-forward entries.
        </p>
      </section>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <section
        className="operationsLogbookSummary"
        aria-label="Logbook summary"
      >
        <div>
          <span>Open</span>
          <strong>{result?.summary.open ?? 0}</strong>
        </div>
        <div>
          <span>Acknowledged</span>
          <strong>{result?.summary.acknowledged ?? 0}</strong>
        </div>
        <div>
          <span>Resolved</span>
          <strong>{result?.summary.resolved ?? 0}</strong>
        </div>
        <div>
          <span>Urgent</span>
          <strong>{result?.summary.urgent ?? 0}</strong>
        </div>
        <div>
          <span>Overdue</span>
          <strong>{result?.summary.overdue ?? 0}</strong>
        </div>
        <div>
          <span>Due within 2h</span>
          <strong>{result?.summary.dueSoon ?? 0}</strong>
        </div>
      </section>
      <section className="panel operationsLogbookList">
        <div className="sectionHead">
          <div>
            <span>
              {result?.hotel.name ?? "Hotel operations"} ·{" "}
              {handover
                ? `Current business day ${dateLabel(result?.businessDate)}`
                : `History — ${dateLabel(result?.businessDate)}`}
            </span>
            <h2>{handover ? "Current Shift Handover" : "Logbook History"}</h2>
            <p>
              {handover
                ? "Open and acknowledged entries from the current business day and earlier unresolved dates."
                : "Entries retain their original business date for audit and historical review."}
            </p>
          </div>
          <strong>
            {result?.pagination.total ?? 0} item
            {result?.pagination.total === 1 ? "" : "s"}
          </strong>
        </div>
        {loading ? (
          <p className="loading">Loading operations logbook…</p>
        ) : handover && groups ? (
          <div className="operationsHandoverGroups">
            {result?.handoverPagination?.hasMore && (
              <p className="notice" role="status">
                This handover is showing{" "}
                {result.handoverPagination.returnedActive} of{" "}
                {result.handoverPagination.totalActive} active entries. Use the
                next page to view the remaining items.
              </p>
            )}
            {result && result.pagination.pages > 1 && (
              <p className="notice operationsLogbookPrintNotice" role="status">
                Print includes this page only: page {result.pagination.page} of{" "}
                {result.pagination.pages}, showing{" "}
                {result.handoverPagination?.returnedActive ??
                  result.items.length}{" "}
                of{" "}
                {result.handoverPagination?.totalActive ??
                  result.pagination.total}{" "}
                active items.
              </p>
            )}
            {Object.entries(groups)
              .filter(([, items]) => items.length)
              .map(([key, items]) => (
                <section key={key}>
                  <h3>{human(key)}</h3>
                  {items.map((item) => (
                    <LogCard
                      key={item.id}
                      item={item}
                      context={context(item)}
                      onOpen={() => setSelected(item)}
                    />
                  ))}
                </section>
              ))}
            {!Object.values(groups).some((items) => items.length) && (
              <div className="emptyState">
                <strong>No active handover items</strong>
                <span>
                  The current business day has no open or acknowledged entries.
                </span>
              </div>
            )}
          </div>
        ) : result?.items.length ? (
          <div className="operationsLogbookCards">
            {result.items.map((item) => (
              <LogCard
                key={item.id}
                item={item}
                context={context(item)}
                onOpen={() => setSelected(item)}
              />
            ))}
          </div>
        ) : (
          <div className="emptyState">
            <strong>No logbook entries found</strong>
            <span>Create a handover note or broaden the filters.</span>
          </div>
        )}
        {result && result.pagination.pages > 1 && (
          <footer className="operationsLogbookPagination">
            <button
              className="smallBtn secondary"
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </button>
            <span>
              Page {page} of {result.pagination.pages}
            </span>
            <button
              className="smallBtn secondary"
              type="button"
              disabled={page >= result.pagination.pages}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </footer>
        )}
      </section>
      {showForm && (
        <div className="operationsLogbookBackdrop">
          <section
            className="operationsLogbookDialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="operations-logbook-form-title"
          >
            <header>
              <div>
                <span className="eyebrow">New handover note</span>
                <h2 id="operations-logbook-form-title">
                  Add to Operations Logbook
                </h2>
              </div>
              <button
                className="uiModalClose"
                type="button"
                aria-label="Close logbook form"
                onClick={() => setShowForm(false)}
              >
                ×
              </button>
            </header>
            <p className="operationsLogbookPrivacy">
              Do not enter passwords, payment-card details, government ID
              numbers, or medical information.
            </p>
            <form onSubmit={(event) => void create(event)}>
              <div className="operationsLogbookFormGrid">
                <label>
                  Category
                  <select
                    value={form.category}
                    onChange={(event) =>
                      setForm({ ...form, category: event.target.value })
                    }
                  >
                    {capabilities.categories.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Priority
                  <select
                    value={form.priority}
                    onChange={(event) =>
                      setForm({ ...form, priority: event.target.value })
                    }
                  >
                    {priorities.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
                <label className="wide">
                  Title
                  <input
                    required
                    minLength={2}
                    value={form.title}
                    onChange={(event) =>
                      setForm({ ...form, title: event.target.value })
                    }
                    placeholder="What the next shift needs to know"
                  />
                </label>
                <label className="wide">
                  Details
                  <textarea
                    required
                    minLength={2}
                    value={form.details}
                    onChange={(event) =>
                      setForm({ ...form, details: event.target.value })
                    }
                    placeholder="Clear action, guest expectation, and next step"
                  />
                </label>
                {capabilities.canAssign && (
                  <>
                    <label>
                      Department
                      <select
                        value={form.assignedDepartment}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            assignedDepartment: event.target.value,
                          })
                        }
                      >
                        <option value="">Unassigned</option>
                        {departments.map((item) => (
                          <option key={item}>{item}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Assigned user
                      <select
                        value={form.assignedUserId}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            assignedUserId: event.target.value,
                          })
                        }
                      >
                        <option value="">Unassigned</option>
                        {options?.users.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
                <label>
                  Due at <small>(hotel local time)</small>
                  <input
                    type="datetime-local"
                    value={form.dueAt}
                    onChange={(event) =>
                      setForm({ ...form, dueAt: event.target.value })
                    }
                  />
                </label>
                <label>
                  Reservation
                  <select
                    value={form.reservationId}
                    onChange={(event) =>
                      setForm({ ...form, reservationId: event.target.value })
                    }
                  >
                    <option value="">None</option>
                    {options?.reservations.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.reference} · {item.guestName}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Guest
                  <select
                    value={form.guestProfileId}
                    onChange={(event) =>
                      setForm({ ...form, guestProfileId: event.target.value })
                    }
                  >
                    <option value="">None</option>
                    {options?.guests.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.displayName}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Room
                  <select
                    value={form.roomId}
                    onChange={(event) =>
                      setForm({ ...form, roomId: event.target.value })
                    }
                  >
                    <option value="">None</option>
                    {options?.rooms.map((item) => (
                      <option key={item.id} value={item.id}>
                        Room {item.roomNumber}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Maintenance
                  <select
                    value={form.maintenanceTicketId}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        maintenanceTicketId: event.target.value,
                      })
                    }
                  >
                    <option value="">None</option>
                    {options?.maintenanceTickets.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title}
                        {item.room ? ` · Room ${item.room.roomNumber}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Housekeeping
                  <select
                    value={form.housekeepingTaskId}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        housekeepingTaskId: event.target.value,
                      })
                    }
                  >
                    <option value="">None</option>
                    {options?.housekeepingTasks.map((item) => (
                      <option key={item.id} value={item.id}>
                        Room {item.room?.roomNumber ?? "—"} ·{" "}
                        {human(item.status)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <footer>
                <button
                  className="smallBtn secondary"
                  type="button"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </button>
                <button
                  className="smallBtn"
                  type="submit"
                  disabled={busy === "create"}
                >
                  {busy === "create" ? "Saving…" : "Save entry"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
      {selected && (
        <LogDetail
          item={selected}
          busy={busy}
          error={error}
          capabilities={capabilities}
          onClose={() => setSelected(null)}
          onRefresh={async () => {
            const detail = await apiRequest<Log>(
              `/operations-logbook/${selected.id}`,
            );
            setSelected(detail);
            await reload();
          }}
          onAction={(path, body) => action(path, body)}
        />
      )}
    </section>
  );
}

function LogCard({
  item,
  context,
  onOpen,
}: {
  item: Log;
  context: string;
  onOpen: () => void;
}) {
  const urgency =
    item.dueState === "OVERDUE"
      ? "Overdue"
      : item.dueState === "DUE_SOON"
        ? "Due within 2h"
        : item.dueState === "SCHEDULED"
          ? "Scheduled"
          : "No due time";
  return (
    <button
      className={`operationsLogbookCard priority-${item.priority.toLowerCase()}`}
      type="button"
      onClick={onOpen}
    >
      <div className="operationsLogbookCardTop">
        <span
          className={`status ${item.status === "RESOLVED" ? "ok" : item.priority === "URGENT" ? "err" : "warn"}`}
        >
          {human(item.status)}
        </span>
        <span>
          {human(item.priority)} · {human(item.category)}
        </span>
      </div>
      <h3>{item.title}</h3>
      <p>{item.details}</p>
      <div className="operationsLogbookCardMeta">
        <span>{context || "General operations"}</span>
        <span>
          {item.assignedUser?.name ??
            (item.assignedDepartment
              ? human(item.assignedDepartment)
              : "Unassigned")}
        </span>
        <span>
          {item.carriedForward
            ? `Carried forward from ${dateLabel(item.businessDate)}`
            : (item.ageLabel ?? "Current business day")}
        </span>
        <span>
          {urgency}
          {item.dueLabel ? ` · ${item.dueLabel}` : ""}
        </span>
      </div>
    </button>
  );
}

function LogDetail({
  item,
  busy,
  error,
  capabilities,
  onClose,
  onRefresh,
  onAction,
}: {
  item: Log;
  busy: string;
  error: string;
  capabilities: Capabilities;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onAction: (path: string, body?: unknown) => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [resolution, setResolution] = useState("");
  const timezone = item.hotel?.timezoneName;
  return (
    <div className="operationsLogbookBackdrop">
      <section
        className="operationsLogbookDialog operationsLogbookDetail"
        role="dialog"
        aria-modal="true"
        aria-labelledby="operations-logbook-detail-title"
      >
        <header>
          <div>
            <span className="eyebrow">
              {human(item.category)} · {human(item.priority)}
            </span>
            <h2 id="operations-logbook-detail-title">{item.title}</h2>
            <p>
              {item.carriedForward ? "Carried forward from " : "Business date "}
              {dateLabel(item.businessDate)}
              {item.reservation ? ` · ${item.reservation.reference}` : ""}
            </p>
          </div>
          <button
            className="uiModalClose"
            type="button"
            aria-label="Close logbook detail"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="operationsLogbookDetailBody">
          <p className="operationsLogbookDetails">{item.details}</p>
          <div className="operationsLogbookDetailMeta">
            <span>
              Status <strong>{human(item.status)}</strong>
            </span>
            <span>
              Owner{" "}
              <strong>
                {item.assignedUser?.name ??
                  (item.assignedDepartment
                    ? human(item.assignedDepartment)
                    : "Unassigned")}
              </strong>
            </span>
            <span>
              Created by <strong>{item.createdBy?.name ?? "Staff"}</strong>
            </span>
            {item.dueAt && (
              <span>
                Due <strong>{formatHotelDateTime(item.dueAt, timezone)}</strong>
              </span>
            )}
          </div>
          {item.reservation && (
            <p className="notice">
              Reservation {item.reservation.reference} ·{" "}
              {item.reservation.guestName}
            </p>
          )}
          {item.maintenanceTicket && (
            <p className="notice">
              Maintenance: {item.maintenanceTicket.title}
            </p>
          )}
          {item.housekeepingTask && (
            <p className="notice">
              Housekeeping task: {human(item.housekeepingTask.status)}
              {item.housekeepingTask.room?.roomNumber
                ? ` · Room ${item.housekeepingTask.room.roomNumber}`
                : ""}
            </p>
          )}
          {item.updates?.length ? (
            <section className="operationsLogbookUpdates">
              <h3>Shift updates</h3>
              {item.updates.map((update) => (
                <article key={update.id}>
                  <p>{update.note}</p>
                  <small>
                    {update.author?.name ?? "Staff"} ·{" "}
                    {formatHotelDateTime(update.createdAt, timezone)}
                  </small>
                </article>
              ))}
            </section>
          ) : (
            <p className="operationsLogbookEmptyNote">No shift updates yet.</p>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {capabilities.canUpdate && item.status !== "RESOLVED" && (
            <>
              <label className="operationsLogbookWideField">
                Add update
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Record the next action or handover detail"
                />
              </label>
              <button
                className="smallBtn secondary"
                type="button"
                disabled={!note.trim() || Boolean(busy)}
                onClick={async () => {
                  await onAction(`/operations-logbook/${item.id}/updates`, {
                    note: note.trim(),
                  });
                  setNote("");
                  await onRefresh();
                }}
              >
                Add update
              </button>
            </>
          )}
          {capabilities.canResolve && item.status !== "RESOLVED" && (
            <div className="operationsLogbookResolve">
              <label>
                Resolution note
                <textarea
                  value={resolution}
                  onChange={(event) => setResolution(event.target.value)}
                  placeholder="What was completed?"
                />
              </label>
              <button
                className="smallBtn"
                type="button"
                disabled={!resolution.trim() || Boolean(busy)}
                onClick={async () => {
                  await onAction(`/operations-logbook/${item.id}/resolve`, {
                    resolutionNote: resolution.trim(),
                  });
                  await onRefresh();
                }}
              >
                Resolve
              </button>
            </div>
          )}
          {capabilities.canAcknowledge && item.status === "OPEN" && (
            <button
              className="smallBtn"
              type="button"
              disabled={Boolean(busy)}
              onClick={async () => {
                await onAction(`/operations-logbook/${item.id}/acknowledge`);
                await onRefresh();
              }}
            >
              Acknowledge
            </button>
          )}
        </div>
        <footer>
          <button
            className="smallBtn secondary"
            type="button"
            onClick={onClose}
          >
            Close
          </button>
        </footer>
      </section>
    </div>
  );
}
