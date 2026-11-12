import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar
} from 'recharts';
import {
  Search, ArrowLeft, Download, Calendar, X, Filter, RefreshCw,
  TrendingUp, TrendingDown, Award, Users, FileText, Loader2,
  School, GraduationCap, BarChart3, ChevronDown, ChevronLeft, ChevronRight, Building
} from 'lucide-react';
import { api } from '../../src/services/apiClient';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/Confirm';
import {
  getBeijingDate, getBeijingDateOffset, getBeijingWeekRange, getBeijingLastWeekRange,
  getBeijingMonthRange, getBeijingLastMonthRange, formatBeijingTime,
  getRecentDaysRange, getLastWeekRange
} from '../../src/utils/dateUtils';
import { extractSchools } from '../../src/utils/orgUtils';
import { hasPermission } from '../../src/utils/permission';
import type {
  ClassDetailRecord, GradeDetailRecord, SchoolDetailListRecord,
  DormReportData, DormDetailRecord, ClassReportData, FilterOptions,
  IndicatorSubCategory, IndicatorCategory, DynamicClassData,
  GradeReportData, DynamicGradeData, SchoolReportData
} from '../../src/types/moral';

// 日期范围选择器组件
interface DateRangePickerProps {
  value: { start: string; end: string };
  onChange: (value: { start: string; end: string }) => void;
}

export const DateRangePicker: React.FC<DateRangePickerProps> = ({ value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const pickerRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 快捷选项
  const quickOptions = [
    { label: '今天', getValue: () => {
      const today = getBeijingDate();
      return { start: today, end: today };
    }},
    { label: '昨天', getValue: () => {
      const yesterday = getBeijingDateOffset(-1);
      return { start: yesterday, end: yesterday };
    }},
    { label: '本周', getValue: () => {
      return getBeijingWeekRange();
    }},
    { label: '上一周', getValue: () => {
      return getBeijingLastWeekRange();
    }},
    { label: '本月', getValue: () => {
      return getBeijingMonthRange();
    }},
    { label: '上一月', getValue: () => {
      return getBeijingLastMonthRange();
    }},
  ];

  // 生成日历天数
  const generateDays = (year: number, month: number) => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDay = firstDay.getDay();
    
    const days: (number | null)[] = [];
    for (let i = 0; i < startingDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);
    return days;
  };

  // 获取两个月的数据
  const getTwoMonths = () => {
    const year1 = currentMonth.getFullYear();
    const month1 = currentMonth.getMonth();
    const year2 = month1 === 11 ? year1 + 1 : year1;
    const month2 = month1 === 11 ? 0 : month1 + 1;
    return [
      { year: year1, month: month1, label: `${year1}年${month1 + 1}月` },
      { year: year2, month: month2, label: `${year2}年${month2 + 1}月` }
    ];
  };

  const twoMonths = getTwoMonths();

  const handleDateClick = (year: number, month: number, day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (!value.start || (value.start && value.end)) {
      onChange({ start: dateStr, end: '' });
    } else {
      if (dateStr < value.start) {
        onChange({ start: dateStr, end: value.start });
      } else {
        onChange({ ...value, end: dateStr });
      }
    }
  };

  const isSelected = (year: number, month: number, day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return dateStr === value.start || dateStr === value.end;
  };

  const isInRange = (year: number, month: number, day: number) => {
    if (!value.start || !value.end) return false;
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return dateStr > value.start && dateStr < value.end;
  };

  const clearDates = () => {
    onChange({ start: '', end: '' });
  };

  return (
    <div className="space-y-1.5 lg:col-span-2" ref={pickerRef}>
      <label className="text-xs font-medium text-slate-500">时间范围</label>
      <div className="relative">
        {/* 输入框 */}
        <div 
          className="flex items-center border border-slate-300 rounded-lg bg-white cursor-pointer hover:border-blue-400 transition-colors"
          onClick={() => setIsOpen(!isOpen)}
        >
          <Calendar className="ml-3 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            readOnly
            className="flex-1 px-3 py-2 text-sm bg-transparent outline-none cursor-pointer"
            value={value.start || '开始日期'}
            placeholder="开始日期"
          />
          <span className="text-slate-400 text-sm">至</span>
          <input 
            type="text" 
            readOnly
            className="flex-1 px-3 py-2 text-sm bg-transparent outline-none cursor-pointer"
            value={value.end || '结束日期'}
            placeholder="结束日期"
          />
          {(value.start || value.end) && (
            <button 
              className="mr-2 p-1 hover:bg-slate-100 rounded"
              onClick={(e: React.MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); clearDates(); }}
            >
              <X className="w-4 h-4 text-slate-400" />
            </button>
          )}
        </div>

        {/* 下拉面板 */}
        {isOpen && (
          <div className="absolute top-full left-0 mt-2 bg-white border border-slate-200 rounded-lg shadow-xl z-50 flex">
            {/* 快捷选项 */}
            <div className="w-24 border-r border-slate-100 py-2">
              {quickOptions.map((opt) => (
                <button
                  key={opt.label}
                  className="w-full px-4 py-2 text-sm text-left text-slate-600 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                  onClick={() => {
                    onChange(opt.getValue());
                    setIsOpen(false);
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* 双月历 */}
            <div className="p-4">
              {/* 月份导航 */}
              <div className="flex items-center justify-between mb-4">
                <button 
                  className="p-1 hover:bg-slate-100 rounded"
                  onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
                >
                  <ChevronLeft className="w-5 h-5 text-slate-500" />
                </button>
                <div className="flex space-x-16">
                  {twoMonths.map((m, idx) => (
                    <span key={idx} className="text-sm font-medium text-slate-700">{m.label}</span>
                  ))}
                </div>
                <button 
                  className="p-1 hover:bg-slate-100 rounded"
                  onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
                >
                  <ChevronRight className="w-5 h-5 text-slate-500" />
                </button>
              </div>

              {/* 日历网格 */}
              <div className="flex space-x-8">
                {twoMonths.map((m, idx) => (
                  <div key={idx} className="w-64">
                    {/* 星期标题 */}
                    <div className="grid grid-cols-7 mb-2">
                      {['日', '一', '二', '三', '四', '五', '六'].map(day => (
                        <div key={day} className="text-center text-xs text-slate-400 py-1">{day}</div>
                      ))}
                    </div>
                    {/* 日期 */}
                    <div className="grid grid-cols-7 gap-1">
                      {generateDays(m.year, m.month).map((day, i) => (
                        <div key={i} className="aspect-square">
                          {day && (
                            <button
                              className={`w-full h-full text-sm rounded-full transition-colors ${
                                isSelected(m.year, m.month, day)
                                  ? 'bg-blue-500 text-white'
                                  : isInRange(m.year, m.month, day)
                                  ? 'bg-blue-50 text-blue-600'
                                  : 'text-slate-700 hover:bg-slate-100'
                              }`}
                              onClick={() => handleDateClick(m.year, m.month, day)}
                            >
                              {day}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
