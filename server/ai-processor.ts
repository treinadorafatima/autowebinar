import type { AiAgent, AiMessage, AiAgentFile } from "@shared/schema";
import { toZonedTime } from "date-fns-tz";
import { format, addDays } from "date-fns";
import * as calendarService from "./calendar-service";

interface AIResponse {
  content: string;
  tokensUsed: number;
  processingTimeMs: number;
  error?: string;
  calendarAction?: CalendarAction;
}

interface CalendarAction {
  type: "schedule" | "reschedule" | "cancel" | "check_availability" | "list_appointments";
  result?: any;
}

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string | ChatMessageContent[];
}

interface ChatMessageContent {
  type: "text" | "image_url";
  text?: string;
  image_url?: {
    url: string;
    detail?: "low" | "high" | "auto";
  };
}

export interface MediaContent {
  type: "image" | "audio" | "document";
  buffer: Buffer;
  mimetype: string;
  filename?: string;
}

interface CalendarContext {
  enabled: boolean;
  connected: boolean;
  requiresClientAuth?: boolean;
  availableSlots?: calendarService.AvailabilitySlot[];
  upcomingAppointments?: any[];
}

async function buildSystemPromptWithKnowledge(
  agent: AiAgent, 
  knowledgeFiles: AiAgentFile[],
  calendarContext?: CalendarContext
): Promise<string> {
  const humanizationRules = `
REGRAS DE COMUNICAÇÃO (IMPORTANTE):
- Seja natural e humano, como uma pessoa real conversando
- Respostas CURTAS e DIRETAS (máximo 2-3 frases por mensagem)
- NÃO use listas ou bullet points a menos que seja estritamente necessário
- NÃO use formatação markdown (negrito, itálico, etc)
- Use linguagem informal e acolhedora
- Evite textos longos ou explicações excessivas
- Faça uma pergunta de cada vez
- Responda apenas o que foi perguntado

`;
  let systemPrompt = humanizationRules + agent.systemPrompt;
  
  if (knowledgeFiles && knowledgeFiles.length > 0) {
    const knowledgeSection = knowledgeFiles
      .filter(f => f.extractedText)
      .map(f => `### ${f.fileName}\n${f.extractedText}`)
      .join("\n\n");
    
    if (knowledgeSection) {
      systemPrompt += `\n\n=== BASE DE CONHECIMENTO ===\nUse as informações abaixo como referência para responder. SEMPRE consulte esta base antes de responder:\n\n${knowledgeSection}\n\n=== FIM DA BASE DE CONHECIMENTO ===`;
    }
  }

  if (calendarContext?.enabled) {
    if (!calendarContext.connected) {
      const connectionType = calendarContext.requiresClientAuth ? "do cliente" : "do administrador";
      systemPrompt += `\n\n=== AVISO SOBRE AGENDAMENTOS ===
O sistema de agendamentos está habilitado, mas a conta Google Calendar ${connectionType} ainda não foi conectada.
Se o usuário perguntar sobre agendamentos, informe que o serviço de agendamento online não está disponível no momento e sugira que entre em contato por outro meio.
NÃO use tags de calendário como [CALENDAR_SCHEDULE:], etc.
=== FIM DO AVISO ===`;
      return systemPrompt;
    }
    
    const today = new Date();
    const calendarSection = `
=== FUNCIONALIDADES DE AGENDAMENTO ===
Você tem capacidade de agendar, reagendar e cancelar compromissos no calendário do cliente.

INSTRUÇÕES IMPORTANTES:
1. Quando o usuário quiser AGENDAR, inclua no início da sua resposta a tag: [CALENDAR_SCHEDULE:título|data|hora]
   - Formato data: DD/MM/AAAA
   - Formato hora: HH:MM
   - Exemplo: [CALENDAR_SCHEDULE:Consulta Inicial|${format(addDays(today, 1), "dd/MM/yyyy")}|14:00]

2. Quando o usuário quiser REAGENDAR, use: [CALENDAR_RESCHEDULE:eventId|novaData|novaHora]
   - Exemplo: [CALENDAR_RESCHEDULE:abc123|${format(addDays(today, 3), "dd/MM/yyyy")}|15:30]

3. Quando o usuário quiser CANCELAR, use: [CALENDAR_CANCEL:eventId|motivo]
   - Exemplo: [CALENDAR_CANCEL:abc123|Cliente solicitou cancelamento]

4. Para VERIFICAR DISPONIBILIDADE, use: [CALENDAR_CHECK:data]
   - Exemplo: [CALENDAR_CHECK:${format(addDays(today, 1), "dd/MM/yyyy")}]

5. Para LISTAR agendamentos do usuário, use: [CALENDAR_LIST]

REGRAS:
- Sempre confirme os dados antes de agendar (nome, telefone, data, hora)
- Sugira horários disponíveis quando o usuário pedir
- Confirme o agendamento após realizá-lo
- Duração padrão: ${agent.calendarDuration || 60} minutos

${agent.calendarInstructions ? `INSTRUÇÕES ADICIONAIS:\n${agent.calendarInstructions}` : ""}

${calendarContext.availableSlots && calendarContext.availableSlots.length > 0 ? 
  `HORÁRIOS DISPONÍVEIS PARA HOJE:\n${calendarContext.availableSlots.slice(0, 6).map(s => `- ${s.formatted}`).join("\n")}` : ""}

${calendarContext.upcomingAppointments && calendarContext.upcomingAppointments.length > 0 ?
  `PRÓXIMOS AGENDAMENTOS DO CLIENTE:\n${calendarContext.upcomingAppointments.map(a => 
    `- ${a.title}: ${format(new Date(a.startTime), "dd/MM/yyyy")} às ${format(new Date(a.startTime), "HH:mm")}`
  ).join("\n")}` : ""}

=== FIM DAS FUNCIONALIDADES DE AGENDAMENTO ===`;
    
    systemPrompt += calendarSection;
  }
  
  return systemPrompt;
}

