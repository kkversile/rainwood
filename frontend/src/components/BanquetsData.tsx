"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiRequest } from "../lib/api";
import {
  BANQUET_EVENT_TYPES,
  BANQUET_CHARGE_CATEGORIES,
  BANQUET_REQUIREMENT_CATEGORIES,
  BANQUET_SETUP_STYLES,
  DEFAULT_BANQUET_CHARGE_CATEGORY,
  DEFAULT_BANQUET_EVENT_TYPE,
  DEFAULT_BANQUET_REQUIREMENT_CATEGORY,
  DEFAULT_BANQUET_SETUP_STYLE,
  banquetLabel,
} from "../lib/banquet-contract";
import {
  DEFAULT_HOTEL_TIMEZONE,
  addHotelDays,
  todayInHotelTimezone,
} from "../lib/hotel-date-time";
import { useAdminProfile } from "./AdminData";

type Hotel = { id: string; name: string; code?: string; timezoneName?: string };
type Space = {
  id: string;
  name: string;
  code: string;
  spaceType: string;
  active: boolean;
  outOfService: boolean;
};
type PageInfo = { page: number; limit: number; total: number; pages: number };
type OptionSet = {
  hotel?: Hotel;
  groups: any[];
  corporates: any[];
  inquiries: any[];
  agents: any[];
};
type EventRow = {
  id: string;
  eventCode: string;
  eventName: string;
  eventType: string;
  status: string;
  startDate: string;
  endDate: string;
  primaryContactName: string;
  expectedPax?: number | null;
  guaranteedPax?: number | null;
  hotel?: Hotel;
  functions: any[];
  _count?: { functions: number };
};
type FunctionForm = {
  functionSpaceId: string;
  functionName: string;
  functionDate: string;
  startTime: string;
  endTime: string;
  setupStyle: string;
  expectedPax: string;
  guaranteedPax: string;
  notes: string;
};
type BeoDraft = {
  operationalNotes: string;
  schedule: any[];
  requirements: any[];
  charges: any[];
};

const eventTypes = BANQUET_EVENT_TYPES;
const setupStyles = BANQUET_SETUP_STYLES;
const requirementCategories = BANQUET_REQUIREMENT_CATEGORIES;
const chargeCategories = BANQUET_CHARGE_CATEGORIES;
const writers = ["SUPER_ADMIN", "CORPORATE_ADMIN", "ADMIN", "RESERVATION"];
const dateOffset = (offset: number, timeZone = DEFAULT_HOTEL_TIMEZONE) =>
  addHotelDays(todayInHotelTimezone(timeZone), offset);
const emptyEventForHotel = (timeZone = DEFAULT_HOTEL_TIMEZONE) => ({
  hotelId: "",
  eventName: "",
  eventType: DEFAULT_BANQUET_EVENT_TYPE as string,
  primaryContactName: "",
  primaryContactMobile: "",
  primaryContactEmail: "",
  startDate: dateOffset(5, timeZone),
  endDate: dateOffset(5, timeZone),
  expectedPax: "100",
  guaranteedPax: "80",
  groupReservationId: "",
  inquiryId: "",
  corporateId: "",
  agentId: "",
  notes: "",
});
const emptyEvent = emptyEventForHotel();
const emptyFunction = (date = dateOffset(5)): FunctionForm => ({
  functionSpaceId: "",
  functionName: "Main Session",
  functionDate: date,
  startTime: "09:00",
  endTime: "17:00",
  setupStyle: DEFAULT_BANQUET_SETUP_STYLE,
  expectedPax: "100",
  guaranteedPax: "80",
  notes: "",
});
const emptyBeo = (): BeoDraft => ({
  operationalNotes: "",
  schedule: [{ itemTime: "07:00", description: "Hall access and setup" }],
  requirements: [
    {
      category: DEFAULT_BANQUET_REQUIREMENT_CATEGORY,
      description: "Projector and HDMI presentation kit",
      quantity: "1",
      requiredAt: "08:00",
      department: "ENGINEERING",
      notes: "",
    },
  ],
  charges: [
    {
      category: "VENUE_RENTAL",
      description: "Venue rental",
      quantity: "1",
      unitAmount: "0",
      notes: "",
    },
  ],
});
const text = (value: unknown) => String(value ?? "");
const dateOnly = (value: string) => value?.slice(0, 10) ?? "";
function escapeHtml(value: unknown) {
  return text(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ] ?? character,
  );
}
function toFunctionForm(fn: any): FunctionForm {
  return {
    functionSpaceId: fn.functionSpaceId,
    functionName: fn.functionName,
    functionDate: dateOnly(fn.functionDate),
    startTime: fn.startTime,
    endTime: fn.endTime,
    setupStyle: fn.setupStyle,
    expectedPax: text(fn.expectedPax),
    guaranteedPax: text(fn.guaranteedPax),
    notes: fn.notes ?? "",
  };
}
function toBeoDraft(beo: any): BeoDraft {
  return {
    operationalNotes: beo?.operationalNotes ?? "",
    schedule: (beo?.scheduleItems ?? []).map((item: any) => ({
      itemTime: item.itemTime,
      description: item.description,
      sortOrder: item.sortOrder,
    })),
    requirements: (beo?.requirements ?? []).map((item: any) => ({
      id: item.id,
      category: item.category,
      description: item.description,
      quantity: text(item.quantity),
      requiredAt: item.requiredAt ?? "",
      department: item.department,
      notes: item.notes ?? "",
      status: item.status,
    })),
    charges: (beo?.chargeLines ?? []).map((item: any) => ({
      id: item.id,
      category: item.category,
      description: item.description,
      quantity: text(item.quantity),
      unitAmount: text(item.unitAmount),
      notes: item.notes ?? "",
    })),
  };
}

