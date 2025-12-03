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
import EmailEditorComponent from "@/components/EmailEditor";
import { 
  Mail, Key, CheckCircle, XCircle, Loader2, Send, Trash2, ExternalLink, 
  Plus, Edit, Clock, CalendarClock, FileText, Copy, Code, Eye, 
  MailPlus, Settings2, FormInput, ArrowLeft
} from "lucide-react";

interface EmailCredentials {
  hasCredential: boolean;
  maskedApiKey?: string;
  senderEmail?: string;
  senderName?: string;
  isValid: boolean;
  lastValidatedAt?: string;
}

interface EmailSequence {
  id: string;
  adminId: string;
  webinarId: string | null;
  name: string;
  phase: string;
  offsetMinutes: number;
  subject: string;
  preheader: string;
  designJson: string;
  compiledHtml: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Webinar {
  id: string;
  name: string;
  slug: string;
}

interface LeadFormConfig {
  id?: string;
  webinarId: string;
  title: string;
  subtitle: string;
  collectName: boolean;
  collectEmail: boolean;
  collectWhatsapp: boolean;
  collectCity: boolean;
  collectState: boolean;
  customFields: any[];
  requireConsent: boolean;
  consentText: string;
  buttonText: string;
  buttonColor: string;
  successMessage: string;
  redirectUrl: string | null;
  backgroundColor: string;
  textColor: string;
  isActive: boolean;
  isDefault?: boolean;
}

export default function AdminEmailMarketing() {
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [senderName, setSenderName] = useState("");
  const [activeTab, setActiveTab] = useState("sequences");
  const [selectedWebinarId, setSelectedWebinarId] = useState<string>("");
  
  const [editingSequence, setEditingSequence] = useState<EmailSequence | null>(null);
  const [showSequenceEditor, setShowSequenceEditor] = useState(false);
  const [showNewSequenceDialog, setShowNewSequenceDialog] = useState(false);
  const [newSequence, setNewSequence] = useState({
    name: "",
    phase: "pre",
    offsetMinutes: -60,
    subject: "",
    preheader: "",
    webinarId: ""
  });

  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [duplicatingSequence, setDuplicatingSequence] = useState<EmailSequence | null>(null);
  const [duplicateTargetWebinarId, setDuplicateTargetWebinarId] = useState("");

  const [showLeadFormEditor, setShowLeadFormEditor] = useState(false);
  const [showEmbedCodeDialog, setShowEmbedCodeDialog] = useState(false);

  const { data: credentials, isLoading: loadingCredentials } = useQuery<EmailCredentials>({
    queryKey: ["/api/email-marketing/credentials"],
  });

  const { data: webinars } = useQuery<Webinar[]>({
    queryKey: ["/api/webinars"],
  });

  const { data: sequences, isLoading: loadingSequences } = useQuery<EmailSequence[]>({
    queryKey: ["/api/email-marketing/sequences", selectedWebinarId],
    queryFn: async () => {
      const url = selectedWebinarId 
        ? `/api/email-marketing/sequences?webinarId=${selectedWebinarId}`
        : "/api/email-marketing/sequences";
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${localStorage.getItem("adminToken")}` }
      });
      return res.json();
    },
    enabled: activeTab === "sequences"
  });

  const { data: leadFormConfig, isLoading: loadingLeadForm } = useQuery<LeadFormConfig>({
    queryKey: ["/api/email-marketing/lead-form", selectedWebinarId],
    queryFn: async () => {
      const res = await fetch(`/api/email-marketing/lead-form/${selectedWebinarId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("adminToken")}` }
      });
      return res.json();
    },
    enabled: !!selectedWebinarId && activeTab === "forms"
  });

  const { data: embedCodes } = useQuery<{ embedCode: string; iframeCode: string; directUrl: string }>({
    queryKey: ["/api/email-marketing/embed-code", selectedWebinarId],
    queryFn: async () => {
      const res = await fetch(`/api/email-marketing/embed-code/${selectedWebinarId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("adminToken")}` }
      });
      return res.json();
    },
    enabled: !!selectedWebinarId && showEmbedCodeDialog
  });

  const saveCredentialsMutation = useMutation({
    mutationFn: async (data: { apiKey: string; senderEmail: string; senderName: string }) => {
      const res = await apiRequest("POST", "/api/email-marketing/credentials", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Credenciais salvas", description: "Faça a validação para confirmar." });
      queryClient.invalidateQueries({ queryKey: ["/api/email-marketing/credentials"] });
      setApiKey("");
    },
    onError: (error: any) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const validateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/email-marketing/credentials/validate");
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Sucesso", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/email-marketing/credentials"] });
    },
    onError: (error: any) => {
      toast({ title: "Erro na validação", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", "/api/email-marketing/credentials");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Credenciais removidas" });
      queryClient.invalidateQueries({ queryKey: ["/api/email-marketing/credentials"] });
    },
    onError: (error: any) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const createSequenceMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/email-marketing/sequences", data);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Sequência criada" });
      queryClient.invalidateQueries({ queryKey: ["/api/email-marketing/sequences"] });
      setShowNewSequenceDialog(false);
      setEditingSequence(data);
      setShowSequenceEditor(true);
    },
    onError: (error: any) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const updateSequenceMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/email-marketing/sequences/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Sequência atualizada" });
      queryClient.invalidateQueries({ queryKey: ["/api/email-marketing/sequences"] });
    },
    onError: (error: any) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const deleteSequenceMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/email-marketing/sequences/${id}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Sequência excluída" });
      queryClient.invalidateQueries({ queryKey: ["/api/email-marketing/sequences"] });
    },
    onError: (error: any) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const testSequenceMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/email-marketing/sequences/${id}/test`);
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Email enviado", description: data.message });
    },
    onError: (error: any) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const saveLeadFormMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/email-marketing/lead-form/${selectedWebinarId}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Formulário salvo" });
      queryClient.invalidateQueries({ queryKey: ["/api/email-marketing/lead-form", selectedWebinarId] });
      setShowLeadFormEditor(false);
    },
    onError: (error: any) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const handleSaveCredentials = () => {
    if (!apiKey && !credentials?.hasCredential) {
      toast({ title: "Erro", description: "Informe a API Key", variant: "destructive" });
      return;
    }
    if (!senderEmail && !credentials?.senderEmail) {
      toast({ title: "Erro", description: "Informe o email do remetente", variant: "destructive" });
      return;
    }

    saveCredentialsMutation.mutate({
      apiKey: apiKey || "",
      senderEmail: senderEmail || credentials?.senderEmail || "",
      senderName: senderName || credentials?.senderName || "Auto Webinar",
    });
  };

  const defaultEmailDesign = {
    body: {
      rows: [
        {
          cells: [1],
          columns: [
            {
              contents: [
                {
                  type: "heading",
                  values: {
                    text: "Olá {{nome}}!",
                    textAlign: "center"
                  }
                }
              ]
            }
          ]
        },
        {
          cells: [1],
          columns: [
            {
              contents: [
                {
                  type: "text",
                  values: {
                    text: "<p>Você está inscrito no webinar <strong>{{webinar_titulo}}</strong>.</p><p>Data: {{webinar_data}} às {{webinar_horario}}</p>"
                  }
                }
              ]
            }
          ]
        },
        {
          cells: [1],
          columns: [
            {
              contents: [
                {
                  type: "button",
                  values: {
                    text: "Acessar Webinar",
                    href: "{{webinar_link}}",
                    buttonColors: {
                      color: "#ffffff",
                      backgroundColor: "#22c55e"
                    }
                  }
                }
              ]
            }
          ]
        }
      ]
    }
  };

  const handleCreateSequence = () => {
    if (!newSequence.name || !newSequence.subject) {
      toast({ title: "Erro", description: "Nome e assunto são obrigatórios", variant: "destructive" });
      return;
    }
    if (!newSequence.webinarId) {
      toast({ title: "Erro", description: "Selecione um webinário", variant: "destructive" });
      return;
    }

    createSequenceMutation.mutate({
      name: newSequence.name,
      phase: newSequence.phase,
      offsetMinutes: newSequence.offsetMinutes,
      subject: newSequence.subject,
      preheader: newSequence.preheader,
      webinarId: newSequence.webinarId,
      designJson: JSON.stringify(defaultEmailDesign),
      compiledHtml: ""
    });
  };

  const duplicateSequenceMutation = useMutation({
    mutationFn: async (data: { sourceSequence: EmailSequence; targetWebinarId: string }) => {
      const res = await apiRequest("POST", "/api/email-marketing/sequences", {
        name: data.sourceSequence.name,
        phase: data.sourceSequence.phase,
        offsetMinutes: data.sourceSequence.offsetMinutes,
        subject: data.sourceSequence.subject,
        preheader: data.sourceSequence.preheader,
        webinarId: data.targetWebinarId,
        designJson: data.sourceSequence.designJson,
        compiledHtml: data.sourceSequence.compiledHtml,
        isActive: false
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Sequência duplicada", description: "A sequência foi copiada para o outro webinário" });
      queryClient.invalidateQueries({ queryKey: ["/api/email-marketing/sequences"] });
      setShowDuplicateDialog(false);
      setDuplicatingSequence(null);
      setDuplicateTargetWebinarId("");
    },
    onError: (error: any) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const handleDuplicateSequence = () => {
    if (!duplicatingSequence || !duplicateTargetWebinarId) {
      toast({ title: "Erro", description: "Selecione o webinário de destino", variant: "destructive" });
      return;
    }
    duplicateSequenceMutation.mutate({
      sourceSequence: duplicatingSequence,
      targetWebinarId: duplicateTargetWebinarId
    });
  };

  const handleSaveEmailDesign = (design: object, html: string) => {
    if (!editingSequence) return;
    
    updateSequenceMutation.mutate({
      id: editingSequence.id,
      data: {
        designJson: JSON.stringify(design),
        compiledHtml: html
      }
    });
  };

  const formatOffsetMinutes = (minutes: number) => {
    const absMinutes = Math.abs(minutes);
    if (absMinutes < 60) {
      return `${absMinutes} min`;
    }
    const hours = Math.floor(absMinutes / 60);
    const remainingMinutes = absMinutes % 60;
    if (remainingMinutes === 0) {
      return `${hours}h`;
    }
    return `${hours}h ${remainingMinutes}min`;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copiado!", description: "Código copiado para a área de transferência" });
  };

  if (loadingCredentials) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (showSequenceEditor && editingSequence) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setShowSequenceEditor(false);
              setEditingSequence(null);
            }}
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">{editingSequence.name}</h1>
            <p className="text-sm text-muted-foreground">
              {editingSequence.phase === "pre" ? "Antes" : "Depois"} do webinar ({formatOffsetMinutes(editingSequence.offsetMinutes)})
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Assunto do Email</Label>
            <Input
              value={editingSequence.subject}
              onChange={(e) => setEditingSequence({ ...editingSequence, subject: e.target.value })}
              onBlur={() => updateSequenceMutation.mutate({
                id: editingSequence.id,
                data: { subject: editingSequence.subject }
              })}
              data-testid="input-sequence-subject"
            />
          </div>
          <div className="space-y-2">
            <Label>Preheader (Preview)</Label>
            <Input
              value={editingSequence.preheader}
              onChange={(e) => setEditingSequence({ ...editingSequence, preheader: e.target.value })}
              onBlur={() => updateSequenceMutation.mutate({
                id: editingSequence.id,
                data: { preheader: editingSequence.preheader }
              })}
              placeholder="Texto de preview do email"
              data-testid="input-sequence-preheader"
            />
          </div>
          <div className="flex items-end">
            <Button
              variant="outline"
              onClick={() => testSequenceMutation.mutate(editingSequence.id)}
              disabled={testSequenceMutation.isPending}
              data-testid="button-test-sequence"
            >
              {testSequenceMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              Enviar Teste
            </Button>
          </div>
        </div>

        <EmailEditorComponent
          initialDesign={editingSequence.designJson ? JSON.parse(editingSequence.designJson) : undefined}
          onSave={handleSaveEmailDesign}
          onTest={() => testSequenceMutation.mutate(editingSequence.id)}
          saving={updateSequenceMutation.isPending}
          testing={testSequenceMutation.isPending}
          title="Editor de Email"
          description="Use os merge tags para personalizar: {{nome}}, {{webinar_titulo}}, {{webinar_data}}"
        />
      </div>
    );
  }

  return (
    <>
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
              <Mail className="w-6 h-6" />
              Email Marketing
            </h1>
            <p className="text-muted-foreground">
              Configure sequências de email automáticas para seus webinars
            </p>
          </div>
          {credentials?.isValid && (
            <Badge variant="default" className="bg-green-600">
              <CheckCircle className="w-3 h-3 mr-1" />
              Email Configurado
            </Badge>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="sequences" data-testid="tab-sequences">
              <MailPlus className="w-4 h-4 mr-2" />
              Sequências
            </TabsTrigger>
            <TabsTrigger value="forms" data-testid="tab-forms">
              <FormInput className="w-4 h-4 mr-2" />
              Formulários
            </TabsTrigger>
            <TabsTrigger value="config" data-testid="tab-config">
              <Settings2 className="w-4 h-4 mr-2" />
              Configuração
            </TabsTrigger>
            <TabsTrigger value="help" data-testid="tab-help">
              <ExternalLink className="w-4 h-4 mr-2" />
              Ajuda
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sequences" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <CardTitle>Sequências de Email</CardTitle>
                    <CardDescription>
                      Crie emails automáticos para enviar antes ou depois dos webinars
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Select value={selectedWebinarId || "all"} onValueChange={(val) => setSelectedWebinarId(val === "all" ? "" : val)}>
                      <SelectTrigger className="w-[200px]" data-testid="select-webinar-filter">
                        <SelectValue placeholder="Todos os webinars" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os webinars</SelectItem>
                        {webinars?.map((w) => (
                          <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button onClick={() => {
                      setNewSequence({
                        name: "",
                        phase: "pre",
                        offsetMinutes: -60,
                        subject: "",
                        preheader: "",
                        webinarId: selectedWebinarId || (webinars?.[0]?.id || "")
                      });
                      setShowNewSequenceDialog(true);
                    }} data-testid="button-new-sequence">
                      <Plus className="w-4 h-4 mr-2" />
                      Nova Sequência
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loadingSequences ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                ) : sequences?.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <MailPlus className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Nenhuma sequência de email criada</p>
                    <p className="text-sm">Clique em "Nova Sequência" para começar</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sequences?.map((seq) => {
                      const seqWebinar = webinars?.find(w => w.id === seq.webinarId);
                      return (
                        <div
                          key={seq.id}
                          className="flex items-center justify-between p-4 border rounded-lg hover-elevate"
                          data-testid={`sequence-item-${seq.id}`}
                        >
                          <div className="flex items-center gap-4">
                            <div className="flex-shrink-0">
                              <Badge variant={seq.phase === "pre" ? "secondary" : "outline"}>
                                {seq.phase === "pre" ? "Antes" : "Depois"}
                              </Badge>
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="font-medium">{seq.name}</h3>
                                {seqWebinar && (
                                  <Badge variant="outline" className="text-xs">
                                    {seqWebinar.name}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground flex items-center gap-2">
                                <Clock className="w-3 h-3" />
                                {formatOffsetMinutes(Math.abs(seq.offsetMinutes))} {seq.phase === "pre" ? "antes" : "depois"}
                                <span className="mx-1">•</span>
                                <span className="truncate max-w-[200px]">{seq.subject}</span>
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={seq.isActive}
                              onCheckedChange={(checked) => updateSequenceMutation.mutate({
                                id: seq.id,
                                data: { isActive: checked }
                              })}
                              data-testid={`switch-sequence-active-${seq.id}`}
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setEditingSequence(seq);
                                setShowSequenceEditor(true);
                              }}
                              data-testid={`button-edit-sequence-${seq.id}`}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setDuplicatingSequence(seq);
                                const otherWebinars = webinars?.filter(w => w.id !== seq.webinarId) || [];
                                setDuplicateTargetWebinarId(otherWebinars[0]?.id || "");
                                setShowDuplicateDialog(true);
                              }}
                              title="Duplicar para outro webinário"
                              data-testid={`button-duplicate-sequence-${seq.id}`}
                            >
                              <Copy className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => testSequenceMutation.mutate(seq.id)}
                              disabled={testSequenceMutation.isPending}
                              data-testid={`button-test-sequence-${seq.id}`}
                            >
                              <Send className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                if (confirm("Excluir esta sequência?")) {
                                  deleteSequenceMutation.mutate(seq.id);
                                }
                              }}
                              data-testid={`button-delete-sequence-${seq.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="forms" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <CardTitle>Formulários de Captura</CardTitle>
                    <CardDescription>
                      Configure formulários de inscrição para capturar leads
                    </CardDescription>
                  </div>
                  <Select value={selectedWebinarId || undefined} onValueChange={setSelectedWebinarId}>
                    <SelectTrigger className="w-[200px]" data-testid="select-webinar-forms">
                      <SelectValue placeholder="Selecione um webinar" />
                    </SelectTrigger>
                    <SelectContent>
                      {webinars?.map((w) => (
                        <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {!selectedWebinarId ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <FormInput className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Selecione um webinar para configurar o formulário</p>
                  </div>
                ) : loadingLeadForm ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-4">
                        <h3 className="font-medium">Configurações do Formulário</h3>
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Label>Coletar Nome</Label>
                            <Switch checked={leadFormConfig?.collectName ?? true} disabled />
                          </div>
                          <div className="flex items-center justify-between">
                            <Label>Coletar Email</Label>
                            <Switch checked={leadFormConfig?.collectEmail ?? true} disabled />
                          </div>
                          <div className="flex items-center justify-between">
                            <Label>Coletar WhatsApp</Label>
                            <Switch checked={leadFormConfig?.collectWhatsapp ?? true} disabled />
                          </div>
                          <div className="flex items-center justify-between">
                            <Label>Coletar Cidade</Label>
                            <Switch checked={leadFormConfig?.collectCity ?? false} disabled />
                          </div>
                          <div className="flex items-center justify-between">
                            <Label>Exigir Consentimento (LGPD)</Label>
                            <Switch checked={leadFormConfig?.requireConsent ?? true} disabled />
                          </div>
                        </div>
                        <Button
                          onClick={() => setShowLeadFormEditor(true)}
                          className="w-full"
                          data-testid="button-edit-form"
                        >
                          <Edit className="w-4 h-4 mr-2" />
                          Editar Formulário
                        </Button>
                      </div>

                      <div className="space-y-4">
                        <h3 className="font-medium">Aparência</h3>
                        <div className="p-4 border rounded-lg space-y-3">
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-6 h-6 rounded border" 
                              style={{ backgroundColor: leadFormConfig?.buttonColor || "#22c55e" }}
                            />
                            <span className="text-sm">Cor do Botão</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-6 h-6 rounded border" 
                              style={{ backgroundColor: leadFormConfig?.backgroundColor || "#ffffff" }}
                            />
                            <span className="text-sm">Cor de Fundo</span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Botão: {leadFormConfig?.buttonText || "Quero Participar"}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          onClick={() => setShowEmbedCodeDialog(true)}
                          className="w-full"
                          data-testid="button-get-embed"
                        >
                          <Code className="w-4 h-4 mr-2" />
                          Obter Código Embed
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="config" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="w-5 h-5" />
                  Credenciais do Resend
                </CardTitle>
                <CardDescription>
                  Configure sua própria conta Resend para envio de emails
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {credentials?.hasCredential && (
                  <div className="flex items-center gap-3 p-4 rounded-lg bg-muted">
                    {credentials.isValid ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : (
                      <XCircle className="w-5 h-5 text-yellow-500" />
                    )}
                    <div className="flex-1">
                      <p className="font-medium">
                        {credentials.isValid ? "Conexão ativa" : "Aguardando validação"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        API Key: {credentials.maskedApiKey}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Remetente: {credentials.senderName} &lt;{credentials.senderEmail}&gt;
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => validateMutation.mutate()}
                        disabled={validateMutation.isPending}
                        data-testid="button-validate"
                      >
                        {validateMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (confirm("Remover credenciais?")) {
                            deleteMutation.mutate();
                          }
                        }}
                        disabled={deleteMutation.isPending}
                        data-testid="button-delete-credentials"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}

                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="apiKey">API Key do Resend</Label>
                    <Input
                      id="apiKey"
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={credentials?.hasCredential ? "••••••••••••••" : "re_xxxxxxxxxxxx"}
                      data-testid="input-api-key"
                    />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="senderEmail">Email do Remetente</Label>
                      <Input
                        id="senderEmail"
                        type="email"
                        value={senderEmail}
                        onChange={(e) => setSenderEmail(e.target.value)}
                        placeholder={credentials?.senderEmail || "contato@seudominio.com"}
                        data-testid="input-sender-email"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="senderName">Nome do Remetente</Label>
                      <Input
                        id="senderName"
                        value={senderName}
                        onChange={(e) => setSenderName(e.target.value)}
                        placeholder={credentials?.senderName || "Auto Webinar"}
                        data-testid="input-sender-name"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                <Button
                  onClick={handleSaveCredentials}
                  disabled={saveCredentialsMutation.isPending}
                  data-testid="button-save-credentials"
                >
                  {saveCredentialsMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Salvar Credenciais
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>

          <TabsContent value="help" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Como Configurar o Email Marketing</CardTitle>
                <CardDescription>
                  Siga os passos abaixo para integrar sua conta Resend
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                      1
                    </div>
                    <div>
                      <h3 className="font-medium">Crie uma conta no Resend</h3>
                      <p className="text-sm text-muted-foreground">
                        Acesse{" "}
                        <a href="https://resend.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                          resend.com
                        </a>{" "}
                        e crie sua conta gratuita.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                      2
                    </div>
                    <div>
                      <h3 className="font-medium">Verifique seu domínio</h3>
                      <p className="text-sm text-muted-foreground">
                        Adicione e verifique um domínio próprio para enviar emails (ex: seudominio.com).
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                      3
                    </div>
                    <div>
                      <h3 className="font-medium">Gere uma API Key</h3>
                      <p className="text-sm text-muted-foreground">
                        Em "API Keys", crie uma nova chave com permissão de envio.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                      4
                    </div>
                    <div>
                      <h3 className="font-medium">Configure aqui</h3>
                      <p className="text-sm text-muted-foreground">
                        Cole sua API Key e configure o email do remetente (deve usar o domínio verificado).
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                      5
                    </div>
                    <div>
                      <h3 className="font-medium">Valide a conexão</h3>
                      <p className="text-sm text-muted-foreground">
                        Clique em "Validar Conexão" para enviar um email de teste e confirmar que tudo está funcionando.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-muted rounded-lg">
                  <h4 className="font-medium mb-2">Por que usar sua própria conta?</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>Controle total sobre seus envios e reputação</li>
                    <li>Sem limites compartilhados com outros usuários</li>
                    <li>Personalização completa do remetente</li>
                    <li>Relatórios detalhados no painel do Resend</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={showNewSequenceDialog} onOpenChange={(open) => {
        if (!open) {
          setNewSequence({
            name: "",
            phase: "pre",
            offsetMinutes: -60,
            subject: "",
            preheader: "",
            webinarId: ""
          });
        }
        setShowNewSequenceDialog(open);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Sequência de Email</DialogTitle>
            <DialogDescription>
              Crie uma nova sequência para envio automático
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Webinário</Label>
              <Select
                value={newSequence.webinarId}
                onValueChange={(value) => setNewSequence({ ...newSequence, webinarId: value })}
              >
                <SelectTrigger data-testid="select-new-sequence-webinar">
                  <SelectValue placeholder="Selecione o webinário" />
                </SelectTrigger>
                <SelectContent>
                  {webinars?.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Esta sequência será vinculada a este webinário
              </p>
            </div>
            <div className="space-y-2">
              <Label>Nome da Sequência</Label>
              <Input
                value={newSequence.name}
                onChange={(e) => setNewSequence({ ...newSequence, name: e.target.value })}
                placeholder="Ex: Lembrete 1 hora antes"
                data-testid="input-new-sequence-name"
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Fase</Label>
                <Select
                  value={newSequence.phase}
                  onValueChange={(value) => setNewSequence({ ...newSequence, phase: value })}
                >
                  <SelectTrigger data-testid="select-new-sequence-phase">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pre">Antes do webinar</SelectItem>
                    <SelectItem value="post">Depois do webinar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tempo (minutos)</Label>
                <Input
                  type="number"
                  value={Math.abs(newSequence.offsetMinutes)}
                  onChange={(e) => {
                    const value = parseInt(e.target.value) || 0;
                    setNewSequence({
                      ...newSequence,
                      offsetMinutes: newSequence.phase === "pre" ? -value : value
                    });
                  }}
                  placeholder="60"
                  data-testid="input-new-sequence-offset"
                />
                <p className="text-xs text-muted-foreground">
                  {newSequence.phase === "pre" ? "Antes" : "Depois"} do início do webinar
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Assunto do Email</Label>
              <Input
                value={newSequence.subject}
                onChange={(e) => setNewSequence({ ...newSequence, subject: e.target.value })}
                placeholder="Ex: [Lembrete] O webinar começa em breve!"
                data-testid="input-new-sequence-subject"
              />
            </div>
            <div className="space-y-2">
              <Label>Preheader (Preview)</Label>
              <Input
                value={newSequence.preheader}
                onChange={(e) => setNewSequence({ ...newSequence, preheader: e.target.value })}
                placeholder="Texto de preview que aparece na caixa de entrada"
                data-testid="input-new-sequence-preheader"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewSequenceDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleCreateSequence}
              disabled={createSequenceMutation.isPending}
              data-testid="button-create-sequence"
            >
              {createSequenceMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Criar e Editar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDuplicateDialog} onOpenChange={(open) => {
        if (!open) {
          setDuplicatingSequence(null);
          setDuplicateTargetWebinarId("");
        }
        setShowDuplicateDialog(open);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplicar Sequência</DialogTitle>
            <DialogDescription>
              Copie esta sequência para usar em outro webinário
            </DialogDescription>
          </DialogHeader>
          {duplicatingSequence && (
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm font-medium">{duplicatingSequence.name}</p>
                <p className="text-xs text-muted-foreground">
                  {duplicatingSequence.phase === "pre" ? "Antes" : "Depois"} • {formatOffsetMinutes(Math.abs(duplicatingSequence.offsetMinutes))}
                </p>
              </div>
              <div className="space-y-2">
                <Label>Webinário de Destino</Label>
                <Select
                  value={duplicateTargetWebinarId}
                  onValueChange={setDuplicateTargetWebinarId}
                >
                  <SelectTrigger data-testid="select-duplicate-target-webinar">
                    <SelectValue placeholder="Selecione o webinário" />
                  </SelectTrigger>
                  <SelectContent>
                    {webinars?.filter(w => w.id !== duplicatingSequence.webinarId).map((w) => (
                      <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  A sequência será copiada com todas as configurações e design do email
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowDuplicateDialog(false);
              setDuplicatingSequence(null);
            }}>
              Cancelar
            </Button>
            <Button
              onClick={handleDuplicateSequence}
              disabled={duplicateSequenceMutation.isPending || !duplicateTargetWebinarId}
              data-testid="button-confirm-duplicate"
            >
              {duplicateSequenceMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Duplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showLeadFormEditor} onOpenChange={setShowLeadFormEditor}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar Formulário de Captura</DialogTitle>
            <DialogDescription>
              Configure os campos e aparência do formulário
            </DialogDescription>
          </DialogHeader>
          {leadFormConfig && (
            <LeadFormEditorContent
              config={leadFormConfig}
              onSave={(data) => saveLeadFormMutation.mutate(data)}
              saving={saveLeadFormMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showEmbedCodeDialog} onOpenChange={setShowEmbedCodeDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Código Embed</DialogTitle>
            <DialogDescription>
              Copie o código para incorporar o formulário em seu site
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Código JavaScript (Recomendado)</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(embedCodes?.embedCode || "")}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
              <Textarea
                value={embedCodes?.embedCode || ""}
                readOnly
                className="font-mono text-xs h-24"
                data-testid="textarea-embed-js"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Código iFrame</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(embedCodes?.iframeCode || "")}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
              <Textarea
                value={embedCodes?.iframeCode || ""}
                readOnly
                className="font-mono text-xs h-32"
                data-testid="textarea-embed-iframe"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Link Direto</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(embedCodes?.directUrl || "")}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex gap-2">
                <Input value={embedCodes?.directUrl || ""} readOnly data-testid="input-embed-url" />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => window.open(embedCodes?.directUrl, "_blank")}
                >
                  <Eye className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function LeadFormEditorContent({
  config,
  onSave,
  saving
}: {
  config: LeadFormConfig;
  onSave: (data: any) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState(config);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Título</Label>
          <Input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            data-testid="input-form-title"
          />
        </div>
        <div className="space-y-2">
          <Label>Subtítulo</Label>
          <Input
            value={form.subtitle}
            onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
            data-testid="input-form-subtitle"
          />
        </div>
      </div>

      <div className="space-y-3">
        <Label>Campos do Formulário</Label>
        <div className="grid gap-2">
          <div className="flex items-center justify-between p-2 border rounded">
            <span>Nome</span>
            <Switch
              checked={form.collectName}
              onCheckedChange={(checked) => setForm({ ...form, collectName: checked })}
            />
          </div>
          <div className="flex items-center justify-between p-2 border rounded">
            <span>Email</span>
            <Switch
              checked={form.collectEmail}
              onCheckedChange={(checked) => setForm({ ...form, collectEmail: checked })}
            />
          </div>
          <div className="flex items-center justify-between p-2 border rounded">
            <span>WhatsApp</span>
            <Switch
              checked={form.collectWhatsapp}
              onCheckedChange={(checked) => setForm({ ...form, collectWhatsapp: checked })}
            />
          </div>
          <div className="flex items-center justify-between p-2 border rounded">
            <span>Cidade</span>
            <Switch
              checked={form.collectCity}
              onCheckedChange={(checked) => setForm({ ...form, collectCity: checked })}
            />
          </div>
          <div className="flex items-center justify-between p-2 border rounded">
            <span>Estado</span>
            <Switch
              checked={form.collectState}
              onCheckedChange={(checked) => setForm({ ...form, collectState: checked })}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Texto do Botão</Label>
          <Input
            value={form.buttonText}
            onChange={(e) => setForm({ ...form, buttonText: e.target.value })}
            data-testid="input-form-button-text"
          />
        </div>
        <div className="space-y-2">
          <Label>Cor do Botão</Label>
          <div className="flex gap-2">
            <Input
              type="color"
              value={form.buttonColor}
              onChange={(e) => setForm({ ...form, buttonColor: e.target.value })}
              className="w-12 h-9 p-1"
            />
            <Input
              value={form.buttonColor}
              onChange={(e) => setForm({ ...form, buttonColor: e.target.value })}
              className="flex-1"
              data-testid="input-form-button-color"
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Mensagem de Sucesso</Label>
        <Input
          value={form.successMessage}
          onChange={(e) => setForm({ ...form, successMessage: e.target.value })}
          data-testid="input-form-success-message"
        />
      </div>

      <div className="space-y-2">
        <Label>URL de Redirecionamento (opcional)</Label>
        <Input
          value={form.redirectUrl || ""}
          onChange={(e) => setForm({ ...form, redirectUrl: e.target.value || null })}
          placeholder="https://seu-site.com/obrigado"
          data-testid="input-form-redirect"
        />
      </div>

      <div className="flex items-center justify-between p-3 border rounded">
        <div>
          <p className="font-medium">Consentimento LGPD</p>
          <p className="text-sm text-muted-foreground">Exigir checkbox de consentimento</p>
        </div>
        <Switch
          checked={form.requireConsent}
          onCheckedChange={(checked) => setForm({ ...form, requireConsent: checked })}
        />
      </div>

      {form.requireConsent && (
        <div className="space-y-2">
          <Label>Texto do Consentimento</Label>
          <Textarea
            value={form.consentText}
            onChange={(e) => setForm({ ...form, consentText: e.target.value })}
            data-testid="input-form-consent-text"
          />
        </div>
      )}

      <DialogFooter>
        <Button
          onClick={() => onSave(form)}
          disabled={saving}
          data-testid="button-save-form"
        >
          {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Salvar Formulário
        </Button>
      </DialogFooter>
    </div>
  );
}
