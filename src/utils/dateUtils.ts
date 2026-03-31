/**
 * 日期时间工具函数 - 统一使用北京时间 (UTC+8)
 */

/**
 * 获取当前北京时间日期字符串 (YYYY-MM-DD)
 */
export function getBeijingDate(): string {
  const now = new Date();
  // 北京时间 = UTC + 8小时
  const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return beijingTime.toISOString().split('T')[0];
}

/**
 * 获取指定日期偏移的北京时间日期字符串
 * @param offsetDays 天数偏移（正数为未来，负数为过去）
 */
export function getBeijingDateOffset(offsetDays: number): string {
  const now = new Date();
  const targetDate = new Date(now.getTime() + offsetDays * 24 * 60 * 60 * 1000);
  // 北京时间 = UTC + 8小时
  const beijingTime = new Date(targetDate.getTime() + 8 * 60 * 60 * 1000);
  return beijingTime.toISOString().split('T')[0];
}

/**
 * 获取北京时间的年月
 */
export function getBeijingYearMonth(): { year: number; month: number } {
  const now = new Date();
  const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return {
    year: beijingTime.getUTCFullYear(),
    month: beijingTime.getUTCMonth() + 1
  };
}

/**
 * 格式化ISO时间为本地时间字符串
 * @param isoString ISO时间字符串
 * @param includeSeconds 是否包含秒
 */
export function formatBeijingTime(isoString: string | null | undefined, includeSeconds: boolean = false): string {
  if (!isoString) return '-';
  
  try {
    const date = new Date(isoString);
    // 转换为北京时间显示
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    if (includeSeconds) {
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  } catch {
    return isoString;
  }
}

/**
 * 格式化ISO时间为日期字符串
 * @param isoString ISO时间字符串
 */
export function formatBeijingDate(isoString: string | null | undefined): string {
  if (!isoString) return '-';
  
  try {
    const date = new Date(isoString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch {
    return isoString;
  }
}

/**
 * 格式化ISO时间为简短时间字符串（时:分）
 * @param isoString ISO时间字符串
 */
export function formatShortTime(isoString: string | null | undefined): string {
  if (!isoString) return '-';
  
  try {
    const date = new Date(isoString);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  } catch {
    return isoString;
  }
}

/**
 * 获取本周的起止日期（北京时间，周一到周日）
 */
export function getBeijingWeekRange(): { start: string; end: string } {
  const now = new Date();
  // 北京时间偏移
  const beijingNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const dayOfWeek = beijingNow.getUTCDay() || 7; // 周日为7
  
  // 计算周一
  const monday = new Date(beijingNow.getTime() - (dayOfWeek - 1) * 24 * 60 * 60 * 1000);
  // 计算周日
  const sunday = new Date(beijingNow.getTime() + (7 - dayOfWeek) * 24 * 60 * 60 * 1000);
  
  return {
    start: monday.toISOString().split('T')[0],
    end: sunday.toISOString().split('T')[0]
  };
}

/**
 * 获取上周的起止日期（北京时间）
 */
export function getBeijingLastWeekRange(): { start: string; end: string } {
  const now = new Date();
  const beijingNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const dayOfWeek = beijingNow.getUTCDay() || 7;
  
  // 上周一
  const lastMonday = new Date(beijingNow.getTime() - (dayOfWeek + 6) * 24 * 60 * 60 * 1000);
  // 上周日
  const lastSunday = new Date(beijingNow.getTime() - dayOfWeek * 24 * 60 * 60 * 1000);
  
  return {
    start: lastMonday.toISOString().split('T')[0],
    end: lastSunday.toISOString().split('T')[0]
  };
}

/**
 * 获取本月的起止日期（北京时间）
 */
export function getBeijingMonthRange(): { start: string; end: string } {
  const { year, month } = getBeijingYearMonth();
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end = getBeijingDate();
  return { start, end };
}

/**
 * 获取上月的起止日期（北京时间）
 */
export function getBeijingLastMonthRange(): { start: string; end: string } {
  const now = new Date();
  const beijingNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const year = beijingNow.getUTCFullYear();
  const month = beijingNow.getUTCMonth() + 1;
  
  // 上月
  const lastMonth = month === 1 ? 12 : month - 1;
  const lastMonthYear = month === 1 ? year - 1 : year;
  
  // 上月天数
  const daysInLastMonth = new Date(lastMonthYear, lastMonth, 0).getDate();
  
  return {
    start: `${lastMonthYear}-${String(lastMonth).padStart(2, '0')}-01`,
    end: `${lastMonthYear}-${String(lastMonth).padStart(2, '0')}-${daysInLastMonth}`
  };
}
