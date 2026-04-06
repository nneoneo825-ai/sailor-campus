from typing import Tuple, Optional, Any, List
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import text
import os
from app.database import get_db
from app.models.user import SysUser
from .auth import verify_token
from .data_scope import DataScope, get_user_data_scope

security = HTTPBearer()

# ========== 内置超级管理员配置 ==========
BUILTIN_ADMIN_USERNAME = os.getenv("BUILTIN_ADMIN_USERNAME", "neo")
BUILTIN_ADMIN_PASSWORD = os.getenv("BUILTIN_ADMIN_PASSWORD", "")


class BuiltinRole:
    """内置超级管理员角色（模拟 SysRole）"""
    def __init__(self):
        self.id = 0
        self.code = "super_admin"
        self.name = "超级管理员"
        self.description = "系统内置超级管理员"
        self.data_scope = 1  # 全部数据


class BuiltinAdmin:
    """内置超级管理员（独立于数据库的简单对象，兼容 SysUser 属性访问）"""
    def __init__(self):
        self.id = 0
        self.username = BUILTIN_ADMIN_USERNAME
        self.real_name = "系统管理员"
        self.status = 1
        self.password_changed = True
        self.org_id = None
        self.avatar_url = None
        self.password = ""
        self.wechat_openid = None
        self.last_login_ip = None
        self.last_login_time = None
        self.roles = [BuiltinRole()]


def _get_builtin_admin() -> BuiltinAdmin:
    """创建内置超级管理员对象"""
    return BuiltinAdmin()


def authenticate_builtin_admin(username: str, password: str) -> Optional[BuiltinAdmin]:
    """验证内置管理员账号"""
    if not BUILTIN_ADMIN_PASSWORD:
        return None  # 未配置密码时禁用内置管理员
    if username == BUILTIN_ADMIN_USERNAME and password == BUILTIN_ADMIN_PASSWORD:
        return _get_builtin_admin()
    return None


def is_builtin_admin(user: Any) -> bool:
    """判断是否为内置管理员"""
    return hasattr(user, 'id') and user.id == 0 and hasattr(user, 'username') and user.username == BUILTIN_ADMIN_USERNAME


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> Any:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    token = credentials.credentials
    username = verify_token(token)
    if username is None:
        raise credentials_exception

    # 内置管理员直接返回，不查数据库
    if username == BUILTIN_ADMIN_USERNAME:
        return _get_builtin_admin()

    user = db.query(SysUser).options(joinedload(SysUser.roles)).filter(SysUser.username == username).first()
    if user is None:
        raise credentials_exception
    return user


def get_current_active_user(current_user: Any = Depends(get_current_user)) -> Any:
    if current_user.status != 1:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user


def get_current_user_with_scope(
    current_user: Any = Depends(get_current_active_user),
    db: Session = Depends(get_db)
) -> Tuple[Any, DataScope]:
    """
    获取当前用户及其数据访问范围

    Returns:
        Tuple[user, DataScope]: 用户对象和数据范围对象
    """
    # 内置管理员拥有全部数据权限
    if is_builtin_admin(current_user):
        scope = DataScope()
        scope.has_all = True
        return current_user, scope

    scope = get_user_data_scope(db, current_user)
    return current_user, scope

# ========== 功能权限校验依赖 ==========

_permission_cache: dict = {}


def _check_user_permission(db: Session, user: Any, permission_code: str) -> bool:
    """检查用户是否拥有指定功能权限"""
    if is_builtin_admin(user):
        return True
    cache_key = (user.id, permission_code)
    if cache_key in _permission_cache:
        return _permission_cache[cache_key]
    result = db.execute(
        text(
            "SELECT 1 FROM sys_role_permission rp "
            "JOIN sys_user_role ur ON ur.role_id = rp.role_id "
            "JOIN sys_permission p ON rp.permission_id = p.id "
            "WHERE ur.user_id = :user_id AND p.code = :perm_code "
            "LIMIT 1"
        ),
        {"user_id": user.id, "perm_code": permission_code}
    ).first()
    has_perm = result is not None
    _permission_cache[cache_key] = has_perm
    return has_perm


def require_permission(permission_code: str):
    """
    功能权限校验依赖工厂
    用法: current_user = Depends(require_permission("student:edit"))
    """
    async def checker(
        current_user: Any = Depends(get_current_active_user),
        db: Session = Depends(get_db)
    ) -> Any:
        if not _check_user_permission(db, current_user, permission_code):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"缺少权限: {permission_code}"
            )
        return current_user
    return checker


def require_any_permission(permission_codes: List[str]):
    """
    多权限校验依赖工厂（满足其一即可）
    用法: current_user = Depends(require_any_permission(["moral:class", "moral:grade"]))
    """
    async def checker(
        current_user: Any = Depends(get_current_active_user),
        db: Session = Depends(get_db)
    ) -> Any:
        if is_builtin_admin(current_user):
            return current_user
        for code in permission_codes:
            if _check_user_permission(db, current_user, code):
                return current_user
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"缺少权限，需要以下任一权限: {', '.join(permission_codes)}"
        )
    return checker
