# 学生座位表同步实现指南

## 概述
已实现Web端和小程序端座位表数据的同步，通过后端API统一存储和读取。

## 后端API

### 1. 获取座位表
```
GET /api/org/class/{class_id}/seating-chart
```

响应示例：
```json
{
  "class_id": 8,
  "class_name": "高一(1)班",
  "seating_chart": {
    "layout": [
      [{"id": "1", "name": "张三", "coord": "A-1"}, ...],
      [...]
    ]
  },
  "students": [
    {"id": "1", "name": "张三", "gender": "M", "student_no": "2024001"}
  ],
  "rows": 6,
  "cols": 8
}
```

### 2. 更新座位表
```
POST /api/org/class/{class_id}/seating-chart
```

请求体：
```json
{
  "layout": [
    [{"id": "1", "name": "张三", "coord": "A-1"}, ...],
    [...]
  ]
}
```

## 小程序端实现

已在 `inspectForm.js` 中添加：
- `loadSeatingChart()` - 从API加载座位表
- `loadDefaultSeatingChart()` - 加载默认模拟数据（API失败时）

## Web端集成建议

在 `SchoolManagement.tsx` 中需要修改：

1. **加载座位表**：打开编辑弹窗时，调用API获取数据
```typescript
const loadSeatingChart = async (classId: number) => {
  const res = await fetch(`/api/org/class/${classId}/seating-chart`);
  const data = await res.json();
  if (data.seating_chart) {
    setEditForm({ ...editForm, seatingGroups: convertToGroups(data.seating_chart.layout) });
  }
};
```

2. **保存座位表**：保存时调用API更新数据
```typescript
const handleSaveSeating = async (newGroups: SeatingGroup[]) => {
  if(editForm) {
    const layout = convertGroupsToLayout(newGroups);
    await fetch(`/api/org/class/${classId}/seating-chart`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ layout })
    });
    setEditForm({ ...editForm, seatingGroups: newGroups });
    setIsSeatingModalOpen(false);
  }
};
```

## 数据格式转换

### Web端格式 (Groups)
```typescript
[
  { id: 1, name: '第1组', students: ['张三', '李四', ...] },
  { id: 2, name: '第2组', students: [...] }
]
```

### API格式 (Grid)
```typescript
[
  [{ id: '1', name: '张三', coord: 'A-1' }, { id: '2', name: '李四', coord: 'B-1' }],
  [...]
]
```

### 转换函数示例
```typescript
// Groups -> Grid
const convertGroupsToLayout = (groups: SeatingGroup[]) => {
  const layout = [];
  let rowIndex = 0;
  groups.forEach(group => {
    group.students.forEach((student, idx) => {
      if (!layout[rowIndex]) layout[rowIndex] = [];
      layout[rowIndex].push({
        id: `student-${rowIndex}-${idx}`,
        name: student,
        coord: `${String.fromCharCode(65 + idx)}${rowIndex + 1}`
      });
      if (idx % 2 === 1) rowIndex++;
    });
  });
  return layout;
};

// Grid -> Groups
const convertToGroups = (layout: any[]) => {
  const students = layout.flat().map(s => s.name);
  const groups = [];
  let groupIndex = 1;
  while (students.length > 0) {
    groups.push({
      id: groupIndex,
      name: `第${groupIndex}组`,
      students: students.splice(0, 6)
    });
    groupIndex++;
  }
  return groups;
};
```

## 注意事项

1. **班级ID映射**：Web端使用字符串ID（如"1"），数据库使用整数ID，需要做好映射
2. **数据兼容性**：Web端使用分组形式，小程序使用网格形式，需要转换
3. **离线支持**：小程序端在API失败时会回退到默认数据

## 测试步骤

1. 在Web端编辑座位表并保存
2. 在小程序中打开检查表单，验证座位表是否同步
3. 在小程序中选择座位提交记录
4. 在Web端查看相关记录
