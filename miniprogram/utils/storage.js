// 存储服务
const STORAGE_KEY = 'edu_inspect_records';
const TASKS_KEY = 'edu_inspect_tasks';
const NOTIFICATIONS_KEY = 'edu_inspect_notifications';

const storageService = {
  // 保存记录
  saveRecord: (record) => {
    try {
      const records = storageService.getRecords();
      records.unshift(record);
      wx.setStorageSync(STORAGE_KEY, records);
      return true;
    } catch (e) {
      console.error('保存记录失败', e);
      return false;
    }
  },

  // 获取所有记录
  getRecords: () => {
    try {
      const data = wx.getStorageSync(STORAGE_KEY);
      return data || [];
    } catch (e) {
      console.error('获取记录失败', e);
      return [];
    }
  },

  // 获取待同步记录
  getPendingRecords: () => {
    const records = storageService.getRecords();
    return records.filter(r => r.status === 'pending');
  },

  // 同步记录
  syncRecord: (id) => {
    try {
      const records = storageService.getRecords();
      const index = records.findIndex(r => r.id === id);
      if (index !== -1) {
        records[index].status = 'synced';
        records[index].isOffline = false;
        wx.setStorageSync(STORAGE_KEY, records);
      }
    } catch (e) {
      console.error('同步记录失败', e);
    }
  },

  // 删除记录
  deleteRecord: (id) => {
    try {
      const records = storageService.getRecords();
      const filtered = records.filter(r => r.id !== id);
      wx.setStorageSync(STORAGE_KEY, filtered);
    } catch (e) {
      console.error('删除记录失败', e);
    }
  },

  // 保存任务
  saveTask: (task) => {
    try {
      const tasks = storageService.getTasks();
      tasks.unshift(task);
      wx.setStorageSync(TASKS_KEY, tasks);
    } catch (e) {
      console.error('保存任务失败', e);
    }
  },

  // 获取所有任务
  getTasks: () => {
    try {
      const data = wx.getStorageSync(TASKS_KEY);
      return data || [];
    } catch (e) {
      console.error('获取任务失败', e);
      return [];
    }
  },

  // 更新任务状态
  updateTaskStatus: (id, status) => {
    try {
      const tasks = storageService.getTasks();
      const index = tasks.findIndex(t => t.id === id);
      if (index !== -1) {
        tasks[index].status = status;
        wx.setStorageSync(TASKS_KEY, tasks);
      }
    } catch (e) {
      console.error('更新任务状态失败', e);
    }
  },

  // 删除任务
  deleteTask: (id) => {
    try {
      const tasks = storageService.getTasks();
      const filtered = tasks.filter(t => t.id !== id);
      wx.setStorageSync(TASKS_KEY, filtered);
    } catch (e) {
      console.error('删除任务失败', e);
    }
  },

  // 保存通知
  saveNotification: (notification) => {
    try {
      const notifications = storageService.getNotifications();
      notifications.unshift(notification);
      wx.setStorageSync(NOTIFICATIONS_KEY, notifications);
    } catch (e) {
      console.error('保存通知失败', e);
    }
  },

  // 获取所有通知
  getNotifications: () => {
    try {
      const data = wx.getStorageSync(NOTIFICATIONS_KEY);
      return data || [];
    } catch (e) {
      console.error('获取通知失败', e);
      return [];
    }
  },

  // 标记通知为已读
  markNotificationAsRead: (id) => {
    try {
      const notifications = storageService.getNotifications();
      const index = notifications.findIndex(n => n.id === id);
      if (index !== -1) {
        notifications[index].unread = false;
        wx.setStorageSync(NOTIFICATIONS_KEY, notifications);
      }
    } catch (e) {
      console.error('标记通知已读失败', e);
    }
  },

  // 标记所有通知为已读
  markAllNotificationsAsRead: () => {
    try {
      const notifications = storageService.getNotifications();
      const updated = notifications.map(n => ({ ...n, unread: false }));
      wx.setStorageSync(NOTIFICATIONS_KEY, updated);
    } catch (e) {
      console.error('标记所有通知已读失败', e);
    }
  },

  // 删除通知
  deleteNotification: (id) => {
    try {
      const notifications = storageService.getNotifications();
      const filtered = notifications.filter(n => n.id !== id);
      wx.setStorageSync(NOTIFICATIONS_KEY, filtered);
    } catch (e) {
      console.error('删除通知失败', e);
    }
  },

  // 清空所有数据
  clearAll: () => {
    try {
      wx.removeStorageSync(STORAGE_KEY);
      wx.removeStorageSync(TASKS_KEY);
      wx.removeStorageSync(NOTIFICATIONS_KEY);
    } catch (e) {
      console.error('清空数据失败', e);
    }
  }
};

module.exports = storageService;
