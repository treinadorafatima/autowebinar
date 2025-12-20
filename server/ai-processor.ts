import type { AiAgent, AiMessage, AiAgentFile } from "@shared/schema";
import { toZonedTime } from "date-fns-tz";

interface AIResponse {
  content: string;
  tokensUsed: number;
  processingTimeMs: number;
  error?: string;
}

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

function buildSystemPromptWithKnowledge(agent: AiAgent, knowledgeFiles: AiAgentFile[]): string {
  let systemPrompt = agent.systemPrompt;
  
  if (knowledgeFiles && knowledgeFiles.length > 0) {
    const knowledgeSection = knowledgeFiles
      .filter(f => f.extractedText)
      .map(f => `### ${f.fileName}\n${f.extractedText}`)
      .join("\n\n");
    
    if (knowledgeSection) {
      systemPrompt += `\n\n=== BASE DE CONHECIMENTO ===\nUse as informações abaixo como referência para responder. SEMPRE consulte esta base antes de responder:\n\n${knowledgeSection}\n\n=== FIM DA BASE DE CONHECIMENTO ===`;
    }
  }
  
  return systemPrompt;
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

export async function processMessage(
  agent: AiAgent,
  userMessage: string,
  conversationHistory: AiMessage[],
  knowledgeFiles: AiAgentFile[] = []
): Promise<AIResponse> {
  try {
    const fullSystemPrompt = buildSystemPromptWithKnowledge(agent, knowledgeFiles);
    
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
