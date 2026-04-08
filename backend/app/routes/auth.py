from datetime import timedelta, datetime, timezone
from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app.models.user import SysUser
from app.models.org import SysOrg
from app.utils.auth import create_access_token, get_password_hash, verify_password, ACCESS_TOKEN_EXPIRE_MINUTES
from app.utils.deps import get_current_active_user, authenticate_builtin_admin, is_builtin_admin, require_permission
from app.utils.log_helper import log_operation, MODULE_SYSTEM, ACTION_LOGIN
from pydantic import BaseModel
import requests
import os

router = APIRouter()

# 微信小程序配置
WECHAT_APPID = os.getenv("WECHAT_APPID", "wxb5332521d96a3062")
WECHAT_SECRET = os.getenv("WECHAT_SECRET", "7464d585e6adc9484990b6af53ea104b")


def build_user_response(user: SysUser, db: Session) -> dict:
    """
    构建用户响应信息，包含组织架构信息和权限列表
    支持多角色，合并所有角色的权限
    """
    from sqlalchemy import text
    from app.utils.deps import is_builtin_admin

    # 内置管理员：拥有全部权限
    if is_builtin_admin(user):
        all_perms = db.execute(text("SELECT code FROM sys_permission")).fetchall()
        return {
            "id": user.id,
            "username": user.username,
            "real_name": user.real_name,
            "avatar_url": user.avatar_url,
            "org_id": None,
            "org_name": None,
            "school_id": None,
            "school_name": None,
            "grade_name": None,
            "class_name": None,
            "role_name": "超级管理员",
            "role_id": 0,
            "roles": [{"id": 0, "name": "超级管理员", "code": "super_admin"}],
            "permissions": [row[0] for row in all_perms]
        }

    # 获取所有角色信息
    roles_info = []
    role_ids = []
    if user.roles:
        for role in user.roles:
            roles_info.append({
                "id": role.id,
                "name": role.name,
                "code": role.code
            })
            role_ids.append(role.id)
    
    # 兼容旧字段：取第一个角色
    role_name = roles_info[0]["name"] if roles_info else None
    role_id = roles_info[0]["id"] if roles_info else None
    
    # 获取用户所有角色的权限（合并去重）
    permissions = []
    if role_ids:
        perm_rows = db.execute(
            text("SELECT DISTINCT p.code FROM sys_permission p JOIN sys_role_permission rp ON p.id = rp.permission_id WHERE rp.role_id IN :role_ids"),
            {"role_ids": tuple(role_ids) if len(role_ids) > 1 else (role_ids[0],)}
        ).fetchall()
        permissions = [row[0] for row in perm_rows]
    
    # 获取组织信息
    org_name = None
    school_id = None
    school_name = None
    grade_name = None
    class_name = None
    
    if user.org_id:
        org = db.query(SysOrg).filter(SysOrg.id == user.org_id).first()
        if org:
            org_name = org.name
            
            # 根据组织类型确定层级信息
            if org.type == 'school':
                school_id = org.id
                school_name = org.name
            elif org.type == 'class':
                class_name = org.name
                # 查找父级（年级）
                if org.parent_id:
                    grade = db.query(SysOrg).filter(SysOrg.id == org.parent_id).first()
                    if grade:
                        grade_name = grade.name
                        # 查找学校
                        if grade.parent_id:
                            school = db.query(SysOrg).filter(SysOrg.id == grade.parent_id).first()
                            if school and school.type == 'school':
                                school_id = school.id
                                school_name = school.name
            elif org.type == 'department' or org.type == 'grade':
                grade_name = org.name
                # 查找学校
                if org.parent_id:
                    parent = db.query(SysOrg).filter(SysOrg.id == org.parent_id).first()
                    if parent:
                        if parent.type == 'school':
                            school_id = parent.id
                            school_name = parent.name
                        elif parent.type == 'department':
                            # 可能是部门下的年级，继续向上查找
                            if parent.parent_id:
                                school = db.query(SysOrg).filter(SysOrg.id == parent.parent_id).first()
                                if school and school.type == 'school':
                                    school_id = school.id
                                    school_name = school.name
    
    return {
        "id": user.id,
        "username": user.username,
        "real_name": user.real_name,
        "avatar_url": user.avatar_url,
        "org_id": user.org_id,
        "org_name": org_name,
        "school_id": school_id,
        "school_name": school_name,
        "grade_name": grade_name,
        "class_name": class_name,
        "role_name": role_name,
        "role_id": role_id,
        "roles": roles_info,  # 新增：所有角色列表
        "permissions": permissions
    }


