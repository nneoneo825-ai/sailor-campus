# TeachingManagement组件API对接实施指南

> **目标**: 将TeachingManagement组件从mock数据切换到真实API调用
> **优先级**: 🔴 高
> **预计时间**: 2-3小时

---

## 📋 概述

TeachingManagement组件目前完全使用硬编码的mock数据。需要将其对接到后端的以下API端点：

1. `GET /api/teaching/reports/personal` - 个人教学量化报表
2. `GET /api/teaching/reports/grade` - 年级教学量化报表
3. `GET /api/teaching/reports/school` - 校级教学量化报表
4. `GET /api/teaching/reports/provincial` - 省公司教学量化报表

---

## 🎯 实施步骤

### 步骤1：添加API调用框架（已部分完成）

已在 `TeachingManagement.tsx` 文件头部添加了 `api` 导入：
```typescript
import { api } from '../src/services/apiClient';
```

### 步骤2：定义TypeScript类型接口

在文件中添加以下类型定义（建议放在文件开头）：

```typescript
// API响应类型
interface PersonalTeachingReport {
  teacher: {
    id: number;
    name: string;
    group: string;
    classes: string[];
  };
  report_period: {
    start_date: string;
    end_date: string;
  };
  summary: {
    bonus_score: number;
    deduction_score: number;
    total_score: number;
    check_count: number;
    rank: number;
  };
  details: Array<{
    check_item: string;
    content: string;
    type: 'bonus' | 'deduction';
    score: number;
    time: string;
  }>;
  metrics: {
    design: number;
    quality: number;
    guide: number;
    exercise: number;
    process: number;
    selfStudy: number;
    marking: number;
    posting: number;
    progress: number;
    listening: number;
    tutoring: number;
    officeDisc: number;
    praise: number;
    hygiene: number;
    check: number;
    board: number;
    oral: number;
    team: number;
  };
}

interface GradeTeachingReport {
  grade_name: string;
  report_period: {
    start_date: string;
    end_date: string;
  };
  teachers: Array<{
    id: number;
    name: string;
    group: string;
    metrics: {
      design: number;
      quality: number;
      // ... 其他18项指标
      total_score: number;
      rank: number;
    };
  }>;
  subject_summary: Array<{
    subject: string;
    total_score: number;
    rank: number;
    teacher_count: number;
  }>;
}

interface SchoolTeachingReport {
  school_name: string;
  report_period: {
    start_date: string;
    end_date: string;
  };
  grades: Array<{
    grade_name: string;
    metrics: {
      design: number;
      quality: number;
      // ... 其他18项指标
      total_score: number;
      rank: number;
    };
  }>;
}

interface ProvincialTeachingReport {
  province_name: string;
  report_period: {
    start_date: string;
    end_date: string;
  };
  schools: Array<{
    school_name: string;
    metrics: {
      design: number;
      quality: number;
      // ... 其他18项指标
      total_score: number;
      rank: number;
    };
  }>;
}
```

### 步骤3：修改TeachingPersonalReport组件

找到 `TeachingPersonalReport` 组件定义，按照以下模式修改：

