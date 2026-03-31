#!/bin/bash
set -e

# ============================================================
#  水手校园精细化管理平台 - 从 Git 仓库部署脚本
#  支持从 Gitee/GitHub 等仓库拉取代码进行部署
#  目标系统: Alibaba Cloud Linux 3.2104 LTS 64位
# ============================================================

# 配置
GIT_REPO_URL="${GIT_REPO_URL:-https://gitee.com/nneo6887/sailor-campus.git}"
GIT_BRANCH="${GIT_BRANCH:-main}"
APP_DIR="/opt/sailor-campus"
FRONTEND_DIR="${APP_DIR}/frontend"
BACKEND_DIR="${APP_DIR}/backend"
LOG_DIR="/var/log/sailor-backend"
DEPLOY_USER="www"

COLOR_RED='\033[0;31m'
COLOR_GREEN='\033[0;32m'
COLOR_YELLOW='\033[1;33m'
COLOR_BLUE='\033[0;34m'
COLOR_NC='\033[0m'

log_info()  { echo -e "${COLOR_GREEN}[INFO]${COLOR_NC} $1"; }
log_warn()  { echo -e "${COLOR_YELLOW}[WARN]${COLOR_NC} $1"; }
log_error() { echo -e "${COLOR_RED}[ERROR]${COLOR_NC} $1"; }
log_step()  { echo -e "${COLOR_BLUE}[STEP]${COLOR_NC} $1"; }

# ----------------------------------------------------------
# 0. 检查是否为 root
# ----------------------------------------------------------
if [ "$(id -u)" -ne 0 ]; then
    log_error "请使用 root 用户执行此脚本"
    exit 1
fi

# ----------------------------------------------------------
# 1. 安装系统依赖
# ----------------------------------------------------------
log_step "===== 步骤 1/9: 安装系统依赖 ====="
dnf update -y
dnf install -y nginx git python3.11 python3.11-devel python3.11-pip \
    mysql-server gcc openssl-devel \
    supervisor

# Python 3.11 软链接
if [ ! -f /usr/bin/python3 ]; then
    ln -sf /usr/bin/python3.11 /usr/bin/python3
fi
if [ ! -f /usr/bin/pip3 ]; then
    ln -sf /usr/bin/pip3.11 /usr/bin/pip3
fi

log_info "系统依赖安装完成"

# ----------------------------------------------------------
# 2. 配置 MySQL
# ----------------------------------------------------------
log_step "===== 步骤 2/9: 配置 MySQL ====="

# 启动 MySQL
systemctl enable mysqld
systemctl start mysqld

# 创建数据库和用户
MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-nanpuqing666}"
mysql -u root <<EOF
ALTER USER 'root'@'localhost' IDENTIFIED BY '${MYSQL_ROOT_PASSWORD}';
CREATE DATABASE IF NOT EXISTS sailor_campus CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
FLUSH PRIVILEGES;
EOF

log_info "MySQL 配置完成 (数据库: sailor_campus)"

# ----------------------------------------------------------
# 3. 创建部署用户和目录
# ----------------------------------------------------------
log_step "===== 步骤 3/9: 创建目录结构 ====="

# 创建运行用户
id -u "${DEPLOY_USER}" &>/dev/null || useradd -r -s /sbin/nologin "${DEPLOY_USER}"

# 创建目录
mkdir -p "${APP_DIR}" "${FRONTEND_DIR}" "${BACKEND_DIR}" "${LOG_DIR}"
chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "${APP_DIR}" "${LOG_DIR}"
chmod 750 "${LOG_DIR}"

log_info "目录结构创建完成"

# ----------------------------------------------------------
# 4. 从 Git 仓库拉取代码
# ----------------------------------------------------------
log_step "===== 步骤 4/9: 从 Git 仓库拉取代码 ====="
log_info "仓库地址: ${GIT_REPO_URL}"
log_info "分支: ${GIT_BRANCH}"

# 检查 Node.js
if ! command -v node &>/dev/null; then
    log_info "安装 Node.js 20.x ..."
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
    dnf install -y nodejs
fi
log_info "Node.js 版本: $(node --version)"

# 创建临时目录拉取代码
TEMP_DIR="/tmp/sailor-campus-deploy-$$"
rm -rf "${TEMP_DIR}"
mkdir -p "${TEMP_DIR}"

