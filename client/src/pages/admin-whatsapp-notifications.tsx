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
  QrCode, Smartphone, Bell, BellOff, AlertCircle
} from "lucide-react";
import { SiWhatsapp } from "react-icons/si";

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

  useEffect(() => {
    if (connectionStatus?.status === "connected") {
      setQrPollingEnabled(false);
      refetchStatus();
    }
  }, [connectionStatus?.status, refetchStatus]);

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
            Conta WhatsApp para Notificações
          </CardTitle>
          <CardDescription>
            Conecte uma conta WhatsApp que será usada exclusivamente para enviar notificações do sistema.
            Esta conta é separada das contas de marketing dos usuários.
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
                Selecione uma conta existente ou crie uma nova:
              </p>
              <div className="grid gap-3">
                {accounts.map((account) => (
                  <div 
                    key={account.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <SiWhatsapp className="w-5 h-5 text-green-500" />
                      <div>
                        <p className="font-medium">{account.label}</p>
                        <p className="text-sm text-muted-foreground">
                          {account.phoneNumber || "Não conectado"}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => setAccountMutation.mutate(account.id)}
                      disabled={setAccountMutation.isPending}
                      data-testid={`button-select-account-${account.id}`}
                    >
                      Selecionar
                    </Button>
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
          <CardTitle>Tipos de Notificações</CardTitle>
          <CardDescription>
            Mensagens automáticas que serão enviadas aos clientes quando ativado
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3">
            <div className="flex items-center gap-3 p-3 border rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <div>
                <p className="font-medium">Credenciais de Acesso</p>
                <p className="text-sm text-muted-foreground">Enviado quando um novo usuário é criado</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 border rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <div>
                <p className="font-medium">Confirmação de Pagamento</p>
                <p className="text-sm text-muted-foreground">Enviado quando um pagamento é confirmado</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 border rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <div>
                <p className="font-medium">Redefinição de Senha</p>
                <p className="text-sm text-muted-foreground">Enviado quando o usuário solicita nova senha</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 border rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <div>
                <p className="font-medium">Expiração de Plano</p>
                <p className="text-sm text-muted-foreground">Enviado quando o plano do usuário expira</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 border rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <div>
                <p className="font-medium">Boas-vindas</p>
                <p className="text-sm text-muted-foreground">Enviado para novos usuários cadastrados</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
