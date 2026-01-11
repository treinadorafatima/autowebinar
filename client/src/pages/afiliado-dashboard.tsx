import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { 
  DollarSign, 
  Link as LinkIcon, 
  MousePointerClick, 
  TrendingUp,
  Copy,
  ExternalLink,
  Plus,
  LogOut,
  User,
  Loader2,
  CheckCircle,
  Clock,
  XCircle,
  BarChart3,
  Settings,
  Wallet,
  Unlink,
  Users,
  Trash2,
  Calendar
} from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { SiMercadopago } from "react-icons/si";

const newLinkSchema = z.object({
  linkType: z.string().min(1, "Selecione o tipo de link"),
  planoId: z.string().optional(),
  targetUrl: z.string().optional(),
});

type NewLinkFormData = z.infer<typeof newLinkSchema>;

interface AffiliateStats {
  totalClicks: number;
  totalConversions: number;
  totalSales: number;
  totalCommission: number;
  pendingCommission: number;
  paidCommission: number;
}

interface AffiliateLink {
  id: number;
  code: string;
  planoId: number | null;
  targetUrl: string;
  clicks: number;
  conversions: number;
  isActive: boolean;
  createdAt: string;
  planoName?: string;
}

interface AffiliateSale {
  id: number;
  saleAmount: number;
  commissionAmount: number;
  commissionPercent: number;
  status: string;
  createdAt: string;
  linkCode?: string;
}

interface Affiliate {
  id: string;
  adminId: string;
  name: string;
  email: string;
  whatsapp?: string | null;
  commissionPercent: number;
  status: string;
  mpUserId?: string | null;
  mpConnectedAt?: string | null;
  mpTokenExpiresAt?: string | null;
  metaPixelId?: string | null;
  metaAccessToken?: string | null;
  pixKey?: string | null;
  pixKeyType?: string | null;
  totalEarnings?: number;
  pendingAmount?: number;
  availableAmount?: number;
  paidAmount?: number;
}

interface AffiliateWithdrawal {
  id: string;
  affiliateId: string;
  amount: number;
  pixKey: string;
  pixKeyType: string;
  status: string;
  requestedAt: string;
  processedAt?: string | null;
  paidAt?: string | null;
  transactionId?: string | null;
  notes?: string | null;
}

interface Plano {
  id: number;
  nome: string;
  preco: number;
}

interface AffiliateLead {
  id: string;
  name: string;
  email: string | null;
  whatsapp: string | null;
  city: string | null;
  state: string | null;
  status: string;
  source: string;
  capturedAt: string;
  affiliateLinkCode: string | null;
}

