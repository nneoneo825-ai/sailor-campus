import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ScatterChart, Scatter, ZAxis
} from 'recharts';
import {
  Download, Filter, Search, Calendar, ChevronDown, X, ArrowLeft,
  ChevronLeft, ChevronRight, RefreshCw, FileText, TrendingUp,
  TrendingDown, Users, School, GraduationCap, BarChart3, Loader2,
  Award, BookOpen, ClipboardList, Building
} from 'lucide-react';
import { api } from '../../src/services/apiClient';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/Confirm';
import {
  getBeijingDate, getBeijingDateOffset, getBeijingWeekRange, getBeijingLastWeekRange,
  getBeijingMonthRange, getBeijingLastMonthRange, formatBeijingTime, getRecentDaysRange
} from '../../src/utils/dateUtils';
import { hasPermission } from '../../src/utils/permission';
import type {
  PersonalTeachingReportResponse, GradeTeachingReportResponse,
  SchoolTeachingReportResponse, ProvincialTeachingReportResponse,
  TeacherMetric, SchoolTeachingMetric, ProvincialTeachingMetric,
  ApiTeachingIndicator, TeachingDetailRecord, GradeTeachingDetailRecord,
  SchoolTeachingDetailRecord, ProvincialTeachingDetailRecord,
  PersonalDetailRecord, FilterOptions, SchoolTeachersResponse,
  TeacherDetail, TeachingIndicator
} from '../../src/types/teaching';

interface SchoolMultiSelectProps {
  schools: { id: number; name: string; groupId: number }[];
  selectedSchools: string[];
  onChange: (selected: string[]) => void;
}

export const SchoolMultiSelect: React.FC<SchoolMultiSelectProps> = ({ schools, selectedSchools, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭下拉
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggle = (schoolName: string) => {
    if (selectedSchools.includes(schoolName)) {
      onChange(selectedSchools.filter(name => name !== schoolName));
    } else {
      onChange([...selectedSchools, schoolName]);
    }
  };

  const handleSelectAll = () => {
    const visibleSchoolNames = schools.map(s => s.name);
    // 检查当前可见的学校是否都被选中了
    const allVisibleSelected = visibleSchoolNames.every(name => selectedSchools.includes(name));
    
    if (allVisibleSelected) {
      // 取消选中当前可见的学校，保留其他已选（其他集团的）
      onChange(selectedSchools.filter(name => !visibleSchoolNames.includes(name)));
    } else {
      // 选中所有当前可见的学校（只选当前集团的，替换之前的选中状态）
      onChange(visibleSchoolNames);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      {/* 触发按钮 */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="text-sm border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 w-44 pl-3 pr-8 py-2 bg-white text-left flex items-center justify-between hover:border-blue-400"
      >
        <span className={selectedSchools.length === 0 ? 'text-slate-400' : 'text-slate-700'}>
          {selectedSchools.length === 0
            ? '请选择学校'
            : `已选择 ${selectedSchools.length} 所学校`
          }
        </span>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform absolute right-2 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* 下拉面板 */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-auto">
          {/* 全选/取消全选 */}
          <div className="sticky top-0 bg-gray-50 border-b border-slate-200 px-3 py-2">
            <label className="flex items-center cursor-pointer hover:bg-gray-100 rounded px-1 py-1">
              <input
                type="checkbox"
                checked={schools.length > 0 && schools.every(s => selectedSchools.includes(s.name))}
                onChange={handleSelectAll}
                className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-slate-700">
                {schools.length > 0 && schools.every(s => selectedSchools.includes(s.name)) ? '取消全选' : '全选'}
              </span>
            </label>
          </div>

          {/* 学校列表 */}
          <div className="py-1">
            {schools.length === 0 ? (
              <div className="px-3 py-2 text-sm text-slate-400">暂无学校</div>
            ) : (
              schools.map((school) => (
                <label
                  key={school.id}
                  className="flex items-center px-3 py-2 cursor-pointer hover:bg-blue-50 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedSchools.includes(school.name)}
                    onChange={() => handleToggle(school.name)}
                    className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-slate-700 truncate">{school.name}</span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// --- Components ---
