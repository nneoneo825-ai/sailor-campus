const api = require('../../utils/api.js');

Page({
  data: {
    greeting: '你好',
    userName: '加载中...',
    campus: '--',
    schoolId: null,
    quickEntries: [],
    tasks: [],
    recentRecords: [],
    taskCount: 0,
    isLoading: false  // 防止重复加载
  },

  onLoad() {
    this.initStaticData();
    this.loadUserInfo();
  },

  // 初始化静态配置数据
  initStaticData() {
    this.setData({
      quickEntries: [
        { id: 'MORAL', label: '德育检查', color: '#3b82f6', iconType: 'clipboard-check' },
        { id: 'TEACHING', label: '教学检查', color: '#10b981', iconType: 'book-open' },
        { id: 'DORM', label: '宿舍检查', color: '#8b5cf6', iconType: 'home' },
        { id: 'OVERALL', label: '整体检查', color: '#6366f1', iconType: 'layout-dashboard' }
      ]
    });
  },

  onShow() {
    // 只有当用户信息已加载时才加载数据
    if (this.data.userName !== '加载中...') {
      this.loadData();
    }
  },

  // 加载用户信息
  async loadUserInfo() {
    if (this.data.isLoading) return;
    this.setData({ isLoading: true });

    try {
      // 先从本地获取
      const userInfo = api.getUserInfo();
      console.log('本地用户信息:', userInfo);
      if (userInfo && (userInfo.real_name || userInfo.username)) {
        this.updateUserInfoDisplay(userInfo);
      }

      // 从服务器获取最新信息
      const freshUserInfo = await api.getCurrentUser();
      console.log('服务器用户信息:', freshUserInfo);
      if (freshUserInfo) {
        this.updateUserInfoDisplay(freshUserInfo);
      }
    } catch (error) {
      console.error('加载用户信息失败:', error);
      // 如果加载失败，显示默认信息
      this.setData({
        userName: '教师',
        campus: '--'
      });
    } finally {
      this.setData({ isLoading: false });
    }
  },

  // 更新用户信息显示
  updateUserInfoDisplay(userInfo) {
    if (!userInfo) return;

    // 根据时间生成问候语
    const hour = new Date().getHours();
    let greeting = '你好';
    if (hour >= 5 && hour < 12) {
      greeting = '早安';
    } else if (hour >= 12 && hour < 18) {
      greeting = '下午好';
    } else {
      greeting = '晚上好';
    }

    // 构建校区显示信息
    let campusDisplay = '--';
    let schoolId = null;

    if (userInfo.school_id) {
      schoolId = userInfo.school_id;
      campusDisplay = userInfo.school_name || '校区';
    } else if (userInfo.org_id) {
      schoolId = userInfo.org_id;
      campusDisplay = userInfo.org_name || '校区';
    }

    this.setData({
      greeting: greeting,
      userName: userInfo.real_name || userInfo.username || '教师',
      campus: campusDisplay,
      schoolId: schoolId
    }, () => {
      // 设置完用户信息后加载数据
      this.loadData();
    });
  },

  loadData() {
    // 加载任务和最近记录
    this.loadTodayTasks();
    this.loadRecentRecords();
  },

  // 加载今日任务
  async loadTodayTasks() {
    try {
      // 获取今天的日期
      const today = new Date();
      const todayDate = today.getFullYear() + '-' +
        String(today.getMonth() + 1).padStart(2, '0') + '-' +
        String(today.getDate()).padStart(2, '0');

      // 从API获取今日任务
      const res = await api.getTasks({ task_date: todayDate, page_size: 5 });
      const tasks = (res.data?.tasks || []).map(task => ({
        ...task,
        taskTypeClass: this.getTaskTypeClass(task.task_type || task.type)
      }));

      this.setData({
        tasks: tasks.slice(0, 3),
        taskCount: tasks.length
      });
    } catch (error) {
      console.log('API获取任务失败:', error);
      this.setData({
        tasks: [],
        taskCount: 0
      });
    }
  },

  // 获取任务类型样式类名
  getTaskTypeClass(type) {
    const typeMap = {
      'MORAL': 'moral',
      'TEACHING': 'teaching',
      'DORM': 'dorm',
      'GENERAL': 'general'
    };
    return typeMap[type] || 'moral';
  },

  // 加载最近记录
  async loadRecentRecords() {
    try {
      // 获取当前用户信息
      const userInfo = api.getUserInfo();
      if (!userInfo || !userInfo.id) {
        console.log('用户信息不完整，无法加载记录');
        this.setData({ recentRecords: [] });
        return;
      }

      // 构建查询参数：只查询当前用户录入的记录
      const params = {
        limit: 100,
        page_size: 100,
        recorder_id: userInfo.id  // 只显示自己录入的记录
      };

      // 并行获取德育、教学和宿舍检查记录
      const [moralRes, teachingRes, dormRes] = await Promise.allSettled([
        api.getMoralRecords(params),
        api.getTeachingRecords(params),
        api.getDormRecords(params)
      ]);

      console.log('德育记录:', moralRes.status === 'fulfilled' ? moralRes.value : moralRes.reason);
      console.log('教学记录:', teachingRes.status === 'fulfilled' ? teachingRes.value : teachingRes.reason);
      console.log('宿舍记录:', dormRes.status === 'fulfilled' ? dormRes.value : dormRes.reason);

      // 处理德育记录
      let moralRecords = [];
      if (moralRes.status === 'fulfilled') {
        const moralData = moralRes.value.records || moralRes.value.items || [];
        moralRecords = moralData.map(record => ({
          id: 'moral-' + record.id,
          type: 'MORAL',
          typeName: '德育检查',
          target: record.student_name || record.target || '未知学生',
          gradeName: record.grade_name || '',
          className: record.class_name || '',
          majorCategory: record.major_category || '',
          minorCategory: record.minor_category || '',
          content: record.content || record.rule_snapshot || '',
          scoreChange: record.score_change || 0,
          recordTime: new Date(record.record_time || record.created_at).getTime(),
          timestamp: this.formatTime(new Date(record.record_time || record.created_at).getTime())
        }));
      }

      // 处理教学检查记录
      let teachingRecords = [];
      if (teachingRes.status === 'fulfilled') {
        const teachingData = teachingRes.value.records || teachingRes.value.items || [];
        console.log('教学记录API原始返回:', teachingRes.value);
        console.log('教学记录原始数据条数:', teachingData.length);
        teachingRecords = teachingData.map(record => {
          console.log('处理教学记录:', JSON.stringify(record));
          // 判断是否为整体检查记录（source='overall' 或 teacher_id 为 null）
          const isOverall = record.source === 'overall' || !record.teacher_id;
          // 构建显示信息
          const gradeName = record.grade_name || '';
          // 对于整体检查（学科检查），使用 category 作为教研组/学科
          // 注意：category 字段在数据库中存储的是学科/教研组（如数学、生物）
          let className = '';
          if (isOverall) {
            className = record.category || '';
            console.log(`  [整体检查] record.category=${record.category}, className=${className}`);
          } else {
            className = record.teacher_subject || '';
            console.log(`  [普通检查] record.teacher_subject=${record.teacher_subject}, className=${className}`);
          }
          const target = isOverall ? '学科检查' : (record.teacher_name || record.target || '未知教师');
          console.log(`  -> 最终: gradeName=${gradeName}, className=${className}, target=${target}`);
          return {
            id: 'teaching-' + record.id,
            type: 'TEACHING',
            typeName: '教学检查',
            target: target,
            gradeName: gradeName,
            className: className,
            majorCategory: record.major_category || '',
            minorCategory: record.minor_category || '',
            content: record.content || record.check_item || '',
            scoreChange: record.score || record.score_change || 0,
            recordTime: new Date(record.record_time || record.created_at).getTime(),
            timestamp: this.formatTime(new Date(record.record_time || record.created_at).getTime()),
            isOverall: isOverall  // 标记是否为整体检查
          };
        });
      } else {
        console.error('教学记录API调用失败:', teachingRes.reason);
      }

      // 处理宿舍检查记录
      let dormRecords = [];
      if (dormRes.status === 'fulfilled') {
        const dormData = dormRes.value.records || dormRes.value.items || [];
        dormRecords = dormData.map(record => ({
          id: 'dorm-' + record.id,
          type: 'DORM',
          typeName: '宿舍检查',
          target: record.student_name || '宿舍检查',
          gradeName: record.grade_name || '',
          className: record.class_name || '',
          majorCategory: record.major_category || '',
          minorCategory: record.minor_category || '',
          content: record.rule_snapshot || '',
          scoreChange: record.score_change || 0,
          recordTime: new Date(record.record_time).getTime(),
          timestamp: this.formatTime(new Date(record.record_time).getTime())
        }));
      } else {
        console.error('宿舍记录API调用失败:', dormRes.reason);
      }

      console.log('处理后德育记录:', moralRecords.length, '条');
      console.log('处理后教学记录:', teachingRecords.length, '条');
      console.log('处理后宿舍记录:', dormRecords.length, '条');

      // 合并记录并按时间排序
      const allRecords = [...moralRecords, ...teachingRecords, ...dormRecords]
        .sort((a, b) => b.recordTime - a.recordTime);

      this.setData({
        recentRecords: allRecords
      });
    } catch (error) {
      console.log('API获取记录失败:', error);
      this.setData({
        recentRecords: []
      });
    }
  },

  // 跳转到检查表单
  navigateToInspect(e) {
    const type = e.currentTarget.dataset.type.toLowerCase();
    wx.navigateTo({
      url: `/pages/inspectForm/inspectForm?type=${type}`
    });
  },

  // 跳转到日程
  navigateToSchedule() {
    wx.switchTab({
      url: '/pages/schedule/schedule'
    });
  },

  // 跳转到统计
  navigateToStats() {
    wx.switchTab({
      url: '/pages/stats/stats'
    });
  },

  // 点击任务项
  onTaskTap() {
    this.navigateToSchedule();
  },

  // 格式化时间
  formatTime(timestamp) {
    const date = new Date(timestamp);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  },

  // 点击通知图标
  onNotificationTap() {
    wx.switchTab({
      url: '/pages/profile/profile'
    });
  },

  // 发布新任务
  onAddTask() {
    this.navigateToSchedule();
  }
});
