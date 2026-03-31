import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, ChevronRight, ChevronDown, User, Users, GraduationCap, School, Settings } from 'lucide-react';
import { api } from '../src/services/apiClient';
import { useToast } from './ui/Toast';
import { useConfirm } from './ui/Confirm';

interface ApiOrg {
  id: number;
  parent_id: number;
  name: string;
  type: 'group' | 'school' | 'department' | 'grade' | 'class' | 'teaching_group';
  sort_order: number;
  tree_path: string;
  children?: ApiOrg[];
}

interface OrgUser {
  id: number;
  username: string;
  real_name: string;
  avatar_url?: string;
  org_id: number;
  status: number;
  roles: string[];
}

interface OrgUsersResponse {
  total: number;
  page: number;
  page_size: number;
  org_name: string;
  users: OrgUser[];
}

interface GradeTemplate {
  name: string;
  grades: string[];
  stage: string;
}

const OrgManagement: React.FC = () => {
  const [orgs, setOrgs] = useState<ApiOrg[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(null);
  const [selectedOrg, setSelectedOrg] = useState<ApiOrg | null>(null);
  const [orgUsers, setOrgUsers] = useState<OrgUsersResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isExpandAll, setIsExpandAll] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    type: 'department' as 'group' | 'school' | 'department' | 'grade' | 'class' | 'teaching_group',
    parent_id: 0,
    sort_order: 0
  });
  const [expandedNodes, setExpandedNodes] = useState<Set<number>>(new Set());
  const { toast } = useToast();
  const { confirm } = useConfirm();

  // 批量创建教研组状态
  const [isBatchTeachingGroupModalOpen, setIsBatchTeachingGroupModalOpen] = useState(false);
  const [batchTeachingGroupData, setBatchTeachingGroupData] = useState({
    grade_ids: [] as number[],  // 改为年级ID列表
    group_names: [] as string[],
    use_custom_groups: false
  });
  const [batchTeachingGroupCreating, setBatchTeachingGroupCreating] = useState(false);
  const [customGroupInput, setCustomGroupInput] = useState('');

  // 学校创建向导状态
  const [isSchoolWizardOpen, setIsSchoolWizardOpen] = useState(false);
  const [schoolWizardStep, setSchoolWizardStep] = useState(1);
  const [schoolWizardData, setSchoolWizardData] = useState({
    name: '',
    school_type: '公办',
    address: '',
    principal_name: '',
    contact_phone: '',
    stages: [] as string[],
    create_grades: true,
    parent_id: 0,
    admin_username: '',
    admin_password: '',
    admin_real_name: ''
  });
  const [schoolCreating, setSchoolCreating] = useState(false);
  const [gradeTemplates, setGradeTemplates] = useState<GradeTemplate[]>([]);

  // 获取可选的上级组织（集团节点）
  const getParentOrgOptions = () => {
    const options: { id: number; name: string; type: string }[] = [];
    const traverse = (nodes: ApiOrg[]) => {
      for (const node of nodes) {
        if (node.type === 'group' || node.type === 'school') {
          options.push({ id: node.id, name: node.name, type: node.type });
        }
        if (node.children) {
          traverse(node.children);
        }
      }
    };
    traverse(orgs);
    return options;
  };

  // 批量创建班级状态
  const [isBatchClassModalOpen, setIsBatchClassModalOpen] = useState(false);
  const [batchClassData, setBatchClassData] = useState({
    grade_id: 0,
    count: 4,
    naming_pattern: 'numeric',
    prefix: '',
    start_number: 1
  });
  const [batchClassCreating, setBatchClassCreating] = useState(false);

  // 可选年级列表（用于批量创建班级）
  const [gradeNodes, setGradeNodes] = useState<ApiOrg[]>([]);

  // 默认教研组列表
  const defaultTeachingGroups = [
    '语文组', '数学组', '英语组', '政治组', '历史组', '地理组', '物理组', '化学组', '生物组'
  ];

  useEffect(() => {
    loadOrgTree();
    loadGradeTemplates();
  }, []);

  useEffect(() => {
    if (selectedOrgId) {
      const findOrg = (nodes: ApiOrg[]): ApiOrg | null => {
        for (const node of nodes) {
          if (node.id === selectedOrgId) return node;
          if (node.children) {
            const found = findOrg(node.children);
            if (found) return found;
          }
        }
        return null;
      };
      const org = findOrg(orgs);
      setSelectedOrg(org);
      loadOrgUsers(selectedOrgId);
    }
  }, [selectedOrgId, orgs]);

  // 获取所有年级节点
  useEffect(() => {
    const grades: ApiOrg[] = [];
    const traverse = (nodes: ApiOrg[]) => {
      for (const node of nodes) {
        if (node.type === 'grade') {
          grades.push(node);
        }
        if (node.children) {
          traverse(node.children);
        }
      }
    };
    traverse(orgs);
    setGradeNodes(grades);
  }, [orgs]);

  const loadGradeTemplates = async () => {
    try {
      const response = await api.get<{ templates: GradeTemplate[] }>('/api/org/grade-templates');
      setGradeTemplates(response.templates);
    } catch (err) {
      console.error('Failed to load grade templates:', err);
    }
  };

  const loadOrgTree = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get<ApiOrg[]>('/api/org/tree');
      console.log('组织架构数据:', response);
      // 检查是否有部门类型
      const checkDepartments = (nodes: ApiOrg[]) => {
        nodes.forEach(node => {
          if (node.type === 'department') {
            console.log('找到部门:', node.name, node);
          }
          if (node.children) {
            checkDepartments(node.children);
          }
        });
      };
      checkDepartments(response);
      setOrgs(response);
      // 默认展开第一个节点
      if (response.length > 0) {
        setExpandedNodes(new Set([response[0].id]));
        setSelectedOrgId(response[0].id);
      }
    } catch (err: any) {
      setError(err.message || '加载组织架构失败');
      console.error('Failed to load org tree:', err);
      setOrgs([]);
    } finally {
      setLoading(false);
    }
  };

  const loadOrgUsers = async (orgId: number) => {
    try {
      setUsersLoading(true);
      const response = await api.get<OrgUsersResponse>(`/api/org/${orgId}/users`);
      setOrgUsers(response);
    } catch (err: any) {
      console.error('Failed to load org users:', err);
      setOrgUsers({
        total: 0,
        page: 1,
        page_size: 20,
        org_name: selectedOrg?.name || '',
        users: []
      });
    } finally {
      setUsersLoading(false);
    }
  };

  const toggleNode = (nodeId: number) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    setExpandedNodes(newExpanded);
  };

  const handleExpandAll = () => {
    if (isExpandAll) {
      setExpandedNodes(new Set());
    } else {
      const allIds = new Set<number>();
      const collectIds = (nodes: ApiOrg[]) => {
        nodes.forEach(node => {
          allIds.add(node.id);
          if (node.children) {
            collectIds(node.children);
          }
        });
      };
      collectIds(orgs);
      setExpandedNodes(allIds);
    }
    setIsExpandAll(!isExpandAll);
  };

  const openAddModal = (parentId?: number) => {
    setEditingId(null);
    setFormData({
      name: '',
      type: 'department',
      parent_id: parentId || 0,
      sort_order: 0
    });
    setIsModalOpen(true);
  };

  const openEditModal = (org: ApiOrg, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(org.id);
    setFormData({
      name: org.name,
      type: org.type,
      parent_id: org.parent_id,
      sort_order: org.sort_order
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.type) {
      toast.warning('请填写所有必填字段');
      return;
    }

    try {
      if (editingId) {
        await api.put(`/api/org/${editingId}`, formData);
      } else {
        await api.post('/api/org/', formData);
      }
      setIsModalOpen(false);
      await loadOrgTree();
    } catch (err: any) {
      toast.error(`${editingId ? '更新' : '创建'}失败: ${err.message}`);
    }
  };

  const handleDelete = async (id: number, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const confirmed = await confirm(`确定要删除组织节点"${name}"吗？此操作无法撤销。`, { type: 'danger', confirmText: '删除' });
    if (!confirmed) return;
    try {
      await api.delete(`/api/org/${id}`);
      await loadOrgTree();
    } catch (err: any) {
      toast.error(`删除失败: ${err.message}`);
    }
  };

  // 获取所有学校节点
  const getSchoolNodes = (nodes: ApiOrg[]): ApiOrg[] => {
    const schools: ApiOrg[] = [];
    const traverse = (nodeList: ApiOrg[]) => {
      for (const node of nodeList) {
        if (node.type === 'school') {
          schools.push(node);
        }
        if (node.children) {
          traverse(node.children);
        }
      }
    };
    traverse(nodes);
    return schools;
  };

  // 批量创建教研组
  const handleBatchCreateTeachingGroups = async () => {
    const gradeIds = batchTeachingGroupData.grade_ids.length > 0
      ? batchTeachingGroupData.grade_ids
      : gradeNodes.map(g => g.id);

    if (gradeIds.length === 0) {
      toast.warning('未找到年级节点，请先创建年级');
      return;
    }

    setBatchTeachingGroupCreating(true);
    try {
      const requestData: { grade_ids: number[]; group_names: string[] } = {
        grade_ids: gradeIds,
        group_names: []
      };

      // 如果使用自定义教研组
      if (batchTeachingGroupData.use_custom_groups && customGroupInput.trim()) {
        requestData.group_names = customGroupInput.split(/[,，、\n]/).map(s => s.trim()).filter(s => s);
      }

      const response = await api.post<{
        created: number;
        skipped: number;
        message: string;
        created_groups: { id: number; grade_name: string; group_name: string }[];
        skipped_groups: { grade_name: string; group_name: string; reason: string }[];
      }>('/api/org/batch-teaching-groups', requestData);

      toast.success(response.message || `成功创建 ${response.created} 个教研组`);
      setIsBatchTeachingGroupModalOpen(false);
      setBatchTeachingGroupData({
        grade_ids: [],
        group_names: [],
        use_custom_groups: false
      });
      setCustomGroupInput('');
      await loadOrgTree();
    } catch (err: any) {
      toast.error(`批量创建教研组失败: ${err.message}`);
    } finally {
      setBatchTeachingGroupCreating(false);
    }
  };

  // 学校创建向导处理
  const handleSchoolWizardSubmit = async () => {
    if (!schoolWizardData.name) {
      toast.warning('请填写学校名称');
      return;
    }
    if (schoolWizardData.stages.length === 0 && schoolWizardData.create_grades) {
      toast.warning('请选择办学学段');
      return;
    }
    if (schoolWizardData.admin_username && !schoolWizardData.admin_password) {
      toast.warning('请设置管理员密码');
      return;
    }

    setSchoolCreating(true);
    try {
      const response = await api.post<{
        id: number;
        name: string;
        created_grades: string[];
        created_admin?: { id: number; username: string; real_name: string };
        message: string;
      }>('/api/org/school-with-structure', schoolWizardData);
      toast.success(`学校创建成功！\n学校ID: ${response.id}\n创建年级: ${response.created_grades?.join('、') || '无'}${response.created_admin ? `\n管理员: ${response.created_admin.username}` : ''}`);
      setIsSchoolWizardOpen(false);
      setSchoolWizardStep(1);
      setSchoolWizardData({
        name: '',
        school_type: '公办',
        address: '',
        principal_name: '',
        contact_phone: '',
        stages: [],
        create_grades: true,
        parent_id: 0,
        admin_username: '',
        admin_password: '',
        admin_real_name: ''
      });
      await loadOrgTree();
    } catch (err: any) {
      toast.error(`创建学校失败: ${err.message}`);
    } finally {
      setSchoolCreating(false);
    }
  };

  // 批量创建班级处理
  const handleBatchCreateClasses = async () => {
    if (!batchClassData.grade_id) {
      toast.warning('请选择年级');
      return;
    }
    if (batchClassData.count < 1 || batchClassData.count > 30) {
      toast.warning('班级数量应在1-30之间');
      return;
    }

    setBatchClassCreating(true);
    try {
      const response = await api.post<{
        total: number;
        created: number;
        message: string;
        classes: { id: number; name: string }[];
      }>('/api/org/batch-classes', batchClassData);
      toast.success(response.message || `成功创建 ${response.created} 个班级`);
      setIsBatchClassModalOpen(false);
      setBatchClassData({
        grade_id: 0,
        count: 4,
        naming_pattern: 'numeric',
        prefix: '',
        start_number: 1
      });
      await loadOrgTree();
    } catch (err: any) {
      toast.error(`批量创建班级失败: ${err.message}`);
    } finally {
      setBatchClassCreating(false);
    }
  };

  // 预览班级名称
  const getPreviewClassNames = () => {
    const names: string[] = [];
    const chineseNums = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十'];
    for (let i = 0; i < Math.min(batchClassData.count, 5); i++) {
      const num = batchClassData.start_number + i;
      if (batchClassData.naming_pattern === 'chinese' && num <= 20) {
        names.push(`${batchClassData.prefix}${chineseNums[num - 1]}班`);
      } else {
        names.push(`${batchClassData.prefix}${num}班`);
      }
    }
    if (batchClassData.count > 5) names.push('...');
    return names.join('、');
  };

  const getTypeName = (type: string): string => {
    const typeMap: Record<string, string> = {
      'group': 'GROUP',
      'school': 'SCHOOL',
      'department': 'DEPT',
      'grade': 'GRADE',
      'class': 'CLASS',
      'teaching_group': '教研组'
    };
    return typeMap[type] || type.toUpperCase();
  };

  const getTypeIcon = (type: string): string => {
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

  const renderTree = (nodes: ApiOrg[], level: number = 0): React.ReactNode => {
    return nodes.map((node) => {
      const isExpanded = expandedNodes.has(node.id);
      const hasChildren = node.children && node.children.length > 0;
      const isSelected = selectedOrgId === node.id;

      return (
        <div key={node.id} className="select-none">
          <div
            onClick={() => setSelectedOrgId(node.id)}
            className={`flex items-center gap-2 py-2 px-3 rounded-md transition-all cursor-pointer ${
              isSelected ? 'bg-blue-50 border-l-3 border-blue-500' : 'hover:bg-slate-50 border-l-3 border-transparent'
            }`}
            style={{ paddingLeft: `${level * 20 + 12}px` }}
          >
            {/* Expand/Collapse Button */}
            {hasChildren ? (
              <button
                onClick={(e) => { e.stopPropagation(); toggleNode(node.id); }}
                className="text-slate-400 hover:text-slate-600 p-0.5 rounded"
              >
                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
            ) : (
              <div className="w-5" />
            )}

            {/* Icon */}
            <span className="text-lg">{getTypeIcon(node.type)}</span>

            {/* Name */}
            <span className={`text-sm font-medium flex-1 ${isSelected ? 'text-blue-700' : 'text-slate-700'}`}>
              {node.name}
            </span>

            {/* Type Badge */}
            <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-500">
              {getTypeName(node.type)}
            </span>

            {/* Actions */}
            <div className="flex items-center gap-1 opacity-0 hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => openAddModal(node.id)}
                className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                title="添加子节点"
              >
                <Plus size={14} />
              </button>
              <button
                onClick={(e) => openEditModal(node, e)}
                className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                title="编辑"
              >
                <Edit2 size={14} />
              </button>
              <button
                onClick={(e) => handleDelete(node.id, node.name, e)}
                className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                title="删除"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>

          {/* Children */}
          {isExpanded && hasChildren && (
            <div className="mt-0.5">
              {renderTree(node.children!, level + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  const getInitials = (name: string): string => {
    return name ? name.charAt(0) : '?';
  };

  const getAvatarColor = (name: string): string => {
    const colors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500', 'bg-pink-500'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="flex h-[600px] gap-4">
      {/* Left: Org Tree */}
      <div className="w-[420px] bg-white rounded-lg border border-slate-200 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-700">组织机构树</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExpandAll}
              className="px-3 py-1 text-xs border border-slate-300 rounded hover:bg-slate-50 transition-colors"
            >
              {isExpandAll ? '收起' : '展开'}
            </button>
            <button
              onClick={() => setIsSchoolWizardOpen(true)}
              className="flex items-center gap-1 px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              title="学校创建向导"
            >
              <School size={12} />
              新建学校
            </button>
            <button
              onClick={() => setIsBatchClassModalOpen(true)}
              className="flex items-center gap-1 px-3 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
              title="批量创建班级"
            >
              <GraduationCap size={12} />
              批量班级
            </button>
            <button
              onClick={() => setIsBatchTeachingGroupModalOpen(true)}
              className="flex items-center gap-1 px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
              title="批量创建教研组"
            >
              <Settings size={12} />
              教研组
            </button>
          </div>
        </div>

        {/* Tree Content */}
        <div className="flex-1 overflow-y-auto p-2">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded-md text-sm mb-3">
              {error}
            </div>
          )}
          {orgs.length === 0 ? (
            <div className="text-center text-slate-500 py-8 text-sm">
              暂无组织架构数据
            </div>
          ) : (
            <div>
              {renderTree(orgs)}
            </div>
          )}
        </div>
      </div>

      {/* Right: Associated Users */}
      <div className="flex-1 bg-white rounded-lg border border-slate-200 flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200">
          <Users className="w-4 h-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-700">
            关联用户列表
            {selectedOrg && (
              <span className="text-blue-600 ml-1">- {selectedOrg.name}</span>
            )}
          </h3>
        </div>

        {/* Users Table */}
        <div className="flex-1 overflow-y-auto">
          {usersLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            </div>
          ) : orgUsers && orgUsers.users.length > 0 ? (
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">姓名</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">账号</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">角色</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orgUsers.users.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full ${getAvatarColor(user.real_name)} flex items-center justify-center text-white text-sm font-medium`}>
                          {getInitials(user.real_name)}
                        </div>
                        <span className="text-sm text-slate-700">{user.real_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{user.username}</td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-slate-600">
                        {user.roles.join(', ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${
                        user.status === 1 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-red-100 text-red-700'
                      }`}>
                        {user.status === 1 ? '启用' : '禁用'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400">
              <User size={48} className="mb-2 opacity-30" />
              <p className="text-sm">暂无关联用户</p>
              <p className="text-xs text-slate-400 mt-1">该组织下没有分配用户</p>
            </div>
          )}
        </div>

        {/* Footer - Pagination info */}
        {orgUsers && orgUsers.total > 0 && (
          <div className="px-4 py-2 border-t border-slate-200 text-xs text-slate-500">
            共 {orgUsers.total} 条记录
          </div>
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50">
              <h3 className="text-lg font-bold text-slate-800">{editingId ? '编辑组织' : '新增组织'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">组织名称 <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="例如: 高一年级"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">组织类型 <span className="text-red-500">*</span></label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({...formData, type: e.target.value as any})}
                  className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="group">集团</option>
                  <option value="school">学校</option>
                  <option value="department">部门</option>
                  <option value="grade">年级</option>
                  <option value="class">班级</option>
                  <option value="teaching_group">教研组</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">上级组织ID</label>
                <input
                  type="number"
                  value={formData.parent_id}
                  onChange={(e) => setFormData({...formData, parent_id: parseInt(e.target.value)})}
                  className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="0表示根节点"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">排序 <span className="text-slate-400 text-xs">(0表示自动排序)</span></label>
                <input
                  type="number"
                  value={formData.sort_order}
                  onChange={(e) => setFormData({...formData, sort_order: parseInt(e.target.value)})}
                  className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="0表示自动排序"
                />
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
                onClick={handleSubmit}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
              >
                {editingId ? '更新' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Create Teaching Groups Modal */}
      {isBatchTeachingGroupModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-green-50 to-emerald-50">
              <div className="flex items-center gap-3">
                <Settings className="w-5 h-5 text-green-600" />
                <h3 className="text-lg font-bold text-slate-800">批量创建教研组</h3>
              </div>
              <button onClick={() => setIsBatchTeachingGroupModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* 选择年级 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">选择年级</label>
                <select
                  multiple
                  value={batchTeachingGroupData.grade_ids}
                  onChange={(e) => {
                    const selected = Array.from(e.target.selectedOptions, (option: HTMLOptionElement) => parseInt(option.value));
                    setBatchTeachingGroupData({ ...batchTeachingGroupData, grade_ids: selected });
                  }}
                  className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 h-32"
                >
                  {gradeNodes.map((grade) => {
                    // 找到父级学校名称
                    const findParentSchool = (nodes: ApiOrg[], targetId: number): string => {
                      for (const node of nodes) {
                        if (node.children?.some(c => c.id === targetId)) {
                          return node.name;
                        }
                        if (node.children) {
                          const found = findParentSchool(node.children, targetId);
                          if (found) return found;
                        }
                      }
                      return '';
                    };
                    const schoolName = findParentSchool(orgs, grade.id);
                    return (
                      <option key={grade.id} value={grade.id}>
                        {schoolName ? `${schoolName} - ${grade.name}` : grade.name}
                      </option>
                    );
                  })}
                </select>
                <p className="text-xs text-slate-500 mt-1">
                  {batchTeachingGroupData.grade_ids.length > 0
                    ? `已选择 ${batchTeachingGroupData.grade_ids.length} 个年级`
                    : '不选择则为所有年级创建'}
                </p>
              </div>

              {/* 教研组设置 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">教研组设置</label>
                <div className="flex items-center gap-2 mb-3">
                  <input
                    type="checkbox"
                    checked={batchTeachingGroupData.use_custom_groups}
                    onChange={(e) => setBatchTeachingGroupData({ ...batchTeachingGroupData, use_custom_groups: e.target.checked })}
                    className="h-4 w-4 text-green-600 focus:ring-green-500 border-slate-300 rounded"
                  />
                  <span className="text-sm text-slate-700">使用自定义教研组名称</span>
                </div>

                {batchTeachingGroupData.use_custom_groups ? (
                  <textarea
                    value={customGroupInput}
                    onChange={(e) => setCustomGroupInput(e.target.value)}
                    className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 h-24"
                    placeholder="输入教研组名称，用逗号、顿号或换行分隔&#10;例如：语文组、数学组、英语组"
                  />
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {defaultTeachingGroups.map((group) => (
                      <span
                        key={group}
                        className="px-3 py-1 bg-green-50 text-green-700 rounded-full text-sm font-medium"
                      >
                        {group}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <p className="text-xs text-slate-500">
                提示：如果年级下已存在同名教研组，将自动跳过。
              </p>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end space-x-3">
              <button
                onClick={() => setIsBatchTeachingGroupModalOpen(false)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-white"
                disabled={batchTeachingGroupCreating}
              >
                取消
              </button>
              <button
                onClick={handleBatchCreateTeachingGroups}
                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                disabled={batchTeachingGroupCreating}
              >
                {batchTeachingGroupCreating ? '创建中...' : '确认创建'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* School Creation Wizard Modal */}
      {isSchoolWizardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 overflow-hidden">
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-blue-50 to-indigo-50">
              <div className="flex items-center gap-3">
                <School className="w-5 h-5 text-blue-600" />
                <h3 className="text-lg font-bold text-slate-800">学校创建向导</h3>
              </div>
              <button onClick={() => { setIsSchoolWizardOpen(false); setSchoolWizardStep(1); }} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>

            {/* Steps Indicator */}
            <div className="flex items-center justify-center py-4 bg-slate-50 border-b border-slate-100">
              {[1, 2, 3].map((step) => (
                <React.Fragment key={step}>
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                    schoolWizardStep >= step ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'
                  }`}>
                    {step}
                  </div>
                  {step < 3 && (
                    <div className={`w-16 h-1 mx-2 ${schoolWizardStep > step ? 'bg-blue-600' : 'bg-slate-200'}`} />
                  )}
                </React.Fragment>
              ))}
            </div>

            <div className="p-6">
              {/* Step 1: Basic Info */}
              {schoolWizardStep === 1 && (
                <div className="space-y-4">
                  <h4 className="font-medium text-slate-700 mb-4">基本信息</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">学校名称 <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        value={schoolWizardData.name}
                        onChange={(e) => setSchoolWizardData({ ...schoolWizardData, name: e.target.value })}
                        className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="例如：XX中学"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">上级组织</label>
                      <select
                        value={schoolWizardData.parent_id}
                        onChange={(e) => setSchoolWizardData({ ...schoolWizardData, parent_id: parseInt(e.target.value) })}
                        className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value={0}>自动选择（集团节点）</option>
                        {getParentOrgOptions().map((org) => (
                          <option key={org.id} value={org.id}>
                            {org.name} ({org.type === 'group' ? '集团' : '学校'})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">学校类型</label>
                      <select
                        value={schoolWizardData.school_type}
                        onChange={(e) => setSchoolWizardData({ ...schoolWizardData, school_type: e.target.value })}
                        className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="公办">公办</option>
                        <option value="民办">民办</option>
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-1">地址</label>
                      <input
                        type="text"
                        value={schoolWizardData.address}
                        onChange={(e) => setSchoolWizardData({ ...schoolWizardData, address: e.target.value })}
                        className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="学校地址"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">校长姓名</label>
                      <input
                        type="text"
                        value={schoolWizardData.principal_name}
                        onChange={(e) => setSchoolWizardData({ ...schoolWizardData, principal_name: e.target.value })}
                        className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="校长姓名"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">联系电话</label>
                      <input
                        type="text"
                        value={schoolWizardData.contact_phone}
                        onChange={(e) => setSchoolWizardData({ ...schoolWizardData, contact_phone: e.target.value })}
                        className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="联系电话"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2: Stages & Grades */}
              {schoolWizardStep === 2 && (
                <div className="space-y-4">
                  <h4 className="font-medium text-slate-700 mb-4">学段设置与年级结构</h4>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">办学学段 <span className="text-red-500">*</span></label>
                    <div className="flex flex-wrap gap-3">
                      {['小学', '初中', '高中'].map((stage) => (
                        <label key={stage} className="flex items-center gap-2 px-4 py-2 border rounded-lg cursor-pointer hover:bg-blue-50 transition-colors">
                          <input
                            type="checkbox"
                            checked={schoolWizardData.stages.includes(stage)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSchoolWizardData({ ...schoolWizardData, stages: [...schoolWizardData.stages, stage] });
                              } else {
                                setSchoolWizardData({ ...schoolWizardData, stages: schoolWizardData.stages.filter(s => s !== stage) });
                              }
                            }}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300 rounded"
                          />
                          <span className="text-sm font-medium text-slate-700">{stage}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-4">
                    <input
                      type="checkbox"
                      checked={schoolWizardData.create_grades}
                      onChange={(e) => setSchoolWizardData({ ...schoolWizardData, create_grades: e.target.checked })}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300 rounded"
                    />
                    <label className="text-sm text-slate-700">自动创建年级结构</label>
                  </div>
                  {schoolWizardData.create_grades && schoolWizardData.stages.length > 0 && (
                    <div className="mt-4 p-4 bg-slate-50 rounded-lg">
                      <p className="text-sm text-slate-600 mb-2">将自动创建以下年级：</p>
                      <div className="flex flex-wrap gap-2">
                        {schoolWizardData.stages.map((stage) => {
                          const template = gradeTemplates.find(t => t.name === stage);
                          return template?.grades.map((grade) => (
                            <span key={grade} className="px-2 py-1 bg-white border border-slate-200 rounded text-xs text-slate-600">
                              {grade}
                            </span>
                          ));
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Step 3: Admin Setup */}
              {schoolWizardStep === 3 && (
                <div className="space-y-4">
                  <h4 className="font-medium text-slate-700 mb-4">管理员设置 <span className="text-sm font-normal text-slate-500">(可选)</span></h4>
                  <p className="text-sm text-slate-500 mb-4">可以为新学校创建一个管理员账号，留空则跳过此步骤。</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">管理员账号</label>
                      <input
                        type="text"
                        value={schoolWizardData.admin_username}
                        onChange={(e) => setSchoolWizardData({ ...schoolWizardData, admin_username: e.target.value })}
                        className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="登录账号"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">管理员密码</label>
                      <input
                        type="password"
                        value={schoolWizardData.admin_password}
                        onChange={(e) => setSchoolWizardData({ ...schoolWizardData, admin_password: e.target.value })}
                        className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="登录密码"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-1">管理员姓名</label>
                      <input
                        type="text"
                        value={schoolWizardData.admin_real_name}
                        onChange={(e) => setSchoolWizardData({ ...schoolWizardData, admin_real_name: e.target.value })}
                        className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="真实姓名"
                      />
                    </div>
                  </div>

                  {/* Summary */}
                  <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                    <h5 className="font-medium text-blue-800 mb-2">创建摘要</h5>
                    <ul className="text-sm text-blue-700 space-y-1">
                      <li>• 学校名称: {schoolWizardData.name || '(未填写)'}</li>
                      <li>• 学校类型: {schoolWizardData.school_type}</li>
                      <li>• 办学学段: {schoolWizardData.stages.join('、') || '(未选择)'}</li>
                      {schoolWizardData.create_grades && <li>• 自动创建年级: 是</li>}
                      {schoolWizardData.admin_username && <li>• 创建管理员: {schoolWizardData.admin_username}</li>}
                    </ul>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-between space-x-3">
              <button
                onClick={() => setSchoolWizardStep(s => s - 1)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-white"
                disabled={schoolWizardStep === 1}
              >
                上一步
              </button>
              <div className="flex gap-3">
                <button
                  onClick={() => { setIsSchoolWizardOpen(false); setSchoolWizardStep(1); }}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-white"
                >
                  取消
                </button>
                {schoolWizardStep < 3 ? (
                  <button
                    onClick={() => setSchoolWizardStep(s => s + 1)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
                    disabled={schoolWizardStep === 1 && !schoolWizardData.name}
                  >
                    下一步
                  </button>
                ) : (
                  <button
                    onClick={handleSchoolWizardSubmit}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                    disabled={schoolCreating || !schoolWizardData.name}
                  >
                    {schoolCreating ? '创建中...' : '创建学校'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Batch Create Classes Modal */}
      {isBatchClassModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-purple-50">
              <div className="flex items-center gap-3">
                <GraduationCap className="w-5 h-5 text-indigo-600" />
                <h3 className="text-lg font-bold text-slate-800">批量创建班级</h3>
              </div>
              <button onClick={() => setIsBatchClassModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">选择年级 <span className="text-red-500">*</span></label>
                <select
                  value={batchClassData.grade_id}
                  onChange={(e) => {
                    const grade = gradeNodes.find(g => g.id === parseInt(e.target.value));
                    setBatchClassData({ ...batchClassData, grade_id: parseInt(e.target.value), prefix: grade?.name || '' });
                  }}
                  className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value={0}>请选择年级</option>
                  {gradeNodes.map((grade) => {
                    // 找到父级学校名称
                    const findParentSchool = (nodes: ApiOrg[], targetId: number): string => {
                      for (const node of nodes) {
                        if (node.children?.some(c => c.id === targetId)) {
                          return node.name;
                        }
                        if (node.children) {
                          const found = findParentSchool(node.children, targetId);
                          if (found) return found;
                        }
                      }
                      return '';
                    };
                    const schoolName = findParentSchool(orgs, grade.id);
                    return (
                      <option key={grade.id} value={grade.id}>
                        {schoolName} - {grade.name}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">班级数量 <span className="text-red-500">*</span></label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={batchClassData.count}
                    onChange={(e) => setBatchClassData({ ...batchClassData, count: parseInt(e.target.value) || 1 })}
                    className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">起始编号</label>
                  <input
                    type="number"
                    min={1}
                    value={batchClassData.start_number}
                    onChange={(e) => setBatchClassData({ ...batchClassData, start_number: parseInt(e.target.value) || 1 })}
                    className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">命名方式</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="naming"
                      checked={batchClassData.naming_pattern === 'numeric'}
                      onChange={() => setBatchClassData({ ...batchClassData, naming_pattern: 'numeric' })}
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-slate-300"
                    />
                    <span className="text-sm text-slate-700">数字 (1班、2班...)</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="naming"
                      checked={batchClassData.naming_pattern === 'chinese'}
                      onChange={() => setBatchClassData({ ...batchClassData, naming_pattern: 'chinese' })}
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-slate-300"
                    />
                    <span className="text-sm text-slate-700">中文 (一班、二班...)</span>
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">名称前缀</label>
                <input
                  type="text"
                  value={batchClassData.prefix}
                  onChange={(e) => setBatchClassData({ ...batchClassData, prefix: e.target.value })}
                  className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="例如：七年级（将生成 七年级1班、七年级2班...）"
                />
              </div>

              {/* Preview */}
              {batchClassData.grade_id > 0 && (
                <div className="p-3 bg-indigo-50 rounded-lg">
                  <p className="text-sm text-indigo-700">
                    <span className="font-medium">预览：</span> {getPreviewClassNames()}
                  </p>
                </div>
              )}
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end space-x-3">
              <button
                onClick={() => setIsBatchClassModalOpen(false)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-white"
                disabled={batchClassCreating}
              >
                取消
              </button>
              <button
                onClick={handleBatchCreateClasses}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                disabled={batchClassCreating || !batchClassData.grade_id}
              >
                {batchClassCreating ? '创建中...' : '确认创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrgManagement;
