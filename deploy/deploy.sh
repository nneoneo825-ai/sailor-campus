#!/bin/bash
set -e

# ============================================================
#  水手校园精细化管理平台 - 生产环境部署脚本
#  目标系统: Alibaba Cloud Linux 3.2104 LTS 64位
# ============================================================

APP_DIR="/opt/sailor-campus"
FRONTEND_DIR="${APP_DIR}/frontend"
BACKEND_DIR="${APP_DIR}/backend"
LOG_DIR="/var/log/sailor-backend"
DEPLOY_USER="www"

COLOR_RED='\033[0;31m'
COLOR_GREEN='\033[0;32m'
COLOR_YELLOW='\033[1;33m'
COLOR_NC='\033[0m'

log_info()  { echo -e "${COLOR_GREEN}[INFO]${COLOR_NC} $1"; }
log_warn()  { echo -e "${COLOR_YELLOW}[WARN]${COLOR_NC} $1"; }
log_error() { echo -e "${COLOR_RED}[ERROR]${COLOR_NC} $1"; }

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
log_info "===== 步骤 1/8: 安装系统依赖 ====="
dnf update -y
dnf install -y nginx git python3.11 python3.11-devel python3.11-pip \
    mysql-server gcc openssl-devel \
    supervisor

# Python 3.11 软链接
if [ ! -f /usr/bin/python3 ]; then
    ln -sf /usr/bin/python3.11 /usr/bin/python3
fi
if [ ! -f /usr/bin/pip3 ]; then
    ln -sf /usr/bin/python3.11-pip /usr/bin/pip3
fi

log_info "系统依赖安装完成"

# ----------------------------------------------------------
# 2. 配置 MySQL
# ----------------------------------------------------------
log_info "===== 步骤 2/8: 配置 MySQL ====="

# 启动 MySQL
systemctl enable mysqld
systemctl start mysqld

# 创建数据库和用户 (请修改密码！)
MYSQL_ROOT_PASSWORD="nanpuqing666"  # ⚠️ 请修改为强密码
mysql -u root <<EOF
ALTER USER 'root'@'localhost' IDENTIFIED BY '${MYSQL_ROOT_PASSWORD}';
CREATE DATABASE IF NOT EXISTS sailor_campus CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
FLUSH PRIVILEGES;
EOF

log_info "MySQL 配置完成 (数据库: sailor_campus)"
log_warn "请确保已修改 MySQL root 密码！"

# ----------------------------------------------------------
# 3. 创建部署用户和目录
# ----------------------------------------------------------
log_info "===== 步骤 3/8: 创建目录结构 ====="

# 创建运行用户
id -u "${DEPLOY_USER}" &>/dev/null || useradd -r -s /sbin/nologin "${DEPLOY_USER}"

# 创建目录
mkdir -p "${APP_DIR}" "${FRONTEND_DIR}" "${BACKEND_DIR}" "${LOG_DIR}"
chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "${APP_DIR}" "${LOG_DIR}"
chmod 750 "${LOG_DIR}"

log_info "目录结构创建完成"

# ----------------------------------------------------------
# 4. 部署前端
# ----------------------------------------------------------
log_info "===== 步骤 4/8: 部署前端 ====="

# 检查 Node.js
if ! command -v node &>/dev/null; then
    log_info "安装 Node.js 20.x ..."
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
    dnf install -y nodejs
fi
log_info "Node.js 版本: $(node --version)"

# 将项目前端文件复制到部署目录（假设脚本在 deploy/ 目录下运行）
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "${SCRIPT_DIR}")"

if [ -f "${PROJECT_ROOT}/package.json" ]; then
    log_info "构建前端 ..."
    cd "${PROJECT_ROOT}"
    npm ci --production=false 2>/dev/null || npm install

    # 使用生产环境变量构建
    if [ -f "${SCRIPT_DIR}/.env.production" ]; then
        cp "${SCRIPT_DIR}/.env.production" "${PROJECT_ROOT}/.env.production"
    fi
    npm run build

    # 复制构建产物
    rm -rf "${FRONTEND_DIR}/dist"/*
    cp -r dist/* "${FRONTEND_DIR}/dist/" 2>/dev/null || {
        # 如果 dist 不存在，尝试直接复制
        mkdir -p "${FRONTEND_DIR}/dist"
        cp -r dist/* "${FRONTEND_DIR}/dist/"
    }
    log_info "前端构建完成"
else
    log_warn "未找到 package.json，请手动构建前端并复制到 ${FRONTEND_DIR}/dist/"
fi

# ----------------------------------------------------------
# 5. 部署后端
# ----------------------------------------------------------
log_info "===== 步骤 5/8: 部署后端 ====="

# 复制后端文件
if [ -d "${PROJECT_ROOT}/backend" ]; then
    cp -r "${PROJECT_ROOT}/backend/"* "${BACKEND_DIR}/"
    log_info "后端文件复制完成"
else
    log_error "未找到 backend 目录"
    exit 1
fi

# 创建虚拟环境并安装依赖
log_info "创建 Python 虚拟环境 ..."
python3.11 -m venv "${BACKEND_DIR}/venv"
source "${BACKEND_DIR}/venv/bin/activate"
pip install --upgrade pip
pip install -r "${BACKEND_DIR}/requirements.txt"
pip install gunicorn

# 安装 .env 配置
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

deactivate
chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "${BACKEND_DIR}"
log_info "后端部署完成"

# ----------------------------------------------------------
# 6. 配置 Nginx
# ----------------------------------------------------------
log_info "===== 步骤 6/8: 配置 Nginx ====="

cp "${SCRIPT_DIR}/nginx/sailor-campus.conf" /etc/nginx/conf.d/
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
# 7. 配置 Supervisor
# ----------------------------------------------------------
log_info "===== 步骤 7/8: 配置 Supervisor ====="

cp "${SCRIPT_DIR}/supervisor/sailor-campus.ini" /etc/supervisord.d/
systemctl enable supervisord
systemctl restart supervisord

# 等待 supervisor 启动
sleep 2

supervisorctl reread
supervisorctl update
log_info "Supervisor 配置完成，后端服务已启动"

# ----------------------------------------------------------
# 8. 配置防火墙
# ----------------------------------------------------------
log_info "===== 步骤 8/8: 配置防火墙 ====="

if command -v firewall-cmd &>/dev/null; then
    firewall-cmd --permanent --add-service=http
    firewall-cmd --permanent --add-service=https
    firewall-cmd --reload
    log_info "防火墙配置完成 (已开放 80/443 端口)"
else
    log_warn "未检测到 firewalld，请手动开放 80/443 端口"
fi

# ----------------------------------------------------------
# 完成
# ----------------------------------------------------------
echo ""
echo "============================================================"
log_info "部署完成！"
echo "============================================================"
echo ""
echo "  前端访问: http://$(hostname -I | awk '{print $1}')"
echo "  API 地址: http://$(hostname -I | awk '{print $1}')/api/"
echo "  API 文档: http://$(hostname -I | awk '{print $1}')/api/docs"
echo ""
echo "  后端日志: tail -f ${LOG_DIR}/error.log"
echo "  Nginx日志: tail -f /var/log/nginx/error.log"
echo ""
echo "  管理命令:"
echo "    supervisorctl status          # 查看服务状态"
echo "    supervisorctl restart sailor-backend  # 重启后端"
echo "    systemctl restart nginx       # 重启Nginx"
echo ""
log_warn "请修改 Nginx 配置中的 server_name 为你的实际域名或IP"
log_warn "请修改 MySQL root 密码为强密码"
echo "============================================================"
