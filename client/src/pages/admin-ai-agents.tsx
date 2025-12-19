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
  Key, Cpu, AlertTriangle, CheckCircle, Info
} from "lucide-react";
import { Slider } from "@/components/ui/slider";

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
  responseDelayMs: number;
  isActive: boolean;
  workingHoursEnabled: boolean;
  workingHoursStart: string;
  workingHoursEnd: string;
  workingDays: string;
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
    responseDelayMs: 2000,
    isActive: true,
    workingHoursEnabled: false,
    workingHoursStart: "09:00",
    workingHoursEnd: "18:00",
    workingDays: "1,2,3,4,5",
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
    queryKey: ["/api/whatsapp/accounts"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await apiRequest("POST", "/api/ai-agents", data);
      return res.json();
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
      responseDelayMs: 2000,
      isActive: true,
      workingHoursEnabled: false,
      workingHoursStart: "09:00",
      workingHoursEnd: "18:00",
      workingDays: "1,2,3,4,5",
      escalationKeywords: "",
      escalationMessage: "",
    });
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
      responseDelayMs: agent.responseDelayMs,
      isActive: agent.isActive,
      workingHoursEnabled: agent.workingHoursEnabled,
      workingHoursStart: agent.workingHoursStart || "09:00",
      workingHoursEnd: agent.workingHoursEnd || "18:00",
      workingDays: agent.workingDays || "1,2,3,4,5",
      escalationKeywords: agent.escalationKeywords || "",
      escalationMessage: agent.escalationMessage || "",
    });
    setShowCreateDialog(true);
  };

  const handleSubmit = () => {
    if (editingAgent) {
      updateMutation.mutate({ id: editingAgent.id, data: formData });
    } else {
      createMutation.mutate(formData);
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingAgent ? "Editar Agente" : "Novo Agente de IA"}</DialogTitle>
            <DialogDescription>
              Configure as características do seu agente de IA
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Nome do Agente</Label>
                <Input
                  placeholder="Ex: Atendente Virtual"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  data-testid="input-agent-name"
                />
              </div>
              
              <div className="space-y-2">
                <Label>Conta WhatsApp (Marketing)</Label>
                <Select 
                  value={formData.whatsappAccountId} 
                  onValueChange={(v) => setFormData({ ...formData, whatsappAccountId: v })}
                  disabled={!!editingAgent}
                >
                  <SelectTrigger data-testid="select-whatsapp-account">
                    <SelectValue placeholder="Selecione uma conta" />
                  </SelectTrigger>
                  <SelectContent>
                    {whatsappAccounts?.filter(account => account.scope === "marketing").map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.label} {account.status === "connected" ? `(${account.phoneNumber || "Conectado"})` : "(Desconectado)"}
                      </SelectItem>
                    ))}
                    {(!whatsappAccounts || whatsappAccounts.filter(a => a.scope === "marketing").length === 0) && (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">
                        Nenhuma conta de Marketing disponível
                      </div>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Descrição (opcional)</Label>
              <Input
                placeholder="Descreva o propósito deste agente"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                data-testid="input-agent-description"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Provedor de IA</Label>
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
                <Label>Modelo</Label>
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
              </div>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Key className="h-4 w-4" />
                Chave de API
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

            <div className="space-y-2">
              <Label>Prompt do Sistema</Label>
              <Textarea
                placeholder="Você é um assistente virtual amigável..."
                value={formData.systemPrompt}
                onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
                className="min-h-[150px]"
                data-testid="input-system-prompt"
              />
              <p className="text-xs text-muted-foreground">
                Defina a personalidade e regras do agente. Este texto é enviado como contexto em todas as conversas.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
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
                  Maior = mais criativo, Menor = mais preciso
                </p>
              </div>

              <div className="space-y-2">
                <Label>Max Tokens</Label>
                <Input
                  type="number"
                  value={formData.maxTokens}
                  onChange={(e) => setFormData({ ...formData, maxTokens: parseInt(e.target.value) || 1024 })}
                  min={100}
                  max={4096}
                  data-testid="input-max-tokens"
                />
              </div>

              <div className="space-y-2">
                <Label>Memória (msgs)</Label>
                <Input
                  type="number"
                  value={formData.memoryLength}
                  onChange={(e) => setFormData({ ...formData, memoryLength: parseInt(e.target.value) || 10 })}
                  min={1}
                  max={50}
                  data-testid="input-memory-length"
                />
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
                Simula tempo de digitação para parecer mais humano
              </p>
            </div>

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

              {formData.workingHoursEnabled && (
                <div className="space-y-4">
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
                    <div className="flex gap-2">
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
                </div>
              )}
            </div>

            <div className="space-y-4 p-4 border rounded-lg">
              <Label className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Escalação para Humano
              </Label>
              <p className="text-xs text-muted-foreground">
                Defina palavras-chave que transferem a conversa para atendimento humano
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
                  placeholder="Entendo! Vou transferir você para um atendente humano..."
                  value={formData.escalationMessage}
                  onChange={(e) => setFormData({ ...formData, escalationMessage: e.target.value })}
                  data-testid="input-escalation-message"
                />
              </div>
            </div>

            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <Label>Agente Ativo</Label>
                <p className="text-xs text-muted-foreground">
                  Quando ativo, o agente responde automaticamente às mensagens
                </p>
              </div>
              <Switch
                checked={formData.isActive}
                onCheckedChange={(v) => setFormData({ ...formData, isActive: v })}
                data-testid="switch-is-active"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={!formData.name || !formData.whatsappAccountId || !formData.apiKey || !formData.systemPrompt || createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-agent"
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {editingAgent ? "Salvar Alterações" : "Criar Agente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
