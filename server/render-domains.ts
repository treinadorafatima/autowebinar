/**
 * Render Domains Integration
 * Gerencia domínios customizados automaticamente via API do Render
 */

interface RenderDomainResponse {
  id: string;
  name: string;
  verified: boolean;
  verificationStatus?: {
    status: string;
    dnsRecords?: Array<{
      type: string;
      name: string;
      value: string;
    }>;
  };
  createdAt: string;
}

interface RenderApiError {
  message: string;
  id?: string;
}

class RenderDomainsService {
  private apiKey: string | null;
  private serviceId: string | null;
  private baseUrl = "https://api.render.com/v1";

  constructor() {
    this.apiKey = process.env.RENDER_API_KEY || null;
    this.serviceId = process.env.RENDER_SERVICE_ID || null;
  }

  isConfigured(): boolean {
    return !!(this.apiKey && this.serviceId);
  }

  getConfigStatus(): { configured: boolean; missing: string[] } {
    const missing: string[] = [];
    if (!this.apiKey) missing.push("RENDER_API_KEY");
    if (!this.serviceId) missing.push("RENDER_SERVICE_ID");
    return { configured: missing.length === 0, missing };
  }

  private async makeRequest<T>(
    endpoint: string,
    method: "GET" | "POST" | "DELETE" = "GET",
    body?: object
  ): Promise<{ success: boolean; data?: T; error?: string }> {
    if (!this.isConfigured()) {
      return { success: false, error: "Render API não configurada" };
    }

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method,
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      const data = await response.json();

      if (!response.ok) {
        const error = data as RenderApiError;
        return { success: false, error: error.message || `Erro ${response.status}` };
      }

      return { success: true, data: data as T };
    } catch (error: any) {
      console.error("[render-domains] API error:", error);
      return { success: false, error: error.message || "Erro de conexão com Render API" };
    }
  }

  async addDomain(domain: string): Promise<{ 
    success: boolean; 
    domain?: RenderDomainResponse; 
    error?: string;
    dnsInstructions?: {
      type: string;
      name: string;
      value: string;
    };
  }> {
    const cleanDomain = domain.toLowerCase().trim();
    
    if (!cleanDomain || !cleanDomain.includes(".")) {
      return { success: false, error: "Domínio inválido" };
    }

    console.log(`[render-domains] Adding domain: ${cleanDomain}`);

    const result = await this.makeRequest<RenderDomainResponse>(
      `/services/${this.serviceId}/custom-domains`,
      "POST",
      { name: cleanDomain }
    );

    if (result.success && result.data) {
      const isRootDomain = cleanDomain.split(".").length === 2;
      
      return {
        success: true,
        domain: result.data,
        dnsInstructions: {
          type: isRootDomain ? "A" : "CNAME",
          name: isRootDomain ? "@" : cleanDomain.split(".")[0],
          value: isRootDomain ? "216.24.57.1" : `${this.getServiceSubdomain()}.onrender.com`,
        },
      };
    }

    if (result.error?.includes("already exists")) {
      return { success: true, error: "Domínio já está configurado" };
    }

    return { success: false, error: result.error };
  }

  async removeDomain(domain: string): Promise<{ success: boolean; error?: string }> {
    const cleanDomain = domain.toLowerCase().trim();
    
    const listResult = await this.listDomains();
    if (!listResult.success || !listResult.domains) {
      return { success: false, error: "Não foi possível listar domínios" };
    }

    const domainRecord = listResult.domains.find(d => d.name === cleanDomain);
    if (!domainRecord) {
      return { success: true };
    }

    console.log(`[render-domains] Removing domain: ${cleanDomain} (ID: ${domainRecord.id})`);

    const result = await this.makeRequest(
      `/services/${this.serviceId}/custom-domains/${domainRecord.id}`,
      "DELETE"
    );

    return { success: result.success, error: result.error };
  }

  async listDomains(): Promise<{ 
    success: boolean; 
    domains?: RenderDomainResponse[]; 
    error?: string 
  }> {
    const result = await this.makeRequest<RenderDomainResponse[]>(
      `/services/${this.serviceId}/custom-domains`
    );

    if (result.success) {
      const domains = Array.isArray(result.data) ? result.data : [];
      return { success: true, domains };
    }

    return { success: false, error: result.error };
  }

  async verifyDomain(domain: string): Promise<{ 
    success: boolean; 
    verified?: boolean;
    error?: string 
  }> {
    const cleanDomain = domain.toLowerCase().trim();
    
    const listResult = await this.listDomains();
    if (!listResult.success || !listResult.domains) {
      return { success: false, error: "Não foi possível listar domínios" };
    }

    const domainRecord = listResult.domains.find(d => d.name === cleanDomain);
    if (!domainRecord) {
      return { success: false, error: "Domínio não encontrado no Render" };
    }

    const result = await this.makeRequest<{ verified: boolean }>(
      `/services/${this.serviceId}/custom-domains/${domainRecord.id}/verify`,
      "POST"
    );

    if (result.success) {
      return { success: true, verified: result.data?.verified || false };
    }

    return { success: false, error: result.error };
  }

  private getServiceSubdomain(): string {
    return process.env.RENDER_SERVICE_SUBDOMAIN || "autowebinar-znc5";
  }
}

export const renderDomainsService = new RenderDomainsService();
