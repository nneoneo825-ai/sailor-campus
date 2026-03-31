# 水手校园精细化管理平台 — 阿里云部署指南

## 目录

- [1. 服务器要求](#1-服务器要求)
- [2. 安全组配置](#2-安全组配置)
- [3. 环境安装](#3-环境安装)
- [4. 上传代码](#4-上传代码)
- [5. MySQL 配置](#5-mysql-配置)
- [6. 后端部署](#6-后端部署)
- [7. 前端构建与部署](#7-前端构建与部署)
- [8. Nginx 反向代理配置](#8-nginx-反向代理配置)
- [9. Systemd 服务管理](#9-systemd-服务管理)
- [10. SSL 证书配置 (HTTPS)](#10-ssl-证书配置-https)
- [11. 运维命令速查](#11-运维命令速查)
- [12. 常见问题排查](#12-常见问题排查)

---

## 1. 服务器要求

| 项目 | 最低配置 | 推荐配置 |
|------|----------|----------|
| CPU | 2 核 | 4 核 |
| 内存 | 4 GB | 8 GB |
| 系统盘 | 40 GB SSD | 80 GB SSD |
| 操作系统 | Ubuntu 22.04 LTS / CentOS 7.9 | Ubuntu 22.04 LTS |
| 带宽 | 3 Mbps | 5 Mbps |

**架构概览：**

```
                    ┌─────────────────────┐
                    │    阿里云安全组       │
                    │  开放 80/443/22 端口  │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │      Nginx          │
                    │  :80 → :443 (HTTPS) │
                    │  反向代理 + 静态文件   │
                    └──┬──────────────┬───┘
                       │              │
              静态文件  │              │  /api/*
                       │              │
            ┌──────────▼───┐  ┌──────▼──────────┐
            │  前端静态文件  │  │  FastAPI 后端    │
            │  (dist/)     │  │  Uvicorn        │
            │              │  │  内网 :8000      │
            └──────────────┘  └──────┬──────────┘
                                     │
                              ┌──────▼──────────┐
                              │     MySQL        │
                              │  内网 :3306      │
                              │  sailor_campus   │
                              └─────────────────┘
```

---

## 2. 安全组配置

在阿里云控制台 → ECS → 安全组，添加以下入方向规则：

| 端口 | 协议 | 授权对象 | 说明 |
|------|------|----------|------|
| 22 | TCP | 你的 IP / 0.0.0.0 | SSH 远程连接（建议限制 IP） |
| 80 | TCP | 0.0.0.0/0 | HTTP |
| 443 | TCP | 0.0.0.0/0 | HTTPS |
| 3306 | TCP | 127.0.0.1 | MySQL（仅限本机访问，**不要**对公网开放） |

> **重要**：MySQL 端口 3306 不要对公网开放，数据库只允许本机或内网访问。

---

## 3. 环境安装

以下命令以 **Ubuntu 22.04 LTS** 为例。CentOS 用户请替换 `apt` 为 `yum`。

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装基础工具
sudo apt install -y curl wget git unzip software-properties-common

# ===== Python 3.11 =====
sudo add-apt-repository -y ppa:deadsnakes/ppa
sudo apt update
sudo apt install -y python3.11 python3.11-venv python3-pip
sudo ln -sf /usr/bin/python3.11 /usr/bin/python3

# ===== Node.js 20 LTS =====
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 验证
python3 --version   # Python 3.11.x
node --version      # v20.x.x
npm --version       # 10.x.x

# ===== MySQL 8.0 =====
sudo apt install -y mysql-server
sudo systemctl enable mysql
sudo systemctl start mysql

# ===== Nginx =====
sudo apt install -y nginx
sudo systemctl enable nginx
```

---

## 4. 上传代码

```bash
# 方式一：使用 Git
cd /opt
sudo git clone <你的仓库地址> sailor-campus
sudo chown -R $USER:$USER sailor-campus

# 方式二：使用 SCP 从本地上传
# 在本地 Windows PowerShell 执行：
scp -r "C:\Users\Nan\Desktop\水手校园精细化管理平台" root@<你的服务器IP>:/opt/sailor-campus
```

---

## 5. MySQL 配置

### 5.1 安全初始化

```bash
sudo mysql_secure_installation
```

按提示设置 root 密码（建议使用强密码），其他选项选 `Y`。

### 5.2 创建数据库和用户

```bash
sudo mysql -u root -p
```

```sql
-- 创建数据库
CREATE DATABASE sailor_campus DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 创建专用用户（替换 YOUR_DB_PASSWORD 为强密码）
CREATE USER 'sailor'@'localhost' IDENTIFIED BY 'YOUR_DB_PASSWORD';
GRANT ALL PRIVILEGES ON sailor_campus.* TO 'sailor'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### 5.3 导入已有数据（可选）

如果本地已有数据库需要迁移：

```bash
# 在本地导出
mysqldump -u root -p sailor_campus > sailor_campus_backup.sql

# 上传到服务器后导入
mysql -u sailor -p sailor_campus < sailor_campus_backup.sql
```

---

## 6. 后端部署

### 6.1 创建虚拟环境并安装依赖

```bash
cd /opt/sailor-campus/backend

# 创建虚拟环境
python3 -m venv venv
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt

# 验证关键包
pip list | grep -E "fastapi|uvicorn|sqlalchemy|pymysql"
```

### 6.2 配置后端环境变量

```bash
cp backend/.env backend/.env.backup
```

编辑 `backend/.env`：

```ini
# ===== 数据库配置（修改为服务器上的配置）=====
DB_USER=sailor
DB_PASSWORD=YOUR_DB_PASSWORD          # 改为上面创建的密码
DB_HOST=localhost
DB_PORT=3306
DB_NAME=sailor_campus
DATABASE_URL=mysql+pymysql://sailor:YOUR_DB_PASSWORD@localhost:3306/sailor_campus

# ===== 安全配置（必须修改！）=====
SECRET_KEY=生成一个随机密钥                # 见下方说明
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# ===== CORS 配置（改为你的域名）=====
ALLOWED_ORIGINS=["https://your-domain.com"]

# ===== 微信小程序配置（如果需要）=====
WECHAT_APPID=你的小程序AppID
WECHAT_SECRET=你的小程序Secret
```

**生成 SECRET_KEY 的方法：**

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
# 输出类似：a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6  复制到 .env 中
```

### 6.3 测试后端启动

```bash
cd /opt/sailor-campus/backend
source venv/bin/activate

# 测试启动（Ctrl+C 退出）
uvicorn main:app --host 127.0.0.1 --port 8000

# 如果看到 "Uvicorn running on http://127.0.0.1:8000" 说明成功
```

---

## 7. 前端构建与部署

### 7.1 配置前端环境变量

编辑根目录的 `.env`：

```ini
# 生产环境 API 地址（留空使用同源路径，由 Nginx 代理到后端）
VITE_API_BASE_URL=
```

> **说明**：留空后，前端会向当前域名发起请求（如 `https://your-domain.com/api/...`），由 Nginx 反向代理转发到后端 `127.0.0.1:8000`。

编辑根目录的 `.env.local`（Gemini API，按需配置）：

```ini
GEMINI_API_KEY=你的实际API密钥
```

### 7.2 构建前端

```bash
cd /opt/sailor-campus

# 安装依赖
npm install

# 生产构建
npm run build
```

构建产物在 `dist/` 目录下，这是纯静态文件（HTML/JS/CSS），由 Nginx 直接托管。

---

## 8. Nginx 反向代理配置

### 8.1 创建站点配置

```bash
sudo vim /etc/nginx/sites-available/sailor-campus
```

写入以下内容（替换 `your-domain.com` 为你的域名或 IP）：

```nginx
server {
    listen 80;
    server_name your-domain.com;    # 替换为你的域名或服务器IP

    # 前端静态文件
    root /opt/sailor-campus/dist;
    index index.html;

    # Gzip 压缩
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;
    gzip_min_length 1000;

    # API 反向代理
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 文件上传大小限制
        client_max_body_size 50M;

        # 超时设置
        proxy_connect_timeout 60s;
        proxy_read_timeout 120s;
        proxy_send_timeout 60s;
    }

    # 健康检查代理
    location /health {
        proxy_pass http://127.0.0.1:8000;
    }

    # SPA 路由回退：所有未匹配的路径返回 index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 静态资源缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # 禁止访问隐藏文件
    location ~ /\. {
        deny all;
    }
}
```

### 8.2 启用站点

```bash
# 创建软链接启用站点
sudo ln -sf /etc/nginx/sites-available/sailor-campus /etc/nginx/sites-enabled/

# 删除默认站点（避免冲突）
sudo rm -f /etc/nginx/sites-enabled/default

# 检查配置语法
sudo nginx -t

# 重新加载
sudo systemctl reload nginx
```

此时访问 `http://your-domain.com` 应该能看到前端页面。

---

## 9. Systemd 服务管理

### 9.1 后端服务

创建 `/etc/systemd/system/sailor-api.service`：

```bash
sudo vim /etc/systemd/system/sailor-api.service
```

```ini
[Unit]
Description=Sailor Campus API Server
After=network.target mysql.service
Requires=mysql.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/sailor-campus/backend
Environment="PATH=/opt/sailor-campus/backend/venv/bin"
ExecStart=/opt/sailor-campus/backend/venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000 --workers 2
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

### 9.2 启动服务

```bash
# 重新加载 systemd 配置
sudo systemctl daemon-reload

# 启动后端服务
sudo systemctl start sailor-api
sudo systemctl enable sailor-api

# 查看状态
sudo systemctl status sailor-api

# 查看日志
sudo journalctl -u sailor-api -f
```

### 9.3 workers 数量建议

| 服务器 CPU 核数 | --workers |
|-----------------|-----------|
| 2 核 | 2 |
| 4 核 | 4 |
| 8 核 | 6-8 |

---

## 10. SSL 证书配置 (HTTPS)

推荐使用阿里云免费 SSL 证书或 Let's Encrypt。

### 方式一：阿里云免费证书

1. 登录阿里云控制台 → SSL证书 → 免费证书 → 申请
2. 下载 Nginx 格式证书（得到 `xxx.pem` 和 `xxx.key`）
3. 上传到服务器：

```bash
sudo mkdir -p /etc/nginx/ssl/sailor-campus
sudo cp xxx.pem /etc/nginx/ssl/sailor-campus/
sudo cp xxx.key /etc/nginx/ssl/sailor-campus/
```

4. 修改 Nginx 配置：

```bash
sudo vim /etc/nginx/sites-available/sailor-campus
```

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # HTTP 重定向到 HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/nginx/ssl/sailor-campus/xxx.pem;
    ssl_certificate_key /etc/nginx/ssl/sailor-campus/xxx.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;

    # ... 其余配置与第 8 步相同 ...
    root /opt/sailor-campus/dist;
    index index.html;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 50M;
        proxy_connect_timeout 60s;
        proxy_read_timeout 120s;
        proxy_send_timeout 60s;
    }

    location /health {
        proxy_pass http://127.0.0.1:8000;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    location ~ /\. {
        deny all;
    }
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

### 方式二：Let's Encrypt (Certbot)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
# 按提示操作，自动修改 Nginx 配置并设置自动续期
```

---

## 11. 运维命令速查

```bash
# ===== 服务管理 =====
sudo systemctl start sailor-api      # 启动后端
sudo systemctl stop sailor-api       # 停止后端
sudo systemctl restart sailor-api    # 重启后端
sudo systemctl status sailor-api     # 查看后端状态

sudo systemctl reload nginx          # 重新加载 Nginx
sudo systemctl restart nginx         # 重启 Nginx

# ===== 日志查看 =====
sudo journalctl -u sailor-api -f --no-pager    # 后端实时日志
sudo journalctl -u sailor-api --since today     # 今天日志
sudo tail -f /var/log/nginx/error.log           # Nginx 错误日志
sudo tail -f /var/log/nginx/access.log          # Nginx 访问日志

# ===== 前端更新部署 =====
cd /opt/sailor-campus
git pull origin main               # 拉取最新代码
npm install                        # 安装新依赖（如有）
npm run build                      # 重新构建
# Nginx 直接托管 dist/，无需重启

# ===== 数据库备份 =====
mysqldump -u sailor -p sailor_campus > backup_$(date +%Y%m%d_%H%M%S).sql

# ===== 数据库恢复 =====
mysql -u sailor -p sailor_campus < backup_xxx.sql
```

---

## 12. 常见问题排查

### Q: 前端页面空白或 404

```bash
# 检查 dist 目录是否存在
ls -la /opt/sailor-campus/dist/

# 检查 Nginx 配置中的 root 路径是否正确
sudo nginx -t

# 检查 .env 中 VITE_API_BASE_URL 是否为空
cat /opt/sailor-campus/.env
```

### Q: API 请求返回 502 Bad Gateway

```bash
# 检查后端是否运行
sudo systemctl status sailor-api

# 手动测试后端
curl http://127.0.0.1:8000/health

# 查看后端日志
sudo journalctl -u sailor-api -n 50
```

### Q: 数据库连接失败

```bash
# 检查 MySQL 是否运行
sudo systemctl status mysql

# 测试连接
mysql -u sailor -p -h localhost sailor_campus

# 检查 backend/.env 中的 DATABASE_URL 是否正确
```

### Q: 更新代码后前端没有变化

```bash
# 浏览器缓存问题，强制刷新：Ctrl + Shift + R
# 或清除 dist 重新构建
rm -rf /opt/sailor-campus/dist
cd /opt/sailor-campus && npm run build
```

### Q: CORS 跨域错误

检查 `backend/.env` 中的 `ALLOWED_ORIGINS` 是否包含你的前端域名：

```ini
ALLOWED_ORIGINS=["https://your-domain.com"]
```

修改后需重启后端：

```bash
sudo systemctl restart sailor-api
```

### Q: 文件上传失败 (413 Request Entity Too Large)

在 Nginx 配置的 `location /api/` 块中增大限制：

```nginx
client_max_body_size 100M;  # 根据需要调整
```

然后 `sudo systemctl reload nginx`。
