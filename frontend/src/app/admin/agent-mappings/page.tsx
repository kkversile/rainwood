"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AdminLayout } from "../../../components/Shell";
import { RainwoodDatePicker } from "../../../components/RainwoodDatePicker";
import { apiFileBlob, apiRequest } from "../../../lib/api";

type Plan = {
  id: string;
  code: string;
  name: string;
  mealPlan: string;
  active: boolean;
  master: { id: string; code: string; name: string; mealPlan: string; active: boolean };
  roomType: { name: string; hotel: { id: string; name: string; city: string } };
};
type Mapping = {
  active?: boolean;
  pricingMode?: "BASE" | "OVERRIDE";
  ratePlan: { id: string; master: { id: string; code: string; name: string; mealPlan: string }; roomType: { name: string; hotel: { id: string; name: string; city: string } } };
};
type Agent = {
  id: string;
  name: string;
  email: string;
  companyName?: string | null;
  active: boolean;
  assignedRatePlans: Mapping[];
};
type RateRow = {
  date: string;
  amount: number | string | null;
  taxAmount: number | string | null;
  childAmount: number | string | null;
  extraAdultAmount: number | string | null;
  occupancyPrices?: Record<string, number> | null;
  priceSource?: "BASE" | "AGENT_OVERRIDE";
};
type RatePayload = {
  id: string;
  active: boolean;
  pricingMode?: "BASE" | "OVERRIDE";
  ratePlan: {
    id: string;
    code: string;
    name: string;
    mealPlan: string;
    master: { id: string; code: string; name: string; mealPlan: string; active: boolean };
    roomType: {
      id: string;
      name: string;
      code: string;
      hotel: { id: string; name: string; city: string };
    };
    rates?: RateRow[];
  };
  rates?: (RateRow & { id: string })[];
};
type EditorRateRow = {
  base: RateRow;
  override: RateRow | undefined;
  effective: RateRow | undefined;
};
type AgentValueKey =
  | "amount"
  | "taxAmount"
  | "childAmount"
  | "extraAdultAmount"
  | "single"
  | "double"
  | "triple"
  | "quad";

const blankEditor = {
  from: "",
  to: "",
  amount: "",
  taxAmount: "",
  childAmount: "",
  extraAdultAmount: "",
  single: "",
  double: "",
  triple: "",
  quad: "",
};

function dateRange(from: string, to: string) {
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  const dates: string[] = [];
  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    start > end
  )
    return dates;
  for (
    const date = new Date(start);
    date <= end && dates.length < 366;
    date.setUTCDate(date.getUTCDate() + 1)
  )
    dates.push(date.toISOString().slice(0, 10));
  return dates;
}

function effective(
  base: RateRow | undefined,
  override: RateRow | undefined,
  mode: "BASE" | "OVERRIDE" = "BASE",
) {
  if (!base) return undefined;
  const activeOverride = mode === "OVERRIDE" ? override : undefined;
  return {
    ...base,
    amount: activeOverride?.amount ?? base.amount,
    taxAmount: activeOverride?.taxAmount ?? base.taxAmount,
    childAmount: activeOverride?.childAmount ?? base.childAmount,
    extraAdultAmount: activeOverride?.extraAdultAmount ?? base.extraAdultAmount,
    occupancyPrices: {
      ...(base.occupancyPrices ?? {}),
      ...(activeOverride?.occupancyPrices ?? {}),
    },
    priceSource: activeOverride
      ? ("AGENT_OVERRIDE" as const)
      : ("BASE" as const),
  };
}

