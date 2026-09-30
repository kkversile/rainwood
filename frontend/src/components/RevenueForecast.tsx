"use client";

import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../lib/api";
import { useAdminProfile } from "./AdminData";

const REVENUE_FORECAST_HORIZON_DAYS = 90;
type Hotel = { id: string; name: string; timezoneName?: string };
type Completion = {
  available: boolean;
  ratio?: number;
  leadTimeDays?: number;
  sampleSize: number;
  comparisonLevel?: string;
  confidence?: "LOW" | "MEDIUM" | "HIGH";
  reason?: string;
  historicalMedianOtbAtLead?: number;
  samples?: Array<{
    stayDate: string;
    finalRooms: number;
    bookedRooms: number;
    completionRatio: number;
    leadTimeDays: number;
  }>;
  dataQuality?: {
    excludedZeroFinal: number;
    excludedMissingSnapshot: number;
    clampedRatios: number;
    leadToleranceDays: number;
  };
};
type Recommendation = {
  type:
    | "HOLD_RATE"
    | "REVIEW_UPWARD"
    | "REVIEW_STRONG_UPWARD"
    | "REVIEW_SOFT_DEMAND"
    | "INSUFFICIENT_DATA";
  severity: string;
  title: string;
  currentRate: number | null;
  suggestedRateRange: { min: number; max: number } | null;
  reasons: string[];
  pickupStrength: "WEAK" | "NORMAL" | "STRONG" | "UNKNOWN";
  pickup7dPercentOfSellable: number | null;
  manualReviewRequired: boolean;
  rateContext: "SINGLE_RATE" | "MULTIPLE_RATES" | "UNAVAILABLE";
  dataQuality: {
    forecastAvailable: boolean;
    confidence: "LOW" | "MEDIUM" | "HIGH" | null;
    sampleSize: number;
  };
};
type ForecastRow = {
  stayDate: string;
  daysToArrival: number;
  available: boolean;
  sellableRooms: number | null;
  bookedRooms: number | null;
  heldRooms: number | null;
  roomRevenue: number | null;
  adr: number | null;
  occupancyPercent: number | null;
  projectedBookedRooms: number | null;
  demandSignal: string;
  forecastDemandSignal: string;
  completion: Completion;
  forecast: {
    finalRooms: number;
    occupancyPercent: number | null;
    remainingDemandRooms: number;
    revenue: number | null;
    revenueReason?: string;
  } | null;
  recommendation: Recommendation;
  paceComparison: {
    status: string;
    differenceRooms: number | null;
    historicalMedianOtbAtLead: number | null;
  };
  signals: string[];
  pickup: Record<string, number | null>;
  pickupRevenue: Record<string, number | null>;
  pace: Record<string, number | null>;
  revenuePace: Record<string, number | null>;
};
type RoomTypeTotal = {
  roomTypeId: string;
  roomType: string;
  sellableRoomNights: number;
  bookedRoomNights: number;
  heldRoomNights: number;
  roomRevenue: number;
  adr: number;
};
type Forecast = {
  hotel: Hotel & { timezoneName: string };
  roomTypeId?: string | null;
  observationDate: string;
  observationSource: "LIVE" | "SNAPSHOT";
  from: string;
  to: string;
  pickupWindows: number[];
  forecastPolicy?: {
    formula: string;
    minimumSampleSize: number;
    revenue: string;
  };
  rateContext?: unknown;
  summary: {
    availableDateCount: number;
    requestedDateCount: number;
    sellableRooms: number;
    bookedRooms: number;
    heldRooms: number;
    roomRevenue: number;
    occupancyPercent: number | null;
    headline: ForecastRow | null;
  };
  roomTypes: RoomTypeTotal[];
  rows: ForecastRow[];
};
export type CurveObservation = {
  observationDate: string;
  daysBeforeArrival: number;
  bookedRooms: number;
  heldRooms: number;
  roomRevenue: number;
  adr: number;
  sellableRooms: number;
  source: "SNAPSHOT" | "LIVE";
};
type RateContextRow = {
  roomTypeId: string;
  ratePlanId: string;
  ratePlan: string;
  baseRate: number;
  manualOverride: number | null;
  season: {
    id: string;
    name: string;
    adjustmentType: string;
    adjustmentValue: number;
  } | null;
  yield: {
    id: string;
    name: string;
    occupancyPercent: number;
    adjustmentType: string;
    adjustmentValue: number;
  } | null;
  effectivePrePromoRate: number;
  source: string;
  note: string;
};
type RateContext = {
  available: boolean;
  multipleRates?: boolean;
  reason?: string;
  rows?: RateContextRow[];
};
type BookingCurve = {
  stayDate: string;
  roomTypeId: string | null;
  sellableRooms: number | null;
  observations: CurveObservation[];
  completion: Completion;
  historicalSource: string;
  livePointIncluded: boolean;
  rateContext?: RateContext;
};
export type RevenueForecastScopeProfile = {
  role: string;
  staffHotelId?: string | null;
};
export function scopedRevenueForecastHotels(
  profile: RevenueForecastScopeProfile,
  hotels: Hotel[],
) {
  return profile.role === "ADMIN"
    ? profile.staffHotelId
      ? hotels.filter((hotel) => hotel.id === profile.staffHotelId)
      : []
    : hotels;
}

