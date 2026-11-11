export const EVALUATION_LEAD_DAYS = 14;
export const EVALUATION_COMPLETION_DAYS = 7;
export const EVALUATION_LIVE_DATE = "2026-11-01";

function fromIso(value: string) { return new Date(`${value}T12:00:00`); }
function iso(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }

export function addEvaluationDays(value: string, days: number) {
  const date = fromIso(value);
  date.setDate(date.getDate() + days);
  return iso(date);
}

export function evaluationWindow(qualifyingDate: string, today: string) {
  const availableDate = addEvaluationDays(qualifyingDate, -EVALUATION_LEAD_DAYS);
  const deadlineDate = addEvaluationDays(qualifyingDate, EVALUATION_COMPLETION_DAYS);
  const status = today < availableDate ? "upcoming" : today < qualifyingDate ? "available" : today <= deadlineDate ? "due" : "past_due";
  return { availableDate, qualifyingDate, deadlineDate, status } as const;
}

export function isLiveEvaluation(qualifyingDate: string) {
  return qualifyingDate >= EVALUATION_LIVE_DATE;
}
