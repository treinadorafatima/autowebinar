import { useState, useEffect } from "react";
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
  Unlink
} from "lucide-react";
import { SiMercadopago } from "react-icons/si";

const newLinkSchema = z.object({
  planoId: z.string().min(1, "Selecione um plano"),
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
  id: number;
  name: string;
  email: string;
  cpf: string;
  commissionPercent: number;
  status: string;
  mpUserId?: string | null;
  mpConnectedAt?: string | null;
  mpTokenExpiresAt?: string | null;
}

interface Plano {
  id: number;
  nome: string;
  preco: number;
}

export default function AfiliadoDashboardPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isNewLinkDialogOpen, setIsNewLinkDialogOpen] = useState(false);

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

  const { data: stats, isLoading: isLoadingStats } = useQuery<AffiliateStats>({
    queryKey: ["/api/affiliates", affiliateId, "stats"],
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
    queryKey: ["/api/checkout/planos/ativos"],
  });

  const form = useForm<NewLinkFormData>({
    resolver: zodResolver(newLinkSchema),
    defaultValues: {
      planoId: "",
    },
  });

  const createLinkMutation = useMutation({
    mutationFn: async (data: NewLinkFormData) => {
      const response = await apiRequest("POST", `/api/affiliates/${affiliateId}/links`, {
        planoId: parseInt(data.planoId),
      });
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
              <h1 className="font-semibold" data-testid="text-affiliate-name">
                {isLoadingAffiliate ? <Skeleton className="h-5 w-32" /> : affiliate?.name}
              </h1>
              <p className="text-sm text-muted-foreground" data-testid="text-affiliate-email">
                {isLoadingAffiliate ? <Skeleton className="h-4 w-40" /> : affiliate?.email}
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={handleLogout} data-testid="button-logout">
            <LogOut className="h-4 w-4 mr-2" />
            Sair
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
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
                <div className="text-2xl font-bold" data-testid="stat-clicks">
                  {stats?.totalClicks || 0}
                </div>
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
                <div className="text-2xl font-bold" data-testid="stat-conversions">
                  {stats?.totalConversions || 0}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Vendas Totais</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoadingStats ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="text-2xl font-bold" data-testid="stat-sales">
                  {formatCurrency(stats?.totalSales || 0)}
                </div>
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
          <TabsList>
            <TabsTrigger value="links" data-testid="tab-links">
              <LinkIcon className="h-4 w-4 mr-2" />
              Meus Links
            </TabsTrigger>
            <TabsTrigger value="sales" data-testid="tab-sales">
              <DollarSign className="h-4 w-4 mr-2" />
              Vendas
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
                        Selecione o plano que deseja promover
                      </DialogDescription>
                    </DialogHeader>
                    <Form {...form}>
                      <form onSubmit={form.handleSubmit((data) => createLinkMutation.mutate(data))}>
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
                        <DialogFooter className="mt-6">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setIsNewLinkDialogOpen(false)}
                          >
                            Cancelar
                          </Button>
                          <Button type="submit" disabled={createLinkMutation.isPending} data-testid="button-create-link">
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
                        <TableHead>Plano</TableHead>
                        <TableHead className="text-center">Cliques</TableHead>
                        <TableHead className="text-center">Conversões</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {links.map((link) => (
                        <TableRow key={link.id} data-testid={`row-link-${link.id}`}>
                          <TableCell className="font-mono text-sm">
                            {link.code}
                          </TableCell>
                          <TableCell>{link.planoName || "Geral"}</TableCell>
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
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
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

          <TabsContent value="account">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Wallet className="h-5 w-5" />
                    Mercado Pago
                  </CardTitle>
                  <CardDescription>
                    Conecte sua conta do Mercado Pago para receber suas comissões automaticamente
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoadingAffiliate ? (
                    <Skeleton className="h-20 w-full" />
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-[#009ee3]/10 rounded-full flex items-center justify-center">
                            <SiMercadopago className="h-5 w-5 text-[#009ee3]" />
                          </div>
                          <div>
                            <p className="font-medium">Status da Conexão</p>
                            <div className="flex items-center gap-2">
                              {getMpConnectionStatus().connected ? (
                                getMpConnectionStatus().expired ? (
                                  <Badge variant="destructive">
                                    <XCircle className="h-3 w-3 mr-1" />
                                    Token Expirado
                                  </Badge>
                                ) : (
                                  <Badge variant="default" className="bg-green-500">
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                    Conectado
                                  </Badge>
                                )
                              ) : (
                                <Badge variant="secondary">
                                  <Clock className="h-3 w-3 mr-1" />
                                  Não Conectado
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {getMpConnectionStatus().connected && affiliate?.mpConnectedAt && (
                        <p className="text-sm text-muted-foreground">
                          Conectado desde: {formatDate(affiliate.mpConnectedAt)}
                        </p>
                      )}

                      <div className="flex gap-2">
                        {!getMpConnectionStatus().connected || getMpConnectionStatus().expired ? (
                          <Button
                            onClick={handleConnectMercadoPago}
                            className="bg-[#009ee3] hover:bg-[#007bb5]"
                            data-testid="button-connect-mp"
                          >
                            <SiMercadopago className="h-4 w-4 mr-2" />
                            Conectar Mercado Pago
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
                    </div>
                  )}
                </CardContent>
              </Card>

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
                    <div className="space-y-3">
                      <div className="flex justify-between border-b pb-2">
                        <span className="text-muted-foreground">Nome</span>
                        <span className="font-medium">{affiliate?.name}</span>
                      </div>
                      <div className="flex justify-between border-b pb-2">
                        <span className="text-muted-foreground">Email</span>
                        <span className="font-medium">{affiliate?.email}</span>
                      </div>
                      <div className="flex justify-between border-b pb-2">
                        <span className="text-muted-foreground">Comissão</span>
                        <span className="font-medium">{affiliate?.commissionPercent || 0}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Status</span>
                        <Badge variant={affiliate?.status === 'active' ? "default" : "secondary"}>
                          {affiliate?.status === 'active' ? "Ativo" : "Pendente"}
                        </Badge>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