export function bookingCurveX(
  daysBeforeArrival: number,
  observations: Array<Pick<CurveObservation, "daysBeforeArrival">>,
  left = 4,
  right = 96,
) {
  const leads = observations
    .map((observation) => Number(observation.daysBeforeArrival))
    .filter((value) => Number.isFinite(value) && value >= 0);
  const value = Number(daysBeforeArrival);
  if (!leads.length || !Number.isFinite(value)) return (left + right) / 2;
  const maxLead = Math.max(...leads);
  const minLead = Math.min(...leads);
  const span = maxLead - minLead;
  return span === 0
    ? (left + right) / 2
    : left +
        ((maxLead - Math.max(minLead, Math.min(maxLead, Math.max(0, value)))) /
          span) *
          (right - left);
}

export function bookingCurveAxisLabels(
  observations: Array<Pick<CurveObservation, "daysBeforeArrival">>,
  candidates = [90, 60, 30, 14, 7, 0],
) {
  const leads = observations
    .map((observation) => Number(observation.daysBeforeArrival))
    .filter((value) => Number.isFinite(value) && value >= 0);
  if (!leads.length) return [];
  const maxLead = Math.max(...leads);
  const minLead = Math.min(...leads);
  return candidates
    .filter((value) => value >= minLead && value <= maxLead)
    .map((value) => ({ value, x: bookingCurveX(value, observations) }));
}

