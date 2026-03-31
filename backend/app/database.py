from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from pathlib import Path
from dotenv import load_dotenv

# 加载.env文件 - 指定backend目录下的.env文件路径
env_path = Path(__file__).parent.parent / '.env'
load_dotenv(env_path)

# 仅支持MySQL数据库
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is required. Please set it in .env file")

if not DATABASE_URL.startswith("mysql"):
    raise ValueError("Only MySQL database is supported. DATABASE_URL must start with 'mysql'")

# MySQL连接池配置
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=300,
    pool_size=10,
    max_overflow=20,
    echo=False
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
