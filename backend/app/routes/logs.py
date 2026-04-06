#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
系统日志API路由
"""
from typing import Any, Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from pydantic import BaseModel

from app.database import get_db
from app.models.log import SysOperationLog
from app.models.user import SysUser
from app.utils.deps import get_current_active_user, require_permission
from app.utils.data_scope import get_user_data_scope

router = APIRouter()


class LogQueryParams(BaseModel):
    search: Optional[str] = None
    module: Optional[str] = None
    action: Optional[str] = None
    status: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None


def check_admin_access(db, current_user):
    """检查用户是否有管理员权限（全部数据权限或本校数据权限）"""
    scope = get_user_data_scope(db, current_user)
    # 全部数据权限或本校数据权限都可以查看日志
    return scope.has_all or len(scope.school_ids) > 0


@router.get("/")
async def get_logs(
    search: Optional[str] = Query(None, description="搜索日志内容"),
    module: Optional[str] = Query(None, description="模块筛选"),
    action: Optional[str] = Query(None, description="操作类型筛选"),
    status: Optional[str] = Query(None, description="状态筛选"),
    start_date: Optional[str] = Query(None, description="开始日期 YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="结束日期 YYYY-MM-DD"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(10, ge=1, le=100, description="每页条数"),
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_permission("system:logs"))
) -> Any:
    """
    获取系统操作日志列表（仅管理员）
    """
    # 只有拥有全部数据权限的用户才能查看所有日志
    if not check_admin_access(db, current_user):
        raise HTTPException(status_code=403, detail="无权限查看系统日志")
    
    query = db.query(SysOperationLog)
    
    # 搜索关键词
    if search:
        query = query.filter(
            (SysOperationLog.username.contains(search)) |
            (SysOperationLog.description.contains(search)) |
            (SysOperationLog.module.contains(search)) |
            (SysOperationLog.action.contains(search))
        )
    
    # 模块筛选
    if module:
        query = query.filter(SysOperationLog.module == module)
    
    # 操作类型筛选
    if action:
        query = query.filter(SysOperationLog.action == action)
    
    # 状态筛选
    if status:
        query = query.filter(SysOperationLog.status == status)
    
    # 日期范围筛选
    if start_date:
        try:
            start = datetime.strptime(start_date, "%Y-%m-%d")
            query = query.filter(SysOperationLog.created_at >= start)
        except ValueError:
            pass
    
    if end_date:
        try:
            end = datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=1)
            query = query.filter(SysOperationLog.created_at < end)
        except ValueError:
            pass
    
    # 排序：按时间倒序
    query = query.order_by(desc(SysOperationLog.created_at))
    
    # 分页
    total = query.count()
    logs = query.offset((page - 1) * page_size).limit(page_size).all()
    
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "logs": [
            {
                "id": log.id,
                "created_at": log.created_at.strftime("%Y-%m-%d %H:%M:%S") if log.created_at else None,
                "username": log.username,
                "role_name": log.role_name or "-",
                "module": log.module,
                "action": log.action,
                "description": log.description or "",
                "status": log.status,
                "ip_address": log.ip_address or "-"
            }
            for log in logs
        ]
    }


@router.get("/modules")
async def get_log_modules(
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_permission("system:logs"))
) -> Any:
    """
    获取所有日志模块列表（用于筛选，仅管理员）
    """
    if not check_admin_access(db, current_user):
        raise HTTPException(status_code=403, detail="无权限查看系统日志")
    
    modules = db.query(SysOperationLog.module).distinct().all()
    return [m[0] for m in modules if m[0]]


@router.get("/actions")
async def get_log_actions(
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_permission("system:logs"))
) -> Any:
    """
    获取所有操作类型列表（用于筛选，仅管理员）
    """
    if not check_admin_access(db, current_user):
        raise HTTPException(status_code=403, detail="无权限查看系统日志")
    
    actions = db.query(SysOperationLog.action).distinct().all()
    return [a[0] for a in actions if a[0]]


@router.get("/stats")
async def get_log_stats(
    days: int = Query(7, ge=1, le=30, description="统计天数"),
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_permission("system:logs"))
) -> Any:
    """
    获取日志统计信息（仅管理员）
    """
    if not check_admin_access(db, current_user):
        raise HTTPException(status_code=403, detail="无权限查看系统日志统计")
    
    start_date = datetime.now() - timedelta(days=days)
    
    # 总日志数
    total_logs = db.query(SysOperationLog).filter(
        SysOperationLog.created_at >= start_date
    ).count()
    
    # 成功数
    success_logs = db.query(SysOperationLog).filter(
        SysOperationLog.created_at >= start_date,
        SysOperationLog.status == "成功"
    ).count()
    
    # 失败数
    failed_logs = db.query(SysOperationLog).filter(
        SysOperationLog.created_at >= start_date,
        SysOperationLog.status == "失败"
    ).count()
    
    # 各模块操作数
    module_stats = db.query(
        SysOperationLog.module,
        func.count(SysOperationLog.id).label("count")
    ).filter(
        SysOperationLog.created_at >= start_date
    ).group_by(SysOperationLog.module).all()
    
    return {
        "total": total_logs,
        "success": success_logs,
        "failed": failed_logs,
        "module_stats": [{"module": m, "count": c} for m, c in module_stats]
    }


@router.delete("/{log_id}")
async def delete_log(
    log_id: int,
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_permission("system:logs"))
) -> Any:
    """
    删除单条日志（仅管理员）
    """
    if not check_admin_access(db, current_user):
        raise HTTPException(status_code=403, detail="无权限删除系统日志")
    
    log = db.query(SysOperationLog).filter(SysOperationLog.id == log_id).first()
    if not log:
        raise HTTPException(status_code=404, detail="日志不存在")
    
    db.delete(log)
    db.commit()
    
    return {"message": "日志删除成功"}


@router.delete("/")
async def clear_logs(
    days: int = Query(30, ge=7, description="清理多少天前的日志"),
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_permission("system:logs"))
) -> Any:
    """
    清理历史日志（仅管理员）
    """
    if not check_admin_access(db, current_user):
        raise HTTPException(status_code=403, detail="无权限清理系统日志")
    
    cutoff_date = datetime.now() - timedelta(days=days)
    
    deleted_count = db.query(SysOperationLog).filter(
        SysOperationLog.created_at < cutoff_date
    ).delete()
    
    db.commit()
    
    return {
        "message": f"已清理 {deleted_count} 条历史日志",
        "deleted_count": deleted_count
    }