class WechatLoginRequest(BaseModel):
    code: str
    user_info: Optional[dict] = None


def authenticate_user(db: Session, username: str, password: str):
    # 先检查内置管理员
    builtin = authenticate_builtin_admin(username, password)
    if builtin:
        return builtin
    user = db.query(SysUser).options(joinedload(SysUser.roles)).filter(SysUser.username == username).first()
    if not user:
        return False
    if not verify_password(password, user.password):
        return False
    return user


@router.post("/login")
async def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
) -> Any:
    """
    OAuth2 compatible token login, get an access token for future requests
    """
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect username or password"
        )
    elif user.status != 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user"
        )

    # 内置管理员跳过数据库相关操作
    if is_builtin_admin(user):
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": user.username}, expires_delta=access_token_expires
        )
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": build_user_response(user, db)
        }

    # Check if user needs to change password
    if not user.password_changed:
        raise HTTPException(
            status_code=403,
            detail="First login - password change required"
        )

    # Update last login time (北京时间)
    beijing_tz = timezone(timedelta(hours=8))
    user.last_login_time = datetime.now(beijing_tz)
    db.commit()

    # 记录登录日志
    log_operation(
        db=db,
        user=user,
        module=MODULE_SYSTEM,
        action=ACTION_LOGIN,
        description=f"用户 {user.real_name} 登录系统",
        status="成功",
        request=request
    )

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": build_user_response(user, db)
    }


@router.post("/register")
async def register(
    username: str,
    password: str,
    real_name: str,
    db: Session = Depends(get_db)
) -> Any:
    """
    Register a new user (disabled in production for security)
    """
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="注册功能已关闭，请联系管理员创建账号"
    )


