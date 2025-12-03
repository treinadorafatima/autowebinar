import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Loader2, Save, Trash2, Brain, FileText, AlertCircle, Upload, File, X, Wand2, MessageSquare } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface AiConfig {
  id: string;
  title: string;
  systemPrompt: string;
  generatorType: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AiMemory {
  id: string;
  configId: string;
  generatorType: string;
  label: string;
  sourceType: string;
  content: string | null;
  fileUrl: string | null;
  createdAt: string;
}

export default function AdminAiConfigPage() {
  const { toast } = useToast();
  const [scriptPrompt, setScriptPrompt] = useState<string | null>(null);
  const [messagePrompt, setMessagePrompt] = useState<string | null>(null);
  const scriptFileInputRef = useRef<HTMLInputElement>(null);
  const messageFileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragType, setDragType] = useState<"script" | "message">("script");
  const [currentTab, setCurrentTab] = useState<"script" | "message">("script");

  const { data, isLoading, error } = useQuery<{ configs: AiConfig[]; memories: AiMemory[] }>({
    queryKey: ["/api/ai/config"],
  });

  const configs = data?.configs || [];
  const scriptConfig = configs.find(c => c.generatorType === "script");
  const messageConfig = configs.find(c => c.generatorType === "message");
  const memories = data?.memories || [];
  const scriptMemories = memories.filter(m => m.generatorType === "script");
  const messageMemories = memories.filter(m => m.generatorType === "message");

  useEffect(() => {
    if (scriptConfig && scriptPrompt === null) {
      setScriptPrompt(scriptConfig.systemPrompt || "");
    }
    if (messageConfig && messagePrompt === null) {
      setMessagePrompt(messageConfig.systemPrompt || "");
    }
  }, [scriptConfig, messageConfig]);

  const updateConfigMutation = useMutation({
    mutationFn: async () => {
      if (currentTab === "script" && scriptConfig) {
        return apiRequest("PATCH", `/api/ai/config/${scriptConfig.id}`, {
          systemPrompt: scriptPrompt ?? "",
        });
      } else if (currentTab === "message" && messageConfig) {
        return apiRequest("PATCH", `/api/ai/config/${messageConfig.id}`, {
          systemPrompt: messagePrompt ?? "",
        });
      }
    },
    onSuccess: () => {
      toast({ description: "Configuração salva!" });
      queryClient.invalidateQueries({ queryKey: ["/api/ai/config"] });
    },
    onError: (err: any) => {
      toast({ description: err.message || "Erro ao salvar", variant: "destructive" });
    },
  });

  const uploadFileMutation = useMutation({
    mutationFn: async ({ file, type }: { file: File; type: "script" | "message" }) => {
      const config = type === "script" ? scriptConfig : messageConfig;
      if (!config) return;
      const text = await file.text();
      return apiRequest("POST", `/api/ai/config/${config.id}/memories`, {
        label: file.name.replace(/\.[^/.]+$/, ""),
        content: text,
        sourceType: "file",
        generatorType: type,
      });
    },
    onSuccess: () => {
      toast({ description: "Arquivo carregado!" });
      queryClient.invalidateQueries({ queryKey: ["/api/ai/config"] });
    },
    onError: (err: any) => {
      toast({ description: err.message || "Erro ao carregar", variant: "destructive" });
    },
  });

  const deleteMemoryMutation = useMutation({
    mutationFn: async (memoryId: string) => {
      return apiRequest("DELETE", `/api/ai/memories/${memoryId}`);
    },
    onSuccess: () => {
      toast({ description: "Removido!" });
      queryClient.invalidateQueries({ queryKey: ["/api/ai/config"] });
    },
  });

  const handleFileSelect = (files: FileList | null, type: "script" | "message") => {
    if (!files) return;
    const config = type === "script" ? scriptConfig : messageConfig;
    if (!config) {
      toast({ description: "Configuração não encontrada", variant: "destructive" });
      return;
    }
    
    Array.from(files).forEach(file => {
      if (file.size > 1024 * 1024) {
        toast({ description: `${file.name} muito grande (máx 1MB)`, variant: "destructive" });
        return;
      }
      uploadFileMutation.mutate({ file, type });
    });
  };

  const handleDrop = (e: React.DragEvent, type: "script" | "message") => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files, type);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Acesso negado. Apenas super admin pode acessar esta página.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg">
          <Brain className="w-6 h-6 text-white" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">Configuração de IA</h1>
            <Badge className="bg-violet-500/20 text-violet-600 dark:text-violet-400 border-violet-500/30">
              Super Admin
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm">
            Prompts e memórias para cada gerador
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={currentTab} onValueChange={(v) => setCurrentTab(v as "script" | "message")}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="script" className="gap-2">
            <Wand2 className="w-4 h-4" />
            Roteirizador
          </TabsTrigger>
          <TabsTrigger value="message" className="gap-2">
            <MessageSquare className="w-4 h-4" />
            Gerador de Mensagens
          </TabsTrigger>
        </TabsList>

        <TabsContent value="script" className="space-y-6">
          {/* Script Generator Prompt */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Wand2 className="w-5 h-5" />
                Prompt - Roteirizador
              </CardTitle>
              <CardDescription>Instruções para o gerador de roteiros de webinários</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                data-testid="textarea-script-prompt"
                value={scriptPrompt ?? ""}
                onChange={(e) => setScriptPrompt(e.target.value)}
                className="min-h-72 font-mono text-sm"
                placeholder="Instruções para o gerador de roteiros..."
              />
              <Button
                onClick={() => updateConfigMutation.mutate()}
                disabled={updateConfigMutation.isPending}
                data-testid="button-save-script-prompt"
              >
                {updateConfigMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Salvar
              </Button>
            </CardContent>
          </Card>

          {/* Script Files */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Arquivos de Memória
                </CardTitle>
                <Badge variant="outline">{scriptMemories.length} arquivo(s)</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-all cursor-pointer ${
                  isDragging && dragType === "script"
                    ? "border-primary bg-primary/5" 
                    : "border-muted-foreground/25 hover:border-primary/50"
                }`}
                onDrop={(e) => handleDrop(e, "script")}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); setDragType("script"); }}
                onDragLeave={() => setIsDragging(false)}
                onClick={() => { scriptFileInputRef.current?.click(); setDragType("script"); }}
              >
                <input
                  ref={scriptFileInputRef}
                  type="file"
                  accept=".txt,.md,.json"
                  multiple
                  onChange={(e) => handleFileSelect(e.target.files, "script")}
                  className="hidden"
                  data-testid="input-script-files"
                />
                {uploadFileMutation.isPending ? (
                  <Loader2 className="w-8 h-8 mx-auto animate-spin text-primary" />
                ) : (
                  <Upload className={`w-8 h-8 mx-auto ${isDragging && dragType === "script" ? "text-primary" : "text-muted-foreground"}`} />
                )}
                <p className="mt-2 text-sm text-muted-foreground">
                  Arraste arquivos ou clique para selecionar
                </p>
              </div>

              {scriptMemories.length > 0 && (
                <div className="space-y-2 pt-4 border-t">
                  {scriptMemories.map((memory) => (
                    <div 
                      key={memory.id} 
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50 group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <File className="w-4 h-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{memory.label}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {memory.content?.substring(0, 60)}...
                          </p>
                        </div>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        onClick={() => deleteMemoryMutation.mutate(memory.id)}
                        disabled={deleteMemoryMutation.isPending}
                        data-testid={`button-delete-script-memory-${memory.id}`}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="message" className="space-y-6">
          {/* Message Generator Prompt */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Prompt - Gerador de Mensagens
              </CardTitle>
              <CardDescription>Instruções para gerar mensagens de email e WhatsApp</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                data-testid="textarea-message-prompt"
                value={messagePrompt ?? ""}
                onChange={(e) => setMessagePrompt(e.target.value)}
                className="min-h-72 font-mono text-sm"
                placeholder="Instruções para o gerador de mensagens..."
              />
              <Button
                onClick={() => updateConfigMutation.mutate()}
                disabled={updateConfigMutation.isPending}
                data-testid="button-save-message-prompt"
              >
                {updateConfigMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Salvar
              </Button>
            </CardContent>
          </Card>

          {/* Message Files */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Arquivos de Memória
                </CardTitle>
                <Badge variant="outline">{messageMemories.length} arquivo(s)</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-all cursor-pointer ${
                  isDragging && dragType === "message"
                    ? "border-primary bg-primary/5" 
                    : "border-muted-foreground/25 hover:border-primary/50"
                }`}
                onDrop={(e) => handleDrop(e, "message")}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); setDragType("message"); }}
                onDragLeave={() => setIsDragging(false)}
                onClick={() => { messageFileInputRef.current?.click(); setDragType("message"); }}
              >
                <input
                  ref={messageFileInputRef}
                  type="file"
                  accept=".txt,.md,.json"
                  multiple
                  onChange={(e) => handleFileSelect(e.target.files, "message")}
                  className="hidden"
                  data-testid="input-message-files"
                />
                {uploadFileMutation.isPending ? (
                  <Loader2 className="w-8 h-8 mx-auto animate-spin text-primary" />
                ) : (
                  <Upload className={`w-8 h-8 mx-auto ${isDragging && dragType === "message" ? "text-primary" : "text-muted-foreground"}`} />
                )}
                <p className="mt-2 text-sm text-muted-foreground">
                  Arraste arquivos ou clique para selecionar
                </p>
              </div>

              {messageMemories.length > 0 && (
                <div className="space-y-2 pt-4 border-t">
                  {messageMemories.map((memory) => (
                    <div 
                      key={memory.id} 
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50 group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <File className="w-4 h-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{memory.label}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {memory.content?.substring(0, 60)}...
                          </p>
                        </div>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        onClick={() => deleteMemoryMutation.mutate(memory.id)}
                        disabled={deleteMemoryMutation.isPending}
                        data-testid={`button-delete-message-memory-${memory.id}`}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
