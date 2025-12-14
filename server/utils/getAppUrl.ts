/**
 * Detecta dinamicamente a URL base da aplicação
 * Esta função é compartilhada entre todos os módulos do servidor
 * 
 * Prioridade:
 * 1. PUBLIC_BASE_URL (variável de ambiente explícita - produção)
 * 2. RENDER_EXTERNAL_URL (Render.com)
 * 3. REPLIT_DOMAINS (Replit - domínio principal/customizado)
 * 4. REPLIT_DEV_DOMAIN (Replit - domínio de desenvolvimento)
 * 5. Fallback para autowebinar.com.br
 */
export function getAppUrl(): string {
  if (process.env.PUBLIC_BASE_URL) {
    return process.env.PUBLIC_BASE_URL.replace(/\/$/, '');
  }
  if (process.env.RENDER_EXTERNAL_URL) {
    return process.env.RENDER_EXTERNAL_URL.replace(/\/$/, '');
  }
  if (process.env.REPLIT_DOMAINS) {
    const primaryDomain = process.env.REPLIT_DOMAINS.split(',')[0].trim();
    return `https://${primaryDomain}`;
  }
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  return "https://autowebinar.com.br";
}

export function getLoginUrl(): string {
  return `${getAppUrl()}/login`;
}

export function getAdminUrl(): string {
  return `${getAppUrl()}/admin`;
}

export function getCheckoutUrl(): string {
  return `${getAppUrl()}/checkout`;
}

export function getWebinarUrl(slug: string): string {
  return `${getAppUrl()}/webinar/${slug}`;
}

export function getReplayUrl(slug: string): string {
  return `${getAppUrl()}/webinar/${slug}?replay=1`;
}

export function getUnsubscribeUrl(email: string): string {
  return `${getAppUrl()}/unsubscribe?email=${encodeURIComponent(email)}`;
}

export function getPasswordResetUrl(token: string): string {
  return `${getAppUrl()}/reset-password?token=${token}`;
}

export function getAffiliateLoginUrl(): string {
  return `${getAppUrl()}/afiliado/login`;
}