@router.get("/me")
async def read_users_me(
    current_user: SysUser = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Get current user with organization info
    """
    return build_user_response(current_user, db)


@router.post("/wechat-login")
async def wechat_login(
    login_data: WechatLoginRequest,
    request: Request,
    db: Session = Depends(get_db)
) -> Any:
    """
    微信小程序登录
    通过 wx.login 获取的 code 换取 openid，并返回 JWT token
    """
    # 如果没有配置微信小程序参数，使用模拟登录（开发测试用）
    if not WECHAT_APPID or not WECHAT_SECRET:
        import warnings
        warnings.warn(
            "⚠️ [严重警告] WECHAT_APPID/WECHAT_SECRET 未配置！当前运行在模拟模式。"
            "模拟模式下 openid 基于 code 生成，每次登录 code 不同导致绑定失效。"
            "请在 .env 中配置真实的微信小程序凭证后重启服务。",
            RuntimeWarning,
            stacklevel=2
        )
        # 开发模式：根据 code 模拟不同的用户（每个code对应不同openid）
        # 注意：此模式下 openid 每次都不同，仅用于本地调试，生产环境必须配置真实凭证
        mock_openid = f"mock_openid_{login_data.code[:10]}"
        
        # 查找已绑定的用户
        user = db.query(SysUser).filter(SysUser.wechat_openid == mock_openid).first()
        if not user:
            # 开发模式下不自动绑定到默认用户，要求走正常绑定流程
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="未找到关联用户，请先绑定账号"
            )
    else:
        # 生产模式：调用微信接口获取 openid
        url = f"https://api.weixin.qq.com/sns/jscode2session"
        params = {
            "appid": WECHAT_APPID,
            "secret": WECHAT_SECRET,
            "js_code": login_data.code,
            "grant_type": "authorization_code"
        }
        
        try:
            response = requests.get(url, params=params, timeout=10)
            data = response.json()
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"微信接口调用失败: {str(e)}"
            )
        
        if "openid" not in data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"微信登录失败: {data.get('errmsg', '未知错误')}"
            )
        
        openid = data["openid"]
        
        # 查找用户
        user = db.query(SysUser).filter(SysUser.wechat_openid == openid).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="未找到关联用户，请先绑定账号"
            )
    
    if user.status != 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户已被禁用"
        )

    # Update last login time (北京时间)
    beijing_tz = timezone(timedelta(hours=8))
    user.last_login_time = datetime.now(beijing_tz)
    db.commit()

    # 记录登录日志
    log_operation(
        db=db,
        user=user,
        module=MODULE_SYSTEM,
        action="微信小程序登录",
        description=f"用户 {user.real_name} 通过微信小程序登录",
        status="成功",
        request=request
    )
    
    # 创建访问令牌
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": build_user_response(user, db)
    }


class FirstLoginPasswordChange(BaseModel):
    username: str
    current_password: str
    new_password: str


@router.post("/first-login-change-password")
async def first_login_change_password(
    password_data: FirstLoginPasswordChange,
    db: Session = Depends(get_db)
) -> Any:
    """
    First login password change - no authentication required
    This endpoint allows new users to change their default password on first login
    """
    # Find user by username
    user = db.query(SysUser).options(joinedload(SysUser.roles)).filter(SysUser.username == password_data.username).first()
    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    # Verify user needs to change password (first login)
    if user.password_changed:
        raise HTTPException(
            status_code=400,
            detail="Password has already been changed. Please use regular password change."
        )

    # Verify the current password (may be default or admin-reset password)
    if not verify_password(password_data.current_password, user.password):
        raise HTTPException(
            status_code=400,
            detail="当前密码不正确"
        )

    # Update password and mark as changed
    beijing_tz = timezone(timedelta(hours=8))
    user.password = get_password_hash(password_data.new_password)
    user.password_changed = True
    user.last_login_time = datetime.now(beijing_tz)  # Update last login time (北京时间)
    db.commit()

    # Generate access token for the user
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": build_user_response(user, db),
        "message": "Password changed successfully"
    }


@router.post("/wechat-bind")
async def wechat_bind(
    login_data: WechatLoginRequest,
    username: str,
    password: str,
    db: Session = Depends(get_db)
) -> Any:
    """
    绑定微信账号到现有用户
    """
    # 验证用户 credentials
    user = db.query(SysUser).filter(SysUser.username == username).first()
    if not user or not verify_password(password, user.password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户名或密码错误"
        )
    
    # 获取微信 openid
    if not WECHAT_APPID or not WECHAT_SECRET:
        import warnings
        warnings.warn(
            "⚠️ [严重警告] WECHAT_APPID/WECHAT_SECRET 未配置！当前运行在模拟模式。"
            "模拟模式下绑定关系不稳定，退出后需重新绑定。"
            "请在 .env 中配置真实的微信小程序凭证后重启服务。",
            RuntimeWarning,
            stacklevel=2
        )
        openid = f"mock_openid_{login_data.code[:10]}"
    else:
        url = f"https://api.weixin.qq.com/sns/jscode2session"
        params = {
            "appid": WECHAT_APPID,
            "secret": WECHAT_SECRET,
            "js_code": login_data.code,
            "grant_type": "authorization_code"
        }
        
        try:
            response = requests.get(url, params=params, timeout=10)
            data = response.json()
            openid = data.get("openid")
            if not openid:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="微信接口调用失败"
                )
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"微信接口调用失败: {str(e)}"
            )
    
    # 检查 openid 是否已被其他账号绑定
    existing = db.query(SysUser).filter(
        SysUser.wechat_openid == openid,
        SysUser.id != user.id
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该微信已被其他账号绑定"
        )
    
    # 绑定 openid
    user.wechat_openid = openid
    db.commit()
    
    # 创建访问令牌
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": build_user_response(user, db)
    }


@router.post("/admin/unbind-wechat/{user_id}")
async def admin_unbind_wechat(
    user_id: int,
    request: Request,
    current_user: SysUser = Depends(require_permission("system:user")),
    db: Session = Depends(get_db)
) -> Any:
    """
    管理员解绑用户微信
    """

    # 查找用户
    user = db.query(SysUser).filter(SysUser.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在"
        )

    if not user.wechat_openid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该用户未绑定微信"
        )

    # 清除微信绑定
    user.wechat_openid = None
    db.commit()

    # 记录操作日志
    log_operation(
        db=db,
        user=current_user,
        module=MODULE_SYSTEM,
        action="解绑微信",
        description=f"管理员解除了用户 {user.real_name}({user.username}) 的微信绑定",
        status="成功",
        request=request
    )

    return {"message": "微信解绑成功"}
