# API接口规范与前端对接文档

> **版本**: v1.0.0
> **最后更新**: 2026-01-27
> **Base URL**: http://localhost:8000/api

---

## 📖 目录

- [认证相关](#认证相关)
- [德育评价](#德育评价)
- [教学评价](#教学评价)
- [统计分析](#统计分析)
- [组织机构](#组织机构)
- [文件上传](#文件上传)
- [报表导出](#报表导出)

---

## 🔐 认证相关

### 1.1 Web端登录

**接口**: `POST /auth/login`

**请求头**:
```http
Content-Type: application/x-www-form-urlencoded
```

**请求体** (OAuth2PasswordRequestForm):
```
username=admin
password=123456
```

**响应示例**:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "user": {
    "id": 1,
    "username": "admin",
    "real_name": "管理员",
    "avatar_url": "http://example.com/avatar.jpg"
  }
}
```

**前端调用示例**:
```typescript
// components/Login.tsx
const formData = new URLSearchParams();
formData.append('username', username);
formData.append('password', password);

const response = await axios.post('/auth/login', formData, {
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
});

localStorage.setItem('auth_token', response.data.access_token);
localStorage.setItem('user', JSON.stringify(response.data.user));
```

---

### 1.2 微信小程序登录

**接口**: `POST /auth/wechat-login`

**请求体**:
```json
{
  "code": "0f3h7s2J3k5m5N0B",
  "encryptedData": "...",
  "iv": "..."
}
```

**响应示例**:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "user": {
    "id": 123,
    "username": "teacher_001",
    "real_name": "陈老师",
    "avatar_url": "https://thirdwx.qlogo.cn/...",
    "org_id": 5
  }
}
```

**小程序调用示例**:
```javascript
// miniprogram/pages/login/login.js
wx.login({
  success(res) {
    const code = res.code;
    wx.request({
      url: 'http://localhost:8000/api/auth/wechat-login',
      method: 'POST',
      data: { code },
      success(response) {
        const { access_token, user } = response.data;
        wx.setStorageSync('auth_token', access_token);
        wx.setStorageSync('user', user);
        wx.switchTab({ url: '/pages/home/home' });
      }
    });
  }
});
```

---

### 1.3 获取当前用户信息

**接口**: `GET /auth/me`

**请求头**:
```http
Authorization: Bearer {access_token}
```

**响应示例**:
```json
{
  "id": 1,
  "username": "admin",
  "real_name": "管理员",
  "avatar_url": "http://example.com/avatar.jpg",
  "org_id": 1,
  "roles": [
    {
      "id": 1,
      "code": "ROLE_ADMIN",
      "name": "管理员",
      "data_scope": 1
    }
  ]
}
```

**前端调用示例**:
```typescript
// src/services/apiClient.ts
export const getCurrentUser = () => {
  return api.get('/auth/me');
};
```

---

## 📚 德育评价

### 2.1 获取德育指标

**接口**: `GET /moral/indicators`

**查询参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| org_id | int | 否 | 组织ID,不传则返回全集团通用指标 |

**响应示例**:
```json
{
  "data": [
    {
      "id": 1,
      "name": "上课迟到",
      "type": "deduction",
      "default_score": -2.0,
      "parent_id": null,
      "org_id": null,
      "org_name": "全集团通用"
    },
    {
      "id": 2,
      "name": "上课认真听讲",
      "type": "bonus",
      "default_score": 1.0,
      "parent_id": null,
      "org_id": null,
      "org_name": "全集团通用"
    }
  ]
}
```

**前端调用示例**:
```typescript
// components/DataCollection.tsx
const loadIndicators = async () => {
  const indicators = await api.get('/moral/indicators');
  setIndicators(indicators);
};
```

**小程序调用示例**:
```javascript
// miniprogram/pages/inspectForm/inspectForm.js
const loadIndicators = () => {
  wx.request({
    url: 'http://localhost:8000/api/moral/indicators',
    header: { 'Authorization': 'Bearer ' + wx.getStorageSync('auth_token') },
    success(res) {
      this.setData({ indicators: res.data });
    }
  });
};
```

---

### 2.2 提交德育记录

**接口**: `POST /moral/records`

**请求头**:
```http
Authorization: Bearer {access_token}
Content-Type: application/json
```

**请求体**:
```json
{
  "student_id": "202301001",
  "rule_id": 1,
  "score_change": -2.0,
  "description": "今天第一节英语课迟到5分钟",
  "evidence_imgs": ["http://example.com/img1.jpg"],
  "gps_lat": 34.123456,
  "gps_lng": 108.654321,
  "location_name": "教学楼305",
  "record_time": "2026-01-27T10:30:00"
}
```

**响应示例**:
```json
{
  "id": 12345,
  "message": "德育记录提交成功",
  "created_at": "2026-01-27T10:30:00"
}
```

**前端调用示例**:
```typescript
// components/DataCollection.tsx
const handleSubmit = async () => {
  const recordData = {
    student_id: formData.student_id,
    rule_id: parseInt(formData.rule_id),
    score_change: selectedIndicator?.default_score || 0,
    description: formData.description,
    record_time: new Date(formData.record_time).toISOString()
  };

  await api.post('/moral/records', recordData);
  alert('提交成功!');
};
```

**小程序调用示例**:
```javascript
// miniprogram/pages/inspectForm/inspectForm.js
const onSubmit = () => {
  const record = {
    student_id: this.data.selectedItems[0].id,
    rule_id: this.data.selectedMoralItems[0].id,
    score_change: -2.0,
    description: this.data.description,
    record_time: new Date().toISOString()
  };

  wx.request({
    url: 'http://localhost:8000/api/moral/records',
    method: 'POST',
    header: {
      'Authorization': 'Bearer ' + wx.getStorageSync('auth_token'),
      'Content-Type': 'application/json'
    },
    data: record,
    success(res) {
      wx.showToast({ title: '提交成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 1500);
    },
    fail(err) {
      // 离线存储
      const drafts = wx.getStorageSync('drafts') || [];
      drafts.push({ ...record, timestamp: Date.now(), synced: false });
      wx.setStorageSync('drafts', drafts);
      wx.showToast({ title: '已保存为草稿', icon: 'none' });
    }
  });
};
```

---

## 📊 教学评价

### 3.1 获取个人教学量化报表

**接口**: `GET /teaching/reports/personal`

**查询参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| teacher_id | int | 是 | 教师ID |
| start_date | string | 否 | 开始日期 (YYYY-MM-DD) |
| end_date | string | 否 | 结束日期 (YYYY-MM-DD) |

**响应示例**:
```json
{
  "teacher": {
    "id": 123,
    "name": "白少桐",
    "group": "语文",
    "classes": ["初一-38班", "初一-40班"]
  },
  "report_period": {
    "start_date": "2026-01-01",
    "end_date": "2026-01-31"
  },
  "summary": {
    "bonus_score": 15.0,
    "deduction_score": -5.0,
    "total_score": 10.0,
    "check_count": 20,
    "rank": 5
  },
  "details": [
    {
      "check_item": "赞美激励",
      "content": "课堂教学中教师对学生赞美激励",
      "type": "bonus",
      "score": 3,
      "time": "2026-01-26 20:48:54"
    }
  ],
  "metrics": {
    "design": 0,
    "quality": 0,
    "guide": 0,
    "exercise": 0,
    "process": -3,
    "selfStudy": 0,
    "marking": 0,
    "posting": 0,
    "progress": 0,
    "listening": 0,
    "tutoring": 0,
    "officeDisc": 0,
    "praise": 3,
    "hygiene": 0,
    "check": 0,
    "board": 0,
    "oral": 0,
    "team": 0
  }
}
```

**前端调用示例**:
```typescript
// components/TeachingManagement.tsx
const loadPersonalReport = async (teacherId: number) => {
  const report = await api.get('/teaching/reports/personal', {
    params: {
      teacher_id: teacherId,
      start_date: '2026-01-01',
      end_date: '2026-01-31'
    }
  });
  setPersonalReport(report);
};
```

---

### 3.2 获取年级教学量化报表

**接口**: `GET /teaching/reports/grade`

**查询参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| grade_id | int | 是 | 年级ID |
| start_date | string | 否 | 开始日期 |
| end_date | string | 否 | 结束日期 |

**响应示例**:
```json
{
  "grade_name": "初一",
  "report_period": {
    "start_date": "2026-01-01",
    "end_date": "2026-01-31"
  },
  "teachers": [
    {
      "id": 1,
      "name": "白少桐",
      "group": "语文",
      "metrics": {
        "design": 0,
        "quality": 0,
        // ... 其他19项指标
        "total_score": 0,
        "rank": 1
      }
    }
  ],
  "subject_summary": [
    {
      "subject": "语文",
      "total_score": 0,
      "rank": 1,
      "teacher_count": 3
    }
  ]
}
```

---

### 3.3 获取校级教学量化报表

**接口**: `GET /teaching/reports/school`

**查询参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| school_id | int | 是 | 学校ID |
| start_date | string | 否 | 开始日期 |
| end_date | string | 否 | 结束日期 |

**响应示例**:
```json
{
  "school_name": "长水实验中学杨凌校区",
  "report_period": {
    "start_date": "2026-01-01",
    "end_date": "2026-01-31"
  },
  "grades": [
    {
      "grade_name": "初一",
      "metrics": {
        "design": 0,
        "quality": 0,
        // ... 其他19项指标
        "total_score": 0,
        "rank": 1
      }
    },
    {
      "grade_name": "高一",
      "metrics": {
        "design": 0,
        "quality": 0,
        "process": -3,
        // ... 其他项
        "total_score": -3,
        "rank": 2
      }
    }
  ]
}
```

---

### 3.4 提交教学评价记录

**接口**: `POST /teaching/records`

**请求体**:
```json
{
  "teacher_id": 123,
  "check_item": "赞美激励",
  "content": "课堂教学中教师对学生赞美激励",
  "type": "bonus",
  "score": 3,
  "description": "在英语课堂教学中多次表扬学生",
  "evidence_imgs": ["http://example.com/img1.jpg"],
  "record_time": "2026-01-27T10:30:00"
}
```

**小程序调用示例**:
```javascript
// miniprogram/pages/inspectForm/inspectForm.js
const submitTeachingRecord = () => {
  const record = {
    teacher_id: this.data.selectedItems[0].id,
    check_item: this.data.category,
    content: this.data.selectedTeachingItems.join(', '),
    type: 'bonus',
    score: 3,
    description: this.data.description,
    record_time: new Date().toISOString()
  };

  wx.request({
    url: 'http://localhost:8000/api/teaching/records',
    method: 'POST',
    data: record,
    header: {
      'Authorization': 'Bearer ' + wx.getStorageSync('auth_token'),
      'Content-Type': 'application/json'
    },
    success(res) {
      wx.showToast({ title: '提交成功', icon: 'success' });
    }
  });
};
```

---

## 📈 统计分析

### 4.1 Dashboard数据

**接口**: `GET /analytics/dashboard`

**响应示例**:
```json
{
  "total_students": 3240,
  "total_teachers": 218,
  "weekly_moral_avg_score": 96.5,
  "weekly_teaching_avg_score": 95.2,
  "five_education_scores": {
    "moral": 85,
    "intellect": 78,
    "physical": 90,
    "artistic": 70,
    "labor": 88
  },
  "weekly_trend": [
    {
      "day": "周一",
      "moral_score": 98,
      "teaching_score": 95
    },
    {
      "day": "周二",
      "moral_score": 96,
      "teaching_score": 93
    }
  ]
}
```

**前端调用示例**:
```typescript
// components/Dashboard.tsx
useEffect(() => {
  const loadDashboardData = async () => {
    const stats = await api.get('/analytics/dashboard');
    setStats(stats);
  };
  loadDashboardData();
}, []);
```

---

### 4.2 五育综合评价

**接口**: `GET /analytics/five-education`

**查询参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| class_id | int | 否 | 班级ID,不传则返回全校数据 |
| date | string | 否 | 统计日期 (YYYY-MM-DD) |

**响应示例**:
```json
{
  "date": "2026-01-27",
  "school_avg": {
    "moral": 85,
    "intellect": 78,
    "physical": 90,
    "artistic": 70,
    "labor": 88
  },
  "class_avg": {
    "id": 123,
    "name": "初一-1班",
    "moral": 88,
    "intellect": 80,
    "physical": 92,
    "artistic": 72,
    "labor": 85
  },
  "top_students": [
    {
      "id": "202301001",
      "name": "张三",
      "total_score": 423
    }
  ]
}
```

---

## 🏢 组织机构

### 5.1 获取组织树

**接口**: `GET /org/tree`

**响应示例**:
```json
{
  "id": 1,
  "name": "长水教育集团",
  "type": "group",
  "children": [
    {
      "id": 2,
      "name": "长水实验中学杨凌校区",
      "type": "school",
      "children": [
        {
          "id": 3,
          "name": "初一年级",
          "type": "grade",
          "children": [
            {
              "id": 4,
              "name": "初一-1班",
              "type": "class",
              "head_teacher": "李老师"
            }
          ]
        }
      ]
    }
  ]
}
```

**前端调用示例**:
```typescript
// components/SystemManagement.tsx
const loadOrgTree = async () => {
  const tree = await api.get('/org/tree');
  setOrgTree(tree);
};
```

---

### 5.2 获取班级学生列表

**接口**: `GET /org/{class_id}/students`

**路径参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| class_id | int | 班级ID |

**查询参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | int | 否 | 页码,默认1 |
| page_size | int | 否 | 每页数量,默认20 |

**响应示例**:
```json
{
  "total": 45,
  "page": 1,
  "page_size": 20,
  "students": [
    {
      "id": "202301001",
      "name": "张三",
      "gender": "M",
      "class_id": 4,
      "seat_position": { "row": 1, "col": 1 }
    }
  ]
}
```

**前端调用示例**:
```typescript
// components/DataCollection.tsx
const loadStudents = async (classId: number) => {
  const response = await api.get(`/org/${classId}/students`, {
    params: { page: 1, page_size: 50 }
  });
  setStudents(response.students);
};
```

---

## 📤 文件上传

### 6.1 上传图片

**接口**: `POST /upload/image`

**请求头**:
```http
Authorization: Bearer {access_token}
Content-Type: multipart/form-data
```

**请求体** (FormData):
```
file: [binary]
category: "evidence"  // 证据/头像等
```

**响应示例**:
```json
{
  "url": "http://localhost:8000/uploads/images/abc123.jpg",
  "filename": "abc123.jpg",
  "size": 102400
}
```

**前端调用示例**:
```typescript
// components/FileUpload.tsx
const uploadImage = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('category', 'evidence');

  const result = await api.post('/upload/image', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (progressEvent) => {
      const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
      setUploadProgress(percent);
    }
  });

  return result.url;
};
```

**小程序调用示例**:
```javascript
// miniprogram/utils/upload.js
const uploadImage = (filePath) => {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: 'http://localhost:8000/api/upload/image',
      filePath: filePath,
      name: 'file',
      formData: { category: 'evidence' },
      header: {
        'Authorization': 'Bearer ' + wx.getStorageSync('auth_token')
      },
      success(res) {
        const data = JSON.parse(res.data);
        resolve(data.url);
      },
      fail: reject
    });
  });
};
```

---

## 📊 报表导出

### 7.1 导出教学报表Excel

**接口**: `GET /export/teaching/excel`

**查询参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| report_type | string | 是 | personal/grade/school/provincial |
| teacher_id | int | 否 | 个人报表需要 |
| grade_id | int | 否 | 年级报表需要 |
| school_id | int | 否 | 校级报表需要 |
| start_date | string | 否 | 开始日期 |
| end_date | string | 否 | 结束日期 |

**响应**:
- Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
- Content-Disposition: attachment; filename="teaching_report.xlsx"

**前端调用示例**:
```typescript
// components/TeachingManagement.tsx
const exportExcel = async () => {
  const response = await api.get('/export/teaching/excel', {
    params: {
      report_type: 'personal',
      teacher_id: 123,
      start_date: '2026-01-01',
      end_date: '2026-01-31'
    },
    responseType: 'blob'
  });

  // 创建下载链接
  const url = window.URL.createObjectURL(new Blob([response]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', 'teaching_report.xlsx');
  document.body.appendChild(link);
  link.click();
  link.remove();
};
```

---

## 📝 通用响应格式

### 成功响应
```json
{
  "code": 0,
  "message": "success",
  "data": { ... }
}
```

### 错误响应
```json
{
  "code": 400,
  "message": "参数错误",
  "details": {
    "field": "student_id",
    "error": "该学生不存在"
  }
}
```

### HTTP状态码
| 状态码 | 说明 |
|--------|------|
| 200 | 成功 |
| 400 | 请求参数错误 |
| 401 | 未授权 |
| 403 | 无权限 |
| 404 | 资源不存在 |
| 500 | 服务器错误 |

---

## 🔒 认证机制

### Token使用
所有需要认证的接口,都需要在请求头中携带token:

```http
Authorization: Bearer {access_token}
```

### Token过期
当token过期时,后端返回401状态码,前端需要:
1. 清除本地存储的token
2. 跳转到登录页
3. 提示用户重新登录

```typescript
// src/services/apiClient.ts
axios.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);
```

---

## 🔄 数据同步策略

### 小程序离线同步

1. **检测网络状态**
```javascript
wx.getNetworkType({
  success(res) {
    const isOnline = res.networkType !== 'none';
  }
});
```

2. **离线数据存储**
```javascript
// 保存草稿
const draft = { data: formData, synced: false, timestamp: Date.now() };
const drafts = wx.getStorageSync('drafts') || [];
drafts.push(draft);
wx.setStorageSync('drafts', drafts);
```

3. **恢复后同步**
```javascript
wx.onNetworkStatusChange((res) => {
  if (res.isConnected) {
    syncDrafts();
  }
});

function syncDrafts() {
  const drafts = wx.getStorageSync('drafts') || [];
  const unsynced = drafts.filter(d => !d.synced);

  unsynced.forEach(async (draft) => {
    try {
      await submitRecord(draft.data);
      // 标记为已同步
      draft.synced = true;
    } catch (err) {
      console.error('同步失败:', err);
    }
  });

  // 更新本地存储
  wx.setStorageSync('drafts', drafts);
}
```

---

**文档结束**
