import { startOfMonth, getDay, addDays, subDays, isSameMonth, format, parseISO } from "date-fns";
import type { Task } from "@/lib/types";

export const WEEK_DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export function parseInitialMonth(s?: string): Date {
  if (!s) return new Date();
  const [y, m] = s.split("-").map(Number);
  if (!y || !m) return new Date();
  return new Date(y, m - 1, 1);
}

// Returns 42 fixed cells (6 rows × 7 cols), Monday-start.
export function getCalendarDays(month: Date) {
  const start = startOfMonth(month);
  const dayOfWeek = getDay(start); // 0 = Sunday
  const offset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const calStart = subDays(start, offset);
  return Array.from({ length: 42 }, (_, i) => {
    const date = addDays(calStart, i);
    return { date, isCurrentMonth: isSameMonth(date, month) };
  });
}

// Groups tasks by local date string (yyyy-MM-dd).
// Uses format(parseISO(...)) so late-night UTC tasks land on the correct DR local day (UTC-4).
export function groupTasksByDate(tasks: Task[]): Map<string, Task[]> {
  const map = new Map<string, Task[]>();
  for (const t of tasks) {
    if (!t.due_date) continue;
    const key = format(parseISO(t.due_date), "yyyy-MM-dd");
    map.set(key, [...(map.get(key) ?? []), t]);
  }
  return map;
}
