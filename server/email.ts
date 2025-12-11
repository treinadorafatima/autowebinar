import { Resend } from 'resend';

const FROM_EMAIL = "AutoWebinar <contato@autowebinar.shop>";
const REPLY_TO_EMAIL = "contato@autowebinar.shop";

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  
  if (!apiKey) {
    throw new Error('RESEND_API_KEY não configurada');
  }
  
  return {
    client: new Resend(apiKey),
    fromEmail: FROM_EMAIL
  };
}

const APP_NAME = "AutoWebinar";
const APP_URL = process.env.PUBLIC_BASE_URL 
  ? process.env.PUBLIC_BASE_URL.replace(/\/$/, '')
  : (process.env.REPLIT_DEV_DOMAIN 
    ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
    : "https://autowebinar.com.br");
const LOGIN_URL = `${APP_URL}/login`;

export async function sendWelcomeEmail(to: string, name: string): Promise<boolean> {
  try {
    const { client, fromEmail } = getResendClient();
    
    const text = `
Ola ${name},

Sua conta foi criada com sucesso no ${APP_NAME}!

Agora voce tem acesso a todos os recursos da plataforma de webinarios automatizados.

O que voce pode fazer:
- Criar webinarios automatizados que rodam 24/7
- Usar IA para gerar roteiros de vendas
- Criar mensagens de email e WhatsApp com IA
- Capturar leads automaticamente
- Transcrever videos automaticamente com IA

Acesse sua conta: ${APP_URL}/admin

Se tiver qualquer duvida, estamos aqui para ajudar!

---
${APP_NAME}
    `.trim();
    
    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bem-vindo ao ${APP_NAME}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="background-color: #3b82f6; padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 600;">Bem-vindo ao ${APP_NAME}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Ola <strong>${name}</strong>,
              </p>
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Sua conta foi criada com sucesso! Agora voce tem acesso a todos os recursos da plataforma de webinarios automatizados.
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 30px 0; background-color: #f8fafc; border-radius: 6px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 12px; color: #1e40af; font-weight: 600; font-size: 14px;">O que voce pode fazer:</p>
                    <p style="margin: 0; color: #374151; font-size: 14px; line-height: 1.8;">
                      - Criar webinarios automatizados que rodam 24/7<br>
                      - Usar IA para gerar roteiros de vendas<br>
                      - Criar mensagens de email e WhatsApp com IA<br>
                      - Capturar leads automaticamente<br>
                      - Transcrever videos automaticamente com IA
                    </p>
                  </td>
                </tr>
              </table>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align: center; padding: 20px 0;">
                    <a href="${APP_URL}/admin" style="display: inline-block; background-color: #3b82f6; color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      Acessar Minha Conta
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 30px 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                Se tiver qualquer duvida, estamos aqui para ajudar!
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                ${APP_NAME} - Webinarios Automatizados
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const result = await client.emails.send({
      from: fromEmail,
      replyTo: REPLY_TO_EMAIL,
      to: [to],
      subject: `Bem-vindo ao ${APP_NAME}`,
      html,
      text,
    });

    console.log(`[email] Email de boas-vindas enviado para ${to}`, result);
    return true;
  } catch (error) {
    console.error(`[email] Erro ao enviar email de boas-vindas para ${to}:`, error);
    return false;
  }
}

export async function sendAccessCredentialsEmail(to: string, name: string, tempPassword: string, planName: string): Promise<boolean> {
  try {
    const { client, fromEmail } = getResendClient();
    
    const text = `
Ola ${name},

Seu acesso ao ${APP_NAME} foi liberado com sucesso!

Aqui estao suas credenciais de acesso:

E-mail: ${to}
Senha: ${tempPassword}

Acesse sua conta agora: ${LOGIN_URL}

IMPORTANTE: Por seguranca, recomendamos que voce altere sua senha apos o primeiro login.

Plano: ${planName}

O que voce pode fazer:
- Criar webinarios automatizados que rodam 24/7
- Usar IA para gerar roteiros de vendas
- Criar mensagens de email e WhatsApp com IA
- Capturar leads automaticamente
- Transcrever videos automaticamente com IA

Se tiver qualquer duvida, estamos aqui para ajudar!

---
${APP_NAME}
    `.trim();
    
    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Seu Acesso ao ${APP_NAME}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="background-color: #10b981; padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 600;">Seu Acesso Foi Liberado!</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Ola <strong>${name}</strong>,
              </p>
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Seu acesso ao ${APP_NAME} foi liberado com sucesso! Use as credenciais abaixo para acessar sua conta:
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 25px 0; background-color: #ecfdf5; border-radius: 6px; border: 2px solid #10b981;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 12px; color: #047857; font-weight: 600; font-size: 14px;">Suas Credenciais de Acesso:</p>
                    <p style="margin: 0 0 8px; color: #374151; font-size: 15px; line-height: 1.8;">
                      <strong>E-mail:</strong> ${to}
                    </p>
                    <p style="margin: 0; color: #374151; font-size: 15px; line-height: 1.8;">
                      <strong>Senha:</strong> <span style="background-color: #d1fae5; padding: 4px 12px; border-radius: 4px; font-family: monospace; font-size: 16px; letter-spacing: 1px;">${tempPassword}</span>
                    </p>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 20px 0; background-color: #fef3c7; border-radius: 6px;">
                <tr>
                  <td style="padding: 16px;">
                    <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.6;">
                      <strong>Plano:</strong> ${planName}<br>
                      <strong>Importante:</strong> Por seguranca, recomendamos que voce altere sua senha apos o primeiro login.
                    </p>
                  </td>
                </tr>
              </table>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align: center; padding: 20px 0;">
                    <a href="${LOGIN_URL}" style="display: inline-block; background-color: #10b981; color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      Acessar Minha Conta
                    </a>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 30px 0; background-color: #f8fafc; border-radius: 6px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 12px; color: #1e40af; font-weight: 600; font-size: 14px;">O que voce pode fazer:</p>
                    <p style="margin: 0; color: #374151; font-size: 14px; line-height: 1.8;">
                      - Criar webinarios automatizados que rodam 24/7<br>
                      - Usar IA para gerar roteiros de vendas<br>
                      - Criar mensagens de email e WhatsApp com IA<br>
                      - Capturar leads automaticamente<br>
                      - Transcrever videos automaticamente com IA
                    </p>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 30px 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                Se tiver qualquer duvida, estamos aqui para ajudar!
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                ${APP_NAME} - Webinarios Automatizados
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const result = await client.emails.send({
      from: fromEmail,
      replyTo: REPLY_TO_EMAIL,
      to: [to],
      subject: `Seu acesso ao ${APP_NAME} foi liberado!`,
      html,
      text,
    });

    console.log(`[email] Email de credenciais enviado para ${to}`, result);
    return true;
  } catch (error) {
    console.error(`[email] Erro ao enviar email de credenciais para ${to}:`, error);
    return false;
  }
}

