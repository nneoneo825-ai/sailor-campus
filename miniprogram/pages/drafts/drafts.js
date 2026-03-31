const api = require('../../utils/api.js');

Page({
  data: {
    drafts: []
  },

  onLoad() {
    this.loadDrafts();
  },

  onShow() {
    this.loadDrafts();
  },

  async loadDrafts() {
    // 从API获取待处理/草稿状态的任务
    try {
      const res = await api.getTasks({ status: 'pending', page_size: 20 });
      const drafts = (res.data?.tasks || []).map(task => ({
        id: task.id,
        title: task.title,
        type: task.task_type,
        timestamp: new Date(task.created_at).getTime(),
        status: 'draft'
      }));
      this.setData({ drafts });
    } catch (error) {
      console.error('加载草稿失败:', error);
      this.setData({ drafts: [] });
    }
  },

  // 编辑草稿
  onEditDraft(e) {
    const draft = e.currentTarget.dataset.draft;
    const typeMap = {
      'MORAL': 'moral',
      'TEACHING': 'teaching',
      'DORM': 'dorm',
      'GENERAL': 'overall'
    };
    const type = typeMap[draft.type] || 'moral';
    wx.navigateTo({
      url: `/pages/inspectForm/inspectForm?type=${type}&taskId=${draft.id}`
    });
  },

  // 删除草稿
  async onDeleteDraft(e) {
    const draftId = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个任务吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            await api.deleteTask(draftId);
            this.loadDrafts();
            wx.showToast({
              title: '删除成功',
              icon: 'success'
            });
          } catch (error) {
            console.error('删除失败:', error);
            wx.showToast({
              title: '删除失败',
              icon: 'none'
            });
          }
        }
      }
    });
  },

  // 格式化时间
  formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) {
      const hours = Math.floor(diff / (1000 * 60 * 60));
      if (hours === 0) {
        const minutes = Math.floor(diff / (1000 * 60));
        return minutes < 1 ? '刚刚' : `${minutes}分钟前`;
      }
      return `${hours}小时前`;
    } else if (days === 1) {
      return '昨天';
    } else if (days < 7) {
      return `${days}天前`;
    } else {
      return `${date.getMonth() + 1}-${date.getDate()}`;
    }
  }
});
