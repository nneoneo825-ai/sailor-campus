/**
 * 统一权限工具模块
 *
 * 集中管理前端权限检查逻辑，避免各组件中重复定义。
 * 权限数据来源于后端登录接口返回的 user.permissions 数组，
 * 存储在 localStorage 中。
 */

// ==================== 类型定义 ====================

/** 后端返回的用户信息（存储在 localStorage 中的结构） */
export interface StoredUserData {
  id: number;
  username: string;
  real_name: string;
  role_name: string;
  permissions: string[];
  org_id?: number;
  org_name?: string;
  [key: string]: unknown;
}

/** 页面路径权限配置：路径 -> 所需权限码（满足任一即可） */
export type PagePermissionMap = Record<string, string[]>;

// ==================== 常量 ====================

/** localStorage 中用户信息的 key */
const USER_STORAGE_KEY = 'user';

/** localStorage 中 JWT token 的 key */
const TOKEN_STORAGE_KEY = 'auth_token';

/** 系统管理员角色名（拥有所有权限） */
const ADMIN_ROLE_NAME = '系统管理员';

/** 页面访问权限配置表（路由守卫 + 菜单过滤共用） */
export const PAGE_PERMISSIONS: PagePermissionMap = {
  '/': [],
  '/school': ['school:view', 'class:view', 'student:view', 'teacher:view'],
  '/moral': ['moral:class', 'moral:grade', 'moral:school', 'moral:dorm', 'moral:district'],
  '/teaching': ['teaching:personal', 'teaching:grade', 'teaching:school', 'teaching:provincial'],
  '/collection': ['moral:class', 'moral:grade', 'teaching:personal', 'teaching:grade'],
  '/system': ['system:user', 'system:role', 'system:org', 'system:moral_indicator', 'system:teaching_indicator', 'system:logs'],
};

// ==================== 用户数据读取 ====================

/** 从 localStorage 获取完整用户对象 */
export function getCurrentUser(): StoredUserData | null {
  try {
    const userStr = localStorage.getItem(USER_STORAGE_KEY);
    if (userStr) {
      return JSON.parse(userStr) as StoredUserData;
    }
  } catch (e) {
    console.error('[Permission] 解析用户数据失败:', e);
  }
  return null;
}

/** 获取当前用户权限列表 */
export function getCurrentUserPermissions(): string[] {
  const user = getCurrentUser();
  return user?.permissions || [];
}

/** 获取当前用户角色名称 */
export function getCurrentUserRole(): string {
  const user = getCurrentUser();
  return user?.role_name || '';
}

/** 获取当前用户 ID */
export function getCurrentUserId(): number | null {
  const user = getCurrentUser();
  return user?.id ?? null;
}

/** 获取当前用户所属组织 ID */
export function getCurrentUserOrgId(): number | null {
  const user = getCurrentUser();
  return user?.org_id ?? null;
}

// ==================== 认证状态 ====================

/** 获取 JWT token */
export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

/** 是否已登录（token 存在） */
export function isAuthenticated(): boolean {
  return !!getAuthToken();
}

/** 清除认证信息（退出登录时调用） */
export function clearAuth(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(USER_STORAGE_KEY);
}

// ==================== 权限检查 ====================

/** 是否为系统管理员 */
export function isAdmin(): boolean {
  return getCurrentUserRole() === ADMIN_ROLE_NAME;
}

/** 检查是否拥有指定权限码 */
export function hasPermission(permissionCode: string): boolean {
  if (isAdmin()) return true;
  return getCurrentUserPermissions().includes(permissionCode);
}

/** 检查是否拥有指定权限码中的任意一个 */
export function hasAnyPermission(permissionCodes: string[]): boolean {
  if (isAdmin()) return true;
  const userPerms = getCurrentUserPermissions();
  return permissionCodes.some(code => userPerms.includes(code));
}

/** 检查是否同时拥有所有指定权限码 */
export function hasAllPermissions(permissionCodes: string[]): boolean {
  if (isAdmin()) return true;
  const userPerms = getCurrentUserPermissions();
  return permissionCodes.every(code => userPerms.includes(code));
}

/** 检查是否有权限访问指定页面路径 */
export function hasPagePermission(path: string): boolean {
  const requiredPerms = PAGE_PERMISSIONS[path];
  if (!requiredPerms || requiredPerms.length === 0) return true;
  return hasAnyPermission(requiredPerms);
}

/** 根据权限过滤菜单项（通用工具，接收菜单数组） */
export function filterMenuItemsByPermission<T extends { path: string }>(
  menuItems: T[]
): T[] {
  return menuItems.filter(item => hasPagePermission(item.path));
}
