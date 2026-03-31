#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
系统日志模型
"""
from sqlalchemy import Column, Integer, BIGINT, VARCHAR, TEXT, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class SysOperationLog(Base):
    __tablename__ = "sys_operation_log"

    id = Column(BIGINT, primary_key=True, autoincrement=True)
    user_id = Column(BIGINT, ForeignKey('sys_user.id'), nullable=True)
    username = Column(VARCHAR(50), nullable=False)  # 用户名/姓名
    role_name = Column(VARCHAR(50), nullable=True)  # 角色名
    module = Column(VARCHAR(50), nullable=False)    # 模块：系统入口、用户管理、德育管理、教学管理等
    action = Column(VARCHAR(50), nullable=False)    # 操作类型：登录、新增、修改、删除、导出、查询等
    description = Column(TEXT, nullable=True)       # 详情描述
    status = Column(VARCHAR(20), nullable=False)    # 状态：成功、失败
    ip_address = Column(VARCHAR(50), nullable=True) # IP地址
    user_agent = Column(VARCHAR(500), nullable=True)  # 浏览器UA
    request_method = Column(VARCHAR(10), nullable=True)  # HTTP方法
    request_path = Column(VARCHAR(255), nullable=True)   # 请求路径
    request_params = Column(TEXT, nullable=True)     # 请求参数
    response_code = Column(Integer, nullable=True)   # 响应状态码
    error_message = Column(TEXT, nullable=True)      # 错误信息
    created_at = Column(DateTime, server_default=func.now(), nullable=False)  # 操作时间

    # 关联用户 - 使用backref，在一侧定义关系
    user = relationship("SysUser", back_populates="operation_logs")

    def __repr__(self):
        return f"<SysOperationLog(id={self.id}, username={self.username}, action={self.action}, module={self.module})>"
