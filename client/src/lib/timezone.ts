import { toZonedTime, format, fromZonedTime } from 'date-fns-tz';

export const TIMEZONES = [
  { value: "America/Sao_Paulo", label: "Brasil (São Paulo) - GMT-3" },
  { value: "America/Manaus", label: "Brasil (Manaus) - GMT-4" },
  { value: "America/Fortaleza", label: "Brasil (Fortaleza) - GMT-3" },
  { value: "America/Recife", label: "Brasil (Recife) - GMT-3" },
  { value: "America/Belem", label: "Brasil (Belém) - GMT-3" },
  { value: "America/Cuiaba", label: "Brasil (Cuiabá) - GMT-4" },
  { value: "America/Rio_Branco", label: "Brasil (Rio Branco) - GMT-5" },
  { value: "America/Noronha", label: "Brasil (Fernando de Noronha) - GMT-2" },
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

export function calculateWebinarStatusWithTimezone(
  startHour: number,
  startMinute: number,
  videoDuration: number,
  timezone: string
): { status: "waiting" | "live" | "ended"; currentTime: number; countdown: string } {
  const nowUtc = new Date();
  const nowInTz = toZonedTime(nowUtc, timezone);
  
  const year = nowInTz.getFullYear();
  const month = nowInTz.getMonth();
  const day = nowInTz.getDate();
  const nowHour = nowInTz.getHours();
  const nowMinute = nowInTz.getMinutes();
  
  // Check if we need to look at yesterday's session
  // This happens when the session started yesterday but extends past midnight
  // e.g., webinar at 23:00 with 3h duration ends at 02:00 next day
  let sessionDay = day;
  
  // If current time is before today's start time, check if yesterday's session is still running
  if (nowHour < startHour || (nowHour === startHour && nowMinute < startMinute)) {
    // Yesterday's session would have started at startHour:startMinute
    // Calculate if it would still be running now
    const yesterdayStartInTz = new Date(year, month, day - 1, startHour, startMinute, 0, 0);
    const yesterdayStartUtc = fromZonedTime(yesterdayStartInTz, timezone);
    const yesterdayEndUtc = new Date(yesterdayStartUtc.getTime() + videoDuration * 1000);
    
    if (nowUtc >= yesterdayStartUtc && nowUtc < yesterdayEndUtc) {
      // Yesterday's session is still running!
      const currentTime = Math.floor((nowUtc.getTime() - yesterdayStartUtc.getTime()) / 1000);
      const remainingMs = yesterdayEndUtc.getTime() - nowUtc.getTime();
      const remainingSecs = Math.max(0, Math.floor(remainingMs / 1000));
      const rh = Math.floor(remainingSecs / 3600);
      const rm = Math.floor((remainingSecs % 3600) / 60);
      const rs = remainingSecs % 60;
      return {
        status: "live",
        currentTime,
        countdown: `${rh}:${rm.toString().padStart(2, "0")}:${rs.toString().padStart(2, "0")}`
      };
    }
  }
  
  // Calculate today's session times
  const todayStartInTz = new Date(year, month, sessionDay, startHour, startMinute, 0, 0);
  const todayStartUtc = fromZonedTime(todayStartInTz, timezone);
  const todayEndUtc = new Date(todayStartUtc.getTime() + videoDuration * 1000);
  
  let status: "waiting" | "live" | "ended" = "waiting";
  let currentTime = 0;
  let countdown = "00:00:00";
  
  if (nowUtc >= todayStartUtc && nowUtc < todayEndUtc) {
    status = "live";
    currentTime = Math.floor((nowUtc.getTime() - todayStartUtc.getTime()) / 1000);
    
    const remainingMs = todayEndUtc.getTime() - nowUtc.getTime();
    const remainingSecs = Math.max(0, Math.floor(remainingMs / 1000));
    const rh = Math.floor(remainingSecs / 3600);
    const rm = Math.floor((remainingSecs % 3600) / 60);
    const rs = remainingSecs % 60;
    countdown = `${rh}:${rm.toString().padStart(2, "0")}:${rs.toString().padStart(2, "0")}`;
  } else if (nowUtc >= todayEndUtc) {
    status = "ended";
    const tomorrowStartInTz = new Date(year, month, day + 1, startHour, startMinute, 0, 0);
    const tomorrowStartUtc = fromZonedTime(tomorrowStartInTz, timezone);
    const diff = tomorrowStartUtc.getTime() - nowUtc.getTime();
    const secs = Math.floor(diff / 1000);
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    countdown = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  } else {
    status = "waiting";
    const diff = todayStartUtc.getTime() - nowUtc.getTime();
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