const dateInZone = (timezone: string, value = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
};
const shiftDate = (value: string, days: number) => {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const money = (value: number | null) =>
  value === null
    ? "Unavailable"
    : `INR ${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pickupValue = (
  row: ForecastRow | null | undefined,
  window: number,
  field: "pickup" | "pickupRevenue",
) => row?.[field]?.[String(window)] ?? null;
export const recommendationLabel = (recommendation: Pick<Recommendation, "type">) => recommendation.type === "REVIEW_STRONG_UPWARD" ? "Review upward" : recommendation.type === "REVIEW_UPWARD" ? "Review rate" : recommendation.type === "REVIEW_SOFT_DEMAND" ? "Soft demand" : recommendation.type === "INSUFFICIENT_DATA" ? "Insufficient data" : "Hold rate";
const recommendationClass = (recommendation: Recommendation) => recommendation.type === "REVIEW_STRONG_UPWARD" ? "warn" : recommendation.type === "REVIEW_UPWARD" ? "ok" : recommendation.type === "REVIEW_SOFT_DEMAND" ? "noticeStatus" : "";

export function RevenueForecast() {
  const { profile, loading: profileLoading } = useAdminProfile();
  const canView = ["SUPER_ADMIN", "CORPORATE_ADMIN", "ADMIN"].includes(
    profile?.role ?? "",
  );
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [hotelId, setHotelId] = useState("");
  const [roomTypeId, setRoomTypeId] = useState("");
  const [observationDate, setObservationDate] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<Forecast | null>(null);
  const [scopeLoading, setScopeLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [curve, setCurve] = useState<BookingCurve | null>(null);
  const [curveRow, setCurveRow] = useState<ForecastRow | null>(null);
  const [curveLoading, setCurveLoading] = useState(false);
  const [curveError, setCurveError] = useState("");

  useEffect(() => {
    if (!canView || profileLoading) return;
    let cancelled = false;
    async function loadScope() {
      setScopeLoading(true);
      setError("");
      setData(null);
      try {
        if (profile?.role === "ADMIN" && !profile.staffHotelId)
          throw new Error(
            "Your account has no assigned hotel for Revenue Forecast access.",
          );
        const allHotels = await apiRequest<Hotel[]>("/hotels");
        if (cancelled) return;
        const visibleHotels = scopedRevenueForecastHotels(profile!, allHotels);
        if (!visibleHotels.length)
          throw new Error(
            profile?.role === "ADMIN"
              ? "Your assigned hotel is unavailable or inactive."
              : "No active hotel is available for Revenue Forecast.",
          );
        const selected =
          profile?.role === "ADMIN" ? visibleHotels[0] : visibleHotels[0];
        setHotels(visibleHotels);
        setHotelId(selected.id);
        const today = dateInZone(selected.timezoneName ?? "Asia/Kolkata");
        setObservationDate(today);
        setFrom(today);
        setTo(shiftDate(today, 14));
      } catch (reason) {
        if (!cancelled)
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not verify Revenue Forecast hotel scope.",
          );
      } finally {
        if (!cancelled) setScopeLoading(false);
      }
    }
    void loadScope();
    return () => {
      cancelled = true;
    };
  }, [canView, profileLoading, profile?.role, profile?.staffHotelId]);

  const query = useMemo(
    () =>
      new URLSearchParams({
        hotelId,
        ...(roomTypeId ? { roomTypeId } : {}),
        observationDate,
        from,
        to,
        horizon: String(REVENUE_FORECAST_HORIZON_DAYS),
        pickupWindows: "1,3,7,14,30",
      }).toString(),
    [hotelId, roomTypeId, observationDate, from, to],
  );
  useEffect(() => {
    if (
      !canView ||
      scopeLoading ||
      !hotelId ||
      !observationDate ||
      !from ||
      !to
    )
      return;
    setLoading(true);
    setError("");
    apiRequest<Forecast>(`/revenue-forecast?${query}`)
      .then(setData)
      .catch((reason: Error) => {
        setData(null);
        setError(reason.message);
      })
      .finally(() => setLoading(false));
  }, [canView, scopeLoading, hotelId, roomTypeId, observationDate, from, to, query]);
  const changeHotel = (value: string) => {
    const hotel = hotels.find((item) => item.id === value);
    setHotelId(value);
    if (hotel) {
      const today = dateInZone(hotel.timezoneName ?? "Asia/Kolkata");
      setObservationDate(today);
      setFrom(today);
      setTo(shiftDate(today, 14));
    }
  };
  const headline = data?.summary.headline ?? data?.rows[0] ?? null;
  const openCurve = async (row: ForecastRow) => {
    setCurveRow(row);
    setCurve(null);
    setCurveError("");
    setCurveLoading(true);
    try {
      setCurve(
        await apiRequest<BookingCurve>(
          `/revenue-management/booking-curve?${new URLSearchParams({ hotelId, stayDate: row.stayDate, ...(roomTypeId ? { roomTypeId } : {}) }).toString()}`,
        ),
      );
    } catch (reason) {
      setCurveError(
        reason instanceof Error
          ? reason.message
          : "Could not load booking curve.",
      );
    } finally {
      setCurveLoading(false);
    }
  };
  const closeCurve = () => {
    setCurve(null);
    setCurveRow(null);
    setCurveError("");
  };
  const curveMax = Math.max(
    1,
    ...(curve?.observations.map((observation) =>
      Math.max(observation.bookedRooms, observation.sellableRooms),
    ) ?? []),
  );
  const curvePoints =
    curve?.observations.map((observation) => {
      const x = bookingCurveX(
        observation.daysBeforeArrival,
        curve.observations,
      );
      const y = 96 - (observation.bookedRooms / curveMax) * 82;
      return { ...observation, x, y };
    }) ?? [];
  const curveAxisLabels = curve
    ? bookingCurveAxisLabels(curve.observations)
    : [];
  if (!canView && !profileLoading)
    return (
      <section className="pageSection">
        <p className="hint">
          Revenue Forecast access is limited to management roles.
        </p>
      </section>
    );
  return (
    <section className="pageSection revenueForecastPage">
      <header className="pageTitle">
        <div>
          <span>Revenue intelligence</span>
          <h1>Revenue Forecast</h1>
          <p>
            Current open business day is calculated live. Historical
            observations use immutable Night Audit snapshots. This page never
            changes rates or writes to external channels.
          </p>
        </div>
      </header>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {profileLoading || scopeLoading ? (
        <section className="panel">
          <p className="loading">Checking authorized hotel scope…</p>
        </section>
      ) : !hotelId ? null : (
        <>
          <section className="panel revenueForecastFilters">
            <div className="managementFilterGrid">
              <label>
                Hotel
                <select
                  value={hotelId}
                  onChange={(event) => changeHotel(event.target.value)}
                  disabled={profile?.role === "ADMIN"}
                >
                  {hotels.map((hotel) => (
                    <option key={hotel.id} value={hotel.id}>
                      {hotel.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Room type context
                <select value={roomTypeId} onChange={(event) => setRoomTypeId(event.target.value)}>
                  <option value="">Hotel total</option>
                  {data?.roomTypes.map((roomType) => <option key={roomType.roomTypeId} value={roomType.roomTypeId}>{roomType.roomType}</option>)}
                </select>
              </label>
              <label>
                Observation date
                <input
                  type="date"
                  value={observationDate}
                  onChange={(event) => setObservationDate(event.target.value)}
                />
              </label>
              <label>
                Stay from
                <input
                  type="date"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                />
              </label>
              <label>
                Stay to
                <input
                  type="date"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                />
              </label>
            </div>
            <p className="hint">
              Official immutable snapshots are created by Night Audit. Manual
              snapshot capture is restricted to SUPER_ADMIN recovery.
            </p>
          </section>
          {loading && <p className="loading">Loading forecast…</p>}
          {data && (
            <>
              <section className="revenueForecastSummary">
                <div>
                  <strong>{data.observationSource}</strong>
                  <span>Observation source</span>
                </div>
                <div>
                  <strong>
                    {headline?.occupancyPercent === null ||
                    headline?.occupancyPercent === undefined
                      ? "Unavailable"
                      : `${headline.occupancyPercent}%`}
                  </strong>
                  <span>OTB occupancy</span>
                </div>
                <div>
                  <strong>{money(headline?.roomRevenue ?? null)}</strong>
                  <span>OTB revenue</span>
                </div>
                <div>
                  <strong>{money(headline?.adr ?? null)}</strong>
                  <span>ADR</span>
                </div>
                <div>
                  <strong>
                    {pickupValue(headline, 7, "pickup") ?? "Unavailable"}
                  </strong>
                  <span>Pickup 7D rooms</span>
                </div>
                <div>
                  <strong>
                    {money(pickupValue(headline, 7, "pickupRevenue"))}
                  </strong>
                  <span>Revenue pickup 7D</span>
                </div>
                <div>
                  <strong>
                    {pickupValue(headline, 30, "pickup") ?? "Unavailable"}
                  </strong>
                  <span>Pickup 30D rooms</span>
                </div>
                <div>
                  <strong>
                    {money(pickupValue(headline, 30, "pickupRevenue"))}
                  </strong>
                  <span>Revenue pickup 30D</span>
                </div>
              </section>
              {data.summary.availableDateCount <
                data.summary.requestedDateCount && (
                <p className="notice">
                  Some dates are unavailable because no authoritative data
                  exists for the selected observation. Historical data is never
                  reconstructed from today&apos;s reservations.
                </p>
              )}
              <section className="panel">
                <div className="listToolbar">
                  <div>
                    <span>Booking curve inputs</span>
                    <h2>OTB, pickup &amp; pace</h2>
                    <p>
                      Pickup retains negative values from cancellations or
                      modifications. Select a future stay date for its immutable
                      booking curve and transparent completion forecast.
                    </p>
                  </div>
                  <span
                    className={`status ${data.observationSource === "LIVE" ? "ok" : "warn"}`}
                  >
                    {data.observationSource}
                  </span>
                </div>
                <div className="tableScroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Sellable</th>
                        <th>OTB rooms</th>
                        <th>OTB %</th>
                        <th>Held</th>
                        <th>Pickup 7D</th>
                        <th>Revenue pickup 7D</th>
                        <th>OTB revenue</th>
                        <th>ADR</th>
                        <th>Forecast</th>
                        <th>Recommendation</th>
                        <th>Pace</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows.map((row) => (
                        <tr
                          key={row.stayDate}
                          className="forecastClickableRow"
                          onClick={() => void openCurve(row)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              void openCurve(row);
                            }
                          }}
                          tabIndex={0}
                          aria-label={`Open booking curve for ${row.stayDate}`}
                        >
                          <td>
                            <b>{row.stayDate}</b>
                            <small>
                              {row.daysToArrival >= 0
                                ? `${row.daysToArrival} days to arrival`
                                : "Past stay date"}
                            </small>
                          </td>
                          <td>{row.sellableRooms ?? "Unavailable"}</td>
                          <td>{row.bookedRooms ?? "Unavailable"}</td>
                          <td>
                            {row.occupancyPercent === null
                              ? "Unavailable"
                              : `${row.occupancyPercent}%`}
                          </td>
                          <td>{row.heldRooms ?? "Unavailable"}</td>
                          <td>
                            {pickupValue(row, 7, "pickup") ?? "Unavailable"}
                          </td>
                          <td>{money(pickupValue(row, 7, "pickupRevenue"))}</td>
                          <td>{money(row.roomRevenue)}</td>
                          <td>{money(row.adr)}</td>
                          <td>
                            <span
                              className={`status ${row.forecastDemandSignal === "COMPRESSION" ? "warn" : row.forecastDemandSignal === "UNAVAILABLE" ? "" : "ok"}`}
                            >
                              {row.forecast
                                ? `${row.forecast.finalRooms} rooms`
                                : "Unavailable"}
                            </span>
                            <small className="forecastSignalText">
                              {row.forecast
                                ? `${row.forecast.occupancyPercent}% · ${row.completion.confidence ?? "LOW"} confidence`
                                : row.completion.reason ===
                                    "INSUFFICIENT_HISTORY"
                                  ? "Insufficient comparable history"
                                  : "No final-demand forecast"}
                            </small>
                          </td>
                          <td>
                            <span className={`status ${recommendationClass(row.recommendation)}`}>
                              {recommendationLabel(row.recommendation)}
                            </span>
                            <small className="forecastSignalText">
                              {row.recommendation.suggestedRateRange
                                ? `${money(row.recommendation.suggestedRateRange.min)}–${money(row.recommendation.suggestedRateRange.max)}`
                                : row.recommendation.rateContext === "MULTIPLE_RATES"
                                  ? "Multiple active rates"
                                  : row.recommendation.manualReviewRequired
                                    ? "Manual review required"
                                    : "Decision support only"}
                            </small>
                          </td>
                          <td>
                            <span
                              className={`status ${row.paceComparison.status === "AHEAD" ? "warn" : row.paceComparison.status === "UNAVAILABLE" ? "" : "ok"}`}
                            >
                              {row.paceComparison.status}
                            </span>
                            <small className="forecastSignalText">
                              {row.paceComparison.differenceRooms === null
                                ? "Unavailable"
                                : `${row.paceComparison.differenceRooms > 0 ? "+" : ""}${row.paceComparison.differenceRooms} rooms`}
                            </small>
                          </td>
                        </tr>
                      ))}
                      {!data.rows.length && (
                        <tr>
                          <td colSpan={12} className="empty">
                            No stay dates selected.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="panel">
                <div className="listToolbar">
                  <div>
                    <span>Period totals</span>
                    <h2>Room type breakdown</h2>
                    <p>
                      Totals cover the selected stay-date range. ADR is room
                      revenue divided by booked room nights.
                    </p>
                  </div>
                </div>
                <div className="tableScroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Room type</th>
                        <th>Sellable room nights</th>
                        <th>Booked room nights</th>
                        <th>Held room nights</th>
                        <th>Revenue</th>
                        <th>ADR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.roomTypes.map((row) => (
                        <tr key={row.roomTypeId}>
                          <td>{row.roomType}</td>
                          <td>{row.sellableRoomNights}</td>
                          <td>{row.bookedRoomNights}</td>
                          <td>{row.heldRoomNights}</td>
                          <td>{money(row.roomRevenue)}</td>
                          <td>{money(row.adr)}</td>
                        </tr>
                      ))}
                      {!data.roomTypes.length && (
                        <tr>
                          <td colSpan={6} className="empty">
                            No room-type totals are available.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
              {curveRow && (
                <div
                  className="bookingCurveBackdrop"
                  role="presentation"
                  onClick={(event) => {
                    if (event.target === event.currentTarget) closeCurve();
                  }}
                >
                  <section
                    className="bookingCurveDialog"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="booking-curve-title"
                  >
                    <header>
                      <div>
                        <span>Revenue intelligence</span>
                        <h2 id="booking-curve-title">
                          Booking Curve · {curveRow.stayDate}
                        </h2>
                        <p>
                          Historical points come only from immutable Revenue
                          Forecast snapshots. The current point is live and is
                          never persisted as a fake snapshot.
                        </p>
                      </div>
                      <button
                        className="smallBtn"
                        type="button"
                        onClick={closeCurve}
                      >
                        Close
                      </button>
                    </header>
                    {curveLoading && (
                      <p className="loading">Loading booking curve…</p>
                    )}
                    {curveError && (
                      <p className="error" role="alert">
                        {curveError}
                      </p>
                    )}
                    {curve && (
                      <div className="bookingCurveBody">
                        <div className="bookingCurveSummary">
                          <div>
                            <span>Current OTB</span>
                            <strong>
                              {curveRow.bookedRooms ?? "Unavailable"}
                            </strong>
                          </div>
                          <div>
                            <span>Days to arrival</span>
                            <strong>{curveRow.daysToArrival}</strong>
                          </div>
                          <div>
                            <span>Historical completion</span>
                            <strong>
                              {curve.completion.available
                                ? `${Number(curve.completion.ratio) * 100}%`
                                : "Unavailable"}
                            </strong>
                          </div>
                          <div>
                            <span>Comparable dates</span>
                            <strong>{curve.completion.sampleSize}</strong>
                          </div>
                          <div>
                            <span>Forecast final rooms</span>
                            <strong>
                              {curveRow.forecast?.finalRooms ?? "Unavailable"}
                            </strong>
                          </div>
                          <div>
                            <span>Remaining demand</span>
                            <strong>
                              {curveRow.forecast?.remainingDemandRooms ??
                                "Unavailable"}
                            </strong>
                          </div>
                          <div>
                            <span>Forecast occupancy</span>
                            <strong>
                              {curveRow.forecast?.occupancyPercent === null ||
                              curveRow.forecast?.occupancyPercent === undefined
                                ? "Unavailable"
                                : `${curveRow.forecast.occupancyPercent}%`}
                            </strong>
                          </div>
                          <div>
                            <span>Confidence</span>
                            <strong>
                              {curve.completion.confidence ?? "Unavailable"}
                            </strong>
                          </div>
                        </div>
                        <section className="bookingRecommendationPanel">
                          <div className="bookingCurveChartHeader">
                            <b>Revenue Recommendation</b>
                            <span>No automatic action</span>
                          </div>
                          <h3>{curveRow.recommendation.title}</h3>
                          <div className="bookingRecommendationFacts">
                            <div><span>Current Pre-Promo Rate</span><strong>{money(curveRow.recommendation.currentRate)}</strong></div>
                            <div><span>Suggested Review Range</span><strong>{curveRow.recommendation.suggestedRateRange ? `${money(curveRow.recommendation.suggestedRateRange.min)}–${money(curveRow.recommendation.suggestedRateRange.max)}` : "No automatic range"}</strong></div>
                            <div><span>Confidence</span><strong>{curveRow.recommendation.dataQuality.confidence ?? "Unavailable"} · {curveRow.recommendation.dataQuality.sampleSize} comparable dates</strong></div>
                          </div>
                          <p className="hint">Revenue recommendations are decision-support guidance based on current OTB, pickup, booking pace, and historical completion patterns. Rates are not changed automatically.</p>
                          {curveRow.recommendation.manualReviewRequired && <p className="notice">A manual rate override is active. Review manually before changing pricing.</p>}
                          <ul>{curveRow.recommendation.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
                        </section>
                        <section className="bookingCurveRateContext">
                          <div className="bookingCurveChartHeader">
                            <b>Current Rate Context</b>
                            <span>Pre-Promotion Sell Rate</span>
                          </div>
                          {!curve.rateContext?.available && (
                            <p className="empty">
                              {curve.rateContext?.reason ??
                                "Rate context unavailable."}
                            </p>
                          )}
                          {curve.rateContext?.multipleRates && (
                            <p className="notice">
                              Multiple active rates apply at hotel level. Select
                              a room type for a single rate context.
                            </p>
                          )}
                          {curve.rateContext?.rows?.map((row) => (
                            <div
                              className="bookingCurveRateRow"
                              key={`${row.roomTypeId}-${row.ratePlanId}`}
                            >
                              <div>
                                <b>{row.ratePlan}</b>
                                <small>
                                  {row.source} ·{" "}
                                  {row.season
                                    ? `Season: ${row.season.name}`
                                    : "No season"}{" "}
                                  ·{" "}
                                  {row.yield
                                    ? `Yield: ${row.yield.name} at ${row.yield.occupancyPercent}% occupancy`
                                    : "No yield rule"}
                                </small>
                              </div>
                              <strong>
                                {money(row.effectivePrePromoRate)}
                              </strong>
                            </div>
                          ))}
                        </section>
                        <div className="bookingCurveChart">
                          <div className="bookingCurveChartHeader">
                            <b>OTB rooms by days before arrival</b>
                            <span>
                              {curve.livePointIncluded
                                ? "LIVE point included"
                                : "No live point for this stay date"}
                            </span>
                          </div>
                          {curve.observations.length ? (
                            <svg
                              viewBox="0 0 100 100"
                              role="img"
                              aria-label="Booking curve chart"
                            >
                              <line x1="4" x2="96" y1="96" y2="96" />
                              <line x1="4" x2="4" y1="14" y2="96" />
                              {curveAxisLabels.map((label) => (
                                <text
                                  key={label.value}
                                  x={label.x}
                                  y="99"
                                  textAnchor="middle"
                                >
                                  {label.value}
                                </text>
                              ))}
                              {curvePoints.length > 1 && (
                                <polyline
                                  points={curvePoints
                                    .map((point) => `${point.x},${point.y}`)
                                    .join(" ")}
                                />
                              )}
                              {curvePoints.map((point) => (
                                <g
                                  key={`${point.observationDate}-${point.source}`}
                                >
                                  <circle
                                    className={
                                      point.source === "LIVE"
                                        ? "bookingCurveLivePoint"
                                        : ""
                                    }
                                    cx={point.x}
                                    cy={point.y}
                                    r="2.2"
                                  />
                                  <title>{`${point.observationDate} · ${point.daysBeforeArrival} days before · ${point.bookedRooms} rooms · ${money(point.roomRevenue)} revenue · ${money(point.adr)} ADR · ${point.source}`}</title>
                                </g>
                              ))}
                            </svg>
                          ) : (
                            <p className="empty">
                              No immutable observations exist for this stay
                              date.
                            </p>
                          )}
                          <div className="bookingCurveLegend">
                            <span>
                              <i />
                              Historical snapshot
                            </span>
                            <span>
                              <i className="live" />
                              Current LIVE point
                            </span>
                          </div>
                        </div>
                        <div className="bookingCurveMeta">
                          <p>
                            <b>Comparison:</b>{" "}
                            {curve.completion.comparisonLevel ?? "Unavailable"}{" "}
                            · lead bucket{" "}
                            {curve.completion.leadTimeDays ??
                              curveRow.daysToArrival}{" "}
                            days
                          </p>
                          <p>
                            <b>Pace:</b> {curveRow.paceComparison.status}{" "}
                            {curveRow.paceComparison.differenceRooms === null
                              ? ""
                              : `(${curveRow.paceComparison.differenceRooms > 0 ? "+" : ""}${curveRow.paceComparison.differenceRooms} rooms versus historical median)`}
                          </p>
                          <p>
                            <b>Historical source:</b> {curve.historicalSource}.
                            No guest or reservation PII is included.
                          </p>
                          {curve.completion.reason ===
                            "INSUFFICIENT_HISTORY" && (
                            <p className="notice">
                              <b>Forecast unavailable:</b> at least 5 comparable
                              closed stay dates with a matching snapshot lead
                              time are required. Current OTB and pace remain
                              visible.
                            </p>
                          )}
                          {curve.completion.samples?.length ? (
                            <details>
                              <summary>View comparable dates</summary>
                              <table>
                                <thead>
                                  <tr>
                                    <th>Stay date</th>
                                    <th>Final rooms</th>
                                    <th>OTB at lead</th>
                                    <th>Completion</th>
                                    <th>Matched lead</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {curve.completion.samples.map((sample) => (
                                    <tr key={sample.stayDate}>
                                      <td>{sample.stayDate}</td>
                                      <td>{sample.finalRooms}</td>
                                      <td>{sample.bookedRooms}</td>
                                      <td>
                                        {Number(sample.completionRatio) * 100}%
                                      </td>
                                      <td>{sample.leadTimeDays} days</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </details>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </section>
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