export default function AfiliadoDashboardPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isNewLinkDialogOpen, setIsNewLinkDialogOpen] = useState(false);
  const [linkToDelete, setLinkToDelete] = useState<AffiliateLink | null>(null);
  const [metaPixelInput, setMetaPixelInput] = useState("");
  const [metaAccessTokenInput, setMetaAccessTokenInput] = useState("");
  const [dateRange, setDateRange] = useState("all");
  const [pixKeyInput, setPixKeyInput] = useState("");
  const [pixKeyTypeInput, setPixKeyTypeInput] = useState("");
  const [withdrawalAmount, setWithdrawalAmount] = useState("");
  const [isWithdrawalDialogOpen, setIsWithdrawalDialogOpen] = useState(false);

  const affiliateId = localStorage.getItem("affiliateId");
  const affiliateToken = localStorage.getItem("affiliateToken");

  useEffect(() => {
    if (!affiliateToken || !affiliateId) {
      setLocation("/afiliado/login");
    }
  }, [affiliateToken, affiliateId, setLocation]);

  const { data: affiliate, isLoading: isLoadingAffiliate } = useQuery<Affiliate>({
    queryKey: ["/api/affiliate/me"],
    enabled: !!affiliateToken,
  });

  // Memoize date range to prevent query key changes on every render
  const dateRangeParams = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    switch (dateRange) {
      case "today": {
        const endOfDay = new Date(today);
        endOfDay.setHours(23, 59, 59, 999);
        return { startDate: today.toISOString(), endDate: endOfDay.toISOString() };
      }
      case "7days": {
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const endOfDay = new Date(today);
        endOfDay.setHours(23, 59, 59, 999);
        return { startDate: sevenDaysAgo.toISOString(), endDate: endOfDay.toISOString() };
      }
      case "30days": {
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const endOfDay = new Date(today);
        endOfDay.setHours(23, 59, 59, 999);
        return { startDate: thirtyDaysAgo.toISOString(), endDate: endOfDay.toISOString() };
      }
      case "thisMonth": {
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfDay = new Date(today);
        endOfDay.setHours(23, 59, 59, 999);
        return { startDate: firstDayOfMonth.toISOString(), endDate: endOfDay.toISOString() };
      }
      case "lastMonth": {
        const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        return { startDate: firstDayLastMonth.toISOString(), endDate: lastDayLastMonth.toISOString() };
      }
      case "all":
      default:
        return { startDate: null, endDate: null };
    }
  }, [dateRange]);
  
  const { data: stats, isLoading: isLoadingStats } = useQuery<AffiliateStats>({
    queryKey: ["/api/affiliates", affiliateId, "stats", dateRange],
    queryFn: async () => {
      const token = localStorage.getItem("affiliateToken");
      let url = `/api/affiliates/${affiliateId}/stats`;
      const params = new URLSearchParams();
      if (dateRangeParams.startDate) params.set("startDate", dateRangeParams.startDate);
      if (dateRangeParams.endDate) params.set("endDate", dateRangeParams.endDate);
      if (params.toString()) url += `?${params.toString()}`;
      
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Erro ao carregar estatísticas");
      return res.json();
    },
    enabled: !!affiliateId,
  });

  const { data: links, isLoading: isLoadingLinks } = useQuery<AffiliateLink[]>({
    queryKey: ["/api/affiliates", affiliateId, "links"],
    enabled: !!affiliateId,
  });

  const { data: sales, isLoading: isLoadingSales } = useQuery<AffiliateSale[]>({
    queryKey: ["/api/affiliates", affiliateId, "sales"],
    enabled: !!affiliateId,
  });

  const { data: planos } = useQuery<Plano[]>({
    queryKey: ["/api/checkout/planos/ativos", "afiliados"],
    queryFn: async () => {
      const res = await fetch("/api/checkout/planos/ativos?afiliados=true");
      if (!res.ok) throw new Error("Erro ao carregar planos");
      return res.json();
    },
  });

  const { data: affiliateLeads, isLoading: isLoadingLeads } = useQuery<AffiliateLead[]>({
    queryKey: ["/api/affiliates", affiliateId, "leads"],
    enabled: !!affiliateId,
  });

  const form = useForm<NewLinkFormData>({
    resolver: zodResolver(newLinkSchema),
    defaultValues: {
      linkType: "",
      planoId: "",
      targetUrl: "",
    },
  });

  const watchedLinkType = form.watch("linkType");

  const createLinkMutation = useMutation({
    mutationFn: async (data: NewLinkFormData) => {
      const payload: { planoId?: string; targetUrl?: string; linkType: string } = {
        linkType: data.linkType,
      };
      
      if (data.linkType === "plano" && data.planoId) {
        payload.planoId = data.planoId;
      } else if (data.linkType === "homepage") {
        payload.targetUrl = "/";
      } else if (data.linkType === "trial") {
        payload.targetUrl = "/teste-gratis";
      }
      
      const response = await apiRequest("POST", `/api/affiliates/${affiliateId}/links`, payload);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Link criado!",
        description: "Seu novo link de afiliado foi criado com sucesso.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/affiliates", affiliateId, "links"] });
      setIsNewLinkDialogOpen(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao criar link",
        description: error.message || "Não foi possível criar o link.",
        variant: "destructive",
      });
    },
  });

  const deleteLinkMutation = useMutation({
    mutationFn: async (linkId: number) => {
      const response = await apiRequest("DELETE", `/api/affiliate-links/${linkId}`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Link excluído!",
        description: "O link foi removido com sucesso.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/affiliates", affiliateId, "links"] });
      setLinkToDelete(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao excluir link",
        description: error.message || "Não foi possível excluir o link.",
        variant: "destructive",
      });
      setLinkToDelete(null);
    },
  });

  const disconnectMpMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/affiliates/oauth/disconnect`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Desconectado!",
        description: "Sua conta do Mercado Pago foi desconectada.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/affiliate/me"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao desconectar",
        description: error.message || "Não foi possível desconectar.",
        variant: "destructive",
      });
    },
  });

  const updateMetaPixelMutation = useMutation({
    mutationFn: async (metaPixelId: string) => {
      const response = await apiRequest("PATCH", `/api/affiliate/me`, { metaPixelId });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Meta Pixel salvo!",
        description: "Seu ID do Meta Pixel foi atualizado.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/affiliate/me"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao salvar",
        description: error.message || "Não foi possível salvar o Meta Pixel.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (affiliate?.metaPixelId) {
      setMetaPixelInput(affiliate.metaPixelId);
    }
    if (affiliate?.metaAccessToken) {
      setMetaAccessTokenInput(affiliate.metaAccessToken);
    }
    if (affiliate?.pixKey) {
      setPixKeyInput(affiliate.pixKey);
    }
    if (affiliate?.pixKeyType) {
      setPixKeyTypeInput(affiliate.pixKeyType);
    }
  }, [affiliate?.metaPixelId, affiliate?.metaAccessToken, affiliate?.pixKey, affiliate?.pixKeyType]);

  const { data: withdrawals } = useQuery<AffiliateWithdrawal[]>({
    queryKey: ["/api/affiliate/me/withdrawals"],
    enabled: !!affiliateToken,
  });

  const updatePixKeyMutation = useMutation({
    mutationFn: async (data: { pixKey: string; pixKeyType: string }) => {
      const response = await apiRequest("PATCH", `/api/affiliate/me/pix`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Chave PIX salva!",
        description: "Sua chave PIX foi atualizada com sucesso.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/affiliate/me"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao salvar",
        description: error.message || "Não foi possível salvar a chave PIX.",
        variant: "destructive",
      });
    },
  });

  const requestWithdrawalMutation = useMutation({
    mutationFn: async (amount: number) => {
      const response = await apiRequest("POST", `/api/affiliate/me/withdrawals`, { amount });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Saque solicitado!",
        description: "Sua solicitação de saque foi enviada. Aguarde o processamento.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/affiliate/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/affiliate/me/withdrawals"] });
      setIsWithdrawalDialogOpen(false);
      setWithdrawalAmount("");
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao solicitar saque",
        description: error.message || "Não foi possível solicitar o saque.",
        variant: "destructive",
      });
    },
  });

  const updateMetaAccessTokenMutation = useMutation({
    mutationFn: async (metaAccessToken: string) => {
      const response = await apiRequest("PATCH", `/api/affiliate/me`, { metaAccessToken });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Access Token salvo!",
        description: "Seu token de API de Conversões foi atualizado.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/affiliate/me"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao salvar",
        description: error.message || "Não foi possível salvar o Access Token.",
        variant: "destructive",
      });
    },
  });

  const handleConnectMercadoPago = () => {
    const token = localStorage.getItem("affiliateToken");
    if (!token) {
      toast({
        title: "Erro",
        description: "Sessão expirada. Faça login novamente.",
        variant: "destructive",
      });
      setLocation("/afiliado/login");
      return;
    }
    window.location.href = `/api/affiliates/oauth/authorize?token=${encodeURIComponent(token)}`;
  };

  const handleLogout = () => {
    localStorage.removeItem("affiliateToken");
    localStorage.removeItem("affiliateId");
    setLocation("/afiliado/login");
  };

  const getMpConnectionStatus = () => {
    if (!affiliate?.mpUserId || !affiliate?.mpConnectedAt) {
      return { connected: false, label: "Não conectado", expired: false };
    }
    if (affiliate?.mpTokenExpiresAt) {
      const expiresAt = new Date(affiliate.mpTokenExpiresAt);
      if (expiresAt < new Date()) {
        return { connected: true, label: "Expirado", expired: true };
      }
    }
    return { connected: true, label: "Conectado", expired: false };
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Link copiado!",
      description: "O link foi copiado para a área de transferência.",
    });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value / 100);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return <Badge variant="default" className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" />Pago</Badge>;
      case "pending":
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pendente</Badge>;
      case "cancelled":
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Cancelado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getLinkUrl = (code: string) => {
    return `${window.location.origin}/r/${code}`;
  };

  if (!affiliateToken || !affiliateId) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="font-semibold" data-testid="text-affiliate-name">
                {isLoadingAffiliate ? <Skeleton className="h-5 w-32" /> : affiliate?.name}
              </div>
              <div className="text-sm text-muted-foreground" data-testid="text-affiliate-email">
                {isLoadingAffiliate ? <Skeleton className="h-4 w-40" /> : affiliate?.email}
              </div>
            </div>
          </div>
          <Button variant="outline" onClick={handleLogout} data-testid="button-logout">
            <LogOut className="h-4 w-4 mr-2" />
            Sair
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Estatísticas</h2>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[180px]" data-testid="select-date-range">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todo período</SelectItem>
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="7days">Últimos 7 dias</SelectItem>
                <SelectItem value="30days">Últimos 30 dias</SelectItem>
                <SelectItem value="thisMonth">Este mês</SelectItem>
                <SelectItem value="lastMonth">Mês passado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Cliques</CardTitle>
              <MousePointerClick className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoadingStats ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="text-2xl font-bold" data-testid="stat-clicks">
                    {stats?.totalClicks || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">Total acumulado</p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Conversões</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoadingStats ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="text-2xl font-bold" data-testid="stat-conversions">
                    {stats?.totalConversions || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">Total acumulado</p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Vendas</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoadingStats ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <>
                  <div className="text-2xl font-bold" data-testid="stat-sales">
                    {formatCurrency(stats?.totalSales || 0)}
                  </div>
                  {dateRange !== "all" && (
                    <p className="text-xs text-muted-foreground">No período selecionado</p>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Comissões</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoadingStats ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <>
                  <div className="text-2xl font-bold text-green-600" data-testid="stat-commission">
                    {formatCurrency(stats?.totalCommission || 0)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Pendente: {formatCurrency(stats?.pendingCommission || 0)}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="links" className="space-y-4">
          <TabsList className="flex-wrap">
            <TabsTrigger value="links" data-testid="tab-links">
              <LinkIcon className="h-4 w-4 mr-2" />
              Meus Links
            </TabsTrigger>
            <TabsTrigger value="sales" data-testid="tab-sales">
              <DollarSign className="h-4 w-4 mr-2" />
              Vendas
            </TabsTrigger>
            <TabsTrigger value="leads" data-testid="tab-leads">
              <Users className="h-4 w-4 mr-2" />
              Leads
            </TabsTrigger>
            <TabsTrigger value="saque" data-testid="tab-saque">
              <Wallet className="h-4 w-4 mr-2" />
              Saque
            </TabsTrigger>
            <TabsTrigger value="tracking" data-testid="tab-tracking">
              <BarChart3 className="h-4 w-4 mr-2" />
              Rastrear Vendas
            </TabsTrigger>
            <TabsTrigger value="account" data-testid="tab-account">
              <Settings className="h-4 w-4 mr-2" />
              Conta
            </TabsTrigger>
          </TabsList>

          <TabsContent value="links">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <div>
                  <CardTitle>Links de Afiliado</CardTitle>
                  <CardDescription>
                    Gerencie seus links de divulgação e acompanhe os cliques
                  </CardDescription>
                </div>
                <Dialog open={isNewLinkDialogOpen} onOpenChange={setIsNewLinkDialogOpen}>
                  <DialogTrigger asChild>
                    <Button data-testid="button-new-link">
                      <Plus className="h-4 w-4 mr-2" />
                      Novo Link
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Criar Novo Link</DialogTitle>
                      <DialogDescription>
                        Escolha o tipo de link que deseja criar
                      </DialogDescription>
                    </DialogHeader>
                    <Form {...form}>
                      <form onSubmit={form.handleSubmit((data) => createLinkMutation.mutate(data))} className="space-y-4">
                        <FormField
                          control={form.control}
                          name="linkType"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Tipo de Link</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger data-testid="select-link-type">
                                    <SelectValue placeholder="Selecione o tipo de link" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="homepage">Homepage (Página Inicial)</SelectItem>
                                  <SelectItem value="trial">Teste Gratuito</SelectItem>
                                  <SelectItem value="plano">Plano Específico</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        {watchedLinkType === "plano" && (
                          <FormField
                            control={form.control}
                            name="planoId"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Plano</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                  <FormControl>
                                    <SelectTrigger data-testid="select-plano">
                                      <SelectValue placeholder="Selecione um plano" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {planos?.map((plano) => (
                                      <SelectItem key={plano.id} value={plano.id.toString()}>
                                        {plano.nome} - {formatCurrency(plano.preco)}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        )}
                        
                        <DialogFooter className="mt-6">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setIsNewLinkDialogOpen(false)}
                          >
                            Cancelar
                          </Button>
                          <Button type="submit" disabled={createLinkMutation.isPending || !watchedLinkType} data-testid="button-create-link">
                            {createLinkMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              "Criar Link"
                            )}
                          </Button>
                        </DialogFooter>
                      </form>
                    </Form>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                {isLoadingLinks ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : links && links.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Link</TableHead>
                        <TableHead>Destino</TableHead>
                        <TableHead className="text-center">Cliques</TableHead>
                        <TableHead className="text-center">Conversões</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {links.map((link) => {
                        const getLinkDestination = () => {
                          if (link.planoId && link.planoName) {
                            return `Plano: ${link.planoName}`;
                          }
                          if (link.targetUrl === "/" || link.targetUrl === "") {
                            return "Homepage";
                          }
                          if (link.targetUrl === "/teste-gratis") {
                            return "Teste Gratuito";
                          }
                          if (link.targetUrl) {
                            return link.targetUrl;
                          }
                          return "Geral";
                        };
                        
                        return (
                        <TableRow key={link.id} data-testid={`row-link-${link.id}`}>
                          <TableCell className="font-mono text-sm">
                            {link.code}
                          </TableCell>
                          <TableCell>{getLinkDestination()}</TableCell>
                          <TableCell className="text-center">{link.clicks}</TableCell>
                          <TableCell className="text-center">{link.conversions}</TableCell>
                          <TableCell>
                            <Badge variant={link.isActive ? "default" : "secondary"}>
                              {link.isActive ? "Ativo" : "Inativo"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => copyToClipboard(getLinkUrl(link.code))}
                                data-testid={`button-copy-${link.id}`}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => window.open(getLinkUrl(link.code), "_blank")}
                                data-testid={`button-open-${link.id}`}
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setLinkToDelete(link)}
                                data-testid={`button-delete-${link.id}`}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <LinkIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Você ainda não tem links de afiliado.</p>
                    <p className="text-sm">Clique em "Novo Link" para criar seu primeiro link.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sales">
            <Card>
              <CardHeader>
                <CardTitle>Histórico de Vendas</CardTitle>
                <CardDescription>
                  Acompanhe suas vendas e comissões
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingSales ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : sales && sales.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Valor da Venda</TableHead>
                        <TableHead>Comissão (%)</TableHead>
                        <TableHead>Valor Comissão</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sales.map((sale) => (
                        <TableRow key={sale.id} data-testid={`row-sale-${sale.id}`}>
                          <TableCell>{formatDate(sale.createdAt)}</TableCell>
                          <TableCell>{formatCurrency(sale.saleAmount)}</TableCell>
                          <TableCell>{sale.commissionPercent}%</TableCell>
                          <TableCell className="font-medium text-green-600">
                            {formatCurrency(sale.commissionAmount)}
                          </TableCell>
                          <TableCell>{getStatusBadge(sale.status)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Nenhuma venda registrada ainda.</p>
                    <p className="text-sm">Compartilhe seus links e comece a ganhar comissões!</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="leads">
            <Card>
              <CardHeader>
                <CardTitle>Leads Capturados</CardTitle>
                <CardDescription>
                  Pessoas que acessaram através dos seus links de afiliado
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingLeads ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : affiliateLeads && affiliateLeads.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Nome</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>WhatsApp</TableHead>
                        <TableHead>Cidade/Estado</TableHead>
                        <TableHead>Link</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {affiliateLeads.map((lead) => (
                        <TableRow key={lead.id} data-testid={`row-lead-${lead.id}`}>
                          <TableCell>{formatDate(lead.capturedAt)}</TableCell>
                          <TableCell className="font-medium">{lead.name}</TableCell>
                          <TableCell className="text-muted-foreground">{lead.email || "-"}</TableCell>
                          <TableCell className="text-muted-foreground">{lead.whatsapp || "-"}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {lead.city && lead.state ? `${lead.city}, ${lead.state}` : lead.city || lead.state || "-"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="font-mono text-xs">
                              {lead.affiliateLinkCode || "-"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Nenhum lead capturado ainda.</p>
                    <p className="text-sm">Compartilhe seus links para começar a capturar leads!</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="saque">
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                    <CardTitle className="text-sm font-medium">Disponível para Saque</CardTitle>
                    <Wallet className="h-4 w-4 text-green-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600" data-testid="text-available-balance">
                      {formatCurrency(affiliate?.availableAmount || 0)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Pronto para solicitar saque</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                    <CardTitle className="text-sm font-medium">Aguardando Liberação</CardTitle>
                    <Clock className="h-4 w-4 text-yellow-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-yellow-600" data-testid="text-pending-balance">
                      {formatCurrency(affiliate?.pendingAmount || 0)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Liberado após período de garantia</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                    <CardTitle className="text-sm font-medium">Saques Pendentes</CardTitle>
                    <Loader2 className="h-4 w-4 text-blue-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-blue-600" data-testid="text-requested-balance">
                      {formatCurrency(withdrawals?.filter(w => w.status === 'pending').reduce((sum, w) => sum + w.amount, 0) || 0)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Aguardando processamento</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                    <CardTitle className="text-sm font-medium">Total Sacado</CardTitle>
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold" data-testid="text-paid-balance">
                      {formatCurrency(affiliate?.paidAmount || 0)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Valor total já recebido</p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Wallet className="h-5 w-5" />
                    Solicitar Saque via PIX
                  </CardTitle>
                  <CardDescription>
                    Configure sua chave PIX e solicite saques manuais do seu saldo disponível
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoadingAffiliate ? (
                    <Skeleton className="h-20 w-full" />
                  ) : (
                    <div className="space-y-6">
                      <div className="p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                        <div className="flex items-start gap-3">
                          <DollarSign className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="font-medium text-blue-900 dark:text-blue-100 mb-2">
                              Como funciona o saque manual?
                            </p>
                            <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                              <li>1. Cadastre sua chave PIX abaixo</li>
                              <li>2. Quando tiver saldo disponível, clique em "Solicitar Saque"</li>
                              <li>3. Sua solicitação será analisada pelo administrador</li>
                              <li>4. Após aprovação, o valor será enviado para sua conta PIX</li>
                            </ul>
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-4">
                          <div>
                            <p className="font-medium mb-2">Tipo de Chave PIX</p>
                            <Select value={pixKeyTypeInput} onValueChange={setPixKeyTypeInput}>
                              <SelectTrigger data-testid="select-pix-key-type">
                                <SelectValue placeholder="Selecione o tipo" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="cpf">CPF</SelectItem>
                                <SelectItem value="cnpj">CNPJ</SelectItem>
                                <SelectItem value="email">E-mail</SelectItem>
                                <SelectItem value="phone">Telefone</SelectItem>
                                <SelectItem value="random">Chave Aleatória</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <p className="font-medium mb-2">Chave PIX</p>
                            <div className="flex gap-2">
                              <Input
                                placeholder="Digite sua chave PIX"
                                value={pixKeyInput}
                                onChange={(e) => setPixKeyInput(e.target.value)}
                                data-testid="input-pix-key"
                              />
                              <Button
                                onClick={() => {
                                  if (!pixKeyInput || !pixKeyTypeInput) {
                                    toast({
                                      title: "Preencha todos os campos",
                                      description: "Informe o tipo e a chave PIX.",
                                      variant: "destructive",
                                    });
                                    return;
                                  }
                                  updatePixKeyMutation.mutate({ pixKey: pixKeyInput, pixKeyType: pixKeyTypeInput });
                                }}
                                disabled={updatePixKeyMutation.isPending}
                                data-testid="button-save-pix"
                              >
                                {updatePixKeyMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  "Salvar"
                                )}
                              </Button>
                            </div>
                            {affiliate?.pixKey && (
                              <div className="flex items-center gap-2 text-sm mt-2">
                                <CheckCircle className="h-4 w-4 text-green-500" />
                                <span className="text-muted-foreground">
                                  Chave salva: <span className="font-mono">{affiliate.pixKey}</span> ({affiliate.pixKeyType})
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="p-4 border rounded-lg">
                          <p className="font-medium mb-4">Solicitar Saque</p>
                          {(affiliate?.availableAmount || 0) > 0 ? (
                            <div className="space-y-4">
                              <div>
                                <p className="text-sm text-muted-foreground mb-2">Valor disponível:</p>
                                <p className="text-2xl font-bold text-green-600">{formatCurrency(affiliate?.availableAmount || 0)}</p>
                              </div>
                              <Button
                                onClick={() => setIsWithdrawalDialogOpen(true)}
                                disabled={!affiliate?.pixKey}
                                data-testid="button-request-withdrawal"
                              >
                                <Wallet className="h-4 w-4 mr-2" />
                                Solicitar Saque
                              </Button>
                              {!affiliate?.pixKey && (
                                <p className="text-xs text-muted-foreground">
                                  Cadastre sua chave PIX primeiro para solicitar saques.
                                </p>
                              )}
                            </div>
                          ) : (
                            <div className="text-center py-4">
                              <Wallet className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-50" />
                              <p className="text-muted-foreground">Sem saldo disponível para saque</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                Continue divulgando seus links para ganhar comissões!
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    Histórico de Saques
                  </CardTitle>
                  <CardDescription>
                    Acompanhe todas as suas solicitações de saque
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {withdrawals && withdrawals.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data</TableHead>
                          <TableHead>Valor</TableHead>
                          <TableHead>Chave PIX</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Pago em</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {withdrawals.map((withdrawal) => (
                          <TableRow key={withdrawal.id} data-testid={`row-withdrawal-${withdrawal.id}`}>
                            <TableCell className="text-muted-foreground">
                              {formatDate(withdrawal.requestedAt)}
                            </TableCell>
                            <TableCell className="font-medium">
                              {formatCurrency(withdrawal.amount)}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {withdrawal.pixKey}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  withdrawal.status === 'paid' ? 'default' :
                                  withdrawal.status === 'pending' ? 'secondary' :
                                  withdrawal.status === 'rejected' ? 'destructive' :
                                  'outline'
                                }
                                className={withdrawal.status === 'paid' ? 'bg-green-500' : ''}
                              >
                                {withdrawal.status === 'pending' && 'Pendente'}
                                {withdrawal.status === 'approved' && 'Aprovado'}
                                {withdrawal.status === 'paid' && 'Pago'}
                                {withdrawal.status === 'rejected' && 'Rejeitado'}
                                {withdrawal.status === 'cancelled' && 'Cancelado'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {withdrawal.paidAt ? formatDate(withdrawal.paidAt) : '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>Nenhuma solicitação de saque ainda.</p>
                      <p className="text-sm">Quando você solicitar um saque, ele aparecerá aqui.</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <SiMercadopago className="h-5 w-5 text-[#009ee3]" />
                    Recebimento Automático via Mercado Pago
                  </CardTitle>
                  <CardDescription>
                    Alternativa: conecte sua conta do Mercado Pago para receber comissões automaticamente
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-[#009ee3]/10 rounded-full flex items-center justify-center">
                        <SiMercadopago className="h-5 w-5 text-[#009ee3]" />
                      </div>
                      <div>
                        <p className="font-medium">Status: {getMpConnectionStatus().connected ? (getMpConnectionStatus().expired ? "Expirado" : "Conectado") : "Não conectado"}</p>
                        <p className="text-sm text-muted-foreground">
                          {getMpConnectionStatus().connected && !getMpConnectionStatus().expired 
                            ? "Comissões são transferidas automaticamente"
                            : "Conecte para receber automaticamente"}
                        </p>
                      </div>
                    </div>
                    {!getMpConnectionStatus().connected || getMpConnectionStatus().expired ? (
                      <Button
                        onClick={handleConnectMercadoPago}
                        className="bg-[#009ee3] hover:bg-[#007bb5]"
                        data-testid="button-connect-mp"
                      >
                        <SiMercadopago className="h-4 w-4 mr-2" />
                        Conectar
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        onClick={() => disconnectMpMutation.mutate()}
                        disabled={disconnectMpMutation.isPending}
                        data-testid="button-disconnect-mp"
                      >
                        {disconnectMpMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Unlink className="h-4 w-4 mr-2" />
                        )}
                        Desconectar
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Dialog open={isWithdrawalDialogOpen} onOpenChange={setIsWithdrawalDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Solicitar Saque</DialogTitle>
                  <DialogDescription>
                    Informe o valor que deseja sacar. O valor será enviado para sua chave PIX cadastrada.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Saldo disponível:</p>
                    <p className="text-xl font-bold text-green-600">{formatCurrency(affiliate?.availableAmount || 0)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Chave PIX:</p>
                    <p className="font-mono">{affiliate?.pixKey} ({affiliate?.pixKeyType})</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-2">Valor do saque (R$):</p>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0,00"
                      value={withdrawalAmount}
                      onChange={(e) => setWithdrawalAmount(e.target.value)}
                      data-testid="input-withdrawal-amount"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsWithdrawalDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    onClick={() => {
                      const amountInCents = Math.round(parseFloat(withdrawalAmount) * 100);
                      if (isNaN(amountInCents) || amountInCents <= 0) {
                        toast({
                          title: "Valor inválido",
                          description: "Informe um valor válido para saque.",
                          variant: "destructive",
                        });
                        return;
                      }
                      if (amountInCents > (affiliate?.availableAmount || 0)) {
                        toast({
                          title: "Saldo insuficiente",
                          description: "O valor solicitado é maior que o saldo disponível.",
                          variant: "destructive",
                        });
                        return;
                      }
                      requestWithdrawalMutation.mutate(amountInCents);
                    }}
                    disabled={requestWithdrawalMutation.isPending}
                    data-testid="button-confirm-withdrawal"
                  >
                    {requestWithdrawalMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Wallet className="h-4 w-4 mr-2" />
                    )}
                    Confirmar Saque
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>

          <TabsContent value="tracking">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Rastreamento de Vendas (Meta Pixel)
                </CardTitle>
                <CardDescription>
                  Configure seu Meta Pixel para rastrear todas as conversões dos seus links de afiliado e otimizar suas campanhas de anúncios
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div className="p-4 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-lg">
                    <div className="flex items-start gap-3">
                      <BarChart3 className="h-5 w-5 text-purple-600 dark:text-purple-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-purple-900 dark:text-purple-100 mb-2">
                          Por que rastrear suas vendas?
                        </p>
                        <ul className="text-sm text-purple-700 dark:text-purple-300 space-y-1">
                          <li>Saiba quantas pessoas viram sua página (PageView)</li>
                          <li>Acompanhe quem visualizou os produtos (ViewContent)</li>
                          <li>Veja quantos iniciaram o checkout (InitiateCheckout)</li>
                          <li>Rastreie todas as vendas concluídas (Purchase)</li>
                          <li>Otimize seus anúncios do Facebook/Instagram com dados reais</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-4">
                      <div>
                        <p className="font-medium mb-2">ID do Meta Pixel</p>
                        <p className="text-sm text-muted-foreground mb-3">
                          Encontre seu Pixel ID no Gerenciador de Eventos do Meta Ads.
                        </p>
                        <div className="flex gap-2">
                          <Input
                            placeholder="Ex: 123456789012345"
                            value={metaPixelInput}
                            onChange={(e) => setMetaPixelInput(e.target.value)}
                            data-testid="input-meta-pixel"
                          />
                          <Button
                            onClick={() => updateMetaPixelMutation.mutate(metaPixelInput)}
                            disabled={updateMetaPixelMutation.isPending}
                            data-testid="button-save-pixel"
                          >
                            {updateMetaPixelMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              "Salvar"
                            )}
                          </Button>
                        </div>
                        {affiliate?.metaPixelId && (
                          <div className="flex items-center gap-2 text-sm mt-2">
                            <CheckCircle className="h-4 w-4 text-green-500" />
                            <span className="text-muted-foreground">
                              Pixel ativo: <span className="font-mono">{affiliate.metaPixelId}</span>
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <p className="font-medium mb-2">API de Conversões (Opcional)</p>
                        <p className="text-sm text-muted-foreground mb-3">
                          Melhora a precisão do rastreamento com eventos server-side.
                        </p>
                        <div className="flex gap-2">
                          <Input
                            type="password"
                            placeholder="Access Token"
                            value={metaAccessTokenInput}
                            onChange={(e) => setMetaAccessTokenInput(e.target.value)}
                            data-testid="input-meta-access-token"
                          />
                          <Button
                            onClick={() => updateMetaAccessTokenMutation.mutate(metaAccessTokenInput)}
                            disabled={updateMetaAccessTokenMutation.isPending}
                            data-testid="button-save-access-token"
                          >
                            {updateMetaAccessTokenMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              "Salvar"
                            )}
                          </Button>
                        </div>
                        {affiliate?.metaAccessToken && (
                          <div className="flex items-center gap-2 text-sm mt-2">
                            <CheckCircle className="h-4 w-4 text-green-500" />
                            <span className="text-muted-foreground">
                              Access Token configurado
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-muted/50 rounded-lg">
                    <p className="font-medium text-sm mb-2">Como encontrar seu Pixel ID:</p>
                    <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                      <li>Acesse o Gerenciador de Eventos do Meta (business.facebook.com)</li>
                      <li>Vá em "Fontes de dados" e selecione seu Pixel</li>
                      <li>O ID do Pixel é o número de 15-16 dígitos mostrado no topo</li>
                      <li>Copie e cole esse número no campo acima</li>
                    </ol>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="account">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Informações da Conta
                </CardTitle>
                <CardDescription>
                  Seus dados cadastrais como afiliado
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingAffiliate ? (
                  <Skeleton className="h-32 w-full" />
                ) : (
                  <div className="space-y-3 max-w-md">
                    <div className="flex justify-between border-b pb-2">
                      <span className="text-muted-foreground">Nome</span>
                      <span className="font-medium">{affiliate?.name}</span>
                    </div>
                    <div className="flex justify-between border-b pb-2">
                      <span className="text-muted-foreground">Email</span>
                      <span className="font-medium">{affiliate?.email}</span>
                    </div>
                    <div className="flex justify-between border-b pb-2">
                      <span className="text-muted-foreground">WhatsApp</span>
                      <span className="font-medium">{affiliate?.whatsapp || "Não informado"}</span>
                    </div>
                    <div className="flex justify-between border-b pb-2">
                      <span className="text-muted-foreground">Comissão</span>
                      <span className="font-medium">{affiliate?.commissionPercent || 0}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Status</span>
                      <Badge 
                        variant={
                          affiliate?.status === 'active' ? "default" : 
                          affiliate?.status === 'suspended' ? "destructive" : 
                          "secondary"
                        }
                      >
                        {affiliate?.status === 'active' ? "Ativo" : 
                         affiliate?.status === 'suspended' ? "Suspenso" : 
                         affiliate?.status === 'inactive' ? "Inativo" : 
                         "Pendente"}
                      </Badge>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <AlertDialog open={!!linkToDelete} onOpenChange={(open) => !open && setLinkToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Link</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o link <strong className="text-foreground">{linkToDelete?.code}</strong>?
              Esta ação não pode ser desfeita e você perderá o histórico de cliques e conversões deste link.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => linkToDelete && deleteLinkMutation.mutate(linkToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteLinkMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteLinkMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Excluir"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
