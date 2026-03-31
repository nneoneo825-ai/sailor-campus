from sqlalchemy import Column, Integer, String, DateTime, Boolean, BIGINT, VARCHAR, desc
from sqlalchemy.orm import relationship
from app.database import Base
from .base import TimestampMixin


class SysUser(Base, TimestampMixin):
    __tablename__ = "sys_user"

    id = Column(BIGINT, primary_key=True, autoincrement=True, index=True)
    username = Column(VARCHAR(50), unique=True, nullable=False, index=True)
    password = Column(VARCHAR(100), nullable=False)
    real_name = Column(VARCHAR(50), nullable=False)
    wechat_openid = Column(VARCHAR(64), unique=True, nullable=True)
    avatar_url = Column(VARCHAR(255), nullable=True)
    status = Column(Integer, default=1, nullable=False)  # 1:启用, 0:禁用
    org_id = Column(Integer, index=True, nullable=True)
    password_changed = Column(Boolean, default=False, nullable=False)  # 是否已修改初始密码
    last_login_ip = Column(VARCHAR(45), nullable=True)
    last_login_time = Column(DateTime, nullable=True)

    # 关联
    roles = relationship("SysRole", secondary="sys_user_role", back_populates="users")
    # 使用字符串延迟引用，避免循环导入问题
    operation_logs = relationship(
        "SysOperationLog",
        back_populates="user",
        order_by="desc(SysOperationLog.created_at)",
        lazy="dynamic"
    )
