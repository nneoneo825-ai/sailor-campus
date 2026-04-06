
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';

// 开发环境通过 VITE_API_BASE_URL 指向后端地址（如 http://localhost:8000）
// 生产环境由 Nginx 代理，可设为空字符串
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

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
