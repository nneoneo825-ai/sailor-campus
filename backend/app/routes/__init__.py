from .auth import router as auth_router
from .students import router as students_router
from .moral import router as moral_router
from .users import router as users_router
from .roles import router as roles_router
from .org import router as org_router
from .teaching import router as teaching_router
from .analytics import router as analytics_router
from .dorm import router as dorm_router
from .overall import router as overall_router
from .tasks import router as tasks_router

auth = auth_router
students = students_router
moral = moral_router
users = users_router
roles = roles_router
org = org_router
teaching = teaching_router
analytics = analytics_router
dorm = dorm_router
overall = overall_router
tasks = tasks_router
