const api = require('../../utils/api.js');

Page({
  data: {
    selectedDateTimestamp: Date.now(),
    userTasks: [],
    showTaskModal: false,
    formTitle: '',
    formDate: '',
    formStartTime: '08:00',
    formEndTime: '09:00',
    formType: 'MORAL',
    formAssignee: '本人',
    formIsDeptTask: false,
    formRemark: '',
    formQuickTime: '',
    weekDays: [],
    days: ['日', '一', '二', '三', '四', '五', '六'],
    isTodaySelected: true,
    selectedDateDisplay: '今日巡查计划',
    completedTasksCount: 0,
    totalTasksCount: 0,
    formattedSelectedDate: '',
    currentMonthDisplay: '',
    filteredTasks: [],
    deptMembers: [],
    userInfo: null,
    quickTimes: [],
    taskTypes: []
  },

  onLoad() {
    this.initStaticData();
    this.setWeekDays();
    this.loadTasks();
    this.loadUserInfo();
  },

  // 初始化静态配置数据
  initStaticData() {
    this.setData({
      quickTimes: [
        { label: '上午', start: '08:00', end: '12:00' },
        { label: '下午', start: '14:00', end: '18:00' },
        { label: '晚间', start: '19:00', end: '22:00' },
        { label: '全天', start: '08:00', end: '22:00' }
      ],
      taskTypes: [
        { id: 'MORAL', label: '德育检查', icon: '📋', active: '#3b82f6', inactive: '#dbeafe' },
        { id: 'TEACHING', label: '教学评价', icon: '📚', active: '#10b981', inactive: '#d1fae5' },
        { id: 'DORM', label: '宿舍检查', icon: '🏠', active: '#8b5cf6', inactive: '#ede9fe' },
        { id: 'GENERAL', label: '整体检查', icon: '🔍', active: '#f59e0b', inactive: '#fef3c7' }
      ]
    });
  },

  onShow() {
    this.loadTasks();
  },

  // 获取当前选中日期（确保返回Date对象）
  getSelectedDate() {
    return new Date(this.data.selectedDateTimestamp);
  },

  // 加载用户信息和部门成员
  async loadUserInfo() {
    try {
      const userInfo = api.getUserInfo();
      if (userInfo) {
        this.setData({
          userInfo,
          formAssignee: '本人 (' + (userInfo.real_name || userInfo.username) + ')'
        });
        // 加载部门成员
        if (userInfo.org_id) {
          this.loadDeptMembers(userInfo.org_id);
        } else {
          // 如果没有org_id，尝试加载所有教师
          this.loadAllTeachers();
        }
      }
    } catch (error) {
      console.error('加载用户信息失败:', error);
    }
  },

  // 加载部门成员
  async loadDeptMembers(orgId) {
    try {
      const res = await api.getOrgTeachers(orgId);
      const currentUserId = this.data.userInfo ? this.data.userInfo.id : null;
      const teachers = res.teachers || res.items || res || [];

      // 如果返回的数据为空，尝试加载所有教师
      if (!teachers.length) {
        this.loadAllTeachers();
        return;
      }

      const members = teachers.map((teacher, index) => ({
        id: teacher.id,
        name: teacher.real_name || teacher.username || teacher.name,
        isDept: false,
        active: teacher.id === currentUserId
      }));

      // 添加部门选项
      members.unshift({
        id: 'dept',
        name: '整个部门',
        isDept: true,
        active: false
      });

      this.setData({
        deptMembers: members
      });
    } catch (error) {
      console.error('加载部门成员失败:', error);
      // 失败时尝试加载所有教师
      this.loadAllTeachers();
    }
  },

  // 加载所有教师（备用方案）
  async loadAllTeachers() {
    try {
      const res = await api.getAllTeachers(50);
      const currentUserId = this.data.userInfo ? this.data.userInfo.id : null;
      const teachers = res.teachers || res.items || res || [];

      const members = teachers.map((teacher, index) => ({
        id: teacher.id,
        name: teacher.real_name || teacher.username || teacher.name,
        isDept: false,
        active: teacher.id === currentUserId
      }));

      // 添加部门选项
      members.unshift({
        id: 'dept',
        name: '整个部门',
        isDept: true,
        active: false
      });

      this.setData({
        deptMembers: members
      });
    } catch (error) {
      console.error('加载教师列表失败:', error);
      // 至少添加一个默认选项
      this.setData({
        deptMembers: [{
          id: 'dept',
          name: '整个部门',
          isDept: true,
          active: false
        }]
      });
    }
  },

  // 设置周视图日期
  setWeekDays() {
    const date = this.getSelectedDate();
    const start = new Date(date);
    start.setDate(date.getDate() - date.getDay());
    const selectedDateStr = date.toDateString();
    const todayStr = new Date().toDateString();

    const weekDays = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const dateStr = d.toDateString();
      weekDays.push({
        date: d.getTime(), // 存储时间戳
        dayNumber: d.getDate(), // 预先计算日期数字
        className: (dateStr === selectedDateStr ? 'selected' : '') + ' ' + (dateStr === todayStr ? 'today' : '')
      });
    }

    // 更新日期显示
    const isToday = selectedDateStr === todayStr;
    const displayText = isToday ? '今日巡查计划' : (date.getMonth() + 1) + '月' + date.getDate() + '日巡查计划';

    // 格式化日期显示
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const formattedSelectedDate = year + '-' + month + '-' + day;

    // 计算当前月份显示
    const currentMonthDisplay = date.getFullYear() + '年' + (date.getMonth() + 1) + '月';

    this.setData({
      weekDays,
      isTodaySelected: isToday,
      selectedDateDisplay: displayText,
      formattedSelectedDate,
      currentMonthDisplay
    });

    // 加载当天的任务
    this.loadTasks();
  },

  // 格式化日期为YYYY-MM-DD（使用本地时间）
  formatDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
  },

  // 加载任务
  async loadTasks() {
    try {
      const dateKey = this.formatDateKey(this.getSelectedDate());
      const res = await api.getTasks({ task_date: dateKey });
      const userTasks = (res.data?.tasks || []).map(task => ({
        ...task,
        taskTypeClass: this.getTaskTypeClass(task.task_type || task.type)
      }));
      this.setData({ userTasks });
      this.updateTaskStats();
    } catch (error) {
      console.error('加载任务失败:', error);
      this.setData({ userTasks: [] });
      this.updateTaskStats();
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

  // 更新任务统计
  updateTaskStats() {
    const filteredTasks = this.getFilteredTasks();
    const completedTasksCount = filteredTasks.filter(t => t.status === 'completed').length;
    const totalTasksCount = filteredTasks.length;
    
    this.setData({
      filteredTasks,
      completedTasksCount,
      totalTasksCount
    });
  },

  // 获取筛选后的任务
  getFilteredTasks() {
    const dateKey = this.formatDateKey(this.getSelectedDate());
    return this.data.userTasks.filter(task => {
      const taskDate = task.task_date || task.date;
      return taskDate === dateKey;
    });
  },

  // 日期导航（按周翻页）
  changeDate(e) {
    const offset = e.currentTarget.dataset.offset;
    const currentDate = this.getSelectedDate();
    // 按周翻页，一次移动7天
    currentDate.setDate(currentDate.getDate() + (offset * 7));
    this.setData({
      selectedDateTimestamp: currentDate.getTime()
    });
    this.setWeekDays();
  },

  // 选择具体日期
  selectDate(e) {
    const index = e.currentTarget.dataset.index;
    const selectedDay = this.data.weekDays[index];
    this.setData({
      selectedDateTimestamp: selectedDay.date
    });
    this.setWeekDays();
  },

  // 回到今天
  goToToday() {
    this.setData({
      selectedDateTimestamp: Date.now()
    });
    this.setWeekDays();
  },

  // 显示创建任务模态框
  showCreateModal() {
    // 获取当前时间
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    // 设置开始时间为当前时间
    const startTime = String(currentHour).padStart(2, '0') + ':' + String(currentMinute).padStart(2, '0');

    // 设置结束时间为开始时间后1小时
    const endHour = Math.min(currentHour + 1, 23);
    const endTime = String(endHour).padStart(2, '0') + ':' + String(currentMinute).padStart(2, '0');

    // 获取用户姓名
    const userInfo = this.data.userInfo || api.getUserInfo();
    const userName = userInfo ? (userInfo.real_name || userInfo.username) : '教师';

    // 获取今天的日期字符串
    const today = new Date();
    const todayDate = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');

    this.setData({
      showTaskModal: true,
      formTitle: '',
      formDate: this.data.formattedSelectedDate || todayDate,
      formStartTime: startTime,
      formEndTime: endTime,
      formType: 'MORAL',
      formAssignee: '本人 (' + userName + ')',
      formIsDeptTask: false,
      formRemark: '',
      formQuickTime: '',
      todayDate: todayDate
    });
  },

  // 关闭模态框
  closeModal() {
    this.setData({
      showTaskModal: false
    });
  },

  // 日期选择
  onDateChange(e) {
    this.setData({
      formDate: e.detail.value
    });
  },

  // 开始时间选择
  onStartTimeChange(e) {
    this.setData({
      formStartTime: e.detail.value,
      formQuickTime: '' // 清除快捷选择
    });
  },

  // 结束时间选择
  onEndTimeChange(e) {
    this.setData({
      formEndTime: e.detail.value,
      formQuickTime: '' // 清除快捷选择
    });
  },

  // 快捷时间选择
  selectQuickTime(e) {
    const time = e.currentTarget.dataset.time;
    this.setData({
      formStartTime: time.start,
      formEndTime: time.end,
      formQuickTime: time.label
    });
  },

  // 指派成员选择
  selectAssignee(e) {
    const member = e.currentTarget.dataset.member;
    this.setData({
      formAssignee: member.name,
      formIsDeptTask: member.isDept
    });
  },

  // 类型选择
  selectType(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({
      formType: type
    });
  },

  // 输入处理
  onInputChange(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({
      [field]: e.detail.value
    });
  },

  // 创建任务
  async createTask() {
    const { formTitle, formDate, formStartTime, formEndTime, formType, formAssignee, formRemark, formIsDeptTask, deptMembers } = this.data;

    if (!formTitle.trim()) {
      wx.showToast({
        title: '请填写任务名称',
        icon: 'none'
      });
      return;
    }

    // 使用表单选择的日期，如果没有则使用当前选中日期
    const taskDate = formDate || this.formatDateKey(this.getSelectedDate());

    // 确定指派类型和指派对象
    let assigneeType = 'self';
    let assigneeId = null;
    let assigneeName = null;

    if (formIsDeptTask) {
      assigneeType = 'dept';
    } else {
      // 查找选中的成员
      const selectedMember = deptMembers.find(m => m.name === formAssignee);
      if (selectedMember && selectedMember.id !== 'dept' && !selectedMember.isDept) {
        assigneeType = 'user';
        assigneeId = selectedMember.id;
        assigneeName = selectedMember.name;
      }
    }

    try {
      const taskData = {
        title: formTitle,
        task_date: taskDate,
        start_time: formStartTime,
        end_time: formEndTime,
        task_type: formType,
        assignee_type: assigneeType,
        assignee_id: assigneeId,
        assignee_name: assigneeName || formAssignee,
        remark: formRemark || ''
      };

      await api.createTask(taskData);

      this.loadTasks();
      this.closeModal();

      wx.showToast({
        title: '任务创建成功',
        icon: 'success'
      });
    } catch (error) {
      console.error('创建任务失败:', error);
      wx.showToast({
        title: '创建失败，请重试',
        icon: 'none'
      });
    }
  },

  // 开始执行任务
  async startTask(e) {
    const task = e.currentTarget.dataset.task;
    try {
      await api.startTask(task.id);
      this.loadTasks();
      wx.showToast({
        title: '任务已开始',
        icon: 'success'
      });
    } catch (error) {
      console.error('开始任务失败:', error);
      // 如果API失败，直接跳转
      const typeMap = {
        'MORAL': 'moral',
        'TEACHING': 'teaching',
        'DORM': 'dorm',
        'GENERAL': 'general'
      };
      const taskType = task.task_type || task.type;
      wx.navigateTo({
        url: '/pages/inspectForm/inspectForm?type=' + (typeMap[taskType] || 'moral')
      });
    }
  },

  // 完成任务
  async completeTask(e) {
    const task = e.currentTarget.dataset.task;
    try {
      await api.completeTask(task.id);
      this.loadTasks();
      wx.showToast({
        title: '任务已完成',
        icon: 'success'
      });
    } catch (error) {
      console.error('完成任务失败:', error);
      wx.showToast({
        title: '操作失败，请重试',
        icon: 'none'
      });
    }
  }
});
