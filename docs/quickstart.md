# 快速启动指南

> 帮助你快速启动和运行水手校园精细化管理平台

---

## 📦 前置要求

### 系统要求
- **操作系统**: Windows / macOS / Linux
- **Python**: 3.10+
- **Node.js**: 18+
- **数据库**: MySQL 8.0+ 或 PostgreSQL 14+
- **微信开发者工具**: 最新版

### 必需工具
- Git
- VS Code (推荐)
- 微信开发者工具 (小程序开发)

---

## 🚀 一键启动脚本

### Windows启动脚本
创建 `start-all.bat`:
```batch
@echo off
echo ========================================
echo 水手校园精细化管理平台 - 一键启动
echo ========================================

echo.
echo [1/3] 启动后端服务...
start cmd /k "cd backend && python -m venv venv && venv\Scripts\activate && pip install -r requirements.txt && python main.py"

timeout /t 10

echo.
echo [2/3] 启动Web前端...
start cmd /k "npm run dev"

timeout /t 5

echo.
echo [3/3] 提示: 请手动打开微信开发者工具导入 miniprogram 文件夹

echo.
echo ========================================
echo 所有服务启动完成!
echo 后端API: http://localhost:8000
echo API文档: http://localhost:8000/docs
echo Web前端: http://localhost:5173
echo ========================================
pause
```

### Mac/Linux启动脚本
创建 `start-all.sh`:
```bash
#!/bin/bash

echo "========================================"
echo "水手校园精细化管理平台 - 一键启动"
echo "========================================"

echo ""
echo "[1/3] 启动后端服务..."
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python main.py &
BACKEND_PID=$!
cd ..

sleep 10

echo ""
echo "[2/3] 启动Web前端..."
npm run dev &
FRONTEND_PID=$!

sleep 5

echo ""
echo "[3/3] 提示: 请手动打开微信开发者工具导入 miniprogram 文件夹"

echo ""
echo "========================================"
echo "所有服务启动完成!"
echo "后端API: http://localhost:8000"
echo "API文档: http://localhost:8000/docs"
echo "Web前端: http://localhost:5173"
echo "========================================"

# 等待后台进程
wait $BACKEND_PID $FRONTEND_PID
```

---

## 📝 手动启动步骤

### 1. 启动后端服务

```bash
# 进入后端目录
cd backend

# 创建虚拟环境
python -m venv venv

# 激活虚拟环境
# Windows:
venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt

# 初始化数据库
python init_db.py

# 启动服务
python main.py
```

**验证启动**:
- 打开浏览器访问: http://localhost:8000
- 查看API文档: http://localhost:8000/docs
- 应该看到: `{"message":"水手校园精细化管理平台 API",...}`

---

### 2. 启动Web前端

```bash
# 在项目根目录
npm install

# 启动开发服务器
npm run dev
```

**验证启动**:
- 打开浏览器访问: http://localhost:5173
- 应该看到登录页面

---

### 3. 启动微信小程序

```bash
# 打开微信开发者工具
# 导入项目: 选择 miniprogram 文件夹
# AppID: 测试号或正式号
```

**验证启动**:
- 应该看到小程序首页
- 可以切换到不同tab

---

## 🔧 配置文件说明

### 后端配置 (backend/.env)
```env
# 数据库配置
DATABASE_URL=mysql+pymysql://root:password@localhost:3306/sailor_campus

# JWT配置
SECRET_KEY=your-secret-key-here
ACCESS_TOKEN_EXPIRE_MINUTES=1440

# CORS配置
ALLOWED_ORIGINS=["http://localhost:5173", "http://localhost:3000"]

# 微信配置
WECHAT_APPID=your-wechat-appid
WECHAT_SECRET=your-wechat-secret
```

### 前端配置 (根目录/.env)
```env
# API基础URL
VITE_API_BASE_URL=http://localhost:8000
```

---

## 🧪 测试账号

### 默认管理员账号
```
用户名: admin
密码: admin123
```

### 测试教师账号
```
用户名: teacher01
密码: teacher123
真实姓名: 陈老师
```

### 创建测试账号
```bash
# 启动后端后,访问
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "password": "test123",
    "real_name": "测试用户"
  }'
```

---