export async function sendPasswordResetEmail(to: string, name: string, resetToken: string): Promise<boolean> {
  try {
    const { client, fromEmail } = getResendClient();
    const resetUrl = `${APP_URL}/reset-password?token=${resetToken}`;
    
    const text = `
Ola ${name},

Recebemos uma solicitacao para redefinir a senha da sua conta no ${APP_NAME}.

Para criar uma nova senha, acesse o link abaixo:
${resetUrl}

IMPORTANTE: Este link e valido por 1 hora. Se voce nao solicitou a redefinicao de senha, ignore este email.

---
${APP_NAME}
Este e um email automatico, por favor nao responda.
    `.trim();
    
    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Recuperacao de Senha - ${APP_NAME}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="background-color: #7c3aed; padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 600;">Recuperacao de Senha</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Ola <strong>${name}</strong>,
              </p>
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Recebemos uma solicitacao para redefinir a senha da sua conta no ${APP_NAME}.
              </p>
              <p style="margin: 0 0 30px; color: #374151; font-size: 16px; line-height: 1.6;">
                Clique no botao abaixo para criar uma nova senha:
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align: center; padding: 20px 0;">
                    <a href="${resetUrl}" style="display: inline-block; background-color: #7c3aed; color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      Redefinir Minha Senha
                    </a>
                  </td>
                </tr>
              </table>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 30px 0; background-color: #fef3c7; border-radius: 6px;">
                <tr>
                  <td style="padding: 16px;">
                    <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.6;">
                      <strong>Importante:</strong> Este link e valido por 1 hora. Se voce nao solicitou a redefinicao de senha, ignore este email.
                    </p>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0; color: #6b7280; font-size: 13px; line-height: 1.6;">
                Se o botao nao funcionar, copie e cole este link no seu navegador:<br>
                <a href="${resetUrl}" style="color: #7c3aed; word-break: break-all;">${resetUrl}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                ${APP_NAME} - Este e um email automatico.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const result = await client.emails.send({
      from: fromEmail,
      replyTo: REPLY_TO_EMAIL,
      to: [to],
      subject: `Recuperacao de Senha - ${APP_NAME}`,
      html,
      text,
    });

    console.log(`[email] Email de recuperacao de senha enviado para ${to}`, result);
    return true;
  } catch (error) {
    console.error(`[email] Erro ao enviar email de recuperacao para ${to}:`, error);
    return false;
  }
}

export async function sendPlanExpiredEmail(to: string, name: string, planName: string): Promise<boolean> {
  try {
    const { client, fromEmail } = getResendClient();
    
    const text = `
Ola ${name},

O seu plano ${planName} expirou e o acesso a sua conta no ${APP_NAME} foi suspenso.

O que acontece agora:
- Seus webinarios foram pausados
- Novos leads nao serao capturados
- As ferramentas de IA estao indisponiveis

Nao se preocupe! Seus dados estao seguros. Renove seu plano agora e continue vendendo no automatico.

Renovar plano: ${APP_URL}/checkout

Precisa de ajuda? Entre em contato com nosso suporte.

---
${APP_NAME}
    `.trim();
    
    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Seu Plano Expirou - ${APP_NAME}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="background-color: #dc2626; padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 600;">Seu Plano Expirou</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Ola <strong>${name}</strong>,
              </p>
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                O seu plano <strong>${planName}</strong> expirou e o acesso a sua conta no ${APP_NAME} foi suspenso.
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 25px 0; background-color: #fef2f2; border-radius: 6px;">
                <tr>
                  <td style="padding: 16px;">
                    <p style="margin: 0 0 8px; color: #991b1b; font-weight: 600; font-size: 14px;">
                      O que acontece agora:
                    </p>
                    <p style="margin: 0; color: #991b1b; font-size: 14px; line-height: 1.6;">
                      - Seus webinarios foram pausados<br>
                      - Novos leads nao serao capturados<br>
                      - As ferramentas de IA estao indisponiveis
                    </p>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                <strong>Nao se preocupe!</strong> Seus dados estao seguros. Renove seu plano agora e continue vendendo no automatico.
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align: center; padding: 25px 0;">
                    <a href="${APP_URL}/checkout" style="display: inline-block; background-color: #3b82f6; color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      Renovar Meu Plano
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 30px 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                Precisa de ajuda? Entre em contato com nosso suporte.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                ${APP_NAME} - Webinarios Automatizados
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const result = await client.emails.send({
      from: fromEmail,
      replyTo: REPLY_TO_EMAIL,
      to: [to],
      subject: `Seu plano expirou - ${APP_NAME}`,
      html,
      text,
    });

    console.log(`[email] Email de plano expirado enviado para ${to}`, result);
    return true;
  } catch (error) {
    console.error(`[email] Erro ao enviar email de plano expirado para ${to}:`, error);
    return false;
  }
}

