from sqlalchemy import Column, Integer, DateTime, BIGINT, func


class TimestampMixin:
    """时间戳混入类 - 自动维护创建和更新时间"""
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)


class SoftDeleteMixin:
    """软删除混入类 - 支持逻辑删除，可恢复误删数据"""
    deleted_at = Column(DateTime, nullable=True, default=None, index=True)
    deleted_by = Column(BIGINT, nullable=True, default=None)
    
    @property
    def is_deleted(self) -> bool:
        return self.deleted_at is not None


class OptimisticLockMixin:
    """乐观锁混入类 - 防止并发更新冲突"""
    version = Column(Integer, default=1, nullable=False)


class AuditMixin:
    """审计混入类 - 记录数据创建和修改人"""
    created_by = Column(BIGINT, nullable=True, default=None)
    updated_by = Column(BIGINT, nullable=True, default=None)


class FullAuditMixin(TimestampMixin, SoftDeleteMixin, OptimisticLockMixin, AuditMixin):
    """完整审计混入类 - 包含所有审计功能"""
    pass
