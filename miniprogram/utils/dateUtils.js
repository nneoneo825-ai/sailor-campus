/**
 * 时间处理工具函数 - 北京时间 (UTC+8)
 */

/**
 * 格式化ISO时间为日期时间字符串
 * @param {string} isoString ISO时间字符串
 * @returns {string} 格式化后的时间 (YYYY-MM-DD HH:mm)
 */
function formatDateTime(isoString) {
  if (!isoString) return '-';
  
  try {
    const date = new Date(isoString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  } catch (e) {
    return isoString;
  }
}

/**
 * 格式化ISO时间为简短时间字符串（时:分）
 * @param {string} isoString ISO时间字符串
 * @returns {string} 格式化后的时间 (HH:mm)
 */
function formatShortTime(isoString) {
  if (!isoString) return '-';
  
  try {
    const date = new Date(isoString);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  } catch (e) {
    return isoString;
  }
}

/**
 * 格式化ISO时间为日期字符串
 * @param {string} isoString ISO时间字符串
 * @returns {string} 格式化后的日期 (YYYY-MM-DD)
 */
function formatDate(isoString) {
  if (!isoString) return '-';
  
  try {
    const date = new Date(isoString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch (e) {
    return isoString;
  }
}

/**
 * 格式化时间戳为相对时间
 * @param {number} timestamp 时间戳
 * @returns {string} 相对时间描述
 */
function formatRelativeTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffMinutes < 1) {
    return '刚刚';
  } else if (diffMinutes < 60) {
    return `${diffMinutes}分钟前`;
  } else if (diffHours < 24) {
    return `${diffHours}小时前`;
  } else if (diffDays < 7) {
    return `${diffDays}天前`;
  } else {
    return formatDate(date.toISOString());
  }
}

/**
 * 获取当前北京时间日期字符串 (YYYY-MM-DD)
 * @returns {string} 日期字符串
 */
function getBeijingDate() {
  const now = new Date();
  // 北京时间偏移 +8小时
  const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return beijingTime.toISOString().split('T')[0];
}

/**
 * 获取当前北京时间 ISO 字符串
 * @returns {string} ISO时间字符串
 */
function getBeijingISOTime() {
  return new Date().toISOString();
}

module.exports = {
  formatDateTime,
  formatShortTime,
  formatDate,
  formatRelativeTime,
  getBeijingDate,
  getBeijingISOTime
};
