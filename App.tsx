import React, { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import SchoolManagement from './components/SchoolManagement';
import MoralEducation from './components/MoralEducation';
import TeachingManagement from './components/TeachingManagement';
import DataCollection from './components/DataCollection';
import SystemManagement from './components/SystemManagement';
import { ToastProvider } from './components/ui/Toast';
import { ConfirmProvider } from './components/ui/Confirm';

// 页面访问权限配置
// 使用权限代码控制页面访问
// 格式: 页面路径 -> 需要的权限代码（数组表示满足任一即可）
const PAGE_PERMISSIONS: Record<string, string[]> = {
  '/': [],  // 首页所有人可访问
  '/school': ['school:view', 'class:view', 'student:view', 'teacher:view'],
  '/moral': ['moral:class', 'moral:grade', 'moral:school', 'moral:dorm', 'moral:district'],
  '/teaching': ['teaching:personal', 'teaching:grade', 'teaching:school', 'teaching:provincial'],
  '/collection': ['moral:class', 'moral:grade', 'teaching:personal', 'teaching:grade'],
  '/system': ['system:user', 'system:role', 'system:org', 'system:moral_indicator', 'system:teaching_indicator', 'system:logs'],
};

// 获取当前用户权限列表
const getCurrentUserPermissions = (): string[] => {
  try {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      const userData = JSON.parse(userStr);
      return userData.permissions || [];
    }
  } catch (e) {
    console.error('Failed to get user permissions:', e);
  }
  return [];
};

// 获取当前用户角色
const getCurrentUserRole = (): string => {
  try {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      const userData = JSON.parse(userStr);
      return userData.role_name || '';
    }
  } catch (e) {
    console.error('Failed to get user role:', e);
  }
  return '';
};

// 检查用户是否有权限访问指定路径
const hasPermission = (path: string): boolean => {
  const requiredPerms = PAGE_PERMISSIONS[path];
  
  // 未配置权限要求的路径默认允许访问
  if (!requiredPerms || requiredPerms.length === 0) return true;
  
  const userPerms = getCurrentUserPermissions();
  
  // 系统管理员角色拥有所有权限
  const userRole = getCurrentUserRole();
  if (userRole === '系统管理员') return true;
  
  // 用户需要拥有至少一个所需权限
  return requiredPerms.some(perm => userPerms.includes(perm));
};

// 权限路由包装组件
const PrivateRoute: React.FC<{ element: React.ReactElement; path: string }> = ({ element, path }) => {
  const location = useLocation();
  const currentPath = location.pathname;
  
  // 调试信息
  const userRole = getCurrentUserRole();
  console.log(`[权限检查] 路径: ${currentPath}, 角色: ${userRole}, 有权限: ${hasPermission(path)}`);
  
  if (!hasPermission(path)) {
    return <Navigate to="/" replace />;  // 无权限则重定向到首页
  }
  return element;
};

const AppContent: React.FC = () => {
  const location = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // 每次路由变化时检查本地存储中的token
    const token = localStorage.getItem('auth_token');
    if (token) {
      setIsAuthenticated(true);
    } else {
      setIsAuthenticated(false);
    }
    setIsLoading(false);
  }, [location.pathname]);

  // 显示加载状态
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {isAuthenticated ? (
        <Layout>
          <Routes>
            <Route path="/" element={<PrivateRoute path="/" element={<Dashboard />} />} />
            <Route path="/school" element={<PrivateRoute path="/school" element={<SchoolManagement />} />} />
            <Route path="/moral" element={<PrivateRoute path="/moral" element={<MoralEducation />} />} />
            <Route path="/teaching" element={<PrivateRoute path="/teaching" element={<TeachingManagement />} />} />
            <Route path="/collection" element={<PrivateRoute path="/collection" element={<DataCollection />} />} />
            <Route path="/system" element={<PrivateRoute path="/system" element={<SystemManagement />} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      ) : (
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      )}
    </>
  );
};

const App: React.FC = () => {
  return (
    <Router>
      <ToastProvider>
        <ConfirmProvider>
          <AppContent />
        </ConfirmProvider>
      </ToastProvider>
    </Router>
  );
};

export default App;
