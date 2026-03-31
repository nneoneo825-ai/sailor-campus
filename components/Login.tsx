import React, { useState } from 'react';
import { LogIn, Eye, EyeOff, Key, User, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../src/services/apiClient';
import { useToast } from './ui/Toast';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [pendingUsername, setPendingUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      // 调用后端登录API - 使用apiClient
      const formData = new URLSearchParams();
      formData.append('username', username);
      formData.append('password', password);

      const response: any = await api.post('/api/auth/login', formData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      // 保存token到localStorage
      localStorage.setItem('auth_token', response.access_token);

      // 保存用户信息
      localStorage.setItem('user', JSON.stringify(response.user));

      // 登录成功后跳转到Dashboard
      navigate('/');
    } catch (err: any) {
      console.error('登录失败:', err);
      if (err.response?.status === 403 && err.response?.data?.detail === 'First login - password change required') {
        // 首次登录，显示修改密码模态框
        setPendingUsername(username);
        setShowChangePasswordModal(true);
        setError('');
      } else if (err.response?.data?.detail) {
        setError(err.response.data.detail);
      } else {
        setError('登录失败，请检查网络连接或联系管理员');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = () => {
    toast.info('忘记密码功能开发中，请联系管理员。');
  };

  const handleFirstTimePasswordChange = async () => {
    if (!newPassword || newPassword.length < 6) {
      toast.warning('新密码长度至少6位');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.warning('两次输入的密码不一致');
      return;
    }

    try {
      // 调用首次登录修改密码API（不需要认证）
      const response: any = await api.post('/api/auth/first-login-change-password', {
        username: pendingUsername,
        new_password: newPassword
      });

      // 保存token到localStorage
      localStorage.setItem('auth_token', response.access_token);
      localStorage.setItem('user', JSON.stringify(response.user));

      toast.success('密码修改成功');
      setShowChangePasswordModal(false);
      setNewPassword('');
      setConfirmPassword('');
      setPassword('');

      // 登录成功后跳转到Dashboard
      navigate('/');
    } catch (err: any) {
      toast.error(`修改密码失败: ${err.response?.data?.detail || err.message}`);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-slate-100 px-4">
      <div className="w-full max-w-md">
        {/* Logo and Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 mb-4">
            <svg viewBox="0 0 432 432" className="w-full h-full drop-shadow-lg">
              <defs>
                <linearGradient id="logoGradient1" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#5080FF"/>
                  <stop offset="100%" stopColor="#4FCDFF"/>
                </linearGradient>
                <linearGradient id="logoGradient2" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#9643F3"/>
                  <stop offset="100%" stopColor="#3C1CE9"/>
                </linearGradient>
              </defs>
              <path d="M358.579,171.112C352.951,152.2119,337.943,137.5189,316.919,127.8746L316.919,97L234.05,97C204.81,98.16508,178.54500000000002,110.8515,159.72050000000002,130.5931C159.59109999999998,130.65789999999998,159.5264,130.7226,159.5264,130.78730000000002C153.1867,137.3894,147.7527,144.7683,143.289,152.7944C94.4476,176.808,64.75465,212.925,73.55257,242.376C77.30463,254.804,87.3317,264.448,101.7577,270.921C120.712,279.464,147.29989999999998,282.571,176.928,279.464C191.289,277.976,206.362,274.93399999999997,221.629,270.403C227.063,268.78499999999997,232.433,266.972,237.608,265.03C272.66999999999996,252.02,300.875,232.797,316.919,212.40800000000002L316.919,139.39600000000002C325.39300000000003,146.5806,331.409,155.254,334.45,165.3514C340.401,185.3519,333.35,207.35899999999998,316.919,227.554C299.582,248.849,271.765,268.202,237.608,281.01800000000003C232.433,283.024,227.063,284.837,221.565,286.45500000000004C204.486,291.568,187.602,294.611,171.4942,295.776C142.90089999999998,297.78200000000004,116.96000000000001,293.899,97.1647,284.837L93.6067,295.452L88.81960000000001,309.821L80.40979,335L158.42669999999998,335L162.95499999999998,321.472C183.91500000000002,320.695,206.168,317.071,228.81,310.339C231.786,309.433,234.697,308.527,237.608,307.55600000000004L237.608,335L316.919,335L316.919,264.38300000000004C350.622,236.033,367.701,201.534,358.579,171.17669999999998L358.579,171.112ZM133.65019999999998,175.83710000000002Q133.5855,176.096,133.5208,176.16070000000002L133.32670000000002,176.16070000000002L110.685,244.059C103.18090000000001,238.881,97.8762,232.214,95.4827,224.317C88.6255,201.20999999999998,108.3561,173.7659,142.5128,154.2831C138.76069999999999,161.07940000000002,135.8496,168.26409999999998,133.65019999999998,175.83710000000002ZM237.608,241.082C230.427,244.253,222.858,247.036,214.837,249.431C204.616,252.473,194.459,254.609,184.691,255.904L184.885,255.386L200.152,209.495L211.344,175.7724L226.611,129.8811L227.063,128.5219L231.139,116.3533L231.527,115.2529L237.608,97L237.608,241.082Z" fill="url(#logoGradient1)"/>
              <path d="M358.579,171.112C352.951,152.2119,337.943,137.5189,316.919,127.8746L316.919,97L234.05,97C204.81,98.16508,178.54500000000002,110.8515,159.72050000000002,130.5931C159.59109999999998,130.65789999999998,159.5264,130.7226,159.5264,130.78730000000002C153.1867,137.3894,147.7527,144.7683,143.289,152.7944C94.4476,176.808,64.75465,212.925,73.55257,242.376C77.30463,254.804,87.3317,264.448,101.7577,270.921C120.712,279.464,147.29989999999998,282.571,176.928,279.464C191.289,277.976,206.362,274.93399999999997,221.629,270.403C227.063,268.78499999999997,232.433,266.972,237.608,265.03C272.66999999999996,252.02,300.875,232.797,316.919,212.40800000000002L316.919,139.39600000000002C325.39300000000003,146.5806,331.409,155.254,334.45,165.3514C340.401,185.3519,333.35,207.35899999999998,316.919,227.554C299.582,248.849,271.765,268.202,237.608,281.01800000000003C232.433,283.024,227.063,284.837,221.565,286.45500000000004C204.486,291.568,187.602,294.611,171.4942,295.776C142.90089999999998,297.78200000000004,116.96000000000001,293.899,97.1647,284.837L93.6067,295.452L88.81960000000001,309.821L80.40979,335L158.42669999999998,335L162.95499999999998,321.472C183.91500000000002,320.695,206.168,317.071,228.81,310.339C231.786,309.433,234.697,308.527,237.608,307.55600000000004L237.608,335L316.919,335L316.919,264.38300000000004C350.622,236.033,367.701,201.534,358.579,171.17669999999998L358.579,171.112ZM133.65019999999998,175.83710000000002Q133.5855,176.096,133.5208,176.16070000000002L133.32670000000002,176.16070000000002L110.685,244.059C103.18090000000001,238.881,97.8762,232.214,95.4827,224.317C88.6255,201.20999999999998,108.3561,173.7659,142.5128,154.2831C138.76069999999999,161.07940000000002,135.8496,168.26409999999998,133.65019999999998,175.83710000000002ZM237.608,241.082C230.427,244.253,222.858,247.036,214.837,249.431C204.616,252.473,194.459,254.609,184.691,255.904L184.885,255.386L200.152,209.495L211.344,175.7724L226.611,129.8811L227.063,128.5219L231.139,116.3533L231.527,115.2529L237.608,97L237.608,241.082Z" fill="url(#logoGradient2)"/>
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-slate-800 mb-2">水手校园管理平台</h1>
          <p className="text-slate-600">精细化校园管理解决方案</p>
        </div>

        {/* Login Form */}
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
          <div className="px-8 py-6">
            <h2 className="text-xl font-bold text-slate-800 mb-6 text-center">用户登录</h2>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-red-800 text-sm">{error}</p>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-6">
              {/* Username Field */}
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-slate-700 mb-2">
                  登录账号
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="block w-full pl-10 pr-3 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 text-sm placeholder-slate-400"
                    placeholder="请输入登录账号"
                    required
                  />
                </div>
              </div>

              {/* Password Field */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-2">
                  登录密码
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Key className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full pl-10 pr-10 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 text-sm placeholder-slate-400"
                    placeholder="请输入登录密码"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {/* Login Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    登录中...
                  </>
                ) : (
                  <>
                    <LogIn className="h-5 w-5 mr-2" />
                    登录
                  </>
                )}
              </button>
            </form>

            {/* Forgot Password */}
            <div className="mt-6 text-center">
              <button
                onClick={handleForgotPassword}
                className="text-sm text-blue-600 hover:text-blue-800 hover:underline transition-colors"
              >
                忘记密码？
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="px-8 py-4 bg-slate-50 border-t border-slate-200">
            <p className="text-xs text-slate-500 text-center">
              © 2024 水手校园管理系统. 保留所有权利。
            </p>
          </div>
        </div>
      </div>

      {/* 首次登录修改密码模态框 */}
      {showChangePasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 overflow-hidden animate-fade-in-up">
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50">
              <h3 className="text-lg font-bold text-slate-800">首次登录需修改密码</h3>
              <button onClick={() => setShowChangePasswordModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="text-sm text-slate-600 mb-2">
                您是首次登录，默认密码为 <span className="font-bold text-blue-600">111111</span>，请修改为个人密码。
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">新密码 <span className="text-red-500">*</span></label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-shadow"
                  placeholder="请输入新密码（至少6位）"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">确认新密码 <span className="text-red-500">*</span></label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-shadow"
                  placeholder="请再次输入新密码"
                />
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowChangePasswordModal(false);
                  setNewPassword('');
                  setConfirmPassword('');
                  setPassword('');
                }}
                className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-white transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleFirstTimePasswordChange}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-sm transition-colors"
              >
                确定修改
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Login;
