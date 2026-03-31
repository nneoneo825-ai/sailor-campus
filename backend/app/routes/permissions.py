from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from app.database import get_db
from app.models.role import SysRole, SysPermission
from app.utils.deps import get_current_active_user

router = APIRouter()


# Pydantic models
class PermissionItem(BaseModel):
    id: int
    code: str
    name: str
    module: str
    description: str = None


class PermissionModule(BaseModel):
    code: str
    name: str
    permissions: List[PermissionItem]


class RolePermissionUpdate(BaseModel):
    permission_ids: List[int]


class RolePermissionsResponse(BaseModel):
    role_id: int
    role_name: str
    role_code: str
    description: str
    modules: List[PermissionModule]


# 预定义权限数据 - 覆盖系统所有功能模块
PERMISSION_MODULES_DATA = [
    {
        "code": "dashboard",
        "name": "首页概览",
        "permissions": [
            {"id": 1, "code": "dashboard:view", "name": "查看报表", "module": "dashboard"},
            {"id": 2, "code": "dashboard:export", "name": "导出数据", "module": "dashboard"},
        ]
    },
    {
        "code": "school",
        "name": "学校管理",
        "permissions": [
            {"id": 3, "code": "school:view", "name": "查看校区", "module": "school"},
            {"id": 4, "code": "school:edit", "name": "编辑校区", "module": "school"},
        ]
    },
    {
        "code": "class",
        "name": "班级管理",
        "permissions": [
            {"id": 5, "code": "class:view", "name": "查看班级", "module": "class"},
            {"id": 6, "code": "class:edit", "name": "编辑班级", "module": "class"},
            {"id": 7, "code": "class:delete", "name": "删除班级", "module": "class"},
        ]
    },
    {
        "code": "student",
        "name": "学生管理",
        "permissions": [
            {"id": 8, "code": "student:view", "name": "查看学生", "module": "student"},
            {"id": 9, "code": "student:edit", "name": "编辑学生", "module": "student"},
            {"id": 10, "code": "student:delete", "name": "删除学生", "module": "student"},
            {"id": 11, "code": "student:import", "name": "导入学生", "module": "student"},
            {"id": 12, "code": "student:export", "name": "导出学生", "module": "student"},
        ]
    },
    {
        "code": "teacher",
        "name": "教师管理",
        "permissions": [
            {"id": 13, "code": "teacher:view", "name": "查看教师", "module": "teacher"},
            {"id": 14, "code": "teacher:edit", "name": "编辑教师", "module": "teacher"},
            {"id": 15, "code": "teacher:delete", "name": "删除教师", "module": "teacher"},
        ]
    },
    {
        "code": "moral",
        "name": "德育管理",
        "permissions": [
            {"id": 16, "code": "moral:class", "name": "班级报表", "module": "moral"},
            {"id": 17, "code": "moral:grade", "name": "年级报表", "module": "moral"},
            {"id": 18, "code": "moral:school", "name": "学校报表", "module": "moral"},
            {"id": 19, "code": "moral:dorm", "name": "宿舍报表", "module": "moral"},
            {"id": 20, "code": "moral:district", "name": "区域报表", "module": "moral"},
            {"id": 21, "code": "moral:export", "name": "导出报表", "module": "moral"},
        ]
    },
    {
        "code": "teaching",
        "name": "教学管理",
        "permissions": [
            {"id": 22, "code": "teaching:personal", "name": "个人报表", "module": "teaching"},
            {"id": 23, "code": "teaching:grade", "name": "年级报表", "module": "teaching"},
            {"id": 24, "code": "teaching:school", "name": "学校报表", "module": "teaching"},
            {"id": 25, "code": "teaching:provincial", "name": "省级报表", "module": "teaching"},
            {"id": 26, "code": "teaching:export", "name": "导出报表", "module": "teaching"},
        ]
    },
    {
        "code": "system",
        "name": "系统设置",
        "permissions": [
            {"id": 27, "code": "system:user", "name": "用户管理", "module": "system"},
            {"id": 28, "code": "system:role", "name": "角色管理", "module": "system"},
            {"id": 29, "code": "system:org", "name": "组织架构", "module": "system"},
            {"id": 30, "code": "system:moral_indicator", "name": "德育指标", "module": "system"},
            {"id": 31, "code": "system:teaching_indicator", "name": "教学指标", "module": "system"},
            {"id": 32, "code": "system:logs", "name": "系统日志", "module": "system"},
        ]
    },
]


@router.get("/modules")
async def get_permission_modules(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_active_user)
) -> Any:
    """
    Get all permission modules with their permissions
    """
    return {"modules": PERMISSION_MODULES_DATA}


