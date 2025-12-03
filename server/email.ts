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
const APP_URL = process.env.REPLIT_DEV_DOMAIN 
  ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
  : "https://autowebinar.shop";

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

export async function sendPaymentFailedEmail(to: string, name: string, planName: string, reason: string): Promise<boolean> {
  try {
    const { client, fromEmail } = getResendClient();
    
    const text = `
Ola ${name},

Nao conseguimos processar a renovacao automatica do seu plano ${planName}.

Motivo: ${reason || "Cartao recusado ou limite insuficiente"}

Para evitar a suspensao da sua conta, atualize seu metodo de pagamento ou faca uma renovacao manual.

Atualizar pagamento: ${APP_URL}/admin/assinatura

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
  <title>Problema no Pagamento - ${APP_NAME}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="background-color: #f59e0b; padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 600;">Problema no Pagamento</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Ola <strong>${name}</strong>,
              </p>
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Nao conseguimos processar a renovacao automatica do seu plano <strong>${planName}</strong>.
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 25px 0; background-color: #fffbeb; border-radius: 6px;">
                <tr>
                  <td style="padding: 16px;">
                    <p style="margin: 0 0 8px; color: #92400e; font-weight: 600; font-size: 14px;">
                      Motivo:
                    </p>
                    <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.6;">
                      ${reason || "Cartao recusado ou limite insuficiente"}
                    </p>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Para evitar a suspensao da sua conta, atualize seu metodo de pagamento ou faca uma renovacao manual.
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align: center; padding: 25px 0;">
                    <a href="${APP_URL}/admin/assinatura" style="display: inline-block; background-color: #3b82f6; color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      Atualizar Pagamento
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
      subject: `Problema no pagamento - ${APP_NAME}`,
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
