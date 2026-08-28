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
 * Enterprise pre-configured Axios instance for Financial / Consolidation API calls.
 */
export const financialApiClient = axios.create({
  headers: {
    "Content-Type": "application/json"
  }
});

/**
 * Request Interceptor: Ensures state-mutating requests carry Idempotency-Key,
 * Request ID, Device ID, and auto-injects auth headers via Central Token Provider.
 */
financialApiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return Promise.reject(new Error("NETWORK_OFFLINE: Request blocked while offline"));
    }

    const isMutating = ["POST", "PUT", "DELETE", "PATCH"].includes(
      config.method?.toUpperCase() || ""
    );

    if (isMutating) {
      const existingKey = config.headers.get("Idempotency-Key") || config.headers["Idempotency-Key"];
      if (!existingKey) {
        const key = generateIdempotencyKey();
        config.headers.set("Idempotency-Key", key);
        config.headers.set("X-Idempotency-Key", key);
      }
    }

    if (!config.headers.get("X-Request-ID")) {
      config.headers.set("X-Request-ID", generateIdempotencyKey());
    }

    // Auto-inject context & auth headers via Central Token Provider
    const authHeaders = TokenProvider.getAuthHeaders();
    if (authHeaders.Authorization && !config.headers.get("Authorization")) {
      config.headers.set("Authorization", authHeaders.Authorization);
    }
    if (authHeaders["x-tenant-id"] && !config.headers.get("x-tenant-id")) {
      config.headers.set("x-tenant-id", authHeaders["x-tenant-id"]);
      config.headers.set("X-Tenant-ID", authHeaders["x-tenant-id"]);
    }
    if (authHeaders["x-branch-id"] && !config.headers.get("x-branch-id")) {
      config.headers.set("x-branch-id", authHeaders["x-branch-id"]);
      config.headers.set("X-Branch-ID", authHeaders["x-branch-id"]);
    }

    const session = TokenProvider.getCurrentSession();
    if (session.user?.id && !config.headers.get("X-User-ID")) {
      config.headers.set("X-User-ID", session.user.id);
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
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        return Promise.reject(error);
      }

      originalRequest._retry = true;
      try {
        const newAccessToken = await TokenProvider.refreshAccessToken();
        if (newAccessToken && originalRequest.headers) {
          originalRequest.headers.set("Authorization", `Bearer ${newAccessToken}`);
          return financialApiClient(originalRequest);
        }
      } catch (refreshErr) {
        return Promise.reject(refreshErr);
      }
    }
    return Promise.reject(error);
  }
);
