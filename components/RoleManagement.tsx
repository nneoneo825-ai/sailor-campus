import React, { useState, useEffect } from 'react';
import { Shield, Plus, Save, Check, X, ChevronRight, ChevronDown } from 'lucide-react';
import { api } from '../src/services/apiClient';
import { useToast } from './ui/Toast';
import { useConfirm } from './ui/Confirm';

interface ApiRole {
  id: number;
  code: string;
  name: string;
  data_scope: number;
  description?: string;
}

interface Permission {
  id: number;
  code: string;
  name: string;
  module: string;
  checked: boolean;
}

interface PermissionModule {
  code: string;
  name: string;
  permissions: Permission[];
}

interface RolePermissionsData {
  role_id: number;
  role_name: string;
  role_code: string;
  description: string;
  modules: PermissionModule[];
}

interface OrgNode {
  id: number;
  name: string;
  type: string;
  children?: OrgNode[];
}

interface OrgSimple {
  id: number;
  name: string;
  type: string;
}

const RoleManagement: React.FC = () => {
  const [roles, setRoles] = useState<ApiRole[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [rolePermissions, setRolePermissions] = useState<RolePermissionsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [orgTree, setOrgTree] = useState<OrgNode[]>([]);
  const [expandedOrgs, setExpandedOrgs] = useState<Set<number>>(new Set());
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    description: '',
    data_scope: 2,
    permission_ids: [] as number[],
    org_ids: [] as number[]
  });
  const { toast } = useToast();
  const { confirm } = useConfirm();

  // Load roles on mount
  useEffect(() => {
    loadRoles();
    loadOrgTree();
  }, []);

  // Load role permissions when selected role changes
  useEffect(() => {
    if (selectedRoleId) {
      loadRolePermissions(selectedRoleId);
    }
  }, [selectedRoleId]);

  const loadOrgTree = async () => {
    try {
      const response = await api.get<OrgNode[]>('/api/org/tree');
      setOrgTree(response);
    } catch (err) {
      console.error('Failed to load org tree:', err);
    }
  };

  const loadRoles = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('[RoleManagement] Loading roles...');
      const response = await api.get<{ roles: ApiRole[] }>('/api/roles/');
      console.log('[RoleManagement] Roles loaded:', response.roles);
      setRoles(response.roles);
      // Select first role by default
      if (response.roles.length > 0 && !selectedRoleId) {
        console.log('[RoleManagement] Selecting first role:', response.roles[0].id);
        setSelectedRoleId(response.roles[0].id);
      }
    } catch (err: any) {
      console.error('[RoleManagement] Failed to load roles:', err);
      console.error('[RoleManagement] Error response:', err.response);
      setError(err.message || '加载角色失败');
      setRoles([]);
    } finally {
      setLoading(false);
    }
  };

  const loadRolePermissions = async (roleId: number) => {
    try {
      setLoading(true);
      console.log(`[RoleManagement] Loading permissions for role ${roleId}`);
      const response = await api.get<RolePermissionsData>(`/api/permissions/role/${roleId}`);
      console.log('[RoleManagement] Permissions loaded:', response);
      setRolePermissions(response);
    } catch (err: any) {
      console.error('[RoleManagement] Failed to load role permissions:', err);
      console.error('[RoleManagement] Error response:', err.response);
      console.error('[RoleManagement] Error message:', err.message);
      setRolePermissions(null);
      toast.error(`加载权限失败: ${err.message || '未知错误'}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePermissionToggle = (moduleCode: string, permissionId: number) => {
    if (!rolePermissions) return;

    const updatedModules = rolePermissions.modules.map(module => {
      if (module.code !== moduleCode) return module;

      return {
        ...module,
        permissions: module.permissions.map(perm =>
          perm.id === permissionId ? { ...perm, checked: !perm.checked } : perm
        )
      };
    });

    setRolePermissions({
      ...rolePermissions,
      modules: updatedModules
    });
  };

  const handleSavePermissions = async () => {
    if (!rolePermissions || !selectedRoleId) {
      console.error('[RoleManagement] Missing rolePermissions or selectedRoleId');
      return;
    }

    // Collect all checked permission IDs
    const checkedPermissionIds: number[] = [];
    rolePermissions.modules.forEach(module => {
      module.permissions.forEach(perm => {
        if (perm.checked) {
          checkedPermissionIds.push(perm.id);
        }
      });
    });

    console.log('[RoleManagement] Saving permissions:', {
      roleId: selectedRoleId,
      permissionIds: checkedPermissionIds
    });

    try {
      setSaving(true);
      const response = await api.put(`/api/permissions/role/${selectedRoleId}`, {
        permission_ids: checkedPermissionIds
      });
      console.log('[RoleManagement] Save response:', response);
      toast.success('权限配置保存成功！');
    } catch (err: any) {
      console.error('[RoleManagement] Save failed:', err);
      console.error('[RoleManagement] Error response:', err.response);
      console.error('[RoleManagement] Error message:', err.message);
      toast.error(`保存失败: ${err.message || '未知错误'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleAddRole = async () => {
    if (!formData.code || !formData.name) {
      toast.warning('请填写角色编码和名称');
      return;
    }

    // 如果选择了自定义数据范围，但没有选择任何组织，提示用户
    if (formData.data_scope === 6 && formData.org_ids.length === 0) {
      toast.warning('请选择至少一个组织节点');
      return;
    }

    try {
      await api.post('/api/roles/', formData);
      setIsAddModalOpen(false);
      setFormData({ code: '', name: '', description: '', data_scope: 2, permission_ids: [], org_ids: [] });
      await loadRoles();
      toast.success('角色创建成功！');
    } catch (err: any) {
      toast.error(`创建失败: ${err.message}`);
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
      const collectIds = (nodes: OrgNode[]) => {
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

  // 切换组织选择
  const toggleOrgSelect = (orgId: number) => {
    setFormData(prev => {
      const newOrgIds = [...prev.org_ids];
      const index = newOrgIds.indexOf(orgId);
      if (index > -1) {
        newOrgIds.splice(index, 1);
      } else {
        newOrgIds.push(orgId);
      }
      return { ...prev, org_ids: newOrgIds };
    });
  };

  // 递归渲染组织树
  const renderOrgTree = (nodes: OrgNode[], level: number): React.ReactNode => {
    return nodes.map(node => {
      const hasChildren = node.children && node.children.length > 0;
      const isExpanded = expandedOrgs.has(node.id);
      const isSelected = formData.org_ids.includes(node.id);

      return (
        <div key={node.id}>
          <div
            className={`w-full text-left px-3 py-2 rounded text-sm hover:bg-blue-50 flex items-center gap-2 cursor-pointer ${
              isSelected ? 'bg-blue-50' : ''
            }`}
            style={{ paddingLeft: `${level * 16 + 8}px` }}
          >
            {/* 展开/收起按钮 */}
            {hasChildren ? (
              <button
                type="button"
                onClick={(e) => toggleOrgExpand(node.id, e)}
                className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded"
              >
                {isExpanded ? (
                  <ChevronDown size={14} />
                ) : (
                  <ChevronRight size={14} />
                )}
              </button>
            ) : (
              <span className="w-5" />
            )}
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => toggleOrgSelect(node.id)}
              className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
            />
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

  // 权限模块数据
  const PERMISSION_MODULES = [
    {
      code: "dashboard",
      name: "首页概览",
      permissions: [
        { id: 1, code: "dashboard:view", name: "查看报表", module: "dashboard" },
        { id: 2, code: "dashboard:export", name: "导出数据", module: "dashboard" },
      ]
    },
    {
      code: "school",
      name: "学校管理",
      permissions: [
        { id: 3, code: "school:view", name: "查看校区", module: "school" },
        { id: 4, code: "school:edit", name: "编辑校区", module: "school" },
      ]
    },
    {
      code: "class",
      name: "班级管理",
      permissions: [
        { id: 5, code: "class:view", name: "查看班级", module: "class" },
        { id: 6, code: "class:edit", name: "编辑班级", module: "class" },
        { id: 7, code: "class:delete", name: "删除班级", module: "class" },
      ]
    },
    {
      code: "student",
      name: "学生管理",
      permissions: [
        { id: 8, code: "student:view", name: "查看学生", module: "student" },
        { id: 9, code: "student:edit", name: "编辑学生", module: "student" },
        { id: 10, code: "student:delete", name: "删除学生", module: "student" },
        { id: 11, code: "student:import", name: "导入学生", module: "student" },
        { id: 12, code: "student:export", name: "导出学生", module: "student" },
      ]
    },
    {
      code: "teacher",
      name: "教师管理",
      permissions: [
        { id: 13, code: "teacher:view", name: "查看教师", module: "teacher" },
        { id: 14, code: "teacher:edit", name: "编辑教师", module: "teacher" },
        { id: 15, code: "teacher:delete", name: "删除教师", module: "teacher" },
      ]
    },
    {
      code: "moral",
      name: "德育管理",
      permissions: [
        { id: 16, code: "moral:class", name: "班级报表", module: "moral" },
        { id: 17, code: "moral:grade", name: "年级报表", module: "moral" },
        { id: 18, code: "moral:school", name: "学校报表", module: "moral" },
        { id: 19, code: "moral:dorm", name: "宿舍报表", module: "moral" },
        { id: 20, code: "moral:district", name: "区域报表", module: "moral" },
        { id: 21, code: "moral:export", name: "导出报表", module: "moral" },
      ]
    },
    {
      code: "teaching",
      name: "教学管理",
      permissions: [
        { id: 22, code: "teaching:personal", name: "个人报表", module: "teaching" },
        { id: 23, code: "teaching:grade", name: "年级报表", module: "teaching" },
        { id: 24, code: "teaching:school", name: "学校报表", module: "teaching" },
        { id: 25, code: "teaching:provincial", name: "省级报表", module: "teaching" },
        { id: 26, code: "teaching:export", name: "导出报表", module: "teaching" },
      ]
    },
    {
      code: "system",
      name: "系统设置",
      permissions: [
        { id: 27, code: "system:user", name: "用户管理", module: "system" },
        { id: 28, code: "system:role", name: "角色管理", module: "system" },
        { id: 29, code: "system:org", name: "组织架构", module: "system" },
        { id: 30, code: "system:moral_indicator", name: "德育指标", module: "system" },
        { id: 31, code: "system:teaching_indicator", name: "教学指标", module: "system" },
        { id: 32, code: "system:logs", name: "系统日志", module: "system" },
      ]
    },
  ];

  // 切换功能权限选择
  const togglePermission = (permId: number) => {
    setFormData(prev => {
      const newPermIds = [...prev.permission_ids];
      const index = newPermIds.indexOf(permId);
      if (index > -1) {
        newPermIds.splice(index, 1);
      } else {
        newPermIds.push(permId);
      }
      return { ...prev, permission_ids: newPermIds };
    });
  };

  // 全选/取消全选某个模块的权限
  const toggleModulePermissions = (moduleCode: string, selectAll: boolean) => {
    const module = PERMISSION_MODULES.find(m => m.code === moduleCode);
    if (!module) return;

    const modulePermIds = module.permissions.map(p => p.id);

    setFormData(prev => {
      let newPermIds = [...prev.permission_ids];
      if (selectAll) {
        // 添加该模块所有权限（去重）
        const set = new Set(newPermIds);
        modulePermIds.forEach(id => set.add(id));
        newPermIds = Array.from(set);
      } else {
        // 移除该模块所有权限
        const removeSet = new Set(modulePermIds);
        newPermIds = newPermIds.filter(id => !removeSet.has(id));
      }
      return { ...prev, permission_ids: newPermIds };
    });
  };

  // 检查模块是否全选
  const isModuleFullySelected = (moduleCode: string): boolean => {
    const module = PERMISSION_MODULES.find(m => m.code === moduleCode);
    if (!module) return false;
    return module.permissions.every(p => formData.permission_ids.includes(p.id));
  };

  // 检查模块是否部分选中
  const isModulePartiallySelected = (moduleCode: string): boolean => {
    const module = PERMISSION_MODULES.find(m => m.code === moduleCode);
    if (!module) return false;
    const selectedCount = module.permissions.filter(p => formData.permission_ids.includes(p.id)).length;
    return selectedCount > 0 && selectedCount < module.permissions.length;
  };

  const selectedRole = roles.find(r => r.id === selectedRoleId);

  if (loading && roles.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="flex h-[600px] bg-white rounded-lg border border-slate-200 overflow-hidden">
      {/* Left Sidebar - Role List */}
      <div className="w-64 bg-slate-50 border-r border-slate-200 flex flex-col">
        <div className="p-4 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">角色列表</h3>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="p-1 hover:bg-slate-200 rounded transition-colors"
            >
              <Plus size={16} className="text-slate-500" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {roles.map((role) => (
            <button
              key={role.id}
              onClick={() => setSelectedRoleId(role.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                selectedRoleId === role.id
                  ? 'bg-blue-50 border-l-3 border-blue-500'
                  : 'hover:bg-slate-100 border-l-3 border-transparent'
              }`}
            >
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                selectedRoleId === role.id
                  ? 'border-blue-500 bg-blue-500'
                  : 'border-slate-300'
              }`}>
                {selectedRoleId === role.id && <Check size={10} className="text-white" />}
              </div>
              <span className={`text-sm font-medium ${
                selectedRoleId === role.id ? 'text-blue-700' : 'text-slate-700'
              }`}>
                {role.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Right Content - Permission Configuration */}
      <div className="flex-1 flex flex-col">
        {selectedRole && rolePermissions ? (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  权限配置 - {selectedRole.name}
                </h3>
                <p className="text-sm text-slate-500 mt-1">
                  {rolePermissions.description || selectedRole.description || '暂无描述'}
                </p>
              </div>
              <button
                onClick={handleSavePermissions}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Save size={16} />
                {saving ? '保存中...' : '保存配置'}
              </button>
            </div>

            {/* Permission Modules */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {rolePermissions.modules.map((module) => (
                <div key={module.code} className="border border-slate-200 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-slate-900 mb-3">{module.name}</h4>
                  <div className="grid grid-cols-2 gap-3">
                    {module.permissions.map((perm) => (
                      <label
                        key={perm.id}
                        className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={perm.checked}
                          onChange={() => handlePermissionToggle(module.code, perm.id)}
                          className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                        />
                        <span className="text-sm text-slate-700">{perm.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-500">
            请选择一个角色查看权限配置
          </div>
        )}
      </div>

      {/* Add Role Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl mx-4 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50">
              <h3 className="text-lg font-bold text-slate-800">新增角色</h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {/* 基本信息 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    角色编码 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="例如: grade_director"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    角色名称 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="例如: 年级主任"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">描述</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  rows={2}
                  placeholder="角色描述..."
                />
              </div>

              {/* 数据权限配置 */}
              <div className="border border-slate-200 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <Shield size={16} className="text-blue-500" />
                  数据权限
                </h4>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {[
                    { value: 1, label: '全部数据', desc: '可访问所有数据' },
                    { value: 2, label: '本校数据', desc: '仅本校范围' },
                    { value: 3, label: '本年级数据', desc: '仅本年级范围' },
                    { value: 4, label: '本班数据', desc: '仅本班范围' },
                    { value: 5, label: '仅本人数据', desc: '仅个人数据' },
                    { value: 6, label: '自定义', desc: '选择特定组织' },
                  ].map((option) => (
                    <label
                      key={option.value}
                      className={`flex items-start gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                        formData.data_scope === option.value
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="data_scope"
                        checked={formData.data_scope === option.value}
                        onChange={() => setFormData({ ...formData, data_scope: option.value, org_ids: [] })}
                        className="mt-0.5"
                      />
                      <div>
                        <div className="text-sm font-medium text-slate-900">{option.label}</div>
                        <div className="text-xs text-slate-500">{option.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>

                {/* 自定义数据权限 - 组织选择 */}
                {formData.data_scope === 6 && (
                  <div className="mt-3 border-t border-slate-200 pt-3">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium text-slate-700">
                        选择可访问的组织 <span className="text-red-500">*</span>
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => toggleAllOrgs(true)}
                          className="text-xs text-blue-600 hover:bg-blue-50 px-2 py-1 rounded"
                        >
                          全部展开
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleAllOrgs(false)}
                          className="text-xs text-slate-500 hover:bg-slate-50 px-2 py-1 rounded"
                        >
                          全部收起
                        </button>
                      </div>
                    </div>
                    <div className="border border-slate-200 rounded-lg max-h-48 overflow-y-auto bg-slate-50">
                      {orgTree.length > 0 ? (
                        renderOrgTree(orgTree, 0)
                      ) : (
                        <div className="p-4 text-center text-slate-500 text-sm">加载组织数据...</div>
                      )}
                    </div>
                    {formData.org_ids.length > 0 && (
                      <div className="mt-2 text-xs text-slate-600">
                        已选择 <span className="font-medium text-blue-600">{formData.org_ids.length}</span> 个组织
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 功能权限配置 */}
              <div className="border border-slate-200 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <Shield size={16} className="text-green-500" />
                  功能权限
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  {PERMISSION_MODULES.map((module) => {
                    const isFullySelected = isModuleFullySelected(module.code);
                    const isPartial = isModulePartiallySelected(module.code);
                    const selectedCount = module.permissions.filter(p => formData.permission_ids.includes(p.id)).length;

                    return (
                      <div key={module.code} className="border border-slate-200 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isFullySelected}
                              ref={(el) => {
                                if (el) el.indeterminate = isPartial;
                              }}
                              onChange={(e) => toggleModulePermissions(module.code, e.target.checked)}
                              className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                            />
                            <span className="text-sm font-medium text-slate-900">{module.name}</span>
                          </label>
                          <span className="text-xs text-slate-500">
                            {selectedCount}/{module.permissions.length}
                          </span>
                        </div>
                        <div className="pl-6 space-y-1">
                          {module.permissions.map((perm) => (
                            <label
                              key={perm.id}
                              className="flex items-center gap-2 cursor-pointer hover:text-blue-600"
                            >
                              <input
                                type="checkbox"
                                checked={formData.permission_ids.includes(perm.id)}
                                onChange={() => togglePermission(perm.id)}
                                className="w-3 h-3 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                              />
                              <span className="text-xs text-slate-600">{perm.name}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {formData.permission_ids.length > 0 && (
                  <div className="mt-3 text-xs text-slate-600">
                    已选择 <span className="font-medium text-green-600">{formData.permission_ids.length}</span> 项功能权限
                  </div>
                )}
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end space-x-3">
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-white transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleAddRole}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                创建角色
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoleManagement;
