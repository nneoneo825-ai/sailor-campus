"""
数据权限控制模块
实现基于用户角色的数据范围过滤
"""
from typing import List, Optional, Set
from sqlalchemy.orm import Session, Query
from sqlalchemy import or_, text
from app.models.user import SysUser
from app.models.org import SysOrg


# 数据范围常量
DATA_SCOPE_ALL = 1        # 全部数据
DATA_SCOPE_SCHOOL = 2     # 本校数据
DATA_SCOPE_GRADE = 3      # 本年级数据
DATA_SCOPE_CLASS = 4      # 本班数据
DATA_SCOPE_SELF = 5       # 仅本人数据
DATA_SCOPE_CUSTOM = 6     # 自定义数据范围


class DataScope:
    """数据范围类，存储用户可访问的数据范围"""
    
    def __init__(self):
        self.has_all: bool = False           # 是否有全部数据权限
        self.school_ids: Set[int] = set()    # 可访问的学校ID
        self.grade_ids: Set[int] = set()     # 可访问的年级ID
        self.class_ids: Set[int] = set()     # 可访问的班级ID
        self.teaching_group_ids: Set[int] = set()  # 可访问的教研组ID
        self.department_ids: Set[int] = set()      # 可访问的部门ID
        self.self_only: bool = False         # 是否仅限本人数据
        self.user_id: Optional[int] = None   # 用户ID（用于仅本人数据过滤）
    
    def can_access_school(self, school_id: int) -> bool:
        """检查是否可以访问指定学校"""
        if self.has_all:
            return True
        return school_id in self.school_ids
    
    def can_access_class(self, class_id: int) -> bool:
        """检查是否可以访问指定班级"""
        if self.has_all:
            return True
        return class_id in self.class_ids
    
    def can_access_org(self, org_id: int, org_type: str) -> bool:
        """检查是否可以访问指定组织"""
        if self.has_all:
            return True
        if org_type == 'school':
            return org_id in self.school_ids
        elif org_type == 'grade':
            return org_id in self.grade_ids
        elif org_type == 'class':
            return org_id in self.class_ids
        elif org_type == 'teaching_group':
            return org_id in self.teaching_group_ids
        elif org_type == 'department':
            return org_id in self.department_ids
        return False


def get_user_data_scope(db: Session, user: SysUser) -> DataScope:
    """
    获取用户的数据访问范围
    支持多角色：合并所有角色的数据权限

    Args:
        db: 数据库会话
        user: 当前用户

    Returns:
        DataScope: 用户可访问的数据范围
    """
    scope = DataScope()
    scope.user_id = user.id

    # 如果用户没有角色，默认只能访问自己的数据
    if not user.roles:
        scope.self_only = True
        return scope

    # 收集所有角色的数据范围
    role_scopes = [role.data_scope for role in user.roles if role.data_scope]

    # 如果任何角色有全部数据权限，直接返回
    if DATA_SCOPE_ALL in role_scopes:
        scope.has_all = True
        return scope

    # 合并所有角色的自定义权限范围
    _build_custom_scope(db, scope, user)

    # 获取最小值（最大权限）用于基于组织的权限计算
    min_scope = min(role_scopes) if role_scopes else DATA_SCOPE_SELF

    # 基于用户组织的权限范围（合并到现有权限中）
    if min_scope != DATA_SCOPE_CUSTOM:
        # 如果用户有关联组织，添加基于组织的权限
        if user.org_id:
            user_org = db.query(SysOrg).filter(SysOrg.id == user.org_id).first()
            if user_org:
                _build_scope_from_org(db, scope, user_org, min_scope)

    # 补充班主任关联的班级（通过教师档案关联）
    _add_head_teacher_classes(db, scope, user)

    # 如果没有任何权限范围，设置为仅本人数据
    if not scope.has_all and not scope.school_ids and not scope.grade_ids and not scope.class_ids and not scope.teaching_group_ids and not scope.department_ids:
        # 检查是否有仅本人数据的角色
        if DATA_SCOPE_SELF in role_scopes or not role_scopes:
            scope.self_only = True

    return scope


