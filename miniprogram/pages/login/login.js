const api = require('../../utils/api.js');

Page({
  data: {
    loginMode: 'wechat', // wechat: 微信登录, bind: 账号绑定
    isLoading: false,
    username: '',
    password: '',
    showServerConfig: false,
    serverUrl: '',
    currentUrl: '',
    logoTapCount: 0
  },
  _isLogging: false, // 同步变量，用于防止快速重复点击

  onLoad() {
    // 更新当前服务器地址显示
    this.setData({
      currentUrl: api.getBaseUrl()
    });

    // 检查是否已登录
    if (api.isLoggedIn()) {
      wx.switchTab({
        url: '/pages/home/home'
      });
    }
  },

  // Logo点击事件（点击5次显示服务器配置）
  onLogoTap() {
    let count = this.data.logoTapCount + 1;
    if (count >= 5) {
      this.setData({
        showServerConfig: !this.data.showServerConfig,
        serverUrl: api.getBaseUrl(),
        logoTapCount: 0
      });
    } else {
      this.setData({ logoTapCount: count });
      // 2秒后重置计数
      this._logoTimer = setTimeout(() => {
        this.setData({ logoTapCount: 0 });
      }, 2000);
    }
  },

  // 服务器地址输入
  onServerUrlInput(e) {
    this.setData({
      serverUrl: e.detail.value
    });
  },

  // 保存服务器地址
  onSaveServerUrl() {
    const url = this.data.serverUrl.trim();
    if (!url) {
      wx.showToast({
        title: '请输入服务器地址',
        icon: 'none'
      });
      return;
    }

    // 简单验证URL格式
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      wx.showToast({
        title: '地址需以 http:// 或 https:// 开头',
        icon: 'none'
      });
      return;
    }

    api.setBaseUrl(url);
    this.setData({
      currentUrl: url,
      showServerConfig: false
    });
    wx.showToast({
      title: '服务器地址已保存',
      icon: 'success'
    });
  },

  // 切换到绑定模式
  switchToBindMode() {
    this.setData({
      loginMode: 'bind'
    });
  },

  // 切换到微信登录
  switchToWechatLogin() {
    this.setData({
      loginMode: 'wechat',
      username: '',
      password: ''
    });
  },

  // 用户名输入
  onUsernameInput(e) {
    this.setData({
      username: e.detail.value
    });
  },

  // 密码输入
  onPasswordInput(e) {
    this.setData({
      password: e.detail.value
    });
  },

  // 微信登录
  async onWechatLogin() {
    if (this.data.isLoading || this._isLogging) return;

    this._isLogging = true;
    this.setData({ isLoading: true });

    try {
      // 调用微信登录获取 code
      const loginRes = await new Promise((resolve, reject) => {
        wx.login({
          success: resolve,
          fail: reject
        });
      });

      if (!loginRes.code) {
        throw new Error('微信登录失败');
      }

      // 获取用户信息（可选）
      let userInfo = null;
      try {
        const profileRes = await new Promise((resolve) => {
          wx.getUserProfile({
            desc: '用于完善用户资料',
            success: resolve,
            fail: () => resolve({ userInfo: null })
          });
        });
        userInfo = profileRes.userInfo;
      } catch (e) {
        // 用户拒绝授权，继续登录流程
      }

      // 调用后端登录接口
      const data = await api.wechatLogin(loginRes.code, userInfo);

      wx.showToast({
        title: '登录成功',
        icon: 'success'
      });

      // 延迟跳转到首页
      this._loginTimer = setTimeout(() => {
        wx.switchTab({
          url: '/pages/home/home'
        });
      }, 1000);

    } catch (error) {
      console.error('登录失败:', error);
      
      // 如果是未绑定用户，切换到绑定模式
      if (error.message && error.message.includes('未找到关联用户')) {
        wx.showModal({
          title: '需要绑定账号',
          content: '您的微信尚未绑定系统账号，请先绑定',
          showCancel: false,
          success: () => {
            this.setData({
              loginMode: 'bind'
            });
          }
        });
      } else {
        wx.showToast({
          title: error.message || '登录失败',
          icon: 'none',
          duration: 2000
        });
      }
    } finally {
      this._isLogging = false;
      this.setData({ isLoading: false });
    }
  },

  // 绑定账号
  async onBindAccount() {
    if (this.data.isLoading || this._isLogging) return;
    if (!this.data.username || !this.data.password) {
      wx.showToast({
        title: '请填写完整信息',
        icon: 'none'
      });
      return;
    }

    this._isLogging = true;
    this.setData({ isLoading: true });

    try {
      // 调用微信登录获取 code
      const loginRes = await new Promise((resolve, reject) => {
        wx.login({
          success: resolve,
          fail: reject
        });
      });

      if (!loginRes.code) {
        throw new Error('微信登录失败');
      }

      // 调用绑定接口
      await api.wechatBind(
        loginRes.code,
        this.data.username,
        this.data.password
      );

      wx.showToast({
        title: '绑定成功',
        icon: 'success'
      });

      // 延迟跳转到首页
      this._bindTimer = setTimeout(() => {
        wx.switchTab({
          url: '/pages/home/home'
        });
      }, 1000);

    } catch (error) {
      console.error('绑定失败:', error);
      wx.showToast({
        title: error.message || '绑定失败',
        icon: 'none',
        duration: 2000
      });
    } finally {
      this._isLogging = false;
      this.setData({ isLoading: false });
    }
  },

  onUnload() {
    if (this._logoTimer) clearTimeout(this._logoTimer);
    if (this._loginTimer) clearTimeout(this._loginTimer);
    if (this._bindTimer) clearTimeout(this._bindTimer);
  }
});
