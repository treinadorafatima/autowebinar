import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Bot, Plus, Edit, Trash2, Check, X, Loader2, 
  TestTube, Send, MessageSquare, Settings, Clock,
  Key, Cpu, AlertTriangle, CheckCircle, Info, FileText, Upload, File,
  ChevronRight, ChevronLeft, Sparkles, Brain, Zap, Calendar
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";

const WIZARD_STEPS = [
  { id: 1, title: "Identidade", description: "Nome e conta WhatsApp", icon: Bot },
  { id: 2, title: "Inteligência", description: "Provedor e modelo de IA", icon: Brain },
  { id: 3, title: "Personalidade", description: "Prompt e base de conhecimento", icon: Sparkles },
  { id: 4, title: "Memória", description: "Comportamento e respostas", icon: Zap },
  { id: 5, title: "Disponibilidade", description: "Horários e escalação", icon: Calendar },
];

const EXAMPLE_PROMPT = `Você é o Assistente Virtual da [Nome da Empresa], especialista em atendimento acolhedor.

REGRAS:
- Responda sempre em português do Brasil
- Use tom consultivo e amigável
- Sempre valide o nome do cliente antes de continuar
- Ofereça ajuda para dúvidas sobre produtos, pagamentos e suporte
- Se não souber a resposta, diga que vai verificar e um atendente entrará em contato

SOBRE A EMPRESA:
[Descreva aqui os produtos/serviços, preços, formas de pagamento, etc.]

FLUXO DE ATENDIMENTO:
1. Cumprimente e pergunte o nome
2. Identifique a necessidade do cliente
3. Ofereça a solução adequada
4. Confirme se precisa de mais ajuda`;

interface AiAgent {
  id: string;
  adminId: string;
  whatsappAccountId: string;
  name: string;
  description: string | null;
  provider: string;
  model: string;
  apiKey: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  memoryLength: number;
  memoryRetentionDays: number;
  responseDelayMs: number;
  isActive: boolean;
  workingHoursEnabled: boolean;
  workingHoursStart: string;
  workingHoursEnd: string;
  workingDays: string;
  timezone: string;
  escalationKeywords: string | null;
  escalationMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

interface WhatsAppAccount {
  id: string;
  label: string;
  phoneNumber: string | null;
  status: string;
  scope: string;
}

interface ProviderInfo {
  name: string;
  models: { id: string; name: string; costPer1kTokens: number }[];
  apiKeyHint: string;
}

interface AiAgentFile {
  id: string;
  agentId: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  extractedText: string | null;
  createdAt: string;
}

const DAYS_OF_WEEK = [
  { value: "1", label: "Seg" },
  { value: "2", label: "Ter" },
  { value: "3", label: "Qua" },
  { value: "4", label: "Qui" },
  { value: "5", label: "Sex" },
  { value: "6", label: "Sáb" },
  { value: "7", label: "Dom" },
];

export default function AdminAiAgents() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("agents");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AiAgent | null>(null);
  const [testMessage, setTestMessage] = useState("");
  const [testResponse, setTestResponse] = useState<string | null>(null);
  const [testingAgentId, setTestingAgentId] = useState<string | null>(null);
  const [newFileName, setNewFileName] = useState("");
  const [newFileUrl, setNewFileUrl] = useState("");
  const [newFileText, setNewFileText] = useState("");
  const [wizardStep, setWizardStep] = useState(1);
  const [pendingFiles, setPendingFiles] = useState<Array<{ fileName: string; fileUrl: string; extractedText?: string }>>([]);
  
  const [formData, setFormData] = useState({
    whatsappAccountId: "",
    name: "",
    description: "",
    provider: "openai",
    model: "gpt-4o-mini",
    apiKey: "",
    systemPrompt: "",
    temperature: 70,
    maxTokens: 1024,
    memoryLength: 10,
    memoryRetentionDays: 30,
    responseDelayMs: 2000,
    isActive: true,
    workingHoursEnabled: false,
    workingHoursStart: "09:00",
    workingHoursEnd: "18:00",
    workingDays: "1,2,3,4,5",
    timezone: "America/Sao_Paulo",
    escalationKeywords: "",
    escalationMessage: "",
  });

  const { data: providers } = useQuery<Record<string, ProviderInfo>>({
    queryKey: ["/api/ai-agents/providers"],
  });

  const { data: agents, isLoading: loadingAgents } = useQuery<AiAgent[]>({
    queryKey: ["/api/ai-agents"],
  });

  const { data: whatsappAccounts } = useQuery<WhatsAppAccount[]>({
    queryKey: ["/api/whatsapp/accounts/marketing"],
  });

