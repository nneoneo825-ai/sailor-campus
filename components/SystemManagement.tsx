import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Users, 
  Shield, 
  Network, 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  Key, 
  ChevronRight, 
  ChevronDown,
  ChevronLeft,
  Building,
  CheckCircle,
  XCircle,
  Save,
  X,
  Upload,
  Activity,
  FileText,
  Smartphone,
  Unlink
} from 'lucide-react';
import { api, API_BASE_URL } from '../src/services/apiClient';
import RoleManagement from './RoleManagement';
import OrgManagement from './OrgManagement';
import { getBeijingDate } from '../src/utils/dateUtils';
import { getCurrentUserId } from '../src/utils/permission';
import { useToast } from './ui/Toast';
import { useConfirm } from './ui/Confirm';

// --- Types ---
interface ApiUser {
  id: number;
  username: string;
  real_name: string;
  status: number;
  org_id?: number;
  last_login_time?: string;
  roles?: ApiRole[];
  org?: {
    id: number;
    name: string;
  };
  wechat_openid?: string;
}

interface ApiRole {
  id: number;
  code: string;
  name: string;
  data_scope: number;
}

interface ApiOrg {
  id: number;
  parent_id: number;
  name: string;
  type: 'group' | 'school' | 'dept' | 'grade' | 'class';
  sort_order: number;
  tree_path: string;
  children?: ApiOrg[];
}

interface ApiMoralIndicator {
  id: number;
  category: string;  // 大项
  sub_category: string;  // 小项
  name: string;
  type: 'bonus' | 'deduction';
  default_score: number;
  is_enabled: number;
  is_overall: number;  // 整体检查标识
  org_id?: number;
  org_name?: string;
}

interface ApiOrgSimple {
  id: number;
  name: string;
  type: string;
  level: number;
}

interface ApiOrgTree {
  id: number;
  name: string;
  type: string;
  children?: ApiOrgTree[];
}

interface ApiTeachingIndicator {
  id: number;
  major_category: string;
  name: string;
  type: 'score' | 'bonus' | 'deduction';
  default_score: number;
  is_enabled: number;
  is_overall: number;  // 整体检查标识
  org_id?: number;
}

interface ApiLog {
  id: number;
  created_at: string;
  username: string;
  role_name: string;
  module: string;
  action: string;
  description: string;
  status: '成功' | '失败';
  ip_address: string;
}

// --- Helpers ---
const flattenOrgTree = (nodes: ApiOrg[], level = 0): { id: number, label: string, level: number, type: string }[] => {
  let result: { id: number, label: string, level: number, type: string }[] = [];
  nodes.forEach(node => {
    result.push({ id: node.id, label: node.name, level, type: node.type });
    if (node.children) {
      result = result.concat(flattenOrgTree(node.children, level + 1));
    }
  });
  return result;
};