async function parseAndExecuteCalendarActions(
  content: string,
  adminId: string,
  contactPhone?: string,
  contactName?: string,
  durationMinutes: number = 60,
  googleCalendarId?: string
): Promise<{ cleanContent: string; actions: CalendarAction[] }> {
  const actions: CalendarAction[] = [];
  let cleanContent = content;

  const scheduleMatch = content.match(/\[CALENDAR_SCHEDULE:([^|]+)\|([^|]+)\|([^\]]+)\]/);
  if (scheduleMatch) {
    const [fullMatch, title, dateStr, timeStr] = scheduleMatch;
    const parsed = calendarService.parseAppointmentDateTime(dateStr, timeStr);
    
    if (parsed) {
      const endTime = new Date(parsed.start.getTime() + durationMinutes * 60000);
      const result = await calendarService.scheduleAppointment(adminId, {
        title,
        startTime: parsed.start,
        endTime,
        attendeeName: contactName,
        attendeePhone: contactPhone,
        googleCalendarId,
      });
      
      actions.push({ type: "schedule", result });
      
      if (result.success) {
        cleanContent = cleanContent.replace(fullMatch, 
          `Agendamento confirmado: ${result.eventDetails?.title} em ${result.eventDetails?.startTime}`
        );
      } else {
        cleanContent = cleanContent.replace(fullMatch, `Erro ao agendar: ${result.message}`);
      }
    }
  }

  const rescheduleMatch = content.match(/\[CALENDAR_RESCHEDULE:([^|]+)\|([^|]+)\|([^\]]+)\]/);
  if (rescheduleMatch) {
    const [fullMatch, eventId, dateStr, timeStr] = rescheduleMatch;
    const parsed = calendarService.parseAppointmentDateTime(dateStr, timeStr);
    
    if (parsed) {
      const endTime = new Date(parsed.start.getTime() + durationMinutes * 60000);
      const result = await calendarService.rescheduleAppointment(adminId, eventId, parsed.start, endTime, googleCalendarId);
      
      actions.push({ type: "reschedule", result });
      
      if (result.success) {
        cleanContent = cleanContent.replace(fullMatch, 
          `Reagendamento confirmado para ${result.eventDetails?.startTime}`
        );
      } else {
        cleanContent = cleanContent.replace(fullMatch, `Erro ao reagendar: ${result.message}`);
      }
    }
  }

  const cancelMatch = content.match(/\[CALENDAR_CANCEL:([^|]+)\|([^\]]+)\]/);
  if (cancelMatch) {
    const [fullMatch, eventId, reason] = cancelMatch;
    const result = await calendarService.cancelAppointment(adminId, eventId, reason, googleCalendarId);
    
    actions.push({ type: "cancel", result });
    
    if (result.success) {
      cleanContent = cleanContent.replace(fullMatch, `Agendamento cancelado com sucesso.`);
    } else {
      cleanContent = cleanContent.replace(fullMatch, `Erro ao cancelar: ${result.message}`);
    }
  }

  const checkMatch = content.match(/\[CALENDAR_CHECK:([^\]]+)\]/);
  if (checkMatch) {
    const [fullMatch, dateStr] = checkMatch;
    const dateMatch = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
    
    if (dateMatch) {
      const day = parseInt(dateMatch[1]);
      const month = parseInt(dateMatch[2]) - 1;
      const year = dateMatch[3] ? (dateMatch[3].length === 2 ? 2000 + parseInt(dateMatch[3]) : parseInt(dateMatch[3])) : new Date().getFullYear();
      const date = new Date(year, month, day);
      
      const slots = await calendarService.getAvailableSlots(adminId, date, durationMinutes, "America/Sao_Paulo", googleCalendarId);
      const message = calendarService.formatAvailableSlotsMessage(slots, date);
      
      actions.push({ type: "check_availability", result: { slots, date } });
      cleanContent = cleanContent.replace(fullMatch, message);
    }
  }

  const listMatch = content.match(/\[CALENDAR_LIST\]/);
  if (listMatch) {
    const appointments = await calendarService.getUpcomingAppointments(adminId, contactPhone);
    
    actions.push({ type: "list_appointments", result: appointments });
    
    if (appointments.length === 0) {
      cleanContent = cleanContent.replace(listMatch[0], "Você não tem agendamentos futuros.");
    } else {
      const appointmentsList = appointments.map(a => 
        `- ${a.title}: ${format(new Date(a.startTime), "dd/MM/yyyy")} às ${format(new Date(a.startTime), "HH:mm")}`
      ).join("\n");
      cleanContent = cleanContent.replace(listMatch[0], `Seus agendamentos:\n${appointmentsList}`);
    }
  }

  return { cleanContent, actions };
}

