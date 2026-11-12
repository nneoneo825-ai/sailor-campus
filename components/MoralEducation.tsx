/**
 * 德育量化管理 - 主页面（按权限分 Tab：班级/年级/校级/宿舍/学区报表）
 * 报表组件已拆分至 components/moral/ 目录
 */
import React, { useState } from 'react';
import { hasPermission } from '../src/utils/permission';
import { ClassReport } from './moral/ClassReport';
import { GradeReport } from './moral/GradeReport';
import { SchoolReport } from './moral/SchoolReport';
import { DormReport } from './moral/DormReport';
import { DistrictReport } from './moral/DistrictReport';




// 宿舍报表数据类型


// --- Components ---

const MoralEducation: React.FC = () => {
  // 根据权限确定默认显示的Tab
  const getDefaultTab = (): 'class' | 'grade' | 'school' | 'dorm' | 'district' => {
    if (hasPermission('moral:class')) return 'class';
    if (hasPermission('moral:grade')) return 'grade';
    if (hasPermission('moral:school')) return 'school';
    if (hasPermission('moral:dorm')) return 'dorm';
    if (hasPermission('moral:district')) return 'district';
    return 'class'; // 默认
  };
  
  const [activeTab, setActiveTab] = useState<'class' | 'grade' | 'school' | 'dorm' | 'district'>(getDefaultTab());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          <h1 className="text-2xl font-bold text-slate-900">德育量化管理 (Moral Education)</h1>
          <p className="text-slate-500 mt-1">多维度德育评价报表与分析。</p>
        </div>
      </div>
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-2 rounded-md">
          {error}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="border-b border-slate-200 bg-white rounded-t-xl px-2 shadow-sm overflow-x-auto">
        <div className="flex space-x-2">
          {hasPermission('moral:class') && renderTabButton('class', '班级报表')}
          {hasPermission('moral:grade') && renderTabButton('grade', '年级报表')}
          {hasPermission('moral:school') && renderTabButton('school', '校级报表')}
          {hasPermission('moral:dorm') && renderTabButton('dorm', '宿舍报表')}
          {hasPermission('moral:district') && renderTabButton('district', '学区报表')}
        </div>
      </div>

      {/* Content Area */}
      <div className="min-h-[500px]">
        {hasPermission('moral:class') && activeTab === 'class' && <ClassReport />}
        {hasPermission('moral:grade') && activeTab === 'grade' && <GradeReport />}
        {hasPermission('moral:school') && activeTab === 'school' && <SchoolReport />}
        {hasPermission('moral:dorm') && activeTab === 'dorm' && <DormReport />}
        {hasPermission('moral:district') && activeTab === 'district' && <DistrictReport />}
      </div>
    </div>
  );
};

// ... existing code for ClassReport, GradeReport, SchoolReport, DormReport ...
// 班级报表数据接口

// 筛选选项接口

export default MoralEducation;
