from sqlalchemy import Column, Integer, VARCHAR, BIGINT, Table, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base
from .base import TimestampMixin


# 用户角色关联表
sys_user_role = Table(
    'sys_user_role',
    Base.metadata,
    Column('user_id', BIGINT, ForeignKey('sys_user.id'), primary_key=True),
    Column('role_id', Integer, ForeignKey('sys_role.id'), primary_key=True)
)


# 角色权限关联表
sys_role_permission = Table(
    'sys_role_permission',
    Base.metadata,
    Column('role_id', Integer, ForeignKey('sys_role.id'), primary_key=True),
    Column('permission_id', Integer, ForeignKey('sys_permission.id'), primary_key=True)
)


# 角色数据权限关联表（自定义数据范围）
sys_role_org = Table(
    'sys_role_org',
    Base.metadata,
    Column('role_id', Integer, ForeignKey('sys_role.id'), primary_key=True),
    Column('org_id', BIGINT, ForeignKey('sys_org.id'), primary_key=True)
)


class SysRole(Base, TimestampMixin):
    __tablename__ = "sys_role"

    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(VARCHAR(50), unique=True, nullable=False)
    name = Column(VARCHAR(50), nullable=False)
    description = Column(VARCHAR(255), nullable=True)  # 角色描述
    data_scope = Column(Integer, default=2, nullable=False)  # 1:全部, 2:本校, 3:本年级, 4:本班, 5:仅本人

    # 关联
    users = relationship("SysUser", secondary=sys_user_role, back_populates="roles")
    permissions = relationship("SysPermission", secondary=sys_role_permission, back_populates="roles")


class SysPermission(Base, TimestampMixin):
    __tablename__ = "sys_permission"

    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(VARCHAR(100), unique=True, nullable=False)  # 权限编码，如: dashboard:view
    name = Column(VARCHAR(100), nullable=False)  # 权限名称，如: 查看首页
    module = Column(VARCHAR(50), nullable=False)  # 所属模块，如: dashboard, student, teacher, system
    description = Column(VARCHAR(255), nullable=True)  # 描述

    # 关联
    roles = relationship("SysRole", secondary=sys_role_permission, back_populates="permissions")
