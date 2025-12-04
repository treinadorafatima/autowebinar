import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { 
  Loader2, 
  Crown, 
  AlertCircle, 
  CheckCircle, 
  XCircle, 
  Calendar, 
  HardDrive, 
  Video, 
  Users,
  RefreshCw,
  CreditCard,
  Clock,
  AlertTriangle,
  Receipt,
  ArrowUpCircle,
  Bot,
  FileText,
  Mail,
  Mic,
  Send,
  Bell,
  Globe
} from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface SubscriptionInfo {
  admin: {
    id: string;
    name: string;
    email: string;
    webinarLimit: number;
    uploadLimit: number;
    accessExpiresAt: string | null;
    planoId: string | null;
  };
  plano: {
    id: string;
    nome: string;
    descricao: string;
    preco: number;
    prazoDias: number;
    webinarLimit: number;
    uploadLimit: number;
    storageLimit: number;
    tipoCobranca: string;
    frequencia: number;
    frequenciaTipo: string;
  } | null;
  assinatura: {
    id: string;
    status: string;
    gateway: string;
    externalId: string | null;
    proximoPagamento: string | null;
    criadoEm: string;
  } | null;
  consumo: {
    webinarsUsados: number;
    webinarsLimite: number;
    storageUsadoMB: number;
    storageLimiteMB: number;
    uploadsUsados: number;
    uploadsLimite: number;
    visualizacoes?: number;
    leadsCapturados?: number;
  };
  faturas: Array<{
    id: string;
    valor: number;
    status: string;
    metodoPagamento: string | null;
    criadoEm: string;
    dataAprovacao: string | null;
  }>;
  historicoAssinaturas: Array<{
    id: string;
    planoNome: string;
    status: string;
    criadoEm: string;
    atualizadoEm: string;
  }>;
}