  const { data: agentFiles, refetch: refetchFiles } = useQuery<AiAgentFile[]>({
    queryKey: ["/api/ai-agents", editingAgent?.id, "files"],
    enabled: !!editingAgent?.id,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await apiRequest("POST", "/api/ai-agents", data);
      const newAgent = await res.json();
      
      if (pendingFiles.length > 0) {
        for (const file of pendingFiles) {
          await apiRequest("POST", `/api/ai-agents/${newAgent.id}/files`, {
            fileName: file.fileName,
            fileUrl: file.fileUrl,
            fileType: file.fileUrl.includes(".pdf") ? "pdf" : file.fileUrl.includes(".txt") ? "txt" : "text",
            extractedText: file.extractedText || null,
          });
        }
      }
      
      return newAgent;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-agents"] });
      setShowCreateDialog(false);
      resetForm();
      toast({ title: "Agente criado com sucesso!" });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao criar agente", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<typeof formData> }) => {
      const res = await apiRequest("PATCH", `/api/ai-agents/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-agents"] });
      setEditingAgent(null);
      resetForm();
      toast({ title: "Agente atualizado com sucesso!" });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao atualizar agente", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/ai-agents/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-agents"] });
      toast({ title: "Agente removido com sucesso!" });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao remover agente", description: error.message, variant: "destructive" });
    },
  });

  const testMutation = useMutation({
    mutationFn: async ({ id, message }: { id: string; message: string }) => {
      const res = await apiRequest("POST", `/api/ai-agents/${id}/test`, { message });
      return res.json();
    },
    onSuccess: (data: { content?: string }) => {
      setTestResponse(data.content || "Resposta vazia");
    },
    onError: (error: any) => {
      setTestResponse(`Erro: ${error.message}`);
    },
  });

  const addFileMutation = useMutation({
    mutationFn: async ({ agentId, fileName, fileUrl, extractedText }: { agentId: string; fileName: string; fileUrl: string; extractedText?: string }) => {
      const fileType = fileUrl.includes(".pdf") ? "pdf" : fileUrl.includes(".txt") ? "txt" : "text";
      const res = await apiRequest("POST", `/api/ai-agents/${agentId}/files`, { 
        fileName, 
        fileUrl, 
        fileType,
        extractedText: extractedText || null 
      });
      return res.json();
    },
    onSuccess: () => {
      refetchFiles();
      setNewFileName("");
      setNewFileUrl("");
      setNewFileText("");
      toast({ title: "Arquivo adicionado com sucesso!" });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao adicionar arquivo", description: error.message, variant: "destructive" });
    },
  });

  const deleteFileMutation = useMutation({
    mutationFn: async ({ agentId, fileId }: { agentId: string; fileId: string }) => {
      await apiRequest("DELETE", `/api/ai-agents/${agentId}/files/${fileId}`);
    },
    onSuccess: () => {
      refetchFiles();
      toast({ title: "Arquivo removido!" });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao remover arquivo", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      whatsappAccountId: "",
      name: "",
      description: "",
      provider: "openai",
      model: "gpt-4o-mini",
      apiKey: "",
      systemPrompt: "",
      temperature: 70,
      maxTokens: 1024,
      memoryLength: 10,
      memoryRetentionDays: 30,
      responseDelayMs: 2000,
      isActive: true,
      workingHoursEnabled: false,
      workingHoursStart: "09:00",
      workingHoursEnd: "18:00",
      workingDays: "1,2,3,4,5",
      timezone: "America/Sao_Paulo",
      escalationKeywords: "",
      escalationMessage: "",
    });
    setWizardStep(1);
    setPendingFiles([]);
    setNewFileName("");
    setNewFileUrl("");
    setNewFileText("");
  };

  const handleEdit = (agent: AiAgent) => {
    setEditingAgent(agent);
    setFormData({
      whatsappAccountId: agent.whatsappAccountId,
      name: agent.name,
      description: agent.description || "",
      provider: agent.provider,
      model: agent.model,
      apiKey: agent.apiKey,
      systemPrompt: agent.systemPrompt,
      temperature: agent.temperature,
      maxTokens: agent.maxTokens,
      memoryLength: agent.memoryLength,
      memoryRetentionDays: agent.memoryRetentionDays || 30,
      responseDelayMs: agent.responseDelayMs,
      isActive: agent.isActive,
      workingHoursEnabled: agent.workingHoursEnabled,
      workingHoursStart: agent.workingHoursStart || "09:00",
      workingHoursEnd: agent.workingHoursEnd || "18:00",
      workingDays: agent.workingDays || "1,2,3,4,5",
      timezone: agent.timezone || "America/Sao_Paulo",
      escalationKeywords: agent.escalationKeywords || "",
      escalationMessage: agent.escalationMessage || "",
    });
    setWizardStep(1);
    setPendingFiles([]);
    setShowCreateDialog(true);
  };

  const canProceedToStep = (step: number): boolean => {
    switch (step) {
      case 1:
        return !!(formData.name && formData.whatsappAccountId);
      case 2:
        return !!(formData.provider && formData.model && formData.apiKey);
      case 3:
        return !!formData.systemPrompt;
      case 4:
        return true;
      case 5:
        return true;
      default:
        return false;
    }
  };

  const addPendingFile = () => {
    if (!newFileName) {
      toast({ title: "Informe um nome para o contexto", variant: "destructive" });
      return;
    }
    setPendingFiles([...pendingFiles, {
      fileName: newFileName,
      fileUrl: newFileUrl || "text://inline",
      extractedText: newFileText || undefined,
    }]);
    setNewFileName("");
    setNewFileUrl("");
    setNewFileText("");
    toast({ title: "Arquivo adicionado à lista!" });
  };

  const removePendingFile = (index: number) => {
    setPendingFiles(pendingFiles.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (editingAgent) {
      updateMutation.mutate({ id: editingAgent.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleWizardNext = () => {
    if (!canProceedToStep(wizardStep)) {
      const messages: Record<number, string> = {
        1: "Preencha o nome e selecione uma conta WhatsApp",
        2: "Selecione o provedor, modelo e informe a chave de API",
        3: "Defina o prompt do sistema para o agente",
      };
      toast({ title: messages[wizardStep] || "Preencha os campos obrigatórios", variant: "destructive" });
      return;
    }
    if (wizardStep < 5) {
      setWizardStep(wizardStep + 1);
    }
  };

  const handleWizardPrev = () => {
    if (wizardStep > 1) {
      setWizardStep(wizardStep - 1);
    }
  };

  const handleTest = (agentId: string) => {
    if (!testMessage.trim()) return;
    setTestingAgentId(agentId);
    setTestResponse(null);
    testMutation.mutate({ id: agentId, message: testMessage });
  };

  const currentModels = providers?.[formData.provider]?.models || [];
  const selectedModel = currentModels.find(m => m.id === formData.model);

  const getAccountLabel = (accountId: string) => {
    const account = whatsappAccounts?.find(a => a.id === accountId);
    if (!account) return accountId;
    if (account.status === "connected") {
      return `${account.label} (${account.phoneNumber || "Conectado"})`;
    }
    return `${account.label} (Desconectado)`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="h-6 w-6" />
            Agentes de IA
          </h1>
          <p className="text-muted-foreground">
            Configure chatbots inteligentes para responder mensagens automaticamente via WhatsApp
          </p>
        </div>
        <Button onClick={() => { resetForm(); setEditingAgent(null); setShowCreateDialog(true); }} data-testid="button-create-agent">
          <Plus className="h-4 w-4 mr-2" />
          Novo Agente
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="agents" data-testid="tab-agents">
            <Bot className="h-4 w-4 mr-2" />
            Agentes ({agents?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="test" data-testid="tab-test">
            <TestTube className="h-4 w-4 mr-2" />
            Testar
          </TabsTrigger>
        </TabsList>

        <TabsContent value="agents" className="space-y-4">
          {loadingAgents ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : agents?.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Bot className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">Nenhum agente configurado</h3>
                <p className="text-muted-foreground text-center max-w-md mt-2">
                  Crie seu primeiro agente de IA para começar a responder mensagens automaticamente.
                </p>
                <Button className="mt-4" onClick={() => setShowCreateDialog(true)} data-testid="button-create-first-agent">
                  <Plus className="h-4 w-4 mr-2" />
                  Criar Agente
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {agents?.map((agent) => (
                <Card key={agent.id} data-testid={`card-agent-${agent.id}`}>
                  <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Bot className="h-5 w-5 shrink-0" />
                        <span className="truncate">{agent.name}</span>
                      </CardTitle>
                      <CardDescription className="truncate">
                        {getAccountLabel(agent.whatsappAccountId)}
                      </CardDescription>
                    </div>
                    <Badge variant={agent.isActive ? "default" : "secondary"}>
                      {agent.isActive ? "Ativo" : "Inativo"}
                    </Badge>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Cpu className="h-4 w-4 text-muted-foreground" />
                      <span>{providers?.[agent.provider]?.name || agent.provider}</span>
                      <span className="text-muted-foreground">•</span>
                      <span>{agent.model}</span>
                    </div>
                    {agent.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{agent.description}</p>
                    )}
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {agent.responseDelayMs}ms delay
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />
                        {agent.memoryLength} msgs memória
                      </span>
                    </div>
                  </CardContent>
                  <CardFooter className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleEdit(agent)} data-testid={`button-edit-agent-${agent.id}`}>
                      <Edit className="h-4 w-4 mr-1" />
                      Editar
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => {
                        setTestingAgentId(agent.id);
                        setActiveTab("test");
                      }}
                      data-testid={`button-test-agent-${agent.id}`}
                    >
                      <TestTube className="h-4 w-4 mr-1" />
                      Testar
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="ml-auto text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirm("Tem certeza que deseja remover este agente?")) {
                          deleteMutation.mutate(agent.id);
                        }
                      }}
                      data-testid={`button-delete-agent-${agent.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="test" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Testar Agente</CardTitle>
              <CardDescription>
                Envie uma mensagem de teste para verificar como o agente responde
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Selecionar Agente</Label>
                <Select value={testingAgentId || ""} onValueChange={setTestingAgentId}>
                  <SelectTrigger data-testid="select-test-agent">
                    <SelectValue placeholder="Selecione um agente" />
                  </SelectTrigger>
                  <SelectContent>
                    {agents?.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Mensagem de Teste</Label>
                <Textarea
                  placeholder="Digite uma mensagem para testar o agente..."
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  className="min-h-[100px]"
                  data-testid="input-test-message"
                />
              </div>

              <Button 
                onClick={() => testingAgentId && handleTest(testingAgentId)}
                disabled={!testingAgentId || !testMessage.trim() || testMutation.isPending}
                data-testid="button-send-test"
              >
                {testMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Enviar Teste
              </Button>

              {testResponse && (
                <div className="p-4 bg-muted rounded-lg mt-4">
                  <Label className="text-sm text-muted-foreground mb-2 block">Resposta do Agente:</Label>
                  <p className="whitespace-pre-wrap" data-testid="text-test-response">{testResponse}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showCreateDialog} onOpenChange={(open) => {
        setShowCreateDialog(open);
        if (!open) {
          setEditingAgent(null);
          resetForm();
        }
      }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              {editingAgent ? "Editar Agente" : "Criar Novo Agente de IA"}
            </DialogTitle>
            <DialogDescription>
              {editingAgent 
                ? "Atualize as configurações do seu agente" 
                : "Siga os passos abaixo para configurar seu agente inteligente"}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div className="flex items-center justify-between mb-6">
              {WIZARD_STEPS.map((step, index) => {
                const StepIcon = step.icon;
                const isActive = wizardStep === step.id;
                const isCompleted = wizardStep > step.id;
                const canClick = editingAgent || (step.id <= wizardStep);
                
                return (
                  <div key={step.id} className="flex items-center flex-1">
                    <button
                      onClick={() => canClick && setWizardStep(step.id)}
                      disabled={!canClick}
                      className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all w-full ${
                        isActive 
                          ? "bg-primary/10 text-primary" 
                          : isCompleted 
                            ? "text-primary/70 hover:bg-muted" 
                            : "text-muted-foreground"
                      } ${canClick ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}
                      data-testid={`wizard-step-${step.id}`}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        isActive 
                          ? "bg-primary text-primary-foreground" 
                          : isCompleted 
                            ? "bg-primary/20 text-primary" 
                            : "bg-muted text-muted-foreground"
                      }`}>
                        {isCompleted ? <Check className="h-4 w-4" /> : <StepIcon className="h-4 w-4" />}
                      </div>
                      <span className="text-xs font-medium hidden sm:block">{step.title}</span>
                    </button>
                    {index < WIZARD_STEPS.length - 1 && (
                      <div className={`h-0.5 flex-1 mx-1 ${isCompleted ? "bg-primary/50" : "bg-muted"}`} />
                    )}
                  </div>
                );
              })}
            </div>

            <Progress value={(wizardStep / 5) * 100} className="mb-6" />

            {wizardStep === 1 && (
              <div className="space-y-6">
                <div className="text-center mb-4">
                  <h3 className="text-lg font-semibold">Identidade do Agente</h3>
                  <p className="text-sm text-muted-foreground">Dê um nome e conecte a uma conta WhatsApp</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Nome do Agente *</Label>
                    <Input
                      placeholder="Ex: Atendente Virtual, Suporte Vendas"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      data-testid="input-agent-name"
                    />
                    <p className="text-xs text-muted-foreground">
                      Escolha um nome que identifique a função do agente
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Descrição (opcional)</Label>
                    <Input
                      placeholder="Ex: Atendimento inicial de leads do webinar"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      data-testid="input-agent-description"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Conta WhatsApp (Marketing) *</Label>
                    <Select 
                      value={formData.whatsappAccountId} 
                      onValueChange={(v) => setFormData({ ...formData, whatsappAccountId: v })}
                      disabled={!!editingAgent}
                    >
                      <SelectTrigger data-testid="select-whatsapp-account">
                        <SelectValue placeholder="Selecione uma conta conectada" />
                      </SelectTrigger>
                      <SelectContent>
                        {whatsappAccounts?.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.label} {account.status === "connected" ? `(${account.phoneNumber || "Conectado"})` : "(Desconectado)"}
                          </SelectItem>
                        ))}
                        {(!whatsappAccounts || whatsappAccounts.length === 0) && (
                          <div className="px-2 py-1.5 text-sm text-muted-foreground">
                            Nenhuma conta de Marketing disponível
                          </div>
                        )}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      O agente responderá automaticamente nesta conta
                    </p>
                  </div>

                  <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/50">
                    <div>
                      <Label>Agente Ativo</Label>
                      <p className="text-xs text-muted-foreground">
                        Ative para que o agente comece a responder
                      </p>
                    </div>
                    <Switch
                      checked={formData.isActive}
                      onCheckedChange={(v) => setFormData({ ...formData, isActive: v })}
                      data-testid="switch-is-active"
                    />
                  </div>
                </div>
              </div>
            )}

            {wizardStep === 2 && (
              <div className="space-y-6">
                <div className="text-center mb-4">
                  <h3 className="text-lg font-semibold">Inteligência Artificial</h3>
                  <p className="text-sm text-muted-foreground">Escolha o provedor e modelo de IA</p>
                </div>

                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Provedor de IA *</Label>
                      <Select 
                        value={formData.provider} 
                        onValueChange={(v) => {
                          const newModels = providers?.[v]?.models || [];
                          setFormData({ 
                            ...formData, 
                            provider: v,
                            model: newModels[0]?.id || ""
                          });
                        }}
                      >
                        <SelectTrigger data-testid="select-provider">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {providers && Object.entries(providers).map(([key, info]) => (
                            <SelectItem key={key} value={key}>{info.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Modelo *</Label>
                      <Select value={formData.model} onValueChange={(v) => setFormData({ ...formData, model: v })}>
                        <SelectTrigger data-testid="select-model">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {currentModels.map((model) => (
                            <SelectItem key={model.id} value={model.id}>
                              {model.name} (${model.costPer1kTokens}/1K tokens)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {selectedModel && (
                        <p className="text-xs text-muted-foreground">
                          Custo estimado: ${selectedModel.costPer1kTokens} por 1.000 tokens
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Key className="h-4 w-4" />
                      Chave de API *
                    </Label>
                    <Input
                      type="password"
                      placeholder={providers?.[formData.provider]?.apiKeyHint || "Cole sua chave de API aqui"}
                      value={formData.apiKey}
                      onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                      data-testid="input-api-key"
                    />
                    <p className="text-xs text-muted-foreground">
                      {providers?.[formData.provider]?.apiKeyHint}
                    </p>
                  </div>

                  <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                    <div className="flex items-start gap-2">
                      <Info className="h-4 w-4 text-blue-500 mt-0.5" />
                      <div className="text-sm">
                        <p className="font-medium text-blue-500">Onde obter a chave?</p>
                        <p className="text-muted-foreground mt-1">
                          {formData.provider === "openai" && "Acesse platform.openai.com e crie uma API key"}
                          {formData.provider === "gemini" && "Acesse aistudio.google.com e crie uma API key"}
                          {formData.provider === "deepseek" && "Acesse platform.deepseek.com e crie uma API key"}
                          {formData.provider === "grok" && "Acesse console.x.ai e crie uma API key"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {wizardStep === 3 && (
              <div className="space-y-6">
                <div className="text-center mb-4">
                  <h3 className="text-lg font-semibold">Personalidade do Agente</h3>
                  <p className="text-sm text-muted-foreground">Defina como o agente deve se comportar</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Prompt do Sistema *</Label>
                    <Textarea
                      placeholder={EXAMPLE_PROMPT}
                      value={formData.systemPrompt}
                      onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
                      className="min-h-[200px] font-mono text-sm"
                      data-testid="input-system-prompt"
                    />
                    <p className="text-xs text-muted-foreground">
                      Este é o "cérebro" do agente. Defina personalidade, regras e informações importantes.
                    </p>
                  </div>

                  <div className="p-4 bg-muted/50 border rounded-lg">
                    <div className="flex items-start gap-2">
                      <Sparkles className="h-4 w-4 text-primary mt-0.5" />
                      <div className="text-sm">
                        <p className="font-medium">Dica: Bom prompt inclui</p>
                        <ul className="text-muted-foreground mt-1 list-disc list-inside space-y-1">
                          <li>Identidade clara (quem é o agente)</li>
                          <li>Tom de voz (formal, amigável, consultivo)</li>
                          <li>Regras do que fazer e não fazer</li>
                          <li>Informações sobre produtos/serviços</li>
                          <li>Fluxo de atendimento sugerido</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setFormData({ ...formData, systemPrompt: EXAMPLE_PROMPT })}
                    className="w-full"
                    data-testid="button-use-example"
                  >
                    <Sparkles className="h-4 w-4 mr-2" />
                    Usar Exemplo como Base
                  </Button>

                  <div className="space-y-4 p-4 border rounded-lg">
                    <Label className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Base de Conhecimento (opcional)
                    </Label>
                    
                    <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs space-y-2">
                      <p className="font-medium text-blue-600 dark:text-blue-400">Como usar a Base de Conhecimento:</p>
                      <ul className="list-disc list-inside text-muted-foreground space-y-1">
                        <li><strong>Nome:</strong> Identifica o contexto (ex: "FAQ", "Tabela de Preços")</li>
                        <li><strong>Texto:</strong> Cole o conteúdo diretamente - FAQ, políticas, scripts</li>
                        <li><strong>URL:</strong> Link direto para .txt ou .pdf hospedado na web</li>
                      </ul>
                      <p className="text-amber-600 dark:text-amber-400 mt-1">
                        Links do Google Drive/Dropbox não funcionam diretamente. Copie o texto do arquivo e cole aqui.
                      </p>
                    </div>

                    {editingAgent && agentFiles && agentFiles.length > 0 && (
                      <div className="space-y-2">
                        <Label className="text-sm">Arquivos Salvos:</Label>
                        {agentFiles.map((file) => (
                          <div key={file.id} className="flex items-center justify-between p-2 bg-muted rounded">
                            <div className="flex items-center gap-2">
                              <File className="h-4 w-4" />
                              <span className="text-sm">{file.fileName}</span>
                              <Badge variant="outline" className="text-xs">{file.fileType}</Badge>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteFileMutation.mutate({ agentId: editingAgent.id, fileId: file.id })}
                              data-testid={`button-delete-file-${file.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    {pendingFiles.length > 0 && (
                      <div className="space-y-2">
                        <Label className="text-sm">Arquivos a Adicionar:</Label>
                        {pendingFiles.map((file, index) => (
                          <div key={index} className="flex items-center justify-between p-2 bg-green-500/10 border border-green-500/20 rounded">
                            <div className="flex items-center gap-2">
                              <File className="h-4 w-4 text-green-500" />
                              <span className="text-sm">{file.fileName}</span>
                              <Badge variant="outline" className="text-xs">Novo</Badge>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removePendingFile(index)}
                              data-testid={`button-remove-pending-${index}`}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="space-y-3 pt-2 border-t">
                      <div className="space-y-2">
                        <Label>Nome do Contexto</Label>
                        <Input
                          placeholder="Ex: FAQ de Vendas, Política de Devolução"
                          value={newFileName}
                          onChange={(e) => setNewFileName(e.target.value)}
                          data-testid="input-new-file-name"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label>URL do Arquivo (opcional)</Label>
                        <Input
                          placeholder="https://exemplo.com/arquivo.pdf"
                          value={newFileUrl}
                          onChange={(e) => setNewFileUrl(e.target.value)}
                          data-testid="input-new-file-url"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Ou cole o texto diretamente</Label>
                        <Textarea
                          placeholder="Cole aqui FAQ, instruções, políticas..."
                          value={newFileText}
                          onChange={(e) => setNewFileText(e.target.value)}
                          className="min-h-[80px]"
                          data-testid="input-new-file-text"
                        />
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        onClick={editingAgent ? () => {
                          if (!newFileName) {
                            toast({ title: "Informe um nome para o contexto", variant: "destructive" });
                            return;
                          }
                          addFileMutation.mutate({
                            agentId: editingAgent.id,
                            fileName: newFileName,
                            fileUrl: newFileUrl || "text://inline",
                            extractedText: newFileText || undefined,
                          });
                        } : addPendingFile}
                        disabled={addFileMutation.isPending || !newFileName}
                        data-testid="button-add-file"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Adicionar à Base
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {wizardStep === 4 && (
              <div className="space-y-6">
                <div className="text-center mb-4">
                  <h3 className="text-lg font-semibold">Memória e Comportamento</h3>
                  <p className="text-sm text-muted-foreground">Ajuste como o agente processa e responde</p>
                </div>

                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Temperatura ({formData.temperature}%)</Label>
                      <Slider
                        value={[formData.temperature]}
                        onValueChange={([v]) => setFormData({ ...formData, temperature: v })}
                        min={0}
                        max={100}
                        step={5}
                        data-testid="slider-temperature"
                      />
                      <p className="text-xs text-muted-foreground">
                        {formData.temperature < 30 && "Respostas mais precisas e consistentes"}
                        {formData.temperature >= 30 && formData.temperature < 70 && "Equilíbrio entre criatividade e precisão"}
                        {formData.temperature >= 70 && "Respostas mais criativas e variadas"}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label>Máximo de Tokens</Label>
                      <Input
                        type="number"
                        value={formData.maxTokens}
                        onChange={(e) => setFormData({ ...formData, maxTokens: parseInt(e.target.value) || 1024 })}
                        min={100}
                        max={4096}
                        data-testid="input-max-tokens"
                      />
                      <p className="text-xs text-muted-foreground">
                        Limite de tamanho da resposta (~750 palavras = 1000 tokens)
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Contexto de Conversa</Label>
                      <Input
                        type="number"
                        value={formData.memoryLength}
                        onChange={(e) => setFormData({ ...formData, memoryLength: parseInt(e.target.value) || 10 })}
                        min={1}
                        max={50}
                        data-testid="input-memory-length"
                      />
                      <p className="text-xs text-muted-foreground">
                        Quantas mensagens recentes o agente lembra
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label>Retenção (dias)</Label>
                      <Input
                        type="number"
                        value={formData.memoryRetentionDays}
                        onChange={(e) => setFormData({ ...formData, memoryRetentionDays: parseInt(e.target.value) || 30 })}
                        min={0}
                        max={365}
                        data-testid="input-memory-retention"
                      />
                      <p className="text-xs text-muted-foreground">
                        Após quantos dias as mensagens são apagadas (0 = nunca)
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Delay de Resposta (ms)</Label>
                    <Input
                      type="number"
                      value={formData.responseDelayMs}
                      onChange={(e) => setFormData({ ...formData, responseDelayMs: parseInt(e.target.value) || 0 })}
                      min={0}
                      max={10000}
                      data-testid="input-response-delay"
                    />
                    <p className="text-xs text-muted-foreground">
                      Simula tempo de digitação para parecer mais humano (2000ms = 2 segundos)
                    </p>
                  </div>
                </div>
              </div>
            )}

            {wizardStep === 5 && (
              <div className="space-y-6">
                <div className="text-center mb-4">
                  <h3 className="text-lg font-semibold">Disponibilidade e Escalação</h3>
                  <p className="text-sm text-muted-foreground">Configure horários de funcionamento e transferência para humanos</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-4 p-4 border rounded-lg">
                    <div className="flex items-center justify-between">
                      <Label className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Horário de Funcionamento
                      </Label>
                      <Switch
                        checked={formData.workingHoursEnabled}
                        onCheckedChange={(v) => setFormData({ ...formData, workingHoursEnabled: v })}
                        data-testid="switch-working-hours"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Quando ativado, o agente só responde nos horários definidos
                    </p>

                    {formData.workingHoursEnabled && (
                      <div className="space-y-4 pt-2">
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Início</Label>
                            <Input
                              type="time"
                              value={formData.workingHoursStart}
                              onChange={(e) => setFormData({ ...formData, workingHoursStart: e.target.value })}
                              data-testid="input-working-hours-start"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Fim</Label>
                            <Input
                              type="time"
                              value={formData.workingHoursEnd}
                              onChange={(e) => setFormData({ ...formData, workingHoursEnd: e.target.value })}
                              data-testid="input-working-hours-end"
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label>Dias de Funcionamento</Label>
                          <div className="flex gap-2 flex-wrap">
                            {DAYS_OF_WEEK.map((day) => {
                              const isSelected = formData.workingDays.split(",").includes(day.value);
                              return (
                                <Button
                                  key={day.value}
                                  type="button"
                                  variant={isSelected ? "default" : "outline"}
                                  size="sm"
                                  onClick={() => {
                                    const days = formData.workingDays.split(",").filter(d => d);
                                    if (isSelected) {
                                      setFormData({ ...formData, workingDays: days.filter(d => d !== day.value).join(",") });
                                    } else {
                                      setFormData({ ...formData, workingDays: [...days, day.value].sort().join(",") });
                                    }
                                  }}
                                  data-testid={`button-day-${day.value}`}
                                >
                                  {day.label}
                                </Button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label>Fuso Horário</Label>
                          <Select 
                            value={formData.timezone} 
                            onValueChange={(v) => setFormData({ ...formData, timezone: v })}
                          >
                            <SelectTrigger data-testid="select-timezone">
                              <SelectValue placeholder="Selecione o fuso horário" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="America/Sao_Paulo">Brasília (GMT-3)</SelectItem>
                              <SelectItem value="America/Manaus">Manaus (GMT-4)</SelectItem>
                              <SelectItem value="America/Rio_Branco">Acre (GMT-5)</SelectItem>
                              <SelectItem value="America/Noronha">Fernando de Noronha (GMT-2)</SelectItem>
                              <SelectItem value="America/New_York">Nova York (GMT-5)</SelectItem>
                              <SelectItem value="America/Los_Angeles">Los Angeles (GMT-8)</SelectItem>
                              <SelectItem value="Europe/London">Londres (GMT+0)</SelectItem>
                              <SelectItem value="Europe/Lisbon">Lisboa (GMT+0)</SelectItem>
                              <SelectItem value="Europe/Paris">Paris (GMT+1)</SelectItem>
                              <SelectItem value="Asia/Tokyo">Tóquio (GMT+9)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-4 p-4 border rounded-lg">
                    <Label className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      Escalação para Humano
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Quando o cliente digitar essas palavras, o agente envia uma mensagem e para de responder
                    </p>
                    
                    <div className="space-y-2">
                      <Label>Palavras-chave (separadas por vírgula)</Label>
                      <Input
                        placeholder="atendente, humano, pessoa, gerente"
                        value={formData.escalationKeywords}
                        onChange={(e) => setFormData({ ...formData, escalationKeywords: e.target.value })}
                        data-testid="input-escalation-keywords"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Mensagem de Escalação</Label>
                      <Textarea
                        placeholder="Entendo! Vou transferir você para um atendente humano. Aguarde um momento..."
                        value={formData.escalationMessage}
                        onChange={(e) => setFormData({ ...formData, escalationMessage: e.target.value })}
                        data-testid="input-escalation-message"
                      />
                    </div>
                  </div>

                  <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
                    <h4 className="font-medium mb-3 flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-primary" />
                      Resumo do Agente
                    </h4>
                    <div className="grid gap-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Nome:</span>
                        <span className="font-medium">{formData.name || "Não definido"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Provedor:</span>
                        <span className="font-medium">{providers?.[formData.provider]?.name || formData.provider}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Modelo:</span>
                        <span className="font-medium">{selectedModel?.name || formData.model}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Status:</span>
                        <Badge variant={formData.isActive ? "default" : "secondary"}>
                          {formData.isActive ? "Ativo" : "Inativo"}
                        </Badge>
                      </div>
                      {pendingFiles.length > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Arquivos a adicionar:</span>
                          <span className="font-medium">{pendingFiles.length}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <div className="flex gap-2 w-full sm:w-auto">
              {wizardStep > 1 && (
                <Button 
                  variant="outline" 
                  onClick={handleWizardPrev}
                  data-testid="button-wizard-prev"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Voltar
                </Button>
              )}
              <Button 
                variant="ghost" 
                onClick={() => setShowCreateDialog(false)}
                data-testid="button-cancel"
              >
                Cancelar
              </Button>
            </div>
            
            <div className="flex gap-2 w-full sm:w-auto sm:ml-auto">
              {wizardStep < 5 ? (
                <Button 
                  onClick={handleWizardNext}
                  className="flex-1 sm:flex-none"
                  data-testid="button-wizard-next"
                >
                  Próximo
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <Button 
                  onClick={handleSubmit}
                  disabled={!formData.name || !formData.whatsappAccountId || !formData.apiKey || !formData.systemPrompt || createMutation.isPending || updateMutation.isPending}
                  className="flex-1 sm:flex-none"
                  data-testid="button-save-agent"
                >
                  {(createMutation.isPending || updateMutation.isPending) && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  {editingAgent ? "Salvar Alterações" : "Criar Agente"}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
