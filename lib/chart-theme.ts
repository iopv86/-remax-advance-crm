// Shared Recharts theming — Obsidian Edge (Ventana 3).
// Centralizes axis/grid/tooltip styling so revenue-chart, agent-kpi-chart and
// reports charts stay visually consistent without each redefining it.
//
// Colors resolve through CSS custom properties so the charts stay theme-aware
// (dark is the default theme, but the settings toggle can switch to light).
// CSS variables resolve correctly inside Recharts inline style props
// (contentStyle, cursor, tick style).

export const CHART_GOLD = "#C9963A";
export const CHART_GOLD_LIGHT = "#E8B84B";

// Axis + tick styling.
export const CHART_AXIS = {
  stroke: "var(--border)",
  tick: { fill: "var(--muted-foreground)", fontSize: 11 },
} as const;

// Cartesian grid lines (gold hairline reads on both themes).
export const CHART_GRID = {
  stroke: "rgba(201, 150, 58, 0.12)",
  strokeDasharray: "3 3",
} as const;

// Custom tooltip container style (pass to <Tooltip contentStyle={...} />).
export const CHART_TOOLTIP = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  color: "var(--popover-foreground)",
  boxShadow: "0 12px 32px rgba(0, 0, 0, 0.35)",
  fontSize: 12,
} as const;

// Hover cursor fill for bar charts (gold tint reads on both themes).
export const CHART_CURSOR = { fill: "rgba(201, 150, 58, 0.06)" } as const;
