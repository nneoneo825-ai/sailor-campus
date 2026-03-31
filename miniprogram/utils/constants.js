// 常量 - 仅保留UI相关的常量配置
// 所有数据相关的常量已迁移到API获取

const COLORS = {
  primary: '#3b82f6',
  secondary: '#10b981',
  danger: '#ef4444',
  warning: '#f59e0b',
  bg: '#f8fafc'
};

const QUICK_ENTRIES = [
  { id: 'MORAL', label: '德育检查', color: '#3b82f6', iconType: 'clipboard-check' },
  { id: 'TEACHING', label: '教学检查', color: '#10b981', iconType: 'book-open' },
  { id: 'DORM', label: '宿舍检查', color: '#8b5cf6', iconType: 'home' },
  { id: 'OVERALL', label: '整体检查', color: '#6366f1', iconType: 'layout-dashboard' }
];

// 座位表列标签（用于显示坐标）
const COL_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];

// 检查类型映射
const CHECK_TYPE_LABELS = {
  'moral': '德育检查',
  'teaching': '教学评价',
  'dorm': '宿舍检查',
  'overall': '整体检查'
};

// 检查类型颜色
const CHECK_TYPE_COLORS = {
  'moral': '#3b82f6',
  'teaching': '#10b981',
  'dorm': '#8b5cf6',
  'overall': '#6366f1'
};

module.exports = {
  COLORS,
  QUICK_ENTRIES,
  COL_LABELS,
  CHECK_TYPE_LABELS,
  CHECK_TYPE_COLORS
};
