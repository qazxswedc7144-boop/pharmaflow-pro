// src/shared/network/idempotency.ts
import axios, { InternalAxiosRequestConfig } from "axios";
import { TokenProvider } from "@/services/auth/tokenProvider";

/**
 * Generates an RFC4122 compliant UUID v4 string.
 * Supports native crypto.randomUUID with high-performance pseudorandom fallback
 * for legacy container scopes and offline web views.
 */
export function generateIdempotencyKey(): string {
  if (typeof window !== "undefined" && window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Enterprise pre-configured Axios instance
 */
export const financialApiClient = axios.create({
  headers: {
    "Content-Type": "application/json"
  }
});

/**
 * Request Interceptor: Ensures state-mutating requests carry Idempotency-Key 
 * and auto-injects auth headers via Central Token Provider.
 */
financialApiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const isMutating = ["POST", "PUT", "DELETE", "PATCH"].includes(
      config.method?.toUpperCase() || ""
    );

    if (isMutating) {
      const existingKey = config.headers.get("Idempotency-Key") || config.headers["Idempotency-Key"];
      
      if (!existingKey) {
        const key = generateIdempotencyKey();
        config.headers.set("Idempotency-Key", key);
      }
    }
    
    // Auto-inject auth headers via Central Token Provider
    const authHeaders = TokenProvider.getAuthHeaders();
    if (authHeaders.Authorization && !config.headers.Authorization) {
      config.headers.set("Authorization", authHeaders.Authorization);
    }
    if (authHeaders['x-tenant-id'] && !config.headers.get('x-tenant-id')) {
      config.headers.set('x-tenant-id', authHeaders['x-tenant-id']);
    }
    if (authHeaders['x-branch-id'] && !config.headers.get('x-branch-id')) {
      config.headers.set('x-branch-id', authHeaders['x-branch-id']);
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * Response Interceptor: Single-flight token refresh retry handler for 401 responses.
 */
financialApiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const newAccessToken = await TokenProvider.refreshAccessToken();
        if (newAccessToken && originalRequest.headers) {
          originalRequest.headers.set('Authorization', `Bearer ${newAccessToken}`);
          return financialApiClient(originalRequest);
        }
      } catch (refreshErr) {
        return Promise.reject(refreshErr);
      }
    }
    return Promise.reject(error);
  }
);

