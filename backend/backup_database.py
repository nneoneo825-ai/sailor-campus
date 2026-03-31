"""
数据库备份脚本
备份 MySQL 数据库中的所有数据表
"""
import os
import subprocess
from datetime import datetime
from pathlib import Path

# 数据库配置
DB_USER = "root"
DB_PASSWORD = "nanpuqing666"
DB_HOST = "localhost"
DB_PORT = 3306
DB_NAME = "sailor_campus"

# 备份目录
BACKUP_DIR = Path(__file__).parent / "backups"
BACKUP_DIR.mkdir(exist_ok=True)

def backup_database():
    """使用 mysqldump 备份数据库"""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_file = BACKUP_DIR / f"{DB_NAME}_{timestamp}.sql"
    
    # mysqldump 命令
    cmd = [
        "mysqldump",
        f"-h{DB_HOST}",
        f"-P{DB_PORT}",
        f"-u{DB_USER}",
        f"-p{DB_PASSWORD}",
        "--single-transaction",
        "--routines",
        "--triggers",
        "--events",
        DB_NAME
    ]
    
    try:
        print(f"正在备份数据库: {DB_NAME}")
        print(f"备份文件: {backup_file}")
        
        with open(backup_file, "w", encoding="utf-8") as f:
            result = subprocess.run(cmd, stdout=f, stderr=subprocess.PIPE, text=True)
        
        if result.returncode != 0:
            # 检查是否只是密码警告
            if "Using a password on the command line" in result.stderr:
                print("备份成功！(忽略密码警告)")
            else:
                print(f"备份失败: {result.stderr}")
                return None
        else:
            print("备份成功！")
        
        # 显示文件大小
        size = backup_file.stat().st_size / 1024 / 1024
        print(f"文件大小: {size:.2f} MB")
        
        return backup_file
        
    except FileNotFoundError:
        print("错误: 未找到 mysqldump 命令，请确保 MySQL 已安装并添加到系统 PATH")
        return None
    except Exception as e:
        print(f"备份出错: {e}")
        return None

def backup_with_python():
    """使用 Python + pymysql 备份数据库（不需要 mysqldump）"""
    try:
        import pymysql
    except ImportError:
        print("请先安装 pymysql: pip install pymysql")
        return None
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_file = BACKUP_DIR / f"{DB_NAME}_{timestamp}.sql"
    
    try:
        print(f"正在连接数据库: {DB_NAME}")
        
        conn = pymysql.connect(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASSWORD,
            database=DB_NAME,
            charset='utf8mb4'
        )
        
        cursor = conn.cursor()
        
        # 获取所有表名
        cursor.execute("SHOW TABLES")
        tables = [row[0] for row in cursor.fetchall()]
        
        print(f"共发现 {len(tables)} 个数据表")
        
        with open(backup_file, "w", encoding="utf-8") as f:
            f.write(f"-- 数据库备份\n")
            f.write(f"-- 数据库: {DB_NAME}\n")
            f.write(f"-- 时间: {datetime.now()}\n\n")
            f.write("SET NAMES utf8mb4;\n")
            f.write("SET FOREIGN_KEY_CHECKS = 0;\n\n")
            
            for table in tables:
                print(f"  备份表: {table}")
                
                # 获取建表语句
                cursor.execute(f"SHOW CREATE TABLE `{table}`")
                create_stmt = cursor.fetchone()[1]
                f.write(f"-- 表结构: {table}\n")
                f.write(f"DROP TABLE IF EXISTS `{table}`;\n")
                f.write(f"{create_stmt};\n\n")
                
                # 获取数据
                cursor.execute(f"SELECT * FROM `{table}`")
                rows = cursor.fetchall()
                
                if rows:
                    # 获取列名
                    columns = [desc[0] for desc in cursor.description]
                    f.write(f"-- 表数据: {table} ({len(rows)} 行)\n")
                    
                    for row in rows:
                        values = []
                        for val in row:
                            if val is None:
                                values.append("NULL")
                            elif isinstance(val, (int, float)):
                                values.append(str(val))
                            else:
                                val_str = str(val).replace("'", "''")
                                values.append(f"'{val_str}'")
                        
                        f.write(f"INSERT INTO `{table}` (`{'`, `'.join(columns)}`) VALUES ({', '.join(values)});\n")
                    f.write("\n")
            
            f.write("SET FOREIGN_KEY_CHECKS = 1;\n")
        
        cursor.close()
        conn.close()
        
        size = backup_file.stat().st_size / 1024 / 1024
        print(f"\n备份完成！文件: {backup_file}")
        print(f"文件大小: {size:.2f} MB")
        
        return backup_file
        
    except Exception as e:
        print(f"备份出错: {e}")
        return None

if __name__ == "__main__":
    print("=" * 50)
    print("数据库备份工具")
    print("=" * 50)
    print(f"数据库: {DB_NAME}")
    print(f"主机: {DB_HOST}:{DB_PORT}")
    print(f"备份目录: {BACKUP_DIR}")
    print("=" * 50)
    
    # 优先尝试 mysqldump，失败则使用 Python 方式
    backup_file = backup_database()
    
    if backup_file is None:
        print("\n尝试使用 Python 方式备份...")
        backup_file = backup_with_python()
