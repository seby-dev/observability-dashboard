import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { ChevronDown, Sun, Moon } from "lucide-react";
import { api } from "./api/client";
import { Dashboard } from "./pages/Dashboard";
import { RunDetail } from "./pages/RunDetail";

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });

// ─── Theme helpers ───────────────────────────────────────────────────────────

type Theme = "dark" | "light";

function applyTheme(t: Theme) {
  if (t === "light") {
    document.documentElement.dataset.theme = "light";
  } else {
    delete document.documentElement.dataset.theme;
  }
  localStorage.setItem("theme", t);
}

// ─── Project selector ────────────────────────────────────────────────────────

function ProjectSelector({
  projectId,
  setProjectId,
}: {
  projectId: string;
  setProjectId: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const projects = useQuery({ queryKey: ["projects"], queryFn: api.projects });
  const current = projects.data?.find((p) => p.id === projectId);

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          background: "var(--bg-hover)",
          border: "1px solid var(--border)",
          color: "var(--text-1)",
          borderRadius: 8,
          padding: "6px 12px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 13,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        <span>{current?.name ?? projectId}</span>
        <ChevronDown size={13} style={{ color: "var(--text-2)" }} />
      </button>
      {open && projects.data && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 4px)",
            zIndex: 50,
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            minWidth: 160,
            boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
          }}
        >
          {projects.data.map((p) => (
            <button
              key={p.id}
              onClick={() => { setProjectId(p.id); setOpen(false); }}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "8px 14px",
                fontSize: 13,
                color: p.id === projectId ? "var(--indigo)" : "var(--text-1)",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Theme toggle button ──────────────────────────────────────────────────────

function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 34,
        height: 34,
        borderRadius: 8,
        background: "var(--bg-hover)",
        border: "1px solid var(--border)",
        color: "var(--text-2)",
        cursor: "pointer",
        flexShrink: 0,
        transition: "color 0.15s, background 0.15s",
      }}
    >
      {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
}

// ─── Shell ────────────────────────────────────────────────────────────────────

function Shell() {
  const projects = useQuery({ queryKey: ["projects"], queryFn: api.projects });
  const [projectId, setProjectId] = useState<string | null>(null);
  const activeProject = projectId ?? projects.data?.[0]?.id ?? null;

  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem("theme") as Theme | null) ?? "dark";
  });

  // Apply theme on mount and whenever it changes
  useEffect(() => { applyTheme(theme); }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <header
        style={{
          background: "var(--bg-card)",
          borderBottom: "1px solid var(--border)",
          position: "sticky",
          top: 0,
          zIndex: 40,
          transition: "background-color 0.2s ease, border-color 0.2s ease",
        }}
      >
        <div className="oh-header-inner">
          {/* OH monogram */}
          <div
            className="mono"
            style={{
              width: 32,
              height: 32,
              background: "var(--indigo)",
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontWeight: 700,
              color: "#fff",
              flexShrink: 0,
            }}
          >
            OH
          </div>

          <span className="oh-header-title" style={{ fontWeight: 600, color: "var(--text-1)", fontSize: 15 }}>
            Organist Hub
          </span>

          {/* Live badge */}
          <span
            style={{
              background: "rgba(16,185,129,0.12)",
              color: "var(--emerald)",
              border: "1px solid rgba(16,185,129,0.28)",
              borderRadius: 20,
              fontSize: 11,
              fontWeight: 500,
              padding: "2px 9px",
              display: "flex",
              alignItems: "center",
              gap: 5,
              flexShrink: 0,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "var(--emerald)",
                display: "inline-block",
              }}
            />
            Live
          </span>

          {/* Right-side controls */}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
            {activeProject && (
              <ProjectSelector projectId={activeProject} setProjectId={setProjectId} />
            )}
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="oh-main">
        {!activeProject ? (
          <div style={{ textAlign: "center", padding: "96px 0", color: "var(--text-3)" }}>
            Loading projects…
          </div>
        ) : (
          <Routes>
            <Route path="/" element={<Dashboard projectId={activeProject} />} />
            <Route path="/:projectId/runs/:runId" element={<RunDetail />} />
          </Routes>
        )}
      </main>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Shell />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
