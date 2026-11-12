import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Upload, Download, Search, Plus, Minus, X, ChevronDown, ArrowUpCircle,
  Settings as SettingsIcon, GraduationCap, AlertTriangle, Info, CheckCircle2,
  Trash2, Grid, UserPlus, Users, Maximize2, Monitor, Columns, Rows,
  FileSpreadsheet, UserCheck
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { api, API_BASE_URL } from '../../src/services/apiClient';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/Confirm';
import { getBeijingDate } from '../../src/utils/dateUtils';
import { hasPermission } from '../../src/utils/permission';
import type { Student } from '../../types';
import type { School, SeatingGroup, ClassInfo, TeachingClass, Teacher } from '../../src/types/school';
import { CHINA_REGIONS } from '../../src/data/chinaRegions';

export const SchoolList: React.FC<{ useApiData?: boolean }> = ({ useApiData = true }) => {
    const [schools, setSchools] = useState<School[]>([]);
    const [view, setView] = useState<'list' | 'edit'>('list');
    const [editForm, setEditForm] = useState<School | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { toast } = useToast();
    const { confirm } = useConfirm();

    // 分页状态
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const totalPages = Math.ceil(schools.length / pageSize);

    // 计算当前页显示的学校
    const paginatedSchools = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return schools.slice(start, start + pageSize);
    }, [schools, currentPage, pageSize]);

    // 页码变化时重置到第一页
    useEffect(() => {
        setCurrentPage(1);
    }, [schools.length, pageSize]);

    // 处理页码变化
    const handlePageChange = (page: number) => {
        setCurrentPage(Math.max(1, Math.min(totalPages, page)));
    };

    // 处理每页条数变化
    const handlePageSizeChange = (newSize: number) => {
        setPageSize(newSize);
        setCurrentPage(1);
    };

    // 从API加载学校数据
    useEffect(() => {
        if (useApiData) {
            loadSchoolsFromApi();
        }
    }, [useApiData]);

    const loadSchoolsFromApi = async () => {
        try {
            setLoading(true);
            setError(null);
            
            // 检查登录状态
            const token = localStorage.getItem('auth_token');
            if (!token) {
                setError('请先登录系统');
                setSchools([]);
                return;
            }
            
            // 使用新的学校列表API
            const response: any = await api.get('/api/schools/list');
            
            if (response.schools && Array.isArray(response.schools)) {
                // 将API返回的数据映射到前端School接口
                const mappedSchools: School[] = response.schools.map((school: any) => ({
                    id: school.id.toString(),
                    name: school.name,
                    type: school.type || '',
                    province: school.province || '',
                    city: school.city || '',
                    district: school.district || '',
                    address: school.address || '',
                    principal: school.principal || '',
                    contact: school.contact || '',
                    studentCount: school.studentCount || 0,
                    teacherCount: school.teacherCount || 0,
                    stages: school.stages || '',
                    gradeCount: school.gradeCount || 0,
                    classCount: school.classCount || 0
                }));
                setSchools(mappedSchools);
            }
        } catch (err: any) {
            console.error('加载学校数据失败:', err);
            const errorMsg = err.response?.data?.detail || err.message || '加载学校数据失败';
            setError(`加载失败: ${errorMsg}`);
            if (err.response?.status === 401) {
                setError('登录已过期，请重新登录');
                localStorage.removeItem('auth_token');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleEditClick = (school: School) => {
        setEditForm({ ...school });
        setView('edit');
    };

    const handleSave = async () => {
        if (editForm) {
            try {
                setLoading(true);
                // 调用API更新学校信息
                await api.put(`/api/schools/${editForm.id}`, {
                    name: editForm.name,
                    school_type: editForm.type,
                    province: editForm.province,
                    city: editForm.city,
                    district: editForm.district,
                    address: editForm.address,
                    principal_name: editForm.principal,
                    contact_phone: editForm.contact,
                    stages: editForm.stages
                });
                
                // 更新本地状态
                setSchools(schools.map(s => s.id === editForm.id ? editForm : s));
                setView('list');
                setEditForm(null);
            } catch (err: any) {
                console.error('保存学校数据失败:', err);
                setError(err.message || '保存学校数据失败');
                toast.error('保存失败: ' + (err.message || '未知错误'));
            } finally {
                setLoading(false);
            }
        }
    };

    const handleCancel = () => {
        setView('list');
        setEditForm(null);
    };

    if (view === 'edit' && editForm) {
        return (
            <div className="space-y-6">
                <div className="flex items-center space-x-2 text-sm text-slate-600">
                    <span className="font-bold text-slate-800 hover:text-blue-600 cursor-pointer" onClick={handleCancel}>校区管理</span>
                    <span>-&gt;</span>
                    <span className="font-bold text-slate-800">校区管理-信息维护</span>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm space-y-8">
                    {/* Basic Info */}
                    <div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
                            <div className="flex items-center space-x-4">
                                <label className="w-24 text-sm font-medium text-slate-600 text-right">学校名称</label>
                                <input
                                    type="text"
                                    value={editForm.name}
                                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                    className="flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm bg-slate-50 focus:bg-white focus:border-blue-500 focus:outline-none transition-colors"
                                />
                            </div>
                            <div className="flex items-center space-x-4">
                                <label className="w-24 text-sm font-medium text-slate-600 text-right">学校类型</label>
                                <select
                                    value={editForm.type}
                                    onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
                                    className="flex-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                >
                                    <option value="">请选择类型</option>
                                    <option value="民办">民办</option>
                                    <option value="公办">公办</option>
                                </select>
                            </div>
                            <div className="flex items-center space-x-4 col-span-1 md:col-span-2">
                                <label className="w-24 text-sm font-medium text-slate-600 text-right">学校地址</label>
                                <div className="flex flex-1 space-x-2">
                                    {/* 省选择 */}
                                    <select 
                                        className="rounded-md border border-slate-200 px-3 py-2 text-sm bg-white w-28"
                                        value={editForm.province}
                                        onChange={(e) => {
                                            const province = e.target.value;
                                            setEditForm({ 
                                                ...editForm, 
                                                province,
                                                city: '',
                                                district: ''
                                            });
                                        }}
                                    >
                                        <option value="">选择省份</option>
                                        {Object.keys(CHINA_REGIONS).map(province => (
                                            <option key={province} value={province}>{province}</option>
                                        ))}
                                    </select>
                                    {/* 市选择 */}
                                    <select 
                                        className="rounded-md border border-slate-200 px-3 py-2 text-sm bg-white w-28"
                                        value={editForm.city}
                                        disabled={!editForm.province}
                                        onChange={(e) => {
                                            const city = e.target.value;
                                            setEditForm({ 
                                                ...editForm, 
                                                city,
                                                district: ''
                                            });
                                        }}
                                    >
                                        <option value="">选择城市</option>
                                        {editForm.province && CHINA_REGIONS[editForm.province] &&
                                            Object.keys(CHINA_REGIONS[editForm.province]).map(city => (
                                                <option key={city} value={city}>{city}</option>
                                            ))
                                        }
                                    </select>
                                    {/* 区/县选择 */}
                                    <select 
                                        className="rounded-md border border-slate-200 px-3 py-2 text-sm bg-white w-28"
                                        value={editForm.district}
                                        disabled={!editForm.city}
                                        onChange={(e) => setEditForm({ ...editForm, district: e.target.value })}
                                    >
                                        <option value="">选择区县</option>
                                        {editForm.province && editForm.city && CHINA_REGIONS[editForm.province] && CHINA_REGIONS[editForm.province][editForm.city] &&
                                            CHINA_REGIONS[editForm.province][editForm.city].map((district: string) => (
                                                <option key={district} value={district}>{district}</option>
                                            ))
                                        }
                                    </select>
                                    <input
                                        type="text"
                                        value={editForm.address}
                                        onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                                        className="flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                        placeholder="详细地址"
                                    />
                                </div>
                            </div>
                            <div className="flex items-center space-x-4">
                                <label className="w-24 text-sm font-medium text-slate-600 text-right">执行校长</label>
                                <input
                                    type="text"
                                    value={editForm.principal}
                                    onChange={(e) => setEditForm({ ...editForm, principal: e.target.value })}
                                    className="flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                />
                            </div>
                            <div className="flex items-center space-x-4">
                                <label className="w-24 text-sm font-medium text-slate-600 text-right">联系方式</label>
                                <input
                                    type="text"
                                    value={editForm.contact}
                                    onChange={(e) => setEditForm({ ...editForm, contact: e.target.value })}
                                    placeholder="请输入联系方式"
                                    className="flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                />
                            </div>
                             <div className="flex items-center space-x-4">
                                <label className="w-24 text-sm font-medium text-slate-600 text-right">学生人数</label>
                                <input
                                    type="number"
                                    value={editForm.studentCount}
                                    readOnly
                                    className="flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm bg-slate-100 text-slate-600 cursor-not-allowed"
                                />
                            </div>
                             <div className="flex items-center space-x-4">
                                <label className="w-24 text-sm font-medium text-slate-600 text-right">教师人数</label>
                                <input
                                    type="number"
                                    value={editForm.teacherCount}
                                    readOnly
                                    className="flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm bg-slate-100 text-slate-600 cursor-not-allowed"
                                />
                            </div>
                            <div className="flex items-center space-x-4">
                                <label className="w-24 text-sm font-medium text-slate-600 text-right">学段</label>
                                <input
                                    type="text"
                                    value={editForm.stages}
                                    readOnly
                                    className="flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm bg-slate-100 text-slate-600 cursor-not-allowed"
                                />
                            </div>
                            <div className="flex items-center space-x-4">
                                <label className="w-24 text-sm font-medium text-slate-600 text-right">年级数量</label>
                                <input
                                    type="number"
                                    value={editForm.gradeCount}
                                    readOnly
                                    className="flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm bg-slate-100 text-slate-600 cursor-not-allowed"
                                />
                            </div>
                            <div className="flex items-center space-x-4">
                                <label className="w-24 text-sm font-medium text-slate-600 text-right">班级数量</label>
                                <input
                                    type="number"
                                    value={editForm.classCount}
                                    readOnly
                                    className="flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm bg-slate-100 text-slate-600 cursor-not-allowed"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex space-x-4 pt-4 mt-8">
                        <button
                            onClick={handleSave}
                            className="rounded-md bg-green-500 px-8 py-2 text-sm font-medium text-white hover:bg-green-600 focus:outline-none shadow-sm"
                        >
                            保存
                        </button>
                         <button
                            onClick={handleCancel}
                            className="rounded-md border border-slate-300 bg-white px-8 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none"
                        >
                            取消
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
             <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="min-w-full divide-y divide-slate-200">
                   <thead className="bg-slate-50">
                      <tr>
                         <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">学校名称</th>
                         <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">学校类型</th>
                         <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">学校地址</th>
                         <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">执行校长</th>
                         <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">联系方式</th>
                         <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">学生人数</th>
                         <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">教师人数</th>
                         <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">学段</th>
                         <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">年级数量</th>
                         <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">班级数量</th>
                         <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">操作</th>
                      </tr>
                   </thead>
                   <tbody className="bg-white divide-y divide-slate-200">
                      {paginatedSchools.map(school => (
                          <tr key={school.id} className="hover:bg-slate-50">
                              <td className="px-4 py-4 text-sm text-slate-900">{school.name}</td>
                              <td className="px-4 py-4 text-sm text-slate-600">{school.type}</td>
                              <td className="px-4 py-4 text-sm text-slate-600 max-w-xs truncate" title={`${school.province}${school.city}${school.district}${school.address}`}>
                                {(school.province || school.city || school.district || school.address) ? `${school.province}${school.city}${school.district}${school.address}` : school.address}
                              </td>
                              <td className="px-4 py-4 text-sm text-slate-600">{school.principal}</td>
                              <td className="px-4 py-4 text-sm text-slate-600">{school.contact}</td>
                              <td className="px-4 py-4 text-sm text-slate-600">{school.studentCount}</td>
                              <td className="px-4 py-4 text-sm text-slate-600">{school.teacherCount}</td>
                              <td className="px-4 py-4 text-sm text-slate-600">{school.stages}</td>
                              <td className="px-4 py-4 text-sm text-slate-600">{school.gradeCount}</td>
                              <td className="px-4 py-4 text-sm text-slate-600">{school.classCount}</td>
                              <td className="px-4 py-4 text-sm">
                                  {hasPermission('school:edit') ? (
                                      <button
                                          onClick={() => handleEditClick(school)}
                                          className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-xs transition-colors"
                                      >
                                          编辑
                                      </button>
                                  ) : (
                                      <span className="text-slate-400 text-xs">只读</span>
                                  )}
                              </td>
                          </tr>
                      ))}
                   </tbody>
                </table>
                 {/* Pagination */}
                <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-center space-x-2 text-sm text-slate-600">
                     <span>共 {schools.length} 条</span>
                     <select
                         className="border-slate-300 rounded text-sm py-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                         value={pageSize}
                         onChange={(e) => handlePageSizeChange(parseInt(e.target.value))}
                     >
                         <option value={10}>10条/页</option>
                         <option value={20}>20条/页</option>
                         <option value={50}>50条/页</option>
                         <option value={100}>100条/页</option>
                     </select>
                     <button
                         className="px-2 py-1 text-slate-400 hover:text-blue-600 disabled:text-slate-300"
                         onClick={() => handlePageChange(1)}
                         disabled={currentPage === 1}
                     >
                         {'<<'}
                     </button>
                     <button
                         className="px-2 py-1 text-slate-400 hover:text-blue-600 disabled:text-slate-300"
                         onClick={() => handlePageChange(currentPage - 1)}
                         disabled={currentPage === 1}
                     >
                         {'<'}
                     </button>
                     {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
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
                                 className={`px-2 py-1 ${currentPage === pageNum ? 'text-blue-600 font-bold' : 'text-slate-600 hover:text-blue-600'}`}
                                 onClick={() => handlePageChange(pageNum)}
                             >
                                 {pageNum}
                             </button>
                         );
                     })}
                     <button
                         className="px-2 py-1 text-slate-400 hover:text-blue-600 disabled:text-slate-300"
                         onClick={() => handlePageChange(currentPage + 1)}
                         disabled={currentPage === totalPages || totalPages === 0}
                     >
                         {'>'}
                     </button>
                     <button
                         className="px-2 py-1 text-slate-400 hover:text-blue-600 disabled:text-slate-300"
                         onClick={() => handlePageChange(totalPages)}
                         disabled={currentPage === totalPages || totalPages === 0}
                     >
                         {'>>'}
                     </button>
                     <span>前往</span>
                     <input
                         type="number"
                         min={1}
                         max={totalPages || 1}
                         value={currentPage}
                         onChange={(e) => handlePageChange(parseInt(e.target.value) || 1)}
                         className="w-12 border border-slate-300 rounded text-center py-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                     />
                     <span>页</span>
                </div>
             </div>
        </div>
    );
};
