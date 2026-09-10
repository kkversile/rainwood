'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

type RainwoodDatePickerProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  minDate?: string;
  accent?: boolean;
};

const monthNames = Array.from({ length: 12 }, (_, month) =>
  new Intl.DateTimeFormat('en-US', { month: 'long' }).format(new Date(Date.UTC(2020, month, 1)))
);

function parseDate(value: string) {
  if (!value) return undefined;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function formatDate(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function monthStart(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addMonths(date: Date, amount: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1));
}

export function RainwoodDatePicker({ label, value, onChange, minDate, accent = false }: RainwoodDatePickerProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const selectedDate = parseDate(value);
  const minimumDate = parseDate(minDate ?? '');
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => monthStart(selectedDate ?? minimumDate ?? new Date()));

  useEffect(() => {
    if (selectedDate) setVisibleMonth(monthStart(selectedDate));
  }, [value]);

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, []);

  const years = useMemo(() => {
    const baseYear = new Date().getUTCFullYear();
    const startYear = Math.min(baseYear - 2, visibleMonth.getUTCFullYear() - 1);
    const endYear = Math.max(baseYear + 8, visibleMonth.getUTCFullYear() + 1);
    return Array.from({ length: endYear - startYear + 1 }, (_, index) => startYear + index);
  }, [visibleMonth]);

  const calendarDays = useMemo(() => {
    const firstDay = monthStart(visibleMonth);
    const firstWeekday = firstDay.getUTCDay();
    const daysInMonth = new Date(Date.UTC(firstDay.getUTCFullYear(), firstDay.getUTCMonth() + 1, 0)).getUTCDate();
    const daysInPreviousMonth = new Date(Date.UTC(firstDay.getUTCFullYear(), firstDay.getUTCMonth(), 0)).getUTCDate();
    return Array.from({ length: 42 }, (_, index) => {
      const dayNumber = index - firstWeekday + 1;
      if (dayNumber < 1) return new Date(Date.UTC(firstDay.getUTCFullYear(), firstDay.getUTCMonth() - 1, daysInPreviousMonth + dayNumber));
      if (dayNumber > daysInMonth) return new Date(Date.UTC(firstDay.getUTCFullYear(), firstDay.getUTCMonth() + 1, dayNumber - daysInMonth));
      return new Date(Date.UTC(firstDay.getUTCFullYear(), firstDay.getUTCMonth(), dayNumber));
    });
  }, [visibleMonth]);

  return <div className="rainwoodDatePicker" ref={wrapperRef}>
    <button type="button" className={`rainwoodDateTrigger${value ? ' hasValue' : ''}${accent && value ? ' selected' : ''}`} aria-label={label} onClick={() => setOpen((current) => !current)}>
      <CalendarDays size={15} aria-hidden="true" />
      <span>{value || label}</span>
    </button>
    {open && <div className="rainwoodDatePopover" role="dialog" aria-label={`${label} calendar`}>
      <div className="rainwoodDatePopoverHeader">
        <span>{label}</span>
        <div className="rainwoodDateSelectors">
          <select aria-label={`${label} Month`} value={visibleMonth.getUTCMonth()} onChange={(event) => setVisibleMonth(new Date(Date.UTC(visibleMonth.getUTCFullYear(), Number(event.target.value), 1)))}>
            {monthNames.map((month, index) => <option key={month} value={index}>{month}</option>)}
          </select>
          <select aria-label={`${label} Year`} value={visibleMonth.getUTCFullYear()} onChange={(event) => setVisibleMonth(new Date(Date.UTC(Number(event.target.value), visibleMonth.getUTCMonth(), 1)))}>
            {years.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </div>
      </div>
      <div className="rainwoodDateCalendarHeader">
        <button type="button" aria-label="Previous month" onClick={() => setVisibleMonth((current) => addMonths(current, -1))}><ChevronLeft size={16} /></button>
        <strong>{monthNames[visibleMonth.getUTCMonth()]} {visibleMonth.getUTCFullYear()}</strong>
        <button type="button" aria-label="Next month" onClick={() => setVisibleMonth((current) => addMonths(current, 1))}><ChevronRight size={16} /></button>
      </div>
      <div className="rainwoodDateWeekdays">{['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="rainwoodDateGrid">{calendarDays.map((day) => {
        const dateValue = formatDate(day);
        const isCurrentMonth = day.getUTCMonth() === visibleMonth.getUTCMonth();
        const isSelected = dateValue === value;
        const isDisabled = Boolean(minimumDate && day < minimumDate);
        return <button type="button" key={dateValue} className={`${isCurrentMonth ? '' : 'outsideMonth '}${isSelected ? 'selectedDay' : ''}`} disabled={isDisabled} onClick={() => { onChange(dateValue); setVisibleMonth(monthStart(day)); setOpen(false); }}>{day.getUTCDate()}</button>;
      })}</div>
    </div>}
  </div>;
}
