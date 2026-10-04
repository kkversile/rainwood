"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiRequest } from "../lib/api";
import {
  DEFAULT_FUNCTION_SPACE_TYPE,
  FUNCTION_SPACE_TYPES,
  banquetLabel,
} from "../lib/banquet-contract";
import { useAdminProfile } from "./AdminData";

type Hotel = { id: string; name: string };
type Space = {
  id: string;
  hotelId: string;
  name: string;
  code: string;
  spaceType: string;
  floor?: string | null;
  locationDescription?: string | null;
  areaSqFt?: number | null;
  active: boolean;
  outOfService: boolean;
  capacityTheatre?: number | null;
  capacityClassroom?: number | null;
  capacityBoardroom?: number | null;
  capacityUShape?: number | null;
  capacityBanquet?: number | null;
  capacityReception?: number | null;
  notes?: string | null;
};
const types = FUNCTION_SPACE_TYPES;
const blank = {
  hotelId: "",
  name: "",
  code: "",
  spaceType: DEFAULT_FUNCTION_SPACE_TYPE as string,
  floor: "",
  locationDescription: "",
  areaSqFt: "",
  capacityTheatre: "0",
  capacityClassroom: "0",
  capacityBoardroom: "0",
  capacityUShape: "0",
  capacityBanquet: "0",
  capacityReception: "0",
  notes: "",
};
const editable = ["SUPER_ADMIN", "CORPORATE_ADMIN", "ADMIN", "RESERVATION"];

