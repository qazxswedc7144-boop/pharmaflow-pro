// packages/sync-engine/src/transport/httpTransport.ts
import { TokenProvider } from "../../../../src/services/auth/tokenProvider";

export interface RequestConfig extends RequestInit {
  timeoutMs?: number;
  retries?: number;
  idempotencyKey?: string;
  deviceId?: string;
}

export class HttpTransport {
  private static clientVersion = "1.0.0-phase3";

  /**
   * Helper to fetch authenticated headers via Central Token Provider
   */
  private static getAuthHeaders(): Record<string, string> {
    try {
      return TokenProvider.getAuthHeaders() as Record<string, string>;
    } catch {
      if (typeof localStorage === "undefined") return {};
      const token = localStorage.getItem("pharmaflow_token") || localStorage.getItem("accessToken");
      return token ? { Authorization: `Bearer ${token}` } : {};
    }
  }

  /**
   * Safe, retryable, timed HTTP request wrapper.
   */
  public static async request<T = unknown>(url: string, config: RequestConfig = {}): Promise<T> {
    const { 
      timeoutMs = 15000, 
      retries = 3, 
      idempotencyKey, 
      deviceId = "PHARMAFLOW-DEVICE-MAIN", 
      headers = {}, 
      ...rest 
    } = config;

    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);

    // Merge standard enterprise headers via Central Token Provider
    const reqHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "x-client-version": this.clientVersion,
      "x-device-id": deviceId,
      ...this.getAuthHeaders(),
      ...Object.fromEntries(Object.entries(headers)) as Record<string, string>
    };

    if (idempotencyKey) {
      reqHeaders["x-idempotency-key"] = idempotencyKey;
    }

    let attempt = 0;
    while (attempt <= retries) {
      try {
        const response = await fetch(url, {
          ...rest,
          headers: reqHeaders,
          signal: controller.signal
        });

        clearTimeout(id);

        if (!response.ok) {
          const bodyText = await response.text().catch(() => "");
          throw new Error(`HTTP_${response.status}: ${bodyText || response.statusText}`);
        }

        const data = await response.json().catch(() => ({}));
        return data as T;
      } catch (err: any) {
        attempt++;
        if (attempt > retries || err.name === "AbortError") {
          clearTimeout(id);
          throw err;
        }
        // Exponential backoff
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(res => setTimeout(res, delay));
      }
    }

    clearTimeout(id);
    throw new Error("Request failed after all retry attempts.");
  }
}
