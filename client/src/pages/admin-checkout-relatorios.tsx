import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Loader2, DollarSign, ShoppingCart, TrendingUp, CreditCard, Eye, Check, Clock, X, Users, Filter, User, Mail, Phone, FileText, RefreshCw, Trash2, ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toZonedTime } from "date-fns-tz";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface Stats {
  totalVendas: number;
  receitaTotal: number;
  ticketMedio: number;
  taxaConversao: number;
  vendasUnicas: number;
  receitaUnicas: number;
  vendasRenovacao: number;
  receitaRenovacao: number;
  assinaturasAtivas: number;
}

interface VendaPorPlano {
  planoId: string;
  planoNome: string;
  quantidade: number;
  valor: number;
}

interface VendaPorMetodo {
  metodo: string;
  quantidade: number;
  valor: number;
}

interface VendaPorAfiliado {
  afiliadoId: string;
  afiliadoNome: string;
  afiliadoEmail: string;
  quantidade: number;
  valorVendas: number;
  valorComissao: number;
  vendasUnicas: number;
  valorUnicas: number;
  vendasRenovacao: number;
  valorRenovacao: number;
}

interface Pagamento {
  id: string;
  email: string;
  nome: string;
  cpf: string | null;
  telefone: string | null;
  planoId: string;
  valor: number;
  status: string;
  statusDetail: string | null;
  metodoPagamento: string | null;
  mercadopagoPaymentId: string | null;
  stripePaymentIntentId: string | null;
  dataPagamento: string | null;
  dataAprovacao: string | null;
  dataExpiracao: string | null;
  adminId: string | null;
  criadoEm: string;
}

interface Plano {
  id: string;
  nome: string;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: any }> = {
  checkout_iniciado: { label: "Iniciado", variant: "outline", icon: Clock },
  pending: { label: "Pendente", variant: "secondary", icon: Clock },
  in_process: { label: "Processando", variant: "secondary", icon: Clock },
  approved: { label: "Aprovado", variant: "default", icon: Check },
  rejected: { label: "Rejeitado", variant: "destructive", icon: X },
  cancelled: { label: "Cancelado", variant: "destructive", icon: X },
  refunded: { label: "Reembolsado", variant: "destructive", icon: X },
  expired: { label: "Expirado", variant: "outline", icon: Clock },
  abandoned: { label: "Abandonado", variant: "outline", icon: X },
  auto_renewal: { label: "Renovação Auto", variant: "secondary", icon: Clock },
};

type StatusFilter = "all" | "approved" | "pending" | "rejected" | "expired" | "abandoned" | "auto_renewal";

const ITEMS_PER_PAGE = 10;
const BRAZIL_TIMEZONE = "America/Sao_Paulo";

// Helper para formatar datas no horário de Brasília
function formatBrazilDate(dateStr: string, formatStr: string = "dd/MM/yyyy HH:mm"): string {
  const date = new Date(dateStr);
  const zonedDate = toZonedTime(date, BRAZIL_TIMEZONE);
  return format(zonedDate, formatStr, { locale: ptBR });
}

