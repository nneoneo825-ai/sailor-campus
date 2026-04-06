<meta name="viewport" content="width=device-width, initial-scale=1" />
import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  School,
  GraduationCap,
  BookOpen,
  ClipboardCheck,
  Settings,
  Menu,
  X,
  LogOut,
  User as UserIcon,
  Key
} from 'lucide-react';
import { MenuLink, User } from '../types';
import { useToast } from './ui/Toast';
import { useConfirm } from './ui/Confirm';

import { filterMenuItemsByPermission, getCurrentUser, getCurrentUserId, clearAuth } from '../src/utils/permission';
import { api } from '../src/services/apiClient';

const ALL_MENU_ITEMS: MenuLink[] = [
  { label: '首页概览', path: '/', icon: LayoutDashboard },
  { label: '学校管理', path: '/school', icon: School },
  { label: '德育管理', path: '/moral', icon: GraduationCap },
  { label: '教学管理', path: '/teaching', icon: BookOpen },
  { label: '数据采集', path: '/collection', icon: ClipboardCheck },
  { label: '系统管理', path: '/system', icon: Settings },
];

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ old_password: '', new_password: '', confirm: '' });
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { confirm } = useConfirm();

  const currentUser = (() => {
    const user = getCurrentUser();
    return {
      id: user?.id?.toString() || '',
      name: user?.real_name || '未知用户',
      role: user?.role_name || '未分配角色',
      avatar: ''
    };
  })();
  
  // 根据用户权限获取过滤后的菜单
  const MENU_ITEMS = filterMenuItemsByPermission(ALL_MENU_ITEMS);

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  const handleLogout = async () => {
    const confirmed = await confirm('确定要退出登录吗？');
    if (!confirmed) return;
    // 清除认证信息
    clearAuth();
    // 重定向到登录页面
    navigate('/login');
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Sidebar */}
      <aside 
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-white transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center justify-center border-b border-slate-700 shadow-sm">
          <div className="flex items-center gap-3 font-bold text-xl tracking-wide">
            <div className="w-10 h-10 flex-shrink-0">
              <svg viewBox="0 0 432 432" className="w-full h-full">
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
            <span className="leading-none pt-0.5">水手校园管理</span>
          </div>
        </div>

        <nav className="mt-6 px-4 space-y-1">
          {MENU_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors duration-150 ${
                  isActive 
                    ? 'bg-blue-600 text-white shadow-md' 
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="mr-3 h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        
        <div className="absolute bottom-0 w-full p-4 border-t border-slate-800 bg-slate-900">
           <div className="flex items-center space-x-3">
              <img src={currentUser.avatar || undefined} alt="User" className="h-8 w-8 rounded-full border border-slate-600" />
              <div className="flex-1">
                <p className="text-sm font-medium text-white">{currentUser.name}</p>
                <p className="text-xs text-slate-400">{currentUser.role}</p>
              </div>
              <button
                onClick={handleLogout}
                className="text-slate-400 hover:text-white"
                title="退出登录"
              >
                <LogOut className="h-5 w-5" />
              </button>
           </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-16 items-center justify-between bg-white px-6 shadow-sm border-b border-slate-200 relative z-40">
          <button 
            onClick={toggleSidebar}
            className="text-slate-500 hover:text-slate-700 focus:outline-none lg:hidden"
          >
            {isSidebarOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
          
          <div className="flex items-center space-x-4 ml-auto">
            {/* User Profile Dropdown Container */}
            <div className="relative">
                <button 
                    onClick={() => setIsProfileOpen(!isProfileOpen)}
                    className="flex items-center space-x-2 focus:outline-none"
                >
                    <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold hover:bg-blue-200 transition-colors border-2 border-transparent focus:border-blue-200">
                       <UserIcon size={18} />
                    </div>
                </button>

                {/* Dropdown Menu */}
                {isProfileOpen && (
                    <>
                        <div 
                            className="fixed inset-0 z-40" 
                            onClick={() => setIsProfileOpen(false)} 
                        ></div>
                        <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-100 py-2 z-50 animate-in fade-in zoom-in-95 duration-100 origin-top-right">
                            <div className="px-4 py-3 border-b border-slate-50">
                                <p className="text-sm font-bold text-slate-800">{currentUser.name}</p>
                                <p className="text-xs text-slate-500 mt-0.5">{currentUser.role}</p>
                            </div>
                            <div className="py-1">
                                <button 
                                    onClick={() => { setIsProfileOpen(false); setIsPasswordModalOpen(true); }}
                                    className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 flex items-center transition-colors"
                                >
                                    <Key className="w-4 h-4 mr-3 text-slate-400" />
                                    修改密码
                                </button>
                                <button 
                                    onClick={() => { setIsProfileOpen(false); handleLogout(); }}
                                    className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 flex items-center transition-colors"
                                >
                                    <LogOut className="w-4 h-4 mr-3" />
                                    退出登录
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
          </div>
        </header>

        {/* Scrollable Content Area */}
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-slate-50 p-6">
          {children}
        </main>
      </div>
      
      {/* Overlay for mobile sidebar */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 z-30 bg-black opacity-50 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        ></div>
      )}

      {/* Change Password Modal */}
      {isPasswordModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50">
                    <h3 className="text-lg font-bold text-slate-800">修改密码</h3>
                    <button onClick={() => { setIsPasswordModalOpen(false); setPasswordForm({ old_password: '', new_password: '', confirm: '' }); }} className="text-slate-400 hover:text-slate-600 transition-colors">
                        <X size={20} />
                    </button>
                </div>
                <div className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">原密码</label>
                        <input 
                            type="password" 
                            value={passwordForm.old_password}
                            onChange={(e) => setPasswordForm({ ...passwordForm, old_password: e.target.value })}
                            className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-shadow"
                            placeholder="请输入原密码"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">新密码</label>
                        <input 
                            type="password" 
                            value={passwordForm.new_password}
                            onChange={(e) => setPasswordForm({ ...passwordForm, new_password: e.target.value })}
                            className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-shadow"
                            placeholder="请输入新密码"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">确认新密码</label>
                        <input 
                            type="password" 
                            value={passwordForm.confirm}
                            onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
                            className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-shadow"
                            placeholder="请再次输入新密码"
                        />
                    </div>
                </div>
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end space-x-3">
                    <button 
                        onClick={() => { setIsPasswordModalOpen(false); setPasswordForm({ old_password: '', new_password: '', confirm: '' }); }}
                        className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-white transition-colors"
                    >
                        取消
                    </button>
                    <button
                        onClick={async () => {
                          if (!passwordForm.old_password || !passwordForm.new_password) {
                            toast.warning('请填写完整');
                            return;
                          }
                          if (passwordForm.new_password !== passwordForm.confirm) {
                            toast.warning('两次输入的密码不一致');
                            return;
                          }
                          if (passwordForm.new_password.length < 6) {
                            toast.warning('新密码长度至少6位');
                            return;
                          }
                          try {
                            await api.put(`/api/users/${getCurrentUserId()}/password`, {
                              old_password: passwordForm.old_password,
                              new_password: passwordForm.new_password
                            });
                            toast.success('密码修改成功！请重新登录。');
                            setIsPasswordModalOpen(false);
                            clearAuth();
                            navigate('/login');
                          } catch (err: any) {
                            toast.error(`修改密码失败: ${err.response?.data?.detail || err.message}`);
                          }
                        }}
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

export default Layout;
