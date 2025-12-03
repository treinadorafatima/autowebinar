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
import { Loader2, DollarSign, ShoppingCart, TrendingUp, CreditCard, Eye, Check, Clock, X, Users } from "lucide-react";
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

export default function AdminCheckoutRelatorios() {
  const { toast } = useToast();

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
          <CardTitle>Histórico de Pagamentos</CardTitle>
          <CardDescription>Todos os pagamentos registrados no sistema</CardDescription>
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
              {pagamentos?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Nenhum pagamento registrado
                  </TableCell>
                </TableRow>
              ) : (
                pagamentos?.map((pagamento) => {
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
    </div>
  );
}