export default function AdminCheckoutRelatorios() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedPagamento, setSelectedPagamento] = useState<Pagamento | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [dataInicio, setDataInicio] = useState<string>("");
  const [dataFim, setDataFim] = useState<string>("");

  const { data: stats, isLoading: loadingStats } = useQuery<Stats>({
    queryKey: ["/api/checkout/relatorios/stats"],
  });

  const { data: vendasPorPlano, isLoading: loadingPlano } = useQuery<VendaPorPlano[]>({
    queryKey: ["/api/checkout/relatorios/vendas-por-plano"],
  });

  const { data: vendasPorMetodo, isLoading: loadingMetodo } = useQuery<VendaPorMetodo[]>({
    queryKey: ["/api/checkout/relatorios/vendas-por-metodo"],
  });

  const { data: vendasPorAfiliado, isLoading: loadingAfiliado } = useQuery<VendaPorAfiliado[]>({
    queryKey: ["/api/checkout/relatorios/vendas-por-afiliado"],
  });

  const { data: pagamentos, isLoading: loadingPagamentos } = useQuery<Pagamento[]>({
    queryKey: ["/api/checkout/pagamentos"],
  });

  const { data: planos } = useQuery<Plano[]>({
    queryKey: ["/api/checkout/planos"],
  });

  const filteredPagamentos = useMemo(() => {
    if (!pagamentos) return [];
    
    let filtered = pagamentos;
    
    // Filtro por status
    switch (statusFilter) {
      case "approved":
        filtered = filtered.filter(p => p.status === "approved");
        break;
      case "pending":
        filtered = filtered.filter(p => ["pending", "in_process"].includes(p.status));
        break;
      case "rejected":
        filtered = filtered.filter(p => ["rejected", "cancelled", "refunded"].includes(p.status));
        break;
      case "expired":
        filtered = filtered.filter(p => p.status === "expired");
        break;
      case "abandoned":
        filtered = filtered.filter(p => ["abandoned", "checkout_iniciado"].includes(p.status));
        break;
      case "auto_renewal":
        filtered = filtered.filter(p => p.statusDetail?.includes("Auto-renewal") || p.statusDetail?.includes("Renovação"));
        break;
    }
    
    // Filtro por data início
    if (dataInicio) {
      const inicio = new Date(dataInicio);
      inicio.setHours(0, 0, 0, 0);
      filtered = filtered.filter(p => new Date(p.criadoEm) >= inicio);
    }
    
    // Filtro por data fim
    if (dataFim) {
      const fim = new Date(dataFim);
      fim.setHours(23, 59, 59, 999);
      filtered = filtered.filter(p => new Date(p.criadoEm) <= fim);
    }
    
    return filtered;
  }, [pagamentos, statusFilter, dataInicio, dataFim]);

  // Paginação
  const totalPages = Math.ceil(filteredPagamentos.length / ITEMS_PER_PAGE);
  const paginatedPagamentos = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredPagamentos.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredPagamentos, currentPage]);

  // Reset página quando filtros mudam
  const handleFilterChange = (value: StatusFilter) => {
    setStatusFilter(value);
    setCurrentPage(1);
  };

  const handleDataInicioChange = (value: string) => {
    setDataInicio(value);
    setCurrentPage(1);
  };

  const handleDataFimChange = (value: string) => {
    setDataFim(value);
    setCurrentPage(1);
  };

  const clearDateFilters = () => {
    setDataInicio("");
    setDataFim("");
    setCurrentPage(1);
  };

  const getUserPaymentAttempts = useMemo(() => {
    if (!selectedPagamento || !pagamentos) return [];
    
    return pagamentos
      .filter(p => p.email.toLowerCase() === selectedPagamento.email.toLowerCase())
      .sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime());
  }, [selectedPagamento, pagamentos]);

  const handleOpenDetails = (pagamento: Pagamento) => {
    setSelectedPagamento(pagamento);
    setIsDetailsOpen(true);
  };

  const handleCloseDetails = () => {
    setIsDetailsOpen(false);
    setSelectedPagamento(null);
  };

  const liberarMutation = useMutation({
    mutationFn: async (pagamentoId: string) => {
      const res = await apiRequest("POST", `/api/checkout/pagamentos/${pagamentoId}/liberar`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/checkout/pagamentos"] });
      queryClient.invalidateQueries({ queryKey: ["/api/checkout/relatorios/stats"] });
      toast({ title: "Acesso liberado com sucesso!" });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao liberar acesso",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const recuperarMutation = useMutation({
    mutationFn: async (pagamentoId: string) => {
      const res = await apiRequest("POST", `/api/checkout/pagamentos/${pagamentoId}/recuperar`);
      return res.json();
    },
    onSuccess: (data: { emailSent?: boolean; whatsappSent?: boolean }) => {
      const messages = [];
      if (data.emailSent) messages.push("Email");
      if (data.whatsappSent) messages.push("WhatsApp");
      toast({ 
        title: "Recuperação enviada!", 
        description: messages.length > 0 
          ? `Notificação enviada via: ${messages.join(", ")}` 
          : "Tentativa de recuperação processada"
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao enviar recuperação",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resyncMutation = useMutation({
    mutationFn: async (pagamentoId: string) => {
      const res = await apiRequest("POST", `/api/checkout/pagamentos/${pagamentoId}/resync-mp`);
      return res.json();
    },
    onSuccess: (data: { message?: string; newStatus?: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/checkout/pagamentos"] });
      queryClient.invalidateQueries({ queryKey: ["/api/checkout/relatorios/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/checkout/relatorios/vendas-por-plano"] });
      queryClient.invalidateQueries({ queryKey: ["/api/checkout/relatorios/vendas-por-metodo"] });
      queryClient.invalidateQueries({ queryKey: ["/api/checkout/relatorios/vendas-por-afiliado"] });
      toast({ 
        title: "Sincronizado com Mercado Pago!", 
        description: data.message || `Novo status: ${data.newStatus}`
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao sincronizar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deletarHistoricoMutation = useMutation({
    mutationFn: async (params: { dataInicio?: string; dataFim?: string; status?: string }) => {
      const res = await apiRequest("DELETE", `/api/checkout/pagamentos/historico`, params);
      return res.json();
    },
    onSuccess: (data: { deletados: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/checkout/pagamentos"] });
      queryClient.invalidateQueries({ queryKey: ["/api/checkout/relatorios/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/checkout/relatorios/vendas-por-plano"] });
      queryClient.invalidateQueries({ queryKey: ["/api/checkout/relatorios/vendas-por-metodo"] });
      queryClient.invalidateQueries({ queryKey: ["/api/checkout/relatorios/vendas-por-afiliado"] });
      toast({ 
        title: "Histórico deletado!", 
        description: `${data.deletados} registros removidos`
      });
      setCurrentPage(1);
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao deletar histórico",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleDeletarHistorico = () => {
    const hasFilters = dataInicio || dataFim || statusFilter !== "all";
    const msg = hasFilters 
      ? `Deletar ${filteredPagamentos.length} registros com os filtros atuais? (Esta ação não pode ser desfeita)`
      : "Deletar TODO o histórico de pagamentos? (Esta ação não pode ser desfeita)";
    
    if (confirm(msg)) {
      deletarHistoricoMutation.mutate({
        dataInicio: dataInicio || undefined,
        dataFim: dataFim || undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
      });
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value / 100);
  };

  const getPlanoNome = (planoId: string) => {
    return planos?.find((p) => p.id === planoId)?.nome || "Desconhecido";
  };

  const getStatusInfo = (status: string) => {
    return statusConfig[status] || { label: status, variant: "outline" as const, icon: Clock };
  };

  const isLoading = loadingStats || loadingPlano || loadingMetodo || loadingAfiliado || loadingPagamentos;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 px-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" data-testid="text-page-title">
          Relatórios de Vendas
        </h1>
        <p className="text-muted-foreground">
          Acompanhe o desempenho das vendas e gerencie pagamentos.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 pb-2">
            <CardTitle className="text-sm font-medium">Total de Vendas</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-vendas">
              {stats?.totalVendas || 0}
            </div>
            <p className="text-xs text-muted-foreground">pagamentos aprovados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 pb-2">
            <CardTitle className="text-sm font-medium">Receita Total</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-receita-total">
              {formatCurrency(stats?.receitaTotal || 0)}
            </div>
            <p className="text-xs text-muted-foreground">em vendas aprovadas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 pb-2">
            <CardTitle className="text-sm font-medium">Ticket Médio</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-ticket-medio">
              {formatCurrency(stats?.ticketMedio || 0)}
            </div>
            <p className="text-xs text-muted-foreground">por venda</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Conversão</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-taxa-conversao">
              {(stats?.taxaConversao || 0).toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">checkout → aprovado</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 pb-2">
            <CardTitle className="text-sm font-medium">Vendas Únicas</CardTitle>
            <ShoppingCart className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600" data-testid="text-vendas-unicas">
              {stats?.vendasUnicas || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(stats?.receitaUnicas || 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 pb-2">
            <CardTitle className="text-sm font-medium">Renovações</CardTitle>
            <RefreshCw className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600" data-testid="text-vendas-renovacao">
              {stats?.vendasRenovacao || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(stats?.receitaRenovacao || 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 pb-2">
            <CardTitle className="text-sm font-medium">Assinaturas Ativas</CardTitle>
            <Users className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600" data-testid="text-assinaturas-ativas">
              {stats?.assinaturasAtivas || 0}
            </div>
            <p className="text-xs text-muted-foreground">recorrências ativas</p>
          </CardContent>
        </Card>

        <Card className="bg-muted/30">
          <CardHeader className="flex flex-row items-center justify-between gap-1 pb-2">
            <CardTitle className="text-sm font-medium">Receita Recorrente</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600" data-testid="text-receita-recorrente">
              {formatCurrency(stats?.receitaRenovacao || 0)}
            </div>
            <p className="text-xs text-muted-foreground">de renovações</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>Vendas por Plano</CardTitle>
            <CardDescription>Distribuição de vendas por tipo de plano</CardDescription>
          </CardHeader>
          <CardContent>
            {vendasPorPlano?.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">
                Nenhuma venda registrada
              </p>
            ) : (
              <div className="space-y-4">
                {vendasPorPlano?.map((venda) => (
                  <div key={venda.planoId} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{venda.planoNome}</p>
                      <p className="text-sm text-muted-foreground">{venda.quantidade} vendas</p>
                    </div>
                    <p className="font-bold">{formatCurrency(venda.valor)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Vendas por Método</CardTitle>
            <CardDescription>Distribuição por forma de pagamento</CardDescription>
          </CardHeader>
          <CardContent>
            {vendasPorMetodo?.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">
                Nenhuma venda registrada
              </p>
            ) : (
              <div className="space-y-4">
                {vendasPorMetodo?.map((venda) => (
                  <div key={venda.metodo} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4" />
                      <div>
                        <p className="font-medium capitalize">{venda.metodo.replace(/_/g, " ")}</p>
                        <p className="text-sm text-muted-foreground">{venda.quantidade} vendas</p>
                      </div>
                    </div>
                    <p className="font-bold">{formatCurrency(venda.valor)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {vendasPorAfiliado && vendasPorAfiliado.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Vendas por Afiliado</CardTitle>
            <CardDescription>Performance individual de cada afiliado (vendas únicas e recorrentes)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {vendasPorAfiliado.map((afiliado) => (
                <div key={afiliado.afiliadoId} className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                        <User className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{afiliado.afiliadoNome}</p>
                        <p className="text-sm text-muted-foreground">{afiliado.afiliadoEmail}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Comissão Total</p>
                      <p className="font-bold text-green-600">{formatCurrency(afiliado.valorComissao)}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 pt-3 border-t">
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground mb-1">Vendas Únicas</p>
                      <p className="font-semibold">{afiliado.vendasUnicas}</p>
                      <p className="text-xs text-muted-foreground">{formatCurrency(afiliado.valorUnicas)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground mb-1">Renovações</p>
                      <p className="font-semibold">{afiliado.vendasRenovacao}</p>
                      <p className="text-xs text-muted-foreground">{formatCurrency(afiliado.valorRenovacao)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground mb-1">Total</p>
                      <p className="font-semibold">{afiliado.quantidade}</p>
                      <p className="text-xs text-muted-foreground">{formatCurrency(afiliado.valorVendas)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle>Histórico de Pagamentos</CardTitle>
                <CardDescription>
                  {filteredPagamentos.length} pagamentos encontrados
                  {(dataInicio || dataFim || statusFilter !== "all") && " (filtrados)"}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <Select
                  value={statusFilter}
                  onValueChange={handleFilterChange}
                >
                  <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
                    <SelectValue placeholder="Filtrar por status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" data-testid="filter-all">Todos</SelectItem>
                    <SelectItem value="approved" data-testid="filter-approved">Aprovados</SelectItem>
                    <SelectItem value="pending" data-testid="filter-pending">Pendentes</SelectItem>
                    <SelectItem value="rejected" data-testid="filter-rejected">Rejeitados/Cancelados</SelectItem>
                    <SelectItem value="expired" data-testid="filter-expired">Expirados</SelectItem>
                    <SelectItem value="abandoned" data-testid="filter-abandoned">Abandonados</SelectItem>
                    <SelectItem value="auto_renewal" data-testid="filter-auto-renewal">Renovações Auto</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDeletarHistorico}
                  disabled={deletarHistoricoMutation.isPending || filteredPagamentos.length === 0}
                  data-testid="button-deletar-historico"
                >
                  {deletarHistoricoMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-1" />
                  ) : (
                    <Trash2 className="w-4 h-4 mr-1" />
                  )}
                  Deletar
                </Button>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4 p-3 border rounded-lg bg-muted/30">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Filtrar por data:</span>
              </div>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-1">
                <div className="flex items-center gap-2">
                  <Label htmlFor="data-inicio" className="text-sm text-muted-foreground whitespace-nowrap">De:</Label>
                  <Input
                    id="data-inicio"
                    type="date"
                    value={dataInicio}
                    onChange={(e) => handleDataInicioChange(e.target.value)}
                    className="w-[160px]"
                    data-testid="input-data-inicio"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="data-fim" className="text-sm text-muted-foreground whitespace-nowrap">Até:</Label>
                  <Input
                    id="data-fim"
                    type="date"
                    value={dataFim}
                    onChange={(e) => handleDataFimChange(e.target.value)}
                    className="w-[160px]"
                    data-testid="input-data-fim"
                  />
                </div>
                {(dataInicio || dataFim) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearDateFilters}
                    data-testid="button-limpar-datas"
                  >
                    <X className="w-4 h-4 mr-1" />
                    Limpar
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedPagamentos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    {statusFilter === "all" && !dataInicio && !dataFim
                      ? "Nenhum pagamento registrado" 
                      : "Nenhum pagamento encontrado com este filtro"}
                  </TableCell>
                </TableRow>
              ) : (
                paginatedPagamentos.map((pagamento) => {
                  const statusInfo = getStatusInfo(pagamento.status);
                  const StatusIcon = statusInfo.icon;
                  return (
                    <TableRow key={pagamento.id} data-testid={`row-pagamento-${pagamento.id}`}>
                      <TableCell>
                        {formatBrazilDate(pagamento.criadoEm)}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{pagamento.nome}</p>
                          <p className="text-sm text-muted-foreground">{pagamento.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>{getPlanoNome(pagamento.planoId)}</TableCell>
                      <TableCell>{formatCurrency(pagamento.valor)}</TableCell>
                      <TableCell>
                        <Badge variant={statusInfo.variant} className="flex items-center gap-1 w-fit">
                          <StatusIcon className="w-3 h-3" />
                          {statusInfo.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenDetails(pagamento)}
                            data-testid={`button-detalhes-${pagamento.id}`}
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            Detalhes
                          </Button>
                          {["pending", "expired", "abandoned", "checkout_iniciado"].includes(pagamento.status) && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                if (confirm("Enviar email e WhatsApp de recuperação para este cliente?")) {
                                  recuperarMutation.mutate(pagamento.id);
                                }
                              }}
                              disabled={recuperarMutation.isPending}
                              data-testid={`button-recuperar-${pagamento.id}`}
                            >
                              {recuperarMutation.isPending ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Mail className="w-4 h-4 mr-1" />
                              )}
                              Recuperar
                            </Button>
                          )}
                          {pagamento.status !== "approved" && !pagamento.adminId && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                if (confirm("Tem certeza que deseja liberar o acesso manualmente?")) {
                                  liberarMutation.mutate(pagamento.id);
                                }
                              }}
                              disabled={liberarMutation.isPending}
                              data-testid={`button-liberar-${pagamento.id}`}
                            >
                              {liberarMutation.isPending ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Check className="w-4 h-4 mr-1" />
                              )}
                              Liberar
                            </Button>
                          )}
                          {pagamento.mercadopagoPaymentId && pagamento.status !== "approved" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                if (confirm("Consultar o status real deste pagamento no Mercado Pago?")) {
                                  resyncMutation.mutate(pagamento.id);
                                }
                              }}
                              disabled={resyncMutation.isPending}
                              data-testid={`button-resync-${pagamento.id}`}
                            >
                              {resyncMutation.isPending ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <RefreshCw className="w-4 h-4 mr-1" />
                              )}
                              Sincronizar MP
                            </Button>
                          )}
                          {pagamento.adminId && (
                            <Badge variant="outline" className="text-green-600">
                              Acesso Liberado
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-sm text-muted-foreground">
                Mostrando {((currentPage - 1) * ITEMS_PER_PAGE) + 1} a {Math.min(currentPage * ITEMS_PER_PAGE, filteredPagamentos.length)} de {filteredPagamentos.length}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  data-testid="button-pagina-anterior"
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Anterior
                </Button>
                <span className="text-sm px-2">
                  Página {currentPage} de {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  data-testid="button-pagina-proxima"
                >
                  Próxima
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDetailsOpen} onOpenChange={(open) => {
        setIsDetailsOpen(open);
        if (!open) setSelectedPagamento(null);
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              Detalhes do Cliente
            </DialogTitle>
            <DialogDescription>
              Informações do cliente e histórico de tentativas de pagamento
            </DialogDescription>
          </DialogHeader>
          
          {selectedPagamento && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-lg bg-muted/50">
                <div className="flex items-start gap-3">
                  <User className="w-4 h-4 mt-1 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Nome</p>
                    <p className="font-medium" data-testid="text-user-name">{selectedPagamento.nome}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Mail className="w-4 h-4 mt-1 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="font-medium" data-testid="text-user-email">{selectedPagamento.email}</p>
                  </div>
                </div>
                {selectedPagamento.cpf && (
                  <div className="flex items-start gap-3">
                    <FileText className="w-4 h-4 mt-1 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">CPF</p>
                      <p className="font-medium" data-testid="text-user-cpf">{selectedPagamento.cpf}</p>
                    </div>
                  </div>
                )}
                {selectedPagamento.telefone && (
                  <div className="flex items-start gap-3">
                    <Phone className="w-4 h-4 mt-1 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Telefone</p>
                      <p className="font-medium" data-testid="text-user-phone">{selectedPagamento.telefone}</p>
                    </div>
                  </div>
                )}
              </div>

              <Separator />

              <div>
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <CreditCard className="w-4 h-4" />
                  Histórico de Tentativas ({getUserPaymentAttempts.length})
                </h4>
                <ScrollArea className="h-[300px] pr-4">
                  <div className="space-y-3">
                    {getUserPaymentAttempts.map((attempt) => {
                      const statusInfo = getStatusInfo(attempt.status);
                      const StatusIcon = statusInfo.icon;
                      return (
                        <div 
                          key={attempt.id} 
                          className="p-4 border rounded-lg space-y-2"
                          data-testid={`row-attempt-${attempt.id}`}
                        >
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                              <Badge variant={statusInfo.variant} className="flex items-center gap-1">
                                <StatusIcon className="w-3 h-3" />
                                {statusInfo.label}
                              </Badge>
                              {attempt.adminId && (
                                <Badge variant="outline" className="text-green-600 text-xs">
                                  Liberado Manualmente
                                </Badge>
                              )}
                            </div>
                            <span className="text-sm text-muted-foreground">
                              {formatBrazilDate(attempt.criadoEm, "dd/MM/yyyy 'às' HH:mm:ss")}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                            <div>
                              <span className="text-muted-foreground">Plano:</span>{" "}
                              <span className="font-medium">{getPlanoNome(attempt.planoId)}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Valor:</span>{" "}
                              <span className="font-medium">{formatCurrency(attempt.valor)}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Método:</span>{" "}
                              <span className="font-medium capitalize">
                                {attempt.metodoPagamento?.replace(/_/g, " ") || "N/A"}
                              </span>
                            </div>
                            {attempt.dataAprovacao && (
                              <div>
                                <span className="text-muted-foreground">Aprovado em:</span>{" "}
                                <span className="font-medium">
                                  {formatBrazilDate(attempt.dataAprovacao, "dd/MM/yyyy HH:mm")}
                                </span>
                              </div>
                            )}
                          </div>
                          {attempt.statusDetail && (
                            <p className="text-xs text-muted-foreground">
                              Detalhe: {attempt.statusDetail}
                            </p>
                          )}
                          {(attempt.mercadopagoPaymentId || attempt.stripePaymentIntentId) && (
                            <p className="text-xs text-muted-foreground font-mono">
                              ID: {attempt.mercadopagoPaymentId || attempt.stripePaymentIntentId}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