export async function sendPaymentFailedEmail(to: string, name: string, planName: string, reason: string, planoId?: string): Promise<boolean> {
  try {
    const { client, fromEmail } = getResendClient();
    
    // Build checkout URL with pre-filled email and name
    const checkoutParams = new URLSearchParams({
      email: to,
      nome: name,
      renovacao: "true"
    });
    const checkoutUrl = planoId 
      ? `${APP_URL}/checkout/${planoId}?${checkoutParams.toString()}`
      : `${APP_URL}/checkout?${checkoutParams.toString()}`;
    
    const text = `
Ola ${name},

A renovacao do seu plano ${planName} nao foi aprovada e seu acesso foi temporariamente suspenso.

Motivo: ${reason || "Cartao recusado ou limite insuficiente"}

Nao se preocupe! Seus dados e webinarios estao seguros. Assim que regularizar o pagamento, seu acesso sera reativado automaticamente.

O que voce pode fazer:
- Verificar o limite disponivel no seu cartao
- Atualizar o metodo de pagamento
- Entrar em contato com seu banco para liberar a transacao

Regularizar agora: ${checkoutUrl}

Se precisar de ajuda, entre em contato com nosso suporte.

---
${APP_NAME}
    `.trim();
    
    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pagamento nao aprovado - ${APP_NAME}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="background-color: #dc2626; padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 600;">Pagamento Nao Aprovado</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Ola <strong>${name}</strong>,
              </p>
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                A renovacao do seu plano <strong>${planName}</strong> nao foi aprovada e seu acesso foi temporariamente suspenso.
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 25px 0; background-color: #fef2f2; border-radius: 6px; border-left: 4px solid #dc2626;">
                <tr>
                  <td style="padding: 16px;">
                    <p style="margin: 0 0 8px; color: #991b1b; font-weight: 600; font-size: 14px;">
                      Motivo:
                    </p>
                    <p style="margin: 0; color: #991b1b; font-size: 14px; line-height: 1.6;">
                      ${reason || "Cartao recusado ou limite insuficiente"}
                    </p>
                  </td>
                </tr>
              </table>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 25px 0; background-color: #ecfdf5; border-radius: 6px;">
                <tr>
                  <td style="padding: 16px;">
                    <p style="margin: 0 0 8px; color: #047857; font-weight: 600; font-size: 14px;">
                      Nao se preocupe!
                    </p>
                    <p style="margin: 0; color: #047857; font-size: 14px; line-height: 1.6;">
                      Seus dados e webinarios estao seguros. Assim que regularizar o pagamento, seu acesso sera <strong>reativado automaticamente</strong>.
                    </p>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0 0 12px; color: #374151; font-size: 16px; line-height: 1.6; font-weight: 600;">
                O que voce pode fazer:
              </p>
              <ul style="margin: 0 0 25px; padding-left: 20px; color: #374151; font-size: 15px; line-height: 1.8;">
                <li>Verificar o limite disponivel no seu cartao</li>
                <li>Atualizar o metodo de pagamento</li>
                <li>Entrar em contato com seu banco para liberar a transacao</li>
              </ul>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align: center; padding: 25px 0;">
                    <a href="${checkoutUrl}" style="display: inline-block; background-color: #10b981; color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      Regularizar Pagamento
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 30px 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                Se precisar de ajuda, entre em contato com nosso suporte.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                ${APP_NAME} - Webinarios Automatizados
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const result = await client.emails.send({
      from: fromEmail,
      replyTo: REPLY_TO_EMAIL,
      to: [to],
      subject: `Acao necessaria: pagamento nao aprovado - ${APP_NAME}`,
      html,
      text,
    });

    console.log(`[email] Email de falha de pagamento enviado para ${to}`, result);
    return true;
  } catch (error) {
    console.error(`[email] Erro ao enviar email de falha de pagamento para ${to}:`, error);
    return false;
  }
}

export async function sendPaymentPendingEmail(to: string, name: string, planName: string, paymentMethod: string, planoId?: string): Promise<boolean> {
  try {
    const { client, fromEmail } = getResendClient();
    
    // Build checkout URL with pre-filled email and name for alternative payment
    const checkoutParams = new URLSearchParams({
      email: to,
      nome: name,
    });
    const checkoutUrl = planoId 
      ? `${APP_URL}/checkout/${planoId}?${checkoutParams.toString()}`
      : `${APP_URL}/checkout?${checkoutParams.toString()}`;
    
    // Card pending - offer PIX/Boleto as alternatives
    const text = `
Ola ${name},

Recebemos seu pedido para o plano ${planName}!

Seu pagamento com cartao esta EM ANALISE pelo banco emissor.

Isso pode levar de 24 a 48 horas para ser processado.

NAO QUER ESPERAR? Pague agora com PIX ou Boleto!

PIX: Aprovacao instantanea - seu acesso e liberado na hora!
Boleto: Vencimento em 3 dias uteis.

Pagar com PIX ou Boleto: ${checkoutUrl}

IMPORTANTE: Seu acesso sera liberado automaticamente assim que o pagamento for confirmado. Voce recebera um email com suas credenciais de acesso.

Precisa de ajuda? Entre em contato com nosso suporte.

---
${APP_NAME}
    `.trim();
    
    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pagamento em Analise - ${APP_NAME}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="background-color: #f59e0b; padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 600;">Pagamento em Analise</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Ola <strong>${name}</strong>,
              </p>
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Recebemos seu pedido para o plano <strong>${planName}</strong>!
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 25px 0; background-color: #fffbeb; border-radius: 6px; border-left: 4px solid #f59e0b;">
                <tr>
                  <td style="padding: 16px;">
                    <p style="margin: 0 0 8px; color: #92400e; font-weight: 600; font-size: 14px;">
                      Pagamento com cartao - EM ANALISE
                    </p>
                    <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.6;">
                      Seu pagamento esta sendo analisado pelo banco emissor do cartao. Isso pode levar de <strong>24 a 48 horas</strong>.
                    </p>
                  </td>
                </tr>
              </table>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 25px 0; background-color: #ecfdf5; border-radius: 6px; border: 2px solid #10b981;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 12px; color: #047857; font-weight: 700; font-size: 16px; text-align: center;">
                      NAO QUER ESPERAR?
                    </p>
                    <p style="margin: 0 0 16px; color: #047857; font-size: 14px; line-height: 1.6; text-align: center;">
                      Pague agora com <strong>PIX</strong> ou <strong>Boleto</strong> e tenha seu acesso liberado imediatamente!
                    </p>
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td style="text-align: center;">
                          <a href="${checkoutUrl}" style="display: inline-block; background-color: #10b981; color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 6px; font-weight: 600; font-size: 16px;">
                            Pagar com PIX ou Boleto
                          </a>
                        </td>
                      </tr>
                    </table>
                    <p style="margin: 16px 0 0; color: #047857; font-size: 13px; line-height: 1.6; text-align: center;">
                      <strong>PIX:</strong> Aprovacao instantanea<br>
                      <strong>Boleto:</strong> Vencimento em 3 dias uteis
                    </p>
                  </td>
                </tr>
              </table>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 25px 0; background-color: #f0f9ff; border-radius: 6px;">
                <tr>
                  <td style="padding: 16px;">
                    <p style="margin: 0 0 8px; color: #0369a1; font-weight: 600; font-size: 14px;">
                      O que acontece depois?
                    </p>
                    <p style="margin: 0; color: #0369a1; font-size: 14px; line-height: 1.6;">
                      Assim que o pagamento for confirmado (seja pelo cartao ou outro metodo), voce recebera um email com suas <strong>credenciais de acesso</strong>.
                    </p>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 30px 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                Precisa de ajuda? Entre em contato com nosso suporte.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                ${APP_NAME} - Webinarios Automatizados
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const result = await client.emails.send({
      from: fromEmail,
      replyTo: REPLY_TO_EMAIL,
      to: [to],
      subject: `Pagamento em analise - ${planName} - ${APP_NAME}`,
      html,
      text,
    });

    console.log(`[email] Email de pagamento pendente enviado para ${to}`, result);
    return true;
  } catch (error) {
    console.error(`[email] Erro ao enviar email de pagamento pendente para ${to}:`, error);
    return false;
  }
}

