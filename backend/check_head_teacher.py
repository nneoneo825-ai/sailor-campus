"""检查班主任数据一致性"""
import sys
sys.path.insert(0, '.')
from app.database import SessionLocal
from app.models.org import SysOrg, BaseClassInfo, BaseTeacher
from app.models.user import SysUser

db = SessionLocal()

# 查找"长水实验中学杨凌校区初三二班"
print("=" * 60)
print("查找班级: 长水实验中学杨凌校区 初三 二班")
print("=" * 60)

# 1. 先找学校
school = db.query(SysOrg).filter(
    SysOrg.name.contains('杨凌'),
    SysOrg.type == 'school'
).first()

if school:
    print(f"\n学校: {school.name} (ID: {school.id})")
    
    # 2. 找年级
    grades = db.query(SysOrg).filter(
        SysOrg.parent_id == school.id,
        SysOrg.type == 'grade'
    ).all()
    
    print(f"\n年级列表:")
    for g in grades:
        print(f"  - {g.name} (ID: {g.id})")
        
        # 显示每个年级下的班级
        classes_in_grade = db.query(SysOrg).filter(
            SysOrg.parent_id == g.id,
            SysOrg.type == 'class'
        ).all()
        for c in classes_in_grade:
            print(f"      * {c.name} (ID: {c.id})")
    
    # 3. 找"初三"年级
    grade = db.query(SysOrg).filter(
        SysOrg.parent_id == school.id,
        SysOrg.type == 'grade',
        SysOrg.name.contains('初三')
    ).first()
    
    if grade:
        print(f"\n目标年级: {grade.name} (ID: {grade.id})")
        
        # 4. 找"二班"
        classes = db.query(SysOrg).filter(
            SysOrg.parent_id == grade.id,
            SysOrg.type == 'class'
        ).all()
        
        print(f"\n班级列表:")
        for c in classes:
            print(f"  - {c.name} (ID: {c.id})")
        
        target_class = db.query(SysOrg).filter(
            SysOrg.parent_id == grade.id,
            SysOrg.type == 'class',
            SysOrg.name == '2班'
        ).first()
        
        if target_class:
            print(f"\n目标班级: {target_class.name} (ID: {target_class.id})")
            
            # 5. 查询 BaseClassInfo
            class_info = db.query(BaseClassInfo).filter(
                BaseClassInfo.org_id == target_class.id
            ).first()
            
            if class_info:
                print(f"\nBaseClassInfo:")
                print(f"  org_id: {class_info.org_id}")
                print(f"  head_teacher_id: {class_info.head_teacher_id}")
                
                if class_info.head_teacher_id:
                    # 6. 查询 SysUser
                    sys_user = db.query(SysUser).filter(
                        SysUser.id == class_info.head_teacher_id
                    ).first()
                    
                    if sys_user:
                        print(f"\n关联的 SysUser:")
                        print(f"  id: {sys_user.id}")
                        print(f"  username: {sys_user.username}")
                        print(f"  real_name: {sys_user.real_name}")
                    else:
                        print(f"\n未找到关联的 SysUser (id={class_info.head_teacher_id})")
                    
                    # 7. 查询 BaseTeacher (通过 user_id)
                    teacher = db.query(BaseTeacher).filter(
                        BaseTeacher.user_id == class_info.head_teacher_id
                    ).first()
                    
                    if teacher:
                        print(f"\n关联的 BaseTeacher (通过 user_id):")
                        print(f"  id: {teacher.id}")
                        print(f"  name: {teacher.name}")
                        print(f"  user_id: {teacher.user_id}")
                        print(f"  school_id: {teacher.school_id}")
                    else:
                        print(f"\n未找到关联的 BaseTeacher (user_id={class_info.head_teacher_id})")
                else:
                    print("\nhead_teacher_id 为空")
            else:
                print("\n未找到 BaseClassInfo 记录")
        else:
            print("\n未找到'二班'")
    else:
        print("\n未找到'初三'年级")
else:
    print("未找到'杨凌'学校")

print("\n" + "=" * 60)
print("检查所有教师数据")
print("=" * 60)

# 检查所有教师
teachers = db.query(BaseTeacher).filter(
    BaseTeacher.school_id == school.id if school else True
).all()

print(f"\n学校下的教师列表:")
for t in teachers:
    print(f"  - ID: {t.id}, Name: {t.name}, user_id: {t.user_id}")

# 检查名为"张博"的教师
print("\n" + "=" * 60)
print("查找名为'张博'的教师")
print("=" * 60)

zhang_bo_teachers = db.query(BaseTeacher).filter(
    BaseTeacher.name == '张博'
).all()

if zhang_bo_teachers:
    for t in zhang_bo_teachers:
        print(f"\n教师: {t.name}")
        print(f"  id: {t.id}")
        print(f"  user_id: {t.user_id}")
        print(f"  school_id: {t.school_id}")
else:
    print("未找到名为'张博'的教师")

# 检查 sys_user 中名为"张博"的用户
zhang_bo_users = db.query(SysUser).filter(
    SysUser.real_name == '张博'
).all()

if zhang_bo_users:
    print("\nSysUser 中名为'张博'的用户:")
    for u in zhang_bo_users:
        print(f"  id: {u.id}, username: {u.username}, real_name: {u.real_name}")
else:
    print("\n未找到名为'张博'的用户")

db.close()