// Format UTC datetime to local datetime string
const formatLocalDateTime = (utcDateTimeStr: string | null | undefined): string => {
  if (!utcDateTimeStr) return '-';
  try {
    const date = new Date(utcDateTimeStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  } catch (e) {
    console.error('Failed to format datetime:', e);
    return '-';
  }
};

// --- Sub-components ---

const UserManagementTab = () => {
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [passwordData, setPasswordData] = useState({ id: '', name: '', password: '', confirm: '' });

  const [formData, setFormData] = useState({
    name: '',
    username: '',
    org_id: '',
    roles: [] as string[],
    status: 1
  });

  const [orgs, setOrgs] = useState<ApiOrgSimple[]>([]);
  const [orgTree, setOrgTree] = useState<ApiOrgTree[]>([]);
  const [expandedOrgs, setExpandedOrgs] = useState<Set<number>>(new Set());
  const [roles, setRoles] = useState<ApiRole[]>([]);
  const [showOrgSelector, setShowOrgSelector] = useState(false);
  const { toast } = useToast();
  const { confirm } = useConfirm();

  // 切换组织展开/收起
  const toggleOrgExpand = (orgId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const newExpanded = new Set(expandedOrgs);
    if (newExpanded.has(orgId)) {
      newExpanded.delete(orgId);
    } else {
      newExpanded.add(orgId);
    }
    setExpandedOrgs(newExpanded);
  };

  // 全部展开/收起
  const toggleAllOrgs = (expand: boolean) => {
    if (expand) {
      const allIds = new Set<number>();
      const collectIds = (nodes: ApiOrgTree[]) => {
        nodes.forEach(node => {
          if (node.children && node.children.length > 0) {
            allIds.add(node.id);
            collectIds(node.children);
          }
        });
      };
      collectIds(orgTree);
      setExpandedOrgs(allIds);
    } else {
      setExpandedOrgs(new Set());
    }
  };

  // 获取组织的完整层级路径
  const getOrgPath = (orgId: number): { name: string; type: string }[] => {
    const path: { name: string; type: string }[] = [];
    const findPath = (nodes: ApiOrgTree[], targetId: number): boolean => {
      for (const node of nodes) {
        if (node.id === targetId) {
          path.push({ name: node.name, type: node.type });
          return true;
        }
        if (node.children) {
          if (findPath(node.children, targetId)) {
            path.unshift({ name: node.name, type: node.type });
            return true;
          }
        }
      }
      return false;
    };
    findPath(orgTree, orgId);
    return path;
  };

  // 递归渲染组织树
  const renderOrgTree = (nodes: ApiOrgTree[], level: number): React.ReactNode => {
    return nodes.map(node => {
      const hasChildren = node.children && node.children.length > 0;
      const isExpanded = expandedOrgs.has(node.id);
      const isSelected = formData.org_id === node.id.toString();

      return (
        <div key={node.id}>
          <div
            className={`w-full text-left px-3 py-2 rounded text-sm hover:bg-blue-50 flex items-center gap-2 cursor-pointer ${
              isSelected ? 'bg-blue-50 text-blue-700' : ''
            }`}
            style={{ paddingLeft: `${level * 16 + 8}px` }}
            onClick={() => {
              setFormData({...formData, org_id: node.id.toString()});
              setShowOrgSelector(false);
            }}
          >
            {/* 展开/收起按钮 */}
            {hasChildren ? (
              <button
                type="button"
                onClick={(e) => toggleOrgExpand(node.id, e)}
                className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded"
              >
                {isExpanded ? (
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                ) : (
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </button>
            ) : (
              <span className="w-5" />
            )}
            <span>{getOrgTypeIcon(node.type)}</span>
            <span className="flex-1">{node.name}</span>
            <span className="text-xs text-slate-400">{getOrgTypeName(node.type)}</span>
          </div>
          {/* 子节点 */}
          {hasChildren && isExpanded && (
            <div>
              {renderOrgTree(node.children!, level + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  // Load users from API
  useEffect(() => {
    loadUsers();
    loadOrgs();
    loadRoles();
  }, [currentPage, pageSize, searchTerm]);

  const loadRoles = async () => {
    try {
      const response: any = await api.get('/api/roles/list');
      setRoles(response.roles || []);
    } catch (err: any) {
      console.error('Failed to load roles:', err);
    }
  };

  const loadOrgs = async () => {
    try {
      const response: ApiOrg[] = await api.get('/api/org/tree');
      // 保存树形结构
      setOrgTree(response);
      // Flatten org tree for select with level info
      const flattenOrgs = (nodes: any[], level: number = 0): ApiOrgSimple[] => {
        let result: ApiOrgSimple[] = [];
        nodes.forEach(node => {
          result.push({ id: node.id, name: node.name, type: node.type, level });
          if (node.children) {
            result = result.concat(flattenOrgs(node.children, level + 1));
          }
        });
        return result;
      };
      setOrgs(flattenOrgs(response));
    } catch (err) {
      console.error('Failed to load orgs:', err);
      setOrgs([]);
      setOrgTree([]);
    }
  };

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      params.append('page', currentPage.toString());
      params.append('page_size', pageSize.toString());
      if (searchTerm) params.append('keyword', searchTerm);
      
      const response = await api.get<{ users: ApiUser[], total: number, page: number, page_size: number }>(`/api/users/?${params.toString()}`);
      setUsers(response.users);
      setTotal(response.total);
      setTotalPages(Math.ceil(response.total / pageSize));
    } catch (err: any) {
      setError(err.message || '加载用户失败');
      console.error('Failed to load users:', err);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  // 重置页码当搜索条件变化时
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await api.post<{
        total: number;
        success: number;
        failed: number;
        errors: Array<{ row: number; message: string }>;
        imported_users: Array<{ id: number; username: string; real_name: string }>;
      }>('/api/users/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      let message = `导入完成！\n成功: ${response.success} 人\n失败: ${response.failed} 人`;
      if (response.errors.length > 0) {
        message += `\n\n错误详情:\n${response.errors.slice(0, 5).map(e => `第${e.row}行: ${e.message}`).join('\n')}`;
        if (response.errors.length > 5) {
          message += `\n...还有 ${response.errors.length - 5} 条错误`;
        }
      }
      toast.info(message);
      
      // 刷新用户列表
      loadUsers();
    } catch (err: any) {
      toast.error(`导入失败: ${err.message || '未知错误'}`);
    } finally {
      setLoading(false);
      event.target.value = '';
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const baseUrl = API_BASE_URL;
      const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
      const response = await fetch(`${baseUrl}/api/users/template/download`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) {
        throw new Error(`下载失败: ${response.status}`);
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'user_import_template.xlsx';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      toast.error(`下载模板失败: ${err.message}`);
    }
  };

  // 获取姓氏头像颜色
  const getAvatarColor = (name: string) => {
    const colors = [
      'bg-blue-500 text-white',
      'bg-green-500 text-white',
      'bg-orange-500 text-white',
      'bg-purple-500 text-white',
      'bg-pink-500 text-white',
      'bg-teal-500 text-white',
    ];
    const index = name.charCodeAt(0) % colors.length;
    return colors[index];
  };

  // 获取角色标签样式
  const getRoleBadgeStyle = (roleName: string) => {
    switch (roleName) {
      case '管理员':
        return 'bg-blue-50 text-blue-600 border-blue-200';
      case '校长':
        return 'bg-purple-50 text-purple-600 border-purple-200';
      case '教师':
        return 'bg-green-50 text-green-600 border-green-200';
      case '学生':
        return 'bg-orange-50 text-orange-600 border-orange-200';
      default:
        return 'bg-slate-50 text-slate-600 border-slate-200';
    }
  };

  // 获取组织类型图标
  const getOrgTypeIcon = (type: string): string => {
    const iconMap: Record<string, string> = {
      'group': '🏢',
      'school': '🏫',
      'department': '📁',
      'grade': '📚',
      'class': '👥',
      'teaching_group': '📖'
    };
    return iconMap[type] || '📄';
  };

  // 获取组织类型名称
  const getOrgTypeName = (type: string): string => {
    const typeMap: Record<string, string> = {
      'group': '集团',
      'school': '学校',
      'department': '部门',
      'grade': '年级',
      'class': '班级',
      'teaching_group': '教研组'
    };
    return typeMap[type] || type;
  };

  const openAddModal = () => {
    setEditingId(null);
    setFormData({
      name: '',
      username: '',
      org_id: '',
      roles: [],
      status: 1
    });
    setIsModalOpen(true);
  };

  const openEditModal = (user: ApiUser) => {
    setEditingId(user.id);
    setFormData({
      name: user.real_name,
      username: user.username,
      org_id: user.org_id?.toString() || '',
      roles: user.roles?.map(r => r.name) || [],
      status: user.status
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    const confirmed = await confirm('确定要删除该用户吗？此操作无法撤销。', { type: 'danger', confirmText: '删除' });
    if (!confirmed) return;
    try {
      await api.delete(`/api/users/${id}`);
      setUsers(users.filter(u => u.id !== id));
    } catch (err: any) {
      toast.error(`删除失败: ${err.message}`);
    }
  };

  // 解绑微信
  const handleUnbindWechat = async (userId: number, userName: string) => {
    const confirmed = await confirm(`确定要解除用户"${userName}"的微信绑定吗？`); if (!confirmed) return;
    
    try {
      await api.post(`/api/auth/admin/unbind-wechat/${userId}`);
      // 刷新用户列表
      await loadUsers();
      toast.success('微信解绑成功');
    } catch (err: any) {
      toast.error(`解绑失败: ${err.message}`);
    }
  };

  const handleOpenPasswordModal = (user: ApiUser) => {
    setPasswordData({ id: user.id.toString(), name: user.real_name, password: '', confirm: '' });
    setIsPasswordModalOpen(true);
  };

  const handleSubmitPassword = async () => {
    if (!passwordData.password) {
      toast.warning('请输入新密码');
      return;
    }
    if (passwordData.password !== passwordData.confirm) {
      toast.warning('两次输入的密码不一致，请重新输入');
      return;
    }
    try {
      await api.put(`/api/users/${passwordData.id}/password`, {
        new_password: passwordData.password
      });
      toast.success(`用户 "${passwordData.name}" 的密码已成功修改`);
      setIsPasswordModalOpen(false);
    } catch (err: any) {
      const detail = err.response?.data?.detail || err.message;
      toast.error(`修改密码失败: ${detail}`);
    }
  };

  const handleRoleChange = (role: string) => {
    setFormData(prev => {
      if (prev.roles.includes(role)) {
        return { ...prev, roles: prev.roles.filter(r => r !== role) };
      } else {
        return { ...prev, roles: [...prev.roles, role] };
      }
    });
  };

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.username.trim()) {
      toast.warning('请填写必填项');
      return;
    }

    // Convert role names to role IDs
    const roleIds = formData.roles
      .map(roleName => roles.find(r => r.name === roleName)?.id)
      .filter((id): id is number => id !== undefined);

    try {
      setLoading(true);
      if (editingId) {
        // 更新用户
        await api.put(`/api/users/${editingId}`, {
          username: formData.username,
          real_name: formData.name,
          org_id: formData.org_id ? parseInt(formData.org_id) : undefined,
          status: formData.status,
          role_ids: roleIds
        });
      } else {
        // 创建用户 - 使用默认密码 "111111"
        await api.post('/api/users/', {
          username: formData.username,
          password: "111111",  // 固定默认密码
          real_name: formData.name,
          org_id: formData.org_id ? parseInt(formData.org_id) : undefined,
          status: formData.status,
          role_ids: roleIds
        });
      }
      setIsModalOpen(false);
      await loadUsers(); // 重新加载用户列表
      toast.success(editingId ? '用户更新成功' : '用户创建成功。默认密码为 111111，用户首次登录时需修改密码。');
    } catch (err: any) {
      toast.error(`保存失败: ${err.response?.data?.detail || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-slate-500">加载中...</div>;
  }

  if (error) {
    return <div className="text-center py-8 text-red-500">{error}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-center space-y-4 sm:space-y-0">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none z-10" />
          <input
            type="text"
            placeholder="搜索姓名、账号或部门..."
            className="relative z-20 w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex space-x-2 w-full sm:w-auto">
          <button
            onClick={openAddModal}
            className="flex-1 sm:flex-none items-center justify-center inline-flex bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            新增用户
          </button>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileUpload}
          />
          <button
            onClick={handleDownloadTemplate}
            className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 flex items-center bg-white"
          >
            <FileText className="h-4 w-4 mr-1.5" />
            下载模板
          </button>
          <button
            onClick={handleImportClick}
            className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 flex items-center bg-white"
          >
            <Upload className="h-4 w-4 mr-1.5" />
            批量导入
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">用户信息</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">角色</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">归属部门/班级</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">状态</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">微信绑定</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">最近登录</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">操作</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center font-medium text-sm ${getAvatarColor(user.real_name)}`}>
                      {user.real_name[0]}
                    </div>
                    <div className="ml-3">
                      <div className="text-sm font-medium text-slate-900">{user.real_name}</div>
                      <div className="text-xs text-slate-400">@{user.username}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-wrap gap-1">
                    {user.roles && user.roles.length > 0 ? (
                      user.roles.map((role, index) => (
                        <span
                          key={role.id || index}
                          className={`px-2.5 py-1 rounded text-xs font-medium border ${getRoleBadgeStyle(role.name)} bg-opacity-50`}
                        >
                          {role.name}
                        </span>
                      ))
                    ) : (
                      <span className="px-2.5 py-1 rounded text-xs font-medium border text-slate-400">
                        未分配角色
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                  {user.org_id ? (() => {
                    const orgPath = getOrgPath(user.org_id);
                    if (orgPath.length > 0) {
                      const lastOrg = orgPath[orgPath.length - 1];
                      return (
                        <span className="flex items-center gap-1">
                          <span>{getOrgTypeIcon(lastOrg.type)}</span>
                          <span className="text-slate-500">{orgPath.slice(0, -1).map(o => o.name).join(' / ')}</span>
                          {orgPath.length > 1 && <span className="text-slate-300 mx-1">/</span>}
                          <span className="font-medium">{lastOrg.name}</span>
                        </span>
                      );
                    }
                    return user.org?.name || '-';
                  })() : '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                    user.status === 1 ? 'bg-green-50 text-green-600' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {user.status === 1 ? <CheckCircle className="w-3.5 h-3.5 mr-1" /> : <XCircle className="w-3.5 h-3.5 mr-1" />}
                    {user.status === 1 ? '启用' : '禁用'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                    user.wechat_openid ? 'bg-green-50 text-green-600' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {user.wechat_openid ? (
                      <>
                        <Smartphone className="w-3.5 h-3.5 mr-1" />
                        已绑定
                      </>
                    ) : (
                      <>
                        <XCircle className="w-3.5 h-3.5 mr-1" />
                        未绑定
                      </>
                    )}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                  {formatLocalDateTime(user.last_login_time)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex items-center justify-end space-x-1">
                    {user.wechat_openid && (
                      <button
                        onClick={() => handleUnbindWechat(user.id, user.real_name)}
                        className="p-2 text-slate-400 hover:text-orange-600 hover:bg-orange-50 rounded transition-colors"
                        title="解绑微信"
                      >
                        <Unlink size={16} />
                      </button>
                    )}
                    {user.id !== getCurrentUserId() && (
                    <button
                      onClick={() => handleOpenPasswordModal(user)}
                      className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      title="重置密码"
                    >
                      <Key size={16} />
                    </button>
                    )}
                    <button
                      onClick={() => openEditModal(user)}
                      className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      title="编辑"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(user.id)}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="删除"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-500">共 {total} 条</span>
            <select 
              value={pageSize} 
              onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
              className="text-xs border rounded px-2 py-1"
            >
              <option value={10}>10条/页</option>
              <option value={20}>20条/页</option>
              <option value={50}>50条/页</option>
              <option value={100}>100条/页</option>
            </select>
          </div>
          <div className="flex items-center space-x-2">
            <button 
              onClick={() => setCurrentPage(1)} 
              disabled={currentPage === 1}
              className="px-2 py-1 text-xs border rounded hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
            >首页</button>
            <button 
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
              disabled={currentPage === 1}
              className="px-2 py-1 text-xs border rounded hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
            >&lt;</button>
            
            {/* 页码按钮 */}
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  className={`px-2 py-1 text-xs rounded ${currentPage === pageNum ? 'bg-blue-600 text-white' : 'border hover:bg-white'}`}
                >
                  {pageNum}
                </button>
              );
            })}
            
            {totalPages > 5 && currentPage < totalPages - 2 && (
              <span className="text-xs text-slate-400">...</span>
            )}
            
            <button 
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} 
              disabled={currentPage === totalPages}
              className="px-2 py-1 text-xs border rounded hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
            >&gt;</button>
            <button 
              onClick={() => setCurrentPage(totalPages)} 
              disabled={currentPage === totalPages}
              className="px-2 py-1 text-xs border rounded hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
            >末页</button>
            
            <span className="text-xs text-slate-500 ml-2">第 {currentPage}/{totalPages} 页</span>
          </div>
        </div>
      </div>

      {/* Change Password Modal */}
      {isPasswordModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 overflow-hidden animate-fade-in-up">
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50">
              <h3 className="text-lg font-bold text-slate-800">修改密码</h3>
              <button onClick={() => setIsPasswordModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="text-sm text-slate-600 mb-2">
                正在为用户 <span className="font-bold text-slate-900">{passwordData.name}</span> 重置密码
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">新密码</label>
                <input 
                  type="password" 
                  value={passwordData.password}
                  onChange={(e) => setPasswordData({...passwordData, password: e.target.value})}
                  className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="请输入新密码"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">确认新密码</label>
                <input 
                  type="password" 
                  value={passwordData.confirm}
                  onChange={(e) => setPasswordData({...passwordData, confirm: e.target.value})}
                  className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="请再次输入新密码"
                />
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end space-x-3">
              <button 
                onClick={() => setIsPasswordModalOpen(false)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-white"
              >
                取消
              </button>
              <button 
                onClick={handleSubmitPassword}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-sm"
              >
                确定修改
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit User Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 overflow-hidden animate-fade-in-up max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50">
              <h3 className="text-lg font-bold text-slate-800">{editingId ? '编辑用户' : '新增用户'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">姓名 <span className="text-red-500">*</span></label>
                  <input 
                    type="text" 
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="请输入姓名"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">账号/工号 <span className="text-red-500">*</span></label>
                  <input 
                    type="text" 
                    value={formData.username}
                    onChange={(e) => setFormData({...formData, username: e.target.value})}
                    className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="请输入账号"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">角色分配</label>
                <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-lg border border-slate-100">
                  {roles.map((role) => (
                    <label key={role.id} className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.roles.includes(role.name)}
                        onChange={() => handleRoleChange(role.name)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300 rounded"
                      />
                      <span className="text-sm text-slate-700">{role.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">所属组织</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowOrgSelector(!showOrgSelector)}
                    className="block w-full text-left rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                  >
                    {formData.org_id ? (
                      (() => {
                        const orgPath = getOrgPath(parseInt(formData.org_id));
                        if (orgPath.length > 0) {
                          const lastOrg = orgPath[orgPath.length - 1];
                          return (
                            <span className="flex items-center gap-1 flex-wrap">
                              <span>{getOrgTypeIcon(lastOrg.type)}</span>
                              {orgPath.map((org, index) => (
                                <span key={index} className="flex items-center">
                                  <span className={index === orgPath.length - 1 ? 'font-medium text-slate-900' : 'text-slate-500'}>
                                    {org.name}
                                  </span>
                                  {index < orgPath.length - 1 && (
                                    <span className="mx-1 text-slate-300">/</span>
                                  )}
                                </span>
                              ))}
                              <span className="text-xs text-slate-400 ml-1">({getOrgTypeName(lastOrg.type)})</span>
                            </span>
                          );
                        }
                        return '选择组织';
                      })()
                    ) : (
                      <span className="text-slate-400">不分配组织</span>
                    )}
                  </button>
                  {showOrgSelector && (
                    <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      <div className="p-2 border-b border-slate-100 flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => {
                            setFormData({...formData, org_id: ''});
                            setShowOrgSelector(false);
                          }}
                          className="text-left px-3 py-2 rounded hover:bg-slate-50 text-sm text-slate-500"
                        >
                          不分配组织
                        </button>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => toggleAllOrgs(true)}
                            className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded"
                          >
                            全部展开
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleAllOrgs(false)}
                            className="px-2 py-1 text-xs text-slate-500 hover:bg-slate-50 rounded"
                          >
                            全部收起
                          </button>
                        </div>
                      </div>
                      <div className="p-1">
                        {renderOrgTree(orgTree, 0)}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">账户状态</label>
                <div className="flex space-x-4">
                  <label className="flex items-center cursor-pointer">
                    <input 
                      type="radio" 
                      name="status"
                      checked={formData.status === 1}
                      onChange={() => setFormData({...formData, status: 1})}
                      className="h-4 w-4 text-green-600 focus:ring-green-500 border-slate-300"
                    />
                    <span className="ml-2 text-sm text-slate-700">启用</span>
                  </label>
                  <label className="flex items-center cursor-pointer">
                    <input 
                      type="radio" 
                      name="status"
                      checked={formData.status === 0}
                      onChange={() => setFormData({...formData, status: 0})}
                      className="h-4 w-4 text-red-600 focus:ring-red-500 border-slate-300"
                    />
                    <span className="ml-2 text-sm text-slate-700">禁用</span>
                  </label>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end space-x-3">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-white"
              >
                取消
              </button>
              <button 
                onClick={handleSave}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const MoralIndicatorsTab = () => {
  const [indicators, setIndicators] = useState<ApiMoralIndicator[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [categories, setCategories] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [orgs, setOrgs] = useState<ApiOrgSimple[]>([]);
  
  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  
  const [formData, setFormData] = useState({
    category: '',
    sub_category: '',
    name: '',
    type: 'deduction' as 'bonus' | 'deduction',
    default_score: 1,
    org_id: null as number | null,
    is_overall: 0
  });

  const { toast } = useToast();
  const { confirm } = useConfirm();

  // Load indicators and categories
  useEffect(() => {
    loadIndicators();
    loadCategories();
    loadOrgs();
  }, [selectedCategory, searchTerm, currentPage, pageSize]);

  // 重置页码当搜索条件变化时
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedCategory]);

  const loadIndicators = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      params.append('page', currentPage.toString());
      params.append('page_size', pageSize.toString());
      if (searchTerm) params.append('search', searchTerm);
      if (selectedCategory && selectedCategory !== 'all') params.append('category', selectedCategory);
      
      const response = await api.get<{ indicators: ApiMoralIndicator[], total: number, page: number, page_size: number }>(`/api/moral/indicators?${params.toString()}`);
      setIndicators(response.indicators);
      setTotal(response.total);
      setTotalPages(Math.ceil(response.total / pageSize));
    } catch (err: any) {
      setError(err.message || '加载德育指标失败');
      console.error('Failed to load indicators:', err);
      setIndicators([]);
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const response = await api.get<string[]>('/api/moral/indicators/categories');
      setCategories(response);
    } catch (err) {
      setCategories([]);
    }
  };

  const loadOrgs = async () => {
    try {
      const response = await api.get<ApiOrgSimple[]>('/api/org/tree');
      // Flatten org tree for select with level info
      const flattenOrgs = (nodes: any[], level: number = 0): ApiOrgSimple[] => {
        let result: ApiOrgSimple[] = [];
        nodes.forEach(node => {
          result.push({ id: node.id, name: node.name, type: node.type, level });
          if (node.children) {
            result = result.concat(flattenOrgs(node.children, level + 1));
          }
        });
        return result;
      };
      setOrgs(flattenOrgs(response));
    } catch (err) {
      setOrgs([]);
    }
  };

  const handleToggleEnabled = async (id: number, currentStatus: number) => {
    try {
      const newStatus = currentStatus === 1 ? 0 : 1;
      await api.put(`/api/moral/indicators/${id}`, {
        is_enabled: newStatus
      });
      await loadIndicators();
    } catch (err: any) {
      toast.error(`更新失败: ${err.message}`);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    const confirmed = await confirm(`确定要删除德育指标"${name}"吗？`, { type: 'danger', confirmText: '删除' }); if (!confirmed) return;
    
    try {
      await api.delete(`/api/moral/indicators/${id}`);
      await loadIndicators();
    } catch (err: any) {
      toast.error(`删除失败: ${err.message}`);
    }
  };

  const openAddModal = () => {
    setEditingId(null);
    setFormData({
      category: '',
      sub_category: '',
      name: '',
      type: 'deduction' as 'bonus' | 'deduction',
      default_score: 1,
      org_id: null,
      is_overall: 0
    });
    setIsModalOpen(true);
  };

  const openEditModal = (indicator: ApiMoralIndicator) => {
    setEditingId(indicator.id);
    setFormData({
      category: indicator.category,
      sub_category: indicator.sub_category,
      name: indicator.name,
      type: indicator.type,
      default_score: Math.abs(indicator.default_score),
      org_id: indicator.org_id || null,
      is_overall: indicator.is_overall || 0
    });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.category || !formData.sub_category || !formData.name) {
      toast.warning('请填写所有必填项');
      return;
    }

    const score = formData.type === 'deduction' ? -Math.abs(formData.default_score) : Math.abs(formData.default_score);

    // Build request body, filtering out null values
    const requestBody = {
      category: formData.category,
      sub_category: formData.sub_category,
      name: formData.name,
      type: formData.type,
      default_score: score,
      is_overall: formData.is_overall
    };

    // Only include org_id if it's set (not null/undefined/empty)
    if (formData.org_id !== null && formData.org_id !== undefined) {
      (requestBody as any).org_id = formData.org_id;
    }

    try {
      setLoading(true);
      if (editingId) {
        await api.put(`/api/moral/indicators/${editingId}`, requestBody);
      } else {
        await api.post('/api/moral/indicators', requestBody);
      }
      setIsModalOpen(false);
      await loadIndicators();
      toast.success(editingId ? '德育指标更新成功' : '德育指标创建成功');
    } catch (err: any) {
      // 显示详细的验证错误信息
      const errorDetail = err.response?.data?.detail || err.message;
      console.error('保存德育指标失败:', err.response?.data);
      toast.error(`保存失败: ${JSON.stringify(errorDetail)}`);
    } finally {
      setLoading(false);
    }
  };

  if (loading && indicators.length === 0) {
    return <div className="text-center py-8 text-slate-500">加载中...</div>;
  }

  if (error && indicators.length === 0) {
    return <div className="text-center py-8 text-red-500">{error}</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header with Search and Filter */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-4 sm:space-y-0">
        <div className="flex space-x-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none z-10" />
            <input 
              type="text" 
              placeholder="搜索指标名称..." 
              className="relative z-20 w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select
            value={selectedCategory || 'all'}
            onChange={(e) => setSelectedCategory(e.target.value === 'all' ? '' : e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">所有大项</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
        <button 
          onClick={openAddModal}
          className="flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="h-4 w-4 mr-2" />
          新增德育指标
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">大项</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">小项</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">指标名称</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">类型</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">分值</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">所属组织</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">整体检查</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">状态</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">操作</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {indicators.map((indicator) => (
              <tr key={indicator.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-700">
                  {indicator.category}
                </td>
                <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-700">
                  {indicator.sub_category}
                </td>
                <td className="px-4 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-slate-900">{indicator.name}</div>
                </td>
                <td className="px-4 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    indicator.type === 'bonus' 
                      ? 'bg-green-100 text-green-700 border border-green-200' 
                      : 'bg-red-100 text-red-700 border border-red-200'
                  }`}>
                    {indicator.type === 'bonus' ? '加分项' : '扣分项'}
                  </span>
                </td>
                <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-600">
                  {indicator.default_score > 0 ? `+${indicator.default_score}` : indicator.default_score}
                </td>
                <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-600">
                  {indicator.org_name || '全集团通用'}
                </td>
                <td className="px-4 py-4 whitespace-nowrap text-center">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    indicator.is_overall === 1
                      ? 'bg-purple-100 text-purple-700 border border-purple-200'
                      : 'bg-slate-100 text-slate-500 border border-slate-200'
                  }`}>
                    {indicator.is_overall === 1 ? '启用' : '-'}
                  </span>
                </td>
                <td className="px-4 py-4 whitespace-nowrap text-center">
                  <button
                    onClick={() => handleToggleEnabled(indicator.id, indicator.is_enabled)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                      indicator.is_enabled === 1 ? 'bg-blue-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        indicator.is_enabled === 1 ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </td>
                <td className="px-4 py-4 whitespace-nowrap text-center text-sm font-medium">
                  <div className="flex items-center justify-center space-x-2">
                    <button 
                      onClick={() => openEditModal(indicator)}
                      className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors" 
                      title="编辑"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button 
                      onClick={() => handleDelete(indicator.id, indicator.name)}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors" 
                      title="删除"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-500">共 {total} 条</span>
            <select 
              value={pageSize} 
              onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
              className="text-xs border rounded px-2 py-1"
            >
              <option value={10}>10条/页</option>
              <option value={20}>20条/页</option>
              <option value={50}>50条/页</option>
              <option value={100}>100条/页</option>
            </select>
          </div>
          <div className="flex items-center space-x-2">
            <button 
              onClick={() => setCurrentPage(1)} 
              disabled={currentPage === 1}
              className="px-2 py-1 text-xs border rounded hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
            >首页</button>
            <button 
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
              disabled={currentPage === 1}
              className="px-2 py-1 text-xs border rounded hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
            >&lt;</button>
            
            {/* 页码按钮 */}
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  className={`px-2 py-1 text-xs rounded ${currentPage === pageNum ? 'bg-blue-600 text-white' : 'border hover:bg-white'}`}
                >
                  {pageNum}
                </button>
              );
            })}
            
            {totalPages > 5 && currentPage < totalPages - 2 && (
              <span className="text-xs text-slate-400">...</span>
            )}
            
            <button 
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} 
              disabled={currentPage === totalPages}
              className="px-2 py-1 text-xs border rounded hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
            >&gt;</button>
            <button 
              onClick={() => setCurrentPage(totalPages)} 
              disabled={currentPage === totalPages}
              className="px-2 py-1 text-xs border rounded hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
            >末页</button>
            
            <span className="text-xs text-slate-500 ml-2">第 {currentPage}/{totalPages} 页</span>
          </div>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50">
              <h3 className="text-lg font-bold text-slate-800">{editingId ? '编辑德育指标' : '新增德育指标'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">大项 <span className="text-red-500">*</span></label>
                  <input 
                    type="text" 
                    value={formData.category}
                    onChange={(e) => setFormData({...formData, category: e.target.value})}
                    placeholder="如：德育常规"
                    className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">小项 <span className="text-red-500">*</span></label>
                  <input 
                    type="text" 
                    value={formData.sub_category}
                    onChange={(e) => setFormData({...formData, sub_category: e.target.value})}
                    placeholder="如：考勤纪律"
                    className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">指标名称 <span className="text-red-500">*</span></label>
                <input 
                  type="text" 
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  placeholder="如：上课迟到"
                  className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">类型</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({...formData, type: e.target.value as 'bonus' | 'deduction'})}
                    className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="deduction">扣分项</option>
                    <option value="bonus">加分项</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">分值</label>
                  <input 
                    type="number" 
                    value={formData.default_score}
                    onChange={(e) => setFormData({...formData, default_score: parseInt(e.target.value) || 0})}
                    className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">所属组织</label>
                <select
                  value={formData.org_id?.toString() || ''}
                  onChange={(e) => setFormData({...formData, org_id: e.target.value ? parseInt(e.target.value) : null})}
                  className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">全集团通用</option>
                  {orgs.filter(o => o.type === 'school').map(org => (
                    <option key={org.id} value={org.id}>{org.name}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">
                  选择"全集团通用"表示该指标适用于所有学校；选择特定学校则表示仅该校使用
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">整体检查</label>
                <div className="flex items-center space-x-3">
                  <button
                    type="button"
                    onClick={() => setFormData({...formData, is_overall: formData.is_overall === 1 ? 0 : 1})}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                      formData.is_overall === 1 ? 'bg-purple-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        formData.is_overall === 1 ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                  <span className="text-sm text-slate-600">
                    {formData.is_overall === 1 ? '启用' : '禁用'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  启用后该指标将显示在小程序"整体检查"功能中
                </p>
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end space-x-3">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-white"
              >
                取消
              </button>
              <button 
                onClick={handleSave}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const TeachingIndicatorsTab = () => {
  const [indicators, setIndicators] = useState<ApiTeachingIndicator[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [orgs, setOrgs] = useState<ApiOrgSimple[]>([]);

  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [formData, setFormData] = useState({
    major_category: '',
    name: '',
    type: 'score' as 'score' | 'bonus' | 'deduction',
    default_score: 10,
    org_id: null as number | null,
    is_overall: 0
  });

  const { toast } = useToast();
  const { confirm } = useConfirm();

  // Load indicators and orgs
  useEffect(() => {
    loadIndicators();
    loadOrgs();
  }, [searchTerm, currentPage, pageSize]);

  // 重置页码当搜索条件变化时
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const loadIndicators = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      params.append('page', currentPage.toString());
      params.append('page_size', pageSize.toString());
      if (searchTerm) params.append('search', searchTerm);

      const response = await api.get<{ indicators: ApiTeachingIndicator[], total: number, page: number, page_size: number }>(`/api/moral/teaching-indicators?${params.toString()}`);
      setIndicators(response.indicators);
      setTotal(response.total);
      setTotalPages(Math.ceil(response.total / pageSize));
    } catch (err: any) {
      setError(err.message || '加载教学指标失败');
      console.error('Failed to load indicators:', err);
      setIndicators([]);
    } finally {
      setLoading(false);
    }
  };

  const loadOrgs = async () => {
    try {
      const response = await api.get<ApiOrgSimple[]>('/api/org/tree');
      const flattenOrgs = (nodes: any[], level: number = 0): ApiOrgSimple[] => {
        let result: ApiOrgSimple[] = [];
        nodes.forEach(node => {
          result.push({ id: node.id, name: node.name, type: node.type, level });
          if (node.children) {
            result = result.concat(flattenOrgs(node.children, level + 1));
          }
        });
        return result;
      };
      setOrgs(flattenOrgs(response));
    } catch (err) {
      setOrgs([]);
    }
  };

  const handleToggleEnabled = async (id: number, currentStatus: number) => {
    try {
      const newStatus = currentStatus === 1 ? 0 : 1;
      await api.put(`/api/moral/teaching-indicators/${id}`, {
        is_enabled: newStatus
      });
      await loadIndicators();
    } catch (err: any) {
      toast.error(`更新失败: ${err.message}`);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    const confirmed = await confirm(`确定要删除教学指标"${name}"吗？`, { type: 'danger', confirmText: '删除' }); if (!confirmed) return;

    try {
      await api.delete(`/api/moral/teaching-indicators/${id}`);
      await loadIndicators();
    } catch (err: any) {
      toast.error(`删除失败: ${err.message}`);
    }
  };

  const openAddModal = () => {
    setEditingId(null);
    setFormData({
      major_category: '',
      name: '',
      type: 'score',
      default_score: 10,
      org_id: null,
      is_overall: 0
    });
    setIsModalOpen(true);
  };

  const openEditModal = (indicator: ApiTeachingIndicator) => {
    setEditingId(indicator.id);
    setFormData({
      major_category: indicator.major_category,
      name: indicator.name,
      type: indicator.type,
      default_score: Math.abs(indicator.default_score),
      org_id: indicator.org_id || null,
      is_overall: indicator.is_overall || 0
    });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.major_category || !formData.name) {
      toast.warning('请填写所有必填项');
      return;
    }

    const score = formData.type === 'deduction' ? -Math.abs(formData.default_score) : Math.abs(formData.default_score);

    // Build request body, filtering out null values
    const requestBody = {
      major_category: formData.major_category,
      name: formData.name,
      type: formData.type,
      default_score: score,
      is_overall: formData.is_overall
    };

    // Only include org_id if it's set (not null/undefined/empty)
    if (formData.org_id !== null && formData.org_id !== undefined) {
      (requestBody as any).org_id = formData.org_id;
    }

    try {
      setLoading(true);
      if (editingId) {
        await api.put(`/api/moral/teaching-indicators/${editingId}`, requestBody);
      } else {
        await api.post('/api/moral/teaching-indicators', requestBody);
      }
      setIsModalOpen(false);
      await loadIndicators();
      toast.success(editingId ? '教学指标更新成功' : '教学指标创建成功');
    } catch (err: any) {
      toast.error(`保存失败: ${err.response?.data?.detail || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Get type label and color based on image
  const getTypeStyle = (type: string) => {
    switch (type) {
      case 'score':
        return { label: '评分项', className: 'bg-blue-100 text-blue-700 border border-blue-200' };
      case 'bonus':
        return { label: '加分项', className: 'bg-green-100 text-green-700 border border-green-200' };
      case 'deduction':
        return { label: '扣分项', className: 'bg-red-100 text-red-700 border border-red-200' };
      default:
        return { label: type, className: 'bg-slate-100 text-slate-700 border border-slate-200' };
    }
  };

  if (loading && indicators.length === 0) {
    return <div className="text-center py-8 text-slate-500">加载中...</div>;
  }

  if (error && indicators.length === 0) {
    return <div className="text-center py-8 text-red-500">{error}</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header with Search */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-4 sm:space-y-0">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none z-10" />
          <input
            type="text"
            placeholder="搜索指标..."
            className="relative z-20 w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="h-4 w-4 mr-2" />
          新增教学指标
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">大项</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">指标名称</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">类型</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">分值</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">所属组织</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">整体检查</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">状态</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">操作</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {indicators.map((indicator) => {
              const typeStyle = getTypeStyle(indicator.type);
              return (
                <tr key={indicator.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">
                    {indicator.major_category}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-slate-900">{indicator.name}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${typeStyle.className}`}>
                      {typeStyle.label}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                    {indicator.default_score > 0 ? `+${indicator.default_score}` : indicator.default_score}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                    {indicator.org_name || '全集团通用'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      indicator.is_overall === 1
                        ? 'bg-purple-100 text-purple-700 border border-purple-200'
                        : 'bg-slate-100 text-slate-500 border border-slate-200'
                    }`}>
                      {indicator.is_overall === 1 ? '启用' : '-'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <button
                      onClick={() => handleToggleEnabled(indicator.id, indicator.is_enabled)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                        indicator.is_enabled === 1 ? 'bg-blue-600' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          indicator.is_enabled === 1 ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                    <div className="flex items-center justify-center space-x-2">
                      <button
                        onClick={() => openEditModal(indicator)}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="编辑"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(indicator.id, indicator.name)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="删除"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-500">共 {total} 条</span>
            <select 
              value={pageSize} 
              onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
              className="text-xs border rounded px-2 py-1"
            >
              <option value={10}>10条/页</option>
              <option value={20}>20条/页</option>
              <option value={50}>50条/页</option>
              <option value={100}>100条/页</option>
            </select>
          </div>
          <div className="flex items-center space-x-2">
            <button 
              onClick={() => setCurrentPage(1)} 
              disabled={currentPage === 1}
              className="px-2 py-1 text-xs border rounded hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
            >首页</button>
            <button 
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
              disabled={currentPage === 1}
              className="px-2 py-1 text-xs border rounded hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
            >&lt;</button>
            
            {/* 页码按钮 */}
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  className={`px-2 py-1 text-xs rounded ${currentPage === pageNum ? 'bg-blue-600 text-white' : 'border hover:bg-white'}`}
                >
                  {pageNum}
                </button>
              );
            })}
            
            {totalPages > 5 && currentPage < totalPages - 2 && (
              <span className="text-xs text-slate-400">...</span>
            )}
            
            <button 
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} 
              disabled={currentPage === totalPages}
              className="px-2 py-1 text-xs border rounded hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
            >&gt;</button>
            <button 
              onClick={() => setCurrentPage(totalPages)} 
              disabled={currentPage === totalPages}
              className="px-2 py-1 text-xs border rounded hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
            >末页</button>
            
            <span className="text-xs text-slate-500 ml-2">第 {currentPage}/{totalPages} 页</span>
          </div>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50">
              <h3 className="text-lg font-bold text-slate-800">{editingId ? '编辑教学指标' : '新增教学指标'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">大项 <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={formData.major_category}
                  onChange={(e) => setFormData({...formData, major_category: e.target.value})}
                  placeholder="如：学生评教、同行互评、行政考评"
                  className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">指标名称 <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  placeholder="如：教学态度"
                  className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">类型</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({...formData, type: e.target.value as 'score' | 'bonus' | 'deduction'})}
                    className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="score">评分项</option>
                    <option value="bonus">加分项</option>
                    <option value="deduction">扣分项</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">分值</label>
                  <input
                    type="number"
                    value={formData.default_score}
                    onChange={(e) => setFormData({...formData, default_score: parseInt(e.target.value) || 0})}
                    className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">所属组织</label>
                <select
                  value={formData.org_id?.toString() || ''}
                  onChange={(e) => setFormData({...formData, org_id: e.target.value ? parseInt(e.target.value) : null})}
                  className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">全集团通用</option>
                  {orgs.filter(o => o.type === 'school').map(org => (
                    <option key={org.id} value={org.id}>{org.name}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">
                  选择"全集团通用"表示该指标适用于所有学校；选择特定学校则表示仅该校使用
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">整体检查</label>
                <div className="flex items-center space-x-3">
                  <button
                    type="button"
                    onClick={() => setFormData({...formData, is_overall: formData.is_overall === 1 ? 0 : 1})}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                      formData.is_overall === 1 ? 'bg-purple-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        formData.is_overall === 1 ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                  <span className="text-sm text-slate-600">
                    {formData.is_overall === 1 ? '启用' : '禁用'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  启用后该指标将显示在小程序"整体检查"功能中
                </p>
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end space-x-3">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-white"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const SystemLogsTab = () => {
  const [logs, setLogs] = useState<ApiLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [modules, setModules] = useState<string[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [selectedModule, setSelectedModule] = useState<string>('');
  const [selectedAction, setSelectedAction] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  
  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalRecords, setTotalRecords] = useState(0);
  const totalPages = Math.ceil(totalRecords / pageSize);

  // Load logs
  useEffect(() => {
    loadLogs();
    loadFilters();
  }, [searchTerm, selectedModule, selectedAction, selectedStatus, currentPage, pageSize]);

  const loadLogs = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (selectedModule) params.append('module', selectedModule);
      if (selectedAction) params.append('action', selectedAction);
      if (selectedStatus) params.append('status', selectedStatus);
      params.append('page', currentPage.toString());
      params.append('page_size', pageSize.toString());

      const response = await api.get<{ logs: ApiLog[], total: number, page: number, page_size: number }>(`/api/logs/?${params.toString()}`);
      setLogs(response.logs);
      setTotalRecords(response.total);
    } catch (err: any) {
      setError(err.message || '加载日志失败');
      console.error('Failed to load logs:', err);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  const loadFilters = async () => {
    try {
      const [modulesRes, actionsRes] = await Promise.all([
        api.get<string[]>('/api/logs/modules'),
        api.get<string[]>('/api/logs/actions')
      ]);
      setModules(modulesRes);
      setActions(actionsRes);
    } catch (err) {
      setModules([]);
      setActions([]);
    }
  };

  const handleExport = () => {
    // Export to CSV
    const headers = ['时间', '用户', '角色', '模块', '操作类型', '详情描述', '状态', 'IP地址'];
    const csvContent = [
      headers.join(','),
      ...logs.map(log => [
        log.created_at,
        log.username,
        log.role_name,
        log.module,
        log.action,
        `"${log.description}"`,
        log.status,
        log.ip_address
      ].join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `系统日志_${getBeijingDate()}.csv`;
    link.click();
  };

  if (loading && logs.length === 0) {
    return <div className="text-center py-8 text-slate-500">加载中...</div>;
  }

  if (error && logs.length === 0) {
    return <div className="text-center py-8 text-red-500">{error}</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header with Search and Filters */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-4 sm:space-y-0">
        <div className="flex flex-wrap gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none z-10" />
            <input
              type="text"
              placeholder="搜索日志内容..."
              className="relative z-20 w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select
            value={selectedModule}
            onChange={(e) => setSelectedModule(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">所有模块</option>
            {modules.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <select
            value={selectedAction}
            onChange={(e) => setSelectedAction(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">所有操作</option>
            {actions.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">所有状态</option>
            <option value="成功">成功</option>
            <option value="失败">失败</option>
          </select>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center justify-center bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          导出日志
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">时间</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">用户</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">角色</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">模块</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">操作类型</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">详情描述</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">状态</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">IP地址</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {logs.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                  <div className="flex flex-col items-center space-y-2">
                    <svg className="w-12 h-12 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-sm">暂无日志记录</p>
                  </div>
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-600">
                    {formatLocalDateTime(log.created_at)}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                    {log.username}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-600">
                    {log.role_name}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-700">
                    {log.module}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-700">
                    {log.action}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-600 max-w-xs truncate" title={log.description}>
                    {log.description}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-center">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      log.status === '成功'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {log.status}
                    </span>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-500 font-mono">
                    {log.ip_address}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-500">共 {totalRecords} 条</span>
            <select
              className="text-xs border rounded px-2 py-1"
              value={pageSize}
              onChange={(e) => { setPageSize(parseInt(e.target.value)); setCurrentPage(1); }}
            >
              <option value={10}>10条/页</option>
              <option value={20}>20条/页</option>
              <option value={50}>50条/页</option>
              <option value={100}>100条/页</option>
            </select>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="px-2 py-1 text-xs border rounded hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
            >首页</button>
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-2 py-1 text-xs border rounded hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
            >&lt;</button>

            {/* 页码按钮 */}
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  className={`px-2 py-1 text-xs rounded ${currentPage === pageNum ? 'bg-blue-600 text-white' : 'border hover:bg-white'}`}
                >
                  {pageNum}
                </button>
              );
            })}

            {totalPages > 5 && currentPage < totalPages - 2 && (
              <span className="text-xs text-slate-400">...</span>
            )}

            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-2 py-1 text-xs border rounded hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
            >&gt;</button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="px-2 py-1 text-xs border rounded hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
            >末页</button>

            <span className="text-xs text-slate-500 ml-2">第 {currentPage}/{totalPages || 1} 页</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// Main SystemManagement Component
const SystemManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'users' | 'roles' | 'org' | 'moral' | 'teaching' | 'logs'>('users');

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">系统管理 (System Settings)</h1>
          <p className="text-slate-500 mt-1">管理用户、角色权限、组织架构及系统基础配置。</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-slate-200 bg-white rounded-t-xl px-2 shadow-sm overflow-x-auto">
        <div className="flex space-x-1">
           <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center ${
              activeTab === 'users'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <Users className="w-4 h-4 mr-2" />
            用户管理
          </button>
          <button
            onClick={() => setActiveTab('roles')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center ${
              activeTab === 'roles'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <Shield className="w-4 h-4 mr-2" />
            角色管理
          </button>
          <button
            onClick={() => setActiveTab('org')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center ${
              activeTab === 'org'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <Network className="w-4 h-4 mr-2" />
            组织架构
          </button>
          <button
            onClick={() => setActiveTab('moral')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center ${
              activeTab === 'moral'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <Shield className="w-4 h-4 mr-2" />
            德育指标
          </button>
          <button
            onClick={() => setActiveTab('teaching')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center ${
              activeTab === 'teaching'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <Activity className="w-4 h-4 mr-2" />
            教学指标
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center ${
              activeTab === 'logs'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <FileText className="w-4 h-4 mr-2" />
            系统日志
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="min-h-[500px]">
        {activeTab === 'users' && <UserManagementTab />}
        {activeTab === 'roles' && <RoleManagement />}
        {activeTab === 'org' && <OrgManagement />}
        {activeTab === 'moral' && <MoralIndicatorsTab />}
        {activeTab === 'teaching' && <TeachingIndicatorsTab />}
        {activeTab === 'logs' && <SystemLogsTab />}
      </div>
    </div>
  );
};

export default SystemManagement;
