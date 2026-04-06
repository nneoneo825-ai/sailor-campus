#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
系统日志记录助手
"""
from typing import Optional
from sqlalchemy.orm import Session
from fastapi import Request

from app.models.log import SysOperationLog
from app.models.user import SysUser


def get_client_ip(request: Request) -> str:
    """获取客户端IP地址"""
    if "X-Forwarded-For" in request.headers:
        return request.headers["X-Forwarded-For"].split(",")[0].strip()
    elif "X-Real-IP" in request.headers:
        return request.headers["X-Real-IP"]
    else:
        return request.client.host if request.client else "unknown"


def log_operation(
    db: Session,
    user: Optional[SysUser],
    module: str,
    action: str,
    description: str,
    status: str = "成功",
    request: Optional[Request] = None,
    ip_address: Optional[str] = None,
    error_message: Optional[str] = None
) -> SysOperationLog:
    """
    记录操作日志
    
    Args:
        db: 数据库会话
        user: 操作用户对象
        module: 模块名称（如：系统入口、用户管理、德育管理、教学管理等）
        action: 操作类型（如：登录、新增、修改、删除、导出、查询等）
        description: 操作描述
        status: 状态（成功/失败）
        request: HTTP请求对象
        ip_address: IP地址（可选，优先使用request获取）
        error_message: 错误信息（可选）
    
    Returns:
        创建的日志对象
    """
    # 获取IP地址
    if request and not ip_address:
        ip_address = get_client_ip(request)
    
    # 获取用户角色
    role_name = "-"
    if user and user.roles:
        role_name = user.roles[0].name if user.roles else "-"
    
    # 创建日志记录
    log = SysOperationLog(
        user_id=user.id if user else None,
        username=(user.real_name or user.username) if user else "unknown",
        role_name=role_name,
        module=module,
        action=action,
        description=description,
        status=status,
        ip_address=ip_address,
        user_agent=request.headers.get("User-Agent") if request else None,
        request_method=request.method if request else None,
        request_path=str(request.url) if request else None,
        error_message=error_message
    )
    
    db.add(log)
    db.commit()
    db.refresh(log)
    
    return log


# 常用模块常量
MODULE_SYSTEM = "系统入口"
MODULE_USER = "用户管理"
MODULE_ROLE = "角色权限"
MODULE_ORG = "组织架构"
MODULE_MORAL = "德育管理"
MODULE_TEACHING = "教学管理"
MODULE_STUDENT = "学生管理"
MODULE_SYSTEM_SETTINGS = "系统设置"

# 常用操作类型常量
ACTION_LOGIN = "登录"
ACTION_LOGOUT = "登出"
ACTION_CREATE = "新增"
ACTION_UPDATE = "修改"
ACTION_DELETE = "删除"
ACTION_QUERY = "查询"
ACTION_EXPORT = "导出"
ACTION_IMPORT = "导入"
ACTION_ENABLE = "启用"
ACTION_DISABLE = "禁用"
