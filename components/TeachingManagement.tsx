/**
 * 教学评价管理 - 主页面（按权限分 Tab：个人/年级/校级/全区报表）
 * 报表组件已拆分至 components/teaching/ 目录
 */
import React, { useState } from 'react';
import { hasPermission } from '../src/utils/permission';
import { TeachingPersonalReport } from './teaching/TeachingPersonalReport';
import { TeachingGradeReport } from './teaching/TeachingGradeReport';
import { TeachingSchoolReport } from './teaching/TeachingSchoolReport';
import { TeachingProvincialReport } from './teaching/TeachingProvincialReport';

const TeachingManagement: React.FC = () => {
  // 根据权限确定默认显示的Tab
  const getDefaultTab = (): 'personal' | 'grade' | 'school' | 'provincial' => {
    if (hasPermission('teaching:personal')) return 'personal';
    if (hasPermission('teaching:grade')) return 'grade';
    if (hasPermission('teaching:school')) return 'school';
    if (hasPermission('teaching:provincial')) return 'provincial';
    return 'personal'; // 默认
  };
  
  const [activeTab, setActiveTab] = useState<'personal' | 'grade' | 'school' | 'provincial'>(getDefaultTab());

  const renderTabButton = (id: typeof activeTab, label: string) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
        activeTab === id
          ? 'border-blue-600 text-blue-600'
          : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">教学评价管理 (Teaching Evaluation)</h1>
          <p className="text-slate-500 mt-1">教师教学质量综合评估报表。</p>
        </div>
      </div>

       {/* Tab Navigation */}
      <div className="border-b border-slate-200 bg-white rounded-t-xl px-2 shadow-sm overflow-x-auto">
        <div className="flex space-x-2">
          {hasPermission('teaching:personal') && renderTabButton('personal', '个人报表')}
          {hasPermission('teaching:grade') && renderTabButton('grade', '年级报表')}
          {hasPermission('teaching:school') && renderTabButton('school', '校级报表')}
          {hasPermission('teaching:provincial') && renderTabButton('provincial', '学区报表')}
        </div>
      </div>

      {/* Content */}
      <div className="min-h-[500px]">
        {hasPermission('teaching:personal') && activeTab === 'personal' && <TeachingPersonalReport />}
        {hasPermission('teaching:grade') && activeTab === 'grade' && <TeachingGradeReport />}
        {hasPermission('teaching:school') && activeTab === 'school' && <TeachingSchoolReport />}
        {hasPermission('teaching:provincial') && activeTab === 'provincial' && <TeachingProvincialReport />}
      </div>
    </div>
  );
};

// 筛选选项类型

// 学校教师API响应类型

// 教师详情类型

export default TeachingManagement;