async function callOpenAI(apiKey: string, model: string, messages: ChatMessage[], maxTokens: number, temperature: number): Promise<AIResponse> {
  const startTime = Date.now();
  
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature: temperature / 100,
    }),
  });

  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error?.message || "Erro na API OpenAI");
  }

  return {
    content: data.choices[0]?.message?.content || "",
    tokensUsed: data.usage?.total_tokens || 0,
    processingTimeMs: Date.now() - startTime,
  };
}

async function callGemini(apiKey: string, model: string, messages: ChatMessage[], maxTokens: number, temperature: number): Promise<AIResponse> {
  const startTime = Date.now();
  
  const systemMessage = messages.find(m => m.role === "system")?.content || "";
  const chatMessages = messages.filter(m => m.role !== "system");
  
  const contents = chatMessages.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      systemInstruction: systemMessage ? { parts: [{ text: systemMessage }] } : undefined,
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature: temperature / 100,
      },
    }),
  });

  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error?.message || "Erro na API Gemini");
  }

  return {
    content: data.candidates?.[0]?.content?.parts?.[0]?.text || "",
    tokensUsed: (data.usageMetadata?.promptTokenCount || 0) + (data.usageMetadata?.candidatesTokenCount || 0),
    processingTimeMs: Date.now() - startTime,
  };
}