export async function sendPaymentConfirmedEmail(to: string, name: string, planName: string, expirationDate: Date): Promise<boolean> {
  try {
    const { client, fromEmail } = getResendClient();
    const formattedDate = expirationDate.toLocaleDateString('pt-BR');
    
    const text = `
Ola ${name},

Otima noticia! Seu pagamento foi confirmado com sucesso.

Detalhes da sua assinatura:
- Plano: ${planName}
- Valido ate: ${formattedDate}

Seu acesso esta liberado! Voce ja pode aproveitar todos os recursos da plataforma.

Acesse sua conta: ${APP_URL}/admin

Obrigado por confiar no ${APP_NAME}!

---
${APP_NAME}
    `.trim();
    
    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pagamento Confirmado - ${APP_NAME}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="background-color: #10b981; padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 600;">Pagamento Confirmado!</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Ola <strong>${name}</strong>,
              </p>
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Otima noticia! Seu pagamento foi confirmado com sucesso.
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 25px 0; background-color: #ecfdf5; border-radius: 6px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 12px; color: #047857; font-weight: 600; font-size: 14px;">Detalhes da sua assinatura:</p>
                    <p style="margin: 0; color: #047857; font-size: 14px; line-height: 1.8;">
                      <strong>Plano:</strong> ${planName}<br>
                      <strong>Valido ate:</strong> ${formattedDate}
                    </p>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                <strong>Seu acesso esta liberado!</strong> Voce ja pode aproveitar todos os recursos da plataforma.
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align: center; padding: 20px 0;">
                    <a href="${APP_URL}/admin" style="display: inline-block; background-color: #10b981; color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      Acessar Minha Conta
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 30px 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                Obrigado por confiar no ${APP_NAME}!
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                ${APP_NAME} - Webinarios Automatizados
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const result = await client.emails.send({
      from: fromEmail,
      replyTo: REPLY_TO_EMAIL,
      to: [to],
      subject: `Pagamento confirmado - ${APP_NAME}`,
      html,
      text,
    });

    console.log(`[email] Email de pagamento confirmado enviado para ${to}`, result);
    return true;
  } catch (error) {
    console.error(`[email] Erro ao enviar email de pagamento confirmado para ${to}:`, error);
    return false;
  }
}

export async function sendExpirationReminderEmail(to: string, name: string, planName: string, daysUntilExpiration: number, expirationDate: Date): Promise<boolean> {
  try {
    const { client, fromEmail } = getResendClient();
    const formattedDate = expirationDate.toLocaleDateString('pt-BR');
    const renewUrl = `${APP_URL}/checkout?email=${encodeURIComponent(to)}`;
    
    const urgencyText = daysUntilExpiration === 1 ? "amanha" : `em ${daysUntilExpiration} dias`;
    const subjectUrgency = daysUntilExpiration === 1 ? "Seu plano vence amanha!" : `Seu plano vence em ${daysUntilExpiration} dias`;
    
    const text = `
Ola ${name},

Seu plano ${planName} vence ${urgencyText} (${formattedDate}).

Para continuar aproveitando todos os recursos do ${APP_NAME}, renove sua assinatura antes do vencimento:
- Webinarios automatizados 24/7
- Ferramentas de IA para roteiros e mensagens
- Captura automatica de leads
- Suporte prioritario

Renovar agora: ${renewUrl}

Nao deixe seus webinarios pararem! Renove ja e continue vendendo no automatico.

---
${APP_NAME}
    `.trim();
    
    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lembrete de Renovacao - ${APP_NAME}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="background-color: ${daysUntilExpiration === 1 ? '#f59e0b' : '#3b82f6'}; padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 600;">${subjectUrgency}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Ola <strong>${name}</strong>,
              </p>
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Seu plano <strong>${planName}</strong> vence <strong>${urgencyText}</strong> (${formattedDate}).
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 25px 0; background-color: #f0f9ff; border-radius: 6px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 12px; color: #0369a1; font-weight: 600; font-size: 14px;">Continue aproveitando:</p>
                    <p style="margin: 0; color: #0369a1; font-size: 14px; line-height: 1.8;">
                      - Webinarios automatizados 24/7<br>
                      - Ferramentas de IA para roteiros e mensagens<br>
                      - Captura automatica de leads<br>
                      - Suporte prioritario
                    </p>
                  </td>
                </tr>
              </table>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align: center; padding: 25px 0;">
                    <a href="${renewUrl}" style="display: inline-block; background-color: ${daysUntilExpiration === 1 ? '#f59e0b' : '#3b82f6'}; color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      Renovar Meu Plano
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 30px 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                Nao deixe seus webinarios pararem! Renove ja e continue vendendo no automatico.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                ${APP_NAME} - Webinarios Automatizados
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const result = await client.emails.send({
      from: fromEmail,
      replyTo: REPLY_TO_EMAIL,
      to: [to],
      subject: `${subjectUrgency} - ${APP_NAME}`,
      html,
      text,
    });

    console.log(`[email] Email de lembrete de vencimento (${daysUntilExpiration} dias) enviado para ${to}`, result);
    return true;
  } catch (error) {
    console.error(`[email] Erro ao enviar email de lembrete para ${to}:`, error);
    return false;
  }
}