log_info "正在克隆仓库..."
git clone --depth 1 --branch "${GIT_BRANCH}" "${GIT_REPO_URL}" "${TEMP_DIR}"

cd "${TEMP_DIR}"
log_info "代码拉取完成 (版本: $(git rev-parse --short HEAD))"

# ----------------------------------------------------------
# 5. 部署前端
# ----------------------------------------------------------
log_step "===== 步骤 5/9: 构建并部署前端 ====="

if [ -f "${TEMP_DIR}/package.json" ]; then
    log_info "安装前端依赖..."
    cd "${TEMP_DIR}"
    npm ci --production=false 2>/dev/null || npm install

    log_info "构建前端..."
    npm run build

    # 备份旧版本
    if [ -d "${FRONTEND_DIR}/dist" ]; then
        rm -rf "${FRONTEND_DIR}/dist.bak"
        mv "${FRONTEND_DIR}/dist" "${FRONTEND_DIR}/dist.bak"
    fi

    # 部署新版本
    mkdir -p "${FRONTEND_DIR}/dist"
    cp -r "${TEMP_DIR}/dist/"* "${FRONTEND_DIR}/dist/"
    chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "${FRONTEND_DIR}"

    log_info "前端部署完成"
else
    log_warn "未找到 package.json，跳过前端部署"
fi

# ----------------------------------------------------------
# 6. 部署后端
# ----------------------------------------------------------
log_step "===== 步骤 6/9: 部署后端 ====="