async function callDeepSeek(apiKey: string, model: string, messages: ChatMessage[], maxTokens: number, temperature: number): Promise<AIResponse> {
  const startTime = Date.now();
  
  const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature: temperature / 100,
    }),
  });

  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error?.message || "Erro na API DeepSeek");
  }

  return {
    content: data.choices[0]?.message?.content || "",
    tokensUsed: data.usage?.total_tokens || 0,
    processingTimeMs: Date.now() - startTime,
  };
}

async function callGrok(apiKey: string, model: string, messages: ChatMessage[], maxTokens: number, temperature: number): Promise<AIResponse> {
  const startTime = Date.now();
  
  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature: temperature / 100,
    }),
  });

  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error?.message || "Erro na API Grok");
  }

  return {
    content: data.choices[0]?.message?.content || "",
    tokensUsed: data.usage?.total_tokens || 0,
    processingTimeMs: Date.now() - startTime,
  };
}

// Transcreve áudio usando OpenAI Whisper API
export async function transcribeAudio(apiKey: string, audioBuffer: Buffer, mimetype: string): Promise<{ text: string; error?: string }> {
  try {
    // Determine file extension based on mimetype
    let extension = "ogg";
    if (mimetype.includes("mp3") || mimetype.includes("mpeg")) extension = "mp3";
    else if (mimetype.includes("mp4") || mimetype.includes("m4a")) extension = "m4a";
    else if (mimetype.includes("wav")) extension = "wav";
    else if (mimetype.includes("webm")) extension = "webm";
    
    // Use native FormData and Blob for Node.js fetch compatibility
    const formData = new FormData();
    const audioBlob = new Blob([audioBuffer], { type: mimetype });
    formData.append("file", audioBlob, `audio.${extension}`);
    formData.append("model", "whisper-1");
    formData.append("language", "pt");
    
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
      },
      body: formData,
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      console.error("[ai-processor] Whisper API error:", data);
      return { text: "", error: data.error?.message || "Erro ao transcrever áudio" };
    }
    
    console.log(`[ai-processor] Audio transcribed: "${data.text?.substring(0, 100)}..."`);
    return { text: data.text || "" };
  } catch (error: any) {
    console.error("[ai-processor] Error transcribing audio:", error);
    return { text: "", error: error.message };
  }
}

