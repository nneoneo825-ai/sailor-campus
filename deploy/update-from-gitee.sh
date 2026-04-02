#!/bin/bash
set -e

# ============================================================
#  水手校园精细化管理平台 - 从 Gitee 增量更新脚本
#  仅更新代码，不改变服务器配置环境
# ============================================================

GIT_REPO_URL="${GIT_REPO_URL:-https://gitee.com/nneo6887/sailor-campus.git}"
GIT_BRANCH="${GIT_BRANCH:-main}"
APP_DIR="/opt/sailor-campus"
FRONTEND_DIR="${APP_DIR}/frontend"
BACKEND_DIR="${APP_DIR}/backend"
LOG_DIR="/var/log/sailor-backend"
DEPLOY_USER="www"

COLOR_GREEN='\033[0;32m'
COLOR_YELLOW='\033[1;33m'
COLOR_RED='\033[0;31m'
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
# 1. 从 Gitee 拉取最新代码
# ----------------------------------------------------------
log_step "===== 步骤 1/5: 拉取最新代码 ====="
log_info "仓库地址: ${GIT_REPO_URL}"
log_info "分支: ${GIT_BRANCH}"

TEMP_DIR="/tmp/sailor-campus-update-$$"
rm -rf "${TEMP_DIR}"
mkdir -p "${TEMP_DIR}"

git clone --depth 1 --branch "${GIT_BRANCH}" "${GIT_REPO_URL}" "${TEMP_DIR}"
cd "${TEMP_DIR}"
log_info "代码拉取完成 (版本: $(git rev-parse --short HEAD))"

# ----------------------------------------------------------
# 2. 构建并部署前端
# ----------------------------------------------------------
log_step "===== 步骤 2/5: 构建并部署前端 ====="

if [ -f "${TEMP_DIR}/package.json" ]; then
    # 复制生产环境配置
    if [ -f "${TEMP_DIR}/deploy/.env.production" ]; then
        cp "${TEMP_DIR}/deploy/.env.production" "${TEMP_DIR}/.env.production"
    fi

    log_info "安装前端依赖..."
    cd "${TEMP_DIR}"
    npm ci --production=false 2>/dev/null || npm install

    log_info "构建前端..."
    npm run build -- --mode production

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
# 3. 更新后端代码（保留配置环境）
# ----------------------------------------------------------
log_step "===== 步骤 3/5: 更新后端代码 ====="

if [ -d "${TEMP_DIR}/backend" ]; then
    # 备份配置文件和虚拟环境到临时目录（避免被 rm -rf * 删除）
    BACKUP_DIR="/tmp/sailor-campus-backup-$$"
    mkdir -p "${BACKUP_DIR}"
    [ -f "${BACKEND_DIR}/.env" ] && cp "${BACKEND_DIR}/.env" "${BACKUP_DIR}/.env.bak"
    [ -d "${BACKEND_DIR}/venv" ] && mv "${BACKEND_DIR}/venv" "${BACKUP_DIR}/venv.bak"

    # 清理并复制新代码
    rm -rf "${BACKEND_DIR}"/*
    cp -r "${TEMP_DIR}/backend/"* "${BACKEND_DIR}/"

    # 恢复配置文件
    [ -f "${BACKUP_DIR}/.env.bak" ] && mv "${BACKUP_DIR}/.env.bak" "${BACKEND_DIR}/.env"

    # 恢复虚拟环境
    if [ -d "${BACKUP_DIR}/venv.bak" ]; then
        mv "${BACKUP_DIR}/venv.bak" "${BACKEND_DIR}/venv"
        log_info "虚拟环境已保留"
    fi

    # 检查是否有新依赖需要安装
    log_info "检查 Python 依赖..."
    if [ -f "${BACKEND_DIR}/venv/bin/activate" ]; then
        source "${BACKEND_DIR}/venv/bin/activate"
        pip install -r "${BACKEND_DIR}/requirements.txt" -q
        deactivate
        log_info "依赖已更新"
    else
        log_warn "虚拟环境不存在，正在创建..."
        python3 -m venv "${BACKEND_DIR}/venv"
        source "${BACKEND_DIR}/venv/bin/activate"
        pip install --upgrade pip -q
        pip install -r "${BACKEND_DIR}/requirements.txt" -q
        pip install gunicorn -q
        deactivate
        log_info "虚拟环境已创建并安装依赖"
    fi

    rm -rf "${BACKUP_DIR}"

    chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "${BACKEND_DIR}"

    log_info "后端代码更新完成（配置和虚拟环境已保留）"
else
    log_error "未找到 backend 目录"
    rm -rf "${TEMP_DIR}"
    exit 1
fi

# ----------------------------------------------------------
# 4. 重启服务
# ----------------------------------------------------------
log_step "===== 步骤 4/5: 重启服务 ====="

# 检查/修复 supervisor 配置
SUPERVISOR_CONF="/etc/supervisord.d/sailor-campus.ini"
if [ ! -f "${SUPERVISOR_CONF}" ] && [ -f "${TEMP_DIR}/deploy/supervisor/sailor-campus.ini" ]; then
    log_warn "Supervisor 配置不存在，正在创建..."
    mkdir -p /etc/supervisord.d
    cp "${TEMP_DIR}/deploy/supervisor/sailor-campus.ini" "${SUPERVISOR_CONF}"
    supervisorctl reread
    supervisorctl update
    log_info "Supervisor 配置已创建"
elif [ -f "${SUPERVISOR_CONF}" ]; then
    log_info "Supervisor 配置已存在，保持不变"
fi

# 确保日志目录存在
mkdir -p "${LOG_DIR}"

log_info "重启后端服务..."
supervisorctl restart sailor-backend 2>/dev/null || supervisorctl start sailor-backend 2>/dev/null
sleep 3

if supervisorctl status sailor-backend 2>/dev/null | grep -q RUNNING; then
    log_info "后端服务已启动"
else
    log_error "后端服务启动失败，请检查日志:"
    log_error "  supervisorctl tail sailor-backend stderr"
    log_error "  tail -f ${LOG_DIR}/stderr.log"
fi

log_info "重载 Nginx..."
systemctl reload nginx
log_info "Nginx 已重载"

# ----------------------------------------------------------
# 5. 清理
# ----------------------------------------------------------
log_step "===== 步骤 5/5: 清理 ====="
rm -rf "${TEMP_DIR}"
rm -rf "/tmp/sailor-campus-backup-*"
log_info "临时文件已清理"

echo ""
echo "============================================================"
log_info "更新完成！"
echo "============================================================"
echo "  版本: $(cd /opt/sailor-campus 2>/dev/null && git rev-parse --short HEAD 2>/dev/null || echo 'N/A')"
echo ""
echo "  查看后端状态: supervisorctl status"
echo "  查看后端日志: tail -f ${LOG_DIR}/error.log"
echo "============================================================"