interface PlanoDisponivel {
  id: string;
  nome: string;
  preco: number;
  storageLimit: number;
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  return format(new Date(dateStr), "dd/MM/yyyy", { locale: ptBR });
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "-";
  return format(new Date(dateStr), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

function getStatusBadge(status: string) {
  switch (status) {
    case "active":
      return <Badge className="bg-green-500/20 text-green-400 border-green-500/30"><CheckCircle className="w-3 h-3 mr-1" />Ativa</Badge>;
    case "pending":
      return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30"><Clock className="w-3 h-3 mr-1" />Pendente</Badge>;
    case "paused":
      return <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30"><AlertTriangle className="w-3 h-3 mr-1" />Pausada</Badge>;
    case "cancelled":
      return <Badge className="bg-red-500/20 text-red-400 border-red-500/30"><XCircle className="w-3 h-3 mr-1" />Cancelada</Badge>;
    case "approved":
      return <Badge className="bg-green-500/20 text-green-400 border-green-500/30"><CheckCircle className="w-3 h-3 mr-1" />Aprovado</Badge>;
    case "rejected":
      return <Badge className="bg-red-500/20 text-red-400 border-red-500/30"><XCircle className="w-3 h-3 mr-1" />Rejeitado</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export default function AdminSubscription() {
  const { toast } = useToast();
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  const { data: subscription, isLoading, error } = useQuery<SubscriptionInfo>({
    queryKey: ["/api/admin/subscription"],
  });

  const { data: planosDisponiveis } = useQuery<PlanoDisponivel[]>({
    queryKey: ["/api/checkout/planos/ativos"],
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/subscription/cancel");
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao cancelar assinatura");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/subscription"] });
      toast({ title: "Assinatura cancelada com sucesso" });
      setShowCancelDialog(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao cancelar assinatura",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const renewMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/subscription/renew");
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao renovar assinatura");
      }
      return res.json();
    },
    onSuccess: (data) => {
      if (data.checkoutUrl) {
        // Pass user email in URL to pre-fill and lock in checkout
        const userEmail = encodeURIComponent(admin.email);
        const userName = encodeURIComponent(admin.name);
        window.location.href = `${data.checkoutUrl}?email=${userEmail}&nome=${userName}&renovacao=true`;
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/admin/subscription"] });
        toast({ title: "Assinatura renovada com sucesso" });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao renovar assinatura",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !subscription) {
    return (
      <div className="container mx-auto py-6 px-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Erro</AlertTitle>
          <AlertDescription>Não foi possível carregar informações da assinatura.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const { admin, plano, assinatura, consumo, faturas, historicoAssinaturas } = subscription;
  const isExpired = admin.accessExpiresAt && new Date(admin.accessExpiresAt) < new Date();
  const isActive = assinatura?.status === "active";
  const needsRenewal = !isActive || isExpired || assinatura?.status === "paused";

  const webinarPercent = consumo.webinarsLimite > 0 
    ? Math.min((consumo.webinarsUsados / consumo.webinarsLimite) * 100, 100) 
    : 0;
  const storagePercent = consumo.storageLimiteMB > 0 
    ? Math.min((consumo.storageUsadoMB / consumo.storageLimiteMB) * 100, 100) 
    : 0;

  // Check if there are higher tier plans available for upgrade
  const hasUpgradeOption = plano && planosDisponiveis?.some(p => p.preco > plano.preco);
  const upgradePlans = planosDisponiveis?.filter(p => plano && p.preco > plano.preco) || [];

  return (
    <div className="container mx-auto py-6 px-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">
          Minha Assinatura
        </h1>
        <p className="text-muted-foreground">
          Gerencie seu plano, acompanhe seu consumo e veja suas faturas.
        </p>
      </div>

      {isExpired && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Acesso Expirado</AlertTitle>
          <AlertDescription>
            Seu acesso expirou em {formatDate(admin.accessExpiresAt)}. Renove sua assinatura para continuar usando a plataforma.
          </AlertDescription>
        </Alert>
      )}

      {assinatura?.status === "paused" && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Assinatura Pausada</AlertTitle>
          <AlertDescription>
            Houve um problema com sua cobrança. Por favor, renove sua assinatura para continuar usando todos os recursos.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Crown className="w-5 h-5 text-yellow-500" />
                  Plano Atual
                </CardTitle>
                <CardDescription>Informações do seu plano</CardDescription>
              </div>
              {assinatura && getStatusBadge(assinatura.status)}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {admin.planoId === "trial" ? (
              <>
                <div className="text-center py-4 border rounded-lg bg-gradient-to-br from-green-500/10 to-cyan-500/10 border-green-500/30">
                  <Badge className="bg-green-500/20 text-green-400 border-green-500/30 mb-2">
                    Teste Grátis
                  </Badge>
                  <h3 className="text-2xl font-bold">Plano Trial</h3>
                  <p className="text-muted-foreground text-sm">Experimente a plataforma por 7 dias</p>
                  <div className="mt-2">
                    <span className="text-3xl font-bold text-green-500">Grátis</span>
                  </div>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Webinários</span>
                    <span className="font-medium">{admin.webinarLimit} webinar</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Armazenamento</span>
                    <span className="font-medium">{admin.uploadLimit}GB</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Visualizações</span>
                    <span className="text-green-500">Ilimitadas</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Prazo de Acesso</span>
                    <span className="font-medium">7 dias</span>
                  </div>
                </div>

                {/* Automation Features included in Trial */}
                <div className="p-3 rounded-lg bg-gradient-to-r from-blue-500/10 via-green-500/10 to-orange-500/10 border border-blue-500/20" data-testid="section-automation-features-trial">
                  <div className="flex items-center gap-2 mb-2">
                    <Send className="w-4 h-4 text-blue-500" />
                    <span className="text-sm font-medium" data-testid="text-automation-features-trial-title">Automação Completa</span>
                  </div>
                  <div className="grid gap-1.5 text-sm">
                    <div className="flex items-center gap-2" data-testid="text-trial-email-sequence">
                      <Mail className="w-3.5 h-3.5 text-blue-500" />
                      <span className="text-muted-foreground">Sequência de Emails</span>
                    </div>
                    <div className="flex items-center gap-2" data-testid="text-trial-whatsapp">
                      <SiWhatsapp className="w-3.5 h-3.5 text-green-500" />
                      <span className="text-muted-foreground">WhatsApp Marketing</span>
                    </div>
                    <div className="flex items-center gap-2" data-testid="text-trial-reminders">
                      <Bell className="w-3.5 h-3.5 text-orange-500" />
                      <span className="text-muted-foreground">Lembretes automáticos</span>
                    </div>
                    <div className="flex items-center gap-2" data-testid="text-trial-custom-domain">
                      <Globe className="w-3.5 h-3.5 text-cyan-500" />
                      <span className="text-muted-foreground">Domínio customizado</span>
                    </div>
                  </div>
                </div>

                {/* AI Features included in Trial */}
                <div className="p-3 rounded-lg bg-gradient-to-r from-violet-500/10 via-purple-500/10 to-emerald-500/10 border border-violet-500/20" data-testid="section-ai-features-trial">
                  <div className="flex items-center gap-2 mb-2">
                    <Bot className="w-4 h-4 text-violet-500" />
                    <span className="text-sm font-medium" data-testid="text-ai-features-trial-title">Ferramentas IA</span>
                  </div>
                  <div className="grid gap-1.5 text-sm">
                    <div className="flex items-center gap-2" data-testid="text-trial-script-generator">
                      <FileText className="w-3.5 h-3.5 text-violet-500" />
                      <span className="text-muted-foreground">Gerador de Roteiro IA</span>
                    </div>
                    <div className="flex items-center gap-2" data-testid="text-trial-transcription">
                      <Mic className="w-3.5 h-3.5 text-rose-500" />
                      <span className="text-muted-foreground">Transcrição Automática</span>
                    </div>
                  </div>
                </div>

                {admin.accessExpiresAt && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <div className="text-sm">
                      <span className="text-muted-foreground">Teste expira em: </span>
                      <span className="font-medium">{formatDate(admin.accessExpiresAt)}</span>
                    </div>
                  </div>
                )}

                <Alert className="bg-blue-500/10 border-blue-500/30">
                  <AlertCircle className="h-4 w-4 text-blue-400" />
                  <AlertTitle className="text-blue-400">Período de Teste</AlertTitle>
                  <AlertDescription className="text-blue-300/80">
                    Aproveite seu período de teste para conhecer a plataforma. Faça upgrade para um plano pago e desbloqueie mais recursos.
                  </AlertDescription>
                </Alert>

                <Button 
                  className="w-full bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
                  onClick={() => window.location.href = "/checkout"}
                  data-testid="button-upgrade-trial"
                >
                  <ArrowUpCircle className="w-4 h-4 mr-2" />
                  Fazer Upgrade
                </Button>
              </>
            ) : plano ? (
              <>
                <div className="text-center py-4 border rounded-lg bg-muted/30">
                  <h3 className="text-2xl font-bold">{plano.nome}</h3>
                  <p className="text-muted-foreground text-sm">{plano.descricao}</p>
                  <div className="mt-2">
                    <span className="text-3xl font-bold">{formatCurrency(plano.preco)}</span>
                    {plano.tipoCobranca === "recorrente" ? (
                      <span className="text-muted-foreground">/{plano.frequenciaTipo === "months" ? "mês" : plano.frequenciaTipo === "years" ? "ano" : "dia"}</span>
                    ) : (
                      <span className="text-muted-foreground">/único</span>
                    )}
                  </div>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Webinários</span>
                    <span>{plano.webinarLimit >= 999 ? "Ilimitados" : `${plano.webinarLimit} webinários`}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Armazenamento</span>
                    <span>{plano.storageLimit}GB</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Visualizações</span>
                    <span className="text-green-500">Ilimitadas</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Leads capturados</span>
                    <span className="text-green-500">Ilimitados</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Prazo de Acesso</span>
                    <span>{plano.prazoDias} dias</span>
                  </div>
                </div>

                {/* Automation Features included */}
                <div className="p-3 rounded-lg bg-gradient-to-r from-blue-500/10 via-green-500/10 to-orange-500/10 border border-blue-500/20" data-testid="section-automation-features-plan">
                  <div className="flex items-center gap-2 mb-2">
                    <Send className="w-4 h-4 text-blue-500" />
                    <span className="text-sm font-medium" data-testid="text-automation-features-plan-title">Automação Completa</span>
                  </div>
                  <div className="grid gap-1.5 text-sm">
                    <div className="flex items-center gap-2" data-testid="text-plan-email-sequence">
                      <Mail className="w-3.5 h-3.5 text-blue-500" />
                      <span className="text-muted-foreground">Sequência de Emails</span>
                    </div>
                    <div className="flex items-center gap-2" data-testid="text-plan-whatsapp">
                      <SiWhatsapp className="w-3.5 h-3.5 text-green-500" />
                      <span className="text-muted-foreground">WhatsApp Marketing</span>
                    </div>
                    <div className="flex items-center gap-2" data-testid="text-plan-reminders">
                      <Bell className="w-3.5 h-3.5 text-orange-500" />
                      <span className="text-muted-foreground">Lembretes automáticos</span>
                    </div>
                    <div className="flex items-center gap-2" data-testid="text-plan-custom-domain">
                      <Globe className="w-3.5 h-3.5 text-cyan-500" />
                      <span className="text-muted-foreground">Domínio customizado</span>
                    </div>
                  </div>
                </div>

                {/* AI Features included */}
                <div className="p-3 rounded-lg bg-gradient-to-r from-violet-500/10 via-purple-500/10 to-emerald-500/10 border border-violet-500/20" data-testid="section-ai-features-plan">
                  <div className="flex items-center gap-2 mb-2">
                    <Bot className="w-4 h-4 text-violet-500" />
                    <span className="text-sm font-medium" data-testid="text-ai-features-plan-title">Ferramentas IA</span>
                  </div>
                  <div className="grid gap-1.5 text-sm">
                    <div className="flex items-center gap-2" data-testid="text-plan-script-generator">
                      <FileText className="w-3.5 h-3.5 text-violet-500" />
                      <span className="text-muted-foreground">Gerador de Roteiro IA</span>
                    </div>
                    <div className="flex items-center gap-2" data-testid="text-plan-transcription">
                      <Mic className="w-3.5 h-3.5 text-rose-500" />
                      <span className="text-muted-foreground">Transcrição Automática</span>
                    </div>
                  </div>
                </div>

                {admin.accessExpiresAt && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <div className="text-sm">
                      <span className="text-muted-foreground">Acesso válido até: </span>
                      <span className="font-medium">{formatDate(admin.accessExpiresAt)}</span>
                    </div>
                  </div>
                )}

                {assinatura?.proximoPagamento && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                    <CreditCard className="w-4 h-4 text-muted-foreground" />
                    <div className="text-sm">
                      <span className="text-muted-foreground">Próxima cobrança: </span>
                      <span className="font-medium">{formatDate(assinatura.proximoPagamento)}</span>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8">
                <p className="text-muted-foreground">Você não possui um plano ativo.</p>
                <Button className="mt-4" onClick={() => window.location.href = "/checkout"}>
                  Ver Planos Disponíveis
                </Button>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-4">
              {needsRenewal && plano && (
                <Button 
                  onClick={() => renewMutation.mutate()}
                  disabled={renewMutation.isPending}
                  className="flex-1"
                  data-testid="button-renew"
                >
                  {renewMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4 mr-2" />
                  )}
                  Renovar Assinatura
                </Button>
              )}
              {hasUpgradeOption && plano && (
                <Button 
                  variant="default"
                  className="flex-1 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
                  onClick={() => window.location.href = "/checkout"}
                  data-testid="button-upgrade"
                >
                  <ArrowUpCircle className="w-4 h-4 mr-2" />
                  Fazer Upgrade
                </Button>
              )}
              {isActive && plano?.tipoCobranca === "recorrente" && (
                <Button 
                  variant="outline"
                  onClick={() => setShowCancelDialog(true)}
                  data-testid="button-cancel"
                >
                  Cancelar Assinatura
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="w-5 h-5" />
              Consumo Atual
            </CardTitle>
            <CardDescription>Uso de recursos do seu plano</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm">
                <Video className="w-4 h-4 text-purple-500" />
                <span>Webinários</span>
              </div>
              <div className="relative h-6 rounded bg-gray-200 dark:bg-gray-700 overflow-hidden">
                <div 
                  className="absolute inset-y-0 left-0 bg-purple-500 transition-all duration-300 rounded-l"
                  style={{ width: `${consumo.webinarsLimite >= 999 ? 0 : webinarPercent}%` }}
                />
                <div className="absolute inset-0 flex items-center justify-between px-2">
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    {consumo.webinarsUsados} de {consumo.webinarsLimite >= 999 ? "∞" : consumo.webinarsLimite}
                  </span>
                </div>
              </div>
              {webinarPercent >= 90 && consumo.webinarsLimite < 999 && (
                <p className="text-xs text-orange-500">Você está próximo do limite de webinários</p>
              )}
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm">
                <HardDrive className="w-4 h-4 text-purple-500" />
                <span>Armazenamento</span>
              </div>
              <div className="relative h-6 rounded bg-gray-200 dark:bg-gray-700 overflow-hidden">
                <div 
                  className="absolute inset-y-0 left-0 bg-purple-500 transition-all duration-300 rounded-l"
                  style={{ width: `${storagePercent}%` }}
                />
                <div className="absolute inset-0 flex items-center justify-between px-2">
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    {(consumo.storageUsadoMB / 1024).toFixed(2)}GB de {(consumo.storageLimiteMB / 1024).toFixed(0)}GB
                  </span>
                </div>
              </div>
              {storagePercent >= 90 && (
                <p className="text-xs text-orange-500">Você está próximo do limite de armazenamento</p>
              )}
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm">
                <Users className="w-4 h-4 text-purple-500" />
                <span>Visualizações</span>
              </div>
              <div className="relative h-6 rounded bg-gray-200 dark:bg-gray-700 overflow-hidden">
                <div 
                  className="absolute inset-y-0 left-0 bg-purple-500 transition-all duration-300 rounded-l"
                  style={{ width: `${Math.min((consumo.visualizacoes || 0) / 100, 100)}%` }}
                />
                <div className="absolute inset-0 flex items-center justify-between px-2">
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    {consumo.visualizacoes || 0}
                  </span>
                  <span className="text-xs font-medium text-green-600">Ilimitado</span>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm">
                <Users className="w-4 h-4 text-cyan-500" />
                <span>Leads Capturados</span>
              </div>
              <div className="relative h-6 rounded bg-gray-200 dark:bg-gray-700 overflow-hidden">
                <div 
                  className="absolute inset-y-0 left-0 bg-cyan-500 transition-all duration-300 rounded-l"
                  style={{ width: `${Math.min((consumo.leadsCapturados || 0) / 100, 100)}%` }}
                />
                <div className="absolute inset-0 flex items-center justify-between px-2">
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    {consumo.leadsCapturados || 0}
                  </span>
                  <span className="text-xs font-medium text-green-600">Ilimitado</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="w-5 h-5" />
            Histórico de Pagamentos
          </CardTitle>
          <CardDescription>Suas faturas e pagamentos realizados</CardDescription>
        </CardHeader>
        <CardContent>
          {faturas.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Aprovação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {faturas.map((fatura) => (
                  <TableRow key={fatura.id} data-testid={`row-fatura-${fatura.id}`}>
                    <TableCell>{formatDateTime(fatura.criadoEm)}</TableCell>
                    <TableCell className="font-medium">{formatCurrency(fatura.valor)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{fatura.metodoPagamento || "N/A"}</Badge>
                    </TableCell>
                    <TableCell>{getStatusBadge(fatura.status)}</TableCell>
                    <TableCell>{fatura.dataAprovacao ? formatDateTime(fatura.dataAprovacao) : "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Receipt className="w-12 h-12 mx-auto mb-2 opacity-50" />
              Nenhum pagamento registrado
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Histórico de Assinaturas
          </CardTitle>
          <CardDescription>Registro de alterações no seu plano</CardDescription>
        </CardHeader>
        <CardContent>
          {historicoAssinaturas.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plano</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data de Início</TableHead>
                  <TableHead>Última Atualização</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historicoAssinaturas.map((hist) => (
                  <TableRow key={hist.id} data-testid={`row-historico-${hist.id}`}>
                    <TableCell className="font-medium">{hist.planoNome}</TableCell>
                    <TableCell>{getStatusBadge(hist.status)}</TableCell>
                    <TableCell>{formatDateTime(hist.criadoEm)}</TableCell>
                    <TableCell>{formatDateTime(hist.atualizadoEm)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="w-12 h-12 mx-auto mb-2 opacity-50" />
              Nenhum histórico de assinatura
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar Assinatura</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja cancelar sua assinatura? Você perderá acesso aos recursos premium após o término do período atual.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancelDialog(false)}>
              Manter Assinatura
            </Button>
            <Button
              variant="destructive"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
              data-testid="button-confirm-cancel"
            >
              {cancelMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Confirmar Cancelamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