## 📊 数据库初始化

### 快速初始化
```bash
cd backend

# 方法1: 使用SQL脚本
mysql -u root -p < create_database.sql

# 方法2: 使用Python脚本
python init_db.py
```

### 验证数据
```bash
# 登录MySQL
mysql -u root -p sailor_campus

# 查看表
SHOW TABLES;

# 查看示例数据
SELECT * FROM sys_user LIMIT 5;
SELECT * FROM cfg_moral_indicator LIMIT 5;
```

---

## 🐛 常见问题

### 问题1: 后端启动失败 - 端口被占用
**解决方案**:
```bash
# Windows
netstat -ano | findstr :8000
taskkill /PID <PID> /F

# Mac/Linux
lsof -ti:8000 | xargs kill -9
```

### 问题2: 数据库连接失败
**解决方案**:
1. 检查数据库是否启动
2. 检查 `backend/.env` 中的 `DATABASE_URL` 配置
3. 确保数据库已创建

```bash
# 创建数据库
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS sailor_campus CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

### 问题3: 前端无法连接后端
**解决方案**:
1. 检查后端是否正常启动 (访问 http://localhost:8000)
2. 检查 `.env` 中的 `VITE_API_BASE_URL` 配置
3. 查看浏览器控制台是否有CORS错误

### 问题4: 小程序无法请求后端
**解决方案**:
1. 在微信开发者工具中开启"不校验合法域名"
2. 确保后端CORS配置允许小程序域名
3. 检查手机和电脑在同一网络(真机调试)

---

## 📚 开发工具推荐

### VS Code插件
```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss",
    "ms-python.python",
    "ms-python.vscode-pylance",
    "ms-python.pylint",
    "wix.vscode-import-cost",
    "christian-kohler.path-intellisense"
  ]
}
```

### Chrome插件
- React Developer Tools
- Redux DevTools (如果使用)
- Vue.js DevTools (如果使用)
- Tailwind CSS IntelliSense

---

## 🔄 开发工作流

### Git分支策略
```
main (生产环境)
  ↑
develop (开发环境)
  ↑
feature/* (功能分支)
bugfix/* (修复分支)
```

### 提交规范
```
feat: 新功能
fix: 修复bug
docs: 文档更新
style: 代码格式调整
refactor: 重构
test: 测试相关
chore: 构建/工具链相关
```

示例:
```bash
git add .
git commit -m "feat: 完成教学评价API开发"
git push origin feature/teaching-api
```

---

## 📱 小程序开发调试

### 开启调试模式
1. 微信开发者工具 → 右上角 → 详情
2. 本地设置 → 勾选"不校验合法域名、web-view(业务域名)、TLS版本以及HTTPS证书"

### 真机调试
1. 确保手机和电脑在同一WiFi
2. 微信开发者工具 → 真机调试
3. 扫码在手机上打开

### 查看日志
```javascript
console.log('调试信息');

// 查看Storage
wx.getStorageInfo({
  success(res) {
    console.log('Storage:', res);
  }
});
```

---

## 📊 监控与日志

### 后端日志
```bash
# 查看后端日志
tail -f backend/app.log

# 查看错误日志
grep ERROR backend/app.log
```

### 前端日志
```javascript
// 在浏览器控制台查看
console.log('Frontend log:', data);

// 查看API请求
// Network tab → Filter by XHR
```

---

## 🚀 性能优化建议

### 后端优化
1. 启用数据库连接池
2. 添加Redis缓存
3. 使用异步IO (async/await)
4. 数据库查询添加索引

### 前端优化
1. 代码分割 (React.lazy)
2. 图片懒加载
3. 防抖节流
4. 虚拟滚动 (react-window)

### 小程序优化
1. 减少setData调用
2. 使用分包加载
3. 图片压缩
4. 缓存策略

---

## 📞 获取帮助

### 文档资源
- 后端API文档: http://localhost:8000/docs
- React文档: https://react.dev/
- 微信小程序文档: https://developers.weixin.qq.com/

### 问题排查步骤
1. 查看控制台错误信息
2. 检查网络请求状态
3. 查看后端日志
4. 重启相关服务
5. 清除缓存重新尝试

---

**祝你开发顺利! 🎉**
