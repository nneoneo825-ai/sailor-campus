// API请求工具类
// 开发环境使用本机IP地址（需开启开发者工具"不校验域名"选项）
// 生产环境使用 HTTPS 域名

// 存储键名
const TOKEN_KEY = 'auth_token';
const USER_INFO_KEY = 'user_info';
const API_URL_KEY = 'api_base_url';

// 默认API地址（开发时请改为你电脑的局域网IP，如 192.168.x.x）
const DEFAULT_API_URL = 'https://shishengapi.ai-sailor.com';
globalData: {
  apiBase: 'https://shishengapi.ai-sailor.com'
}
const api = {
  // 获取基础URL（支持动态设置）
  getBaseUrl() {
    const customUrl = wx.getStorageSync(API_URL_KEY);
    return customUrl || DEFAULT_API_URL;
  },

  // 设置基础URL（用于动态配置服务器地址）
  setBaseUrl(url) {
    wx.setStorageSync(API_URL_KEY, url);
  },

  // 获取默认URL
  getDefaultBaseUrl() {
    return DEFAULT_API_URL;
  },

  // 获取存储的token
  getToken() {
    return wx.getStorageSync(TOKEN_KEY);
  },

  // 设置token
  setToken(token) {
    wx.setStorageSync(TOKEN_KEY, token);
  },

  // 清除token
  clearToken() {
    wx.removeStorageSync(TOKEN_KEY);
    wx.removeStorageSync(USER_INFO_KEY);
  },

  // 获取用户信息
  getUserInfo() {
    return wx.getStorageSync(USER_INFO_KEY);
  },

  // 设置用户信息
  setUserInfo(userInfo) {
    wx.setStorageSync(USER_INFO_KEY, userInfo);
  },

  // 检查是否已登录
  isLoggedIn() {
    const token = this.getToken();
    return !!token;
  },

  // 通用请求方法
  request(options) {
    const { url, method = 'GET', data, header = {}, needAuth = true } = options;
    
    return new Promise((resolve, reject) => {
      const requestHeader = {
        'Content-Type': 'application/json',
        ...header
      };

      // 如果需要认证，添加token
      if (needAuth) {
        const token = this.getToken();
        if (token) {
          requestHeader['Authorization'] = `Bearer ${token}`;
        }
      }

      wx.request({
        url: `${this.getBaseUrl()}${url}`,
        method,
        data,
        header: requestHeader,
        success: (res) => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(res.data);
          } else if (res.statusCode === 401 || res.statusCode === 403) {
            // token过期或未认证，清除登录态并跳转登录页
            // 401: token过期/无效
            // 403: HTTPBearer在没有Authorization header时返回此状态码
            if (res.data?.detail === 'Not authenticated' || 
                res.data?.detail?.includes('credentials') ||
                res.statusCode === 401) {
              this.clearToken();
              wx.navigateTo({
                url: '/pages/login/login'
              });
              reject(new Error('登录已过期，请重新登录'));
            } else {
              // 其他403是权限不足，不是认证问题
              const errorMsg = res.data?.detail || res.data?.message || `请求失败 (${res.statusCode})`;
              reject(new Error(errorMsg));
            }
          } else {
            const errorMsg = res.data?.detail || res.data?.message || `请求失败 (${res.statusCode})`;
            reject(new Error(errorMsg));
          }
        },
        fail: (err) => {
          reject(new Error('网络请求失败，请检查网络连接'));
        }
      });
    });
  },

  // GET请求
  get(url, params = {}, needAuth = true) {
    // 构建查询字符串
    const queryString = Object.keys(params)
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
      .join('&');
    const fullUrl = queryString ? `${url}?${queryString}` : url;
    
    return this.request({ url: fullUrl, method: 'GET', needAuth });
  },

  // POST请求
  post(url, data = {}, needAuth = true) {
    return this.request({ url, method: 'POST', data, needAuth });
  },

  // PUT请求
  put(url, data = {}, needAuth = true) {
    return this.request({ url, method: 'PUT', data, needAuth });
  },

  // DELETE请求
  delete(url, needAuth = true) {
    return this.request({ url, method: 'DELETE', needAuth });
  },

  // ==================== 认证相关API ====================
  
  // 微信登录
  async wechatLogin(code, userInfo = null) {
    const data = await this.post('/api/auth/wechat-login', { code, user_info: userInfo }, false);
    if (data.access_token) {
      this.setToken(data.access_token);
      this.setUserInfo(data.user);
    }
    return data;
  },

  // 绑定微信账号
  async wechatBind(code, username, password) {
    const data = await this.post(`/api/auth/wechat-bind?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`, { code }, false);
    if (data.access_token) {
      this.setToken(data.access_token);
      this.setUserInfo(data.user);
    }
    return data;
  },

  // 解绑微信账号
  async wechatUnbind() {
    const data = await this.post('/api/auth/wechat-unbind');
    if (data.user) {
      this.setUserInfo(data.user);
    }
    return data;
  },

  // 获取微信绑定状态
  async getWechatStatus() {
    return this.get('/api/auth/wechat-status');
  },

  // 获取当前用户信息
  async getCurrentUser() {
    const data = await this.get('/api/auth/me');
    this.setUserInfo(data);
    return data;
  },

  // ==================== 组织机构API ====================

  // 获取组织树
  getOrgTree() {
    return this.get('/api/org/tree');
  },

  // 获取组织下的班级
  getOrgClasses(orgId) {
    return this.get(`/api/org/${orgId}/classes`);
  },

  // 获取组织下的学生（分页）
  getOrgStudents(orgId, page = 1, pageSize = 100) {
    return this.get(`/api/org/${orgId}/students`, { page, page_size: pageSize });
  },

  // 获取组织下的教师（分页）
  getOrgTeachers(orgId, page = 1, pageSize = 100) {
    return this.get(`/api/org/${orgId}/teachers`, { page, page_size: pageSize });
  },

  // 获取所有教师（分页）
  getAllTeachers(pageSize = 100, grade = null) {
    const params = { page_size: pageSize };
    if (grade) {
      params.grade = grade;
    }
    return this.get('/api/org/teachers/all', params);
  },

  // 获取班级座位表
  getSeatingChart(classId) {
    return this.get(`/api/org/class/${classId}/seating-chart`);
  },

  // 更新班级座位表
  updateSeatingChart(classId, seatingChart) {
    return this.post(`/api/org/class/${classId}/seating-chart`, seatingChart);
  },

  // ==================== 德育记录API ====================

  // 获取德育指标列表
  getMoralIndicators(params = {}) {
    return this.get('/api/moral/indicators', params);
  },

  // 获取德育指标报表结构（三级结构）
  getMoralIndicatorsReportStructure(orgId = null) {
    const params = orgId ? { org_id: orgId } : {};
    return this.get('/api/moral/indicators/report-structure', params);
  },

  // 获取德育指标分类列表
  getMoralCategories() {
    return this.get('/api/moral/indicators/categories');
  },

  // 获取德育记录列表
  getMoralRecords(params = {}) {
    return this.get('/api/moral/records', params);
  },

  // 创建德育记录
  createMoralRecord(data) {
    return this.post('/api/moral/records', data);
  },

  // 批量创建德育记录
  createMoralRecords(records) {
    return this.post('/api/moral/records/batch', { records });
  },

  // ==================== 教学记录API ====================

  // 获取教学指标列表
  getTeachingIndicators(params = {}) {
    return this.get('/api/teaching/indicators', params);
  },

  // 获取教学指标结构（按大项分组）
  getTeachingIndicatorsStructure(orgId = null) {
    const params = orgId ? { org_id: orgId } : {};
    return this.get('/api/teaching/indicators/structure', params);
  },

  // 获取教学指标大项列表
  getTeachingMajorCategories(orgId = null) {
    const params = orgId ? { org_id: orgId } : {};
    return this.get('/api/teaching/major-categories', params);
  },

  // 获取教学记录列表
  getTeachingRecords(params = {}) {
    return this.get('/api/teaching/records', params);
  },

  // 创建教学记录
  createTeachingRecord(data) {
    return this.post('/api/teaching/records', data);
  },

  // 批量创建教学记录
  createTeachingRecords(records) {
    return this.post('/api/teaching/records/batch', { records });
  },

  // ==================== 宿舍检查API ====================

  // 获取宿舍楼栋列表
  getDormBuildings() {
    return this.get('/api/dorm/buildings');
  },

  // 获取宿舍楼层列表
  getDormFloors(building) {
    return this.get('/api/dorm/floors', { building });
  },

  // 获取宿舍房间列表
  getDormRooms(building, floor) {
    return this.get('/api/dorm/rooms', { building, floor });
  },

  // 获取房间学生列表
  getDormStudents(building, floor, room) {
    return this.get('/api/dorm/students', { building, floor, room });
  },

  // 获取宿舍检查指标（结构化）
  getDormIndicators() {
    return this.get('/api/dorm/indicators');
  },

  // 创建宿舍检查记录
  createDormRecord(data) {
    return this.post('/api/dorm/records', data);
  },

  // 批量创建宿舍检查记录
  createDormRecords(records) {
    return this.post('/api/dorm/records/batch', { records });
  },

  // 获取宿舍检查记录
  getDormRecords(params = {}) {
    return this.get('/api/dorm/records', params);
  },

  // ==================== 整体检查API ====================

  // 获取整体检查指标
  getOverallIndicators(checkType = null) {
    const params = checkType ? { check_type: checkType } : {};
    return this.get('/api/overall/indicators', params);
  },

  // 获取班级列表（整体检查用）
  getTargetClasses(orgId = null) {
    const params = orgId ? { org_id: orgId } : {};
    return this.get('/api/overall/targets/classes', params);
  },

  // 获取学科组列表
  getTargetSubjects(schoolId = null) {
    const params = schoolId ? { school_id: schoolId } : {};
    return this.get('/api/overall/targets/subjects', params);
  },

  // 创建整体检查记录
  createOverallRecord(data) {
    return this.post('/api/overall/records', data);
  },

  // 批量创建整体检查记录
  createOverallRecords(records) {
    return this.post('/api/overall/records/batch', { records });
  },

  // 获取整体检查记录
  getOverallRecords(params = {}) {
    return this.get('/api/overall/records', params);
  },

  // ==================== 统计API ====================

  // 获取小程序统计数据
  getMiniprogramStats(schoolId = null) {
    const params = schoolId ? { school_id: schoolId } : {};
    return this.get('/api/analytics/miniprogram/stats', params);
  },

  // ==================== 日程任务API ====================

  // 获取任务列表
  getTasks(params = {}) {
    return this.get('/api/tasks', params);
  },

  // 获取日历任务
  getCalendarTasks(year, month) {
    return this.get('/api/tasks/calendar', { year, month });
  },

  // 创建任务
  createTask(taskData) {
    return this.post('/api/tasks', taskData);
  },

  // 获取任务详情
  getTask(taskId) {
    return this.get(`/api/tasks/${taskId}`);
  },

  // 更新任务
  updateTask(taskId, taskData) {
    return this.put(`/api/tasks/${taskId}`, taskData);
  },

  // 开始执行任务
  startTask(taskId) {
    return this.post(`/api/tasks/${taskId}/start`, {});
  },

  // 完成任务
  completeTask(taskId, remark = '') {
    return this.post(`/api/tasks/${taskId}/complete`, { complete_remark: remark });
  },

  // 删除任务
  deleteTask(taskId) {
    return this.delete(`/api/tasks/${taskId}`);
  }
};

module.exports = api;
