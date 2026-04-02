const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json();
}

export interface Project {
  id: string;
  name: string;
}

export interface Run {
  run_id: string;
  started_at: string;
  ended_at: string;
  log_count: number;
  has_warning: number;
  has_error: number;
  has_critical: number;
  total_elapsed_ms: number | null;
  scrape_elapsed_ms: number | null;
  filter_elapsed_ms: number | null;
  notify_elapsed_ms: number | null;
  listed: number | null;
  pre_filter_passed: number | null;
  scraped: number | null;
  valid: number | null;
  notified: number | null;
  gig_errors: number | null;
  filter_breakdown: string | null;
}

export interface LogEntry {
  id: number;
  project_id: string;
  timestamp: string;
  run_id: string;
  level: string;
  logger: string;
  message: string;
  module: string;
  function: string;
  line: number;
  details: string;
}

export interface Overview {
  total_runs: number;
  runs_today: number;
  total_notified: number;
  conversion_rate_pct: number | null;
  avg_listed: number | null;
  avg_fetch_ms: number | null;
  avg_retries_per_run: number;
  warning_rate_pct: number | null;
  error_rate_pct: number | null;
  last_synced_at: string | null;
  min_ms: number | null;
  max_ms: number | null;
  avg_ms: number | null;
  median_ms: number | null;
}

export interface SpeedPoint {
  run_id: string;
  started_at: string;
  total_ms: number | null;
  scrape_ms: number | null;
  filter_ms: number | null;
  notify_ms: number | null;
}

export interface FunnelPoint {
  run_id: string;
  started_at: string;
  listed: number | null;
  pre_filter_passed: number | null;
  scraped: number | null;
  valid: number | null;
  notified: number | null;
}

export interface FilterStat {
  filter: string;
  rejections: number;
}

export interface FilterSeriesResponse {
  filters: string[];
  series: ({ started_at: string } & Record<string, number>)[];
}

export interface HealthPoint {
  started_at: string;
  warn_rate_pct: number;
  error_rate_pct: number;
}

export interface ListingsPoint {
  window_start: string;
  avg_listed: number;
  run_count: number;
}

export const api = {
  projects: () => request<Project[]>("/projects"),

  runs: (projectId: string, limit = 50, offset = 0) =>
    request<Run[]>(`/${projectId}/runs?limit=${limit}&offset=${offset}`),

  run: (projectId: string, runId: string) =>
    request<Run>(`/${projectId}/runs/${runId}`),

  runLogs: (projectId: string, runId: string, levels?: string[]) => {
    const params = levels?.length
      ? "?" + levels.map((l) => `levels=${l}`).join("&")
      : "";
    return request<LogEntry[]>(`/${projectId}/runs/${runId}/logs${params}`);
  },

  overview: (projectId: string) => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return request<Overview>(
      `/${projectId}/metrics/overview?tz=${encodeURIComponent(tz)}`
    );
  },

  speed: (projectId: string, since?: string, until?: string) => {
    const p = new URLSearchParams();
    if (since) { p.set("since", since); }
    else { p.set("limit", "50"); }
    if (until) p.set("until", until);
    return request<SpeedPoint[]>(`/${projectId}/metrics/speed?${p}`);
  },

  funnel: (projectId: string, limit = 50) =>
    request<FunnelPoint[]>(`/${projectId}/metrics/funnel?limit=${limit}`),

  filters: (projectId: string) =>
    request<FilterStat[]>(`/${projectId}/metrics/filters`),

  filtersSeries: (projectId: string, since?: string, until?: string) => {
    const p = new URLSearchParams();
    if (since) p.set("since", since);
    if (until) p.set("until", until);
    const qs = p.toString() ? `?${p}` : "";
    return request<FilterSeriesResponse>(`/${projectId}/metrics/filters_series${qs}`);
  },

  healthHourly: (projectId: string, since?: string, until?: string) => {
    const p = new URLSearchParams();
    if (since) p.set("since", since);
    if (until) p.set("until", until);
    const qs = p.toString() ? `?${p}` : "";
    return request<HealthPoint[]>(`/${projectId}/metrics/health_hourly${qs}`);
  },

  listingsWindows: (
    projectId: string,
    since?: string,
    until?: string,
    windowHours = 12
  ) => {
    const p = new URLSearchParams({ window_hours: String(windowHours) });
    if (since) p.set("since", since);
    if (until) p.set("until", until);
    return request<ListingsPoint[]>(`/${projectId}/metrics/listings_windows?${p}`);
  },

  sync: (projectId: string) =>
    request<{ inserted: number }>(`/sync/${projectId}`, { method: "POST" }),
};
