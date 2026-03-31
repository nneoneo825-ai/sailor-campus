const api = require('../../utils/api.js');

Page({
  data: {
    totalRecords: 0,
    totalTasks: 0,
    completedTasks: 0,
    taskCompletionRate: 0,
    typeStats: [],
    weeklyStats: [0, 0, 0, 0, 0, 0, 0],
    weeklyMaxCount: 0,
    currentWeek: [],
    monthlyStats: [],
    monthlyMaxCount: 0,
    todayStats: {
      records: 0,
      tasks: 0,
      completed: 0
    },
    schoolId: null,
    loading: true
  },

  onLoad() {
    this.loadSchoolId();
  },

  onShow() {
    this.loadStats();
  },

  // 加载学校ID
  loadSchoolId() {
    const userInfo = api.getUserInfo();
    if (userInfo) {
      const schoolId = userInfo.school_id || userInfo.org_id || null;
      this.setData({ schoolId }, () => {
        // 设置完学校ID后加载统计数据
        this.loadStats();
      });
    } else {
      // 没有用户信息也加载统计数据
      this.loadStats();
    }
  },

  // 加载统计数据
  async loadStats() {
    this.setData({ loading: true });

    // 直接使用直接统计方式，获取最新的实时数据
    await this.loadDirectStats();
  },

  // 直接从记录API获取统计数据（与后端API统计逻辑保持一致）
  async loadDirectStats() {
    try {
      // 获取当前用户信息
      const userInfo = api.getUserInfo();
      if (!userInfo || !userInfo.id) {
        console.log('用户信息不完整，无法加载统计');
        return;
      }

      // 构建查询参数：只查询当前用户录入的记录
      const params = {
        limit: 100,
        recorder_id: userInfo.id  // 只显示自己录入的记录
      };

      // 并行获取所有类型记录
      const [moralRes, teachingRes, dormRes] = await Promise.allSettled([
        api.getMoralRecords(params),
        api.getTeachingRecords(params),
        api.getDormRecords(params)
      ]);

      const moralRecords = moralRes.status === 'fulfilled' ? (moralRes.value.records || moralRes.value.items || []) : [];
      const teachingRecords = teachingRes.status === 'fulfilled' ? (teachingRes.value.records || teachingRes.value.items || []) : [];
      const dormRecords = dormRes.status === 'fulfilled' ? (dormRes.value.records || dormRes.value.items || []) : [];

      console.log('教学记录数量:', teachingRecords.length);
      console.log('德育记录数量:', moralRecords.length);
      console.log('宿舍记录数量:', dormRecords.length);

      // 统计各类型数量
      // 整体检查记录分布在三个表中，都标记为 source='overall'
      const overallTeachingRecords = teachingRecords.filter(r => r.source === 'overall');
      const overallMoralRecords = moralRecords.filter(r => r.source === 'overall');
      const overallDormRecords = dormRecords.filter(r => r.source === 'overall');
      const overallRecords = [...overallTeachingRecords, ...overallMoralRecords, ...overallDormRecords];
      
      // 普通记录（非整体检查）
      const normalTeachingRecords = teachingRecords.filter(r => r.source !== 'overall');
      const normalMoralRecords = moralRecords.filter(r => r.source !== 'overall');
      const normalDormRecords = dormRecords.filter(r => r.source !== 'overall');
      
      console.log('整体检查-学科:', overallTeachingRecords.length);
      console.log('整体检查-班级:', overallMoralRecords.length);
      console.log('整体检查-宿舍:', overallDormRecords.length);
      console.log('整体检查总数:', overallRecords.length);
      console.log('普通德育:', normalMoralRecords.length);
      console.log('普通教学:', normalTeachingRecords.length);
      console.log('普通宿舍:', normalDormRecords.length);
      
      // 统计口径：
      // - 德育检查：普通德育记录（不包括整体检查的班级记录）
      // - 教学评价：普通教学记录（不包括整体检查的学科记录）
      // - 宿舍检查：普通宿舍记录（不包括整体检查的宿舍记录）
      // - 整体检查：包含班级、学科、宿舍三种类型的整体检查
      const moralCount = normalMoralRecords.length;
      const teachingCount = normalTeachingRecords.length;
      const dormCount = normalDormRecords.length;
      const overallCount = overallRecords.length;
      const totalRecords = moralCount + teachingCount + dormCount + overallCount;

      // 构建typeStats（与后端API返回格式一致）
      const typeStats = [
        { type: 'MORAL', label: '德育检查', count: moralCount, color: '#3b82f6' },
        { type: 'TEACHING', label: '教学评价', count: teachingCount, color: '#10b981' },
        { type: 'DORM', label: '宿舍检查', count: dormCount, color: '#8b5cf6' },
        { type: 'GENERAL', label: '整体检查', count: overallCount, color: '#f59e0b' }
      ];

      // 合并所有记录用于趋势统计
      const allRecords = [...moralRecords, ...teachingRecords, ...dormRecords];
      
      // 计算月度趋势（最近6个月）
      const monthlyStats = this.calculateMonthlyStats(allRecords);
      const monthlyMaxCount = Math.max(...monthlyStats.map(m => m.count), 1);
      
      // 计算本周检查记录
      const weeklyStats = this.calculateWeeklyStats(allRecords);
      const weeklyMaxCount = Math.max(...weeklyStats, 1);
      
      // 获取当前周日期
      const currentWeek = this.getCurrentWeek();

      this.setData({
        totalRecords: totalRecords,
        totalTasks: 0,
        completedTasks: 0,
        taskCompletionRate: 0,
        typeStats: typeStats,
        weeklyStats: weeklyStats,
        weeklyMaxCount: weeklyMaxCount,
        currentWeek: currentWeek,
        monthlyStats: monthlyStats,
        monthlyMaxCount: monthlyMaxCount,
        todayStats: { 
          records: totalRecords, 
          moral: moralCount, 
          teaching: teachingCount, 
          dorm: dormCount, 
          overall: overallCount 
        },
        loading: false
      });

      console.log('直接统计完成:', { moral: moralCount, teaching: teachingCount, dorm: dormCount, overall: overallCount, total: totalRecords });
    } catch (error) {
      console.error('直接统计失败:', error);
      this.setData({ loading: false });
      wx.showToast({
        title: '加载失败',
        icon: 'error',
        duration: 1500
      });
    }
  },

  // 刷新数据
  onRefresh() {
    wx.showLoading({
      title: '刷新中...'
    });

    this.loadStats().finally(() => {
      wx.hideLoading();
      wx.showToast({
        title: '数据已刷新',
        icon: 'success',
        duration: 1500
      });
    });
  },

  // 计算月度趋势统计
  calculateMonthlyStats(records) {
    const months = [];
    const now = new Date();
    
    // 生成最近6个月的月份标签
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        label: `${d.getMonth() + 1}月`,
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        count: 0
      });
    }
    
    // 统计每个月的记录数
    records.forEach(record => {
      const recordTime = record.record_time || record.created_at;
      if (recordTime) {
        const date = new Date(recordTime);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        
        const monthData = months.find(m => m.year === year && m.month === month);
        if (monthData) {
          monthData.count++;
        }
      }
    });
    
    return months.map(m => ({ label: m.label, count: m.count }));
  },

  // 计算本周统计（最近7天）
  calculateWeeklyStats(records) {
    const stats = [0, 0, 0, 0, 0, 0, 0]; // 周一到周日
    const now = new Date();
    const today = now.getDay(); // 0是周日，1-6是周一到周六
    const dayOfWeek = today === 0 ? 6 : today - 1; // 转换为0-6（周一到周日）
    
    // 获取本周起始日期（周一）
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - dayOfWeek);
    weekStart.setHours(0, 0, 0, 0);
    
    records.forEach(record => {
      const recordTime = record.record_time || record.created_at;
      if (recordTime) {
        const date = new Date(recordTime);
        const dayDiff = Math.floor((date - weekStart) / (1000 * 60 * 60 * 24));
        
        if (dayDiff >= 0 && dayDiff < 7) {
          stats[dayDiff]++;
        }
      }
    });
    
    return stats;
  },

  // 获取当前周的日期
  getCurrentWeek() {
    const weekDays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    const now = new Date();
    const today = now.getDay();
    const dayOfWeek = today === 0 ? 6 : today - 1;
    
    // 获取本周一日期
    const monday = new Date(now);
    monday.setDate(now.getDate() - dayOfWeek);
    
    // 构建包含日期信息的对象数组
    const result = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      result.push({
        day: weekDays[i],
        date: `${date.getMonth() + 1}/${date.getDate()}`
      });
    }
    return result;
  },

  // 统计卡片点击
  onStatCardTap(e) {
    const type = e.currentTarget.dataset.type;

    let title = '';
    let content = '';

    switch (type) {
      case 'records':
        title = '检查记录详情';
        content = '总共 ' + this.data.totalRecords + ' 条检查记录\n\n包括：\n• 德育检查\n• 教学评价\n• 宿舍检查\n• 整体检查';
        break;
      case 'tasks':
        title = '任务完成详情';
        content = '已完成 ' + this.data.completedTasks + ' / ' + this.data.totalTasks + ' 个任务\n\n完成率：' + this.data.taskCompletionRate + '%';
        break;
      case 'rate':
        const rate = this.data.taskCompletionRate;
        title = '完成率分析';
        let performance = '';
        if (rate >= 90) {
          performance = '🎉 优秀！任务完成率很高';
        } else if (rate >= 70) {
          performance = '👍 良好！继续保持';
        } else if (rate >= 50) {
          performance = '⚡ 一般，需要加油';
        } else {
          performance = '💪 需要努力提升';
        }
        content = '当前完成率：' + rate + '%\n\n' + performance + '\n\n建议：及时完成分配的任务，提高工作效率。';
        break;
    }

    wx.showModal({
      title: title,
      content: content,
      showCancel: false,
      confirmText: '知道了'
    });
  }
});