function money(value: number | string | null | undefined) {
  return value === undefined || value === null || value === ""
    ? "—"
    : `INR ${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export default function AgentMappingsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [agentId, setAgentId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedMasters, setSelectedMasters] = useState<Record<string, string>>({});
  const [persistedActiveRatePlanIds, setPersistedActiveRatePlanIds] = useState<
    string[]
  >([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editor, setEditor] = useState<RatePayload | null>(null);
  const [editorForm, setEditorForm] = useState(blankEditor);
  const [editorBusy, setEditorBusy] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [agentSearch, setAgentSearch] = useState("");
  const [hotelFilter, setHotelFilter] = useState("");
  const [roomFilter, setRoomFilter] = useState("");
  const [mealFilter, setMealFilter] = useState("");
  const [planSearch, setPlanSearch] = useState("");
  const editorRef = useRef<HTMLElement | null>(null);
  const agent = useMemo(
    () => agents.find((item) => item.id === agentId),
    [agents, agentId],
  );
  const visibleAgents = useMemo(() => {
    const query = agentSearch.trim().toLowerCase();
    return agents.filter((item) => !query || `${item.name} ${item.companyName ?? ''} ${item.email}`.toLowerCase().includes(query)).slice(0, 50);
  }, [agentSearch, agents]);
  const hotels = useMemo(() => Array.from(new Map(plans.map((plan) => [plan.roomType.hotel.name, plan.roomType.hotel.name])).values()).sort(), [plans]);
  const rooms = useMemo(() => Array.from(new Map(plans.filter((plan) => !hotelFilter || plan.roomType.hotel.name === hotelFilter).map((plan) => [plan.roomType.name, plan.roomType.name])).values()).sort(), [hotelFilter, plans]);
  const visiblePlans = useMemo(() => { const query = planSearch.trim().toLowerCase(); return plans.filter((plan) => (!hotelFilter || plan.roomType.hotel.name === hotelFilter) && (!roomFilter || plan.roomType.name === roomFilter) && (!mealFilter || plan.mealPlan === mealFilter) && (!query || `${plan.code} ${plan.name} ${plan.mealPlan} ${plan.roomType.name} ${plan.roomType.hotel.name}`.toLowerCase().includes(query))); }, [hotelFilter, mealFilter, planSearch, plans, roomFilter]);
  const masterGroups = useMemo(() => {
    const groups = new Map<string, { hotel: Plan['roomType']['hotel']; master: Plan['master']; plans: Plan[] }>();
    for (const plan of visiblePlans) {
      const key = `${plan.roomType.hotel.id}:${plan.master.id}`;
      const group = groups.get(key) ?? { hotel: plan.roomType.hotel, master: plan.master, plans: [] };
      group.plans.push(plan);
      groups.set(key, group);
    }
    return [...groups.values()].sort((a, b) => `${a.hotel.name} ${a.master.code}`.localeCompare(`${b.hotel.name} ${b.master.code}`));
  }, [visiblePlans]);
  const editorRows = useMemo<EditorRateRow[]>(() => {
    if (!editor) return [];
    const overrides = new Map(
      (editor.rates ?? []).map((rate) => [rate.date.slice(0, 10), rate]),
    );
    return (editor.ratePlan.rates ?? []).map((base) => ({
      base,
      override: overrides.get(base.date.slice(0, 10)),
      effective: effective(
        base,
        overrides.get(base.date.slice(0, 10)),
        editor.pricingMode,
      ),
    }));
  }, [editor]);
  const editorDates = useMemo(() => {
    if (!editor) return [];
    const selectedDates = dateRange(editorForm.from, editorForm.to);
    return selectedDates.length
      ? selectedDates
      : editorRows.slice(0, 31).map((row) => row.base.date.slice(0, 10));
  }, [editor, editorForm.from, editorForm.to, editorRows]);
  function agentDraftValue(key: AgentValueKey) {
    if (!editorForm[key] || editorForm[key].trim() === "") return undefined;
    return Number(editorForm[key]);
  }
  function agentRowFor(date: string) {
    return editorRows.find((row) => row.base.date.slice(0, 10) === date);
  }
  function agentCalendarValue(
    row: EditorRateRow | undefined,
    key: AgentValueKey,
  ) {
    if (!row) return undefined;
    const activeOverride =
      editor?.pricingMode === "OVERRIDE" ? row.override : undefined;
    if (key === "amount") {
      return agentDraftValue(key) ?? activeOverride?.amount ?? row.base.amount;
    }
    if (key === "taxAmount") {
      return (
        agentDraftValue(key) ?? activeOverride?.taxAmount ?? row.base.taxAmount
      );
    }
    if (key === "childAmount") {
      return (
        agentDraftValue(key) ??
        activeOverride?.childAmount ??
        row.base.childAmount
      );
    }
    if (key === "extraAdultAmount") {
      return (
        agentDraftValue(key) ??
        activeOverride?.extraAdultAmount ??
        row.base.extraAdultAmount
      );
    }
    return (
      agentDraftValue(key) ??
      activeOverride?.occupancyPrices?.[key] ??
      row.base.occupancyPrices?.[key]
    );
  }
  useEffect(() => {
    if (!editor) return;
    const focusFrame = window.requestAnimationFrame(() => {
      editorRef.current?.focus();
    });
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setEditor(null);
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [editor]);
  useEffect(() => {
    Promise.all([
      apiRequest<Agent[]>("/users/agents"),
      apiRequest<Plan[]>("/hotels/rate-plans"),
    ])
      .then(([loadedAgents, loadedPlans]) => {
        setAgents(loadedAgents);
        setPlans(loadedPlans.filter((item) => item.active));
        if (loadedAgents[0]) {
          const active = loadedAgents[0].assignedRatePlans
            .filter((item) => item.active !== false)
            .map((item) => item.ratePlan.id);
          const masters = Object.fromEntries(loadedAgents[0].assignedRatePlans.filter((item) => item.active !== false).map((item) => [item.ratePlan.roomType.hotel.id, item.ratePlan.master.id]));
          setAgentId(loadedAgents[0].id);
          setSelected(active);
          setSelectedMasters(masters);
          setPersistedActiveRatePlanIds(active);
        }
      })
      .catch((reason) =>
        setError(
          reason instanceof Error ? reason.message : "Could not load mappings",
        ),
      )
      .finally(() => setLoading(false));
  }, []);
  function chooseAgent(id: string) {
    const next = agents.find((item) => item.id === id);
    const active =
      next?.assignedRatePlans
        .filter((item) => item.active !== false)
        .map((item) => item.ratePlan.id) ?? [];
    setAgentId(id);
    setSelected(active);
    setSelectedMasters(Object.fromEntries((next?.assignedRatePlans ?? []).filter((item) => item.active !== false).map((item) => [item.ratePlan.roomType.hotel.id, item.ratePlan.master.id])));
    setPersistedActiveRatePlanIds(active);
    setEditor(null);
    setMessage("");
  }
  async function save() {
    if (!agentId) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      let saved = agent;
      for (const [hotelId, masterId] of Object.entries(selectedMasters)) {
        saved = await apiRequest<Agent>(`/users/agents/${agentId}/hotel-rate-plan`, { method: "PUT", body: JSON.stringify({ hotelId, masterId }) });
      }
      if (!saved) throw new Error("Select at least one hotel rate plan.");
      const active = saved.assignedRatePlans
        .filter((item) => item.active !== false)
        .map((item) => item.ratePlan.id);
      setAgents((current) =>
        current.map((item) => (item.id === agentId ? saved : item)),
      );
      setSelected(active);
      setPersistedActiveRatePlanIds(active);
      setMessage(
        `Saved ${active.length} rate plan${active.length === 1 ? "" : "s"} for ${agent?.name}. Existing negotiated rates were preserved.`,
      );
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not save mapping",
      );
    } finally {
      setBusy(false);
    }
  }
  async function setPricingMode(
    planId: string,
    pricingMode: "BASE" | "OVERRIDE",
  ) {
    if (!agentId || !persistedActiveRatePlanIds.includes(planId)) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest(`/users/agents/${agentId}/rate-plans/${planId}`, {
        method: "PATCH",
        body: JSON.stringify({ pricingMode }),
      });
      setAgents((current) =>
        current.map((item) =>
          item.id === agentId
            ? {
                ...item,
                assignedRatePlans: item.assignedRatePlans.map((mapping) =>
                  mapping.ratePlan.id === planId
                    ? { ...mapping, pricingMode }
                    : mapping,
                ),
              }
            : item,
        ),
      );
      if (editor?.ratePlan.id === planId) setEditor({ ...editor, pricingMode });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not update pricing mode",
      );
    } finally {
      setBusy(false);
    }
  }
  async function openEditor(planId: string) {
    if (!agentId || !persistedActiveRatePlanIds.includes(planId)) return;
    const mapping = agent?.assignedRatePlans.find(
      (item) => item.ratePlan.id === planId,
    );
    setEditorBusy(true);
    setError("");
    try {
      const loaded = await apiRequest<RatePayload>(
        `/users/agents/${agentId}/rate-plans/${planId}/rates`,
      );
      setEditor({
        ...loaded,
        pricingMode: mapping?.pricingMode ?? loaded.pricingMode ?? "BASE",
      });
      setEditorForm(blankEditor);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not load agent rates",
      );
    } finally {
      setEditorBusy(false);
    }
  }
  async function saveEditor(event: React.FormEvent) {
    event.preventDefault();
    if (!editor) return;
    const dates = dateRange(editorForm.from, editorForm.to);
    if (!dates.length) {
      setError("Choose a valid date range.");
      return;
    }
    setEditorBusy(true);
    setError("");
    setMessage("");
    try {
      if (editor.pricingMode !== "OVERRIDE") {
        setError("Select Use Contract Rate before entering contract rates.");
        setEditorBusy(false);
        return;
      }
      const value = (text: string) =>
        text.trim() === "" ? null : Number(text);
      const occupancy = Object.fromEntries(
        (["single", "double", "triple", "quad"] as const)
          .filter((key) => editorForm[key].trim() !== "")
          .map((key) => [key, Number(editorForm[key])]),
      );
      await apiRequest<RatePayload>(
        `/users/agents/${agentId}/rate-plans/${editor.ratePlan.id}/rates`,
        {
          method: "PUT",
          body: JSON.stringify({
            days: dates.map((date) => ({
              date,
              amount: value(editorForm.amount),
              taxAmount: value(editorForm.taxAmount),
              childAmount: value(editorForm.childAmount),
              extraAdultAmount: value(editorForm.extraAdultAmount),
              occupancyPrices: Object.keys(occupancy).length ? occupancy : null,
            })),
          }),
        },
      );
      setMessage("Agent rates saved. Blank fields inherit the base room rate.");
      setEditor(null);
      setEditorForm(blankEditor);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not save agent rates",
      );
    } finally {
      setEditorBusy(false);
    }
  }
  async function downloadTemplate() {
    try { const blob = await apiFileBlob('/users/agents/rate-import-template.xlsx'); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'rainwood-agent-rate-template.xlsx'; link.click(); URL.revokeObjectURL(url); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not download template'); }
  }
  async function importRates(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return; setImportBusy(true); setError(''); setMessage('');
    try { const form = new FormData(); form.append('file', file); const result = await apiRequest<{ rowsReceived: number; rowsValid: number; rowsInvalid: number; rowsImported: number; rowsUpdated: number; errors: { row: number; field: string; message: string }[] }>('/users/agents/rates/import', { method: 'POST', body: form }); if (result.errors.length) setError(`Received ${result.rowsReceived} row(s): ${result.rowsInvalid} invalid. No rows were saved.\n${result.errors.map((item) => `Row ${item.row} — ${item.field} — ${item.message}`).join('\n')}`); else { setMessage(`Received ${result.rowsReceived}; imported ${result.rowsImported}; updated ${result.rowsUpdated}.`); if (editor) await openEditor(editor.ratePlan.id); } } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not import agent rates'); } finally { setImportBusy(false); event.target.value = ''; }
  }

  return (
    <AdminLayout title="Agent Access & Contract Rates">
      <section className="masterPanel">
          <div className="listToolbar">
          <div>
            <span>Access control and negotiated pricing</span>
            <h2>Agent Access & Contract Rates</h2>
            <p>
              Give agents access to hotel rate plans and maintain negotiated contract rates where needed.
            </p>
            <div className="rowActions"><button className="smallBtn" type="button" onClick={() => void downloadTemplate()}>Download Agent Rate Template</button><label className="smallBtn">{importBusy ? 'Importing...' : 'Import Agent Rates'}<input type="file" accept=".xlsx,.xlsm" hidden onChange={(event) => void importRates(event)} disabled={importBusy} /></label></div>
          </div>
        </div>
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
        {loading ? (
          <p className="loading">Loading mappings...</p>
        ) : (
          <>
            <label>
              Agent
              <input aria-label="Search agents" placeholder="Search agent name, company or email..." value={agentSearch} onChange={(event) => setAgentSearch(event.target.value)} />
            </label>
            <div className="agentPickerResults" role="listbox" aria-label="Agent results">{visibleAgents.map((item) => <button key={item.id} type="button" className={item.id === agentId ? "selected" : ""} onClick={() => chooseAgent(item.id)} role="option" aria-selected={item.id === agentId}><b>{item.name}</b><span>{item.email}</span></button>)}{!visibleAgents.length && <p className="empty">No agents match this search.</p>}</div>
            {agentId && (
              <>
                <div className="mappingFilters"><label>Hotel<select value={hotelFilter} onChange={(event) => { setHotelFilter(event.target.value); setRoomFilter(""); }}><option value="">All Hotels</option>{hotels.map((hotel) => <option key={hotel} value={hotel}>{hotel}</option>)}</select></label><label>Room Type<select value={roomFilter} onChange={(event) => setRoomFilter(event.target.value)}><option value="">All Rooms</option>{rooms.map((room) => <option key={room} value={room}>{room}</option>)}</select></label><label>Meal Plan<select value={mealFilter} onChange={(event) => setMealFilter(event.target.value)}><option value="">All Meal Plans</option>{Array.from(new Set(plans.map((plan) => plan.mealPlan))).sort().map((meal) => <option key={meal} value={meal}>{meal}</option>)}</select></label><label>Search plans<input value={planSearch} onChange={(event) => setPlanSearch(event.target.value)} placeholder="CP Breakfast..." /></label></div>
                <div className="mappingHeader">
                  <h3>{agent?.name}</h3>
                  <span>
                    {selected.length} selected ·{" "}
                    {persistedActiveRatePlanIds.length} saved
                  </span>
                </div>
                <div className="mappingGrid">
                  {visiblePlans.map((plan) => {
                    const mapping = agent?.assignedRatePlans.find(
                      (item) => item.ratePlan.id === plan.id,
                    );
                    const persisted = persistedActiveRatePlanIds.includes(
                      plan.id,
                    );
                    return (
                      <div
                        className={`mappingCard ${selectedMasters[plan.roomType.hotel.id] === plan.master.id ? "selected" : ""}`}
                        key={plan.id}
                      >
                        <label className="mappingCardToggle">
                          <input
                            type="radio"
                            name={`agent-master-${plan.roomType.hotel.id}`}
                            checked={selectedMasters[plan.roomType.hotel.id] === plan.master.id}
                            onChange={() => setSelectedMasters((current) => ({ ...current, [plan.roomType.hotel.id]: plan.master.id }))}
                          />
                          <span className="mappingCode">{plan.code}</span>
                          <span>
                            <b>{plan.name}</b>
                            <small>
                              {plan.roomType.hotel.name} / {plan.roomType.name}{" "}
                              · {plan.mealPlan}
                            </small>
                          </span>
                        </label>
                        {persisted && (
                          <div className="mappingPricing">
                            <span>
                              {mapping?.pricingMode === "OVERRIDE"
                                ? "Using Contract Rate"
                                : "Using Hotel Rate"}
                            </span>
                            <label>
                              <input
                                type="radio"
                                checked={mapping?.pricingMode !== "OVERRIDE"}
                                onChange={() =>
                                  void setPricingMode(plan.id, "BASE")
                                }
                              />{" "}
                              Use Hotel Rate
                            </label>
                            <label>
                              <input
                                type="radio"
                                checked={mapping?.pricingMode === "OVERRIDE"}
                                onChange={() =>
                                  void setPricingMode(plan.id, "OVERRIDE")
                                }
                              />{" "}
                              Use Contract Rate
                            </label>
                          </div>
                        )}
                        {mapping?.pricingMode === "OVERRIDE" && <button className="smallBtn secondary" type="button" disabled={!persisted || editorBusy} onClick={() => void openEditor(plan.id)}>Manage Contract Rates</button>}
                      </div>
                    );
                  })}
                </div>
                <button
                  className="btn"
                  type="button"
                  disabled={busy}
                  onClick={() => void save()}
                >
                  {busy ? "Saving..." : "Save assignments"}
                </button>
              </>
            )}
          </>
        )}
      </section>
      {editor && (
        <div className="agentRateModalBackdrop">
          <section
            className="panel agentRateEditor agentRateModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="agent-rate-editor-title"
            tabIndex={-1}
            ref={editorRef}
          >
            <div className="rangeSectionHeader">
              <div>
                <h2 id="agent-rate-editor-title">
                  {editor.pricingMode === "OVERRIDE"
                    ? "Manage Contract Rates"
                    : "Contract Rates"}
                </h2>
                <p>
                  {agent?.name} · {editor.ratePlan.roomType.name} ·{" "}
                  {editor.ratePlan.name}
                </p>
              </div>
              <button
                className="smallBtn"
                type="button"
                onClick={() => setEditor(null)}
              >
                Close
              </button>
            </div>
            <p className="notice">
              Agent receives negotiated rates where configured. Blank fields continue using the hotel rate.
            </p>
            {error && (
              <p className="error agentRateModalFeedback" role="alert">
                {error}
              </p>
            )}
            {message && (
              <p className="notice agentRateModalFeedback" role="status">
                {message}
              </p>
            )}
            <div className="agentRateLayout">
              <form
                className="formCard agentRateFormCard"
                onSubmit={(event) => void saveEditor(event)}
              >
                <div className="agentDateControls">
                  <div className="agentDateField">
                    <span>Start date</span>
                    <RainwoodDatePicker
                      label="Start date"
                      value={editorForm.from}
                      accent
                      onChange={(value) =>
                        setEditorForm({ ...editorForm, from: value })
                      }
                    />
                  </div>
                  <div className="agentDateField">
                    <span>End date</span>
                    <RainwoodDatePicker
                      label="End date"
                      value={editorForm.to}
                      minDate={editorForm.from}
                      onChange={(value) =>
                        setEditorForm({ ...editorForm, to: value })
                      }
                    />
                  </div>
                </div>
                <p className="agentRateHint">
                  Select a date range, enter only the contract rates you need,
                  then save. Blank fields inherit the hotel rate.
                </p>
                <div className="agentRateFormFields">
                  <label>
                    Contract Rate
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={editorForm.amount}
                      onChange={(event) =>
                        setEditorForm({
                          ...editorForm,
                          amount: event.target.value,
                        })
                      }
                      placeholder="Inherit"
                    />
                  </label>
                  <label>
                    Contract Tax
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={editorForm.taxAmount}
                      onChange={(event) =>
                        setEditorForm({
                          ...editorForm,
                          taxAmount: event.target.value,
                        })
                      }
                      placeholder="Inherit"
                    />
                  </label>
                  <label>
                    Child Charge
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={editorForm.childAmount}
                      onChange={(event) =>
                        setEditorForm({
                          ...editorForm,
                          childAmount: event.target.value,
                        })
                      }
                      placeholder="Inherit"
                    />
                  </label>
                  <label>
                    Extra Adult Charge
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={editorForm.extraAdultAmount}
                      onChange={(event) =>
                        setEditorForm({
                          ...editorForm,
                          extraAdultAmount: event.target.value,
                        })
                      }
                      placeholder="Inherit"
                    />
                  </label>
                  {(["single", "double", "triple", "quad"] as const).map(
                    (key) => (
                      <label key={key}>
                        {key[0].toUpperCase() + key.slice(1)} Contract Rate
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={editorForm[key]}
                          onChange={(event) =>
                            setEditorForm({
                              ...editorForm,
                              [key]: event.target.value,
                            })
                          }
                          placeholder="Inherit"
                        />
                      </label>
                    ),
                  )}
                </div>
                <button
                  className="btn agentRateSaveButton"
                  disabled={editorBusy}
                >
                  {editorBusy ? "Saving..." : "Save Contract Rates"}
                </button>
              </form>
              <div className="agentRatePreview">
                <div className="agentRatePreviewHeader">
                  <div>
                    <h3>Agent rate preview</h3>
                    <p>Draft values update this calendar immediately.</p>
                  </div>
                  <span>
                    {editorDates.length} date
                    {editorDates.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="tableScroll">
                  <table className="agentRateCalendarTable">
                    <thead>
                      <tr>
                        <th>Rate</th>
                        {editorDates.map((date) => (
                          <th key={date}>{date}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {!editorRows.length ? (
                        <tr>
                          <td colSpan={Math.max(2, editorDates.length + 1)}>
                            No base rates published for this plan yet.
                          </td>
                        </tr>
                      ) : (
                        (
                          [
                            ["Hotel Rate", "base"],
                            ["Agent Will Receive", "amount"],
                            ["Single", "single"],
                            ["Double", "double"],
                            ["Triple", "triple"],
                            ["Quad", "quad"],
                            ["Child", "childAmount"],
                            ["Extra adult", "extraAdultAmount"],
                          ] as const
                        ).map(([label, key]) => (
                          <tr key={label}>
                            <th>{label}</th>
                            {editorDates.map((date) => {
                              const row = agentRowFor(date);
                              const value =
                                key === "base"
                                  ? row?.base.amount
                                  : agentCalendarValue(row, key);
                              return <td key={date}>{money(value)}</td>;
                            })}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="tableScroll">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Hotel Rate</th>
                    <th>Contract Rate</th>
                    <th>Effective</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {!editorRows.length ? (
                    <tr>
                      <td colSpan={5}>
                        No base rates published for this plan yet.
                      </td>
                    </tr>
                  ) : (
                    editorRows.slice(0, 31).map((row) => (
                      <tr key={row.base.date}>
                        <td>{row.base.date.slice(0, 10)}</td>
                        <td>{money(row.base.amount)}</td>
                        <td>
                          {row.override ? money(row.override.amount) : "—"}
                        </td>
                        <td>{money(row.effective?.amount)}</td>
                        <td>
                          {row.effective?.priceSource === "AGENT_OVERRIDE"
                            ? "Contract Rate"
                            : "Hotel Rate"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </AdminLayout>
  );
}
