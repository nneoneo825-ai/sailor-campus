from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
import json
from app.database import engine
from app.models import Base

# 导入所有模型以确保表被正确创建
from app.models import (
    SysUser, SysRole, sys_user_role, SysPermission, SysOrg,
    BaseClassInfo, BaseTeacher, BaseStudent,
    CfgMoralIndicator, CfgTeachingIndicator,
    BizMoralRecord, BizTeachingRecord, SysOperationLog,
    ScheduleTask, TaskNotification
)

# 导入路由
from app.routes.auth import router as auth_router
from app.routes.students import router as students_router
from app.routes.moral import router as moral_router
from app.routes.users import router as users_router
from app.routes.roles import router as roles_router
from app.routes.permissions import router as permissions_router
from app.routes.logs import router as logs_router
from app.routes.schools import router as schools_router
from app.routes.teaching import router as teaching_router
from app.routes.analytics import router as analytics_router
from app.routes.org import router as org_router
from app.routes.dorm import router as dorm_router
from app.routes.overall import router as overall_router
from app.routes.tasks import router as tasks_router

# Create database tables
Base.metadata.create_all(bind=engine)

# Initialize permissions and assign default permissions to roles
try:
    from app.database import SessionLocal
    from app.routes.permissions import init_permissions, assign_default_permissions
    
    db = SessionLocal()
    try:
        init_permissions(db)
        assign_default_permissions(db)
    finally:
        db.close()
except Exception as e:
    print(f"⚠️  Permission initialization failed (may already exist): {e}")

app = FastAPI(
    title="水手校园精细化管理平台 API",
    description="校园管理系统后端API",
    version="1.0.0"
)

# CORS middleware
allowed_origins_str = os.getenv("ALLOWED_ORIGINS", '["http://localhost:3000","http://localhost:5173"]')
try:
    allowed_origins = json.loads(allowed_origins_str)
except:
    allowed_origins = ["http://localhost:3000","http://localhost:5173"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers - 注意：更具体的路由要放在前面
app.include_router(auth_router, prefix="/api/auth", tags=["authentication"])
app.include_router(schools_router, prefix="/api/schools", tags=["schools"])  # 先注册 schools，避免与 org 冲突
app.include_router(org_router, prefix="/api/org", tags=["organization"])
app.include_router(students_router, prefix="/api/students", tags=["students"])
app.include_router(moral_router, prefix="/api/moral", tags=["moral_education"])
app.include_router(teaching_router, prefix="/api/teaching", tags=["teaching_evaluation"])
app.include_router(dorm_router, prefix="/api/dorm", tags=["dorm_inspection"])
app.include_router(overall_router, prefix="/api/overall", tags=["overall_inspection"])
app.include_router(analytics_router, prefix="/api/analytics", tags=["analytics"])
app.include_router(users_router, prefix="/api/users", tags=["users"])
app.include_router(roles_router, prefix="/api/roles", tags=["roles"])
app.include_router(permissions_router, prefix="/api/permissions", tags=["permissions"])
app.include_router(logs_router, prefix="/api/logs", tags=["system_logs"])
app.include_router(tasks_router, tags=["schedule_tasks"])


@app.get("/")
async def root():
    """
    Root endpoint
    """
    return {
        "message": "水手校园精细化管理平台 API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health"
    }

@app.get("/health")
async def health_check():
    """
    Health check endpoint
    """
    return {"status": "healthy", "service": "sailor-campus-api"}


@app.get("/favicon.ico")
async def favicon():
    """
    Return empty response for favicon requests to avoid 404 errors
    """
    from fastapi.responses import Response
    return Response(status_code=204)