```typescript
const TeachingPersonalReport: React.FC = () => {
  const [view, setView] = useState<'summary' | 'detail'>('summary');
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<PersonalTeachingReport | null>(null);
  const [teacherId, setTeacherId] = useState<number>(123); // 默认教师ID
  const [startDate, setStartDate] = useState('2026-01-01');
  const [endDate, setEndDate] = useState('2026-01-31');

  // 添加useEffect加载数据
  useEffect(() => {
    const loadPersonalReport = async () => {
      try {
        setLoading(true);
        const response = await api.get<PersonalTeachingReport>('/api/teaching/reports/personal', {
          params: {
            teacher_id: teacherId,
            start_date: startDate,
            end_date: endDate
          }
        });
        setReport(response);
      } catch (error) {
        console.error('Failed to load personal report:', error);
        // Fallback到mock数据（可选）
      } finally {
        setLoading(false);
      }
    };

    loadPersonalReport();
  }, [teacherId, startDate, endDate]);

  if (loading) {
    return <div className="text-center py-8">加载中...</div>;
  }

  if (!report) {
    return <div className="text-center py-8 text-red-500">加载数据失败</div>;
  }

  // 视图切换逻辑保持不变
  if (view === 'detail') {
    // 详情视图，使用 report.details
    return (
      <div className="space-y-6">
        {/* ... 现有的详情视图UI ... */}
        <table className="...">
          <tbody>
            {report.details.map((record, index) => (
              <tr key={index}>
                <td>{record.check_item}</td>
                <td>{record.content}</td>
                <td>{record.type === 'bonus' ? '加分' : '减分'}</td>
                <td>{record.score}</td>
                <td>{record.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // 摘要视图，使用 report.summary 和 report.metrics
  return (
    <div className="space-y-6">
      {/* ... 现有的摘要视图UI ... */}
      {/* 使用真实数据 */}
      <h2>{report.teacher.name} 教师个人量化考核报表</h2>

      {/* 摘要卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-green-50 border border-green-100 p-4 rounded-xl flex flex-col items-center justify-center">
          <span className="text-sm text-green-700 mb-1">加分项</span>
          <span className="text-2xl font-bold text-green-600">+{report.summary.bonus_score}</span>
        </div>
        <div className="bg-red-50 border border-red-100 p-4 rounded-xl flex flex-col items-center justify-center">
          <span className="text-sm text-red-700 mb-1">扣分项</span>
          <span className="text-2xl font-bold text-red-600">{report.summary.deduction_score}</span>
        </div>
        <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl flex flex-col items-center justify-center">
          <span className="text-sm text-blue-700 mb-1">检查项目</span>
          <span className="text-2xl font-bold text-blue-600">{report.summary.check_count}</span>
        </div>
        <div className="bg-purple-50 border border-purple-100 p-4 rounded-xl flex flex-col items-center justify-center">
          <span className="text-sm text-purple-700 mb-1">排名</span>
          <span className="text-2xl font-bold text-purple-600">{report.summary.rank}</span>
        </div>
      </div>

      {/* 详细评分列表 - 使用PERSONAL_DETAIL_DATA的格式，但数据来自API */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* ... */}
      </div>

      {/* 查询过滤器 */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center space-x-2">
          <select
            value={teacherId}
            onChange={(e) => setTeacherId(parseInt(e.target.value))}
            className="text-sm border-slate-300 rounded"
          >
            <option value={123}>白少桐</option>
            <option value={124}>翟佳晴</option>
            {/* ... 其他教师选项 ... */}
          </select>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
          <button
            onClick={() => {/* 触发重新加载 */}}
            className="px-4 py-2 bg-blue-600 text-white rounded"
          >
            查询
          </button>
        </div>
      </div>
    </div>
  );
};
```

### 步骤4：修改TeachingGradeReport组件

类似地修改 `TeachingGradeReport` 组件：

```typescript
const TeachingGradeReport: React.FC = () => {
  const [view, setView] = useState<'summary' | 'detail'>('summary');
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<GradeTeachingReport | null>(null);
  const [gradeId, setGradeId] = useState<number>(1); // 默认年级ID
  const [startDate, setStartDate] = useState('2026-01-01');
  const [endDate, setEndDate] = useState('2026-01-31');

  useEffect(() => {
    const loadGradeReport = async () => {
      try {
        setLoading(true);
        const response = await api.get<GradeTeachingReport>('/api/teaching/reports/grade', {
          params: {
            grade_id: gradeId,
            start_date: startDate,
            end_date: endDate
          }
        });
        setReport(response);
      } catch (error) {
        console.error('Failed to load grade report:', error);
      } finally {
        setLoading(false);
      }
    };

    loadGradeReport();
  }, [gradeId, startDate, endDate]);

  if (loading) {
    return <div className="text-center py-8">加载中...</div>;
  }

  if (!report) {
    return <div className="text-center py-8 text-red-500">加载数据失败</div>;
  }

  // 使用 report.teachers 和 report.subject_summary 渲染UI
  // ... 类似TeachingPersonalReport的模式
};
```

