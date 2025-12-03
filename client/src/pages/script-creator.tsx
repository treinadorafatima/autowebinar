import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Loader2, Send, Save, Download, Trash2, Sparkles, Wand2, FileText, Plus, MessageSquare, MoreVertical, Pencil } from "lucide-react";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import { saveAs } from "file-saver";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface Webinar {
  id: string;
  name: string;
}

interface SavedScript {
  id: string;
  webinarId: string;
  title: string;
  script: string;
  createdAt: string;
}

interface AiChat {
  id: string;
  ownerId: string;
  webinarId: string | null;
  title: string;
  messages: string;
  generatedScript: string;
  createdAt: string;
  updatedAt: string;
}

const quickSuggestions = [
  "Webinário de vendas",
  "Lançamento de produto",
  "Curso online",
  "Mentoria exclusiva",
];

function renderMarkdownInline(text: string, keyPrefix: string) {
  const parts: (string | JSX.Element)[] = [];
  let keyIndex = 0;
  
  const regex = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*([^*]+)\*|___(.+?)___|__(.+?)__|_([^_]+)_)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[2]) {
      parts.push(<strong key={`${keyPrefix}-${keyIndex++}`}><em>{match[2]}</em></strong>);
    } else if (match[3]) {
      parts.push(<strong key={`${keyPrefix}-${keyIndex++}`}>{match[3]}</strong>);
    } else if (match[4]) {
      parts.push(<em key={`${keyPrefix}-${keyIndex++}`}>{match[4]}</em>);
    } else if (match[5]) {
      parts.push(<strong key={`${keyPrefix}-${keyIndex++}`}><em>{match[5]}</em></strong>);
    } else if (match[6]) {
      parts.push(<strong key={`${keyPrefix}-${keyIndex++}`}>{match[6]}</strong>);
    } else if (match[7]) {
      parts.push(<em key={`${keyPrefix}-${keyIndex++}`}>{match[7]}</em>);
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

function renderMarkdownContent(content: string) {
  const paragraphs = content.split(/\n\n+/);
  
  return paragraphs.map((paragraph, pIndex) => {
    const lines = paragraph.split('\n');
    
    return (
      <p key={pIndex} className={pIndex > 0 ? "mt-3" : ""}>
        {lines.map((line, lIndex) => {
          const trimmedLine = line.trim();
          const isBullet = /^[-•*]\s/.test(trimmedLine);
          const isNumbered = /^\d+[.)]\s/.test(trimmedLine);
          
          if (isBullet || isNumbered) {
            return (
              <span key={lIndex} className="block pl-2">
                {renderMarkdownInline(line, `p${pIndex}-l${lIndex}`)}
              </span>
            );
          }
          
          return (
            <span key={lIndex}>
              {renderMarkdownInline(line, `p${pIndex}-l${lIndex}`)}
              {lIndex < lines.length - 1 && <br />}
            </span>
          );
        })}
      </p>
    );
  });
}

