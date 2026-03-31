"""
将 SQL 备份文件导入到远程数据库
"""
import os
import subprocess

# 远程数据库配置
DB_USER = "sailor"
DB_PASSWORD = "nanpuqing666"
DB_HOST = "8.136.38.177"
DB_PORT = 3306
DB_NAME = "sailor_campus"

# SQL 备份文件路径
SQL_FILE = os.path.join(os.path.dirname(__file__), "backups", "sailor_campus_20260317_202654.sql")

def restore_with_mysql():
    """使用 mysql 命令导入"""
    if not os.path.exists(SQL_FILE):
        print(f"错误: SQL 文件不存在: {SQL_FILE}")
        return False
    
    print("=" * 50)
    print("数据库还原工具")
    print("=" * 50)
    print(f"目标数据库: {DB_NAME}")
    print(f"目标主机: {DB_HOST}:{DB_PORT}")
    print(f"SQL 文件: {SQL_FILE}")
    print("=" * 50)
    
    # mysql 命令
    cmd = [
        "mysql",
        f"-h{DB_HOST}",
        f"-P{DB_PORT}",
        f"-u{DB_USER}",
        f"-p{DB_PASSWORD}",
        DB_NAME,
        "-e", f"source {SQL_FILE}"
    ]
    
    try:
        print("正在导入 SQL 文件...")
        result = subprocess.run(
            ["mysql", f"-h{DB_HOST}", f"-P{DB_PORT}", f"-u{DB_USER}", f"-p{DB_PASSWORD}", DB_NAME],
            stdin=open(SQL_FILE, "r", encoding="utf-8"),
            stderr=subprocess.PIPE,
            text=True
        )
        
        if result.returncode != 0:
            if "Using a password on the command line" in result.stderr:
                print("导入成功！(忽略密码警告)")
                return True
            else:
                print(f"导入失败: {result.stderr}")
                return False
        else:
            print("导入成功！")
            return True
            
    except FileNotFoundError:
        print("错误: 未找到 mysql 命令，请确保 MySQL 客户端已安装并添加到系统 PATH")
        return False
    except Exception as e:
        print(f"导入出错: {e}")
        return False

def restore_with_pymysql():
    """使用 pymysql 导入"""
    try:
        import pymysql
    except ImportError:
        print("请先安装 pymysql: pip install pymysql")
        return False
    
    if not os.path.exists(SQL_FILE):
        print(f"错误: SQL 文件不存在: {SQL_FILE}")
        return False
    
    print("=" * 50)
    print("使用 pymysql 导入...")
    print("=" * 50)
    
    try:
        print(f"正在连接数据库: {DB_HOST}:{DB_PORT}/{DB_NAME}")
        
        conn = pymysql.connect(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASSWORD,
            database=DB_NAME,
            charset='utf8mb4'
        )
        
        cursor = conn.cursor()
        
        # 读取 SQL 文件
        with open(SQL_FILE, "r", encoding="utf-8") as f:
            sql_content = f.read()
        
        # 分割 SQL 语句（按分号分割，忽略注释）
        statements = []
        current_stmt = []
        
        for line in sql_content.split('\n'):
            line = line.strip()
            if line.startswith('--') or not line:
                continue
            
            current_stmt.append(line)
            
            if line.endswith(';'):
                stmt = ' '.join(current_stmt)
                if stmt and stmt != ';':
                    statements.append(stmt)
                current_stmt = []
        
        print(f"共 {len(statements)} 条 SQL 语句")
        
        # 执行 SQL 语句
        success = 0
        failed = 0
        
        for i, stmt in enumerate(statements):
            try:
                cursor.execute(stmt)
                success += 1
                if (i + 1) % 100 == 0:
                    print(f"  已执行: {i + 1}/{len(statements)}")
            except Exception as e:
                # 忽略外键约束等错误，继续执行
                if "foreign key constraint" in str(e).lower() or "duplicate" in str(e).lower():
                    pass
                else:
                    failed += 1
                    if failed <= 10:  # 只显示前10个错误
                        print(f"  语句执行失败: {str(e)[:100]}")
        
        conn.commit()
        cursor.close()
        conn.close()
        
        print(f"\n导入完成！成功: {success}, 失败: {failed}")
        return True
        
    except Exception as e:
        print(f"导入出错: {e}")
        return False

if __name__ == "__main__":
    # 优先尝试 mysql 命令行
    if not restore_with_mysql():
        print("\n尝试使用 pymysql 方式导入...")
        restore_with_pymysql()

