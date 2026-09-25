// Finestra e ritmo di invio della campagna. Tutto in ora italiana (Europe/Rome).
// Regole: lun–ven, dalle 9:00 alle 18:00, una email ogni `intervalMinutes`, massimo
// `dailyLimit` al giorno per casella (somma di tutte le campagne della casella).

export const TZ = "Europe/Rome";
export const WINDOW = { startHour: 9, endHour: 18 };

function romeParts(d: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hour12: false,
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value])
  );
  return { y: +p.year, m: +p.month, d: +p.day, hour: +p.hour % 24, minute: +p.minute, weekday: p.weekday as string };
}

// Istante UTC corrispondente alla mezzanotte di oggi a Roma.
export function startOfRomeDay(now: Date): Date {
  const { y, m, d } = romeParts(now);
  // prova gli offset possibili di Roma (+1/+2) e prende quello che cade davvero a mezzanotte
  for (const offset of [1, 2]) {
    const guess = new Date(Date.UTC(y, m - 1, d, -offset, 0, 0));
    const g = romeParts(guess);
    if (g.hour === 0 && g.d === d) return guess;
  }
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
}

export function inSendWindow(now: Date): boolean {
  const { hour, weekday } = romeParts(now);
  return weekday !== "Sat" && weekday !== "Sun" && hour >= WINDOW.startHour && hour < WINDOW.endHour;
}

// Stima del piano di invio mostrata prima dell'OK: quante email per giorno lavorativo.
export function campaignPlan(total: number, dailyLimit: number, intervalMinutes: number) {
  const perDayByTime = Math.floor(((WINDOW.endHour - WINDOW.startHour) * 60) / intervalMinutes);
  const perDay = Math.max(1, Math.min(dailyLimit, perDayByTime));
  const days: { day: number; emails: number; from: string; to: string }[] = [];
  let left = total;
  for (let day = 1; left > 0; day++) {
    const n = Math.min(perDay, left);
    const endMin = WINDOW.startHour * 60 + (n - 1) * intervalMinutes;
    const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
    days.push({ day, emails: n, from: hhmm(WINDOW.startHour * 60), to: hhmm(endMin) });
    left -= n;
  }
  return { perDay, workingDays: days.length, days };
}
