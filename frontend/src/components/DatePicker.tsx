import { useState, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";

interface Props {
  value: string;           // YYYY-MM-DD or ""
  onChange: (val: string) => void;
  min?: string;            // YYYY-MM-DD
  max?: string;            // YYYY-MM-DD
  placeholder?: string;
  alignRight?: boolean;    // open dropdown to the right edge
}

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DAY_HEADERS = ["Mo","Tu","We","Th","Fr","Sa","Su"];

function parseLocalDate(s: string): Date {
  if (!s) return new Date();
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toYMD(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function DatePicker({
  value,
  onChange,
  min,
  max,
  placeholder = "Select date",
  alignRight = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const initDate = parseLocalDate(value);
  const [viewYear, setViewYear] = useState(initDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initDate.getMonth());

  // Sync view when value changes externally
  useEffect(() => {
    if (value) {
      const d = parseLocalDate(value);
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
  }, [value]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  const daysInMonth  = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstWeekDay = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7; // 0=Mon

  const displayValue = value
    ? parseLocalDate(value).toLocaleDateString("en-GB", {
        day: "2-digit", month: "short", year: "numeric",
      })
    : placeholder;

  const navBtn: React.CSSProperties = {
    display: "flex", alignItems: "center", justifyContent: "center",
    width: 26, height: 26, borderRadius: 6,
    background: "var(--bg-hover)", border: "1px solid var(--border)",
    color: "var(--text-2)", cursor: "pointer", flexShrink: 0,
  };

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      {/* Trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          background: "var(--bg-deep)",
          border: `1px solid ${open ? "var(--indigo)" : "var(--border)"}`,
          borderRadius: 6,
          color: value ? "var(--text-1)" : "var(--text-3)",
          fontSize: 12, padding: "4px 10px",
          fontFamily: "inherit", cursor: "pointer",
          outline: open ? "1px solid rgba(99,102,241,0.3)" : "none",
          outlineOffset: 1,
          transition: "border-color 0.15s",
        }}
      >
        <CalendarDays size={12} style={{ color: "var(--text-3)", flexShrink: 0 }} />
        {displayValue}
      </button>

      {/* Dropdown calendar */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            ...(alignRight ? { right: 0 } : { left: 0 }),
            zIndex: 200,
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: 14,
            boxShadow: "0 12px 32px rgba(0,0,0,0.25)",
            width: 230,
          }}
        >
          {/* Month navigation */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <button onClick={prevMonth} style={navBtn}>
              <ChevronLeft size={13} />
            </button>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-1)" }}>
              {MONTHS[viewMonth]} {viewYear}
            </span>
            <button onClick={nextMonth} style={navBtn}>
              <ChevronRight size={13} />
            </button>
          </div>

          {/* Day-of-week headers */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
            {DAY_HEADERS.map(d => (
              <div key={d} style={{
                textAlign: "center", fontSize: 10, fontWeight: 600,
                color: "var(--text-3)", padding: "2px 0",
              }}>
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
            {/* Offset empty cells */}
            {Array.from({ length: firstWeekDay }).map((_, i) => (
              <div key={`e${i}`} />
            ))}

            {/* Day buttons */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const ds   = toYMD(viewYear, viewMonth, day);
              const disabled = (min != null && ds < min) || (max != null && ds > max);
              const selected  = ds === value;
              const isToday   = ds === new Date().toISOString().slice(0, 10);

              return (
                <button
                  key={day}
                  disabled={disabled}
                  onClick={() => { onChange(ds); setOpen(false); }}
                  style={{
                    height: 28, borderRadius: 6, border: "none",
                    background: selected
                      ? "var(--indigo)"
                      : isToday
                      ? "rgba(99,102,241,0.12)"
                      : "transparent",
                    color: selected
                      ? "#fff"
                      : disabled
                      ? "var(--text-3)"
                      : isToday
                      ? "var(--indigo)"
                      : "var(--text-1)",
                    fontSize: 12,
                    fontWeight: selected || isToday ? 600 : 400,
                    cursor: disabled ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                    opacity: disabled ? 0.35 : 1,
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => {
                    if (!disabled && !selected)
                      (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
                  }}
                  onMouseLeave={(e) => {
                    if (!disabled && !selected)
                      (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
