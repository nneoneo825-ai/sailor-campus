import pandas as pd
import glob
import os

# 获取所有匹配的文件名 (请确保文件名与您上传的一致)
file_pattern = "学生导出数据*.xls"
files = glob.glob(file_pattern)

if not files:
    print("未找到匹配的文件，请检查文件名。")
else:
    df_list = []
    
    # 读取并合并所有文件的所有sheet
    for file in files:
        try:
            # 读取Excel文件的所有sheet (sheet_name=None 返回字典)
            sheets_dict = pd.read_excel(file, sheet_name=None)
            for sheet_name, df in sheets_dict.items():
                df_list.append(df)
                print(f"成功读取: {file} - {sheet_name} ({len(df)} 行)")
        except Exception as e:
            print(f"读取 {file} 时出错: {e}")

    if df_list:
        # 合并所有DataFrame
        merged_df = pd.concat(df_list, ignore_index=True)
        
        # 保存为新的Excel文件
        output_filename = "merged_students.xlsx"
        merged_df.to_excel(output_filename, index=False)
        print(f"合并完成！文件已保存为: {output_filename}")
        print(f"总行数: {len(merged_df)}")
    else:
        print("没有成功读取到任何数据。")