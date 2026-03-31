# 水手校园精细化管理平台 - 生产部署指南

> 目标系统: Alibaba Cloud Linux 3.2104 LTS 64位

## 目录结构

```
deploy/
├── nginx/
│   └── sailor-campus.conf    # Nginx 配置文件
├── supervisor/
│   └── sailor-campus.ini     # Supervisor 配置文件
├── .env.production           # 前端生产环境变量
├── deploy.sh                 # 一键部署脚本
├── update.sh                 # 更新脚本
└── README.md                 # 本文档
```

## 部署架构

```
                    ┌─────────────────────────────────────┐
                    │           Nginx (80/443)            │
                    │  ┌─────────────┬─────────────────┐  │
                    │  │  静态文件   │   API 反向代理   │  │
                    │  │  /dist/*    │   /api/* → 8000 │  │
                    │  └─────────────┴─────────────────┘  │
                    └─────────────────────────────────────┘
                                      │
                                      ▼
                    ┌─────────────────────────────────────┐
                    │     Gunicorn + Uvicorn (8000)       │
                    │     (由 Supervisor 管理)             │
                    └─────────────────────────────────────┘
                                      │
                                      ▼
                    ┌─────────────────────────────────────┐
                    │         MySQL (3306)               │
                    │      数据库: sailor_campus          │
                    └─────────────────────────────────────┘
```

## 一、部署前准备

### 1.1 服务器要求

- **系统**: Alibaba Cloud Linux 3.2104 LTS 64位
- **配置**: 2核 CPU / 4GB 内存 / 40GB 硬盘（最低）
- **端口**: 开放 80 (HTTP) 和 443 (HTTPS)

### 1.2 本地准备

将整个项目上传到服务器：

```bash
# 方式一: scp
scp -r /path/to/sailor-campus user@server-ip:/tmp/

# 方式二: rsync (推荐)
rsync -avz --exclude 'node_modules' --exclude '.git' \
    /path/to/sailor-campus/ user@server-ip:/tmp/sailor-campus/
```

## 二、一键部署

### 2.1 登录服务器

```bash
ssh root@your-server-ip
```

### 2.2 执行部署脚本

```bash
cd /tmp/sailor-campus
chmod +x deploy/deploy.sh
./deploy/deploy.sh
```

脚本会自动完成：
1. 安装系统依赖 (Nginx, Python 3.11, MySQL, Supervisor)
2. 配置 MySQL 数据库
3. 创建部署目录和用户
4. 构建前端并部署
5. 部署后端并安装依赖
6. 配置 Nginx 反向代理
7. 配置 Supervisor 管理后端进程
8. 配置防火墙

### 2.3 部署后检查

```bash
# 检查服务状态
systemctl status nginx
supervisorctl status sailor-backend

# 检查端口
netstat -tlnp | grep -E '80|8000|3306'

# 查看后端日志
tail -f /var/log/sailor-backend/error.log
```

## 三、配置修改

### 3.1 修改域名

编辑 Nginx 配置：

```bash
vim /etc/nginx/conf.d/sailor-campus.conf
```

将 `server_name your-domain.com;` 改为你的实际域名或 IP。

### 3.2 修改后端环境变量

编辑后端配置：

```bash
vim /opt/sailor-campus/backend/.env
```

重要配置项：
- `SECRET_KEY`: JWT 密钥（已自动生成）
- `ALLOWED_ORIGINS`: 允许的跨域来源
- `WECHAT_APPID` / `WECHAT_SECRET`: 微信小程序配置（如有）

### 3.3 修改 MySQL 密码

```bash
mysql -u root -p
```

```sql
ALTER USER 'root'@'localhost' IDENTIFIED BY '你的新密码';
FLUSH PRIVILEGES;
```

同时更新 `/opt/sailor-campus/backend/.env` 中的 `DATABASE_URL`。

## 四、更新部署

### 4.1 上传新代码

```bash
rsync -avz --exclude 'node_modules' --exclude '.git' \
    /path/to/sailor-campus/ user@server-ip:/tmp/sailor-campus-new/
```

### 4.2 执行更新

```bash
cd /tmp/sailor-campus-new
chmod +x deploy/update.sh

# 仅更新前端
./deploy/update.sh --frontend --restart

# 仅更新后端
./deploy/update.sh --backend --restart

# 更新全部
./deploy/update.sh --all --restart
```

## 五、常用管理命令

### 5.1 Nginx 管理

```bash
systemctl start nginx      # 启动
systemctl stop nginx       # 停止
systemctl restart nginx    # 重启
systemctl reload nginx     # 重载配置（不中断服务）
nginx -t                   # 测试配置
```

### 5.2 后端服务管理

```bash
supervisorctl status               # 查看状态
supervisorctl start sailor-backend # 启动
supervisorctl stop sailor-backend  # 停止
supervisorctl restart sailor-backend # 重启
supervisorctl tail -f sailor-backend # 查看日志
```

### 5.3 MySQL 管理

```bash
systemctl start mysqld   # 启动
systemctl stop mysqld    # 停止
systemctl restart mysqld # 重启
```

### 5.4 日志查看

```bash
# 后端日志
tail -f /var/log/sailor-backend/error.log
tail -f /var/log/sailor-backend/access.log

# Nginx 日志
tail -f /var/log/nginx/error.log
tail -f /var/log/nginx/access.log
```

## 六、HTTPS 配置（推荐）

### 6.1 使用阿里云 SSL 证书

1. 在阿里云控制台申请免费 SSL 证书
2. 下载 Nginx 格式证书文件
3. 上传到服务器：

```bash
mkdir -p /etc/nginx/ssl
scp cert.pem key.pem root@server-ip:/etc/nginx/ssl/
```

### 6.2 启用 HTTPS 配置

编辑 `/etc/nginx/conf.d/sailor-campus.conf`，取消 HTTPS 部分的注释并配置证书路径。

## 七、故障排查

### 7.1 前端无法访问

```bash
# 检查 Nginx
systemctl status nginx
nginx -t

# 检查文件权限
ls -la /opt/sailor-campus/frontend/dist/
```

### 7.2 API 502 错误

```bash
# 检查后端进程
supervisorctl status

# 查看后端日志
tail -100 /var/log/sailor-backend/error.log

# 手动启动测试
cd /opt/sailor-campus/backend
source venv/bin/activate
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

### 7.3 数据库连接失败

```bash
# 检查 MySQL
systemctl status mysqld

# 测试连接
mysql -u root -p sailor_campus

# 检查 .env 配置
cat /opt/sailor-campus/backend/.env | grep DATABASE_URL
```

## 八、安全加固

### 8.1 防火墙配置

```bash
# 仅开放必要端口
firewall-cmd --permanent --add-service=http
firewall-cmd --permanent --add-service=https
firewall-cmd --permanent --remove-service=ssh  # 如需限制 SSH
firewall-cmd --reload
```

### 8.2 定期备份

```bash
# 创建备份脚本
cat > /opt/backup.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d)
mysqldump -u root -p'你的密码' sailor_campus > /opt/backup/db_${DATE}.sql
# 保留最近 7 天的备份
find /opt/backup -name "db_*.sql" -mtime +7 -delete
EOF

chmod +x /opt/backup.sh

# 添加定时任务 (每天凌晨 3 点执行)
(crontab -l 2>/dev/null; echo "0 3 * * * /opt/backup.sh") | crontab -
```

---

如有问题，请查看日志或联系技术支持。
