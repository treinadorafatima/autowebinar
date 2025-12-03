import { useState, useEffect, useRef } from "react";
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
  CheckCircle, XCircle, Loader2, Send, Trash2, Plus, Edit, 
  Clock, QrCode, Smartphone, Wifi, WifiOff, RefreshCcw, ArrowLeft
} from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface WhatsAppStatus {
  status: "disconnected" | "connecting" | "connected" | "qr_ready";
  phoneNumber?: string;
  qrCode?: string;
  lastConnected?: string;
}

interface WhatsAppSequence {
  id: string;
  adminId: string;
  webinarId: string | null;
  name: string;
  phase: string;
  offsetMinutes: number;
  messageText: string;
  messageType: string;
  mediaUrl?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Webinar {
  id: string;
  name: string;
  slug: string;
}

const PHASES = [
  { value: "pre", label: "Pré-Webinar", description: "Antes do evento começar" },
  { value: "during", label: "Durante", description: "Durante o webinar" },
  { value: "post", label: "Pós-Webinar", description: "Após o evento" },
  { value: "replay", label: "Replay", description: "Quando replay disponível" },
];

const convertMinutesToDHM = (totalMinutes: number) => {
  const absMinutes = Math.abs(totalMinutes);
  const days = Math.floor(absMinutes / (24 * 60));
  const hours = Math.floor((absMinutes % (24 * 60)) / 60);
  const minutes = absMinutes % 60;
  const timing = totalMinutes <= 0 ? "before" : "after";
  return { days, hours, minutes, timing };
};

const convertDHMToMinutes = (days: number, hours: number, minutes: number, timing: "before" | "after") => {
  const totalMinutes = (days * 24 * 60) + (hours * 60) + minutes;
  return timing === "before" ? -totalMinutes : totalMinutes;
};

export default function AdminWhatsAppMarketing() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("connection");
  const [selectedWebinarId, setSelectedWebinarId] = useState<string>("");
  
  const [showNewSequenceDialog, setShowNewSequenceDialog] = useState(false);
  const [editingSequence, setEditingSequence] = useState<WhatsAppSequence | null>(null);
  const [newSequence, setNewSequence] = useState({
    name: "",
    phase: "pre",
    offsetMinutes: -60,
    messageText: "",
    messageType: "text",
    webinarId: ""
  });
  
  const [newTiming, setNewTiming] = useState<"before" | "after" | "at_start">("before");
  const [newDays, setNewDays] = useState(0);
  const [newHours, setNewHours] = useState(1);
  const [newMinutes, setNewMinutes] = useState(0);
  
  const [editTiming, setEditTiming] = useState<"before" | "after" | "at_start">("before");
  const [editDays, setEditDays] = useState(0);
  const [editHours, setEditHours] = useState(1);
  const [editMinutes, setEditMinutes] = useState(0);

  const [testPhone, setTestPhone] = useState("");
  const [testMessage, setTestMessage] = useState("");
  const [showMergeTagsInfo, setShowMergeTagsInfo] = useState(false);

