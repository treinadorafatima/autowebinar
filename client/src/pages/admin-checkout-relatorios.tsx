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
import { Loader2, DollarSign, ShoppingCart, TrendingUp, CreditCard, Eye, Check, Clock, X, Users, Filter, User, Mail, Phone, FileText } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface Stats {
  totalVendas: number;
  receitaTotal: number;
  ticketMedio: number;
  taxaConversao: number;
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
};

type StatusFilter = "all" | "approved" | "pending" | "rejected";

export default function AdminCheckoutRelatorios() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedPagamento, setSelectedPagamento] = useState<Pagamento | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const { data: stats, isLoading: loadingStats } = useQuery<Stats>({
    queryKey: ["/api/checkout/relatorios/stats"],
  });

  const { data: vendasPorPlano, isLoading: loadingPlano } = useQuery<VendaPorPlano[]>({
    queryKey: ["/api/checkout/relatorios/vendas-por-plano"],
  });

  const { data: vendasPorMetodo, isLoading: loadingMetodo } = useQuery<VendaPorMetodo[]>({
    queryKey: ["/api/checkout/relatorios/vendas-por-metodo"],
  });

  const { data: pagamentos, isLoading: loadingPagamentos } = useQuery<Pagamento[]>({
    queryKey: ["/api/checkout/pagamentos"],
  });

  const { data: planos } = useQuery<Plano[]>({
    queryKey: ["/api/checkout/planos"],
  });

  const filteredPagamentos = useMemo(() => {
    if (!pagamentos) return [];
    
    switch (statusFilter) {
      case "approved":
        return pagamentos.filter(p => p.status === "approved");
      case "pending":
        return pagamentos.filter(p => ["pending", "in_process", "checkout_iniciado"].includes(p.status));
      case "rejected":
        return pagamentos.filter(p => ["rejected", "cancelled", "refunded"].includes(p.status));
      default:
        return pagamentos;
    }
  }, [pagamentos, statusFilter]);

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

  const isLoading = loadingStats || loadingPlano || loadingMetodo || loadingPagamentos;

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

      <div className="grid gap-4 md:grid-cols-4 mb-6">
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

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle>Histórico de Pagamentos</CardTitle>
              <CardDescription>Todos os pagamentos registrados no sistema</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <Select
                value={statusFilter}
                onValueChange={(value) => setStatusFilter(value as StatusFilter)}
              >
                <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
                  <SelectValue placeholder="Filtrar por status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" data-testid="filter-all">Todos</SelectItem>
                  <SelectItem value="approved" data-testid="filter-approved">Aprovados</SelectItem>
                  <SelectItem value="pending" data-testid="filter-pending">Pendentes</SelectItem>
                  <SelectItem value="rejected" data-testid="filter-rejected">Rejeitados/Cancelados</SelectItem>
                </SelectContent>
              </Select>
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
              {filteredPagamentos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    {statusFilter === "all" 
                      ? "Nenhum pagamento registrado" 
                      : "Nenhum pagamento encontrado com este filtro"}
                  </TableCell>
                </TableRow>
              ) : (
                filteredPagamentos.map((pagamento) => {
                  const statusInfo = getStatusInfo(pagamento.status);
                  const StatusIcon = statusInfo.icon;
                  return (
                    <TableRow key={pagamento.id} data-testid={`row-pagamento-${pagamento.id}`}>
                      <TableCell>
                        {format(new Date(pagamento.criadoEm), "dd/MM/yyyy HH:mm", {
                          locale: ptBR,
                        })}
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
                              {format(new Date(attempt.criadoEm), "dd/MM/yyyy 'às' HH:mm:ss", {
                                locale: ptBR,
                              })}
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
                                  {format(new Date(attempt.dataAprovacao), "dd/MM/yyyy HH:mm", {
                                    locale: ptBR,
                                  })}
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
