"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AdminLayout } from "../../../components/Shell";
import { RainwoodDatePicker } from "../../../components/RainwoodDatePicker";
import { apiRequest } from "../../../lib/api";

type Plan = {
  id: string;
  code: string;
  name: string;
  mealPlan: string;
  active: boolean;
  roomType: { name: string; hotel: { name: string; city: string } };
};
type Mapping = {
  active?: boolean;
  pricingMode?: "BASE" | "OVERRIDE";
  ratePlan: { id: string };
};
type Agent = {
  id: string;
  name: string;
  email: string;
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
  const editorRef = useRef<HTMLElement | null>(null);
  const agent = useMemo(
    () => agents.find((item) => item.id === agentId),
    [agents, agentId],
  );
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
          setAgentId(loadedAgents[0].id);
          setSelected(active);
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
    setPersistedActiveRatePlanIds(active);
    setEditor(null);
    setMessage("");
  }
  function togglePlan(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }
  async function save() {
    if (!agentId) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const saved = await apiRequest<Agent>(
        `/users/agents/${agentId}/rate-plans`,
        { method: "PUT", body: JSON.stringify({ ratePlanIds: selected }) },
      );
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
        await apiRequest(
          `/users/agents/${agentId}/rate-plans/${editor.ratePlan.id}`,
          {
            method: "PATCH",
            body: JSON.stringify({ pricingMode: "OVERRIDE" }),
          },
        );
        setAgents((current) =>
          current.map((item) =>
            item.id === agentId
              ? {
                  ...item,
                  assignedRatePlans: item.assignedRatePlans.map((mapping) =>
                    mapping.ratePlan.id === editor.ratePlan.id
                      ? { ...mapping, pricingMode: "OVERRIDE" }
                      : mapping,
                  ),
                }
              : item,
          ),
        );
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

  return (
    <AdminLayout title="Agent Rate-Plan Mapping">
      <section className="masterPanel">
        <div className="listToolbar">
          <div>
            <span>Access control and negotiated pricing</span>
            <h2>Assign rate plans to agents</h2>
            <p>
              Assign active room rate plans and optionally maintain
              agent-specific date rates. Removing access deactivates the mapping
              and preserves its negotiated rate history.
            </p>
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
              Choose agent
              <select
                value={agentId}
                onChange={(event) => chooseAgent(event.target.value)}
              >
                <option value="">Select agent</option>
                {agents.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} - {item.email}
                  </option>
                ))}
              </select>
            </label>
            {agentId && (
              <>
                <div className="mappingHeader">
                  <h3>{agent?.name}</h3>
                  <span>
                    {selected.length} selected ·{" "}
                    {persistedActiveRatePlanIds.length} saved
                  </span>
                </div>
                <div className="mappingGrid">
                  {plans.map((plan) => {
                    const mapping = agent?.assignedRatePlans.find(
                      (item) => item.ratePlan.id === plan.id,
                    );
                    const persisted = persistedActiveRatePlanIds.includes(
                      plan.id,
                    );
                    return (
                      <div
                        className={`mappingCard ${selected.includes(plan.id) ? "selected" : ""}`}
                        key={plan.id}
                      >
                        <label className="mappingCardToggle">
                          <input
                            type="checkbox"
                            checked={selected.includes(plan.id)}
                            onChange={() => togglePlan(plan.id)}
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
                                ? "Agent contract pricing"
                                : "Using hotel/base rates"}
                            </span>
                            <label>
                              <input
                                type="radio"
                                checked={mapping?.pricingMode !== "OVERRIDE"}
                                onChange={() =>
                                  void setPricingMode(plan.id, "BASE")
                                }
                              />{" "}
                              Base
                            </label>
                            <label>
                              <input
                                type="radio"
                                checked={mapping?.pricingMode === "OVERRIDE"}
                                onChange={() =>
                                  void setPricingMode(plan.id, "OVERRIDE")
                                }
                              />{" "}
                              Contract
                            </label>
                          </div>
                        )}
                        <button
                          className="smallBtn secondary"
                          type="button"
                          disabled={!persisted || editorBusy}
                          onClick={() => void openEditor(plan.id)}
                        >
                          {mapping?.pricingMode === "OVERRIDE"
                            ? "Manage agent rates"
                            : "Set agent rates"}
                        </button>
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
                    ? "Manage agent rates"
                    : "Set agent rates"}
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
              Base rates remain the source of availability. Agent rates are
              optional overrides; blank values inherit the base rate.
              {editor.pricingMode !== "OVERRIDE" &&
                " Saving an override will enable contract pricing for this plan."}
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
                  Select a date range, enter only the agent overrides you need,
                  then save. Blank fields inherit the hotel rate.
                </p>
                <div className="agentRateFormFields">
                  <label>
                    Agent base rate
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
                    Tax override
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
                    Child override
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
                    Extra adult override
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
                        {key[0].toUpperCase() + key.slice(1)} override
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
                  {editorBusy ? "Saving..." : "Save agent rates"}
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
                            ["Base rate", "base"],
                            ["Agent rate", "amount"],
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
                    <th>Base</th>
                    <th>Agent override</th>
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
                            ? "Agent"
                            : "Base"}
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
