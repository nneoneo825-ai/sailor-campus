
import React from 'react';

export enum Role {
  ADMIN = '管理员',
  PRINCIPAL = '校长',
  TEACHER = '教师',
  STUDENT = '学生',
  MORAL_OFFICER = '德育干事', // Added for specialized role
}

export interface User {
  id: string;
  name: string;
  username?: string;
  role: Role;
  avatar: string;
  orgId?: string; // Linked to sys_org
  orgName?: string;
}

export interface StatCardProps {
  title: string;
  value: string | number;
  trend?: string;
  trendUp?: boolean;
  icon: React.ReactNode;
}

// Updated to match base_student table structure
export interface Student {
  id: string; // Student ID (学号)
  name: string;
  gender: '男' | '女';
  school: string;
  grade: string;
  class: string;
  classId?: string; // DB ID
  building?: string;
  floor?: number;
  dorm?: string;
  bedNo?: number;
  createTime?: string;
  score: number;
  status?: 'active' | 'graduated' | 'suspended';
}

export interface Teacher {
  id: string;
  name: string;
  gender: '男' | '女';
  school: string;
  grade: string; // Display string
  title: string;
  subject: string;
  phone: string;
  rating: number;
}

export interface MenuLink {
  label: string;
  path: string;
  icon: React.ElementType;
}

// Updated for Moral Evaluation Indicators (cfg_moral_indicator)
export interface MoralIndicator {
  id: string;
  majorCategory: string;
  minorCategory: string;
  name: string;
  type: 'bonus' | 'deduction';
  score: number;
  enabled: boolean;
}

// New Interface for Data Collection Records (biz_moral_record)
export interface MoralRecord {
  id: number;
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
  ruleId: string;
  ruleName: string;
  scoreChange: number;
  description?: string;
  evidenceImgs?: string[]; // URLs
  location?: {
    lat: number;
    lng: number;
    name: string;
  };
  recorderName: string;
  recordTime: string;
  source: 'web' | 'miniprogram';
}
