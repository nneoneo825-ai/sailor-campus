# -*- coding: utf-8 -*-
"""
检查整体检查记录表中的数据状态
查看多选项是否被合并记录在target_name中
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from app.database import SessionLocal

def check_overall_records():
    db = SessionLocal()
    
    try:
        print("=" * 70)
        print("[CHECK] 检查 biz_overall_record 表数据")
        print("=" * 70)
        
        # 1. 查看表结构
        print("\n[1] 表结构:")
        print("-" * 50)
        columns = db.execute(text("""
            SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_COMMENT
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = 'biz_overall_record'
            ORDER BY ORDINAL_POSITION
        """)).fetchall()
        
        for col in columns:
            print(f"  {col[0]}: {col[1]} (nullable: {col[2]})")
        
        # 2. 统计记录总数
        total = db.execute(text("SELECT COUNT(*) FROM biz_overall_record")).scalar()
        print(f"\n[2] 总记录数: {total}")
        
        if total == 0:
            print("  暂无记录")
            return
        
        # 3. 查看包含逗号的target_name（可能合并记录了多个选项）
        print("\n[3] 包含逗号的 target_name (可能合并记录了多个选项):")
        print("-" * 50)
        
        multi_targets = db.execute(text("""
            SELECT id, check_type, target_name, category, item, score_change, record_time
            FROM biz_overall_record
            WHERE target_name LIKE '%,%'
            ORDER BY record_time DESC
            LIMIT 20
        """)).fetchall()
        
        if multi_targets:
            for r in multi_targets:
                print(f"  ID: {r[0]}, 类型: {r[1]}")
                print(f"    target_name: {r[2]}")
                print(f"    分类: {r[3]}, 项目: {r[4]}, 分数: {r[5]}")
                print()
        else:
            print("  未发现合并记录的target_name")
        
        # 4. 按check_type统计
        print("\n[4] 按检查类型统计:")
        print("-" * 50)
        stats = db.execute(text("""
            SELECT check_type, COUNT(*) as count
            FROM biz_overall_record
            GROUP BY check_type
        """)).fetchall()
        
        for s in stats:
            print(f"  {s[0]}: {s[1]} 条")
        
        # 5. 查看最近的几条记录示例
        print("\n[5] 最近5条记录示例:")
        print("-" * 50)
        
        recent = db.execute(text("""
            SELECT id, check_type, target_id, target_name, category, item, score_change
            FROM biz_overall_record
            ORDER BY record_time DESC
            LIMIT 5
        """)).fetchall()
        
        for r in recent:
            print(f"  ID: {r[0]}")
            print(f"  类型: {r[1]}, target_id: {r[2]}")
            print(f"  target_name: {r[3]}")
            print(f"  分类: {r[4]}, 项目: {r[5]}, 分数: {r[6]}")
            print()
        
        print("=" * 70)
        print("[DONE] 检查完成")
        
    finally:
        db.close()

if __name__ == "__main__":
    check_overall_records()
