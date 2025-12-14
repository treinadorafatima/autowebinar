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
  History, Trash2, MessageSquare, Ban
} from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

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
}

interface WhatsAppAccount {
  id: string;
  adminId: string;
  label: string;
  phoneNumber: string | null;
  status: string;
}

interface WhatsAppConnectionStatus {
  status: "disconnected" | "connecting" | "connected" | "qr_ready";
  phoneNumber?: string;
  qrCode?: string;
  qrExpired?: boolean;
}

export default function AdminWhatsAppNotificationsPage() {
  const { toast } = useToast();
  const [qrPollingEnabled, setQrPollingEnabled] = useState(false);
  const [connectingAccountId, setConnectingAccountId] = useState<string | null>(null);
  const qrPollingRef = useRef<NodeJS.Timeout | null>(null);

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

  const setAccountMutation = useMutation({
    mutationFn: async (accountId: string) => {
      return apiRequest("POST", "/api/notifications/whatsapp/account", { accountId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/whatsapp/status"] });
      toast({
        title: "Conta configurada",
        description: "Conta WhatsApp selecionada para notificações",
      });
      setQrPollingEnabled(true);
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Não foi possível configurar a conta",
        variant: "destructive",
      });
    },
  });

  const connectMutation = useMutation({
    mutationFn: async (accountId: string) => {
      return apiRequest("POST", `/api/whatsapp/connect/${accountId}`);
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

  const disconnectMutation = useMutation({
    mutationFn: async (accountId: string) => {
      return apiRequest("POST", `/api/whatsapp/disconnect/${accountId}`);
    },
    onSuccess: () => {
      setQrPollingEnabled(false);
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

  const createAccountMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/whatsapp/accounts", {
        label: "Notificações do Sistema",
        dailyLimit: 500,
        priority: 1,
        provider: "baileys",
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/whatsapp/accounts"] });
      if (data?.id) {
        setAccountMutation.mutate(data.id);
      }
      toast({
        title: "Conta criada",
        description: "Nova conta WhatsApp criada para notificações",
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

  useEffect(() => {
    if (connectionStatus?.status === "connected") {
      setQrPollingEnabled(false);
      refetchStatus();
    }
  }, [connectionStatus?.status, refetchStatus]);

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
            Conecte contas WhatsApp para enviar notificações. O sistema usa rotação automática entre todas as contas conectadas,
            respeitando o limite de mensagens por hora de cada uma. Quando uma conta atinge o limite, a próxima é usada automaticamente.
          </CardDescription>
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
                      <div className="flex items-center gap-2">
                        {account.status === "connected" ? (
                          <Badge className="bg-green-500">
                            <Wifi className="w-3 h-3 mr-1" /> Conectado
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            <WifiOff className="w-3 h-3 mr-1" /> Desconectado
                          </Badge>
                        )}
                      </div>
                    </div>

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
              ) : (
                <div className="flex flex-col items-center gap-4 p-6 border rounded-lg">
                  <WifiOff className="w-12 h-12 text-muted-foreground" />
                  <div className="text-center">
                    <p className="font-medium">WhatsApp Desconectado</p>
                    <p className="text-sm text-muted-foreground">
                      Conecte para começar a enviar notificações
                    </p>
                  </div>
                  <Button
                    onClick={() => notificationStatus?.accountId && connectMutation.mutate(notificationStatus.accountId)}
                    disabled={connectMutation.isPending}
                    data-testid="button-connect"
                  >
                    {connectMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <QrCode className="w-4 h-4 mr-2" />
                    )}
                    Conectar via QR Code
                  </Button>
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
                Histórico de notificações enviadas
              </CardDescription>
            </div>
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
    </div>
  );
}