export function BanquetsData() {
  const { profile } = useAdminProfile();
  const searchParams = useSearchParams();
  const readOnly = ["ACCOUNTS", "VIEWER"].includes(profile?.role ?? "");
  const canManage = writers.includes(profile?.role ?? "");
  const contextHotelId = searchParams.get("hotelId") ?? "";
  const contextGroupId = searchParams.get("groupId") ?? "";
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [linkOptions, setLinkOptions] = useState<OptionSet>({
    groups: [],
    corporates: [],
    inquiries: [],
    agents: [],
  });
  const [rows, setRows] = useState<EventRow[]>([]);
  const [pageInfo, setPageInfo] = useState<PageInfo>({
    page: 1,
    limit: 25,
    total: 0,
    pages: 1,
  });
  const [hotelFilter, setHotelFilter] = useState(contextHotelId);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const [eventForm, setEventForm] = useState({
    ...emptyEventForHotel(),
    hotelId: contextHotelId,
  });
  const [functionForm, setFunctionForm] =
    useState<FunctionForm>(emptyFunction());
  const [editingFunctionId, setEditingFunctionId] = useState("");
  const [activeFunctionId, setActiveFunctionId] = useState("");
  const [beoDrafts, setBeoDrafts] = useState<Record<string, BeoDraft>>({});
  const [beoDraftDirty, setBeoDraftDirty] = useState<Record<string, boolean>>(
    {},
  );
  const [tab, setTab] = useState<
    "overview" | "functions" | "beo" | "charges" | "activity"
  >("overview");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const currentHotelId =
    profile?.staffHotelId ||
    hotelFilter ||
    eventForm.hotelId ||
    contextHotelId ||
    hotels[0]?.id ||
    "";
  const activeFunction =
    selected?.functions?.find((fn: any) => fn.id === activeFunctionId) ??
    selected?.functions?.[0];
  const activeDraft = activeFunction
    ? (beoDrafts[activeFunction.id] ?? emptyBeo())
    : emptyBeo();

  async function loadHotels() {
    const result = await apiRequest<Hotel[]>("/hotels");
    setHotels(result);
    const preferred =
      profile?.staffHotelId ||
      contextHotelId ||
      hotelFilter ||
      result[0]?.id ||
      "";
    if (preferred) {
      const preferredHotel = result.find((hotel) => hotel.id === preferred);
      setHotelFilter((value) => value || preferred);
      setEventForm((value) => ({
        ...value,
        ...(value.hotelId &&
        !(
          searchParams.get("hotelId") === value.hotelId &&
          value.startDate === emptyEvent.startDate
        )
          ? {}
          : {
              ...emptyEventForHotel(
                preferredHotel?.timezoneName ?? DEFAULT_HOTEL_TIMEZONE,
              ),
            }),
        groupReservationId:
          value.groupReservationId || searchParams.get("groupId") || "",
        hotelId: value.hotelId || preferred,
      }));
    }
  }
  async function loadSpaces() {
    if (!currentHotelId) return;
    setSpaces(
      await apiRequest<Space[]>(
        `/function-spaces?hotelId=${encodeURIComponent(currentHotelId)}`,
      ),
    );
  }
  async function loadLinks(hotelId: string) {
    if (!hotelId) return;
    const result = await apiRequest<OptionSet>(
      `/banquets/link-options?hotelId=${encodeURIComponent(hotelId)}`,
    );
    setLinkOptions(result);
    if (result.hotel) {
      setHotels((current) =>
        current.some((hotel) => hotel.id === result.hotel?.id)
          ? current
          : [result.hotel as Hotel, ...current],
      );
    }
    const requestedGroupId = searchParams.get("groupId");
    if (
      requestedGroupId &&
      !result.groups.some((group) => group.id === requestedGroupId)
    ) {
      setEventForm((value) =>
        value.groupReservationId === requestedGroupId
          ? { ...value, groupReservationId: "" }
          : value,
      );
      setError("The selected group is not available for this hotel.");
    }
  }
  async function loadEvents() {
    const params = new URLSearchParams({
      page: String(pageInfo.page),
      limit: "25",
    });
    const hotelId = profile?.staffHotelId || hotelFilter;
    if (hotelId) params.set("hotelId", hotelId);
    if (search.trim()) params.set("search", search.trim());
    if (statusFilter) params.set("status", statusFilter);
    const result = await apiRequest<{
      items: EventRow[];
      pagination: PageInfo;
    }>(`/banquets?${params}`);
    setRows(result.items);
    setPageInfo(result.pagination);
  }
  useEffect(() => {
    void loadHotels().catch((reason) =>
      setError(
        reason instanceof Error ? reason.message : "Could not load hotels",
      ),
    );
  }, [profile?.staffHotelId]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void Promise.all([
        loadEvents(),
        loadSpaces(),
        loadLinks(currentHotelId),
      ]).catch((reason) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "Could not load banquet data",
        ),
      );
    }, 150);
    return () => window.clearTimeout(timer);
  }, [
    hotelFilter,
    profile?.staffHotelId,
    pageInfo.page,
    search,
    statusFilter,
    currentHotelId,
  ]);
  useEffect(() => {
    if (contextHotelId && !profile?.staffHotelId) {
      setHotelFilter(contextHotelId);
      setEventForm((value) => ({
        ...value,
        hotelId: contextHotelId,
        ...(contextGroupId ? { groupReservationId: contextGroupId } : {}),
      }));
    } else if (contextGroupId)
      setEventForm((value) => ({
        ...value,
        groupReservationId: value.groupReservationId || contextGroupId,
      }));
  }, [contextGroupId, contextHotelId, profile?.staffHotelId]);
  useEffect(() => {
    if (
      !contextHotelId ||
      profile?.staffHotelId ||
      searchParams.get("event") ||
      !hotels.some((hotel) => hotel.id === contextHotelId)
    )
      return;
    setHotelFilter(contextHotelId);
    setEventForm((value) => {
      if (
        value.hotelId === contextHotelId &&
        (!contextGroupId || value.groupReservationId === contextGroupId)
      )
        return value;
      return {
        ...value,
        hotelId: contextHotelId,
        ...(contextGroupId ? { groupReservationId: contextGroupId } : {}),
      };
    });
  }, [
    contextGroupId,
    contextHotelId,
    hotels,
    profile?.staffHotelId,
    searchParams,
  ]);
  useEffect(() => {
    const eventId = searchParams.get("event");
    if (eventId && !selected) void openEvent(eventId);
  }, [searchParams]);

  function showError(reason: unknown, fallback: string) {
    setError(reason instanceof Error ? reason.message : fallback);
  }
  async function openEvent(id: string) {
    setBusy(true);
    setError("");
    try {
      const item = await apiRequest<any>(
        `/banquets/${id}${readOnly && hotelFilter ? `?hotelId=${encodeURIComponent(hotelFilter)}` : ""}`,
      );
      setSelected(item);
      setEventForm({
        ...emptyEvent,
        hotelId: item.hotel?.id ?? "",
        eventName: item.eventName,
        eventType: item.eventType,
        primaryContactName: item.primaryContactName,
        primaryContactMobile: item.primaryContactMobile,
        primaryContactEmail: item.primaryContactEmail ?? "",
        startDate: dateOnly(item.startDate),
        endDate: dateOnly(item.endDate),
        expectedPax: text(item.expectedPax),
        guaranteedPax: text(item.guaranteedPax),
        groupReservationId: item.groupReservationId ?? "",
        inquiryId: item.inquiryId ?? "",
        corporateId: item.corporateId ?? "",
        agentId: item.agentId ?? "",
        notes: item.notes ?? "",
      });
      const first = item.functions?.[0];
      setActiveFunctionId(first?.id ?? "");
      setFunctionForm(
        first ? toFunctionForm(first) : emptyFunction(dateOnly(item.startDate)),
      );
      setEditingFunctionId("");
      setTab("overview");
    } catch (reason) {
      showError(reason, "Could not open event");
    } finally {
      setBusy(false);
    }
  }
  async function createEvent(event: FormEvent) {
    event.preventDefault();
    if (!canManage) return;
    setBusy(true);
    setError("");
    try {
      const result = await apiRequest<any>("/banquets", {
        method: "POST",
        body: JSON.stringify({
          ...eventForm,
          hotelId:
            eventForm.hotelId ||
            contextHotelId ||
            hotelFilter ||
            hotels[0]?.id ||
            "",
          expectedPax: Number(eventForm.expectedPax),
          guaranteedPax: Number(eventForm.guaranteedPax),
          groupReservationId: eventForm.groupReservationId || undefined,
          inquiryId: eventForm.inquiryId || undefined,
          corporateId: eventForm.corporateId || undefined,
          agentId: eventForm.agentId || undefined,
          primaryContactEmail: eventForm.primaryContactEmail || undefined,
        }),
      });
      setMessage(`Created ${result.eventCode}.`);
      const createdHotel = hotels.find(
        (hotel) => hotel.id === eventForm.hotelId,
      );
      setEventForm({
        ...emptyEventForHotel(
          createdHotel?.timezoneName ?? DEFAULT_HOTEL_TIMEZONE,
        ),
        hotelId: eventForm.hotelId,
      });
      await loadEvents();
      await openEvent(result.id);
    } catch (reason) {
      showError(reason, "Could not create event");
    } finally {
      setBusy(false);
    }
  }
  async function updateEvent(event: FormEvent) {
    event.preventDefault();
    if (!selected || !canManage) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest(`/banquets/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          eventName: eventForm.eventName,
          eventType: eventForm.eventType,
          groupReservationId: eventForm.groupReservationId || null,
          inquiryId: eventForm.inquiryId || null,
          corporateId: eventForm.corporateId || null,
          agentId: eventForm.agentId || null,
          primaryContactName: eventForm.primaryContactName,
          primaryContactMobile: eventForm.primaryContactMobile,
          primaryContactEmail: eventForm.primaryContactEmail || null,
          startDate: eventForm.startDate,
          endDate: eventForm.endDate,
          expectedPax: Number(eventForm.expectedPax),
          guaranteedPax: Number(eventForm.guaranteedPax),
          notes: eventForm.notes || null,
        }),
      });
      setMessage("Event details updated.");
      await loadEvents();
      await openEvent(selected.id);
    } catch (reason) {
      showError(reason, "Could not update event");
    } finally {
      setBusy(false);
    }
  }
  async function changeStatus(status: string) {
    if (!selected || !canManage) return;
    const reason = status === "CANCELLED" ? cancelReason.trim() : undefined;
    if (status === "CANCELLED" && !reason) {
      setError("Enter a cancellation reason before cancelling the event.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await apiRequest(`/banquets/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, reason }),
      });
      setMessage(`Event moved to ${status}.`);
      setCancelReason("");
      await loadEvents();
      await openEvent(selected.id);
    } catch (problem) {
      showError(problem, "Could not change event status");
    } finally {
      setBusy(false);
    }
  }
  async function saveFunction(event: FormEvent) {
    event.preventDefault();
    if (!selected || !canManage) return;
    setBusy(true);
    setError("");
    try {
      const body = {
        ...functionForm,
        expectedPax: Number(functionForm.expectedPax),
        guaranteedPax: Number(functionForm.guaranteedPax),
      };
      const path = editingFunctionId
        ? `/banquets/${selected.id}/functions/${editingFunctionId}`
        : `/banquets/${selected.id}/functions`;
      await apiRequest(path, {
        method: editingFunctionId ? "PATCH" : "POST",
        body: JSON.stringify(body),
      });
      setMessage(
        editingFunctionId
          ? "Function updated."
          : "Function added and venue availability confirmed.",
      );
      await openEvent(selected.id);
      setTab("functions");
    } catch (reason) {
      showError(reason, "Could not save function");
    } finally {
      setBusy(false);
    }
  }
  async function cancelFunction(fn: any) {
    if (!selected || !canManage || fn.status === "CANCELLED") return;
    if (
      !window.confirm(`Cancel ${fn.functionName}? The space will be released.`)
    )
      return;
    setBusy(true);
    setError("");
    try {
      await apiRequest(`/banquets/${selected.id}/functions/${fn.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...toFunctionForm(fn),
          status: "CANCELLED",
          expectedPax: Number(fn.expectedPax ?? 0),
          guaranteedPax: Number(fn.guaranteedPax ?? 0),
        }),
      });
      setMessage("Function cancelled and venue availability released.");
      await openEvent(selected.id);
    } catch (reason) {
      showError(reason, "Could not cancel function");
    } finally {
      setBusy(false);
    }
  }
  async function ensureBeo(fn: any) {
    if (!selected || !canManage) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest(`/banquets/${selected.id}/functions/${fn.id}/beo`, {
        method: "POST",
      });
      setBeoDrafts((current) => ({ ...current, [fn.id]: emptyBeo() }));
      setMessage("BEO is ready for editing.");
      await openEvent(selected.id);
      setActiveFunctionId(fn.id);
      setTab("beo");
    } catch (reason) {
      showError(reason, "Could not create BEO");
    } finally {
      setBusy(false);
    }
  }
  function beoPayload(draft: BeoDraft) {
    return {
      operationalNotes: draft.operationalNotes,
      schedule: draft.schedule.map((item: any, index: number) => ({
        itemTime: item.itemTime,
        description: item.description,
        sortOrder: index,
      })),
      requirements: draft.requirements
        .filter((item: any) => text(item.description).trim())
        .map((item: any) => ({
          category: item.category,
          description: item.description,
          quantity: item.quantity ? Number(item.quantity) : undefined,
          requiredAt: item.requiredAt || undefined,
          department: item.department,
          notes: item.notes || undefined,
          status: item.status,
        })),
      charges: draft.charges
        .filter((item: any) => text(item.description).trim())
        .map((item: any) => ({
          category: item.category,
          description: item.description,
          quantity: Number(item.quantity),
          unitAmount: Number(item.unitAmount),
          notes: item.notes || undefined,
        })),
    };
  }
  async function persistBEO(functionId: string, draft: BeoDraft) {
    await apiRequest(`/banquets/${selected?.id}/functions/${functionId}/beo`, {
      method: "PATCH",
      body: JSON.stringify(beoPayload(draft)),
    });
  }
  async function saveBEO() {
    if (!selected || !activeFunction?.beo || !canManage) return;
    setBusy(true);
    setError("");
    try {
      const draft = activeDraft;
      await persistBEO(activeFunction.id, draft);
      setBeoDraftDirty((current) => ({
        ...current,
        [activeFunction.id]: false,
      }));
      setMessage("BEO draft saved.");
      await openEvent(selected.id);
      setActiveFunctionId(activeFunction.id);
      setTab("beo");
    } catch (reason) {
      showError(reason, "Could not save BEO");
    } finally {
      setBusy(false);
    }
  }
  async function finalizeBEO() {
    if (!selected || !activeFunction?.beo || !canManage) return;
    setBusy(true);
    setError("");
    try {
      if (beoDraftDirty[activeFunction.id]) {
        await persistBEO(activeFunction.id, activeDraft);
        setBeoDraftDirty((current) => ({
          ...current,
          [activeFunction.id]: false,
        }));
      }
      await apiRequest(
        `/banquets/${selected.id}/functions/${activeFunction.id}/beo/finalize`,
        { method: "POST" },
      );
      setMessage("BEO finalized.");
      await openEvent(selected.id);
      setActiveFunctionId(activeFunction.id);
      setTab("beo");
    } catch (reason) {
      showError(reason, "Could not finalize BEO");
    } finally {
      setBusy(false);
    }
  }
  async function updateRequirement(requirementId: string, status: string) {
    if (!selected || !activeFunction || !canManage) return;
    try {
      await apiRequest(
        `/banquets/${selected.id}/functions/${activeFunction.id}/beo/requirements/${requirementId}`,
        { method: "PATCH", body: JSON.stringify({ status }) },
      );
      await openEvent(selected.id);
      setActiveFunctionId(activeFunction.id);
      setTab("beo");
    } catch (reason) {
      showError(reason, "Could not update requirement");
    }
  }
  function updateDraft(change: Partial<BeoDraft>) {
    if (activeFunction)
      setBeoDrafts((current) => ({
        ...current,
        [activeFunction.id]: { ...activeDraft, ...change },
      }));
    if (activeFunction)
      setBeoDraftDirty((current) => ({
        ...current,
        [activeFunction.id]: true,
      }));
  }
  function printBEO() {
    const fn = activeFunction;
    const beo = fn?.beo;
    if (!fn || !beo || !selected) return;
    const draft = activeDraft;
    const popup = window.open("", "_blank", "noopener,noreferrer");
    if (!popup) return;
    const schedule = draft.schedule
      .map(
        (item: any) =>
          `<li><b>${escapeHtml(item.itemTime)}</b> ${escapeHtml(item.description)}</li>`,
      )
      .join("");
    const requirements = draft.requirements
      .map(
        (item: any) =>
          `<tr><td>${escapeHtml(item.department)}</td><td>${escapeHtml(item.category)}</td><td>${escapeHtml(item.description)}</td><td>${escapeHtml(item.quantity)}</td><td>${escapeHtml(item.status ?? "PENDING")}</td></tr>`,
      )
      .join("");
    const charges = draft.charges
      .map(
        (item: any) =>
          `<tr><td>${escapeHtml(item.category)}</td><td>${escapeHtml(item.description)}</td><td>${escapeHtml(item.quantity)}</td><td>${escapeHtml(item.unitAmount)}</td><td>${escapeHtml(Number(item.quantity || 0) * Number(item.unitAmount || 0))}</td></tr>`,
      )
      .join("");
    popup.document.write(
      `<html><head><title>${escapeHtml(beo.beoNumber)}</title><style>body{font:14px Arial;color:#123e6e;margin:40px}h1{color:#078f95}table{width:100%;border-collapse:collapse;margin:18px 0}th,td{border:1px solid #cbd9e3;padding:8px;text-align:left}th{background:#e8f6f6}li{margin:8px 0}.meta{line-height:1.7}</style></head><body><h1>RainWood Hotels</h1><h2>Banquet Event Order - ${escapeHtml(beo.beoNumber)}</h2><div class="meta"><b>Hotel:</b> ${escapeHtml(selected.hotel?.name)}<br/><b>Event:</b> ${escapeHtml(selected.eventName)} (${escapeHtml(selected.eventCode)})<br/><b>Function:</b> ${escapeHtml(fn.functionName)}<br/><b>Venue:</b> ${escapeHtml(fn.functionSpace?.name)}<br/><b>Date / time:</b> ${escapeHtml(dateOnly(fn.functionDate))} ${escapeHtml(fn.startTime)} - ${escapeHtml(fn.endTime)}<br/><b>Contact:</b> ${escapeHtml(selected.primaryContactName)} / ${escapeHtml(selected.primaryContactMobile)}<br/><b>PAX:</b> ${escapeHtml(fn.expectedPax)} expected / ${escapeHtml(fn.guaranteedPax)} guaranteed<br/><b>Setup:</b> ${escapeHtml(fn.setupStyle)}<br/><b>Status:</b> ${escapeHtml(beo.status)}${beo.finalizedAt ? `, finalized ${escapeHtml(beo.finalizedAt)} by ${escapeHtml(beo.finalizedBy?.name)}` : ""}</div><h3>Schedule</h3><ul>${schedule || "<li>No schedule items.</li>"}</ul><h3>Requirements</h3><table><thead><tr><th>Department</th><th>Category</th><th>Requirement</th><th>Qty</th><th>Status</th></tr></thead><tbody>${requirements || '<tr><td colspan="5">No requirements.</td></tr>'}</tbody></table><h3>Estimated charges</h3><table><thead><tr><th>Category</th><th>Description</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead><tbody>${charges || '<tr><td colspan="5">No charges.</td></tr>'}</tbody></table><p><b>Operational notes:</b> ${escapeHtml(draft.operationalNotes)}</p><p>Generated ${escapeHtml(new Date().toLocaleString())}</p><script>setTimeout(() => window.print(), 250)</script></body></html>`,
    );
    popup.document.close();
  }
  async function selectFunction(fn: any) {
    if (
      activeFunctionId &&
      activeFunctionId !== fn.id &&
      beoDraftDirty[activeFunctionId]
    ) {
      const saveBeforeSwitch = window.confirm(
        "This BEO has unsaved changes. Press OK to save them before switching, or Cancel to stay on this function.",
      );
      if (!saveBeforeSwitch) return;
      try {
        await persistBEO(
          activeFunctionId,
          beoDrafts[activeFunctionId] ?? emptyBeo(),
        );
        setBeoDraftDirty((current) => ({
          ...current,
          [activeFunctionId]: false,
        }));
      } catch (reason) {
        showError(reason, "Could not save the current BEO before switching.");
        return;
      }
    }
    setActiveFunctionId(fn.id);
    setFunctionForm(toFunctionForm(fn));
    setEditingFunctionId("");
    if (fn.beo)
      setBeoDrafts((current) =>
        current[fn.id] ? current : { ...current, [fn.id]: toBeoDraft(fn.beo) },
      );
  }
  function updateArray(
    field: "schedule" | "requirements" | "charges",
    index: number,
    value: any,
  ) {
    updateDraft({
      [field]: activeDraft[field].map((item: any, itemIndex: number) =>
        itemIndex === index ? { ...item, ...value } : item,
      ),
    } as Partial<BeoDraft>);
  }
  const totalEstimate = useMemo(
    () =>
      (selected?.functions ?? [])
        .flatMap((fn: any) => fn.beo?.chargeLines ?? [])
        .reduce(
          (sum: number, line: any) => sum + Number(line.totalAmount ?? 0),
          0,
        ),
    [selected],
  );
  const statusActions: Record<string, string[]> = {
    INQUIRY: ["TENTATIVE", "CANCELLED"],
    TENTATIVE: ["CONFIRMED", "CANCELLED"],
    CONFIRMED: ["IN_PROGRESS", "CANCELLED"],
    IN_PROGRESS: ["COMPLETED", "CANCELLED"],
    COMPLETED: [],
    CANCELLED: [],
  };

  return (
    <section className="banquetWorkspace">
      <header className="banquetHero">
        <div>
          <span className="eyebrow">
            Hotel operations - sales &amp; catering
          </span>
          <h1>Banquets &amp; Events</h1>
          <p>
            Plan functions against real venue availability and produce an
            operational BEO for every scheduled function.
          </p>
        </div>
        <div className="banquetHeroLinks">
          <a className="smallBtn" href="/rainwood/admin/banquets/calendar">
            Function calendar
          </a>
          <a
            className="smallBtn secondary"
            href="/rainwood/admin/function-spaces"
          >
            Function spaces
          </a>
        </div>
      </header>
      {readOnly && (
        <p className="hint">
          Read-only role: event, function, and BEO mutations are disabled.
          Select a hotel to review its banquet operations.
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {canManage && (
        <section className="panel banquetCreatePanel">
          <div className="sectionHead left">
            <span>Sales &amp; catering</span>
            <h2>Create banquet event</h2>
            <p>Banquet-only events remain valid; accommodation is optional.</p>
          </div>
          <form onSubmit={createEvent} className="banquetFormGrid">
            <label>
              Hotel
              <select
                required
                value={
                  (hotels.some((hotel) => hotel.id === eventForm.hotelId) &&
                    eventForm.hotelId) ||
                  (hotels.some((hotel) => hotel.id === contextHotelId) &&
                    contextHotelId) ||
                  (hotels.some((hotel) => hotel.id === hotelFilter) &&
                    hotelFilter) ||
                  hotels[0]?.id ||
                  ""
                }
                onChange={(e) => {
                  const selectedHotel = hotels.find(
                    (hotel) => hotel.id === e.target.value,
                  );
                  const preserveDates = Boolean(
                    eventForm.eventName ||
                    eventForm.startDate !== emptyEvent.startDate,
                  );
                  setEventForm({
                    ...eventForm,
                    hotelId: e.target.value,
                    ...(preserveDates
                      ? {}
                      : {
                          startDate: dateOffset(
                            5,
                            selectedHotel?.timezoneName ??
                              DEFAULT_HOTEL_TIMEZONE,
                          ),
                          endDate: dateOffset(
                            5,
                            selectedHotel?.timezoneName ??
                              DEFAULT_HOTEL_TIMEZONE,
                          ),
                        }),
                    groupReservationId: "",
                    corporateId: "",
                    inquiryId: "",
                    agentId: "",
                  });
                  void loadLinks(e.target.value);
                }}
              >
                {hotels.map((hotel) => (
                  <option key={hotel.id} value={hotel.id}>
                    {hotel.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Event name
              <input
                required
                value={eventForm.eventName}
                onChange={(e) =>
                  setEventForm({ ...eventForm, eventName: e.target.value })
                }
                placeholder="Annual conference"
              />
            </label>
            <label>
              Event type
              <select
                value={eventForm.eventType}
                onChange={(e) =>
                  setEventForm({ ...eventForm, eventType: e.target.value })
                }
              >
                {eventTypes.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </label>
            <label>
              Start date
              <input
                required
                type="date"
                value={eventForm.startDate}
                onChange={(e) =>
                  setEventForm({
                    ...eventForm,
                    startDate: e.target.value,
                    endDate:
                      eventForm.endDate < e.target.value
                        ? e.target.value
                        : eventForm.endDate,
                  })
                }
              />
            </label>
            <label>
              End date
              <input
                required
                type="date"
                min={eventForm.startDate}
                value={eventForm.endDate}
                onChange={(e) =>
                  setEventForm({ ...eventForm, endDate: e.target.value })
                }
              />
            </label>
            <label>
              Expected PAX
              <input
                required
                min="0"
                type="number"
                value={eventForm.expectedPax}
                onChange={(e) =>
                  setEventForm({ ...eventForm, expectedPax: e.target.value })
                }
              />
            </label>
            <label>
              Guaranteed PAX
              <input
                required
                min="0"
                type="number"
                value={eventForm.guaranteedPax}
                onChange={(e) =>
                  setEventForm({ ...eventForm, guaranteedPax: e.target.value })
                }
              />
            </label>
            <label>
              Primary contact
              <input
                required
                value={eventForm.primaryContactName}
                onChange={(e) =>
                  setEventForm({
                    ...eventForm,
                    primaryContactName: e.target.value,
                  })
                }
              />
            </label>
            <label>
              Contact mobile
              <input
                required
                value={eventForm.primaryContactMobile}
                onChange={(e) =>
                  setEventForm({
                    ...eventForm,
                    primaryContactMobile: e.target.value,
                  })
                }
                placeholder="+91"
              />
            </label>
            <label>
              Email
              <input
                type="email"
                value={eventForm.primaryContactEmail}
                onChange={(e) =>
                  setEventForm({
                    ...eventForm,
                    primaryContactEmail: e.target.value,
                  })
                }
              />
            </label>
            <label>
              Group
              <select
                value={eventForm.groupReservationId}
                onChange={(e) =>
                  setEventForm({
                    ...eventForm,
                    groupReservationId: e.target.value,
                  })
                }
              >
                <option value="">No group link</option>
                {linkOptions.groups.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.groupCode} - {item.groupName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Corporate account
              <select
                value={eventForm.corporateId}
                onChange={(e) =>
                  setEventForm({ ...eventForm, corporateId: e.target.value })
                }
              >
                <option value="">No corporate link</option>
                {linkOptions.corporates.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Booking inquiry
              <select
                value={eventForm.inquiryId}
                onChange={(e) =>
                  setEventForm({ ...eventForm, inquiryId: e.target.value })
                }
              >
                <option value="">No inquiry link</option>
                {linkOptions.inquiries.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.inquiryNo} - {item.guestName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Commercial agent
              <select
                value={eventForm.agentId}
                onChange={(e) =>
                  setEventForm({ ...eventForm, agentId: e.target.value })
                }
              >
                <option value="">No agent link</option>
                {linkOptions.agents.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} - {item.email}
                  </option>
                ))}
              </select>
            </label>
            <label className="wideField">
              Notes
              <textarea
                value={eventForm.notes}
                onChange={(e) =>
                  setEventForm({ ...eventForm, notes: e.target.value })
                }
              />
            </label>
            <div className="formActions wideField">
              <button className="btn" disabled={busy}>
                {busy ? "Saving..." : "Create event"}
              </button>
            </div>
          </form>
        </section>
      )}
      <section className="panel">
        <div className="rangeSectionHeader">
          <div>
            <span className="eyebrow">Operational pipeline</span>
            <h2>Event list</h2>
          </div>
          <div className="filterBar">
            <select
              aria-label="Event hotel"
              value={hotelFilter}
              disabled={Boolean(profile?.staffHotelId)}
              onChange={(e) => {
                setHotelFilter(e.target.value);
                setPageInfo((p) => ({ ...p, page: 1 }));
              }}
            >
              <option value="">All hotels</option>
              {hotels.map((hotel) => (
                <option key={hotel.id} value={hotel.id}>
                  {hotel.name}
                </option>
              ))}
            </select>
            <input
              aria-label="Search events"
              placeholder="Search code, event or contact"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPageInfo((p) => ({ ...p, page: 1 }));
              }}
            />
            <select
              aria-label="Event status"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPageInfo((p) => ({ ...p, page: 1 }));
              }}
            >
              <option value="">All statuses</option>
              {[
                "INQUIRY",
                "TENTATIVE",
                "CONFIRMED",
                "IN_PROGRESS",
                "COMPLETED",
                "CANCELLED",
              ].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </div>
        </div>
        {rows.length ? (
          <div className="dataTableWrap">
            <table className="dataTable banquetTable">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Hotel</th>
                  <th>Dates</th>
                  <th>Type / status</th>
                  <th>Contact</th>
                  <th>Functions</th>
                  <th>PAX</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <b>{row.eventCode}</b>
                      <br />
                      {row.eventName}
                    </td>
                    <td>{row.hotel?.name}</td>
                    <td>
                      {dateOnly(row.startDate)} -&gt; {dateOnly(row.endDate)}
                    </td>
                    <td>
                      {row.eventType}
                      <br />
                      <span
                        className={`status ${row.status === "CONFIRMED" ? "ok" : row.status === "CANCELLED" ? "err" : "warn"}`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td>{row.primaryContactName}</td>
                    <td>
                      {row._count?.functions ?? row.functions?.length ?? 0}
                    </td>
                    <td>
                      {row.expectedPax ?? "-"} / {row.guaranteedPax ?? "-"}
                    </td>
                    <td>
                      <button
                        className="smallBtn"
                        type="button"
                        onClick={() => void openEvent(row.id)}
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
          <p className="empty">
            No banquet events found for the selected filters.
          </p>
        )}
        <div className="formActions">
          <button
            className="smallBtn secondary"
            disabled={pageInfo.page <= 1}
            onClick={() => setPageInfo((p) => ({ ...p, page: p.page - 1 }))}
          >
            Previous
          </button>
          <span>
            Page {pageInfo.page} of {pageInfo.pages} - {pageInfo.total} events
          </span>
          <button
            className="smallBtn secondary"
            disabled={pageInfo.page >= pageInfo.pages}
            onClick={() => setPageInfo((p) => ({ ...p, page: p.page + 1 }))}
          >
            Next
          </button>
        </div>
      </section>
      {selected && (
        <section className="panel banquetDetail">
          <header className="banquetDetailHeader">
            <div>
              <span className="eyebrow">{selected.eventCode}</span>
              <h2>{selected.eventName}</h2>
              <p>
                {selected.hotel?.name} - {dateOnly(selected.startDate)} -&gt;{" "}
                {dateOnly(selected.endDate)} - {selected.eventType}
              </p>
            </div>
            <span
              className={`status ${selected.status === "CONFIRMED" ? "ok" : selected.status === "CANCELLED" ? "err" : "warn"}`}
            >
              {selected.status}
            </span>
          </header>
          {canManage && (
            <div className="actions" aria-label="Event lifecycle actions">
              {(statusActions[selected.status] ?? []).map((status) => (
                <button
                  key={status}
                  className={`smallBtn ${status === "CANCELLED" ? "dangerBtn" : ""}`}
                  type="button"
                  disabled={busy}
                  onClick={() => void changeStatus(status)}
                >
                  {status === "CANCELLED"
                    ? "Cancel event"
                    : `Mark ${status.replace("_", " ").toLowerCase()}`}
                </button>
              ))}
              {(statusActions[selected.status] ?? []).includes("CANCELLED") && (
                <input
                  aria-label="Cancellation reason"
                  placeholder="Cancellation reason"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                />
              )}
            </div>
          )}
          <div className="banquetTabs" role="tablist">
            {(
              ["overview", "functions", "beo", "charges", "activity"] as const
            ).map((item) => (
              <button
                key={item}
                className={tab === item ? "active" : ""}
                type="button"
                role="tab"
                aria-selected={tab === item}
                onClick={() => {
                  setTab(item);
                  if (item === "beo" && activeFunction) {
                    setActiveFunctionId(activeFunction.id);
                    setBeoDrafts((current) =>
                      current[activeFunction.id]
                        ? current
                        : {
                            ...current,
                            [activeFunction.id]: toBeoDraft(activeFunction.beo),
                          },
                    );
                  }
                }}
              >
                {item[0].toUpperCase() + item.slice(1)}
              </button>
            ))}
          </div>
          {tab === "overview" && (
            <div>
              <form className="banquetFormGrid" onSubmit={updateEvent}>
                <label>
                  Event name
                  <input
                    disabled={!canManage}
                    required
                    value={eventForm.eventName}
                    onChange={(e) =>
                      setEventForm({ ...eventForm, eventName: e.target.value })
                    }
                  />
                </label>
                <label>
                  Event type
                  <select
                    disabled={!canManage}
                    value={eventForm.eventType}
                    onChange={(e) =>
                      setEventForm({ ...eventForm, eventType: e.target.value })
                    }
                  >
                    {eventTypes.map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Start date
                  <input
                    disabled={!canManage}
                    required
                    type="date"
                    value={eventForm.startDate}
                    onChange={(e) =>
                      setEventForm({ ...eventForm, startDate: e.target.value })
                    }
                  />
                </label>
                <label>
                  End date
                  <input
                    disabled={!canManage}
                    required
                    type="date"
                    min={eventForm.startDate}
                    value={eventForm.endDate}
                    onChange={(e) =>
                      setEventForm({ ...eventForm, endDate: e.target.value })
                    }
                  />
                </label>
                <label>
                  Expected PAX
                  <input
                    disabled={!canManage}
                    min="0"
                    type="number"
                    value={eventForm.expectedPax}
                    onChange={(e) =>
                      setEventForm({
                        ...eventForm,
                        expectedPax: e.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Guaranteed PAX
                  <input
                    disabled={!canManage}
                    min="0"
                    type="number"
                    value={eventForm.guaranteedPax}
                    onChange={(e) =>
                      setEventForm({
                        ...eventForm,
                        guaranteedPax: e.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Primary contact
                  <input
                    disabled={!canManage}
                    required
                    value={eventForm.primaryContactName}
                    onChange={(e) =>
                      setEventForm({
                        ...eventForm,
                        primaryContactName: e.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Mobile
                  <input
                    disabled={!canManage}
                    required
                    value={eventForm.primaryContactMobile}
                    onChange={(e) =>
                      setEventForm({
                        ...eventForm,
                        primaryContactMobile: e.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Email
                  <input
                    disabled={!canManage}
                    type="email"
                    value={eventForm.primaryContactEmail}
                    onChange={(e) =>
                      setEventForm({
                        ...eventForm,
                        primaryContactEmail: e.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Group
                  <select
                    disabled={!canManage}
                    value={eventForm.groupReservationId}
                    onChange={(e) =>
                      setEventForm({
                        ...eventForm,
                        groupReservationId: e.target.value,
                      })
                    }
                  >
                    <option value="">No group link</option>
                    {linkOptions.groups.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.groupCode} - {item.groupName}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Corporate
                  <select
                    disabled={!canManage}
                    value={eventForm.corporateId}
                    onChange={(e) =>
                      setEventForm({
                        ...eventForm,
                        corporateId: e.target.value,
                      })
                    }
                  >
                    <option value="">No corporate link</option>
                    {linkOptions.corporates.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Inquiry
                  <select
                    disabled={!canManage}
                    value={eventForm.inquiryId}
                    onChange={(e) =>
                      setEventForm({ ...eventForm, inquiryId: e.target.value })
                    }
                  >
                    <option value="">No inquiry link</option>
                    {linkOptions.inquiries.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.inquiryNo} - {item.guestName}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Agent
                  <select
                    disabled={!canManage}
                    value={eventForm.agentId}
                    onChange={(e) =>
                      setEventForm({ ...eventForm, agentId: e.target.value })
                    }
                  >
                    <option value="">No agent link</option>
                    {linkOptions.agents.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} - {item.email}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="wideField">
                  Notes
                  <textarea
                    disabled={!canManage}
                    value={eventForm.notes}
                    onChange={(e) =>
                      setEventForm({ ...eventForm, notes: e.target.value })
                    }
                  />
                </label>
                {canManage && (
                  <div className="formActions wideField">
                    <button className="btn" disabled={busy}>
                      Save event details
                    </button>
                  </div>
                )}
              </form>
              <div className="banquetOverviewGrid">
                <div>
                  <b>Primary contact</b>
                  <p>
                    {selected.primaryContactName}
                    <br />
                    {selected.primaryContactMobile}
                    <br />
                    {selected.primaryContactEmail ?? "No email captured"}
                  </p>
                </div>
                <div>
                  <b>Linked records</b>
                  <p>
                    {selected.groupReservation
                      ? `Group ${selected.groupReservation.groupCode}`
                      : "No group linked"}
                    <br />
                    {selected.corporate
                      ? `Corporate: ${selected.corporate.name}`
                      : "No corporate linked"}
                    <br />
                    {selected.inquiry
                      ? `Inquiry: ${selected.inquiry.inquiryNo}`
                      : "No inquiry linked"}
                    <br />
                    {selected.agent
                      ? `Agent: ${selected.agent.name}`
                      : "No agent linked"}
                  </p>
                </div>
                <div>
                  <b>Attendance</b>
                  <p>
                    Expected: {selected.expectedPax ?? "-"}
                    <br />
                    Guaranteed: {selected.guaranteedPax ?? "-"}
                  </p>
                </div>
                <div>
                  <b>Notes</b>
                  <p>{selected.notes || "No operational notes."}</p>
                </div>
              </div>
            </div>
          )}
          {tab === "functions" && (
            <div>
              <form className="banquetFunctionForm" onSubmit={saveFunction}>
                <label>
                  Function space
                  <select
                    required
                    disabled={
                      !canManage ||
                      Boolean(
                        editingFunctionId &&
                        functionForm.functionSpaceId === "",
                      )
                    }
                    value={functionForm.functionSpaceId}
                    onChange={(e) =>
                      setFunctionForm({
                        ...functionForm,
                        functionSpaceId: e.target.value,
                      })
                    }
                  >
                    <option value="">Select function space</option>
                    {spaces
                      .filter(
                        (space) =>
                          space.active &&
                          (!space.outOfService || editingFunctionId),
                      )
                      .map((space) => (
                        <option key={space.id} value={space.id}>
                          {space.name} ({space.code})
                          {space.outOfService ? " - out of service" : ""}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Function name
                  <input
                    required
                    disabled={!canManage}
                    value={functionForm.functionName}
                    onChange={(e) =>
                      setFunctionForm({
                        ...functionForm,
                        functionName: e.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Date
                  <input
                    required
                    disabled={!canManage}
                    type="date"
                    min={dateOnly(selected.startDate)}
                    max={dateOnly(selected.endDate)}
                    value={functionForm.functionDate}
                    onChange={(e) =>
                      setFunctionForm({
                        ...functionForm,
                        functionDate: e.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Start
                  <input
                    required
                    disabled={!canManage}
                    type="time"
                    value={functionForm.startTime}
                    onChange={(e) =>
                      setFunctionForm({
                        ...functionForm,
                        startTime: e.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  End
                  <input
                    required
                    disabled={!canManage}
                    type="time"
                    value={functionForm.endTime}
                    onChange={(e) =>
                      setFunctionForm({
                        ...functionForm,
                        endTime: e.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Setup
                  <select
                    disabled={!canManage}
                    value={functionForm.setupStyle}
                    onChange={(e) =>
                      setFunctionForm({
                        ...functionForm,
                        setupStyle: e.target.value,
                      })
                    }
                  >
                    {setupStyles.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Expected PAX
                  <input
                    disabled={!canManage}
                    min="0"
                    type="number"
                    value={functionForm.expectedPax}
                    onChange={(e) =>
                      setFunctionForm({
                        ...functionForm,
                        expectedPax: e.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Guaranteed PAX
                  <input
                    disabled={!canManage}
                    min="0"
                    type="number"
                    value={functionForm.guaranteedPax}
                    onChange={(e) =>
                      setFunctionForm({
                        ...functionForm,
                        guaranteedPax: e.target.value,
                      })
                    }
                  />
                </label>
                <div className="formActions">
                  <button className="btn" disabled={busy || !canManage}>
                    {editingFunctionId ? "Save function" : "Add function"}
                  </button>
                  {editingFunctionId && (
                    <button
                      className="smallBtn secondary"
                      type="button"
                      onClick={() => {
                        setEditingFunctionId("");
                        setFunctionForm(
                          emptyFunction(dateOnly(selected.startDate)),
                        );
                      }}
                    >
                      Cancel edit
                    </button>
                  )}
                </div>
              </form>
              <div className="banquetFunctionList">
                {selected.functions?.map((fn: any) => (
                  <article className="banquetFunctionCard" key={fn.id}>
                    <header>
                      <div>
                        <span className="eyebrow">
                          {dateOnly(fn.functionDate)} - {fn.startTime} to{" "}
                          {fn.endTime}
                        </span>
                        <h3>{fn.functionName}</h3>
                        <p>
                          {fn.functionSpace?.name} - {fn.setupStyle} -{" "}
                          {fn.expectedPax ?? "-"} expected /{" "}
                          {fn.guaranteedPax ?? "-"} guaranteed
                        </p>
                      </div>
                      <span
                        className={`status ${fn.status === "CANCELLED" ? "err" : fn.status === "COMPLETED" ? "ok" : "warn"}`}
                      >
                        {fn.status}
                      </span>
                    </header>
                    <div className="listActions">
                      <span
                        className={`status ${fn.beo?.status === "FINAL" ? "ok" : "warn"}`}
                      >
                        BEO: {fn.beo?.status ?? "MISSING"}
                      </span>
                      <button
                        className="smallBtn secondary"
                        type="button"
                        onClick={() => {
                          selectFunction(fn);
                          setTab("functions");
                        }}
                      >
                        Edit
                      </button>
                      {fn.status !== "CANCELLED" &&
                        fn.status !== "COMPLETED" &&
                        canManage && (
                          <button
                            className="smallBtn dangerBtn"
                            type="button"
                            onClick={() => void cancelFunction(fn)}
                          >
                            Cancel
                          </button>
                        )}
                      {!fn.beo && canManage && fn.status !== "CANCELLED" && (
                        <button
                          className="smallBtn"
                          type="button"
                          onClick={() => void ensureBeo(fn)}
                        >
                          Create BEO
                        </button>
                      )}
                      {fn.beo && (
                        <button
                          className="smallBtn"
                          type="button"
                          onClick={() => {
                            selectFunction(fn);
                            setTab("beo");
                          }}
                        >
                          Open BEO
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
          {tab === "beo" && (
            <div>
              {!activeFunction ? (
                <p className="empty">Add a function before creating a BEO.</p>
              ) : (
                <>
                  <label>
                    Active BEO function
                    <select
                      aria-label="Active BEO function"
                      value={activeFunction.id}
                      onChange={(e) => {
                        const fn = selected.functions.find(
                          (item: any) => item.id === e.target.value,
                        );
                        if (fn) selectFunction(fn);
                      }}
                    >
                      {selected.functions.map((fn: any) => (
                        <option key={fn.id} value={fn.id}>
                          {fn.functionName} - {dateOnly(fn.functionDate)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {!activeFunction.beo ? (
                    <div className="hint">
                      This function has no BEO yet. Use Create BEO from the
                      Functions tab.
                    </div>
                  ) : (
                    <section className="beoEditor">
                      <header>
                        <div>
                          <span className="eyebrow">
                            {activeFunction.beo.beoNumber}
                          </span>
                          <h3>
                            {activeFunction.functionName} -{" "}
                            {activeFunction.functionSpace?.name}
                          </h3>
                          <p>
                            {dateOnly(activeFunction.functionDate)} -{" "}
                            {activeFunction.startTime} to{" "}
                            {activeFunction.endTime} -{" "}
                            {activeFunction.setupStyle}
                          </p>
                        </div>
                        <div className="listActions">
                          <span
                            className={`status ${activeFunction.beo.status === "FINAL" ? "ok" : "warn"}`}
                          >
                            {activeFunction.beo.status}
                          </span>
                          <button
                            className="smallBtn secondary"
                            type="button"
                            onClick={printBEO}
                          >
                            Print BEO
                          </button>
                        </div>
                      </header>
                      <label>
                        Operational notes
                        <textarea
                          disabled={!canManage}
                          value={activeDraft.operationalNotes}
                          onChange={(e) =>
                            updateDraft({ operationalNotes: e.target.value })
                          }
                        />
                      </label>
                      <div className="beoColumns">
                        <div>
                          <h4>Schedule</h4>
                          {activeDraft.schedule.map(
                            (item: any, index: number) => (
                              <div className="beoRow" key={index}>
                                <input
                                  aria-label={`Schedule time ${index + 1}`}
                                  type="time"
                                  disabled={!canManage}
                                  value={item.itemTime}
                                  onChange={(e) =>
                                    updateArray("schedule", index, {
                                      itemTime: e.target.value,
                                    })
                                  }
                                />
                                <input
                                  aria-label={`Schedule item ${index + 1}`}
                                  disabled={!canManage}
                                  value={item.description}
                                  onChange={(e) =>
                                    updateArray("schedule", index, {
                                      description: e.target.value,
                                    })
                                  }
                                />
                                <button
                                  className="smallBtn secondary"
                                  type="button"
                                  disabled={!canManage}
                                  onClick={() =>
                                    updateDraft({
                                      schedule: activeDraft.schedule.filter(
                                        (_: any, i: number) => i !== index,
                                      ),
                                    })
                                  }
                                >
                                  Remove
                                </button>
                              </div>
                            ),
                          )}
                          <button
                            className="smallBtn secondary"
                            type="button"
                            disabled={!canManage}
                            onClick={() =>
                              updateDraft({
                                schedule: [
                                  ...activeDraft.schedule,
                                  {
                                    itemTime: "10:00",
                                    description: "New schedule item",
                                  },
                                ],
                              })
                            }
                          >
                            + Schedule item
                          </button>
                        </div>
                        <div>
                          <h4>Requirements</h4>
                          {activeDraft.requirements.map(
                            (item: any, index: number) => (
                              <div className="beoRequirementRow" key={index}>
                                <select
                                  disabled={!canManage}
                                  value={item.category}
                                  onChange={(e) =>
                                    updateArray("requirements", index, {
                                      category: e.target.value,
                                    })
                                  }
                                >
                                  {requirementCategories.map((value) => (
                                    <option key={value} value={value}>
                                      {banquetLabel(value)}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  disabled={!canManage}
                                  value={item.description}
                                  placeholder="Requirement"
                                  onChange={(e) =>
                                    updateArray("requirements", index, {
                                      description: e.target.value,
                                    })
                                  }
                                />
                                <input
                                  disabled={!canManage}
                                  value={item.department}
                                  placeholder="Department"
                                  onChange={(e) =>
                                    updateArray("requirements", index, {
                                      department: e.target.value,
                                    })
                                  }
                                />
                                <button
                                  className="smallBtn secondary"
                                  type="button"
                                  disabled={!canManage}
                                  onClick={() =>
                                    updateDraft({
                                      requirements:
                                        activeDraft.requirements.filter(
                                          (_: any, i: number) => i !== index,
                                        ),
                                    })
                                  }
                                >
                                  Remove
                                </button>
                              </div>
                            ),
                          )}
                          <button
                            className="smallBtn secondary"
                            type="button"
                            disabled={!canManage}
                            onClick={() =>
                              updateDraft({
                                requirements: [
                                  ...activeDraft.requirements,
                                  {
                                    category:
                                      DEFAULT_BANQUET_REQUIREMENT_CATEGORY,
                                    description: "",
                                    quantity: "1",
                                    requiredAt: "",
                                    department: "SERVICE",
                                    notes: "",
                                  },
                                ],
                              })
                            }
                          >
                            + Requirement
                          </button>
                        </div>
                        <div>
                          <h4>Charges</h4>
                          {activeDraft.charges.map(
                            (item: any, index: number) => (
                              <div className="beoChargeRow" key={index}>
                                <select
                                  disabled={!canManage}
                                  value={item.category}
                                  onChange={(e) =>
                                    updateArray("charges", index, {
                                      category: e.target.value,
                                    })
                                  }
                                >
                                  {chargeCategories.map((value) => (
                                    <option key={value} value={value}>
                                      {banquetLabel(value)}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  disabled={!canManage}
                                  value={item.description}
                                  placeholder="Charge description"
                                  onChange={(e) =>
                                    updateArray("charges", index, {
                                      description: e.target.value,
                                    })
                                  }
                                />
                                <input
                                  disabled={!canManage}
                                  type="number"
                                  min="0"
                                  value={item.quantity}
                                  aria-label={`Charge quantity ${index + 1}`}
                                  onChange={(e) =>
                                    updateArray("charges", index, {
                                      quantity: e.target.value,
                                    })
                                  }
                                />
                                <input
                                  disabled={!canManage}
                                  type="number"
                                  min="0"
                                  value={item.unitAmount}
                                  aria-label={`Charge unit amount ${index + 1}`}
                                  onChange={(e) =>
                                    updateArray("charges", index, {
                                      unitAmount: e.target.value,
                                    })
                                  }
                                />
                                <button
                                  className="smallBtn secondary"
                                  type="button"
                                  disabled={!canManage}
                                  onClick={() =>
                                    updateDraft({
                                      charges: activeDraft.charges.filter(
                                        (_: any, i: number) => i !== index,
                                      ),
                                    })
                                  }
                                >
                                  Remove
                                </button>
                              </div>
                            ),
                          )}
                          <button
                            className="smallBtn secondary"
                            type="button"
                            disabled={!canManage}
                            onClick={() =>
                              updateDraft({
                                charges: [
                                  ...activeDraft.charges,
                                  {
                                    category: DEFAULT_BANQUET_CHARGE_CATEGORY,
                                    description: "",
                                    quantity: "1",
                                    unitAmount: "0",
                                    notes: "",
                                  },
                                ],
                              })
                            }
                          >
                            + Charge
                          </button>
                        </div>
                      </div>
                      <div className="formActions">
                        <button
                          className="btn"
                          type="button"
                          disabled={busy || !canManage}
                          onClick={() => void saveBEO()}
                        >
                          Save draft
                        </button>
                        <button
                          className="smallBtn"
                          type="button"
                          disabled={
                            busy ||
                            !canManage ||
                            activeFunction.beo.status === "FINAL"
                          }
                          onClick={() => void finalizeBEO()}
                        >
                          Finalize BEO
                        </button>
                      </div>
                      <div className="beoRequirementStatus">
                        {activeFunction.beo.requirements.map((item: any) => (
                          <div key={item.id}>
                            <span>{item.description}</span>
                            <select
                              disabled={!canManage}
                              value={item.status}
                              onChange={(e) =>
                                void updateRequirement(item.id, e.target.value)
                              }
                            >
                              <option>PENDING</option>
                              <option>ACKNOWLEDGED</option>
                              <option>COMPLETED</option>
                            </select>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                </>
              )}
            </div>
          )}
          {tab === "charges" && (
            <div className="banquetChargeSummary">
              <h3>Estimated event charges</h3>
              <p>
                All BEO charge lines across all functions are included in this
                event estimate.
              </p>
              <table className="dataTable">
                <thead>
                  <tr>
                    <th>Function</th>
                    <th>Description</th>
                    <th>Qty</th>
                    <th>Unit</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(selected.functions ?? []).flatMap((fn: any) =>
                    (fn.beo?.chargeLines ?? []).map((line: any) => (
                      <tr key={line.id}>
                        <td>{fn.functionName}</td>
                        <td>{line.description}</td>
                        <td>{line.quantity}</td>
                        <td>INR {line.unitAmount}</td>
                        <td>INR {line.totalAmount}</td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
              <strong>Current estimate: INR {totalEstimate.toFixed(2)}</strong>
            </div>
          )}
          {tab === "activity" && (
            <div className="activityList">
              {selected.activity?.length ? (
                selected.activity.map((item: any) => (
                  <div key={item.id}>
                    <b>{item.action}</b>
                    <span>
                      {item.actor?.name ?? "System"} -{" "}
                      {new Date(item.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))
              ) : (
                <p className="empty">No event activity recorded.</p>
              )}
            </div>
          )}
          <p className="mutedText">
            <a
              href={`/rainwood/admin/logbook?hotelId=${encodeURIComponent(selected.hotel?.id ?? "")}&new=1&category=GENERAL&title=${encodeURIComponent(`Banquet follow-up — ${selected.eventCode}`)}&details=${encodeURIComponent(`${selected.eventName}\n${activeFunction?.functionSpace?.name ?? "Function space"} · ${activeFunction ? `${dateOnly(activeFunction.functionDate)} · ${activeFunction.startTime}–${activeFunction.endTime}` : `${dateOnly(selected.startDate)}–${dateOnly(selected.endDate)}`}`)}`}
            >
              Add to Operations Logbook
            </a>
          </p>
        </section>
      )}
    </section>
  );
}
