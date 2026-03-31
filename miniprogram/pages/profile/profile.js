const api = require('../../utils/api.js');

Page({
  data: {
    activeView: 'main',
    recordCount: 0,
    taskCount: 0,
    completionRate: 0,
    submissions: [],
    pushEnabled: true,
    feedbackText: '',
    userInfo: null,
    isLoggedIn: false,
    wechatBound: false,
    menuItems: [],
    notifications: [],
    deptMembers: [],
    deptInfo: null,
    faqItems: []
  },

  onLoad() {
    this.initStaticData();
    this.checkLoginStatus();
    this.loadData();
  },

  // 初始化静态配置数据
  initStaticData() {
    this.setData({
      userInfo: {
        name: '加载中...',
        role: '教师',
        dept: '--',
        avatar: ''
      },
      menuItems: [
        { id: 'submissions', icon: '📄', label: '我的提交', count: 0 },
        { id: 'dept', icon: '🛡️', label: '部门信息' },
        { id: 'notifications', icon: '🔔', label: '消息通知', count: 0 },
        { id: 'settings', icon: '⚙️', label: '系统设置' },
        { id: 'help', icon: '❓', label: '帮助与反馈' }
      ],
      deptInfo: {
        name: '--',
        description: '',
        memberCount: 0
      },
      faqItems: [
        '如何重置登录密码？',
        '数据统计不准确怎么办？',
        '检查项目不全如何反馈？'
      ]
    });
  },

  onShow() {
    this.checkLoginStatus();
    this.loadData();
    this.loadUserInfo();
  },

  // 检查登录状态
  checkLoginStatus() {
    const isLoggedIn = api.isLoggedIn();
    this.setData({ isLoggedIn });
    
    if (!isLoggedIn) {
      // 未登录，显示默认信息
      this.setData({
        userInfo: {
          name: '未登录',
          role: '访客',
          dept: '--',
          avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=guest'
        }
      });
    }
    return isLoggedIn;
  },

  // 加载用户信息
  async loadUserInfo() {
    if (!api.isLoggedIn()) return;

    try {
      // 先从本地存储获取
      let userInfo = api.getUserInfo();
      
      if (userInfo) {
        this.updateUserInfoDisplay(userInfo);
      }

      // 从服务器获取最新信息
      userInfo = await api.getCurrentUser();
      this.updateUserInfoDisplay(userInfo);

      // 加载微信绑定状态
      this.loadWechatStatus();
    } catch (error) {
      console.error('加载用户信息失败:', error);
    }
  },

  // 加载微信绑定状态
  async loadWechatStatus() {
    try {
      const status = await api.getWechatStatus();
      this.setData({
        wechatBound: status.is_bound
      });
    } catch (error) {
      console.error('获取微信绑定状态失败:', error);
    }
  },

  // 点击微信绑定
  onWechatBindTap() {
    if (this.data.wechatBound) {
      wx.showModal({
        title: '微信已绑定',
        content: '您的微信已绑定当前账号，如需更换请先解绑',
        showCancel: false
      });
    } else {
      wx.showModal({
        title: '绑定微信',
        content: '请退出当前账号，在登录页面选择"账号绑定"进行微信绑定',
        confirmText: '去登录',
        success: (res) => {
          if (res.confirm) {
            const app = getApp();
            app.logout();
          }
        }
      });
    }
  },

  // 解绑微信
  async onUnbindWechat() {
    wx.showModal({
      title: '确认解绑',
      content: '解绑后将无法使用微信一键登录，确定要解绑吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '解绑中...' });
            await api.wechatUnbind();
            wx.hideLoading();
            
            this.setData({ wechatBound: false });
            
            wx.showToast({
              title: '解绑成功',
              icon: 'success'
            });
          } catch (error) {
            wx.hideLoading();
            wx.showToast({
              title: error.message || '解绑失败',
              icon: 'none'
            });
          }
        }
      }
    });
  },

  // 更新用户信息显示
  updateUserInfoDisplay(userInfo) {
    if (!userInfo) return;

    const app = getApp();
    app.updateGlobalUserInfo(userInfo);

    // 构建组织信息显示
    let deptInfo = '未分配组织';
    let deptName = '--';
    let deptDescription = '';

    if (userInfo.school_name) {
      deptInfo = userInfo.school_name;
      deptName = userInfo.school_name;
      if (userInfo.grade_name && userInfo.grade_name !== userInfo.school_name) {
        deptInfo += ` / ${userInfo.grade_name}`;
        deptName = userInfo.grade_name;
      }
      if (userInfo.class_name && userInfo.class_name !== userInfo.grade_name) {
        deptInfo += ` / ${userInfo.class_name}`;
        deptName = userInfo.class_name;
      }
      // 设置描述
      if (userInfo.class_name) {
        deptDescription = '班级';
      } else if (userInfo.grade_name) {
        deptDescription = '年级组';
      } else {
        deptDescription = '学校';
      }
    } else if (userInfo.org_name) {
      deptInfo = userInfo.org_name;
      deptName = userInfo.org_name;
      deptDescription = '组织';
    }

    this.setData({
      userInfo: {
        id: userInfo.id,
        name: userInfo.real_name || userInfo.username || '未知用户',
        role: userInfo.role_name || '教师',
        dept: deptInfo,
        avatar: userInfo.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${userInfo.username || 'default'}`
      },
      deptInfo: {
        name: deptName,
        description: deptDescription,
        memberCount: 0
      }
    });

    // 加载部门成员
    if (userInfo.org_id) {
      this.loadDeptMembers(userInfo.org_id);
    }
  },

  // 加载部门成员
  async loadDeptMembers(orgId) {
    try {
      const res = await api.getOrgTeachers(orgId);
      const currentUserId = this.data.userInfo.id;
      const members = (res.teachers || []).map((teacher, index) => ({
        id: teacher.id,
        name: teacher.real_name || teacher.username,
        role: '教师',
        avatar: teacher.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${teacher.username || index}`,
        active: teacher.id === currentUserId
      }));

      this.setData({
        deptMembers: members,
        'deptInfo.memberCount': res.total || members.length
      });
    } catch (error) {
      console.error('加载部门成员失败:', error);
    }
  },

  async loadData() {
    try {
      // 检查登录状态
      if (!api.isLoggedIn()) {
        console.log('Profile - 用户未登录，跳过数据加载');
        this.setData({
          submissions: [],
          recordCount: 0,
          menuItems: [
            { id: 'submissions', icon: '📄', label: '我的提交', count: 0 },
            { id: 'dept', icon: '🛡️', label: '部门信息' },
            { id: 'notifications', icon: '🔔', label: '消息通知', count: 0 },
            { id: 'settings', icon: '⚙️', label: '系统设置' },
            { id: 'help', icon: '❓', label: '帮助与反馈' }
          ]
        });
        return;
      }

      console.log('Profile - 开始加载数据，登录状态:', api.isLoggedIn());

      // 获取当前用户信息
      const userInfo = api.getUserInfo();
      if (!userInfo || !userInfo.id) {
        console.log('用户信息不完整，无法加载记录');
        return;
      }

      // 从API加载用户提交记录（包括德育、教学、宿舍检查）- 只显示自己录入的记录
      const params = {
        limit: 100,
        recorder_id: userInfo.id  // 只显示自己录入的记录
      };
      const [moralRes, teachingRes, dormRes] = await Promise.allSettled([
        api.getMoralRecords(params),
        api.getTeachingRecords(params),
        api.getDormRecords(params)
      ]);

      console.log('Profile - 德育记录响应:', JSON.stringify(moralRes.status === 'fulfilled' ? moralRes.value : moralRes.reason));
      console.log('Profile - 教学记录响应:', JSON.stringify(teachingRes.status === 'fulfilled' ? teachingRes.value : teachingRes.reason));
      console.log('Profile - 宿舍记录响应:', JSON.stringify(dormRes.status === 'fulfilled' ? dormRes.value : dormRes.reason));

      const moralRecords = moralRes.status === 'fulfilled' ? (moralRes.value?.records || moralRes.value?.items || []) : [];
      const teachingRecords = teachingRes.status === 'fulfilled' ? (teachingRes.value?.records || teachingRes.value?.items || []) : [];
      const dormRecords = dormRes.status === 'fulfilled' ? (dormRes.value?.records || dormRes.value?.items || []) : [];
      
      console.log('Profile - 德育记录条数:', moralRecords.length);
      console.log('Profile - 德育记录详情:', JSON.stringify(moralRecords.slice(0, 3)));
      console.log('Profile - 教学记录条数:', teachingRecords.length);
      console.log('Profile - 宿舍记录条数:', dormRecords.length);
      
      const allRecords = [...moralRecords, ...teachingRecords, ...dormRecords];
      console.log('Profile - 合并后记录数:', allRecords.length);
      console.log('Profile - 合并后记录详情:', JSON.stringify(allRecords));

      // 格式化记录（与首页home.js的字段映射保持一致）
      const formattedRecords = allRecords.map(record => {
        // 判断记录类型
        // 教学检查包括：有teacher_id的普通教学检查、source='overall'的学科检查
        const isTeaching = !!record.teacher_id || !!record.teacher_name || 
                          record.source === 'overall' ||
                          (record.check_item && !record.student_name && record.source !== 'dorm');
        const isDorm = record.source === 'dorm' || 
                      (record.description && record.description.includes('宿舍'));
        const type = isTeaching ? 'TEACHING' : (isDorm ? 'DORM' : 'MORAL');
        
        // 获取类型样式类和标签
        const typeClassMap = {
          'MORAL': 'moral',
          'TEACHING': 'teaching',
          'DORM': 'dorm',
          'OVERALL': 'overall'
        };
        const typeLabelMap = {
          'MORAL': '德育',
          'TEACHING': '教学',
          'DORM': '宿舍',
          'OVERALL': '整体'
        };
        
        // 构建位置信息：德育显示年级-班级，教学显示年级-教研组，宿舍显示楼栋-房间
        let locationInfo = '';
        if (isTeaching) {
          // 教学记录显示年级和教研组（学科）
          // 对于整体检查（source='overall'），使用 grade_name + category
          // 对于普通教学检查，使用 grade_name + teacher_subject
          const isOverall = record.source === 'overall' || !record.teacher_id;
          const gradeName = record.grade_name || '';
          const subjectName = isOverall ? (record.category || '') : (record.teacher_subject || record.subject || '');
          if (gradeName && subjectName) {
            locationInfo = `${gradeName} · ${subjectName}`;
          } else if (gradeName) {
            locationInfo = gradeName;
          } else if (subjectName) {
            locationInfo = subjectName;
          }
        } else if (isDorm) {
          // 宿舍记录从description中提取楼栋-房间信息
          const dormMatch = record.description ? record.description.match(/([^|]+?)(\d+)层([^\s|]+)房间/) : null;
          if (dormMatch) {
            locationInfo = `${dormMatch[1]}${dormMatch[2]}层${dormMatch[3]}`;
          } else {
            locationInfo = record.building ? `${record.building}${record.floor || ''}层${record.room || ''}` : '';
          }
        } else {
          // 德育记录显示年级-班级
          const gradeName = record.grade_name || '';
          const className = record.class_name || '';
          if (gradeName && className) {
            locationInfo = `${gradeName}-${className}`;
          } else if (className) {
            locationInfo = className;
          } else if (gradeName) {
            locationInfo = gradeName;
          }
        }
        
        // 判断是否为整体检查（学科检查）
        const isOverall = record.source === 'overall' || !record.teacher_id;
        
        return {
          ...record,
          id: record.id,
          type: type,
          typeClass: typeClassMap[type] || 'moral',
          typeLabel: typeLabelMap[type] || '检查',
          // 目标：德育是学生（班级整体检查时显示"班级整体"），教学是教师（整体检查显示"学科检查"），宿舍显示房间
          target: isTeaching ? (record.teacher_name || (isOverall ? '学科检查' : '未知教师'))
                           : (isDorm ? (record.room || '宿舍检查') 
                                     : (record.student_name || record.target || (record.source === 'overall' ? '班级整体' : '未知学生'))),
          // 类别：使用major_category
          category: record.major_category || record.check_item || '常规检查',
          // 项目：使用check_item或content
          item: record.check_item || record.content || record.minor_category || '',
          // 位置信息：年级-班级/教研组/宿舍位置
          locationInfo: locationInfo,
          // 格式化时间
          formattedTime: this.formatTime(new Date(record.record_time || record.created_at).getTime()),
          // 其他字段保持兼容
          scoreChange: record.score_change || record.score || 0
        };
      });

      // 加载任务统计
      let tasks = [];
      let completionRate = 0;
      try {
        const today = new Date();
        const todayDate = today.toISOString().split('T')[0];
        const tasksRes = await api.getTasks({ task_date: todayDate });
        tasks = tasksRes?.data?.tasks || tasksRes?.tasks || [];
        const completedTasks = tasks.filter(t => t.status === 'completed').length;
        completionRate = tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0;
      } catch (taskError) {
        console.warn('Profile - 加载任务失败:', taskError);
      }

      console.log('Profile - 最终 submissions 数量:', formattedRecords.length);
      console.log('Profile - submissions 数据:', JSON.stringify(formattedRecords.slice(0, 3)));

      // 构建菜单项（动态数据）
      const menuItems = [
        { id: 'submissions', icon: '📄', label: '我的提交', count: allRecords.length },
        { id: 'dept', icon: '🛡️', label: '部门信息' },
        { id: 'notifications', icon: '🔔', label: '消息通知', count: 0 },
        { id: 'settings', icon: '⚙️', label: '系统设置' },
        { id: 'help', icon: '❓', label: '帮助与反馈' }
      ];

      console.log('Profile - 设置数据: recordCount=', allRecords.length, ', submissions=', formattedRecords.length);

      this.setData({
        recordCount: allRecords.length,
        taskCount: tasks.length,
        completionRate: completionRate,
        submissions: formattedRecords,
        notifications: [],
        menuItems: menuItems
      });

      console.log('Profile - 数据设置完成');
    } catch (error) {
      console.error('Profile - 加载数据失败:', error);
      // 确保出错时也有默认数据
      this.setData({
        submissions: [],
        recordCount: 0,
        menuItems: [
          { id: 'submissions', icon: '📄', label: '我的提交', count: 0 },
          { id: 'dept', icon: '🛡️', label: '部门信息' },
          { id: 'notifications', icon: '🔔', label: '消息通知', count: 0 },
          { id: 'settings', icon: '⚙️', label: '系统设置' },
          { id: 'help', icon: '❓', label: '帮助与反馈' }
        ]
      });
    }
  },

  // 菜单点击处理
  onMenuClick(e) {
    const id = e.currentTarget.dataset.id;
    const allowedViews = ['submissions', 'dept', 'notifications', 'settings', 'help'];
    if (allowedViews.includes(id)) {
      this.setData({
        activeView: id
      });
    }
  },

  // 返回主页面
  onBackToMain() {
    this.setData({
      activeView: 'main'
    });
  },

  // 清除缓存
  onClearCache() {
    wx.showModal({
      title: '清除缓存',
      content: '确定清除本地缓存吗？这不会影响已同步到云端的数据。',
      success: (res) => {
        if (res.confirm) {
          wx.showToast({
            title: '本地缓存已清理',
            icon: 'success'
          });
        }
      }
    });
  },

  // 切换推送通知
  onTogglePush(e) {
    this.setData({
      pushEnabled: e.detail.value
    });
  },

  // 提交反馈
  onSubmitFeedback() {
    if (!this.data.feedbackText.trim()) return;

    wx.showToast({
      title: '感谢您的反馈！',
      icon: 'success'
    });

    this.setData({
      feedbackText: '',
      activeView: 'main'
    });
  },

  // 反馈文本输入
  onFeedbackInput(e) {
    this.setData({
      feedbackText: e.detail.value
    });
  },

  // 忽略所有通知
  onIgnoreAllNotifications() {
    wx.showModal({
      title: '忽略通知',
      content: '确定要忽略所有未读通知吗？',
      success: (res) => {
        if (res.confirm) {
          this.setData({ notifications: [] });
          wx.showToast({
            title: '已忽略所有通知',
            icon: 'success'
          });
        }
      }
    });
  },

  // 导出记录
  async onExportRecords() {
    try {
      // 获取当前用户信息
      const userInfo = api.getUserInfo();
      if (!userInfo || !userInfo.id) {
        wx.showToast({
          title: '请先登录',
          icon: 'none'
        });
        return;
      }

      // 只导出自己录入的记录
      const params = {
        limit: 50,
        recorder_id: userInfo.id
      };
      const [moralRes, teachingRes] = await Promise.allSettled([
        api.getMoralRecords(params),
        api.getTeachingRecords(params)
      ]);

      const moralRecords = moralRes.status === 'fulfilled' ? (moralRes.value.records || []) : [];
      const teachingRecords = teachingRes.status === 'fulfilled' ? (teachingRes.value.records || []) : [];
      const allRecords = [...moralRecords, ...teachingRecords];

      if (allRecords.length === 0) {
        wx.showToast({
          title: '暂无记录可导出',
          icon: 'none'
        });
        return;
      }

      // 格式化数据
      let content = '检查记录导出\n\n';
      allRecords.forEach(record => {
        const recordTime = record.record_time || record.created_at;
        const date = new Date(recordTime);
        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
        content += `【${dateStr}】\n`;
        content += `类型：${record.teacher_name ? '教学评价' : '德育检查'}\n`;
        content += `对象：${record.student_name || record.teacher_name || '未知'}\n`;
        content += `类别：${record.major_category || ''}\n`;
        content += `内容：${record.content || record.check_item || ''}\n`;
        if (record.remark) {
          content += `描述：${record.remark}\n`;
        }
        content += '------------------------\n';
      });

      // 复制到剪贴板
      wx.setClipboardData({
        data: content,
        success: () => {
          wx.showToast({
            title: '已复制到剪贴板',
            icon: 'success'
          });
        }
      });
    } catch (error) {
      console.error('导出记录失败:', error);
      wx.showToast({
        title: '导出失败',
        icon: 'none'
      });
    }
  },

  // 清空本地缓存数据
  onClearData() {
    wx.showModal({
      title: '确认清空',
      content: '确定要清空本地缓存吗？此操作不会影响已同步到服务器的数据。',
      confirmText: '清空',
      confirmColor: '#ef4444',
      success: (res) => {
        if (res.confirm) {
          wx.clearStorage();
          this.loadData();
          wx.showToast({
            title: '本地缓存已清空',
            icon: 'success'
          });
        }
      }
    });
  },

  // 退出登录
  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          // 显示退出提示
          wx.showToast({
            title: '已退出登录',
            icon: 'success',
            duration: 800
          });
          
          // 直接调用退出（不延迟，让toast和跳转同时进行）
          const app = getApp();
          app.logout();
        }
      }
    });
  },

  // 跳转到登录页
  goToLogin() {
    wx.navigateTo({
      url: '/pages/login/login'
    });
  },

  // 获取类型标签
  getTypeLabel(type) {
    const labels = {
      'MORAL': '德育检查',
      'TEACHING': '教学评价',
      'DORM': '宿舍检查',
      'OVERALL': '整体检查'
    };
    return labels[type] || type;
  },

  // 获取类型标签（短版本，用于显示）
  getTypeShortLabel(type) {
    const labels = {
      'MORAL': '德育',
      'TEACHING': '教学',
      'DORM': '宿舍',
      'OVERALL': '整体'
    };
    return labels[type] || type;
  },

  // 格式化时间戳
  formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      return `${diffMinutes}分钟前`;
    } else if (diffHours < 24) {
      return `${diffHours}小时前`;
    } else if (diffDays === 1) {
      return '昨天';
    } else if (diffDays < 7) {
      return `${diffDays}天前`;
    } else {
      return date.toLocaleDateString();
    }
  }
});