@router.get("/role/{role_id}")
async def get_role_permissions(
    role_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_active_user)
) -> Any:
    """
    Get permissions for a specific role with module structure
    """
    role = db.query(SysRole).filter(SysRole.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    # Get role's permission IDs
    role_permission_ids = {p.id for p in role.permissions}

    # Build response with checked status
    modules = []
    for module_data in PERMISSION_MODULES_DATA:
        module_permissions = []
        for perm in module_data["permissions"]:
            module_permissions.append({
                "id": perm["id"],
                "code": perm["code"],
                "name": perm["name"],
                "module": perm["module"],
                "checked": perm["id"] in role_permission_ids
            })

        modules.append({
            "code": module_data["code"],
            "name": module_data["name"],
            "permissions": module_permissions
        })

    return {
        "role_id": role.id,
        "role_name": role.name,
        "role_code": role.code,
        "description": role.description or "",
        "modules": modules
    }


@router.put("/role/{role_id}")
async def update_role_permissions(
    role_id: int,
    data: RolePermissionUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_active_user)
) -> Any:
    """
    Update permissions for a specific role
    """
    print(f"[API] Updating role permissions: role_id={role_id}, permission_ids={data.permission_ids}")
    
    role = db.query(SysRole).filter(SysRole.id == role_id).first()
    if not role:
        print(f"[API] Role not found: {role_id}")
        raise HTTPException(status_code=404, detail="Role not found")
    
    print(f"[API] Found role: {role.name} (ID: {role.id})")

    try:
        # Clear existing permissions
        result = db.execute(
            "DELETE FROM sys_role_permission WHERE role_id = :role_id",
            {"role_id": role_id}
        )
        print(f"[API] Cleared {result.rowcount} existing permissions")

        # Add new permissions - only valid permission IDs
        valid_permission_ids = []
        for perm_id in data.permission_ids:
            # Verify permission exists
            permission = db.query(SysPermission).filter(SysPermission.id == perm_id).first()
            if permission:
                valid_permission_ids.append(perm_id)
                print(f"[API] Valid permission: {perm_id} - {permission.name}")
            else:
                print(f"[API] [WARNING] Permission ID {perm_id} does not exist, skipping...")

        for perm_id in valid_permission_ids:
            db.execute(
                "INSERT INTO sys_role_permission (role_id, permission_id) VALUES (:role_id, :permission_id)",
                {"role_id": role_id, "permission_id": perm_id}
            )

        db.commit()
        print(f"[API] Successfully updated permissions for role {role.name}")

        return {
            "message": "Role permissions updated successfully",
            "role_id": role_id,
            "role_name": role.name,
            "permissions_assigned": len(valid_permission_ids)
        }
    except Exception as e:
        db.rollback()
        print(f"[API] Error updating permissions: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update permissions: {str(e)}")


@router.get("/check/{permission_code}")
async def check_permission(
    permission_code: str,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_active_user)
) -> Any:
    """
    Check if current user has a specific permission
    """
    from app.models.user import SysUser

    # Get user's roles
    user = db.query(SysUser).filter(SysUser.id == current_user.id).first()
    user_roles = user.roles

    # Check if any role has the permission
    has_permission = False
    for role in user_roles:
        for perm in role.permissions:
            if perm.code == permission_code:
                has_permission = True
                break
        if has_permission:
            break

    return {
        "permission_code": permission_code,
        "has_permission": has_permission
    }


# Initialize permissions in database
def init_permissions(db: Session):
    """
    Initialize default permissions in database
    """
    for module_data in PERMISSION_MODULES_DATA:
        for perm_data in module_data["permissions"]:
            existing = db.query(SysPermission).filter(
                SysPermission.code == perm_data["code"]
            ).first()

            if not existing:
                perm = SysPermission(
                    id=perm_data["id"],
                    code=perm_data["code"],
                    name=perm_data["name"],
                    module=perm_data["module"]
                )
                db.add(perm)

    db.commit()
    print("✅ Permissions initialized")


# Assign default permissions to roles
def assign_default_permissions(db: Session):
    """
    Assign default permissions to roles
    """
    # Admin gets all permissions (1-32)
    admin_role = db.query(SysRole).filter(SysRole.code == "admin").first()
    if admin_role:
        all_perm_ids = list(range(1, 33))  # 1-32
        for perm_id in all_perm_ids:
            try:
                db.execute(
                    "INSERT INTO sys_role_permission (role_id, permission_id) VALUES (:role_id, :permission_id)",
                    {"role_id": admin_role.id, "permission_id": perm_id}
                )
            except IntegrityError:
                pass  # Already exists

    # Principal gets most permissions except system admin
    principal_role = db.query(SysRole).filter(SysRole.code == "principal").first()
    if principal_role:
        # 首页(1-2), 学校(3-4), 班级(5-7), 学生(8-12), 教师(13-15), 德育(16-21), 教学(22-26)
        # 不包含系统设置(27-32)
        principal_perms = list(range(1, 27))
        for perm_id in principal_perms:
            try:
                db.execute(
                    "INSERT INTO sys_role_permission (role_id, permission_id) VALUES (:role_id, :permission_id)",
                    {"role_id": principal_role.id, "permission_id": perm_id}
                )
            except IntegrityError:
                pass

    # Teacher gets limited permissions
    teacher_role = db.query(SysRole).filter(SysRole.code == "teacher").first()
    if teacher_role:
        # 首页查看(1), 班级查看(5), 学生查看(8), 德育班级报表(16), 教学个人报表(22)
        teacher_perms = [1, 5, 8, 16, 22]
        for perm_id in teacher_perms:
            try:
                db.execute(
                    "INSERT INTO sys_role_permission (role_id, permission_id) VALUES (:role_id, :permission_id)",
                    {"role_id": teacher_role.id, "permission_id": perm_id}
                )
            except IntegrityError:
                pass

    db.commit()
    print("✅ Default permissions assigned to roles")
