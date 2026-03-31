#!/usr/bin/env python3
"""
水手校园管理系统启动脚本
自动启动后端和前端服务
"""
import os
import sys
import subprocess
import time
import webbrowser
from pathlib import Path
from dotenv import load_dotenv

def check_python_version():
    """检查Python版本"""
    if sys.version_info < (3, 8):
        print("需要 Python 3.8 或更高版本")
        sys.exit(1)
    print(f"Python 版本: {sys.version.split()[0]}")

def check_mysql_connection():
    """检查MySQL数据库连接"""
    try:
        import pymysql
        from urllib.parse import urlparse
        
        # 加载环境变量
        load_dotenv(Path("backend") / ".env")
        database_url = os.getenv("DATABASE_URL")
        
        if not database_url:
            print("错误: DATABASE_URL 未配置")
            print("请在 backend/.env 文件中配置MySQL连接")
            return False
        
        parsed = urlparse(database_url)
        conn = pymysql.connect(
            host=parsed.hostname,
            port=parsed.port or 3306,
            user=parsed.username,
            password=parsed.password,
            connect_timeout=5
        )
        conn.close()
        print(f"MySQL连接正常: {parsed.hostname}:{parsed.port}")
        return True
    except Exception as e:
        print(f"MySQL连接失败: {e}")
        print("请确保MySQL服务正在运行，并检查 backend/.env 配置")
        return False

def setup_backend():
    """设置后端"""
    backend_dir = Path("backend")

    if not backend_dir.exists():
        print("找不到 backend 目录")
        return False

    os.chdir(backend_dir)

    # 检查依赖
    try:
        import fastapi
        import uvicorn
        import sqlalchemy
        import pymysql
    except ImportError:
        print("安装后端依赖...")
        subprocess.run([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"], check=True)

    os.chdir("..")
    return True

def start_backend():
    """启动后端服务"""
    print("启动后端服务...")

    backend_process = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "main:app", "--reload", "--host", "0.0.0.0", "--port", "8000"],
        cwd="backend",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )

    # 等待服务启动
    time.sleep(3)

    if backend_process.poll() is None:
        print("后端服务启动成功: http://localhost:8000")
        print("API 文档: http://localhost:8000/docs")
        return backend_process
    else:
        stdout, stderr = backend_process.communicate()
        print(f"后端启动失败: {stderr.decode()}")
        return None

def start_frontend():
    """启动前端服务"""
    print("启动前端服务...")

    # 检查依赖
    try:
        result = subprocess.run(["npm", "--version"], capture_output=True, text=True)
        print(f"npm 版本: {result.stdout.strip()}")
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("未安装 Node.js/npm，请先安装")
        return None

    # 安装依赖（如果需要）
    if not Path("node_modules").exists():
        print("安装前端依赖...")
        result = subprocess.run(["npm", "install"], capture_output=True, text=True)
        if result.returncode != 0:
            print(f"前端依赖安装失败: {result.stderr}")
            return None

    frontend_process = subprocess.Popen(
        ["npm", "run", "dev"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )

    # 等待服务启动
    time.sleep(5)

    if frontend_process.poll() is None:
        print("前端服务启动成功: http://localhost:3000")
        return frontend_process
    else:
        stdout, stderr = frontend_process.communicate()
        print(f"前端启动失败: {stderr.decode()}")
        return None

def main():
    print("水手校园管理系统启动器")
    print("=" * 50)

    # 检查Python版本
    check_python_version()

    # 检查MySQL连接
    if not check_mysql_connection():
        sys.exit(1)

    # 设置后端
    if not setup_backend():
        sys.exit(1)

    # 启动后端
    backend_process = start_backend()
    if not backend_process:
        sys.exit(1)

    # 启动前端
    frontend_process = start_frontend()
    if not frontend_process:
        backend_process.terminate()
        sys.exit(1)

    print("\n" + "=" * 50)
    print("系统启动成功！")
    print("前端地址: http://localhost:3000")
    print("后端地址: http://localhost:8000")
    print("API文档: http://localhost:8000/docs")
    print("\n按 Ctrl+C 停止服务")

    # 自动打开浏览器
    try:
        webbrowser.open("http://localhost:3000")
    except:
        pass

    try:
        # 等待用户中断
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n正在停止服务...")
        backend_process.terminate()
        frontend_process.terminate()
        print("服务已停止")

if __name__ == "__main__":
    main()