### 步骤5：修改TeachingSchoolReport组件

```typescript
const TeachingSchoolReport: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<SchoolTeachingReport | null>(null);
  const [schoolId, setSchoolId] = useState<number>(1);
  const [startDate, setStartDate] = useState('2026-01-01');
  const [endDate, setEndDate] = useState('2026-01-31');

  useEffect(() => {
    const loadSchoolReport = async () => {
      try {
        setLoading(true);
        const response = await api.get<SchoolTeachingReport>('/api/teaching/reports/school', {
          params: {
            school_id: schoolId,
            start_date: startDate,
            end_date: endDate
          }
        });
        setReport(response);
      } catch (error) {
        console.error('Failed to load school report:', error);
      } finally {
        setLoading(false);
      }
    };

    loadSchoolReport();
  }, [schoolId, startDate, endDate]);

  // 使用 report.grades 渲染UI
};
```

### 步骤6：修改TeachingProvincialReport组件

```typescript
const TeachingProvincialReport: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<ProvincialTeachingReport | null>(null);
  const [startDate, setStartDate] = useState('2026-01-01');
  const [endDate, setEndDate] = useState('2026-01-31');

  useEffect(() => {
    const loadProvincialReport = async () => {
      try {
        setLoading(true);
        const response = await api.get<ProvincialTeachingReport>('/api/teaching/reports/provincial', {
          params: {
            start_date: startDate,
            end_date: endDate
          }
        });
        setReport(response);
      } catch (error) {
        console.error('Failed to load provincial report:', error);
      } finally {
        setLoading(false);
      }
    };

    loadProvincialReport();
  }, [startDate, endDate]);

  // 使用 report.schools 渲染UI
};
```

---

## ⚠️ 注意事项

1. **保持UI不变**: 只替换数据源，不改变现有的HTML结构和CSS类名
2. **API响应格式**: 后端API返回的格式可能与mock数据略有不同，需要适配
3. **错误处理**: 所有API调用都应该有try-catch和fallback处理
4. **Loading状态**: 添加loading提示，提升用户体验
5. **数据为空处理**: 当API返回空数据时，显示友好的提示

---

## 🧪 测试清单

完成修改后，进行以下测试：

- [ ] 启动后端服务 `python -m uvicorn main:app --reload`
- [ ] 启动前端服务 `npm run dev`
- [ ] 访问 http://localhost:5173/teaching
- [ ] 检查个人报表是否正确加载
- [ ] 检查年级报表是否正确加载
- [ ] 检查校级报表是否正确加载
- [ ] 检查省公司报表是否正确加载
- [ ] 测试教师筛选功能
- [ ] 测试年级筛选功能
- [ ] 测试日期范围查询
- [ ] 测试详情视图切换
- [ ] 检查浏览器控制台是否有错误

---

## 📚 参考文档

- [API接口规范](./api-specs.md) - 完整的API文档
- [后端API代码](../backend/app/routes/teaching.py) - API实现细节
- [任务1.2状态报告](./TASK_1_2_STATUS.md) - 整体进度

---

## 🚀 快速开始

如果您想开始实施这个任务：

1. 备份当前的 `TeachingManagement.tsx` 文件
2. 按照上述步骤逐步修改每个子组件
3. 每完成一个子组件就测试一次
4. 完成后运行测试清单验证功能

**预计完成时间**: 2-3小时
**难度**: 中等
**优先级**: 高

---

**文档创建时间**: 2026-01-28
**适用组件**: TeachingManagement