def _build_custom_scope(db: Session, scope: DataScope, user: SysUser):
    """
    构建自定义数据范围（从角色关联的组织获取）
    合并所有具有自定义权限角色的组织权限

    Args:
        db: 数据库会话
        scope: 数据范围对象
        user: 用户对象
    """
    # 获取用户所有角色的自定义组织权限
    role_ids = [role.id for role in user.roles if role.data_scope == DATA_SCOPE_CUSTOM]

    if not role_ids:
        return  # 没有自定义权限的角色，直接返回

    # 从 sys_role_org 表获取关联的组织
    org_rows = db.execute(
        text("SELECT org_id FROM sys_role_org WHERE role_id IN :role_ids"),
        {"role_ids": tuple(role_ids) if len(role_ids) > 1 else (role_ids[0],)}
    ).fetchall()

    org_ids = [row[0] for row in org_rows]

    if not org_ids:
        return  # 没有关联的组织，直接返回

    # 获取组织详情并分类
    orgs = db.query(SysOrg).filter(SysOrg.id.in_(org_ids)).all()

    for org in orgs:
        if org.type == 'school':
            scope.school_ids.add(org.id)
        elif org.type == 'grade':
            scope.grade_ids.add(org.id)
        elif org.type == 'class':
            scope.class_ids.add(org.id)
        elif org.type == 'teaching_group':
            scope.teaching_group_ids.add(org.id)
        elif org.type == 'department':
            scope.department_ids.add(org.id)


def _build_scope_from_org(db: Session, scope: DataScope, user_org: SysOrg, data_scope: int):
    """
    根据用户组织构建数据范围
    
    Args:
        db: 数据库会话
        scope: 数据范围对象
        user_org: 用户所属组织
        data_scope: 角色的数据范围值
    """
    org_type = user_org.type
    
    if data_scope == DATA_SCOPE_SELF:
        # 仅本人数据
        scope.self_only = True
        return
    
    if org_type == 'group':
        # 用户所属组织是集团（校区管理员）
        # 获取集团下所有学校
        schools = db.query(SysOrg).filter(
            SysOrg.parent_id == user_org.id,
            SysOrg.type == 'school'
        ).all()
        
        for school in schools:
            scope.school_ids.add(school.id)
            if data_scope <= DATA_SCOPE_SCHOOL:
                # 本校权限，获取学校下所有年级和班级
                _add_school_sub_orgs(db, scope, school.id)
    
    elif org_type == 'school':
        # 用户所属组织是学校
        scope.school_ids.add(user_org.id)
        
        if data_scope <= DATA_SCOPE_SCHOOL:
            # 本校权限，获取学校下所有年级和班级
            _add_school_sub_orgs(db, scope, user_org.id)
    
    elif org_type == 'grade':
        # 用户所属组织是年级
        scope.grade_ids.add(user_org.id)
        
        # 获取年级所属学校
        if user_org.parent_id:
            parent_org = db.query(SysOrg).filter(SysOrg.id == user_org.parent_id).first()
            if parent_org and parent_org.type == 'school':
                scope.school_ids.add(parent_org.id)
                
                if data_scope == DATA_SCOPE_SCHOOL:
                    # 本校权限，获取学校下所有年级和班级
                    _add_school_sub_orgs(db, scope, parent_org.id)
                elif data_scope == DATA_SCOPE_GRADE:
                    # 本年级权限，只获取本年级下的班级
                    _add_grade_sub_classes(db, scope, user_org.id)
    
    elif org_type == 'class':
        # 用户所属组织是班级
        scope.class_ids.add(user_org.id)
        
        # 获取班级所属年级和学校
        if user_org.parent_id:
            grade_org = db.query(SysOrg).filter(SysOrg.id == user_org.parent_id).first()
            if grade_org and grade_org.type == 'grade':
                scope.grade_ids.add(grade_org.id)
                
                if grade_org.parent_id:
                    school_org = db.query(SysOrg).filter(SysOrg.id == grade_org.parent_id).first()
                    if school_org and school_org.type == 'school':
                        scope.school_ids.add(school_org.id)
                        
                        if data_scope == DATA_SCOPE_SCHOOL:
                            # 本校权限
                            _add_school_sub_orgs(db, scope, school_org.id)
                        elif data_scope == DATA_SCOPE_GRADE:
                            # 本年级权限
                            _add_grade_sub_classes(db, scope, grade_org.id)
    
    elif org_type in ('department', 'teaching_group'):
        # 用户所属组织是部门或教研组
        if org_type == 'department':
            scope.department_ids.add(user_org.id)
        else:
            scope.teaching_group_ids.add(user_org.id)
        
        # 获取父学校
        if user_org.parent_id:
            school_org = db.query(SysOrg).filter(SysOrg.id == user_org.parent_id).first()
            if school_org and school_org.type == 'school':
                scope.school_ids.add(school_org.id)
                
                if data_scope <= DATA_SCOPE_SCHOOL:
                    # 本校权限，获取学校下所有年级、班级、教研组、部门
                    _add_school_sub_orgs(db, scope, school_org.id)


