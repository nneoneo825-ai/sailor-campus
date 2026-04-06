"""备份本地 MySQL 数据库到 SQL 文件"""
import pymysql
import datetime
import os

DB_USER = "root"
DB_PASSWORD = "nanpuqing666"
DB_HOST = "localhost"
DB_PORT = 3306
DB_NAME = "sailor_campus"

def backup():
    try:
        conn = pymysql.connect(
            host=DB_HOST, port=DB_PORT, user=DB_USER,
            password=DB_PASSWORD, database=DB_NAME, charset='utf8mb4'
        )
        cursor = conn.cursor()

        cursor.execute("SHOW TABLES")
        tables = [t[0] for t in cursor.fetchall()]

        ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_dir = os.path.join(os.path.dirname(__file__), "backups")
        os.makedirs(backup_dir, exist_ok=True)
        backup_file = os.path.join(backup_dir, f"sailor_campus_{ts}.sql")

        with open(backup_file, "w", encoding="utf-8") as f:
            f.write(f"-- Sailor Campus Database Backup\n")
            f.write(f"-- Time: {datetime.datetime.now()}\n")
            f.write(f"-- Database: {DB_NAME}\n\n")

            for table in tables:
                f.write(f"-- Table: {table}\n")
                cursor.execute(f"SHOW CREATE TABLE `{table}`")
                create_stmt = cursor.fetchone()[1]
                f.write(f"DROP TABLE IF EXISTS `{table}`;\n{create_stmt};\n\n")

                cursor.execute(f"SELECT * FROM `{table}`")
                rows = cursor.fetchall()
                if rows:
                    cols = [desc[0] for desc in cursor.description]
                    f.write(f"LOCK TABLES `{table}` WRITE;\n")
                    for row in rows:
                        vals = []
                        for v in row:
                            if v is None:
                                vals.append("NULL")
                            elif isinstance(v, (int, float)):
                                vals.append(str(v))
                            else:
                                vals.append("'" + str(v).replace("'", "''").replace("\\", "\\\\") + "'")
                        f.write(f"INSERT INTO `{table}` ({', '.join(cols)}) VALUES ({', '.join(vals)});\n")
                    f.write(f"UNLOCK TABLES;\n\n")
                print(f"  已备份: {table} ({len(rows)} 行)")

        cursor.close()
        conn.close()

        size_kb = os.path.getsize(backup_file) / 1024
        print(f"\n备份成功!")
        print(f"文件: {backup_file}")
        print(f"大小: {size_kb:.1f} KB")
        print(f"表数量: {len(tables)}")

    except Exception as e:
        print(f"备份失败: {e}")

if __name__ == "__main__":
    backup()
