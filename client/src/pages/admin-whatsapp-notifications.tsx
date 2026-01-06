import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  CheckCircle, XCircle, Loader2, Wifi, WifiOff, RefreshCcw, 
  QrCode, Smartphone, Bell, BellOff, AlertCircle, Clock, 
  History, Trash2, MessageSquare, Ban, RotateCcw, Settings, Save, FileText, Edit3, CalendarIcon
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SiWhatsapp } from "react-icons/si";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { WhatsappNotificationTemplate } from "@shared/schema";

interface WhatsappNotificationLog {
  id: string;
  notificationType: string;
  recipientPhone: string;
  recipientName: string | null;
  message: string;
  status: string;
  sentAt: string | null;
  createdAt: string;
  error: string | null;
}

interface NotificationStatus {
  configured: boolean;
  accountId: string | null;
  status: string;
  phoneNumber?: string;
  enabled: boolean;
  connectedAccounts: number;
  totalAccounts: number;
}

interface WhatsAppAccount {
  id: string;
  adminId: string;
  label: string;
  phoneNumber: string | null;
  status: string;
  hourlyLimit: number;
  messagesSentThisHour: number;
  priority: number;
}

interface WhatsAppConnectionStatus {
  status: "disconnected" | "connecting" | "connected" | "qr_ready";
  phoneNumber?: string;
  qrCode?: string;
  qrExpired?: boolean;
}

const templatePlaceholders: Record<string, string[]> = {
  credentials: ["{name}", "{email}", "{planName}", "{tempPassword}", "{loginUrl}", "{appName}"],
  payment_confirmed: ["{name}", "{planName}", "{expirationDate}", "{loginUrl}", "{appName}"],
  password_reset: ["{name}", "{resetUrl}", "{appName}"],
  plan_expired: ["{name}", "{planName}", "{renewUrl}", "{appName}"],
  payment_failed: ["{name}", "{planName}", "{reason}", "{paymentUrl}", "{appName}"],
  welcome: ["{name}", "{adminUrl}", "{appName}"],
  expiration_reminder_3days: ["{name}", "{planName}", "{expirationDate}", "{renewUrl}", "{appName}"],
  expiration_reminder_1day: ["{name}", "{planName}", "{expirationDate}", "{renewUrl}", "{appName}"],
  expiration_reminder_today: ["{name}", "{planName}", "{expirationDate}", "{renewUrl}", "{appName}"],
  expiration_reminder: ["{name}", "{planName}", "{expirationDate}", "{daysUntilExpiration}", "{renewUrl}", "{appName}"],
  auto_renewal_payment: ["{name}", "{planName}", "{expirationDate}", "{pixCopiaCola}", "{boletoUrl}", "{appName}"],
  payment_recovery: ["{name}", "{planName}", "{amount}", "{checkoutUrl}", "{appName}"],
  payment_pending: ["{name}", "{planName}", "{paymentMethod}", "{checkoutUrl}", "{appName}"],
  pix_generated: ["{name}", "{planName}", "{amount}", "{expirationTime}", "{pixCopiaCola}", "{appName}"],
  boleto_generated: ["{name}", "{planName}", "{amount}", "{dueDate}", "{boletoUrl}", "{appName}"],
  recurring_payment_failed_reminder: ["{name}", "{planName}", "{checkoutUrl}", "{reminderNumber}", "{appName}"],
};