def _add_school_sub_orgs(db: Session, scope: DataScope, school_id: int):
    """添加学校下所有年级、班级、教研组等到数据范围"""
    # 获取学校下所有年级
    grades = db.query(SysOrg).filter(
        SysOrg.parent_id == school_id,
        SysOrg.type == 'grade'
    ).all()
    
    for grade in grades:
        scope.grade_ids.add(grade.id)
        # 获取年级下所有班级
        classes = db.query(SysOrg).filter(
            SysOrg.parent_id == grade.id,
            SysOrg.type == 'class'
        ).all()
        for cls in classes:
            scope.class_ids.add(cls.id)
    
    # 也获取直接属于学校的班级（如果有的话）
    direct_classes = db.query(SysOrg).filter(
        SysOrg.parent_id == school_id,
        SysOrg.type == 'class'
    ).all()
    for cls in direct_classes:
        scope.class_ids.add(cls.id)
    
    # 获取学校下的教研组
    teaching_groups = db.query(SysOrg).filter(
        SysOrg.parent_id == school_id,
        SysOrg.type == 'teaching_group'
    ).all()
    for tg in teaching_groups:
        scope.teaching_group_ids.add(tg.id)
    
    # 获取学校下的部门
    departments = db.query(SysOrg).filter(
        SysOrg.parent_id == school_id,
        SysOrg.type == 'department'
    ).all()
    for dept in departments:
        scope.department_ids.add(dept.id)


def _add_grade_sub_classes(db: Session, scope: DataScope, grade_id: int):
    """添加年级下所有班级到数据范围"""
    classes = db.query(SysOrg).filter(
        SysOrg.parent_id == grade_id,
        SysOrg.type == 'class'
    ).all()
    for cls in classes:
        scope.class_ids.add(cls.id)


def _add_head_teacher_classes(db: Session, scope: DataScope, user: SysUser):
    """
    补充班主任通过教师档案关联的班级到数据范围
    关联链: sys_user.id -> base_teacher.user_id -> base_class_teacher(teacher_id, is_head_teacher=1) -> class_id
    """
    try:
        rows = db.execute(
            text("""
                SELECT DISTINCT ct.class_id
                FROM base_class_teacher ct
                JOIN base_teacher t ON t.id = ct.teacher_id
                WHERE t.user_id = :user_id
                  AND ct.is_head_teacher = 1
                  AND ct.status = 1
            """),
            {"user_id": user.id}
        ).fetchall()

        for row in rows:
            class_id = row[0]
            scope.class_ids.add(class_id)

            # 同时添加班级所属的年级和学校
            class_org = db.query(SysOrg).filter(SysOrg.id == class_id).first()
            if class_org and class_org.parent_id:
                grade_org = db.query(SysOrg).filter(SysOrg.id == class_org.parent_id).first()
                if grade_org and grade_org.type == 'grade':
                    scope.grade_ids.add(grade_org.id)
                    if grade_org.parent_id:
                        school_org = db.query(SysOrg).filter(SysOrg.id == grade_org.parent_id).first()
                        if school_org and school_org.type == 'school':
                            scope.school_ids.add(school_org.id)
    except Exception:
        pass  # 查询失败不影响其他权限


