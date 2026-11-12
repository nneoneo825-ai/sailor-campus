/**
 * 学校管理 - 主页面（校区/班级/教师/学生四个 Tab）
 * 子组件已拆分至 components/school/ 目录
 */
import React, { useState } from 'react';
import { SchoolList } from './school/SchoolList';
import { ClassList } from './school/ClassList';
import { TeacherList } from './school/TeacherList';
import { StudentList } from './school/StudentList';

const SchoolManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'校区管理' | '班级管理' | '教师管理' | '学生管理'>('校区管理');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-6">
       <div className="flex flex-col md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">学校管理 (School Management)</h1>
          <p className="text-slate-500 mt-1">管理校区、年级、班级、教师及学生档案。</p>
        </div>
      </div>
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-2 rounded-md">
          {error}
        </div>
      )}

       {/* Tabs */}
      <div className="border-b border-slate-200 bg-white rounded-t-xl px-2 shadow-sm overflow-x-auto">
        <div className="flex space-x-2">
            {(['校区管理', '班级管理', '教师管理', '学生管理'] as const).map((tab) => (
                <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === tab
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
                >
                {tab}
                </button>
            ))}
        </div>
      </div>

      <div className="min-h-[500px]">
           {activeTab === '校区管理' && <SchoolList />}
           {activeTab === '学生管理' && <StudentList />}
           {activeTab === '班级管理' && <ClassList />}
           {activeTab === '教师管理' && <TeacherList />}
      </div>
    </div>
  );
};

export default SchoolManagement;
