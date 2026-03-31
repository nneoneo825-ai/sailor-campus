
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';

// 环境变量配置，生产环境地址通常在 .env 文件中配置
// VITE_API_BASE_URL=http://localhost:8000
// Type assertion used to avoid TS error when vite types are not loaded
// 注意：前端代码中所有API路径已包含/api/前缀，baseURL应为空或/，由Nginx代理到后端
export const API_BASE_URL = '';

class ApiClient {
  private instance: AxiosInstance;

  constructor() {
    this.instance = axios.create({
      baseURL: API_BASE_URL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // 请求拦截器：自动附加 Token
    this.instance.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('auth_token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // 响应拦截器：统一错误处理
    this.instance.interceptors.response.use(
      (response) => response.data,
      (error) => {
        if (error.response) {
          switch (error.response.status) {
            case 401:
              // Token 过期，跳转登录
              localStorage.removeItem('auth_token');
              window.location.href = '/login';
              break;
            case 403:
              console.error('权限不足');
              break;
            case 500:
              console.error('服务器内部错误');
              break;
            default:
              console.error('网络请求错误', error.message);
          }
        }
        return Promise.reject(error);
      }
    );
  }

  public get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return this.instance.get(url, config);
  }

  public post<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    return this.instance.post(url, data, config);
  }

  public put<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    return this.instance.put(url, data, config);
  }

  public delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return this.instance.delete(url, config);
  }
}

export const api = new ApiClient();