// Analisa imagem usando GPT-4 Vision
export async function analyzeImage(
  apiKey: string, 
  imageBuffer: Buffer, 
  mimetype: string, 
  userPrompt?: string
): Promise<{ description: string; error?: string }> {
  try {
    const base64Image = imageBuffer.toString("base64");
    const mimeType = mimetype.startsWith("image/") ? mimetype : "image/jpeg";
    
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: userPrompt || "Descreva esta imagem de forma breve e objetiva em português. O que você vê?",
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`,
                  detail: "low",
                },
              },
            ],
          },
        ],
        max_tokens: 300,
      }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      console.error("[ai-processor] Vision API error:", data);
      return { description: "", error: data.error?.message || "Erro ao analisar imagem" };
    }
    
    const description = data.choices?.[0]?.message?.content || "";
    console.log(`[ai-processor] Image analyzed: "${description.substring(0, 100)}..."`);
    return { description };
  } catch (error: any) {
    console.error("[ai-processor] Error analyzing image:", error);
    return { description: "", error: error.message };
  }
}

// Processa mensagem com mídia (imagem ou áudio)
export async function processMediaMessage(
  agent: AiAgent,
  media: MediaContent,
  textMessage: string,
  conversationHistory: AiMessage[],
  knowledgeFiles: AiAgentFile[] = [],
  calendarContext?: {
    adminId: string;
    contactPhone?: string;
    contactName?: string;
    googleCalendarId?: string;
  }
): Promise<AIResponse> {
  try {
    // Só suporta OpenAI para mídia (Vision e Whisper)
    if (agent.provider !== "openai") {
      return {
        content: "Desculpe, o processamento de imagens e áudios só está disponível com o provedor OpenAI. No momento, só consigo responder mensagens de texto.",
        tokensUsed: 0,
        processingTimeMs: 0,
      };
    }
    
    let processedContent = textMessage;
    
    if (media.type === "audio") {
      // Transcreve o áudio
      const transcription = await transcribeAudio(agent.apiKey, media.buffer, media.mimetype);
      
      if (transcription.error || !transcription.text) {
        return {
          content: "Desculpe, não consegui entender o áudio. Pode enviar uma mensagem de texto?",
          tokensUsed: 0,
          processingTimeMs: 0,
          error: transcription.error,
        };
      }
      
      processedContent = transcription.text;
      console.log(`[ai-processor] Audio transcribed to: "${processedContent.substring(0, 50)}..."`);
      
    } else if (media.type === "image") {
      // Analisa a imagem
      const analysis = await analyzeImage(agent.apiKey, media.buffer, media.mimetype, textMessage || undefined);
      
      if (analysis.error || !analysis.description) {
        return {
          content: "Desculpe, não consegui analisar a imagem. Pode descrever o que precisa?",
          tokensUsed: 0,
          processingTimeMs: 0,
          error: analysis.error,
        };
      }
      
      // Se o usuário enviou texto junto com a imagem, combina
      if (textMessage) {
        processedContent = `[O usuário enviou uma imagem. Descrição da imagem: ${analysis.description}]\n\nMensagem do usuário: ${textMessage}`;
      } else {
        processedContent = `[O usuário enviou uma imagem. Descrição da imagem: ${analysis.description}]\n\nResponda sobre o que você viu na imagem.`;
      }
      
      console.log(`[ai-processor] Image analyzed, content: "${processedContent.substring(0, 80)}..."`);
      
    } else if (media.type === "document") {
      // Por enquanto só informa que recebeu o documento
      return {
        content: `Recebi seu documento "${media.filename || 'arquivo'}". No momento, consigo processar melhor imagens e áudios. Pode me dizer o que precisa sobre este documento?`,
        tokensUsed: 0,
        processingTimeMs: 0,
      };
    }
    
    // Agora processa a mensagem normalmente com o conteúdo extraído
    return processMessage(agent, processedContent, conversationHistory, knowledgeFiles, calendarContext);
    
  } catch (error: any) {
    console.error("[ai-processor] Error processing media message:", error);
    return {
      content: "",
      tokensUsed: 0,
      processingTimeMs: 0,
      error: error.message,
    };
  }
}

export async function processMessage(
  agent: AiAgent,
  userMessage: string,
  conversationHistory: AiMessage[],
  knowledgeFiles: AiAgentFile[] = [],
  calendarContext?: {
    adminId: string;
    contactPhone?: string;
    contactName?: string;
    googleCalendarId?: string;
  }
): Promise<AIResponse> {
  try {
    let calendarCtx: CalendarContext | undefined;
    let googleCalendarId: string | undefined;
    
    if (agent.calendarEnabled && calendarContext?.adminId) {
      googleCalendarId = calendarContext.googleCalendarId;
      const connected = await calendarService.checkCalendarConnected(calendarContext.adminId);
      if (connected) {
        const today = new Date();
        const availableSlots = await calendarService.getAvailableSlots(
          calendarContext.adminId, 
          today, 
          agent.calendarDuration || 60,
          "America/Sao_Paulo",
          googleCalendarId
        );
        const upcomingAppointments = calendarContext.contactPhone 
          ? await calendarService.getUpcomingAppointments(calendarContext.adminId, calendarContext.contactPhone)
          : [];
        
        calendarCtx = {
          enabled: true,
          connected: true,
          availableSlots,
          upcomingAppointments,
        };
      } else {
        calendarCtx = {
          enabled: true,
          connected: false,
        };
      }
    }
    
    const fullSystemPrompt = await buildSystemPromptWithKnowledge(agent, knowledgeFiles, calendarCtx);
    
    const messages: ChatMessage[] = [
      { role: "system", content: fullSystemPrompt },
    ];

    const recentHistory = conversationHistory.slice(-agent.memoryLength);
    for (const msg of recentHistory) {
      messages.push({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      });
    }

    messages.push({ role: "user", content: userMessage });

    let response: AIResponse;

    switch (agent.provider) {
      case "openai":
        response = await callOpenAI(agent.apiKey, agent.model, messages, agent.maxTokens, agent.temperature);
        break;
      case "gemini":
        response = await callGemini(agent.apiKey, agent.model, messages, agent.maxTokens, agent.temperature);
        break;
      case "deepseek":
        response = await callDeepSeek(agent.apiKey, agent.model, messages, agent.maxTokens, agent.temperature);
        break;
      case "grok":
        response = await callGrok(agent.apiKey, agent.model, messages, agent.maxTokens, agent.temperature);
        break;
      default:
        throw new Error(`Provedor não suportado: ${agent.provider}`);
    }

    if (agent.calendarEnabled && calendarContext?.adminId && response.content && calendarCtx?.connected) {
      const { cleanContent, actions } = await parseAndExecuteCalendarActions(
        response.content,
        calendarContext.adminId,
        calendarContext.contactPhone,
        calendarContext.contactName,
        agent.calendarDuration || 60,
        googleCalendarId
      );
      
      response.content = cleanContent;
      
      if (actions.length > 0) {
        response.calendarAction = actions[0];
      }
    } else if (agent.calendarEnabled && response.content) {
      response.content = response.content
        .replace(/\[CALENDAR_SCHEDULE:[^\]]+\]/g, "Desculpe, o sistema de agendamento não está disponível no momento.")
        .replace(/\[CALENDAR_RESCHEDULE:[^\]]+\]/g, "Desculpe, o sistema de agendamento não está disponível no momento.")
        .replace(/\[CALENDAR_CANCEL:[^\]]+\]/g, "Desculpe, o sistema de agendamento não está disponível no momento.")
        .replace(/\[CALENDAR_CHECK:[^\]]+\]/g, "Desculpe, o sistema de agendamento não está disponível no momento.")
        .replace(/\[CALENDAR_LIST\]/g, "Desculpe, o sistema de agendamento não está disponível no momento.");
    }

    return response;
  } catch (error: any) {
    console.error(`[ai-processor] Error processing message:`, error);
    return {
      content: "",
      tokensUsed: 0,
      processingTimeMs: 0,
      error: error.message,
    };
  }
}

export function checkWorkingHours(agent: AiAgent): boolean {
  if (!agent.workingHoursEnabled) {
    return true;
  }

  const timezone = (agent as any).timezone || "America/Sao_Paulo";
  const now = new Date();
  const zonedNow = toZonedTime(now, timezone);
  
  const currentDay = zonedNow.getDay() || 7;
  const workingDays = (agent.workingDays || "1,2,3,4,5").split(",").map(d => parseInt(d));
  
  if (!workingDays.includes(currentDay)) {
    return false;
  }

  const [startHour, startMinute] = (agent.workingHoursStart || "09:00").split(":").map(n => parseInt(n));
  const [endHour, endMinute] = (agent.workingHoursEnd || "18:00").split(":").map(n => parseInt(n));

  const currentMinutes = zonedNow.getHours() * 60 + zonedNow.getMinutes();
  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;

  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}

export function checkEscalationKeywords(agent: AiAgent, message: string): boolean {
  if (!agent.escalationKeywords) {
    return false;
  }

  const keywords = agent.escalationKeywords.split(",").map(k => k.trim().toLowerCase());
  const lowerMessage = message.toLowerCase();
  
  return keywords.some(keyword => keyword && lowerMessage.includes(keyword));
}
