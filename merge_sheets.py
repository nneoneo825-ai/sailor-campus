"""
将一个或多个 Excel 文件中的所有 sheet 数据汇总到一个 sheet 中。
用法:
  python merge_sheets.py <file1> [file2] ... [fileN] [-o output_file]

示例:
  python merge_sheets.py "数据1.xls" "数据2.xlsx" -o 汇总结果.xlsx
  python merge_sheets.py *.xls
"""

import sys
import os
import glob


def merge_sheets(input_files, output_file="汇总结果.xlsx"):
    """将多个 Excel 文件中所有 sheet 的数据汇总到一个 sheet 中。"""
    try:
        import pandas as pd
    except ImportError:
        print("正在安装 pandas 和 openpyxl...")
        os.system(f"{sys.executable} -m pip install pandas openpyxl xlrd -q")
        import pandas as pd

    # 确保输出路径为绝对路径
    if not os.path.isabs(output_file):
        script_dir = os.path.dirname(os.path.abspath(__file__))
        output_file = os.path.join(script_dir, output_file)

    all_data = []

    for file_path in input_files:
        file_path = os.path.abspath(file_path)
        if not os.path.exists(file_path):
            print(f"  跳过(不存在): {file_path}")
            continue

        xl = pd.ExcelFile(file_path)
        print(f"\n文件: {file_path}")
        print(f"  共 {len(xl.sheet_names)} 个 sheet: {xl.sheet_names}")

        for sheet_name in xl.sheet_names:
            df = pd.read_excel(file_path, sheet_name=sheet_name)
            if df.empty:
                print(f"  Sheet [{sheet_name}]: 空数据, 跳过")
                continue
            # 添加来源信息
            df.insert(0, "来源文件", os.path.basename(file_path))
            df.insert(1, "来源Sheet", sheet_name)
            all_data.append(df)
            print(f"  Sheet [{sheet_name}]: {len(df)} 行, {len(df.columns)} 列")

    if not all_data:
        print("\n没有找到任何数据！")
        sys.exit(1)

    # 合并所有数据（不同 sheet 的列名可能不同，缺失列填充为空）
    merged = pd.concat(all_data, ignore_index=True)

    # 写入输出文件
    merged.to_excel(output_file, sheet_name="汇总", index=False, engine="openpyxl")

    # 验证文件是否写入成功
    if not os.path.exists(output_file):
        print(f"\n错误: 文件写入失败 - {output_file}")
        sys.exit(1)

    file_size = os.path.getsize(output_file)
    print("\n" + "=" * 60)
    print(f"汇总完成!")
    print(f"  处理文件: {len(input_files)} 个")
    print(f"  合并数据: {len(merged)} 行, {len(merged.columns)} 列")
    print(f"  输出文件: {output_file}")
    print(f"  文件大小: {file_size / 1024:.1f} KB")


if __name__ == "__main__":
    SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

    args = sys.argv[1:]

    if not args:
        # 无参数时：自动查找脚本所在目录下所有 xls/xlsx 文件
        found = glob.glob(os.path.join(SCRIPT_DIR, "*.xls")) + glob.glob(os.path.join(SCRIPT_DIR, "*.xlsx"))
        input_files = [f for f in found if "汇总" not in f]
        output_file = os.path.join(SCRIPT_DIR, "汇总结果.xlsx")
        if not input_files:
            print("当前目录下未找到 xls/xlsx 文件")
            sys.exit(1)
    else:
        # 解析参数：提取输出文件
        output_file = None
        input_files = []
        i = 0
        while i < len(args):
            if args[i] == "-o" and i + 1 < len(args):
                output_file = args[i + 1]
                i += 2
            else:
                expanded = glob.glob(args[i])
                if expanded:
                    input_files.extend(expanded)
                else:
                    input_files.append(args[i])
                i += 1

        if not input_files:
            print("错误: 未指定输入文件")
            sys.exit(1)

        if output_file is None:
            output_file = os.path.join(SCRIPT_DIR, "汇总结果.xlsx")
        elif not os.path.isabs(output_file):
            output_file = os.path.join(SCRIPT_DIR, output_file)

    merge_sheets(input_files, output_file)