if [ -d "${TEMP_DIR}/backend" ]; then
    # 备份当前配置
    if [ -f "${BACKEND_DIR}/.env" ]; then
        cp "${BACKEND_DIR}/.env" "${BACKEND_DIR}/.env.bak"
    fi
    if [ -d "${BACKEND_DIR}/venv" ]; then
        mv "${BACKEND_DIR}/venv" "${BACKEND_DIR}/venv.bak"
    fi

    # 清理并复制新代码
    rm -rf "${BACKEND_DIR}"/*
    cp -r "${TEMP_DIR}/backend/"* "${BACKEND_DIR}/"

    # 恢复配置（如果存在）
    if [ -f "${BACKEND_DIR}/.env.bak" ]; then
        mv "${BACKEND_DIR}/.env.bak" "${BACKEND_DIR}/.env"
        log_info "保留原有配置 (.env)"
    else
        # 创建新配置
        log_info "创建新的环境配置文件..."
        cat > "${BACKEND_DIR}/.env" <<ENVEOF
# 数据库配置 (生产环境)
DB_USER=root
DB_PASSWORD=${MYSQL_ROOT_PASSWORD}
DB_HOST=localhost
DB_PORT=3306
DB_NAME=sailor_campus

DATABASE_URL=mysql+pymysql://root:${MYSQL_ROOT_PASSWORD}@localhost:3306/sailor_campus
SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60

# CORS - 请替换为你的实际域名
ALLOWED_ORIGINS=["http://your-domain.com","https://your-domain.com"]

# 微信小程序配置
WECHAT_APPID=
WECHAT_SECRET=
ENVEOF
    fi

    # 恢复虚拟环境或创建新的
    if [ -d "${BACKEND_DIR}/venv.bak" ]; then
        mv "${BACKEND_DIR}/venv.bak" "${BACKEND_DIR}/venv"
        log_info "保留原有虚拟环境"
    else
        log_info "创建 Python 虚拟环境..."
        python3.11 -m venv "${BACKEND_DIR}/venv"
        source "${BACKEND_DIR}/venv/bin/activate"
        pip install --upgrade pip
        pip install -r "${BACKEND_DIR}/requirements.txt"
        pip install gunicorn
        deactivate
    fi

    chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "${BACKEND_DIR}"
    log_info "后端部署完成"
else
    log_error "未找到 backend 目录"
    exit 1
fi

# ----------------------------------------------------------
# 7. 配置 Nginx
# ----------------------------------------------------------
log_step "===== 步骤 7/9: 配置 Nginx ====="

# 复制 Nginx 配置
if [ -f "${TEMP_DIR}/deploy/nginx/sailor-campus.conf" ]; then
    cp "${TEMP_DIR}/deploy/nginx/sailor-campus.conf" /etc/nginx/conf.d/
else
    # 创建默认配置
    cat > /etc/nginx/conf.d/sailor-campus.conf <<'NGINXCONF'
server {
    listen 80;
    server_name _;
    
    # 前端静态文件
    location / {
        root /opt/sailor-campus/frontend/dist;
        try_files $uri $uri/ /index.html;
        index index.html;
    }
    
    # API 反向代理
    location /api/ {
        proxy_pass http://127.0.0.1:8000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # 静态资源缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        root /opt/sailor-campus/frontend/dist;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
NGINXCONF
fi

# 删除默认配置避免冲突
rm -f /etc/nginx/conf.d/default.conf

# 测试配置
nginx -t
if [ $? -eq 0 ]; then
    log_info "Nginx 配置测试通过"
else
    log_error "Nginx 配置有误，请检查"
    exit 1
fi

systemctl enable nginx
systemctl start nginx
log_info "Nginx 启动完成"

# ----------------------------------------------------------
# 8. 配置 Supervisor
# ----------------------------------------------------------
log_step "===== 步骤 8/9: 配置 Supervisor ====="

# 复制 Supervisor 配置
if [ -f "${TEMP_DIR}/deploy/supervisor/sailor-campus.ini" ]; then
    cp "${TEMP_DIR}/deploy/supervisor/sailor-campus.ini" /etc/supervisord.d/
else
    # 创建默认配置
    cat > /etc/supervisord.d/sailor-campus.ini <<'SUPCONF'
[program:sailor-backend]
directory=/opt/sailor-campus/backend
command=/opt/sailor-campus/backend/venv/bin/gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker -b 127.0.0.1:8000 --access-logfile /var/log/sailor-backend/access.log --error-logfile /var/log/sailor-backend/error.log
user=www
autostart=true
autorestart=true
redirect_stderr=true
stdout_logfile=/var/log/sailor-backend/supervisor.log
environment=PATH="/opt/sailor-campus/backend/venv/bin"
SUPCONF
fi

systemctl enable supervisord
systemctl restart supervisord

# 等待 supervisor 启动
sleep 2

supervisorctl reread
supervisorctl update
log_info "Supervisor 配置完成，后端服务已启动"

# ----------------------------------------------------------
# 9. 配置防火墙
# ----------------------------------------------------------
log_step "===== 步骤 9/9: 配置防火墙 ====="

if command -v firewall-cmd &>/dev/null; then
    firewall-cmd --permanent --add-service=http
    firewall-cmd --permanent --add-service=https
    firewall-cmd --reload
    log_info "防火墙配置完成 (已开放 80/443 端口)"
else
    log_warn "未检测到 firewalld，请手动开放 80/443 端口"
fi

# ----------------------------------------------------------
# 10. 清理临时文件
# ----------------------------------------------------------
log_step "===== 清理临时文件 ====="
rm -rf "${TEMP_DIR}"
log_info "临时文件已清理"

# ----------------------------------------------------------
# 完成
# ----------------------------------------------------------
echo ""
echo "============================================================"
log_info "🎉 部署完成！"
echo "============================================================"
echo ""
echo "  📦 部署来源: ${GIT_REPO_URL}"
echo "  🌿 分支: ${GIT_BRANCH}"
echo ""
echo "  🌐 前端访问: http://$(hostname -I | awk '{print $1}')"
echo "  🔌 API 地址: http://$(hostname -I | awk '{print $1}')/api/"
echo "  📚 API 文档: http://$(hostname -I | awk '{print $1}')/api/docs"
echo ""
echo "  📁 部署目录: ${APP_DIR}"
echo "  📝 后端日志: tail -f ${LOG_DIR}/error.log"
echo "  🌐 Nginx日志: tail -f /var/log/nginx/error.log"
echo ""
echo "  🔧 管理命令:"
echo "    supervisorctl status                    # 查看服务状态"
echo "    supervisorctl restart sailor-backend    # 重启后端"
echo "    systemctl restart nginx                 # 重启Nginx"
echo ""
log_warn "⚠️  请修改以下配置:"
echo "    1. /etc/nginx/conf.d/sailor-campus.conf - 修改 server_name 为你的域名"
echo "    2. ${BACKEND_DIR}/.env - 配置微信小程序等参数"
echo "============================================================"
