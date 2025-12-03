import { toZonedTime, format } from 'date-fns-tz';

export const TIMEZONES = [
  { value: "America/Sao_Paulo", label: "Brasil (São Paulo) - GMT-3" },
  { value: "America/Manaus", label: "Brasil (Manaus) - GMT-4" },
  { value: "America/Fortaleza", label: "Brasil (Fortaleza) - GMT-3" },
  { value: "America/Recife", label: "Brasil (Recife) - GMT-3" },
  { value: "America/Belem", label: "Brasil (Belém) - GMT-3" },
  { value: "America/Cuiaba", label: "Brasil (Cuiabá) - GMT-4" },
  { value: "America/Rio_Branco", label: "Brasil (Rio Branco) - GMT-5" },
  { value: "America/New_York", label: "EUA (Nova York) - GMT-5" },
  { value: "America/Los_Angeles", label: "EUA (Los Angeles) - GMT-8" },
  { value: "America/Chicago", label: "EUA (Chicago) - GMT-6" },
  { value: "America/Denver", label: "EUA (Denver) - GMT-7" },
  { value: "America/Buenos_Aires", label: "Argentina (Buenos Aires) - GMT-3" },
  { value: "America/Santiago", label: "Chile (Santiago) - GMT-4" },
  { value: "America/Lima", label: "Peru (Lima) - GMT-5" },
  { value: "America/Bogota", label: "Colômbia (Bogotá) - GMT-5" },
  { value: "America/Mexico_City", label: "México (Cidade do México) - GMT-6" },
  { value: "Europe/London", label: "Reino Unido (Londres) - GMT+0" },
  { value: "Europe/Paris", label: "França (Paris) - GMT+1" },
  { value: "Europe/Berlin", label: "Alemanha (Berlim) - GMT+1" },
  { value: "Europe/Madrid", label: "Espanha (Madrid) - GMT+1" },
  { value: "Europe/Rome", label: "Itália (Roma) - GMT+1" },
  { value: "Europe/Lisbon", label: "Portugal (Lisboa) - GMT+0" },
  { value: "Europe/Moscow", label: "Rússia (Moscou) - GMT+3" },
  { value: "Asia/Tokyo", label: "Japão (Tóquio) - GMT+9" },
  { value: "Asia/Shanghai", label: "China (Xangai) - GMT+8" },
  { value: "Asia/Dubai", label: "Emirados (Dubai) - GMT+4" },
  { value: "Asia/Singapore", label: "Singapura - GMT+8" },
  { value: "Asia/Seoul", label: "Coreia do Sul (Seul) - GMT+9" },
  { value: "Australia/Sydney", label: "Austrália (Sydney) - GMT+11" },
  { value: "Pacific/Auckland", label: "Nova Zelândia (Auckland) - GMT+13" },
  { value: "UTC", label: "UTC - GMT+0" },
];

export function getNowInTimezone(timezone: string): Date {
  const now = new Date();
  return toZonedTime(now, timezone);
}

export function getWebinarStartTimeToday(
  startHour: number,
  startMinute: number,
  timezone: string
): Date {
  const nowInTz = toZonedTime(new Date(), timezone);
  const todayStart = new Date(nowInTz);
  todayStart.setHours(startHour, startMinute, 0, 0);
  return todayStart;
}

export function calculateWebinarStatusWithTimezone(
  startHour: number,
  startMinute: number,
  videoDuration: number,
  timezone: string
): { status: "waiting" | "live" | "ended"; currentTime: number; countdown: string } {
  const nowInTz = toZonedTime(new Date(), timezone);
  
  const todayStart = new Date(nowInTz);
  todayStart.setHours(startHour, startMinute, 0, 0);
  
  const todayEnd = new Date(todayStart.getTime() + videoDuration * 1000);
  
  let status: "waiting" | "live" | "ended" = "waiting";
  let currentTime = 0;
  let countdown = "00:00:00";
  
  if (nowInTz >= todayStart && nowInTz < todayEnd) {
    status = "live";
    currentTime = Math.floor((nowInTz.getTime() - todayStart.getTime()) / 1000);
    
    const remainingMs = todayEnd.getTime() - nowInTz.getTime();
    const remainingSecs = Math.max(0, Math.floor(remainingMs / 1000));
    const rh = Math.floor(remainingSecs / 3600);
    const rm = Math.floor((remainingSecs % 3600) / 60);
    const rs = remainingSecs % 60;
    countdown = `${rh}:${rm.toString().padStart(2, "0")}:${rs.toString().padStart(2, "0")}`;
  } else if (nowInTz >= todayEnd) {
    status = "ended";
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const diff = tomorrowStart.getTime() - nowInTz.getTime();
    const secs = Math.floor(diff / 1000);
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    countdown = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  } else {
    status = "waiting";
    const diff = todayStart.getTime() - nowInTz.getTime();
    const secs = Math.floor(diff / 1000);
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    countdown = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  
  return { status, currentTime, countdown };
}

export function formatTimeInTimezone(date: Date, timezone: string, formatStr: string = "HH:mm:ss"): string {
  return format(toZonedTime(date, timezone), formatStr, { timeZone: timezone });
}

export function getTimezoneLabel(timezone: string): string {
  const tz = TIMEZONES.find(t => t.value === timezone);
  return tz ? tz.label : timezone;
}
