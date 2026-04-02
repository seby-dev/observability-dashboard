import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

function JsonNull() {
  return <span className="text-slate-500 italic text-xs">null</span>;
}

function JsonBool({ value }: { value: boolean }) {
  return (
    <span className={`text-xs font-mono ${value ? "text-amber-400" : "text-red-400"}`}>
      {value ? "true" : "false"}
    </span>
  );
}

function JsonNumber({ value }: { value: number }) {
  return <span className="text-sky-300 text-xs font-mono">{String(value)}</span>;
}

function JsonString({ value }: { value: string }) {
  return (
    <span className="text-emerald-400 text-xs font-mono">
      &quot;{value}&quot;
    </span>
  );
}

// ---------------------------------------------------------------------------
// Object / Array node (collapsible)
// ---------------------------------------------------------------------------

interface NodeProps {
  value: unknown;
  depth?: number;
}

function JsonNode({ value, depth = 0 }: NodeProps) {
  // Auto-collapse nested structures beyond depth 1
  const [open, setOpen] = useState(depth < 2);

  if (value === null) return <JsonNull />;
  if (typeof value === "boolean") return <JsonBool value={value} />;
  if (typeof value === "number") return <JsonNumber value={value} />;
  if (typeof value === "string") return <JsonString value={value} />;

  const isArray = Array.isArray(value);
  const entries = isArray
    ? (value as unknown[]).map((v, i) => [String(i), v] as [string, unknown])
    : Object.entries(value as Record<string, unknown>);

  const openBrace = isArray ? "[" : "{";
  const closeBrace = isArray ? "]" : "}";
  const summary = `${entries.length} ${isArray ? "item" : "key"}${entries.length !== 1 ? "s" : ""}`;

  return (
    <span>
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-0.5 text-slate-400 hover:text-slate-200 transition-colors"
      >
        {open
          ? <ChevronDown size={11} className="shrink-0" />
          : <ChevronRight size={11} className="shrink-0" />}
        <span className="text-xs font-mono text-slate-500">{openBrace}</span>
      </button>

      {open ? (
        <span>
          <span className="block" style={{ paddingLeft: 16 }}>
            {entries.map(([k, v]) => (
              <span key={k} className="block leading-relaxed">
                {!isArray && (
                  <span className="text-xs font-mono text-slate-400">{k}: </span>
                )}
                {isArray && (
                  <span className="text-xs font-mono text-slate-600 select-none">{k}: </span>
                )}
                <JsonNode value={v} depth={depth + 1} />
              </span>
            ))}
          </span>
          <span className="text-xs font-mono text-slate-500">{closeBrace}</span>
        </span>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="text-xs font-mono text-slate-500 hover:text-slate-300 transition-colors ml-0.5"
        >
          {openBrace} <span className="text-slate-600">{summary}</span> {closeBrace}
        </button>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

interface Props {
  value: Record<string, unknown>;
}

export function JsonTree({ value }: Props) {
  const entries = Object.entries(value);

  return (
    <div className="text-xs font-mono space-y-1">
      {entries.map(([k, v]) => (
        <div key={k} className="flex gap-2 items-start">
          <span className="text-slate-400 shrink-0 pt-px">{k}</span>
          <span className="text-slate-600 shrink-0 pt-px">:</span>
          <span className="min-w-0">
            <JsonNode value={v} depth={0} />
          </span>
        </div>
      ))}
    </div>
  );
}
