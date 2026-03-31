const api = require('./utils/api.js');

App({
  globalData: {
    userInfo: null,
    isLoggedIn: false
  },

  onLaunch() {
    // 初始化存储
    this.initStorage();
    
    // 检查登录状态
    this.checkLoginStatus();
  },

  onShow() {
    // 每次显示时检查登录状态
    this.checkLoginStatus();
  },

  // 初始化存储
  initStorage() {
    try {
      // 确保存储中有必要的初始化数据
      const records = wx.getStorageSync('edu_inspect_records') || [];
      const tasks = wx.getStorageSync('edu_inspect_tasks') || [];
      
      if (!wx.getStorageSync('edu_inspect_records')) {
        wx.setStorageSync('edu_inspect_records', records);
      }
      if (!wx.getStorageSync('edu_inspect_tasks')) {
        wx.setStorageSync('edu_inspect_tasks', tasks);
      }
    } catch (e) {
      console.error('初始化存储失败', e);
    }
  },

  // 检查登录状态
  checkLoginStatus() {
    const isLoggedIn = api.isLoggedIn();
    const userInfo = api.getUserInfo();
    
    this.globalData.isLoggedIn = isLoggedIn;
    this.globalData.userInfo = userInfo;

    // 获取当前页面路径
    const pages = getCurrentPages();
    const currentPage = pages.length > 0 ? pages[pages.length - 1] : null;
    const currentRoute = currentPage ? currentPage.route : '';

    // 如果未登录且当前不在登录页，跳转到登录页
    if (!isLoggedIn && currentRoute && !currentRoute.includes('login')) {
      wx.navigateTo({
        url: '/pages/login/login'
      });
    }

    // 如果已登录且当前在登录页，跳转到首页
    if (isLoggedIn && currentRoute && currentRoute.includes('login')) {
      wx.switchTab({
        url: '/pages/home/home'
      });
    }

    return isLoggedIn;
  },

  // 获取全局用户信息
  getGlobalUserInfo() {
    return this.globalData.userInfo;
  },

  // 更新全局用户信息
  updateGlobalUserInfo(userInfo) {
    this.globalData.userInfo = userInfo;
    api.setUserInfo(userInfo);
  },

  // 退出登录
  logout() {
    // 清除token和用户信息
    api.clearToken();
    
    // 清除全局数据
    this.globalData.isLoggedIn = false;
    this.globalData.userInfo = null;
    
    // 清除数据服务缓存
    const dataService = require('./utils/dataService.js');
    dataService.clearCache && dataService.clearCache();
    
    // 清除本地缓存的其他数据（可选）
    try {
      wx.removeStorageSync('edu_inspect_records');
      wx.removeStorageSync('edu_inspect_tasks');
    } catch (e) {
      console.error('清除缓存失败', e);
    }
    
    // 跳转到登录页（使用reLaunch关闭所有页面）
    wx.reLaunch({
      url: '/pages/login/login',
      success: () => {
        console.log('退出登录成功，已跳转到登录页');
      },
      fail: (err) => {
        console.error('reLaunch失败:', err);
        // 备选方案：使用redirectTo
        wx.redirectTo({
          url: '/pages/login/login',
          fail: (err2) => {
            console.error('redirectTo也失败:', err2);
            // 最后尝试navigateTo
            wx.navigateTo({
              url: '/pages/login/login'
            });
          }
        });
      }
    });
  }
});
