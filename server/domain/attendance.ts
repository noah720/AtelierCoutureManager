/**
 * Pointage géolocalisé & horaires (point 14.2) — logique pure.
 *
 * Règles validées de la présentation :
 *  - heures travaillées hors créneau horaire : majoration de 20 % ;
 *  - session non clôturée plus de 15 minutes après la fin du créneau :
 *    détection d'oubli de pointage et clôture automatique avec incident ;
 *  - le pointage est vérifié par géolocalisation : distance à vol d'oiseau
 *    (haversine) entre le téléphone et le point de vente, avec tolérance
 *    configurable (défaut 150 m).
 */

/** "08:30" → 510 minutes. */
export function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map((part) => Number.parseInt(part, 10));
  return (hours || 0) * 60 + (minutes || 0);
}

export type DaySchedule = { dayOfWeek: number; startTime: string; endTime: string; active: boolean } | undefined;

/** Créneau du jour pour un employé (ou undefined si repos / non planifié). */
export function scheduleForDay(schedules: Array<DaySchedule>, dayOfWeek: number): DaySchedule {
  return schedules.find((schedule) => schedule && schedule.dayOfWeek === dayOfWeek && schedule.active);
}

/**
 * Minutes travaillées hors créneau (avant l'ouverture ou après la fermeture
 * du créneau du jour). Retourne 0 si pas de créneau (jour planifié ou non :
 * sans horaire défini, tout le temps travaillé est « hors horaires »).
 */
export function minutesOutsideSchedule(checkInAt: Date, checkOutAt: Date, schedule: DaySchedule): number {
  const start = Math.min(checkInAt.getTime(), checkOutAt.getTime());
  const end = Math.max(checkInAt.getTime(), checkOutAt.getTime());
  const workedMinutes = Math.round((end - start) / 60000);
  if (!schedule || !schedule.active) return workedMinutes;
  const day = checkInAt.getDay();
  if (schedule.dayOfWeek !== day) return workedMinutes;
  const open = parseTimeToMinutes(schedule.startTime);
  const close = parseTimeToMinutes(schedule.endTime);
  const minutesOfDay = (date: Date) => date.getHours() * 60 + date.getMinutes();
  const checkInMinutes = minutesOfDay(checkInAt);
  const checkOutMinutes = minutesOfDay(checkOutAt);
  // Travail de nuit à cheval sur minuit : créneau 20:00 → 02:00.
  const overnight = close <= open;
  let outside = 0;
  if (!overnight) {
    outside += Math.max(0, open - checkInMinutes);
    outside += Math.max(0, checkOutMinutes - close);
  } else {
    // Avant minuit : créneau [open, 1440[ ; après : [0, close].
    outside += Math.max(0, Math.min(checkInMinutes, checkOutMinutes) > open ? 0 : open - Math.max(checkInMinutes, 0));
    // Simplification : la session d'une même journée se compare au créneau ouvert.
    const effectiveClose = close + 1440;
    const shiftedIn = checkInMinutes < open ? checkInMinutes + 1440 : checkInMinutes;
    const shiftedOut = checkOutMinutes < open ? checkOutMinutes + 1440 : checkOutMinutes;
    outside = Math.max(0, open - shiftedIn) + Math.max(0, shiftedOut - effectiveClose);
    if (outside < 0) outside = 0;
  }
  return Math.min(workedMinutes, outside);
}

/** Paye d'une session : heures normales + heures hors horaires majorées de 20 %. */
export function computeAttendancePay(input: { hourlyRate: number; insideMinutes: number; outsideMinutes: number }): { normalPay: number; overtimePay: number; total: number } {
  const rate = Math.max(0, input.hourlyRate);
  const normalPay = Math.round(((rate * input.insideMinutes) / 60) * 100) / 100;
  const overtimePay = Math.round(((rate * input.outsideMinutes) / 60) * 1.2 * 100) / 100;
  return { normalPay, overtimePay, total: Math.round((normalPay + overtimePay) * 100) / 100 };
}

/** Taux horaire implicite à partir du salaire mensuel (base 173,33 h/mois). */
export function hourlyRateFromMonthly(monthlySalary: number): number {
  return Math.round((monthlySalary / 173.33) * 100) / 100;
}

