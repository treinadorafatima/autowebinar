import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Loader2, Send, Copy, Download, Mail, MessageCircle, Sparkles, Wand2, FileText, Plus, MoreVertical, Pencil, Trash2, Mic, CheckCircle2, AlertCircle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import { saveAs } from "file-saver";
import { FeatureBlocked } from "@/components/feature-blocked";
import { Skeleton } from "@/components/ui/skeleton";

interface SubscriptionData {
  admin: { id: string; role?: string };
  plano: {
    featureAI?: boolean;
    featureDesignerIA?: boolean;
    featureGeradorMensagens?: boolean;
    featureTranscricao?: boolean;
  } | null;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface Script {
  id: string;
  webinarId: string;
  title: string;
  script: string;
  emailMessage?: string;
  whatsappMessage?: string;
}

interface Webinar {
  id: string;
  name: string;
}

interface Transcription {
  id: number;
  status: string;
  transcription: string | null;
}

interface AiMessageChat {
  id: string;
  ownerId: string;
  webinarId: string | null;
  scriptId: string | null;
  title: string;
  messages: string;
  generatedEmail: string;
  generatedWhatsapp: string;
  createdAt: string;
  updatedAt: string;
}

const quickSuggestions = [
  "Email de convite formal",
  "WhatsApp urgente",
  "Lembrete amigável",
  "Oferta especial",
];

function renderMarkdown(text: string): JSX.Element[] {
  const parts: JSX.Element[] = [];
  let key = 0;
  
  const lines = text.split('\n');
  
  lines.forEach((line, lineIndex) => {
    let remaining = line;
    const lineElements: JSX.Element[] = [];
    
    while (remaining.length > 0) {
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
      const italicMatch = remaining.match(/\*([^*]+)\*/);
      
      if (boldMatch && boldMatch.index !== undefined) {
        if (boldMatch.index > 0) {
          lineElements.push(<span key={key++}>{remaining.substring(0, boldMatch.index)}</span>);
        }
        lineElements.push(<strong key={key++} className="font-bold">{boldMatch[1]}</strong>);
        remaining = remaining.substring(boldMatch.index + boldMatch[0].length);
      } else if (italicMatch && italicMatch.index !== undefined && !remaining.startsWith('**')) {
        if (italicMatch.index > 0) {
          lineElements.push(<span key={key++}>{remaining.substring(0, italicMatch.index)}</span>);
        }
        lineElements.push(<em key={key++} className="italic">{italicMatch[1]}</em>);
        remaining = remaining.substring(italicMatch.index + italicMatch[0].length);
      } else {
        lineElements.push(<span key={key++}>{remaining}</span>);
        remaining = '';
      }
    }
    
    parts.push(<span key={`line-${lineIndex}`}>{lineElements}</span>);
    if (lineIndex < lines.length - 1) {
      parts.push(<br key={`br-${lineIndex}`} />);
    }
  });
  
  return parts;
}

export default function MessageGeneratorPage() {
  const { toast } = useToast();
  const [selectedWebinar, setSelectedWebinar] = useState<string>("");
  const [selectedScript, setSelectedScript] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState("");
  const [generatedEmail, setGeneratedEmail] = useState("");
  const [generatedWhatsapp, setGeneratedWhatsapp] = useState("");
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [chatToRename, setChatToRename] = useState<AiMessageChat | null>(null);
  const [newChatTitle, setNewChatTitle] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { data: subscription, isLoading: isLoadingSubscription } = useQuery<SubscriptionData>({
    queryKey: ["/api/admin/subscription"],
  });

  const { data: webinars = [] } = useQuery<Webinar[]>({
    queryKey: ["/api/webinars"],
  });

  const { data: scripts = [] } = useQuery<Script[]>({
    queryKey: ["/api/webinars", selectedWebinar, "scripts"],
    enabled: !!selectedWebinar,
  });

  const { data: transcription } = useQuery<Transcription | null>({
    queryKey: ["/api/webinars", selectedWebinar, "transcription"],
    enabled: !!selectedWebinar,
  });

  const { data: chatHistory = [], isLoading: isLoadingChats } = useQuery<AiMessageChat[]>({
    queryKey: ["/api/ai/message-chats"],
  });

  const createChatMutation = useMutation({
    mutationFn: async (data: { title: string; webinarId?: string; scriptId?: string }) => {
      const res = await apiRequest("POST", "/api/ai/message-chats", data);
      return res.json();
    },
    onSuccess: (data: AiMessageChat) => {
      setCurrentChatId(data.id);
      queryClient.invalidateQueries({ queryKey: ["/api/ai/message-chats"] });
    },
  });

  const updateChatMutation = useMutation({
    mutationFn: async ({ chatId, data }: { chatId: string; data: Partial<AiMessageChat> }) => {
      const res = await apiRequest("PATCH", `/api/ai/message-chats/${chatId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai/message-chats"] });
    },
  });

  const deleteChatMutation = useMutation({
    mutationFn: async (chatId: string) => {
      return apiRequest("DELETE", `/api/ai/message-chats/${chatId}`);
    },
    onSuccess: () => {
      if (currentChatId === chatToRename?.id) {
        resetChat();
      }
      queryClient.invalidateQueries({ queryKey: ["/api/ai/message-chats"] });
      toast({ description: "Conversa excluída!" });
    },
  });

  const generateMessagesMutation = useMutation({
    mutationFn: async ({ userMessage, conversationHistory }: { userMessage: string; conversationHistory: Message[] }) => {
      const script = scripts.find((s) => s.id === selectedScript);
      if (!script) throw new Error("Selecione um roteiro");

      const res = await apiRequest("POST", `/api/webinars/${selectedWebinar}/scripts/${selectedScript}/generate-messages-chat`, {
        userMessage,
        conversationHistory: conversationHistory.map(m => ({ role: m.role, content: m.content })),
      });
      return res.json();
    },
    onSuccess: (data: { message: string; emailMessage?: string; whatsappMessage?: string }) => {
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.message,
        timestamp: new Date(),
      };
      
      setMessages(prev => [...prev, assistantMessage]);
      
      if (data.emailMessage) {
        setGeneratedEmail(data.emailMessage);
      }
      if (data.whatsappMessage) {
        setGeneratedWhatsapp(data.whatsappMessage);
      }
    },
    onError: (error: any) => {
      toast({ description: error.message || "Erro ao gerar mensagens", variant: "destructive" });
    },
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (currentChatId && messages.length > 0) {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }

      autoSaveTimeoutRef.current = setTimeout(() => {
        updateChatMutation.mutate({
          chatId: currentChatId,
          data: {
            messages: JSON.stringify(messages),
            generatedEmail,
            generatedWhatsapp,
            webinarId: selectedWebinar || null,
            scriptId: selectedScript || null,
          },
        });
      }, 1000);
    }

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [messages, generatedEmail, generatedWhatsapp, currentChatId]);

  const isSuperadmin = subscription?.admin?.role === "superadmin";
  const hasGeradorMensagensAccess = isSuperadmin || subscription?.plano?.featureGeradorMensagens === true;

  if (isLoadingSubscription) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!hasGeradorMensagensAccess) {
    return (
      <FeatureBlocked
        featureName="Gerador de Mensagens com IA"
        description="O Gerador de Mensagens com IA está disponível apenas para planos com esse recurso ativado. Faça upgrade para gerar emails e mensagens de WhatsApp automaticamente."
      />
    );
  }

  const resetChat = () => {
    setCurrentChatId(null);
    setMessages([]);
    setGeneratedEmail("");
    setGeneratedWhatsapp("");
  };

  const loadChat = (chat: AiMessageChat) => {
    setCurrentChatId(chat.id);
    try {
      const parsedMessages = JSON.parse(chat.messages || "[]");
      setMessages(parsedMessages.map((m: any) => ({
        ...m,
        timestamp: new Date(m.timestamp),
      })));
    } catch {
      setMessages([]);
    }
    setGeneratedEmail(chat.generatedEmail || "");
    setGeneratedWhatsapp(chat.generatedWhatsapp || "");
    if (chat.webinarId) {
      setSelectedWebinar(chat.webinarId);
    }
    if (chat.scriptId) {
      setSelectedScript(chat.scriptId);
    }
  };

  const handleSendMessage = async (customMessage?: string) => {
    const messageText = customMessage || userInput.trim();
    if (!messageText || !selectedWebinar || !selectedScript) return;

    const newMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: messageText,
      timestamp: new Date(),
    };

    const updatedMessages = [...messages, newMessage];
    setMessages(updatedMessages);
    setUserInput("");

    if (!currentChatId) {
      const title = messageText.slice(0, 50) + (messageText.length > 50 ? "..." : "");
      const newChat = await createChatMutation.mutateAsync({ 
        title, 
        webinarId: selectedWebinar,
        scriptId: selectedScript,
      });
      setCurrentChatId(newChat.id);
    }

    generateMessagesMutation.mutate({
      userMessage: messageText,
      conversationHistory: updatedMessages.slice(0, -1),
    });
  };

  const handleRename = () => {
    if (!chatToRename || !newChatTitle.trim()) return;
    
    updateChatMutation.mutate({
      chatId: chatToRename.id,
      data: { title: newChatTitle.trim() },
    });
    
    setRenameDialogOpen(false);
    setChatToRename(null);
    setNewChatTitle("");
    toast({ description: "Conversa renomeada!" });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ description: "Copiado!" });
  };

  const exportMessage = async (text: string, filename: string, format: "txt" | "docx") => {
    if (format === "txt") {
      const blob = new Blob([text], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filename}.txt`;
      a.click();
    } else if (format === "docx") {
      const paragraphs = text.split("\n").map((line) => {
        return new Paragraph({
          children: [new TextRun({ text: line || " " })],
          spacing: { after: 100 },
        });
      });

      const doc = new Document({
        sections: [{
          properties: {},
          children: [
            new Paragraph({
              text: filename.includes("email") ? "Mensagem de Email" : "Mensagem de WhatsApp",
              heading: HeadingLevel.TITLE,
              spacing: { after: 400 },
            }),
            ...paragraphs,
          ],
        }],
      });

      const blob = await Packer.toBlob(doc);
      saveAs(blob, `${filename}.docx`);
      toast({ description: "Documento Word exportado com sucesso!" });
    }
  };

  const currentScript = scripts.find((s) => s.id === selectedScript);

  return (
    <div className="flex h-full">
      {/* Left Sidebar - Chat History */}
      <div className="w-64 border-r bg-muted/30 flex flex-col">
        <div className="p-3 border-b">
          <Button
            onClick={resetChat}
            variant="outline"
            className="w-full gap-2"
            data-testid="button-new-message-chat"
          >
            <Plus className="w-4 h-4" />
            Nova Conversa
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {isLoadingChats ? (
              <div className="flex justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : chatHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhuma conversa ainda
              </p>
            ) : (
              chatHistory.map((chat) => (
                <div
                  key={chat.id}
                  className={`group flex items-center gap-2 p-2 rounded-md cursor-pointer hover-elevate ${
                    currentChatId === chat.id ? "bg-accent" : ""
                  }`}
                  onClick={() => loadChat(chat)}
                  data-testid={`chat-item-${chat.id}`}
                >
                  <MessageCircle className="w-4 h-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 text-sm truncate">{chat.title}</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100"
                        data-testid={`button-chat-menu-${chat.id}`}
                      >
                        <MoreVertical className="w-3 h-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          setChatToRename(chat);
                          setNewChatTitle(chat.title);
                          setRenameDialogOpen(true);
                        }}
                        data-testid={`button-rename-chat-${chat.id}`}
                      >
                        <Pencil className="w-4 h-4 mr-2" />
                        Renomear
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteChatMutation.mutate(chat.id);
                        }}
                        className="text-destructive"
                        data-testid={`button-delete-chat-${chat.id}`}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="p-6 border-b bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-cyan-500/10">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg">
              <MessageCircle className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold">Gerador de Mensagens IA</h1>
              <p className="text-muted-foreground text-sm">
                Crie emails e mensagens WhatsApp a partir dos seus roteiros
              </p>
            </div>
            <div className="flex gap-2">
              <Select value={selectedWebinar} onValueChange={(v) => { setSelectedWebinar(v); setSelectedScript(""); }}>
                <SelectTrigger className="w-40" data-testid="select-webinar-msg">
                  <SelectValue placeholder="Webinário" />
                </SelectTrigger>
                <SelectContent>
                  {webinars.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedScript} onValueChange={setSelectedScript} disabled={!selectedWebinar}>
                <SelectTrigger className="w-40" data-testid="select-script-msg">
                  <SelectValue placeholder="Roteiro" />
                </SelectTrigger>
                <SelectContent>
                  {scripts.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {selectedWebinar && (
            <div className="mt-3 flex items-center gap-2">
              <Mic className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Transcrição do vídeo:</span>
              {transcription?.status === "completed" ? (
                <Badge className="bg-green-600 gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Disponível
                </Badge>
              ) : transcription?.status === "processing" ? (
                <Badge className="bg-yellow-600 gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Processando
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Não disponível
                </Badge>
              )}
              {transcription?.status === "completed" && (
                <span className="text-xs text-green-600 dark:text-green-400">
                  A IA usará o conteúdo do vídeo para gerar emails e WhatsApp mais precisos
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Chat Area */}
          <div className="flex-1 flex flex-col">
            {/* Messages or Welcome */}
            <div className="flex-1 overflow-auto p-6">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-500/20 to-teal-600/20 flex items-center justify-center mb-6">
                    <Sparkles className="w-8 h-8 text-emerald-500" />
                  </div>
                  <h2 className="text-xl font-semibold mb-2">
                    Pronto para criar mensagens!
                  </h2>
                  <p className="text-muted-foreground max-w-md mb-8">
                    Selecione um webinário e roteiro, depois me diga que tipo de mensagem você precisa.
                  </p>
                  
                  {/* Quick Suggestions */}
                  <div className="flex flex-wrap gap-2 justify-center">
                    {quickSuggestions.map((suggestion) => (
                      <Button
                        key={suggestion}
                        variant="outline"
                        size="sm"
                        className="rounded-full"
                        onClick={() => handleSendMessage(`Quero criar um ${suggestion.toLowerCase()}`)}
                        disabled={!selectedWebinar || !selectedScript || generateMessagesMutation.isPending}
                        data-testid={`button-suggestion-${suggestion.toLowerCase().replace(/\s+/g, "-")}`}
                      >
                        {suggestion}
                      </Button>
                    ))}
                  </div>
                  
                  {!selectedWebinar && (
                    <p className="text-sm text-amber-600 dark:text-amber-400 mt-6">
                      Selecione um webinário para começar
                    </p>
                  )}
                  {selectedWebinar && !selectedScript && scripts.length === 0 && (
                    <p className="text-sm text-amber-600 dark:text-amber-400 mt-6">
                      Nenhum roteiro salvo. Crie um roteiro primeiro na aba "Roteiros".
                    </p>
                  )}
                  {selectedWebinar && !selectedScript && scripts.length > 0 && (
                    <p className="text-sm text-amber-600 dark:text-amber-400 mt-6">
                      Selecione um roteiro para continuar
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-4 max-w-3xl mx-auto">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                          message.role === "user"
                            ? "bg-emerald-500 text-white"
                            : "bg-muted"
                        }`}
                      >
                        <p className="text-sm">{renderMarkdown(message.content)}</p>
                      </div>
                    </div>
                  ))}
                  
                  {generateMessagesMutation.isPending && (
                    <div className="flex justify-start">
                      <div className="bg-muted rounded-2xl px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span className="text-sm text-muted-foreground">Gerando...</span>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Input */}
            <div className="p-4 border-t bg-background">
              <div className="max-w-3xl mx-auto flex gap-2">
                <div className="flex-1 relative">
                  <Input
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder={selectedScript ? "Descreva a mensagem que precisa..." : "Selecione webinário e roteiro primeiro"}
                    disabled={!selectedWebinar || !selectedScript || generateMessagesMutation.isPending}
                    className="pr-12"
                    data-testid="input-message-chat"
                  />
                </div>
                <Button
                  size="icon"
                  className="shrink-0 rounded-full bg-emerald-500 hover:bg-emerald-600"
                  onClick={() => handleSendMessage()}
                  disabled={!userInput.trim() || !selectedWebinar || !selectedScript || generateMessagesMutation.isPending}
                  data-testid="button-send-message"
                >
                  {generateMessagesMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Right Sidebar - Generated Messages */}
          {(generatedEmail || generatedWhatsapp) && (
            <div className="w-96 border-l flex flex-col bg-muted/30">
              <div className="p-4 overflow-auto flex-1">
                <h3 className="font-semibold text-sm mb-3">Mensagens Geradas</h3>
                <Tabs defaultValue="email" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 mb-4">
                    <TabsTrigger value="email" className="gap-2" disabled={!generatedEmail}>
                      <Mail className="w-4 h-4" />
                      Email
                    </TabsTrigger>
                    <TabsTrigger value="whatsapp" className="gap-2" disabled={!generatedWhatsapp}>
                      <MessageCircle className="w-4 h-4" />
                      WhatsApp
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="email" className="space-y-3">
                    <Textarea
                      value={generatedEmail}
                      onChange={(e) => setGeneratedEmail(e.target.value)}
                      className="min-h-48 text-sm"
                      data-testid="textarea-generated-email"
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(generatedEmail)}
                        data-testid="button-copy-email"
                      >
                        <Copy className="w-4 h-4 mr-2" />
                        Copiar
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" data-testid="button-export-email">
                            <Download className="w-4 h-4 mr-2" />
                            Exportar
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => exportMessage(generatedEmail, "email-webinar", "txt")}>
                            <FileText className="w-4 h-4 mr-2" />
                            Exportar TXT
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => exportMessage(generatedEmail, "email-webinar", "docx")}>
                            <FileText className="w-4 h-4 mr-2" />
                            Exportar Word
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TabsContent>

                  <TabsContent value="whatsapp" className="space-y-3">
                    <Textarea
                      value={generatedWhatsapp}
                      onChange={(e) => setGeneratedWhatsapp(e.target.value)}
                      className="min-h-48 text-sm"
                      data-testid="textarea-generated-whatsapp"
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(generatedWhatsapp)}
                        data-testid="button-copy-whatsapp"
                      >
                        <Copy className="w-4 h-4 mr-2" />
                        Copiar
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" data-testid="button-export-whatsapp">
                            <Download className="w-4 h-4 mr-2" />
                            Exportar
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => exportMessage(generatedWhatsapp, "whatsapp-webinar", "txt")}>
                            <FileText className="w-4 h-4 mr-2" />
                            Exportar TXT
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => exportMessage(generatedWhatsapp, "whatsapp-webinar", "docx")}>
                            <FileText className="w-4 h-4 mr-2" />
                            Exportar Word
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renomear Conversa</DialogTitle>
          </DialogHeader>
          <Input
            value={newChatTitle}
            onChange={(e) => setNewChatTitle(e.target.value)}
            placeholder="Novo título"
            data-testid="input-rename-chat"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleRename} data-testid="button-confirm-rename">
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