export async function sendExpiredRenewalEmail(to: string, name: string, planName: string): Promise<boolean> {
  try {
    const { client, fromEmail } = getResendClient();
    const renewUrl = `${APP_URL}/checkout?email=${encodeURIComponent(to)}`;
    
    const text = `
Ola ${name},

Seu plano ${planName} venceu ontem e seu acesso foi suspenso.

Mas nao se preocupe! Seus dados estao seguros e voce pode recuperar o acesso agora mesmo.

O que acontece enquanto seu plano esta vencido:
- Seus webinarios foram pausados
- Novos leads nao estao sendo capturados
- Ferramentas de IA indisponiveis

Renove agora com apenas um clique (seu email ja esta preenchido):
${renewUrl}

Nao perca mais vendas! Renove seu plano e volte a vender no automatico.

---
${APP_NAME}
    `.trim();
    
    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Renove Seu Plano - ${APP_NAME}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="background-color: #dc2626; padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 600;">Seu Plano Venceu</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Ola <strong>${name}</strong>,
              </p>
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Seu plano <strong>${planName}</strong> venceu ontem e seu acesso foi suspenso.
              </p>
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                <strong>Mas nao se preocupe!</strong> Seus dados estao seguros e voce pode recuperar o acesso agora mesmo.
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 25px 0; background-color: #fef2f2; border-radius: 6px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 12px; color: #991b1b; font-weight: 600; font-size: 14px;">O que esta acontecendo:</p>
                    <p style="margin: 0; color: #991b1b; font-size: 14px; line-height: 1.8;">
                      - Seus webinarios foram pausados<br>
                      - Novos leads nao estao sendo capturados<br>
                      - Ferramentas de IA indisponiveis
                    </p>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Renove agora com apenas um clique (seu email ja esta preenchido):
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align: center; padding: 25px 0;">
                    <a href="${renewUrl}" style="display: inline-block; background-color: #3b82f6; color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      Renovar Agora
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 30px 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                Nao perca mais vendas! Renove seu plano e volte a vender no automatico.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                ${APP_NAME} - Webinarios Automatizados
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const result = await client.emails.send({
      from: fromEmail,
      replyTo: REPLY_TO_EMAIL,
      to: [to],
      subject: `Seu plano venceu - Renove agora - ${APP_NAME}`,
      html,
      text,
    });

    console.log(`[email] Email de renovacao pos-vencimento enviado para ${to}`, result);
    return true;
  } catch (error) {
    console.error(`[email] Erro ao enviar email de renovacao para ${to}:`, error);
    return false;
  }
}

// ============================================
// AFFILIATE EMAIL FUNCTIONS
// ============================================

const AFFILIATE_LOGIN_URL = `${APP_URL}/afiliado/login`;

export async function sendAffiliateApprovedEmail(to: string, name: string): Promise<boolean> {
  try {
    const { client, fromEmail } = getResendClient();
    
    const text = `
Ola ${name},

Parabens! Seu cadastro no programa de afiliados do ${APP_NAME} foi aprovado!

Agora voce pode:
- Acessar seu painel de afiliado
- Gerar seus links de divulgacao
- Acompanhar suas vendas e comissoes
- Solicitar saques de seus ganhos

Acesse seu painel: ${AFFILIATE_LOGIN_URL}

Boas vendas!

---
${APP_NAME} - Programa de Afiliados
    `.trim();
    
    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cadastro Aprovado - ${APP_NAME}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="background-color: #10b981; padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 600;">Cadastro Aprovado!</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Ola <strong>${name}</strong>,
              </p>
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Parabens! Seu cadastro no programa de afiliados do ${APP_NAME} foi aprovado!
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 30px 0; background-color: #ecfdf5; border-radius: 6px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 12px; color: #047857; font-weight: 600; font-size: 14px;">Agora voce pode:</p>
                    <p style="margin: 0; color: #374151; font-size: 14px; line-height: 1.8;">
                      - Acessar seu painel de afiliado<br>
                      - Gerar seus links de divulgacao<br>
                      - Acompanhar suas vendas e comissoes<br>
                      - Solicitar saques de seus ganhos
                    </p>
                  </td>
                </tr>
              </table>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align: center; padding: 20px 0;">
                    <a href="${AFFILIATE_LOGIN_URL}" style="display: inline-block; background-color: #10b981; color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      Acessar Meu Painel
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 30px 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                Boas vendas!
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                ${APP_NAME} - Programa de Afiliados
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const result = await client.emails.send({
      from: fromEmail,
      replyTo: REPLY_TO_EMAIL,
      to: [to],
      subject: `Cadastro aprovado - Programa de Afiliados ${APP_NAME}`,
      html,
      text,
    });

    console.log(`[email] Email de afiliado aprovado enviado para ${to}`, result);
    return true;
  } catch (error) {
    console.error(`[email] Erro ao enviar email de afiliado aprovado para ${to}:`, error);
    return false;
  }
}

