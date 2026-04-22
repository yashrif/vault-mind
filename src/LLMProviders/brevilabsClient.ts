const BREVILABS_API_BASE_URL = "https://api.brevilabs.com/v1";
import { logInfo } from "@/logger";
import { getSettings } from "@/settings/model";
import { safeFetchNoThrow } from "@/utils";

export interface RerankResponse {
  response: {
    object: string;
    data: Array<{
      relevance_score: number;
      index: number;
    }>;
    model: string;
    usage: {
      total_tokens: number;
    };
  };
  elapsed_time_ms: number;
}

export interface ToolCall {
  tool: any;
  args: any;
}

export interface Url4llmResponse {
  response: any;
  elapsed_time_ms: number;
}

export interface WebSearchResponse {
  response: {
    choices: [
      {
        message: {
          content: string;
        };
      },
    ];
    citations: string[];
  };
  elapsed_time_ms: number;
}

export interface Youtube4llmResponse {
  response: {
    transcript: string;
  };
  elapsed_time_ms: number;
}

export interface Twitter4llmResponse {
  response: any;
  elapsed_time_ms: number;
}

export interface LicenseResponse {
  is_valid: boolean;
  plan: string;
}

export class BrevilabsClient {
  private static instance: BrevilabsClient;
  private pluginVersion: string = "Unknown";

  static getInstance(): BrevilabsClient {
    if (!BrevilabsClient.instance) {
      BrevilabsClient.instance = new BrevilabsClient();
    }
    return BrevilabsClient.instance;
  }

  setPluginVersion(pluginVersion: string) {
    this.pluginVersion = pluginVersion;
  }

  private async makeRequest<T>(
    endpoint: string,
    body: any,
    method = "POST"
  ): Promise<{ data: T | null; error?: Error }> {
    body.user_id = getSettings().userId;

    const url = new URL(`${BREVILABS_API_BASE_URL}${endpoint}`);
    if (method === "GET") {
      // Add query parameters for GET requests
      Object.entries(body).forEach(([key, value]) => {
        url.searchParams.append(key, value as string);
      });
    }
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Client-Version": this.pluginVersion,
    };
    const response = await safeFetchNoThrow(url.toString(), {
      method,
      headers,
      ...(method === "POST" && { body: JSON.stringify(body) }),
    });
    const data = await response.json();
    if (!response.ok) {
      try {
        const errorDetail = data.detail;
        const error = new Error(errorDetail.reason);
        error.name = errorDetail.error;
        return { data: null, error };
      } catch {
        return { data: null, error: new Error("Unknown error") };
      }
    }
    logInfo(`[API ${endpoint} request]:`, data);

    return { data };
  }

  /**
   * Validate the license key and update the isPlusUser setting.
   * @param context Optional context object containing the features that the user is using to validate the license key.
   * @returns true if the license key is valid, false if the license key is invalid, and undefined if
   * unknown error.
   */
  async validateLicenseKey(
    context?: Record<string, any>
  ): Promise<{ isValid: boolean | undefined; plan?: string }> {
    // Build the request body with proper structure
    const requestBody: Record<string, any> = {};

    // Safely spread context if provided, ensuring no conflicts with required fields
    if (context && typeof context === "object") {
      // Filter out any undefined or null values from context
      const filteredContext = Object.fromEntries(
        Object.entries(context).filter(([_, value]) => value !== undefined && value !== null)
      );

      // Remove any reserved fields that must not be overridden by context
      const reservedKeys = new Set(["license_key", "user_id"]);
      for (const key of reservedKeys) {
        if (key in filteredContext) {
          delete (filteredContext as Record<string, unknown>)[key];
        }
      }

      // Spread the filtered context into the request body
      Object.assign(requestBody, filteredContext);
    }

    const { data, error } = await this.makeRequest<LicenseResponse>("/license", requestBody);

    if (error) {
      return { isValid: undefined };
    }
    return { isValid: true, plan: data?.plan };
  }

  async rerank(query: string, documents: string[]): Promise<RerankResponse> {
    const { data, error } = await this.makeRequest<RerankResponse>("/rerank", {
      query,
      documents,
      model: "rerank-2",
    });
    if (error) {
      throw error;
    }
    if (!data) {
      throw new Error("No data returned from rerank");
    }

    return data;
  }

  async url4llm(url: string): Promise<Url4llmResponse> {
    const { data, error } = await this.makeRequest<Url4llmResponse>("/url4llm", { url });
    if (error) {
      throw error;
    }
    if (!data) {
      throw new Error("No data returned from url4llm");
    }

    return data;
  }

  async webSearch(query: string): Promise<WebSearchResponse> {
    const { data, error } = await this.makeRequest<WebSearchResponse>("/websearch", { query });
    if (error) {
      throw error;
    }
    if (!data) {
      throw new Error("No data returned from websearch");
    }

    return data;
  }

  async youtube4llm(url: string): Promise<Youtube4llmResponse> {
    const { data, error } = await this.makeRequest<Youtube4llmResponse>("/youtube4llm", { url });
    if (error) {
      throw error;
    }
    if (!data) {
      throw new Error("No data returned from youtube4llm");
    }

    return data;
  }

  async twitter4llm(url: string): Promise<Twitter4llmResponse> {
    const { data, error } = await this.makeRequest<Twitter4llmResponse>("/twitter4llm", { url });
    if (error) {
      throw error;
    }
    if (!data) {
      throw new Error("No data returned from twitter4llm");
    }

    return data;
  }
}
