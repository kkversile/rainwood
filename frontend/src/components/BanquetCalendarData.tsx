"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "../lib/api";
import { useAdminProfile } from "./AdminData";

type Hotel = { id: string; name: string; timezoneName?: string };
type CalendarRow = {
  id: string;
  functionName: string;
  functionDate: string;
  startTime: string;
  endTime: string;
  setupStyle: string;
  expectedPax?: number | null;
  guaranteedPax?: number | null;
  functionSpace: { name: string; code: string };
  banquetEvent: {
    id: string;
    eventCode: string;
    eventName: string;
    status: string;
  };
  readiness: { beo: string; requirements: string };
};
function hotelToday(timeZone?: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone || "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

export function BanquetCalendarData() {
  const { profile } = useAdminProfile();
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [hotelId, setHotelId] = useState("");
  const [from, setFrom] = useState("");
  const [days, setDays] = useState("3");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<CalendarRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const selectedHotel = hotels.find((hotel) => hotel.id === hotelId);
  useEffect(() => {
    void apiRequest<Hotel[]>("/hotels")
      .then((items) => {
        setHotels(items);
        const id = profile?.staffHotelId || items[0]?.id || "";
        setHotelId((value) => value || id);
        setFrom(
          (value) =>
            value ||
            hotelToday(items.find((hotel) => hotel.id === id)?.timezoneName),
        );
      })
      .catch((reason) =>
        setError(
          reason instanceof Error ? reason.message : "Could not load hotels",
        ),
      );
  }, [profile?.staffHotelId]);
  useEffect(() => {
    if (!hotelId) return;
    if (!from) setFrom(hotelToday(selectedHotel?.timezoneName));
    const timer = window.setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams({
        hotelId,
        from: from || hotelToday(selectedHotel?.timezoneName),
        days,
      });
      if (search.trim()) params.set("search", search.trim());
      void apiRequest<{ functions: CalendarRow[] }>(
        `/banquets/calendar?${params}`,
      )
        .then((result) => {
          setRows(result.functions);
          setError("");
        })
        .catch((reason) =>
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not load calendar",
          ),
        )
        .finally(() => setLoading(false));
    }, 120);
    return () => window.clearTimeout(timer);
  }, [hotelId, from, days, search, selectedHotel?.timezoneName]);
  const grouped = rows.reduce<Record<string, CalendarRow[]>>((result, row) => {
    const key = row.functionDate.slice(0, 10);
    (result[key] ||= []).push(row);
    return result;
  }, {});
  return (
    <section className="pageSection banquetCalendarPage">
      <header className="pageTitle">
        <div>
          <span>Hotel operations</span>
          <h1>Function Calendar</h1>
          <p>
            Review scheduled functions chronologically with BEO and
            operational-readiness status.
          </p>
        </div>
        <a className="smallBtn" href="/rainwood/admin/banquets">
          Back to events
        </a>
      </header>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <section className="panel calendarToolbar">
        <label>
          Hotel
          <select
            value={hotelId}
            disabled={Boolean(profile?.staffHotelId)}
            onChange={(event) => {
              const id = event.target.value;
              setHotelId(id);
              setFrom(
                hotelToday(
                  hotels.find((hotel) => hotel.id === id)?.timezoneName,
                ),
              );
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
          From
          <input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>
        <button
          className="smallBtn secondary"
          type="button"
          onClick={() => setFrom(hotelToday(selectedHotel?.timezoneName))}
        >
          Today
        </button>
        <label>
          View
          <select
            value={days}
            onChange={(event) => setDays(event.target.value)}
          >
            <option value="1">Day</option>
            <option value="3">3 days</option>
            <option value="7">7 days</option>
          </select>
        </label>
        <label className="calendarSearch">
          Search
          <input
            placeholder="Event, function, venue"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </section>
      {loading && (
        <p className="notice" role="status">
          Loading function calendar...
        </p>
      )}
      <section className="calendarDays">
        {Object.keys(grouped)
          .sort()
          .map((date) => (
            <article className="calendarDay" key={date}>
              <header>
                <h2>
                  {new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  })}
                </h2>
                <span>
                  {grouped[date].length} function
                  {grouped[date].length === 1 ? "" : "s"}
                </span>
              </header>
              {grouped[date].map((row) => (
                <div className="calendarFunction" key={row.id}>
                  <div className="calendarTime">
                    <b>{row.startTime}</b>
                    <span>{row.endTime}</span>
                  </div>
                  <div>
                    <h3>{row.functionName}</h3>
                    <p>
                      {row.functionSpace.name} - {row.setupStyle} -{" "}
                      {row.expectedPax ?? "-"} expected /{" "}
                      {row.guaranteedPax ?? "-"} guaranteed
                    </p>
                    <p>
                      <a
                        href={`/rainwood/admin/banquets?event=${encodeURIComponent(row.banquetEvent.id)}`}
                      >
                        {row.banquetEvent.eventCode} -{" "}
                        {row.banquetEvent.eventName}
                      </a>
                    </p>
                  </div>
                  <div className="calendarReadiness">
                    <span
                      className={`status ${row.readiness.beo === "FINAL" ? "ok" : "warn"}`}
                    >
                      BEO {row.readiness.beo}
                    </span>
                    <span>Requirements {row.readiness.requirements}</span>
                  </div>
                </div>
              ))}
            </article>
          ))}
        {!loading && !rows.length && (
          <p className="empty">
            No functions are scheduled for the selected dates.
          </p>
        )}
      </section>
    </section>
  );
}