export async function sendAffiliatePendingEmail(to: string, name: string): Promise<boolean> {
  try {
    const { client, fromEmail } = getResendClient();
    
    const text = `
Ola ${name},

Recebemos seu cadastro no programa de afiliados do ${APP_NAME}!

Seu cadastro esta em analise e em breve voce recebera uma resposta.

Enquanto isso, prepare-se para comecar a divulgar e ganhar comissoes!

Se tiver alguma duvida, entre em contato conosco.

---
${APP_NAME} - Programa de Afiliados
    `.trim();
    
    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cadastro Recebido - ${APP_NAME}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="background-color: #3b82f6; padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 600;">Cadastro Recebido!</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Ola <strong>${name}</strong>,
              </p>
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Recebemos seu cadastro no programa de afiliados do ${APP_NAME}!
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 30px 0; background-color: #fef3c7; border-radius: 6px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.6;">
                      <strong>Status:</strong> Em analise<br><br>
                      Seu cadastro esta sendo analisado e em breve voce recebera uma resposta por e-mail.
                    </p>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Enquanto isso, prepare-se para comecar a divulgar e ganhar comissoes!
              </p>
              
              <p style="margin: 30px 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                Se tiver alguma duvida, entre em contato conosco.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                ${APP_NAME} - Programa de Afiliados
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const result = await client.emails.send({
      from: fromEmail,
      replyTo: REPLY_TO_EMAIL,
      to: [to],
      subject: `Cadastro recebido - Programa de Afiliados ${APP_NAME}`,
      html,
      text,
    });

    console.log(`[email] Email de cadastro pendente enviado para ${to}`, result);
    return true;
  } catch (error) {
    console.error(`[email] Erro ao enviar email de cadastro pendente para ${to}:`, error);
    return false;
  }
}

