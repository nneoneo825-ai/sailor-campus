from sqlalchemy import Column, Integer, String, VARCHAR, BIGINT, Table, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from app.database import Base
from .base import TimestampMixin


# 角色权限关联表
sys_role_permission = Table(
    'sys_role_permission',
    Base.metadata,
    Column('role_id', Integer, ForeignKey('sys_role.id'), primary_key=True),
    Column('permission_id', Integer, ForeignKey('sys_permission.id'), primary_key=True)
)


class SysPermission(Base, TimestampMixin):
    __tablename__ = "sys_permission"

    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(VARCHAR(100), unique=True, nullable=False)  # 权限编码，如: dashboard:view
    name = Column(VARCHAR(100), nullable=False)  # 权限名称，如: 查看首页
    module = Column(VARCHAR(50), nullable=False)  # 所属模块，如: dashboard, student, teacher, system
    description = Column(VARCHAR(255), nullable=True)  # 描述

    # 关联
    roles = relationship("SysRole", secondary=sys_role_permission, back_populates="permissions")


# 预定义权限模块 - 覆盖系统所有功能
PERMISSION_MODULES = [
    {
        "code": "dashboard",
        "name": "首页概览",
        "permissions": [
            {"code": "dashboard:view", "name": "查看报表"},
            {"code": "dashboard:export", "name": "导出数据"},
        ]
    },
    {
        "code": "school",
        "name": "学校管理",
        "permissions": [
            {"code": "school:view", "name": "查看校区"},
            {"code": "school:edit", "name": "编辑校区"},
        ]
    },
    {
        "code": "class",
        "name": "班级管理",
        "permissions": [
            {"code": "class:view", "name": "查看班级"},
            {"code": "class:edit", "name": "编辑班级"},
            {"code": "class:delete", "name": "删除班级"},
        ]
    },
    {
        "code": "student",
        "name": "学生管理",
        "permissions": [
            {"code": "student:view", "name": "查看学生"},
            {"code": "student:edit", "name": "编辑学生"},
            {"code": "student:delete", "name": "删除学生"},
            {"code": "student:import", "name": "导入学生"},
            {"code": "student:export", "name": "导出学生"},
        ]
    },
    {
        "code": "teacher",
        "name": "教师管理",
        "permissions": [
            {"code": "teacher:view", "name": "查看教师"},
            {"code": "teacher:edit", "name": "编辑教师"},
            {"code": "teacher:delete", "name": "删除教师"},
        ]
    },
    {
        "code": "moral",
        "name": "德育管理",
        "permissions": [
            {"code": "moral:class", "name": "班级报表"},
            {"code": "moral:grade", "name": "年级报表"},
            {"code": "moral:school", "name": "学校报表"},
            {"code": "moral:dorm", "name": "宿舍报表"},
            {"code": "moral:district", "name": "区域报表"},
            {"code": "moral:export", "name": "导出报表"},
        ]
    },
    {
        "code": "teaching",
        "name": "教学管理",
        "permissions": [
            {"code": "teaching:personal", "name": "个人报表"},
            {"code": "teaching:grade", "name": "年级报表"},
            {"code": "teaching:school", "name": "学校报表"},
            {"code": "teaching:provincial", "name": "省级报表"},
            {"code": "teaching:export", "name": "导出报表"},
        ]
    },
    {
        "code": "system",
        "name": "系统设置",
        "permissions": [
            {"code": "system:user", "name": "用户管理"},
            {"code": "system:role", "name": "角色管理"},
            {"code": "system:org", "name": "组织架构"},
            {"code": "system:moral_indicator", "name": "德育指标"},
            {"code": "system:teaching_indicator", "name": "教学指标"},
            {"code": "system:logs", "name": "系统日志"},
        ]
    },
]
