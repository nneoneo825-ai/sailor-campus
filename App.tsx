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
import { hasPagePermission, getCurrentUserRole } from './src/utils/permission';

// 权限路由包装组件
const PrivateRoute: React.FC<{ element: React.ReactElement; path: string }> = ({ element, path }) => {
  const location = useLocation();
  const currentPath = location.pathname;
  const userRole = getCurrentUserRole();
  const permitted = hasPagePermission(path);

  console.log(`[权限检查] 路径: ${currentPath}, 角色: ${userRole}, 有权限: ${permitted}`);

  if (!permitted) {
    return <Navigate to="/" replace />;
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