export default function AdminWhatsAppNotificationsPage() {
  const { toast } = useToast();
  const [qrPollingEnabled, setQrPollingEnabled] = useState(false);
  const [connectingAccountId, setConnectingAccountId] = useState<string | null>(null);
  const qrPollingRef = useRef<NodeJS.Timeout | null>(null);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editHourlyLimit, setEditHourlyLimit] = useState<number>(10);
  const [editPriority, setEditPriority] = useState<number>(0);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editingTemplateMessage, setEditingTemplateMessage] = useState<string>("");
  const [showPairingCodeInput, setShowPairingCodeInput] = useState(false);
  const [pairingPhoneNumber, setPairingPhoneNumber] = useState("");
  const [generatedPairingCode, setGeneratedPairingCode] = useState<string | null>(null);
  const [deleteStartDate, setDeleteStartDate] = useState<Date | undefined>(undefined);
  const [deleteEndDate, setDeleteEndDate] = useState<Date | undefined>(undefined);
  const [showDeleteDatePicker, setShowDeleteDatePicker] = useState(false);

  const { data: notificationStatus, isLoading: loadingStatus, refetch: refetchStatus } = useQuery<NotificationStatus>({
    queryKey: ["/api/notifications/whatsapp/status"],
  });

  const { data: accounts = [], isLoading: loadingAccounts } = useQuery<WhatsAppAccount[]>({
    queryKey: ["/api/notifications/whatsapp/accounts"],
  });

  const { data: connectionStatus, refetch: refetchConnection } = useQuery<WhatsAppConnectionStatus>({
    queryKey: ["/api/whatsapp/status", notificationStatus?.accountId],
    queryFn: async () => {
      if (!notificationStatus?.accountId) return { status: "disconnected" };
      const res = await fetch(`/api/whatsapp/status?accountId=${notificationStatus.accountId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("adminToken")}` }
      });
      return res.json();
    },
    enabled: !!notificationStatus?.accountId,
    refetchInterval: qrPollingEnabled ? 3000 : false,
  });

  const { data: notificationLogs = [], isLoading: loadingLogs, refetch: refetchLogs } = useQuery<WhatsappNotificationLog[]>({
    queryKey: ["/api/notifications/whatsapp/logs"],
  });

  const { data: notificationQueue = [], isLoading: loadingQueue, refetch: refetchQueue } = useQuery<WhatsappNotificationLog[]>({
    queryKey: ["/api/notifications/whatsapp/queue"],
  });

  const { data: templates = [], isLoading: loadingTemplates, isError: templatesError } = useQuery<WhatsappNotificationTemplate[]>({
    queryKey: ["/api/notifications/whatsapp/templates"],
    refetchOnWindowFocus: false,
    staleTime: 30000,
  });

  const { data: connectingAccountStatus, refetch: refetchConnectingAccount } = useQuery<WhatsAppConnectionStatus>({
    queryKey: ["/api/whatsapp/status", "connecting", connectingAccountId],
    queryFn: async () => {
      if (!connectingAccountId) return { status: "disconnected" };
      const res = await fetch(`/api/whatsapp/status?accountId=${connectingAccountId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("adminToken")}` }
      });
      return res.json();
    },
    enabled: !!connectingAccountId,
    refetchInterval: connectingAccountId ? 3000 : false,
  });

  const cancelQueueMutation = useMutation({
    mutationFn: async () => {
      const queueCount = notificationQueue.length;
      await apiRequest("DELETE", "/api/notifications/whatsapp/queue");
      return queueCount;
    },
    onSuccess: (cancelledCount: number) => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/whatsapp/queue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/whatsapp/logs"] });
      if (cancelledCount > 0) {
        toast({
          title: "Fila cancelada",
          description: `${cancelledCount} mensagem(ns) pendente(s) foi(foram) cancelada(s)`,
        });
      } else {
        toast({
          title: "Fila vazia",
          description: "Não havia mensagens pendentes para cancelar",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Não foi possível cancelar a fila",
        variant: "destructive",
      });
    },
  });

  const deleteLogsMutation = useMutation({
    mutationFn: async ({ startDate, endDate, deleteAll }: { startDate?: Date; endDate?: Date; deleteAll?: boolean }) => {
      let url = "/api/notifications/whatsapp/logs";
      if (startDate && endDate) {
        url += `?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`;
      } else if (deleteAll) {
        url += `?deleteAll=true`;
      }
      return apiRequest("DELETE", url);
    },
    onSuccess: (data: { deletedCount: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/whatsapp/logs"] });
      setDeleteStartDate(undefined);
      setDeleteEndDate(undefined);
      setShowDeleteDatePicker(false);
      toast({
        title: "Histórico excluído",
        description: `${data.deletedCount} mensagem(ns) excluída(s) do histórico`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Não foi possível excluir o histórico",
        variant: "destructive",
      });
    },
  });

  const deleteQueueItemMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/notifications/whatsapp/queue/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/whatsapp/queue"] });
      toast({
        title: "Mensagem removida",
        description: "Mensagem removida da fila com sucesso",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Não foi possível remover a mensagem",
        variant: "destructive",
      });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      return apiRequest("POST", "/api/notifications/whatsapp/toggle", { enabled });
    },
    onSuccess: (_, enabled) => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/whatsapp/status"] });
      toast({
        title: enabled ? "Notificações ativadas" : "Notificações desativadas",
        description: enabled 
          ? "Os clientes receberão notificações via WhatsApp" 
          : "Notificações via WhatsApp foram desativadas",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Não foi possível alterar as configurações",
        variant: "destructive",
      });
    },
  });

  const connectMutation = useMutation({
    mutationFn: async (accountId: string) => {
      return apiRequest("POST", `/api/whatsapp/connect`, { accountId });
    },
    onSuccess: () => {
      setQrPollingEnabled(true);
      refetchConnection();
      toast({
        title: "Conectando...",
        description: "Escaneie o QR Code para conectar o WhatsApp",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao conectar",
        description: error.message || "Não foi possível iniciar a conexão",
        variant: "destructive",
      });
    },
  });

  const pairingCodeMutation = useMutation({
    mutationFn: async ({ accountId, phoneNumber }: { accountId: string; phoneNumber: string }) => {
      // Validate phone number format
      const cleanedPhone = phoneNumber.replace(/\D/g, "");
      if (!cleanedPhone || cleanedPhone.length < 10) {
        throw new Error("Número de telefone inválido. Use o formato: +55 11 98765-4321 ou apenas números com código do país");
      }
      
      const res = await apiRequest("POST", `/api/whatsapp/connect-pairing`, { accountId, phoneNumber: cleanedPhone });
      return res.json();
    },
    onSuccess: (data: { success: boolean; pairingCode?: string; error?: string }) => {
      if (data.success && data.pairingCode) {
        setGeneratedPairingCode(data.pairingCode);
        setQrPollingEnabled(true);
        setConnectingAccountId(null);
        toast({
          title: "Código gerado com sucesso!",
          description: "O código é válido por 5 minutos. Digite no WhatsApp para conectar.",
        });
      } else {
        toast({
          title: "Erro ao gerar código",
          description: data.error || "Não foi possível gerar o código. Verifique o número de telefone.",
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao gerar código",
        description: error.message || "Número de telefone inválido ou erro de conexão",
        variant: "destructive",
      });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async (accountId: string) => {
      return apiRequest("POST", `/api/whatsapp/disconnect`, { accountId });
    },
    onSuccess: () => {
      setQrPollingEnabled(false);
      setGeneratedPairingCode(null);
      setShowPairingCodeInput(false);
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/whatsapp/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/status"] });
      toast({
        title: "Desconectado",
        description: "Conta WhatsApp desconectada com sucesso",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao desconectar",
        description: error.message || "Não foi possível desconectar",
        variant: "destructive",
      });
    },
  });

  const resetSessionMutation = useMutation({
    mutationFn: async (accountId: string) => {
      const res = await apiRequest("POST", `/api/whatsapp/reset-session`, { accountId });
      return res.json();
    },
    onSuccess: (data: { success: boolean; message: string }) => {
      setQrPollingEnabled(false);
      setGeneratedPairingCode(null);
      setShowPairingCodeInput(false);
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/whatsapp/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/status"] });
      toast({
        title: data.success ? "Sessão Resetada" : "Erro",
        description: data.message,
        variant: data.success ? "default" : "destructive",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao resetar sessão",
        description: error.message || "Não foi possível resetar a sessão",
        variant: "destructive",
      });
    },
  });

  const createAccountMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/whatsapp/accounts", {
        label: "Notificações do Sistema",
        dailyLimit: 500,
        priority: 1,
        provider: "baileys",
        scope: "notifications",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/whatsapp/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/whatsapp/status"] });
      toast({
        title: "Conta criada",
        description: "Nova conta WhatsApp criada. Conecte via QR Code para ativar.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao criar conta",
        description: error.message || "Não foi possível criar a conta",
        variant: "destructive",
      });
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async (accountId: string) => {
      return apiRequest("DELETE", `/api/whatsapp/accounts/${accountId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/whatsapp/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/whatsapp/status"] });
      toast({
        title: "Conta removida",
        description: "A conta WhatsApp foi removida com sucesso",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao remover",
        description: error.message || "Não foi possível remover a conta",
        variant: "destructive",
      });
    },
  });

  const updateAccountMutation = useMutation({
    mutationFn: async ({ accountId, hourlyLimit, priority }: { accountId: string; hourlyLimit: number; priority: number }) => {
      return apiRequest("PATCH", `/api/notifications/whatsapp/accounts/${accountId}`, {
        hourlyLimit,
        priority,
      });
    },
    onSuccess: () => {
      setEditingAccountId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/whatsapp/accounts"] });
      toast({
        title: "Configurações salvas",
        description: "As configurações da conta foram atualizadas",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao salvar",
        description: error.message || "Não foi possível salvar as configurações",
        variant: "destructive",
      });
    },
  });

  const updateTemplateMutation = useMutation({
    mutationFn: async ({ templateId, messageTemplate }: { templateId: string; messageTemplate: string }) => {
      return apiRequest("PATCH", `/api/notifications/whatsapp/templates/${templateId}`, {
        messageTemplate,
      });
    },
    onSuccess: () => {
      setEditingTemplateId(null);
      setEditingTemplateMessage("");
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/whatsapp/templates"] });
      toast({
        title: "Template salvo",
        description: "O template de mensagem foi atualizado com sucesso",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao salvar",
        description: error.message || "Não foi possível salvar o template",
        variant: "destructive",
      });
    },
  });

  const startEditingTemplate = (template: WhatsappNotificationTemplate) => {
    setEditingTemplateId(template.id);
    setEditingTemplateMessage(template.messageTemplate);
  };

  const cancelEditingTemplate = () => {
    setEditingTemplateId(null);
    setEditingTemplateMessage("");
  };

  const startEditingAccount = (account: WhatsAppAccount) => {
    setEditingAccountId(account.id);
    setEditHourlyLimit(account.hourlyLimit || 10);
    setEditPriority(account.priority || 0);
  };

  useEffect(() => {
    if (connectionStatus?.status === "connected") {
      setQrPollingEnabled(false);
      setGeneratedPairingCode(null);
      refetchStatus();
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/whatsapp/accounts"] });
      toast({
        title: "WhatsApp conectado!",
        description: "A conexão foi estabelecida com sucesso.",
      });
    }
  }, [connectionStatus?.status, refetchStatus, toast]);

  useEffect(() => {
    if (qrPollingEnabled && connectionStatus?.status === "disconnected") {
      console.log("[whatsapp-ui] Connection failed, stopping poll");
      setQrPollingEnabled(false);
      toast({
        title: "Conexão falhou",
        description: "Tente escanear o QR Code novamente ou reinicie a conexão.",
        variant: "destructive",
      });
    }
  }, [connectionStatus?.status, qrPollingEnabled, toast]);

  useEffect(() => {
    if (connectingAccountStatus?.status === "connected") {
      setConnectingAccountId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/whatsapp/accounts"] });
      toast({
        title: "WhatsApp conectado",
        description: "A conta foi conectada com sucesso",
      });
    }
  }, [connectingAccountStatus?.status, toast]);

  useEffect(() => {
    return () => {
      if (qrPollingRef.current) {
        clearInterval(qrPollingRef.current);
      }
    };
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "connected":
        return <Badge className="bg-green-500"><Wifi className="w-3 h-3 mr-1" /> Conectado</Badge>;
      case "connecting":
      case "qr_ready":
        return <Badge className="bg-yellow-500"><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Aguardando</Badge>;
      case "disconnected":
        return <Badge variant="secondary"><WifiOff className="w-3 h-3 mr-1" /> Desconectado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getNotificationStatusBadge = (status: string, id: string) => {
    switch (status) {
      case "pending":
        return <Badge className="bg-yellow-500" data-testid={`badge-status-pending-${id}`}><Clock className="w-3 h-3 mr-1" /> Pendente</Badge>;
      case "sent":
        return <Badge className="bg-green-500" data-testid={`badge-status-sent-${id}`}><CheckCircle className="w-3 h-3 mr-1" /> Enviado</Badge>;
      case "failed":
        return <Badge variant="destructive" data-testid={`badge-status-failed-${id}`}><XCircle className="w-3 h-3 mr-1" /> Falhou</Badge>;
      case "cancelled":
        return <Badge variant="secondary" data-testid={`badge-status-cancelled-${id}`}><Ban className="w-3 h-3 mr-1" /> Cancelado</Badge>;
      default:
        return <Badge variant="outline" data-testid={`badge-status-${status}-${id}`}>{status}</Badge>;
    }
  };

  const getNotificationTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      credentials: "Credenciais de Acesso",
      payment_confirmed: "Confirmação de Pagamento",
      password_reset: "Redefinição de Senha",
      plan_expired: "Expiração de Plano",
      welcome: "Boas-vindas",
    };
    return labels[type] || type;
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "-";
    try {
      return format(new Date(dateString), "dd/MM/yyyy HH:mm", { locale: ptBR });
    } catch {
      return "-";
    }
  };

  if (loadingStatus || loadingAccounts) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const currentAccount = accounts.find(a => a.id === notificationStatus?.accountId);
  const currentStatus = connectionStatus?.status || notificationStatus?.status || "disconnected";
  const showQrCode = qrPollingEnabled && connectionStatus?.qrCode && currentStatus === "qr_ready";

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Notificações WhatsApp</h1>
        <p className="text-muted-foreground">
          Configure o envio de notificações automáticas via WhatsApp para clientes do SaaS
        </p>
      </div>

      <Tabs defaultValue="configuracoes" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="configuracoes" data-testid="tab-configuracoes">
            <Settings className="w-4 h-4 mr-2" />
            Configurações
          </TabsTrigger>
          <TabsTrigger value="templates" data-testid="tab-templates">
            <FileText className="w-4 h-4 mr-2" />
            Templates de Mensagem
          </TabsTrigger>
        </TabsList>

        <TabsContent value="configuracoes" className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SiWhatsapp className="w-5 h-5 text-green-500" />
            Ativar/Desativar Notificações
          </CardTitle>
          <CardDescription>
            Quando ativado, os clientes receberão notificações via WhatsApp sobre: novos acessos, 
            confirmações de pagamento, redefinição de senha, expiração de plano e boas-vindas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {notificationStatus?.enabled ? (
                <Bell className="w-5 h-5 text-green-500" />
              ) : (
                <BellOff className="w-5 h-5 text-muted-foreground" />
              )}
              <div>
                <Label className="text-base font-medium">
                  Notificações {notificationStatus?.enabled ? "Ativadas" : "Desativadas"}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {notificationStatus?.enabled 
                    ? "Clientes receberão mensagens automáticas" 
                    : "Nenhuma mensagem será enviada"}
                </p>
              </div>
            </div>
            <Switch
              checked={notificationStatus?.enabled || false}
              onCheckedChange={(checked) => toggleMutation.mutate(checked)}
              disabled={toggleMutation.isPending}
              data-testid="switch-notifications-toggle"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="w-5 h-5" />
            Contas WhatsApp para Notificações
          </CardTitle>
          <CardDescription>
            Conecte contas WhatsApp para enviar notificações. O sistema usa rotação entre todas as contas conectadas,
            respeitando o limite de mensagens por hora de cada uma. Configure manualmente o limite e a prioridade de cada conta 
            clicando em "Configurar". Contas com menor valor de prioridade são usadas primeiro.
          </CardDescription>
          {(notificationStatus?.connectedAccounts ?? 0) > 0 && (
            <div className="flex items-center gap-2 mt-2" data-testid="rotation-status">
              <Badge className="bg-primary">
                <RotateCcw className="w-3 h-3 mr-1" />
                Rotação: {notificationStatus?.connectedAccounts} de {notificationStatus?.totalAccounts} conta(s) ativa(s)
              </Badge>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          {!notificationStatus?.configured && accounts.length === 0 ? (
            <div className="text-center py-8 space-y-4">
              <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto" />
              <div>
                <p className="font-medium">Nenhuma conta configurada</p>
                <p className="text-sm text-muted-foreground">
                  Crie uma conta WhatsApp para enviar notificações
                </p>
              </div>
              <Button 
                onClick={() => createAccountMutation.mutate()}
                disabled={createAccountMutation.isPending}
                data-testid="button-create-account"
              >
                {createAccountMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <SiWhatsapp className="w-4 h-4 mr-2" />
                )}
                Criar Conta para Notificações
              </Button>
            </div>
          ) : !notificationStatus?.configured && accounts.length > 0 ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Todas as contas conectadas serão usadas automaticamente em rotação. Conecte via QR Code para ativar:
              </p>
              <div className="grid gap-3">
                {accounts.map((account) => (
                  <div 
                    key={account.id}
                    className="p-4 border rounded-lg space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <SiWhatsapp className="w-5 h-5 text-green-500" />
                        <div>
                          <p className="font-medium">{account.label}</p>
                          <p className="text-sm text-muted-foreground">
                            {account.phoneNumber || "Não conectado"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {account.status === "connected" ? (
                          <>
                            <Badge className="bg-green-500">
                              <Wifi className="w-3 h-3 mr-1" /> Conectado
                            </Badge>
                            <Badge variant="outline" data-testid={`badge-limit-${account.id}`}>
                              <Clock className="w-3 h-3 mr-1" />
                              {account.messagesSentThisHour || 0}/{account.hourlyLimit || 10} msgs/hora
                            </Badge>
                          </>
                        ) : (
                          <Badge variant="secondary">
                            <WifiOff className="w-3 h-3 mr-1" /> Desconectado
                          </Badge>
                        )}
                        <Badge variant="outline" data-testid={`badge-priority-${account.id}`}>
                          Prioridade: {account.priority}
                        </Badge>
                      </div>
                    </div>

                    {editingAccountId === account.id ? (
                      <div className="p-4 border rounded-lg bg-muted/30 space-y-4">
                        <p className="text-sm font-medium">Configurações de Rotação</p>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor={`hourlyLimit-${account.id}`}>Limite por Hora</Label>
                            <Input
                              id={`hourlyLimit-${account.id}`}
                              type="number"
                              min={1}
                              max={100}
                              value={editHourlyLimit}
                              onChange={(e) => setEditHourlyLimit(parseInt(e.target.value) || 10)}
                              data-testid={`input-hourly-limit-${account.id}`}
                            />
                            <p className="text-xs text-muted-foreground">Máximo de mensagens por hora (1-100)</p>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`priority-${account.id}`}>Prioridade</Label>
                            <Input
                              id={`priority-${account.id}`}
                              type="number"
                              min={0}
                              max={10}
                              value={editPriority}
                              onChange={(e) => setEditPriority(parseInt(e.target.value) || 0)}
                              data-testid={`input-priority-${account.id}`}
                            />
                            <p className="text-xs text-muted-foreground">Menor valor = maior prioridade (0-10)</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => updateAccountMutation.mutate({ 
                              accountId: account.id, 
                              hourlyLimit: editHourlyLimit,
                              priority: editPriority 
                            })}
                            disabled={updateAccountMutation.isPending}
                            data-testid={`button-save-settings-${account.id}`}
                          >
                            {updateAccountMutation.isPending ? (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                              <Save className="w-4 h-4 mr-2" />
                            )}
                            Salvar
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingAccountId(null)}
                            data-testid={`button-cancel-edit-${account.id}`}
                          >
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    ) : null}

                    {connectingAccountId === account.id && connectingAccountStatus?.qrCode && connectingAccountStatus?.status === "qr_ready" ? (
                      <div className="space-y-4">
                        <div className="flex flex-col items-center gap-4 p-6 border rounded-lg bg-white dark:bg-gray-900">
                          <QrCode className="w-8 h-8 text-muted-foreground" />
                          <p className="text-center text-sm text-muted-foreground">
                            Escaneie o QR Code com seu WhatsApp para conectar
                          </p>
                          <div className="p-4 bg-white rounded-lg">
                            <img 
                              src={connectingAccountStatus.qrCode} 
                              alt="QR Code WhatsApp" 
                              className="w-64 h-64"
                              data-testid={`img-qr-code-${account.id}`}
                            />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            No WhatsApp, vá em Configurações {'>'} Dispositivos conectados {'>'} Conectar dispositivo
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            onClick={() => refetchConnectingAccount()}
                            className="flex-1"
                            data-testid={`button-refresh-qr-${account.id}`}
                          >
                            <RefreshCcw className="w-4 h-4 mr-2" />
                            Atualizar QR Code
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => setConnectingAccountId(null)}
                            data-testid={`button-cancel-connection-${account.id}`}
                          >
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2 flex-wrap">
                        {account.status !== "connected" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setConnectingAccountId(account.id);
                              connectMutation.mutate(account.id);
                            }}
                            disabled={connectMutation.isPending || connectingAccountId === account.id}
                            data-testid={`button-connect-${account.id}`}
                          >
                            {connectMutation.isPending && connectingAccountId === account.id ? (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                              <QrCode className="w-4 h-4 mr-2" />
                            )}
                            Gerar QR Code
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => startEditingAccount(account)}
                          data-testid={`button-edit-account-${account.id}`}
                        >
                          <Settings className="w-4 h-4 mr-2" />
                          Configurar
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            if (confirm("Tem certeza que deseja remover esta conta?")) {
                              deleteAccountMutation.mutate(account.id);
                            }
                          }}
                          disabled={deleteAccountMutation.isPending}
                          data-testid={`button-delete-account-${account.id}`}
                        >
                          {deleteAccountMutation.isPending ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4 mr-2" />
                          )}
                          Remover
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <Button 
                variant="outline"
                onClick={() => createAccountMutation.mutate()}
                disabled={createAccountMutation.isPending}
                className="w-full"
                data-testid="button-create-new-account"
              >
                {createAccountMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <SiWhatsapp className="w-4 h-4 mr-2" />
                )}
                Criar Nova Conta
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
                <div className="flex items-center gap-3">
                  <SiWhatsapp className="w-6 h-6 text-green-500" />
                  <div>
                    <p className="font-medium">{currentAccount?.label || "Conta de Notificações"}</p>
                    <p className="text-sm text-muted-foreground">
                      {notificationStatus?.phoneNumber || connectionStatus?.phoneNumber || "Aguardando conexão"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusBadge(currentStatus)}
                </div>
              </div>

              {currentStatus === "connected" ? (
                <div className="flex items-center justify-between p-4 border rounded-lg bg-green-50 dark:bg-green-900/20">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-6 h-6 text-green-500" />
                    <div>
                      <p className="font-medium text-green-700 dark:text-green-400">WhatsApp Conectado</p>
                      <p className="text-sm text-green-600 dark:text-green-500">
                        Pronto para enviar notificações
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => notificationStatus?.accountId && disconnectMutation.mutate(notificationStatus.accountId)}
                    disabled={disconnectMutation.isPending}
                    data-testid="button-disconnect"
                  >
                    {disconnectMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <XCircle className="w-4 h-4 mr-2" />
                    )}
                    Desconectar
                  </Button>
                </div>
              ) : showQrCode ? (
                <div className="space-y-4">
                  <div className="flex flex-col items-center gap-4 p-6 border rounded-lg bg-white dark:bg-gray-900">
                    <QrCode className="w-8 h-8 text-muted-foreground" />
                    <p className="text-center text-sm text-muted-foreground">
                      Escaneie o QR Code com seu WhatsApp para conectar
                    </p>
                    <div className="p-4 bg-white rounded-lg">
                      <img 
                        src={connectionStatus.qrCode} 
                        alt="QR Code WhatsApp" 
                        className="w-64 h-64"
                        data-testid="img-qr-code"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      No WhatsApp, vá em Configurações {'>'}  Dispositivos conectados {'>'} Conectar dispositivo
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => refetchConnection()}
                      className="flex-1"
                      data-testid="button-refresh-qr"
                    >
                      <RefreshCcw className="w-4 h-4 mr-2" />
                      Atualizar QR Code
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => setQrPollingEnabled(false)}
                      data-testid="button-cancel-connection"
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : showPairingCodeInput ? (
                <div className="space-y-4">
                  <div className="flex flex-col items-center gap-4 p-6 border rounded-lg bg-white dark:bg-gray-900">
                    <Smartphone className="w-8 h-8 text-green-500" />
                    <div className="text-center">
                      <p className="font-medium">Conectar com Código de Pareamento</p>
                      <p className="text-sm text-muted-foreground">
                        Digite seu número de telefone com código do país
                      </p>
                    </div>
                    {generatedPairingCode ? (
                      <div className="text-center space-y-3">
                        <p className="text-sm text-muted-foreground">Digite este código no WhatsApp:</p>
                        <div className="bg-green-100 dark:bg-green-900 px-6 py-4 rounded-lg">
                          <p className="text-3xl font-mono font-bold tracking-widest text-green-700 dark:text-green-300" data-testid="text-pairing-code">
                            {generatedPairingCode}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          No WhatsApp: Configurações {'>'} Dispositivos conectados {'>'} Conectar dispositivo {'>'} Conectar com número de telefone
                        </p>
                      </div>
                    ) : (
                      <div className="w-full max-w-xs space-y-3">
                        <Input
                          type="tel"
                          placeholder="5511999999999"
                          value={pairingPhoneNumber}
                          onChange={(e) => setPairingPhoneNumber(e.target.value)}
                          className="text-center text-lg"
                          data-testid="input-pairing-phone"
                        />
                        <p className="text-xs text-muted-foreground text-center">
                          Ex: 5511999999999 (código do país + DDD + número)
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {!generatedPairingCode && (
                      <Button
                        onClick={() => notificationStatus?.accountId && pairingCodeMutation.mutate({ 
                          accountId: notificationStatus.accountId, 
                          phoneNumber: pairingPhoneNumber 
                        })}
                        disabled={pairingCodeMutation.isPending || !pairingPhoneNumber}
                        className="flex-1"
                        data-testid="button-generate-pairing-code"
                      >
                        {pairingCodeMutation.isPending ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Smartphone className="w-4 h-4 mr-2" />
                        )}
                        Gerar Código
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setShowPairingCodeInput(false);
                        setGeneratedPairingCode(null);
                        setQrPollingEnabled(false);
                      }}
                      data-testid="button-cancel-pairing"
                    >
                      Voltar
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4 p-6 border rounded-lg">
                  <WifiOff className="w-12 h-12 text-muted-foreground" />
                  <div className="text-center">
                    <p className="font-medium">WhatsApp Desconectado</p>
                    <p className="text-sm text-muted-foreground">
                      Clique para gerar o QR Code de conexão
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 w-full max-w-xs">
                    <Button
                      onClick={() => notificationStatus?.accountId && connectMutation.mutate(notificationStatus.accountId)}
                      disabled={connectMutation.isPending}
                      className="w-full"
                      data-testid="button-connect-qr"
                    >
                      {connectMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <QrCode className="w-4 h-4 mr-2" />
                      )}
                      Conectar via QR Code
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => notificationStatus?.accountId && resetSessionMutation.mutate(notificationStatus.accountId)}
                      disabled={resetSessionMutation.isPending}
                      className="w-full mt-2 text-muted-foreground"
                      data-testid="button-reset-session"
                    >
                      {resetSessionMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <RotateCcw className="w-4 h-4 mr-2" />
                      )}
                      Problemas? Resetar Sessão
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Fila de Mensagens Pendentes
              </CardTitle>
              <CardDescription>
                Mensagens aguardando envio
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchQueue()}
                disabled={loadingQueue}
                data-testid="button-refresh-queue"
              >
                <RefreshCcw className={`w-4 h-4 mr-2 ${loadingQueue ? "animate-spin" : ""}`} />
                Atualizar
              </Button>
              {notificationQueue.length > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => cancelQueueMutation.mutate()}
                  disabled={cancelQueueMutation.isPending}
                  data-testid="button-cancel-queue"
                >
                  {cancelQueueMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4 mr-2" />
                  )}
                  Cancelar Tudo
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingQueue ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : notificationQueue.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <MessageSquare className="w-10 h-10 mb-2" />
              <p>Nenhuma mensagem pendente</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Destinatário</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Criado em</TableHead>
                    <TableHead className="w-[80px]">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {notificationQueue.map((log) => (
                    <TableRow key={log.id} data-testid={`row-queue-${log.id}`}>
                      <TableCell className="font-medium" data-testid={`cell-queue-type-${log.id}`}>
                        {getNotificationTypeLabel(log.notificationType)}
                      </TableCell>
                      <TableCell data-testid={`cell-queue-name-${log.id}`}>{log.recipientName || "-"}</TableCell>
                      <TableCell data-testid={`cell-queue-phone-${log.id}`}>{log.recipientPhone}</TableCell>
                      <TableCell data-testid={`cell-queue-status-${log.id}`}>{getNotificationStatusBadge(log.status, log.id)}</TableCell>
                      <TableCell data-testid={`cell-queue-date-${log.id}`}>{formatDate(log.createdAt)}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm("Tem certeza que deseja remover esta mensagem da fila?")) {
                              deleteQueueItemMutation.mutate(log.id);
                            }
                          }}
                          disabled={deleteQueueItemMutation.isPending}
                          data-testid={`button-delete-queue-${log.id}`}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <History className="w-5 h-5" />
                Histórico de Mensagens
              </CardTitle>
              <CardDescription>
                Histórico de notificações enviadas (não inclui mensagens pendentes na fila)
              </CardDescription>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchLogs()}
                disabled={loadingLogs}
                data-testid="button-refresh-logs"
              >
                <RefreshCcw className={`w-4 h-4 mr-2 ${loadingLogs ? "animate-spin" : ""}`} />
                Atualizar
              </Button>
              {notificationLogs.length > 0 && (
                <>
                  <Popover open={showDeleteDatePicker} onOpenChange={setShowDeleteDatePicker}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        data-testid="button-delete-by-date"
                      >
                        <CalendarIcon className="w-4 h-4 mr-2" />
                        Excluir por Data
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-4" align="end">
                      <div className="space-y-4">
                        <p className="text-sm font-medium">Selecione o período para excluir:</p>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Data Inicial</Label>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  className="w-full justify-start text-left font-normal"
                                  data-testid="button-start-date"
                                >
                                  <CalendarIcon className="mr-2 h-4 w-4" />
                                  {deleteStartDate ? format(deleteStartDate, "dd/MM/yyyy", { locale: ptBR }) : "Selecionar"}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                  mode="single"
                                  selected={deleteStartDate}
                                  onSelect={setDeleteStartDate}
                                  locale={ptBR}
                                />
                              </PopoverContent>
                            </Popover>
                          </div>
                          <div className="space-y-2">
                            <Label>Data Final</Label>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  className="w-full justify-start text-left font-normal"
                                  data-testid="button-end-date"
                                >
                                  <CalendarIcon className="mr-2 h-4 w-4" />
                                  {deleteEndDate ? format(deleteEndDate, "dd/MM/yyyy", { locale: ptBR }) : "Selecionar"}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                  mode="single"
                                  selected={deleteEndDate}
                                  onSelect={setDeleteEndDate}
                                  locale={ptBR}
                                />
                              </PopoverContent>
                            </Popover>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              if (deleteStartDate && deleteEndDate) {
                                if (confirm(`Tem certeza que deseja excluir todas as mensagens entre ${format(deleteStartDate, "dd/MM/yyyy", { locale: ptBR })} e ${format(deleteEndDate, "dd/MM/yyyy", { locale: ptBR })}?`)) {
                                  deleteLogsMutation.mutate({ startDate: deleteStartDate, endDate: deleteEndDate });
                                }
                              }
                            }}
                            disabled={!deleteStartDate || !deleteEndDate || deleteLogsMutation.isPending}
                            data-testid="button-confirm-delete-by-date"
                          >
                            {deleteLogsMutation.isPending ? (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4 mr-2" />
                            )}
                            Excluir Período
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setDeleteStartDate(undefined);
                              setDeleteEndDate(undefined);
                              setShowDeleteDatePicker(false);
                            }}
                            data-testid="button-cancel-delete-by-date"
                          >
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      if (confirm("Tem certeza que deseja excluir TODO o histórico de mensagens? Esta ação não pode ser desfeita.")) {
                        deleteLogsMutation.mutate({ deleteAll: true });
                      }
                    }}
                    disabled={deleteLogsMutation.isPending}
                    data-testid="button-delete-all-logs"
                  >
                    {deleteLogsMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4 mr-2" />
                    )}
                    Excluir Tudo
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingLogs ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : notificationLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <History className="w-10 h-10 mb-2" />
              <p>Nenhuma mensagem no histórico</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Destinatário</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Enviado em</TableHead>
                    <TableHead>Erro</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {notificationLogs.map((log) => (
                    <TableRow key={log.id} data-testid={`row-log-${log.id}`}>
                      <TableCell className="font-medium" data-testid={`cell-log-type-${log.id}`}>
                        {getNotificationTypeLabel(log.notificationType)}
                      </TableCell>
                      <TableCell data-testid={`cell-log-name-${log.id}`}>{log.recipientName || "-"}</TableCell>
                      <TableCell data-testid={`cell-log-phone-${log.id}`}>{log.recipientPhone}</TableCell>
                      <TableCell data-testid={`cell-log-status-${log.id}`}>{getNotificationStatusBadge(log.status, log.id)}</TableCell>
                      <TableCell data-testid={`cell-log-date-${log.id}`}>{formatDate(log.sentAt)}</TableCell>
                      <TableCell className="max-w-[200px] truncate" title={log.error || ""} data-testid={`cell-log-error-${log.id}`}>
                        {log.error || "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="templates" className="space-y-6" data-testid="tab-content-templates">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Templates de Mensagem
              </CardTitle>
              <CardDescription>
                Personalize os textos das mensagens automáticas enviadas aos clientes. 
                Use os placeholders disponíveis para incluir informações dinâmicas.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingTemplates ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : templatesError ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <AlertCircle className="w-10 h-10 mb-2 text-destructive" />
                  <p>Erro ao carregar templates</p>
                </div>
              ) : templates.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <FileText className="w-10 h-10 mb-2" />
                  <p>Nenhum template encontrado</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {templates.map((template) => (
                    <div 
                      key={template.id}
                      className="p-4 border rounded-lg space-y-3"
                      data-testid={`card-template-${template.id}`}
                    >
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div>
                          <p className="font-medium" data-testid={`text-template-name-${template.id}`}>{template.name}</p>
                          {template.description && (
                            <p className="text-sm text-muted-foreground">{template.description}</p>
                          )}
                        </div>
                        {editingTemplateId !== template.id && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => startEditingTemplate(template)}
                            data-testid={`button-edit-template-${template.id}`}
                          >
                            <Edit3 className="w-4 h-4 mr-2" />
                            Editar
                          </Button>
                        )}
                      </div>

                      {editingTemplateId === template.id ? (
                        <div className="space-y-3">
                          <div className="space-y-2">
                            <Label htmlFor={`template-${template.id}`}>Mensagem</Label>
                            <Textarea
                              id={`template-${template.id}`}
                              value={editingTemplateMessage}
                              onChange={(e) => setEditingTemplateMessage(e.target.value)}
                              rows={6}
                              className="font-mono text-sm"
                              data-testid={`textarea-template-${template.id}`}
                            />
                          </div>
                          <div className="flex flex-wrap gap-1">
                            <span className="text-xs text-muted-foreground mr-1">Placeholders:</span>
                            {(templatePlaceholders[template.notificationType] || []).map((placeholder) => (
                              <Badge 
                                key={placeholder} 
                                variant="outline" 
                                className="text-xs cursor-pointer"
                                onClick={() => setEditingTemplateMessage(prev => prev + " " + placeholder)}
                                data-testid={`badge-placeholder-${template.id}-${placeholder.replace(/[{}]/g, '')}`}
                              >
                                {placeholder}
                              </Badge>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => updateTemplateMutation.mutate({ 
                                templateId: template.id, 
                                messageTemplate: editingTemplateMessage 
                              })}
                              disabled={updateTemplateMutation.isPending}
                              data-testid={`button-save-template-${template.id}`}
                            >
                              {updateTemplateMutation.isPending ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              ) : (
                                <Save className="w-4 h-4 mr-2" />
                              )}
                              Salvar
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={cancelEditingTemplate}
                              data-testid={`button-cancel-template-${template.id}`}
                            >
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="p-3 bg-muted/30 rounded-md">
                          <pre className="whitespace-pre-wrap text-sm font-mono" data-testid={`text-template-message-${template.id}`}>
                            {template.messageTemplate}
                          </pre>
                        </div>
                      )}
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