export async function sendAffiliateSaleEmail(to: string, name: string, saleAmount: number, commissionAmount: number): Promise<boolean> {
  try {
    const { client, fromEmail } = getResendClient();
    
    const saleFormatted = (saleAmount / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const commissionFormatted = (commissionAmount / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    
    const text = `
Ola ${name},

Voce acaba de fazer uma nova venda! Parabens!

Detalhes da venda:
- Valor da venda: ${saleFormatted}
- Sua comissao: ${commissionFormatted}

A comissao ja foi adicionada ao seu saldo e estara disponivel para saque em breve.

Acesse seu painel para ver mais detalhes: ${AFFILIATE_LOGIN_URL}

Continue divulgando e vendendo!

---
${APP_NAME} - Programa de Afiliados
    `.trim();
    
    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nova Venda - ${APP_NAME}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="background-color: #10b981; padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 600;">Nova Venda Realizada!</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Ola <strong>${name}</strong>,
              </p>
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Voce acaba de fazer uma nova venda! Parabens!
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 30px 0; background-color: #ecfdf5; border-radius: 6px; border: 2px solid #10b981;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 12px; color: #047857; font-weight: 600; font-size: 14px;">Detalhes da Venda:</p>
                    <p style="margin: 0 0 8px; color: #374151; font-size: 15px; line-height: 1.8;">
                      <strong>Valor da venda:</strong> ${saleFormatted}
                    </p>
                    <p style="margin: 0; color: #374151; font-size: 15px; line-height: 1.8;">
                      <strong>Sua comissao:</strong> <span style="background-color: #d1fae5; padding: 4px 12px; border-radius: 4px; font-size: 16px; font-weight: 600; color: #047857;">${commissionFormatted}</span>
                    </p>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                A comissao ja foi adicionada ao seu saldo e estara disponivel para saque em breve.
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align: center; padding: 20px 0;">
                    <a href="${AFFILIATE_LOGIN_URL}" style="display: inline-block; background-color: #10b981; color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      Ver Meu Painel
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 30px 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                Continue divulgando e vendendo!
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                ${APP_NAME} - Programa de Afiliados
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const result = await client.emails.send({
      from: fromEmail,
      replyTo: REPLY_TO_EMAIL,
      to: [to],
      subject: `Nova venda: ${commissionFormatted} de comissao - ${APP_NAME}`,
      html,
      text,
    });

    console.log(`[email] Email de nova venda enviado para ${to}`, result);
    return true;
  } catch (error) {
    console.error(`[email] Erro ao enviar email de nova venda para ${to}:`, error);
    return false;
  }
}

export async function sendAffiliatePasswordResetEmail(to: string, name: string, resetToken: string): Promise<boolean> {
  try {
    const { client, fromEmail } = getResendClient();
    const resetUrl = `${APP_URL}/afiliado/reset-password?token=${resetToken}`;
    
    const text = `
Ola ${name},

Recebemos uma solicitacao para redefinir a senha da sua conta de afiliado no ${APP_NAME}.

Para criar uma nova senha, acesse o link abaixo:
${resetUrl}

IMPORTANTE: Este link e valido por 1 hora. Se voce nao solicitou a redefinicao de senha, ignore este email.

---
${APP_NAME} - Programa de Afiliados
Este e um email automatico, por favor nao responda.
    `.trim();
    
    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Recuperacao de Senha - ${APP_NAME}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="background-color: #7c3aed; padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 600;">Recuperacao de Senha</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Ola <strong>${name}</strong>,
              </p>
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Recebemos uma solicitacao para redefinir a senha da sua conta de afiliado no ${APP_NAME}.
              </p>
              <p style="margin: 0 0 30px; color: #374151; font-size: 16px; line-height: 1.6;">
                Clique no botao abaixo para criar uma nova senha:
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align: center; padding: 20px 0;">
                    <a href="${resetUrl}" style="display: inline-block; background-color: #7c3aed; color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      Redefinir Minha Senha
                    </a>
                  </td>
                </tr>
              </table>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 30px 0; background-color: #fef3c7; border-radius: 6px;">
                <tr>
                  <td style="padding: 16px;">
                    <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.6;">
                      <strong>Importante:</strong> Este link e valido por 1 hora. Se voce nao solicitou a redefinicao de senha, ignore este email.
                    </p>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0; color: #6b7280; font-size: 13px; line-height: 1.6;">
                Se o botao nao funcionar, copie e cole este link no seu navegador:<br>
                <a href="${resetUrl}" style="color: #7c3aed; word-break: break-all;">${resetUrl}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                ${APP_NAME} - Este e um email automatico.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const result = await client.emails.send({
      from: fromEmail,
      replyTo: REPLY_TO_EMAIL,
      to: [to],
      subject: `Recuperacao de Senha - Afiliado ${APP_NAME}`,
      html,
      text,
    });

    console.log(`[email] Email de recuperacao de senha de afiliado enviado para ${to}`, result);
    return true;
  } catch (error) {
    console.error(`[email] Erro ao enviar email de recuperacao de afiliado para ${to}:`, error);
    return false;
  }
}

export async function sendAffiliateRejectedEmail(to: string, name: string, reason?: string): Promise<boolean> {
  try {
    const { client, fromEmail } = getResendClient();
    
    const reasonText = reason ? `\nMotivo: ${reason}` : '';
    
    const text = `
Ola ${name},

Agradecemos seu interesse em participar do programa de afiliados do ${APP_NAME}.

Infelizmente, apos analise do seu cadastro, nao foi possivel aprovar sua solicitacao neste momento.${reasonText}

Voce pode tentar novamente no futuro, garantindo que todas as informacoes estejam corretas e completas.

Se tiver alguma duvida, entre em contato conosco.

---
${APP_NAME} - Programa de Afiliados
    `.trim();
    
    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cadastro Nao Aprovado - ${APP_NAME}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="background-color: #ef4444; padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 600;">Cadastro Nao Aprovado</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Ola <strong>${name}</strong>,
              </p>
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Agradecemos seu interesse em participar do programa de afiliados do ${APP_NAME}.
              </p>
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Infelizmente, apos analise do seu cadastro, nao foi possivel aprovar sua solicitacao neste momento.
              </p>
              ${reason ? `
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 30px 0; background-color: #fef2f2; border-radius: 6px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0; color: #991b1b; font-size: 14px; line-height: 1.6;">
                      <strong>Motivo:</strong> ${reason}
                    </p>
                  </td>
                </tr>
              </table>
              ` : ''}
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Voce pode tentar novamente no futuro, garantindo que todas as informacoes estejam corretas e completas.
              </p>
              <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                Se tiver alguma duvida, entre em contato conosco.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                ${APP_NAME} - Programa de Afiliados
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const result = await client.emails.send({
      from: fromEmail,
      replyTo: REPLY_TO_EMAIL,
      to: [to],
      subject: `Cadastro nao aprovado - Programa de Afiliados ${APP_NAME}`,
      html,
      text,
    });

    console.log(`[email] Email de cadastro rejeitado enviado para ${to}`, result);
    return true;
  } catch (error) {
    console.error(`[email] Erro ao enviar email de cadastro rejeitado para ${to}:`, error);
    return false;
  }
}

export async function sendAffiliateWithdrawalRequestedEmail(to: string, name: string, amount: number, pixKey: string): Promise<boolean> {
  try {
    const { client, fromEmail } = getResendClient();
    
    const amountFormatted = (amount / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    
    const text = `
Ola ${name},

Recebemos sua solicitacao de saque no programa de afiliados do ${APP_NAME}.

Detalhes da solicitacao:
- Valor: ${amountFormatted}
- Chave PIX: ${pixKey}

Sua solicitacao sera processada em ate 3 dias uteis. Voce recebera um email de confirmacao quando o pagamento for efetuado.

Acesse seu painel para acompanhar o status: ${AFFILIATE_LOGIN_URL}

---
${APP_NAME} - Programa de Afiliados
    `.trim();
    
    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Solicitacao de Saque Recebida - ${APP_NAME}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="background-color: #3b82f6; padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 600;">Solicitacao de Saque Recebida</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Ola <strong>${name}</strong>,
              </p>
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Recebemos sua solicitacao de saque no programa de afiliados do ${APP_NAME}.
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 30px 0; background-color: #eff6ff; border-radius: 6px; border: 2px solid #3b82f6;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 12px; color: #1e40af; font-weight: 600; font-size: 14px;">Detalhes da solicitacao:</p>
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td style="padding: 8px 0; color: #374151; font-size: 14px; border-bottom: 1px solid #dbeafe;">
                          <strong>Valor:</strong>
                        </td>
                        <td style="padding: 8px 0; color: #1e40af; font-size: 18px; font-weight: 700; text-align: right; border-bottom: 1px solid #dbeafe;">
                          ${amountFormatted}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #374151; font-size: 14px;">
                          <strong>Chave PIX:</strong>
                        </td>
                        <td style="padding: 8px 0; color: #374151; font-size: 14px; text-align: right;">
                          ${pixKey}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 20px 0; background-color: #fef3c7; border-radius: 6px;">
                <tr>
                  <td style="padding: 16px;">
                    <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.6;">
                      <strong>Status:</strong> Em processamento<br><br>
                      Sua solicitacao sera processada em ate 3 dias uteis. Voce recebera um email de confirmacao quando o pagamento for efetuado.
                    </p>
                  </td>
                </tr>
              </table>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align: center; padding: 20px 0;">
                    <a href="${AFFILIATE_LOGIN_URL}" style="display: inline-block; background-color: #3b82f6; color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      Acessar Meu Painel
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                ${APP_NAME} - Programa de Afiliados
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const result = await client.emails.send({
      from: fromEmail,
      replyTo: REPLY_TO_EMAIL,
      to: [to],
      subject: `Solicitacao de saque recebida - ${APP_NAME}`,
      html,
      text,
    });

    console.log(`[email] Email de solicitacao de saque enviado para ${to}`, result);
    return true;
  } catch (error) {
    console.error(`[email] Erro ao enviar email de solicitacao de saque para ${to}:`, error);
    return false;
  }
}

export async function sendAffiliateWithdrawalPaidEmail(to: string, name: string, amount: number, pixKey: string): Promise<boolean> {
  try {
    const { client, fromEmail } = getResendClient();
    
    const amountFormatted = (amount / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    
    const text = `
Ola ${name},

Seu saque foi processado com sucesso!

Detalhes do pagamento:
- Valor: ${amountFormatted}
- Chave PIX: ${pixKey}

O valor ja deve estar disponivel na sua conta em alguns minutos.

Obrigado por fazer parte do nosso programa de afiliados! Continue divulgando e vendendo.

Acesse seu painel: ${AFFILIATE_LOGIN_URL}

---
${APP_NAME} - Programa de Afiliados
    `.trim();
    
    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Saque Pago - ${APP_NAME}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="background-color: #10b981; padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 600;">Saque Pago com Sucesso!</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Ola <strong>${name}</strong>,
              </p>
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Seu saque foi processado com sucesso!
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 30px 0; background-color: #ecfdf5; border-radius: 6px; border: 2px solid #10b981;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 12px; color: #047857; font-weight: 600; font-size: 14px;">Detalhes do pagamento:</p>
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td style="padding: 8px 0; color: #374151; font-size: 14px; border-bottom: 1px solid #d1fae5;">
                          <strong>Valor pago:</strong>
                        </td>
                        <td style="padding: 8px 0; color: #047857; font-size: 22px; font-weight: 700; text-align: right; border-bottom: 1px solid #d1fae5;">
                          ${amountFormatted}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #374151; font-size: 14px;">
                          <strong>Chave PIX:</strong>
                        </td>
                        <td style="padding: 8px 0; color: #374151; font-size: 14px; text-align: right;">
                          ${pixKey}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                O valor ja deve estar disponivel na sua conta em alguns minutos.
              </p>
              
              <p style="margin: 0 0 30px; color: #374151; font-size: 16px; line-height: 1.6;">
                Obrigado por fazer parte do nosso programa de afiliados! Continue divulgando e vendendo.
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align: center; padding: 20px 0;">
                    <a href="${AFFILIATE_LOGIN_URL}" style="display: inline-block; background-color: #10b981; color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      Acessar Meu Painel
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                ${APP_NAME} - Programa de Afiliados
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const result = await client.emails.send({
      from: fromEmail,
      replyTo: REPLY_TO_EMAIL,
      to: [to],
      subject: `Saque de ${amountFormatted} pago com sucesso - ${APP_NAME}`,
      html,
      text,
    });

    console.log(`[email] Email de saque pago enviado para ${to}`, result);
    return true;
  } catch (error) {
    console.error(`[email] Erro ao enviar email de saque pago para ${to}:`, error);
    return false;
  }
}

export async function sendAffiliateWelcomeEmail(to: string, name: string): Promise<boolean> {
  try {
    const { client, fromEmail } = getResendClient();
    
    const text = `
Ola ${name},

Bem-vindo ao painel de afiliados do ${APP_NAME}!

Estamos felizes em ter voce como parceiro. Aqui estao algumas dicas para comecar:

1. Gere seus links de divulgacao
   Acesse a secao de produtos e gere seus links exclusivos para compartilhar.

2. Acompanhe suas vendas
   No painel, voce pode ver todas as suas vendas e comissoes em tempo real.

3. Solicite saques
   Quando atingir o valor minimo, voce pode solicitar o saque das suas comissoes.

4. Materiais de divulgacao
   Utilize os materiais disponibilizados para aumentar suas vendas.

Se tiver alguma duvida, estamos aqui para ajudar!

Acesse seu painel: ${AFFILIATE_LOGIN_URL}

Boas vendas!

---
${APP_NAME} - Programa de Afiliados
    `.trim();
    
    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bem-vindo ao Programa de Afiliados - ${APP_NAME}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="background-color: #7c3aed; padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 600;">Bem-vindo ao Programa de Afiliados!</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Ola <strong>${name}</strong>,
              </p>
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Bem-vindo ao painel de afiliados do ${APP_NAME}! Estamos felizes em ter voce como parceiro.
              </p>
              
              <p style="margin: 0 0 16px; color: #374151; font-size: 16px; font-weight: 600;">
                Aqui estao algumas dicas para comecar:
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 20px 0;">
                <tr>
                  <td style="padding: 16px; background-color: #f3f4f6; border-radius: 6px; margin-bottom: 12px;">
                    <p style="margin: 0 0 8px; color: #7c3aed; font-weight: 600; font-size: 15px;">1. Gere seus links de divulgacao</p>
                    <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.5;">
                      Acesse a secao de produtos e gere seus links exclusivos para compartilhar.
                    </p>
                  </td>
                </tr>
              </table>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 12px 0;">
                <tr>
                  <td style="padding: 16px; background-color: #f3f4f6; border-radius: 6px;">
                    <p style="margin: 0 0 8px; color: #7c3aed; font-weight: 600; font-size: 15px;">2. Acompanhe suas vendas</p>
                    <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.5;">
                      No painel, voce pode ver todas as suas vendas e comissoes em tempo real.
                    </p>
                  </td>
                </tr>
              </table>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 12px 0;">
                <tr>
                  <td style="padding: 16px; background-color: #f3f4f6; border-radius: 6px;">
                    <p style="margin: 0 0 8px; color: #7c3aed; font-weight: 600; font-size: 15px;">3. Solicite saques</p>
                    <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.5;">
                      Quando atingir o valor minimo, voce pode solicitar o saque das suas comissoes.
                    </p>
                  </td>
                </tr>
              </table>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 12px 0 30px;">
                <tr>
                  <td style="padding: 16px; background-color: #f3f4f6; border-radius: 6px;">
                    <p style="margin: 0 0 8px; color: #7c3aed; font-weight: 600; font-size: 15px;">4. Materiais de divulgacao</p>
                    <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.5;">
                      Utilize os materiais disponibilizados para aumentar suas vendas.
                    </p>
                  </td>
                </tr>
              </table>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align: center; padding: 20px 0;">
                    <a href="${AFFILIATE_LOGIN_URL}" style="display: inline-block; background-color: #7c3aed; color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      Acessar Meu Painel
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 20px 0 0; color: #6b7280; font-size: 14px; line-height: 1.6; text-align: center;">
                Se tiver alguma duvida, estamos aqui para ajudar!
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                ${APP_NAME} - Programa de Afiliados
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const result = await client.emails.send({
      from: fromEmail,
      replyTo: REPLY_TO_EMAIL,
      to: [to],
      subject: `Bem-vindo ao Programa de Afiliados ${APP_NAME}!`,
      html,
      text,
    });

    console.log(`[email] Email de boas-vindas de afiliado enviado para ${to}`, result);
    return true;
  } catch (error) {
    console.error(`[email] Erro ao enviar email de boas-vindas de afiliado para ${to}:`, error);
    return false;
  }
}