  const qrRefreshInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: status, isLoading: loadingStatus } = useQuery<WhatsAppStatus>({
    queryKey: ["/api/whatsapp/status"],
    refetchInterval: (query) => {
      const data = query.state.data as WhatsAppStatus | undefined;
      if (data?.status === "connecting" || data?.status === "qr_ready") {
        return 3000;
      }
      return false;
    },
  });

  const { data: webinars } = useQuery<Webinar[]>({
    queryKey: ["/api/webinars"],
  });

  const { data: sequences, isLoading: loadingSequences } = useQuery<WhatsAppSequence[]>({
    queryKey: ["/api/whatsapp/sequences", selectedWebinarId],
    queryFn: async () => {
      const url = selectedWebinarId 
        ? `/api/whatsapp/sequences?webinarId=${selectedWebinarId}`
        : "/api/whatsapp/sequences";
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${localStorage.getItem("adminToken")}` }
      });
      return res.json();
    },
    enabled: activeTab === "sequences"
  });

  useEffect(() => {
    if (webinars && webinars.length > 0 && !selectedWebinarId) {
      setSelectedWebinarId(webinars[0].id);
    }
  }, [webinars, selectedWebinarId]);

  useEffect(() => {
    if (editingSequence) {
      const { days, hours, minutes, timing } = convertMinutesToDHM(editingSequence.offsetMinutes);
      if (editingSequence.offsetMinutes === 0) {
        setEditTiming("at_start");
        setEditDays(0);
        setEditHours(0);
        setEditMinutes(0);
      } else {
        setEditTiming(timing as "before" | "after");
        setEditDays(days);
        setEditHours(hours);
        setEditMinutes(minutes);
      }
    }
  }, [editingSequence?.id]);

  const connectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/whatsapp/connect");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/status"] });
    },
    onError: (error: any) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/whatsapp/disconnect");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Desconectado do WhatsApp" });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/status"] });
    },
    onError: (error: any) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const sendTestMutation = useMutation({
    mutationFn: async (data: { phone: string; message: string }) => {
      const res = await apiRequest("POST", "/api/whatsapp/send-test", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Mensagem enviada com sucesso!" });
      setTestPhone("");
      setTestMessage("");
    },
    onError: (error: any) => {
      toast({ title: "Erro ao enviar", description: error.message, variant: "destructive" });
    },
  });

  const createSequenceMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/whatsapp/sequences", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Sequência criada" });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/sequences"] });
      setShowNewSequenceDialog(false);
      resetNewSequence();
    },
    onError: (error: any) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const updateSequenceMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/whatsapp/sequences/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Sequência atualizada" });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/sequences"] });
      setEditingSequence(null);
    },
    onError: (error: any) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const deleteSequenceMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/whatsapp/sequences/${id}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Sequência excluída" });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/sequences"] });
    },
    onError: (error: any) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const resetNewSequence = () => {
    setNewSequence({
      name: "",
      phase: "pre",
      offsetMinutes: -60,
      messageText: "",
      messageType: "text",
      webinarId: selectedWebinarId
    });
    setNewTiming("before");
    setNewDays(0);
    setNewHours(1);
    setNewMinutes(0);
  };

  const handleCreateSequence = () => {
    if (!newSequence.name || !newSequence.messageText) {
      toast({ title: "Preencha todos os campos", variant: "destructive" });
      return;
    }
    if (!newSequence.webinarId) {
      toast({ title: "Selecione um webinar", variant: "destructive" });
      return;
    }
    let calculatedOffset = 0;
    if (newTiming !== "at_start") {
      calculatedOffset = convertDHMToMinutes(newDays, newHours, newMinutes, newTiming as "before" | "after");
    }
    createSequenceMutation.mutate({
      ...newSequence,
      offsetMinutes: calculatedOffset,
      isActive: true,
    });
  };

  const handleOpenNewSequence = () => {
    setNewSequence({
      name: "",
      phase: "pre",
      offsetMinutes: -60,
      messageText: "",
      messageType: "text",
      webinarId: selectedWebinarId
    });
    setNewTiming("before");
    setNewDays(0);
    setNewHours(1);
    setNewMinutes(0);
    setShowNewSequenceDialog(true);
  };

  const getPhaseLabel = (phase: string) => {
    const p = PHASES.find(p => p.value === phase);
    return p?.label || phase;
  };

  const formatOffset = (minutes: number) => {
    if (minutes === 0) {
      return "No inicio";
    }
    
    const absMinutes = Math.abs(minutes);
    const days = Math.floor(absMinutes / (24 * 60));
    const hours = Math.floor((absMinutes % (24 * 60)) / 60);
    const mins = absMinutes % 60;
    
    let timeStr = "";
    if (days > 0) {
      timeStr += `${days}d `;
    }
    if (hours > 0) {
      timeStr += `${hours}h `;
    }
    if (mins > 0) {
      timeStr += `${mins}min`;
    }
    if (timeStr.trim() === "") {
      timeStr = "0min";
    }
    
    return minutes < 0 ? `${timeStr.trim()} antes` : `${timeStr.trim()} depois`;
  };

  const getStatusBadge = () => {
    if (!status) return null;
    
    switch (status.status) {
      case "connected":
        return (
          <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
            <Wifi className="w-3 h-3 mr-1" />
            Conectado
          </Badge>
        );
      case "connecting":
        return (
          <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            Conectando...
          </Badge>
        );
      case "qr_ready":
        return (
          <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">
            <QrCode className="w-3 h-3 mr-1" />
            Aguardando Scan
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-muted-foreground">
            <WifiOff className="w-3 h-3 mr-1" />
            Desconectado
          </Badge>
        );
    }
  };

  const MERGE_TAGS = [
    { tag: "{{nome}}", description: "Nome do lead" },
    { tag: "{{email}}", description: "Email do lead" },
    { tag: "{{telefone}}", description: "Telefone do lead" },
    { tag: "{{webinar_titulo}}", description: "Título do webinar" },
    { tag: "{{webinar_data}}", description: "Data do webinar (DD/MM/YYYY)" },
    { tag: "{{webinar_horario}}", description: "Horário do webinar" },
    { tag: "{{webinar_link}}", description: "Link para assistir o webinar" },
    { tag: "{{replay_link}}", description: "Link do replay" },
  ];

  return (
    <div className="min-h-screen bg-background p-6" data-testid="page-whatsapp-marketing">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => window.history.back()}
              data-testid="button-back"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-2">
              <SiWhatsapp className="w-6 h-6 text-green-500" />
              <h1 className="text-2xl font-bold">WhatsApp Marketing</h1>
            </div>
          </div>
          {getStatusBadge()}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-3 w-full max-w-md">
            <TabsTrigger value="connection" data-testid="tab-connection">
              <Smartphone className="w-4 h-4 mr-2" />
              Conexão
            </TabsTrigger>
            <TabsTrigger value="sequences" data-testid="tab-sequences">
              <Clock className="w-4 h-4 mr-2" />
              Sequências
            </TabsTrigger>
            <TabsTrigger value="test" data-testid="tab-test">
              <Send className="w-4 h-4 mr-2" />
              Testar
            </TabsTrigger>
          </TabsList>

          <TabsContent value="connection" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <QrCode className="w-5 h-5" />
                  Conexão WhatsApp
                </CardTitle>
                <CardDescription>
                  Conecte seu WhatsApp escaneando o QR Code com o aplicativo
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {loadingStatus ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                  </div>
                ) : status?.status === "connected" ? (
                  <div className="text-center space-y-4">
                    <div className="w-24 h-24 mx-auto bg-green-500/10 rounded-full flex items-center justify-center">
                      <CheckCircle className="w-12 h-12 text-green-500" />
                    </div>
                    <div>
                      <p className="text-lg font-medium text-green-500">WhatsApp Conectado</p>
                      {status.phoneNumber && (
                        <p className="text-muted-foreground">{status.phoneNumber}</p>
                      )}
                    </div>
                    <Button 
                      variant="destructive" 
                      onClick={() => disconnectMutation.mutate()}
                      disabled={disconnectMutation.isPending}
                      data-testid="button-disconnect"
                    >
                      {disconnectMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <WifiOff className="w-4 h-4 mr-2" />
                      )}
                      Desconectar
                    </Button>
                  </div>
                ) : status?.status === "qr_ready" && status.qrCode ? (
                  <div className="text-center space-y-4">
                    <p className="text-muted-foreground">
                      Escaneie o QR Code com o WhatsApp no seu celular
                    </p>
                    <div className="bg-white p-4 rounded-lg inline-block">
                      <img 
                        src={status.qrCode} 
                        alt="QR Code WhatsApp" 
                        className="w-64 h-64"
                        data-testid="img-qrcode"
                      />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      O QR Code atualiza automaticamente a cada 30 segundos
                    </p>
                  </div>
                ) : status?.status === "connecting" ? (
                  <div className="text-center space-y-4">
                    <Loader2 className="w-12 h-12 mx-auto animate-spin text-muted-foreground" />
                    <p className="text-muted-foreground">Gerando QR Code...</p>
                  </div>
                ) : (
                  <div className="text-center space-y-4">
                    <div className="w-24 h-24 mx-auto bg-muted rounded-full flex items-center justify-center">
                      <Smartphone className="w-12 h-12 text-muted-foreground" />
                    </div>
                    <p className="text-muted-foreground">
                      Clique no botão abaixo para gerar o QR Code e conectar seu WhatsApp
                    </p>
                    <Button 
                      onClick={() => connectMutation.mutate()}
                      disabled={connectMutation.isPending}
                      data-testid="button-connect"
                    >
                      {connectMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <QrCode className="w-4 h-4 mr-2" />
                      )}
                      Conectar WhatsApp
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Como funciona?</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4">
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center text-green-500 font-bold">1</div>
                    <div>
                      <p className="font-medium">Conecte seu WhatsApp</p>
                      <p className="text-sm text-muted-foreground">Escaneie o QR Code com o aplicativo do WhatsApp</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center text-green-500 font-bold">2</div>
                    <div>
                      <p className="font-medium">Crie sequências de mensagens</p>
                      <p className="text-sm text-muted-foreground">Configure mensagens automáticas para antes, durante e após o webinar</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center text-green-500 font-bold">3</div>
                    <div>
                      <p className="font-medium">Envio automático</p>
                      <p className="text-sm text-muted-foreground">As mensagens são enviadas automaticamente nos horários configurados</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sequences" className="space-y-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <Label>Webinar:</Label>
                <Select value={selectedWebinarId} onValueChange={setSelectedWebinarId}>
                  <SelectTrigger className="w-64" data-testid="select-webinar">
                    <SelectValue placeholder="Selecione um webinar" />
                  </SelectTrigger>
                  <SelectContent>
                    {webinars?.map((webinar) => (
                      <SelectItem key={webinar.id} value={webinar.id}>
                        {webinar.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleOpenNewSequence} data-testid="button-new-sequence">
                <Plus className="w-4 h-4 mr-2" />
                Nova Sequência
              </Button>
            </div>

            {loadingSequences ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : sequences && sequences.length > 0 ? (
              <div className="grid gap-4">
                {sequences.map((sequence) => (
                  <Card key={sequence.id} data-testid={`card-sequence-${sequence.id}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <CardTitle className="text-lg">{sequence.name}</CardTitle>
                          <Badge variant={sequence.isActive ? "default" : "secondary"}>
                            {sequence.isActive ? "Ativa" : "Inativa"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingSequence(sequence)}
                            data-testid={`button-edit-${sequence.id}`}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => {
                              if (confirm("Tem certeza que deseja excluir esta sequência?")) {
                                deleteSequenceMutation.mutate(sequence.id);
                              }
                            }}
                            data-testid={`button-delete-${sequence.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
                        <Badge variant="outline">{getPhaseLabel(sequence.phase)}</Badge>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatOffset(sequence.offsetMinutes)}
                        </span>
                      </div>
                      <div className="bg-muted/50 p-3 rounded-lg">
                        <p className="text-sm whitespace-pre-wrap">{sequence.messageText}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <SiWhatsapp className="w-12 h-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">
                    Nenhuma sequência de WhatsApp configurada
                  </p>
                  <Button onClick={handleOpenNewSequence}>
                    <Plus className="w-4 h-4 mr-2" />
                    Criar primeira sequência
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="test" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Send className="w-5 h-5" />
                  Enviar Mensagem de Teste
                </CardTitle>
                <CardDescription>
                  Envie uma mensagem de teste para verificar se a conexão está funcionando
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {status?.status !== "connected" ? (
                  <div className="text-center py-8">
                    <WifiOff className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">
                      Conecte seu WhatsApp primeiro para enviar mensagens de teste
                    </p>
                    <Button 
                      variant="outline" 
                      className="mt-4"
                      onClick={() => setActiveTab("connection")}
                    >
                      Ir para Conexão
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="test-phone">Número do WhatsApp</Label>
                      <Input
                        id="test-phone"
                        placeholder="5511999999999"
                        value={testPhone}
                        onChange={(e) => setTestPhone(e.target.value)}
                        data-testid="input-test-phone"
                      />
                      <p className="text-xs text-muted-foreground">
                        Digite o número com código do país (ex: 5511999999999)
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="test-message">Mensagem</Label>
                      <Textarea
                        id="test-message"
                        placeholder="Digite sua mensagem de teste..."
                        value={testMessage}
                        onChange={(e) => setTestMessage(e.target.value)}
                        rows={4}
                        data-testid="input-test-message"
                      />
                    </div>
                    <Button
                      onClick={() => sendTestMutation.mutate({ phone: testPhone, message: testMessage })}
                      disabled={sendTestMutation.isPending || !testPhone || !testMessage}
                      data-testid="button-send-test"
                    >
                      {sendTestMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4 mr-2" />
                      )}
                      Enviar Teste
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={showNewSequenceDialog} onOpenChange={setShowNewSequenceDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Nova Sequência de WhatsApp</DialogTitle>
              <DialogDescription>
                Configure uma nova mensagem automática para os leads
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="seq-name">Nome da Sequência</Label>
                <Input
                  id="seq-name"
                  placeholder="Ex: Lembrete 1h antes"
                  value={newSequence.name}
                  onChange={(e) => setNewSequence({ ...newSequence, name: e.target.value })}
                  data-testid="input-sequence-name"
                />
              </div>

              <div className="space-y-2">
                <Label>Webinar</Label>
                <Select 
                  value={newSequence.webinarId} 
                  onValueChange={(v) => setNewSequence({ ...newSequence, webinarId: v })}
                >
                  <SelectTrigger data-testid="select-sequence-webinar">
                    <SelectValue placeholder="Selecione um webinar" />
                  </SelectTrigger>
                  <SelectContent>
                    {webinars?.map((webinar) => (
                      <SelectItem key={webinar.id} value={webinar.id}>
                        {webinar.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Fase</Label>
                  <Select 
                    value={newSequence.phase} 
                    onValueChange={(v) => setNewSequence({ ...newSequence, phase: v })}
                  >
                    <SelectTrigger data-testid="select-sequence-phase">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PHASES.map((phase) => (
                        <SelectItem key={phase.value} value={phase.value}>
                          {phase.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Momento do Envio</Label>
                  <Select 
                    value={newTiming} 
                    onValueChange={(v) => setNewTiming(v as "before" | "after")}
                  >
                    <SelectTrigger data-testid="select-sequence-timing">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="before">Antes da sessao</SelectItem>
                      <SelectItem value="at_start">No inicio</SelectItem>
                      <SelectItem value="after">Depois da sessao</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {newTiming !== "at_start" && (
                <div className="space-y-2">
                  <Label>Tempo personalizado</Label>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Dias</Label>
                      <Input
                        type="number"
                        min={0}
                        value={newDays}
                        onChange={(e) => setNewDays(Math.max(0, parseInt(e.target.value) || 0))}
                        data-testid="input-sequence-days"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Horas</Label>
                      <Input
                        type="number"
                        min={0}
                        max={23}
                        value={newHours}
                        onChange={(e) => setNewHours(Math.max(0, Math.min(23, parseInt(e.target.value) || 0)))}
                        data-testid="input-sequence-hours"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Minutos</Label>
                      <Input
                        type="number"
                        min={0}
                        max={59}
                        value={newMinutes}
                        onChange={(e) => setNewMinutes(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                        data-testid="input-sequence-minutes"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    A mensagem sera enviada {newDays > 0 ? `${newDays} dia(s), ` : ""}{newHours > 0 ? `${newHours}h ` : ""}{newMinutes > 0 ? `${newMinutes}min ` : ""}{newTiming === "before" ? "antes" : "depois"} da sessao
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="seq-message">Mensagem</Label>
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setShowMergeTagsInfo(!showMergeTagsInfo)}
                  >
                    Ver Merge Tags
                  </Button>
                </div>
                <Textarea
                  id="seq-message"
                  placeholder="Digite a mensagem que será enviada..."
                  value={newSequence.messageText}
                  onChange={(e) => setNewSequence({ ...newSequence, messageText: e.target.value })}
                  rows={6}
                  data-testid="input-sequence-message"
                />
                {showMergeTagsInfo && (
                  <div className="bg-muted p-3 rounded-lg mt-2">
                    <p className="text-sm font-medium mb-2">Merge Tags Disponíveis:</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {MERGE_TAGS.map((tag) => (
                        <div key={tag.tag} className="flex items-center gap-2">
                          <code className="bg-background px-1 rounded">{tag.tag}</code>
                          <span className="text-muted-foreground">{tag.description}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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
                {createSequenceMutation.isPending && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                Criar Sequência
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!editingSequence} onOpenChange={(open) => !open && setEditingSequence(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Editar Sequência</DialogTitle>
            </DialogHeader>
            {editingSequence && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Nome da Sequência</Label>
                  <Input
                    id="edit-name"
                    value={editingSequence.name}
                    onChange={(e) => setEditingSequence({ ...editingSequence, name: e.target.value })}
                    data-testid="input-edit-name"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Fase</Label>
                    <Select 
                      value={editingSequence.phase} 
                      onValueChange={(v) => setEditingSequence({ ...editingSequence, phase: v })}
                    >
                      <SelectTrigger data-testid="select-edit-phase">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PHASES.map((phase) => (
                          <SelectItem key={phase.value} value={phase.value}>
                            {phase.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Momento do Envio</Label>
                    <Select 
                      value={editTiming} 
                      onValueChange={(v) => setEditTiming(v as "before" | "after" | "at_start")}
                    >
                      <SelectTrigger data-testid="select-edit-timing">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="before">Antes da sessao</SelectItem>
                        <SelectItem value="at_start">No inicio</SelectItem>
                        <SelectItem value="after">Depois da sessao</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {editTiming !== "at_start" && (
                  <div className="space-y-2">
                    <Label>Tempo personalizado</Label>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Dias</Label>
                        <Input
                          type="number"
                          min={0}
                          value={editDays}
                          onChange={(e) => setEditDays(Math.max(0, parseInt(e.target.value) || 0))}
                          data-testid="input-edit-days"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Horas</Label>
                        <Input
                          type="number"
                          min={0}
                          max={23}
                          value={editHours}
                          onChange={(e) => setEditHours(Math.max(0, Math.min(23, parseInt(e.target.value) || 0)))}
                          data-testid="input-edit-hours"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Minutos</Label>
                        <Input
                          type="number"
                          min={0}
                          max={59}
                          value={editMinutes}
                          onChange={(e) => setEditMinutes(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                          data-testid="input-edit-minutes"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      A mensagem sera enviada {editDays > 0 ? `${editDays} dia(s), ` : ""}{editHours > 0 ? `${editHours}h ` : ""}{editMinutes > 0 ? `${editMinutes}min ` : ""}{editTiming === "before" ? "antes" : "depois"} da sessao
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="edit-message">Mensagem</Label>
                  <Textarea
                    id="edit-message"
                    value={editingSequence.messageText}
                    onChange={(e) => setEditingSequence({ ...editingSequence, messageText: e.target.value })}
                    rows={6}
                    data-testid="input-edit-message"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Switch
                    checked={editingSequence.isActive}
                    onCheckedChange={(checked) => setEditingSequence({ ...editingSequence, isActive: checked })}
                    data-testid="switch-edit-active"
                  />
                  <Label>Sequência Ativa</Label>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingSequence(null)}>
                Cancelar
              </Button>
              <Button 
                onClick={() => {
                  if (editingSequence) {
                    let calculatedOffset = 0;
                    if (editTiming !== "at_start") {
                      calculatedOffset = convertDHMToMinutes(editDays, editHours, editMinutes, editTiming as "before" | "after");
                    }
                    updateSequenceMutation.mutate({
                      id: editingSequence.id,
                      data: {
                        name: editingSequence.name,
                        phase: editingSequence.phase,
                        offsetMinutes: calculatedOffset,
                        messageText: editingSequence.messageText,
                        isActive: editingSequence.isActive,
                      }
                    });
                  }
                }}
                disabled={updateSequenceMutation.isPending}
                data-testid="button-save-sequence"
              >
                {updateSequenceMutation.isPending && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                Salvar Alterações
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