/** Distance à vol d'oiseau en mètres (formule de haversine). */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

/** Le point est-il dans le rayon de tolérance du point de vente ? */
export function isWithinGeofence(lat: number, lng: number, store: { latitude: string | null; longitude: string | null; geofenceRadius: number | null }): boolean {
  if (store.latitude === null || store.longitude === null) return true; // pas de géorepérage configuré
  const radius = store.geofenceRadius ?? 150;
  return distanceMeters(lat, lng, Number(store.latitude), Number(store.longitude)) <= radius;
}

/**
 * Une session ouverte est-elle « oubliée » ? Oui si nous sommes plus de
 * `graceMinutes` (défaut 15) après la fin du créneau du jour (ou plus de
 * 15 h après l'arrivée sans créneau défini). Renvoie l'heure de clôture
 * retenue (fin du créneau) ou null si rien à clôturer.
 */
export function staleSessionClose(openSince: Date, now: Date, schedule: DaySchedule, graceMinutes = 15): { closeAt: Date; reason: string } | null {
  if (openSince.getDay() !== now.getDay()) {
    const hoursOpen = (now.getTime() - openSince.getTime()) / 3600000;
    if (hoursOpen > 15) return { closeAt: new Date(openSince.getTime() + 15 * 3600000), reason: "Oubli de pointage — clôture automatique 15 h après l'arrivée" };
    return null;
  }
  const minutesOfDay = (date: Date) => date.getHours() * 60 + date.getMinutes();
  if (!schedule || !schedule.active) {
    const minutesOpen = (now.getTime() - openSince.getTime()) / 60000;
    if (minutesOpen > 15 * 60) return { closeAt: new Date(openSince.getTime() + 15 * 3600000), reason: "Oubli de pointage — clôture automatique 15 h après l'arrivée" };
    return null;
  }
  const closeMinutes = parseTimeToMinutes(schedule.endTime);
  if (minutesOfDay(now) > closeMinutes + graceMinutes) {
    const closeAt = new Date(now);
    closeAt.setHours(Math.floor(closeMinutes / 60), closeMinutes % 60, 0, 0);
    return { closeAt, reason: `Oubli de pointage — clôture automatique 15 min après la fin du créneau (${schedule.endTime})` };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Primes planifiées — clés de période (hebdo / mensuel / trimestre)   */
/* ------------------------------------------------------------------ */

/** "2026-W37" — semaine ISO (lundi comme premier jour). */
export function weekKey(date: Date): string {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = (target.getUTCDay() + 6) % 7; // lundi = 0
  target.setUTCDate(target.getUTCDate() - dayNumber + 3); // jeudi de la semaine ISO
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((target.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** "2026-09" — mois précédent (ou du mois courant selon la date fournie). */
export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** "2026-T3" — trimestre (T1 = janv-mars). */
export function quarterKey(date: Date): string {
  return `${date.getFullYear()}-T${Math.floor(date.getMonth() / 3) + 1}`;
}

/** Bornes [début, fin) de la semaine (lundi 00:00 → lundi suivante). */
export function weekBounds(date: Date): { start: Date; end: Date } {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate() - ((date.getDay() + 6) % 7));
  const end = new Date(start.getTime() + 7 * 86400000);
  return { start, end };
}

/** Bornes du mois civil. */
export function monthBounds(date: Date): { start: Date; end: Date } {
  return { start: new Date(date.getFullYear(), date.getMonth(), 1), end: new Date(date.getFullYear(), date.getMonth() + 1, 1) };
}

/** Bornes du trimestre civil. */
export function quarterBounds(date: Date): { start: Date; end: Date } {
  const startMonth = Math.floor(date.getMonth() / 3) * 3;
  return { start: new Date(date.getFullYear(), startMonth, 1), end: new Date(date.getFullYear(), startMonth + 3, 1) };
}

/** Bornes de l'année civile. */
export function yearBounds(date: Date): { start: Date; end: Date } {
  return { start: new Date(date.getFullYear(), 0, 1), end: new Date(date.getFullYear() + 1, 0, 1) };
}
