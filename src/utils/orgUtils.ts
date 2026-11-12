/**
 * 组织架构相关工具函数
 */

// 从组织树中提取学校列表
export function extractSchools(orgTree: any[]): { id: number; name: string }[] {
  const schools: { id: number; name: string }[] = [];

  orgTree.forEach((group: any) => {
    if (group.children) {
      group.children.forEach((school: any) => {
        if (school.type === 'school') {
          schools.push({ id: school.id, name: school.name });
        }
      });
    }
  });

  return schools;
}
