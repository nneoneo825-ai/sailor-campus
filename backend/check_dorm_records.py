from app.database import SessionLocal
from app.models.moral import BizMoralRecord, CfgMoralIndicator
from datetime import datetime, timedelta, timezone

db = SessionLocal()

# 检查所有宿舍检查记录
print('=== 所有 source=dorm 的 biz_moral_record ===')
records = db.query(BizMoralRecord).filter(
    BizMoralRecord.source == 'dorm'
).order_by(BizMoralRecord.id.desc()).limit(20).all()

if records:
    for r in records:
        print(f'ID: {r.id}, student_id: {r.student_id}, class_name: {r.class_name}')
        print(f'  rule_snapshot: {r.rule_snapshot[:50] if r.rule_snapshot else None}')
        print(f'  record_time: {r.record_time}')
        print()
else:
    print('没有 source=dorm 的记录')

# 检查最近10条所有记录
print('=== 最近10条所有 biz_moral_record ===')
records = db.query(BizMoralRecord).order_by(BizMoralRecord.id.desc()).limit(10).all()

for r in records:
    print(f'ID: {r.id}, source: {r.source}, record_time: {r.record_time}')

db.close()
