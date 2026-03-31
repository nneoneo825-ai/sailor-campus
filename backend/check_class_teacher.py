"""检查初三2班的班主任"""
import sys
sys.path.insert(0, '.')
from app.database import SessionLocal
from app.models.org import SysOrg, BaseClassInfo, BaseTeacher
from app.models.user import SysUser

db = SessionLocal()

# 初三2班的ID
class_id = 102142

print("=" * 60)
print(f"检查班级 ID: {class_id}")
print("=" * 60)

# 查询班级
cls = db.query(SysOrg).filter(SysOrg.id == class_id).first()
if cls:
    print(f"班级: {cls.name} (ID: {cls.id})")

# 查询 BaseClassInfo
class_info = db.query(BaseClassInfo).filter(BaseClassInfo.org_id == class_id).first()

if class_info:
    print(f"\nBaseClassInfo:")
    print(f"  org_id: {class_info.org_id}")
    print(f"  head_teacher_id: {class_info.head_teacher_id}")
    
    if class_info.head_teacher_id:
        # 查询 SysUser
        sys_user = db.query(SysUser).filter(SysUser.id == class_info.head_teacher_id).first()
        print(f"\n通过 SysUser.id={class_info.head_teacher_id} 查询:")
        if sys_user:
            print(f"  找到: id={sys_user.id}, real_name={sys_user.real_name}")
        else:
            print(f"  未找到")

        # 查询 BaseTeacher
        teacher = db.query(BaseTeacher).filter(BaseTeacher.user_id == class_info.head_teacher_id).first()
        print(f"\n通过 BaseTeacher.user_id={class_info.head_teacher_id} 查询:")
        if teacher:
            print(f"  找到: id={teacher.id}, name={teacher.name}, user_id={teacher.user_id}")
        else:
            print(f"  未找到 - 这是问题所在！")
    else:
        print("  head_teacher_id 为空")
else:
    print("\n未找到 BaseClassInfo 记录")

print("\n" + "=" * 60)
print("结论")
print("=" * 60)
print("""
问题分析：
- schools.py 中的班级列表API使用 BaseTeacher.user_id 查询班主任
- org.py 中的班级列表API使用 SysUser.id 查询班主任
- 如果 BaseTeacher 表中没有对应记录，schools.py 的API就返回空
""")

db.close()
