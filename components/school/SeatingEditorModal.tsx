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

interface SeatingModalProps {
    initialGroups: SeatingGroup[];
    initialRowCount?: number;  // 初始行数
    allStudents: string[];
    onSave: (groups: SeatingGroup[], rowCount: number) => void;  // 返回行数
    onClose: () => void;
}

export const SeatingEditorModal: React.FC<SeatingModalProps> = ({ initialGroups, initialRowCount, allStudents, onSave, onClose }) => {
    const { confirm } = useConfirm();
    // 从initialRowCount或initialGroups推断行数
    // 优先使用传入的initialRowCount，如果没有则从students长度推断，默认8行
    console.log('[DEBUG] SeatingEditorModal props:', { initialRowCount, initialGroupsCount: initialGroups.length });
    const inferredRowCount = initialRowCount || (initialGroups.length > 0 
        ? Math.max(...initialGroups.map(g => g.students?.length || 0), 8)
        : 8);
    console.log('[DEBUG] inferredRowCount:', inferredRowCount);
    
    // Initialize groups: Default to existing groups or 9 default groups (A-I列)
    // Requirement: All groups are single column (no left/right distinction)
    const [groups, setGroups] = useState<SeatingGroup[]>(
        initialGroups.length > 0 
        ? initialGroups
        : Array.from({ length: 9 }, (_, i) => ({ id: i + 1, name: `第${i + 1}组`, students: [] }))
    );
    
    const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
    const [filterText, setFilterText] = useState('');
    const [draggedStudent, setDraggedStudent] = useState<string | null>(null);
    const [dragOverCell, setDragOverCell] = useState<{groupId: number, rowIndex: number} | null>(null);
    
    // 行数控制
    const [rowCount, setRowCount] = useState(inferredRowCount);
    const MIN_ROWS = 4;
    const MAX_ROWS = 12;

    // Calculate unassigned students dynamically
    const assignedStudents = useMemo(() => {
        return new Set(groups.flatMap(g => g.students));
    }, [groups]);

    const unassignedStudents = useMemo(() => {
        return allStudents.filter(s => !assignedStudents.has(s)).filter(s => s.includes(filterText));
    }, [allStudents, assignedStudents, filterText]);

    const handleAddGroup = () => {
        const newId = Math.max(0, ...groups.map(g => g.id)) + 1;
        setGroups([...groups, { id: newId, name: `第${newId}组`, students: [] }]);
    };

    const handleIncreaseRows = () => {
        if (rowCount < MAX_ROWS) {
            setRowCount(rowCount + 1);
        }
    };

    const handleDecreaseRows = () => {
        if (rowCount > MIN_ROWS) {
            // 如果减少行数，需要将超过新行数的学生移回未分配
            const newGroups = groups.map(g => {
                if (g.students.length > rowCount - 1) {
                    return { ...g, students: g.students.slice(0, rowCount - 1) };
                }
                return g;
            });
            setGroups(newGroups);
            setRowCount(rowCount - 1);
        }
    };

    const handleRemoveGroup = async (id: number) => {
        const confirmed = await confirm('确定删除该小组吗？组内学生将回到未分配状态。', { type: 'danger', confirmText: '删除' }); 
        if (!confirmed) return;
        setGroups(groups.filter(g => g.id !== id));
    };

    const handleRemoveStudent = (groupId: number, studentName: string) => {
        setGroups(groups.map(g => {
            if (g.id === groupId) {
                return { ...g, students: g.students.filter(s => s !== studentName) };
            }
            return g;
        }));
    };

    const handleAddStudentToGroup = (groupId: number, studentName: string) => {
        setGroups(groups.map(g => {
            if (g.id === groupId) {
                return { ...g, students: [...g.students, studentName] };
            }
            return g;
        }));
        setSelectedStudent(null);
    };

    // 拖拽处理函数
    const handleDragStart = (student: string) => {
        setDraggedStudent(student);
    };

    const handleDragEnd = () => {
        setDraggedStudent(null);
        setDragOverCell(null);
    };

    const handleDragOver = (e: React.DragEvent, groupId: number, rowIndex: number) => {
        e.preventDefault();
        setDragOverCell({ groupId, rowIndex });
    };

    const handleDragLeave = () => {
        setDragOverCell(null);
    };

    const handleDrop = (e: React.DragEvent, groupId: number, rowIndex: number) => {
        e.preventDefault();
        if (draggedStudent) {
            setGroups(groups.map(g => {
                if (g.id === groupId) {
                    const newStudents = [...g.students];
                    // 如果该位置已有学生，先移除
                    if (newStudents[rowIndex]) {
                        return g; // 位置已被占用，不放置
                    }
                    newStudents[rowIndex] = draggedStudent;
                    return { ...g, students: newStudents };
                }
                return g;
            }));
            setDraggedStudent(null);
            setDragOverCell(null);
        }
    };

    const handleClearAll = async () => {
        const confirmed = await confirm('确定清空所有座位安排吗？此操作不可撤销。', { type: 'danger', confirmText: '清空' });
        if (!confirmed) return;
        setGroups(groups.map(g => ({ ...g, students: [] })));
    };

    const handleAutoArrange = async () => {
        const confirmed = await confirm('系统将把所有未入座的学生随机分配到空座位中，继续吗？', { type: 'info', confirmText: '自动补位' }); 
        if (!confirmed) return;
        // Simple logic: fill groups sequentially
        let currentUnassigned = [...unassignedStudents];
        const newGroups = groups.map(g => ({ ...g, students: [...g.students] }));
        
        newGroups.forEach(g => {
            const capacity = rowCount; // Dynamic rows per group
            const space = capacity - g.students.length;
            if (space > 0 && currentUnassigned.length > 0) {
                const toAdd = currentUnassigned.splice(0, space);
                g.students.push(...toAdd);
            }
        });
        setGroups(newGroups);
    };

    const getColumnLabel = (index: number) => {
        return String.fromCharCode(65 + index); // 0->A, 1->B ...
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-slate-100 w-full max-w-6xl h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800 flex items-center">
                            <Grid className="w-5 h-5 mr-2 text-blue-600" />
                            座位表编辑器
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">拖拽左侧学生到右侧座位即可入座，或点击选中后点击小组</p>
                    </div>
                    <div className="flex items-center space-x-3">
                        {/* 行数控制 */}
                        <div className="flex items-center space-x-2 bg-slate-50 rounded-lg px-2 py-1 border border-slate-200">
                            <span className="text-xs text-slate-500">行数:</span>
                            <button 
                                onClick={handleDecreaseRows}
                                disabled={rowCount <= MIN_ROWS}
                                className="w-6 h-6 flex items-center justify-center bg-white rounded border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                                <Minus size={14} />
                            </button>
                            <span className="text-sm font-medium text-slate-700 w-4 text-center">{rowCount}</span>
                            <button 
                                onClick={handleIncreaseRows}
                                disabled={rowCount >= MAX_ROWS}
                                className="w-6 h-6 flex items-center justify-center bg-white rounded border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                                <Plus size={14} />
                            </button>
                        </div>
                        <div className="h-6 w-px bg-slate-200"></div>
                        <button onClick={handleAutoArrange} className="px-3 py-1.5 text-xs font-medium bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 border border-indigo-200 transition-colors">
                            自动补位
                        </button>
                        <button onClick={handleClearAll} className="px-3 py-1.5 text-xs font-medium bg-red-50 text-red-600 rounded hover:bg-red-100 border border-red-200 transition-colors">
                            清空座位
                        </button>
                        <div className="h-6 w-px bg-slate-200 mx-2"></div>
                        <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                            <X size={20} className="text-slate-500" />
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Sidebar: Unassigned */}
                    <div className="w-64 bg-white border-r border-slate-200 flex flex-col shadow-[4px_0_15px_-3px_rgba(0,0,0,0.05)] z-10">
                        <div className="p-4 border-b border-slate-100">
                            <h4 className="text-sm font-bold text-slate-800 mb-2 flex justify-between items-center">
                                待分配学生
                                <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-xs">{unassignedStudents.length}</span>
                            </h4>
                            <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                                <input 
                                    type="text" 
                                    placeholder="搜索学生..." 
                                    className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-md focus:border-blue-500 focus:outline-none"
                                    value={filterText}
                                    onChange={(e) => setFilterText(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-3 space-y-2">
                            {unassignedStudents.map(student => (
                                <div 
                                    key={student}
                                    draggable
                                    onDragStart={() => handleDragStart(student)}
                                    onDragEnd={handleDragEnd}
                                    onClick={() => setSelectedStudent(selectedStudent === student ? null : student)}
                                    className={`px-3 py-2 rounded-lg text-sm cursor-move transition-all border ${
                                        selectedStudent === student 
                                            ? 'bg-blue-600 text-white border-blue-600 shadow-md transform scale-105' 
                                            : draggedStudent === student
                                                ? 'opacity-50 bg-blue-100 border-blue-300'
                                                : 'bg-slate-50 text-slate-700 border-slate-100 hover:border-blue-200 hover:bg-white'
                                    }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <span>{student}</span>
                                        <svg className="w-4 h-4 text-slate-400 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                                        </svg>
                                    </div>
                                </div>
                            ))}
                            {unassignedStudents.length === 0 && (
                                <div className="text-center py-8 text-xs text-slate-400">
                                    {filterText ? '无匹配学生' : '所有学生已入座'}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Main: Groups Grid */}
                    <div className="flex-1 bg-slate-100 p-6 overflow-hidden flex flex-col relative">
                        
                        {/* Podium Indicator */}
                        <div className="w-full flex justify-center mb-8 flex-shrink-0">
                            <div className="bg-slate-800 text-white px-12 py-2 rounded-b-xl shadow-md flex items-center justify-center text-sm font-bold tracking-widest border-t-4 border-blue-500">
                                <Monitor className="w-4 h-4 mr-2 text-blue-400" />
                                讲台 (Podium)
                            </div>
                        </div>

                        <div className="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar">
                            <div className="flex flex-row gap-6 pb-20 min-w-max px-8 mx-auto">
                                {groups.map((group, index) => {
                                    // Always single column format
                                    const gridCols = 'grid-cols-[30px_1fr]';
                                    const widthClass = 'w-48'; // Standard width for single column

                                    return (
                                        <div key={group.id} className={`flex flex-col flex-shrink-0 transition-all duration-300 ${widthClass}`}>
                                            {/* Column Label - A, B, C... */}
                                            <div className="text-center mb-2">
                                                <span className="bg-blue-100 text-blue-700 px-4 py-1 rounded-full text-sm font-bold shadow-sm border border-blue-200">
                                                    {getColumnLabel(index)} 列
                                                </span>
                                            </div>

                                            {/* Group Card */}
                                            <div 
                                                className={`bg-white rounded-xl border-2 transition-all duration-200 flex flex-col relative group/card flex-1 ${
                                                    selectedStudent ? 'border-blue-200 shadow-lg ring-2 ring-blue-100 cursor-pointer hover:border-blue-400' : 'border-slate-200 shadow-sm'
                                                }`}
                                                onClick={() => selectedStudent && handleAddStudentToGroup(group.id, selectedStudent)}
                                            >
                                                {/* Header - 显示坐标说明 */}
                                                <div className="px-3 py-2 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
                                                    <div className="flex items-center space-x-1">
                                                        <span className="text-xs text-slate-500">第{index + 1}组</span>
                                                    </div>
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); handleRemoveGroup(group.id); }}
                                                        className="text-slate-400 hover:text-red-500 opacity-0 group-hover/card:opacity-100 transition-opacity"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>

                                                {/* Students Grid with Coordinates */}
                                                <div className="p-3 flex-1 min-h-[120px]">
                                                    {/* Column Headers */}
                                                    <div className={`grid ${gridCols} gap-2 mb-2 text-center`}>
                                                        <div></div>
                                                        <div className="text-[10px] text-slate-400 font-bold bg-slate-50 rounded py-0.5">座</div>
                                                    </div>

                                                    <div className={`grid ${gridCols} gap-2 content-start`}>
                                                        {/* Dynamic rows */}
                                                        {Array.from({ length: rowCount }).map((_, rowIndex) => {
                                                            // Determine student for this cell (simple index match)
                                                            const student = group.students[rowIndex];
                                                            
                                                            return (
                                                                <React.Fragment key={rowIndex}>
                                                                    {/* Row Number */}
                                                                    <div className="flex items-center justify-center text-[10px] text-slate-400 font-bold bg-slate-50 rounded h-8">
                                                                        {rowIndex + 1}
                                                                    </div>
                                                                    
                                                                    {/* Cell */}
                                                                    <div 
                                                                        className="relative group/student h-10"
                                                                        onDragOver={(e) => handleDragOver(e, group.id, rowIndex)}
                                                                        onDragLeave={handleDragLeave}
                                                                        onDrop={(e) => handleDrop(e, group.id, rowIndex)}
                                                                    >
                                                                        {student ? (
                                                                            <>
                                                                                <div className="bg-blue-50 text-blue-700 text-xs font-medium h-full flex flex-col items-center justify-center rounded border border-blue-100 truncate px-1" title={`${getColumnLabel(index)}-${rowIndex + 1} ${student}`}>
                                                                                    <span className="text-[9px] text-blue-400">{getColumnLabel(index)}-{rowIndex + 1}</span>
                                                                                    <span className="truncate w-full text-center">{student}</span>
                                                                                </div>
                                                                                <button 
                                                                                    onClick={(e) => { e.stopPropagation(); handleRemoveStudent(group.id, student); }}
                                                                                    className="absolute -top-1.5 -right-1.5 bg-white rounded-full text-red-500 shadow-sm border border-slate-200 p-0.5 opacity-0 group-hover/student:opacity-100 hover:bg-red-50 transition-all z-10"
                                                                                >
                                                                                    <X size={10} />
                                                                                </button>
                                                                            </>
                                                                        ) : (
                                                                            dragOverCell?.groupId === group.id && dragOverCell?.rowIndex === rowIndex ? (
                                                                                <div className="border-2 border-dashed border-green-400 bg-green-50 rounded h-full flex items-center justify-center text-green-600 text-[10px] animate-pulse">
                                                                                    放置
                                                                                </div>
                                                                            ) : draggedStudent ? (
                                                                                <div className="border-2 border-dashed border-blue-300 bg-blue-50/50 rounded h-full flex items-center justify-center text-blue-400 text-[10px] cursor-pointer hover:bg-blue-100 hover:border-blue-400">
                                                                                    拖入
                                                                                </div>
                                                                            ) : selectedStudent ? (
                                                                                <div className="border-2 border-dashed border-blue-300 bg-blue-50/50 rounded h-full flex items-center justify-center text-blue-400 text-[10px]">
                                                                                    入座
                                                                                </div>
                                                                            ) : (
                                                                                <div className="border border-dashed border-slate-200 bg-slate-50 rounded h-full"></div>
                                                                            )
                                                                        )}
                                                                    </div>
                                                                </React.Fragment>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}

                                {/* Add Group Button */}
                                <div className="flex flex-col w-48 flex-shrink-0 pt-9">
                                    <button 
                                        onClick={handleAddGroup}
                                        className="border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center h-full min-h-[200px] text-slate-400 hover:text-blue-500 hover:border-blue-400 hover:bg-blue-50/30 transition-all"
                                    >
                                        <Plus size={32} className="mb-2" />
                                        <span className="text-sm font-medium">添加新小组</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="bg-white border-t border-slate-200 px-6 py-4 flex justify-between items-center">
                    <div className="text-xs text-slate-500">
                        已分配: <span className="font-bold text-blue-600">{allStudents.length - unassignedStudents.length}</span> 人
                        <span className="mx-2">|</span>
                        未分配: <span className="font-bold text-red-600">{unassignedStudents.length}</span> 人
                    </div>
                    <div className="flex space-x-3">
                        <button 
                            onClick={onClose}
                            className="px-6 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-white transition-colors"
                        >
                            取消
                        </button>
                        <button 
                            onClick={() => {
                                // 清理数据：过滤掉空值，只保留有效学生姓名
                                const cleanedGroups = groups.map(g => ({
                                    ...g,
                                    students: g.students.filter((s): s is string => !!s && typeof s === 'string')
                                }));
                                onSave(cleanedGroups, rowCount);
                            }}
                            className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-sm transition-colors flex items-center"
                        >
                            <CheckCircle2 className="w-4 h-4 mr-2" />
                            保存座位表
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
