// Hebrew day names
const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

export function getTodayHebrew() {
  const now = new Date();
  const dayIndex = now.getDay();
  return DAYS_HE[dayIndex];
}

export function getFormattedDate() {
  const now = new Date();
  const dayName = getTodayHebrew();
  const dateStr = now.toLocaleDateString('he-IL', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  return `יום ${dayName}, ${dateStr}`;
}

export function getNextWeekDate(currentDate) {
  const date = new Date(currentDate || new Date());
  date.setDate(date.getDate() + 7);
  return date.toISOString().split('T')[0];
}

export function getDayNameFromDate(date) {
  return DAYS_HE[new Date(date).getDay()];
}

export const DAY_OPTIONS = DAYS_HE.map((name, i) => ({ value: i, label: `יום ${name}` }));
