import { toZonedTime, fromZonedTime } from 'date-fns-tz';

interface WebinarScheduleInfo {
  startHour: number;
  startMinute: number;
  timezone: string;
  recurrence?: string;
  onceDate?: string | null;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  videoDuration?: number;
}

interface NextSessionResult {
  sessionTime: Date;
  sessionDate: string;
}

export function calculateNextSession(webinar: WebinarScheduleInfo): NextSessionResult | null {
  const {
    startHour = 18,
    startMinute = 0,
    timezone = "America/Sao_Paulo",
    recurrence = "daily",
    onceDate = null,
    dayOfWeek: configDayOfWeek = null,
    dayOfMonth: configDayOfMonth = null,
    videoDuration = 3600,
  } = webinar;

  const nowUtc = new Date();
  const nowInTz = toZonedTime(nowUtc, timezone);
  
  const year = nowInTz.getFullYear();
  const month = nowInTz.getMonth();
  const day = nowInTz.getDate();

  if (recurrence === "once") {
    if (!onceDate) return null;
    
    const [schedYear, schedMonth, schedDay] = onceDate.split("-").map(Number);
    const sessionInTz = new Date(schedYear, schedMonth - 1, schedDay, startHour, startMinute, 0, 0);
    const sessionUtc = fromZonedTime(sessionInTz, timezone);
    const sessionEndUtc = new Date(sessionUtc.getTime() + videoDuration * 1000);
    
    if (nowUtc > sessionEndUtc) {
      return null;
    }
    
    return {
      sessionTime: sessionUtc,
      sessionDate: onceDate,
    };
  }

  if (recurrence === "weekly" && configDayOfWeek !== null) {
    for (let i = 0; i <= 7; i++) {
      const checkDate = new Date(year, month, day + i);
      const checkDayOfWeek = checkDate.getDay();
      
      if (checkDayOfWeek === configDayOfWeek) {
        const sessionInTz = new Date(
          checkDate.getFullYear(),
          checkDate.getMonth(),
          checkDate.getDate(),
          startHour,
          startMinute,
          0,
          0
        );
        const sessionUtc = fromZonedTime(sessionInTz, timezone);
        const sessionEndUtc = new Date(sessionUtc.getTime() + videoDuration * 1000);
        
        if (nowUtc < sessionEndUtc) {
          const sessionDateStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, "0")}-${String(checkDate.getDate()).padStart(2, "0")}`;
          return {
            sessionTime: sessionUtc,
            sessionDate: sessionDateStr,
          };
        }
      }
    }
    
    return null;
  }

  if (recurrence === "monthly" && configDayOfMonth !== null) {
    for (let monthOffset = 0; monthOffset <= 2; monthOffset++) {
      const checkMonth = new Date(year, month + monthOffset, 1);
      const checkDate = new Date(checkMonth.getFullYear(), checkMonth.getMonth(), configDayOfMonth);
      
      if (checkDate.getMonth() !== checkMonth.getMonth()) continue;
      
      const sessionInTz = new Date(
        checkDate.getFullYear(),
        checkDate.getMonth(),
        checkDate.getDate(),
        startHour,
        startMinute,
        0,
        0
      );
      const sessionUtc = fromZonedTime(sessionInTz, timezone);
      const sessionEndUtc = new Date(sessionUtc.getTime() + videoDuration * 1000);
      
      if (nowUtc < sessionEndUtc) {
        const sessionDateStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, "0")}-${String(checkDate.getDate()).padStart(2, "0")}`;
        return {
          sessionTime: sessionUtc,
          sessionDate: sessionDateStr,
        };
      }
    }
    
    return null;
  }

  for (let i = 0; i <= 1; i++) {
    const checkDate = new Date(year, month, day + i);
    const sessionInTz = new Date(
      checkDate.getFullYear(),
      checkDate.getMonth(),
      checkDate.getDate(),
      startHour,
      startMinute,
      0,
      0
    );
    const sessionUtc = fromZonedTime(sessionInTz, timezone);
    const sessionEndUtc = new Date(sessionUtc.getTime() + videoDuration * 1000);
    
    if (nowUtc < sessionEndUtc) {
      const sessionDateStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, "0")}-${String(checkDate.getDate()).padStart(2, "0")}`;
      return {
        sessionTime: sessionUtc,
        sessionDate: sessionDateStr,
      };
    }
  }
  
  return null;
}

export function formatSessionInfo(result: NextSessionResult, timezone: string): string {
  const sessionInTz = toZonedTime(result.sessionTime, timezone);
  const hours = String(sessionInTz.getHours()).padStart(2, "0");
  const minutes = String(sessionInTz.getMinutes()).padStart(2, "0");
  return `${result.sessionDate} às ${hours}:${minutes}`;
}