export default function ScriptCreatorPage() {
  const { toast } = useToast();
  const [selectedWebinar, setSelectedWebinar] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState("");
  const [generatedScript, setGeneratedScript] = useState("");
  const [scriptTitle, setScriptTitle] = useState("");
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [chatToRename, setChatToRename] = useState<AiChat | null>(null);
  const [newChatTitle, setNewChatTitle] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { data: webinars = [] } = useQuery<Webinar[]>({
    queryKey: ["/api/webinars"],
  });

  const { data: savedScripts = [] } = useQuery<SavedScript[]>({
    queryKey: ["/api/webinars", selectedWebinar, "scripts"],
    enabled: !!selectedWebinar,
  });

  const { data: chatHistory = [], isLoading: isLoadingChats } = useQuery<AiChat[]>({
    queryKey: ["/api/ai/chats"],
  });

  // Create new chat mutation
  const createChatMutation = useMutation({
    mutationFn: async (data: { title: string; webinarId?: string }) => {
      const res = await apiRequest("POST", "/api/ai/chats", data);
      return res.json();
    },
    onSuccess: (data: AiChat) => {
      setCurrentChatId(data.id);
      queryClient.invalidateQueries({ queryKey: ["/api/ai/chats"] });
    },
  });

  // Update chat mutation
  const updateChatMutation = useMutation({
    mutationFn: async ({ chatId, data }: { chatId: string; data: Partial<AiChat> }) => {
      const res = await apiRequest("PATCH", `/api/ai/chats/${chatId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai/chats"] });
    },
  });

  // Delete chat mutation
  const deleteChatMutation = useMutation({
    mutationFn: async (chatId: string) => {
      return apiRequest("DELETE", `/api/ai/chats/${chatId}`);
    },
    onSuccess: () => {
      if (currentChatId === chatToRename?.id) {
        resetChat();
      }
      queryClient.invalidateQueries({ queryKey: ["/api/ai/chats"] });
      toast({ description: "Conversa excluída!" });
    },
  });

  const chatMutation = useMutation({
    mutationFn: async (userMessage: string) => {
      const res = await apiRequest("POST", `/api/webinars/${selectedWebinar}/scripts/generate-with-chat`, {
        userMessage,
        conversationHistory: messages,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      const newMessage: Message = {
        id: `ai-${Date.now()}`,
        role: "assistant",
        content: data.message,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, newMessage]);
      if (data.generatedScript) {
        setGeneratedScript(data.generatedScript);
      }
    },
    onError: (error: any) => {
      toast({ description: error.message || "Erro ao gerar roteiro", variant: "destructive" });
    },
  });

  const saveScriptMutation = useMutation({
    mutationFn: async () => {
      if (!scriptTitle.trim() || !generatedScript.trim()) {
        throw new Error("Defina um título para o roteiro");
      }
      return apiRequest("POST", `/api/webinars/${selectedWebinar}/scripts`, { title: scriptTitle, script: generatedScript });
    },
    onSuccess: () => {
      toast({ description: "Roteiro salvo com sucesso!" });
      queryClient.invalidateQueries({ queryKey: ["/api/webinars", selectedWebinar, "scripts"] });
    },
  });

  const deleteScriptMutation = useMutation({
    mutationFn: async (scriptId: string) => {
      return apiRequest("DELETE", `/api/webinars/${selectedWebinar}/scripts/${scriptId}`);
    },
    onSuccess: () => {
      toast({ description: "Roteiro deletado!" });
      queryClient.invalidateQueries({ queryKey: ["/api/webinars", selectedWebinar, "scripts"] });
    },
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto-save chat when messages or generated script change
  useEffect(() => {
    if (!currentChatId || messages.length === 0) return;

    // Clear existing timeout
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    // Debounce auto-save
    autoSaveTimeoutRef.current = setTimeout(() => {
      updateChatMutation.mutate({
        chatId: currentChatId,
        data: {
          messages: JSON.stringify(messages),
          generatedScript,
          webinarId: selectedWebinar || null,
        },
      });
    }, 1000);

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [messages, generatedScript, currentChatId, selectedWebinar]);

  const handleSendMessage = async (text?: string) => {
    const messageText = text || userInput.trim();
    if (!messageText || !selectedWebinar) return;

    // Create chat if this is the first message
    if (!currentChatId) {
      const firstWords = messageText.split(" ").slice(0, 4).join(" ");
      const title = firstWords.length > 30 ? firstWords.substring(0, 30) + "..." : firstWords;
      
      try {
        const res = await apiRequest("POST", "/api/ai/chats", {
          title,
          webinarId: selectedWebinar,
          messages: "[]",
          generatedScript: "",
        });
        const newChat = await res.json();
        setCurrentChatId(newChat.id);
        queryClient.invalidateQueries({ queryKey: ["/api/ai/chats"] });
      } catch (error) {
        console.error("Error creating chat:", error);
      }
    }

    const newMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: messageText,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, newMessage]);
    setUserInput("");
    chatMutation.mutate(messageText);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const resetChat = () => {
    setMessages([]);
    setGeneratedScript("");
    setScriptTitle("");
    setCurrentChatId(null);
  };

  const loadChat = (chat: AiChat) => {
    setCurrentChatId(chat.id);
    try {
      const parsedMessages = JSON.parse(chat.messages || "[]");
      setMessages(parsedMessages);
    } catch {
      setMessages([]);
    }
    setGeneratedScript(chat.generatedScript || "");
    if (chat.webinarId) {
      setSelectedWebinar(chat.webinarId);
    }
  };

  const handleRenameChat = () => {
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

  const handleDeleteChat = (chat: AiChat) => {
    if (confirm("Tem certeza que deseja excluir esta conversa?")) {
      deleteChatMutation.mutate(chat.id);
      if (currentChatId === chat.id) {
        resetChat();
      }
    }
  };

  const exportScript = async (format: "txt" | "docx") => {
    if (!generatedScript) return;
    const filename = `roteiro-${scriptTitle || "webinar"}`;
    
    if (format === "txt") {
      const blob = new Blob([generatedScript], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filename}.txt`;
      a.click();
    } else if (format === "docx") {
      const paragraphs = generatedScript.split("\n").map((line, index) => {
        const isTitle = line.startsWith("#") || (index === 0 && line.trim().length > 0);
        const cleanLine = line.replace(/^#+\s*/, "");
        
        if (isTitle && line.startsWith("#")) {
          return new Paragraph({
            text: cleanLine,
            heading: HeadingLevel.HEADING_1,
            spacing: { after: 200 },
          });
        }
        
        return new Paragraph({
          children: [new TextRun({ text: cleanLine || " " })],
          spacing: { after: 100 },
        });
      });

      const doc = new Document({
        sections: [{
          properties: {},
          children: [
            new Paragraph({
              text: scriptTitle || "Roteiro de Webinário",
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

  return (
    <div className="flex h-full">
      {/* Left Sidebar - Chat History */}
      <div className="w-64 border-r flex flex-col bg-muted/30">
        <div className="p-3 border-b">
          <Button 
            onClick={resetChat} 
            className="w-full gap-2"
            variant="outline"
            data-testid="button-new-chat"
          >
            <Plus className="w-4 h-4" />
            Nova Conversa
          </Button>
        </div>
        
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {isLoadingChats ? (
              <div className="flex items-center justify-center p-4">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
            ) : chatHistory.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center p-4">
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
                  <MessageSquare className="w-4 h-4 shrink-0 text-muted-foreground" />
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
                          handleDeleteChat(chat);
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
        <div className="p-6 border-b bg-gradient-to-r from-violet-500/10 via-purple-500/10 to-fuchsia-500/10">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg">
              <Wand2 className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold">Roteirizador IA</h1>
              <p className="text-muted-foreground text-sm">
                Descreva seu webinário e a IA cria o roteiro completo
              </p>
            </div>
            <Select value={selectedWebinar} onValueChange={setSelectedWebinar}>
              <SelectTrigger className="w-48" data-testid="select-webinar-script">
                <SelectValue placeholder="Selecione webinário" />
              </SelectTrigger>
              <SelectContent>
                {webinars.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Chat Area */}
          <div className="flex-1 flex flex-col">
            {/* Messages or Welcome */}
            <div className="flex-1 overflow-auto p-6">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-500/20 to-purple-600/20 flex items-center justify-center mb-6">
                    <Sparkles className="w-8 h-8 text-violet-500" />
                  </div>
                  <h2 className="text-xl font-semibold mb-2">
                    Olá! Sou seu Roteirizador IA.
                  </h2>
                  <p className="text-muted-foreground max-w-md mb-8">
                    Me diga sobre seu webinário e vou criar um roteiro persuasivo e estruturado para você.
                  </p>
                  
                  {/* Quick Suggestions */}
                  <div className="flex flex-wrap gap-2 justify-center">
                    {quickSuggestions.map((suggestion) => (
                      <Button
                        key={suggestion}
                        variant="outline"
                        size="sm"
                        className="rounded-full"
                        onClick={() => handleSendMessage(`Quero criar um roteiro para ${suggestion.toLowerCase()}`)}
                        disabled={!selectedWebinar || chatMutation.isPending}
                        data-testid={`button-suggestion-${suggestion.toLowerCase().replace(/\s+/g, "-")}`}
                      >
                        {suggestion}
                      </Button>
                    ))}
                  </div>
                  
                  {!selectedWebinar && (
                    <p className="text-sm text-amber-600 dark:text-amber-400 mt-6">
                      Selecione um webinário acima para começar
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
                            ? "bg-primary text-primary-foreground rounded-br-sm"
                            : "bg-muted rounded-bl-sm"
                        }`}
                      >
                        <div className="text-sm">
                          {message.role === "assistant" 
                            ? renderMarkdownContent(message.content)
                            : message.content.split('\n').map((line, i) => (
                                <span key={i}>{line}{i < message.content.split('\n').length - 1 && <br />}</span>
                              ))
                          }
                        </div>
                      </div>
                    </div>
                  ))}
                  {chatMutation.isPending && (
                    <div className="flex justify-start">
                      <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3">
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

            {/* Input Area */}
            <div className="p-4 border-t bg-background">
              <div className="max-w-3xl mx-auto">
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Input
                      value={userInput}
                      onChange={(e) => setUserInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Descreva o estilo do seu webinário..."
                      disabled={!selectedWebinar || chatMutation.isPending}
                      className="rounded-full py-6"
                      data-testid="input-chat-message"
                    />
                  </div>
                  <Button
                    size="icon"
                    className="shrink-0 rounded-full bg-violet-500 hover:bg-violet-600"
                    onClick={() => handleSendMessage()}
                    disabled={!userInput.trim() || !selectedWebinar || chatMutation.isPending}
                    data-testid="button-send-message"
                  >
                    {chatMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Sidebar - Generated Script & Saved Scripts */}
          {(generatedScript || savedScripts.length > 0) && (
            <div className="w-96 border-l flex flex-col bg-muted/30">
              {/* Generated Script */}
              {generatedScript && (
                <div className="p-4 border-b flex-1 overflow-auto">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-sm">Roteiro Gerado</h3>
                    <div className="flex gap-1">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            data-testid="button-export-script"
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => exportScript("txt")} data-testid="button-export-txt">
                            <FileText className="w-4 h-4 mr-2" />
                            Exportar TXT
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => exportScript("docx")} data-testid="button-export-word">
                            <FileText className="w-4 h-4 mr-2" />
                            Exportar Word (.docx)
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <Textarea
                    value={generatedScript}
                    onChange={(e) => setGeneratedScript(e.target.value)}
                    className="min-h-48 text-sm font-mono"
                    data-testid="textarea-generated-script"
                  />
                  <div className="mt-3 space-y-2">
                    <Input
                      value={scriptTitle}
                      onChange={(e) => setScriptTitle(e.target.value)}
                      placeholder="Título do roteiro"
                      data-testid="input-script-title"
                    />
                    <Button
                      onClick={() => saveScriptMutation.mutate()}
                      disabled={saveScriptMutation.isPending || !scriptTitle.trim()}
                      className="w-full gap-2"
                      data-testid="button-save-script"
                    >
                      {saveScriptMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                      <Save className="w-4 h-4" />
                      Salvar Roteiro
                    </Button>
                  </div>
                </div>
              )}

              {/* Saved Scripts */}
              {savedScripts.length > 0 && (
                <div className="p-4 overflow-auto">
                  <h3 className="font-semibold text-sm mb-3">Roteiros Salvos</h3>
                  <div className="space-y-2">
                    {savedScripts.map((script) => (
                      <Card key={script.id} className="p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div
                            className="flex-1 cursor-pointer hover:opacity-80"
                            onClick={() => {
                              setGeneratedScript(script.script);
                              setScriptTitle(script.title);
                            }}
                          >
                            <p className="font-medium text-sm">{script.title}</p>
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {script.script.substring(0, 100)}...
                            </p>
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => deleteScriptMutation.mutate(script.id)}
                            disabled={deleteScriptMutation.isPending}
                            data-testid={`button-delete-script-${script.id}`}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
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
            <Button onClick={handleRenameChat} disabled={!newChatTitle.trim()}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