def filter_query_by_scope(
    query: Query,
    model,
    scope: DataScope,
    school_id_field: str = 'school_id',
    grade_id_field: str = 'grade_id',
    class_id_field: str = 'class_id',
    user_id_field: str = 'user_id'
) -> Query:
    """
    根据数据范围过滤查询
    
    Args:
        query: SQLAlchemy查询对象
        model: 数据模型类
        scope: 数据范围对象
        school_id_field: 学校ID字段名
        grade_id_field: 年级ID字段名
        class_id_field: 班级ID字段名
        user_id_field: 用户ID字段名
    
    Returns:
        过滤后的查询对象
    """
    # 全部数据权限，不过滤
    if scope.has_all:
        return query
    
    # 仅本人数据
    if scope.self_only:
        if hasattr(model, user_id_field):
            return query.filter(getattr(model, user_id_field) == scope.user_id)
        # 如果模型没有用户ID字段，返回空结果
        return query.filter(False)
    
    # 构建过滤条件
    filters = []
    
    # 学校ID过滤
    if scope.school_ids and hasattr(model, school_id_field):
        filters.append(getattr(model, school_id_field).in_(scope.school_ids))
    
    # 年级ID过滤（通过 org_id 或 grade_id）
    if scope.grade_ids:
        if hasattr(model, grade_id_field):
            filters.append(getattr(model, grade_id_field).in_(scope.grade_ids))
        elif hasattr(model, 'org_id'):
            # 某些表用 org_id 表示班级/年级ID
            filters.append(getattr(model, 'org_id').in_(scope.grade_ids))
    
    # 班级ID过滤
    if scope.class_ids:
        if hasattr(model, class_id_field):
            filters.append(getattr(model, class_id_field).in_(scope.class_ids))
        elif hasattr(model, 'org_id'):
            filters.append(getattr(model, 'org_id').in_(scope.class_ids))
    
    # 如果没有任何过滤条件，返回空结果（无权限）
    if not filters:
        return query.filter(False)
    
    # 使用 OR 连接所有过滤条件
    return query.filter(or_(*filters))


def filter_orgs_by_scope(
    query: Query,
    scope: DataScope,
    org_model=SysOrg
) -> Query:
    """
    过滤组织查询（特殊处理，因为组织本身没有 school_id 等字段）
    
    Args:
        query: SQLAlchemy查询对象
        scope: 数据范围对象
        org_model: 组织模型类
    
    Returns:
        过滤后的查询对象
    """
    # 全部数据权限
    if scope.has_all:
        return query
    
    # 仅本人数据，返回空（组织没有用户ID关联）
    if scope.self_only:
        return query.filter(False)
    
    # 收集所有可访问的组织ID
    accessible_org_ids = set()
    accessible_org_ids.update(scope.school_ids)
    accessible_org_ids.update(scope.grade_ids)
    accessible_org_ids.update(scope.class_ids)
    accessible_org_ids.update(scope.teaching_group_ids)
    accessible_org_ids.update(scope.department_ids)
    
    if not accessible_org_ids:
        return query.filter(False)
    
    return query.filter(org_model.id.in_(accessible_org_ids))


def check_data_access(db: Session, user: SysUser, resource_org_id: int) -> bool:
    """
    检查用户是否有权限访问指定组织的资源
    
    Args:
        db: 数据库会话
        user: 当前用户
        resource_org_id: 资源所属组织ID
    
    Returns:
        bool: 是否有访问权限
    """
    scope = get_user_data_scope(db, user)
    
    if scope.has_all:
        return True
    
    # 检查组织ID是否在可访问范围内
    if resource_org_id in scope.school_ids:
        return True
    if resource_org_id in scope.grade_ids:
        return True
    if resource_org_id in scope.class_ids:
        return True
    if resource_org_id in scope.teaching_group_ids:
        return True
    if resource_org_id in scope.department_ids:
        return True
    
    return False


def get_user_school_ids(db: Session, user: SysUser) -> List[int]:
    """
    获取用户可访问的学校ID列表
    
    Args:
        db: 数据库会话
        user: 当前用户
    
    Returns:
        List[int]: 学校ID列表
    """
    scope = get_user_data_scope(db, user)
    
    if scope.has_all:
        # 返回所有学校ID
        schools = db.query(SysOrg.id).filter(SysOrg.type == 'school').all()
        return [s.id for s in schools]
    
    return list(scope.school_ids)


def get_user_class_ids(db: Session, user: SysUser) -> List[int]:
    """
    获取用户可访问的班级ID列表
    
    Args:
        db: 数据库会话
        user: 当前用户
    
    Returns:
        List[int]: 班级ID列表
    """
    scope = get_user_data_scope(db, user)
    
    if scope.has_all:
        # 返回所有班级ID
        classes = db.query(SysOrg.id).filter(SysOrg.type == 'class').all()
        return [c.id for c in classes]
    
    return list(scope.class_ids)
