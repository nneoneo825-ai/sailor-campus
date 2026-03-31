
import React, { useState, useEffect } from 'react';
import {
  Users,
  GraduationCap,
  BookOpen,
  TrendingUp
} from 'lucide-react';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';
import { StatCardProps } from '../types';
import { api } from '../src/services/apiClient';

interface DashboardStats {
  total_students: number;
  total_teachers: number;
  weekly_moral_avg_score: number;
  weekly_teaching_avg_score: number;
  five_education_scores: {
    moral: number;
    intellect: number;
    physical: number;
    artistic: number;
    labor: number;
  };
  weekly_trend: Array<{
    day: string;
    moral_score: number;
    teaching_score: number;
  }>;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon }) => (
  <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-100 transition-all hover:shadow-md">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <p className="mt-2 text-3xl font-bold text-slate-800">{value}</p>
      </div>
      <div className="rounded-full p-3 bg-blue-50 text-blue-600">
        {icon}
      </div>
    </div>
  </div>
);

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        setLoading(true);
        setError(null);
        // 使用新的analytics API
        const response = await api.get('/api/analytics/dashboard');
        setStats(response);
      } catch (err: any) {
        console.error('Failed to load dashboard data:', err);
        setError(err.response?.data?.detail || err.message || '加载数据失败');
        setStats(null);
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">数据概览 (Dashboard)</h1>
            <p className="text-slate-500 mt-1">加载中...</p>
          </div>
        </div>
        <div className="animate-pulse">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="rounded-xl bg-white p-6 shadow-sm border border-slate-100">
                <div className="animate-pulse">
                  <div className="h-4 bg-slate-200 rounded w-3/4 mb-2"></div>
                  <div className="h-8 bg-slate-200 rounded w-1/2"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">数据概览 (Dashboard)</h1>
            <p className="text-slate-500 mt-1">欢迎回来，今日校园五育评价数据已更新。</p>
          </div>
        </div>
        <div className="rounded-xl bg-white p-8 shadow-sm border border-slate-200 text-center">
          <div className="text-6xl mb-4">📊</div>
          <h3 className="text-lg font-medium text-slate-900 mb-2">暂无数据</h3>
          <p className="text-slate-500 mb-4">{error || 'Dashboard 数据加载失败，请稍后重试'}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
          >
            刷新页面
          </button>
        </div>
      </div>
    );
  }

  // Prepare chart data
  const radarData = [
    { subject: '德育 (Moral)', A: 100, B: stats.five_education_scores.moral, fullMark: 100 },
    { subject: '智育 (Intellect)', A: 100, B: stats.five_education_scores.intellect, fullMark: 100 },
    { subject: '体育 (Physical)', A: 100, B: stats.five_education_scores.physical, fullMark: 100 },
    { subject: '美育 (Artistic)', A: 100, B: stats.five_education_scores.artistic, fullMark: 100 },
    { subject: '劳育 (Labor)', A: 100, B: stats.five_education_scores.labor, fullMark: 100 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">数据概览 (Dashboard)</h1>
          <p className="text-slate-500 mt-1">欢迎回来，今日校园五育评价数据已更新。</p>
        </div>
        <div className="mt-4 md:mt-0">
            <span className="inline-flex items-center rounded-md bg-green-50 px-3 py-1 text-sm font-medium text-green-700 border border-green-200">
               🟢 系统运行正常
            </span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="在校学生总数"
          value={stats.total_students.toLocaleString()}
          icon={<Users size={24} />}
        />
        <StatCard
          title="教职工人数"
          value={stats.total_teachers.toString()}
          icon={<GraduationCap size={24} />}
        />
        <StatCard
          title="本周德育平均分"
          value={stats.weekly_moral_avg_score.toString()}
          icon={<TrendingUp size={24} />}
        />
        <StatCard
          title="本周教学平均分"
          value={stats.weekly_teaching_avg_score.toString()}
          icon={<BookOpen size={24} />}
        />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Radar Chart for 5-Domain Evaluation */}
        <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-100">
          <h3 className="text-lg font-bold text-slate-800 mb-4">全校五育综合评价 (Five-Education)</h3>
          <div className="h-80 w-full min-w-[300px]">
            <ResponsiveContainer width="100%" height="100%" minWidth={300} minHeight={300}>
              <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 12 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                <Radar
                  name="校平均分"
                  dataKey="B"
                  stroke="#3b82f6"
                  strokeWidth={3}
                  fill="#3b82f6"
                  fillOpacity={0.4}
                />
                <Tooltip />
                <Legend />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Line/Bar Chart for Trends */}
        <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-100">
          <h3 className="text-lg font-bold text-slate-800 mb-4">本周德育与教学评分趋势</h3>
          <div className="h-80 w-full min-w-[300px]">
            <ResponsiveContainer width="100%" height="100%" minWidth={300} minHeight={300}>
              <BarChart data={stats.weekly_trend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} domain={[80, 100]} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                  cursor={{ fill: '#f8fafc' }}
                />
                <Legend iconType="circle" />
                <Bar dataKey="moral_score" name="德育评分" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={30} />
                <Bar dataKey="teaching_score" name="教学评分" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={30} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
