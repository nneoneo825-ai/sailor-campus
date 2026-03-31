#!/bin/bash
set -e

# ============================================================
#  水手校园精细化管理平台 - 更新脚本
#  用于更新已部署的系统
# ============================================================

APP_DIR="/opt/sailor-campus"
FRONTEND_DIR="${APP_DIR}/frontend"
BACKEND_DIR="${APP_DIR}/backend"
LOG_DIR="/var/log/sailor-backend"
DEPLOY_USER="www"

COLOR_GREEN='\033[0;32m'
COLOR_YELLOW='\033[1;33m'
COLOR_NC='\033[0m'

log_info() { echo -e "${COLOR_GREEN}[INFO]${COLOR_NC} $1"; }
log_warn() { echo -e "${COLOR_YELLOW}[WARN]${COLOR_NC} $1"; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "${SCRIPT_DIR}")"

# 解析参数
UPDATE_FRONTEND=false
UPDATE_BACKEND=false
RESTART=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --frontend)
            UPDATE_FRONTEND=true
            shift
            ;;
        --backend)
            UPDATE_BACKEND=true
            shift
            ;;
        --all)
            UPDATE_FRONTEND=true
            UPDATE_BACKEND=true
            shift
            ;;
        --restart)
            RESTART=true
            shift
            ;;
        *)
            echo "用法: $0 [--frontend|--backend|--all] [--restart]"
            echo ""
            echo "选项:"
            echo "  --frontend  更新前端"
            echo "  --backend   更新后端"
            echo "  --all       更新全部"
            echo "  --restart   更新后重启服务"
            exit 1
            ;;
    esac
done

if [ "$UPDATE_FRONTEND" = false ] && [ "$UPDATE_BACKEND" = false ]; then
    log_warn "未指定更新内容，请使用 --frontend、--backend 或 --all"
    exit 0
fi

# 更新前端
if [ "$UPDATE_FRONTEND" = true ]; then
    log_info "===== 更新前端 ====="

    cd "${PROJECT_ROOT}"

    # 构建前端
    if [ -f "${SCRIPT_DIR}/.env.production" ]; then
        cp "${SCRIPT_DIR}/.env.production" "${PROJECT_ROOT}/.env.production"
    fi

    npm ci --production=false 2>/dev/null || npm install
    npm run build

    # 备份并更新
    if [ -d "${FRONTEND_DIR}/dist" ]; then
        rm -rf "${FRONTEND_DIR}/dist.bak"
        mv "${FRONTEND_DIR}/dist" "${FRONTEND_DIR}/dist.bak"
    fi

    mkdir -p "${FRONTEND_DIR}/dist"
    cp -r dist/* "${FRONTEND_DIR}/dist/"
    chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "${FRONTEND_DIR}"

    log_info "前端更新完成"
fi

# 更新后端
if [ "$UPDATE_BACKEND" = true ]; then
    log_info "===== 更新后端 ====="

    # 备份当前后端（保留 .env 和 venv）
    if [ -d "${BACKEND_DIR}" ]; then
        # 保留配置和虚拟环境
        [ -f "${BACKEND_DIR}/.env" ] && cp "${BACKEND_DIR}/.env" "${BACKEND_DIR}/.env.bak"
        [ -d "${BACKEND_DIR}/venv" ] && mv "${BACKEND_DIR}/venv" "${BACKEND_DIR}/venv.bak"
        [ -d "${BACKEND_DIR}/__pycache__" ] && rm -rf "${BACKEND_DIR}/__pycache__"

        # 复制新文件
        cp -r "${PROJECT_ROOT}/backend/"* "${BACKEND_DIR}/"

        # 恢复配置和虚拟环境
        [ -f "${BACKEND_DIR}/.env.bak" ] && mv "${BACKEND_DIR}/.env.bak" "${BACKEND_DIR}/.env"
        [ -d "${BACKEND_DIR}/venv.bak" ] && mv "${BACKEND_DIR}/venv.bak" "${BACKEND_DIR}/venv"
    fi

    # 如果有新依赖
    source "${BACKEND_DIR}/venv/bin/activate"
    pip install -r "${BACKEND_DIR}/requirements.txt" -q
    deactivate

    chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "${BACKEND_DIR}"

    log_info "后端更新完成"
fi

# 重启服务
if [ "$RESTART" = true ]; then
    log_info "===== 重启服务 ====="

    if [ "$UPDATE_BACKEND" = true ]; then
        supervisorctl restart sailor-backend
        log_info "后端服务已重启"
    fi

    if [ "$UPDATE_FRONTEND" = true ]; then
        systemctl reload nginx
        log_info "Nginx 已重载"
    fi
fi

log_info "更新完成！"