export function FunctionSpacesData() {
  const { profile } = useAdminProfile();
  const canManage = editable.includes(profile?.role ?? "");
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [rows, setRows] = useState<Space[]>([]);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState<Space | null>(null);
  const [hotelId, setHotelId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function loadHotels() {
    const result = await apiRequest<Hotel[]>("/hotels");
    setHotels(result);
    const preferred = profile?.staffHotelId || result[0]?.id || "";
    setHotelId((value) => value || preferred);
    setForm((value) => ({ ...value, hotelId: value.hotelId || preferred }));
  }
  async function loadSpaces() {
    const query = hotelId ? `?hotelId=${encodeURIComponent(hotelId)}` : "";
    setRows(await apiRequest<Space[]>(`/function-spaces${query}`));
  }
  useEffect(() => {
    void loadHotels().catch((reason) =>
      setError(
        reason instanceof Error ? reason.message : "Could not load hotels",
      ),
    );
  }, [profile?.staffHotelId]);
  useEffect(() => {
    if (hotelId)
      void loadSpaces().catch((reason) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "Could not load function spaces",
        ),
      );
  }, [hotelId]);
  function startEdit(row: Space) {
    setEditing(row);
    setForm({
      hotelId: row.hotelId,
      name: row.name,
      code: row.code,
      spaceType: row.spaceType,
      floor: row.floor ?? "",
      locationDescription: row.locationDescription ?? "",
      areaSqFt: String(row.areaSqFt ?? ""),
      capacityTheatre: String(row.capacityTheatre ?? 0),
      capacityClassroom: String(row.capacityClassroom ?? 0),
      capacityBoardroom: String(row.capacityBoardroom ?? 0),
      capacityUShape: String(row.capacityUShape ?? 0),
      capacityBanquet: String(row.capacityBanquet ?? 0),
      capacityReception: String(row.capacityReception ?? 0),
      notes: row.notes ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function numericFields() {
    const number = (value: string) =>
      value === "" ? undefined : Number(value);
    return {
      name: form.name,
      code: form.code,
      spaceType: form.spaceType,
      floor: form.floor || undefined,
      locationDescription: form.locationDescription || undefined,
      areaSqFt: number(form.areaSqFt),
      capacityTheatre: number(form.capacityTheatre),
      capacityClassroom: number(form.capacityClassroom),
      capacityBoardroom: number(form.capacityBoardroom),
      capacityUShape: number(form.capacityUShape),
      capacityBanquet: number(form.capacityBanquet),
      capacityReception: number(form.capacityReception),
      notes: form.notes || undefined,
    };
  }
  function createPayload() {
    return { hotelId: form.hotelId, ...numericFields() };
  }
  function updatePayload() {
    return numericFields();
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canManage) return;
    setBusy(true);
    setError("");
    try {
      if (editing)
        await apiRequest(`/function-spaces/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(updatePayload()),
        });
      else
        await apiRequest("/function-spaces", {
          method: "POST",
          body: JSON.stringify(createPayload()),
        });
      setMessage(
        editing ? "Function space updated." : "Function space created.",
      );
      setEditing(null);
      setForm({ ...blank, hotelId });
      await loadSpaces();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not save function space",
      );
    } finally {
      setBusy(false);
    }
  }
  async function toggle(
    row: Space,
    field: "active" | "outOfService",
    value: boolean,
  ) {
    if (!canManage) return;
    if (
      field === "outOfService" &&
      value &&
      !window.confirm(
        `${row.name} will be unavailable for new functions. Existing future functions stay scheduled and may need reassignment. Continue?`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const result = await apiRequest<
        Space & { upcomingFunctionCount?: number }
      >(`/function-spaces/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ [field]: value }),
      });
      const warning =
        field === "outOfService" &&
        value &&
        (result.upcomingFunctionCount ?? 0) > 0
          ? ` ${result.upcomingFunctionCount} upcoming function(s) remain scheduled.`
          : "";
      setMessage(
        `${row.name} ${field === "outOfService" ? (value ? "marked out of service." : "returned to service.") : value ? "activated." : "deactivated."}${warning}`,
      );
      await loadSpaces();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not update function space",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="pageSection functionSpacesPage">
      <header className="pageTitle">
        <div>
          <span>Venue operations</span>
          <h1>Function Spaces</h1>
          <p>
            Configure banquet venues, setup capacities, and out-of-service
            controls before scheduling events.
          </p>
        </div>
      </header>
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
      <section className="panel">
        <div className="rangeSectionHeader">
          <div>
            <h2>Space inventory</h2>
            <p className="mutedText">
              Capacity validation uses the selected setup style.
            </p>
          </div>
          <label>
            Hotel
            <select
              value={hotelId}
              disabled={Boolean(profile?.staffHotelId)}
              onChange={(event) => {
                setHotelId(event.target.value);
                setForm({ ...form, hotelId: event.target.value });
              }}
            >
              <option value="">Select hotel</option>
              {hotels.map((hotel) => (
                <option key={hotel.id} value={hotel.id}>
                  {hotel.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {canManage && (
          <form className="formCard spaceForm" onSubmit={save}>
            <div className="rangeSectionHeader">
              <h3>{editing ? "Edit function space" : "Add function space"}</h3>
              {editing && (
                <button
                  type="button"
                  className="smallBtn secondary"
                  onClick={() => {
                    setEditing(null);
                    setForm({ ...blank, hotelId });
                  }}
                >
                  Cancel edit
                </button>
              )}
            </div>
            <div className="three">
              <label>
                Name
                <input
                  required
                  minLength={2}
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                  placeholder="Garden Pavilion"
                />
              </label>
              <label>
                Code
                <input
                  required
                  pattern="[A-Za-z0-9_-]+"
                  value={form.code}
                  onChange={(event) =>
                    setForm({ ...form, code: event.target.value.toUpperCase() })
                  }
                  placeholder="GARDEN"
                />
              </label>
              <label>
                Space type
                <select
                  value={form.spaceType}
                  onChange={(event) =>
                    setForm({ ...form, spaceType: event.target.value })
                  }
                >
                  {types.map((type) => (
                    <option key={type} value={type}>
                      {banquetLabel(type)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Floor
                <input
                  value={form.floor}
                  onChange={(event) =>
                    setForm({ ...form, floor: event.target.value })
                  }
                />
              </label>
              <label>
                Area sq ft
                <input
                  type="number"
                  min="0"
                  value={form.areaSqFt}
                  onChange={(event) =>
                    setForm({ ...form, areaSqFt: event.target.value })
                  }
                />
              </label>
              <label>
                Location
                <input
                  value={form.locationDescription}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      locationDescription: event.target.value,
                    })
                  }
                />
              </label>
              {(
                [
                  ["Theatre", "capacityTheatre"],
                  ["Classroom", "capacityClassroom"],
                  ["Boardroom", "capacityBoardroom"],
                  ["U-shape", "capacityUShape"],
                  ["Banquet", "capacityBanquet"],
                  ["Reception", "capacityReception"],
                ] as const
              ).map(([label, key]) => (
                <label key={key}>
                  {label} capacity
                  <input
                    type="number"
                    min="0"
                    value={form[key]}
                    onChange={(event) =>
                      setForm({ ...form, [key]: event.target.value })
                    }
                  />
                </label>
              ))}
              <label className="wideField">
                Notes
                <textarea
                  value={form.notes}
                  onChange={(event) =>
                    setForm({ ...form, notes: event.target.value })
                  }
                />
              </label>
            </div>
            <div className="formActions">
              <button className="btn" disabled={busy || !form.hotelId}>
                {busy ? "Saving…" : editing ? "Save changes" : "Create space"}
              </button>
            </div>
          </form>
        )}
        <div className="dataTableWrap">
          <table className="dataTable">
            <thead>
              <tr>
                <th>Space</th>
                <th>Type</th>
                <th>Location</th>
                <th>Capacities</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <b>{row.name}</b>
                    <br />
                    <small>{row.code}</small>
                  </td>
                  <td>{row.spaceType}</td>
                  <td>
                    {row.floor || "—"}
                    <br />
                    {row.locationDescription || ""}
                  </td>
                  <td>
                    Theatre {row.capacityTheatre || 0} · Banquet{" "}
                    {row.capacityBanquet || 0}
                    <br />
                    Reception {row.capacityReception || 0}
                  </td>
                  <td>
                    {row.active ? "Active" : "Inactive"}
                    {row.outOfService && (
                      <>
                        <br />
                        <span className="status err">Out of service</span>
                      </>
                    )}
                  </td>
                  <td>
                    {canManage && (
                      <div className="tableActionGroup">
                        <button
                          className="smallBtn"
                          type="button"
                          onClick={() => startEdit(row)}
                        >
                          Edit
                        </button>
                        <button
                          className="smallBtn secondary"
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void toggle(row, "active", !row.active)
                          }
                        >
                          {row.active ? "Deactivate" : "Activate"}
                        </button>
                        <button
                          className="smallBtn secondary"
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void toggle(row, "outOfService", !row.outOfService)
                          }
                        >
                          {row.outOfService
                            ? "Return to service"
                            : "Out of service"}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={6}>
                    <p className="empty">
                      No function spaces configured for this hotel.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
