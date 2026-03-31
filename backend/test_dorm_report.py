from app.database import SessionLocal
from app.models.moral import BizMoralRecord, BizOverallRecord
from datetime import datetime

db = SessionLocal()

print('=== 宿舍检查数据统计 ===')

# 统计普通宿舍检查记录
dorm_count = db.query(BizMoralRecord).filter(
    BizMoralRecord.source == 'dorm'
).count()
print(f'普通宿舍检查记录数 (source=dorm): {dorm_count}')

# 统计整体检查同步到德育记录表的宿舍记录
overall_dorm_count = db.query(BizMoralRecord).filter(
    BizMoralRecord.source == 'overall',
    BizMoralRecord.minor_category.in_(['午休晚休', '寝室内务'])
).count()
print(f'整体检查宿舍记录数 (source=overall, minor=午休晚休/寝室内务): {overall_dorm_count}')

# 统计整体检查表中的宿舍记录
overall_record_count = db.query(BizOverallRecord).filter(
    BizOverallRecord.check_type == 'DORM'
).count()
print(f'整体检查表宿舍记录数 (check_type=DORM): {overall_record_count}')

# 显示最近的记录
print()
print('=== 最近5条普通宿舍检查记录 (source=dorm) ===')
records = db.query(BizMoralRecord).filter(
    BizMoralRecord.source == 'dorm'
).order_by(BizMoralRecord.id.desc()).limit(5).all()
for r in records:
    print(f'ID: {r.id}, class_id: {r.class_id}, minor: {r.minor_category}, score: {r.score_change}')

print()
print('=== 最近5条整体检查宿舍记录 (source=overall) ===')
records = db.query(BizMoralRecord).filter(
    BizMoralRecord.source == 'overall',
    BizMoralRecord.minor_category.in_(['午休晚休', '寝室内务'])
).order_by(BizMoralRecord.id.desc()).limit(5).all()
for r in records:
    print(f'ID: {r.id}, class_id: {r.class_id}, minor: {r.minor_category}, score: {r.score_change}')

db.close()
