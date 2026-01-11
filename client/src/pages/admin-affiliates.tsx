import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import {
  Users,
  DollarSign,
  TrendingUp,
  Clock,
  MoreVertical,
  Check,
  X,
  Eye,
  Edit,
  Trash2,
  Search,
  Loader2,
  ShoppingCart,
  Wallet,
  Settings,
  Copy,
  Link as LinkIcon,
  Percent,
  UserCheck,
  CreditCard,
  CheckCircle,
} from "lucide-react";
import { CardDescription } from "@/components/ui/card";

interface Affiliate {
  id: string;
  adminId: string;
  status: string;
  commissionPercent: number;
  commissionFixed: number | null;
  totalEarnings: number;
  pendingAmount: number;
  paidAmount: number;
  mpUserId: string | null;
  mpConnectedAt: string | null;
  mpTokenExpiresAt: string | null;
  createdAt: string;
  admin?: {
    id: string;
    name: string;
    email: string;
  } | null;
}

interface AffiliateSale {
  id: string;
  affiliateId: string;
  linkId: string;
  pagamentoId: string;
  saleAmount: number;
  commissionAmount: number;
  commissionPercent: number;
  status: string;
  mpTransferId: string | null;
  paidAt: string | null;
  createdAt: string;
  affiliateName?: string;
  affiliateEmail?: string;
}

interface AffiliateConfig {
  defaultCommissionPercent: number;
  autoApprove: boolean;
  mpAppId: string | null;
  mpAppSecret: string | null;
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
  processedBy?: string | null;
  transactionId?: string | null;
  notes?: string | null;
  affiliateName?: string;
  affiliateEmail?: string;
}

const saleStatusLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Pendente", variant: "outline" },
  approved: { label: "Aprovado", variant: "secondary" },
  paid: { label: "Pago", variant: "default" },
  refunded: { label: "Reembolsado", variant: "destructive" },
  cancelled: { label: "Cancelado", variant: "destructive" },
};

const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Pendente", variant: "outline" },
  active: { label: "Ativo", variant: "default" },
  suspended: { label: "Suspenso", variant: "destructive" },
  inactive: { label: "Inativo", variant: "secondary" },
};

function getMpConnectionStatus(affiliate: Affiliate): { label: string; variant: "default" | "secondary" | "destructive" } {
  if (!affiliate.mpUserId || !affiliate.mpConnectedAt) {
    return { label: "Não conectado", variant: "secondary" };
  }
  if (affiliate.mpTokenExpiresAt) {
    const expiresAt = new Date(affiliate.mpTokenExpiresAt);
    if (expiresAt < new Date()) {
      return { label: "Expirado", variant: "destructive" };
    }
  }
  return { label: "Conectado", variant: "default" };
}

export default function AdminAffiliatesPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("affiliates");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [saleStatusFilter, setSaleStatusFilter] = useState<string>("all");
  const [selectedAffiliate, setSelectedAffiliate] = useState<Affiliate | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [affiliateToDelete, setAffiliateToDelete] = useState<Affiliate | null>(null);
  const [editCommissionPercent, setEditCommissionPercent] = useState<number>(30);
  const [editCommissionFixed, setEditCommissionFixed] = useState<string>("");
  const [editStatus, setEditStatus] = useState<string>("active");
  const [isPayDialogOpen, setIsPayDialogOpen] = useState(false);
  const [saleToPayId, setSaleToPayId] = useState<string | null>(null);
  const [configCommission, setConfigCommission] = useState<number>(10);
  const [autoApprove, setAutoApprove] = useState<boolean>(false);
  const [mpAppId, setMpAppId] = useState<string>("");
  const [mpAppSecret, setMpAppSecret] = useState<string>("");

  const { data: affiliates = [], isLoading } = useQuery<Affiliate[]>({
    queryKey: ["/api/affiliates"],
  });

  const { data: config, isLoading: isLoadingConfig } = useQuery<AffiliateConfig>({
    queryKey: ["/api/affiliate-config"],
    enabled: activeTab === "settings",
  });

  useEffect(() => {
    if (config) {
      setConfigCommission(config.defaultCommissionPercent || 10);
      setAutoApprove(config.autoApprove || false);
      setMpAppId(config.mpAppId || "");
      setMpAppSecret(config.mpAppSecret || "");
    }
  }, [config]);

  const updateConfigMutation = useMutation({
    mutationFn: async (data: Partial<AffiliateConfig>) => {
      const res = await apiRequest("PATCH", "/api/affiliate-config", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/affiliate-config"] });
      toast({ title: "Configurações salvas com sucesso" });
    },
    onError: () => {
      toast({ title: "Erro ao salvar configurações", variant: "destructive" });
    },
  });

  const { data: sales = [], isLoading: isLoadingSales } = useQuery<AffiliateSale[]>({
    queryKey: ["/api/affiliate-sales"],
    enabled: activeTab === "sales",
  });

  const updateAffiliateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Affiliate> }) => {
      const res = await apiRequest("PATCH", `/api/affiliates/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/affiliates"] });
      toast({ title: "Afiliado atualizado com sucesso" });
      setIsEditDialogOpen(false);
    },
    onError: () => {
      toast({ title: "Erro ao atualizar afiliado", variant: "destructive" });
    },
  });

  const deleteAffiliateMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/affiliates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/affiliates"] });
      toast({ title: "Afiliado removido com sucesso" });
      setIsDeleteDialogOpen(false);
      setAffiliateToDelete(null);
    },
    onError: () => {
      toast({ title: "Erro ao remover afiliado", variant: "destructive" });
    },
  });

  const markSalePaidMutation = useMutation({
    mutationFn: async (saleId: string) => {
      const res = await apiRequest("PATCH", `/api/affiliate-sales/${saleId}`, { status: "paid" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/affiliate-sales"] });
      queryClient.invalidateQueries({ queryKey: ["/api/affiliates"] });
      toast({ title: "Comissão marcada como paga" });
      setIsPayDialogOpen(false);
      setSaleToPayId(null);
    },
    onError: () => {
      toast({ title: "Erro ao marcar comissão como paga", variant: "destructive" });
    },
  });

  const cancelSaleMutation = useMutation({
    mutationFn: async (saleId: string) => {
      const res = await apiRequest("PATCH", `/api/affiliate-sales/${saleId}`, { status: "cancelled" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/affiliate-sales"] });
      queryClient.invalidateQueries({ queryKey: ["/api/affiliates"] });
      toast({ title: "Comissão cancelada" });
    },
    onError: () => {
      toast({ title: "Erro ao cancelar comissão", variant: "destructive" });
    },
  });

  const { data: withdrawals = [], isLoading: isLoadingWithdrawals } = useQuery<AffiliateWithdrawal[]>({
    queryKey: ["/api/affiliate-withdrawals"],
    enabled: activeTab === "withdrawals",
  });

  const [withdrawalStatusFilter, setWithdrawalStatusFilter] = useState<string>("all");
  const [withdrawalToProcess, setWithdrawalToProcess] = useState<AffiliateWithdrawal | null>(null);
  const [isPayWithdrawalDialogOpen, setIsPayWithdrawalDialogOpen] = useState(false);
  const [isRejectWithdrawalDialogOpen, setIsRejectWithdrawalDialogOpen] = useState(false);
  const [withdrawalNotes, setWithdrawalNotes] = useState("");

  const markWithdrawalPaidMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes?: string }) => {
      const res = await apiRequest("PATCH", `/api/affiliate-withdrawals/${id}/pay`, { notes });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/affiliate-withdrawals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/affiliates"] });
      toast({ title: "Saque marcado como pago!" });
      setIsPayWithdrawalDialogOpen(false);
      setWithdrawalToProcess(null);
      setWithdrawalNotes("");
    },
    onError: () => {
      toast({ title: "Erro ao processar saque", variant: "destructive" });
    },
  });

  const rejectWithdrawalMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes?: string }) => {
      const res = await apiRequest("PATCH", `/api/affiliate-withdrawals/${id}/reject`, { notes });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/affiliate-withdrawals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/affiliates"] });
      toast({ title: "Saque rejeitado" });
      setIsRejectWithdrawalDialogOpen(false);
      setWithdrawalToProcess(null);
      setWithdrawalNotes("");
    },
    onError: () => {
      toast({ title: "Erro ao rejeitar saque", variant: "destructive" });
    },
  });

  const filteredWithdrawals = withdrawals.filter((w) => {
    return withdrawalStatusFilter === "all" || w.status === withdrawalStatusFilter;
  });

  const withdrawalsStats = {
    total: withdrawals.length,
    pending: withdrawals.filter((w) => w.status === "pending").length,
    paid: withdrawals.filter((w) => w.status === "paid").length,
    totalPending: withdrawals.filter((w) => w.status === "pending").reduce((sum, w) => sum + w.amount, 0),
    totalPaid: withdrawals.filter((w) => w.status === "paid").reduce((sum, w) => sum + w.amount, 0),
  };

  const filteredAffiliates = affiliates.filter((affiliate) => {
    const matchesSearch =
      affiliate.admin?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      affiliate.admin?.email?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || affiliate.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const filteredSales = sales.filter((sale) => {
    const matchesStatus = saleStatusFilter === "all" || sale.status === saleStatusFilter;
    return matchesStatus;
  });

  const salesStats = {
    total: sales.length,
    pending: sales.filter((s) => s.status === "pending").length,
    paid: sales.filter((s) => s.status === "paid").length,
    totalPending: sales.filter((s) => s.status === "pending").reduce((sum, s) => sum + s.commissionAmount, 0),
    totalPaid: sales.filter((s) => s.status === "paid").reduce((sum, s) => sum + s.commissionAmount, 0),
  };

  const handleMarkAsPaid = (saleId: string) => {
    setSaleToPayId(saleId);
    setIsPayDialogOpen(true);
  };

  const handleConfirmPay = () => {
    if (saleToPayId) {
      markSalePaidMutation.mutate(saleToPayId);
    }
  };

  const stats = {
    total: affiliates.length,
    active: affiliates.filter((a) => a.status === "active").length,
    pending: affiliates.filter((a) => a.status === "pending").length,
    totalEarnings: affiliates.reduce((sum, a) => sum + (a.totalEarnings || 0), 0),
  };

  const handleApprove = (affiliate: Affiliate) => {
    updateAffiliateMutation.mutate({
      id: affiliate.id,
      data: { status: "active" },
    });
  };

  const handleSuspend = (affiliate: Affiliate) => {
    updateAffiliateMutation.mutate({
      id: affiliate.id,
      data: { status: "suspended" },
    });
  };

  const handleEdit = (affiliate: Affiliate) => {
    setSelectedAffiliate(affiliate);
    setEditCommissionPercent(affiliate.commissionPercent || 30);
    setEditCommissionFixed(affiliate.commissionFixed ? (affiliate.commissionFixed / 100).toFixed(2) : "");
    setEditStatus(affiliate.status);
    setIsEditDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (!selectedAffiliate) return;
    
    const percent = Math.max(0, Math.min(100, editCommissionPercent));
    const fixed = editCommissionFixed ? Math.max(0, Math.round(parseFloat(editCommissionFixed) * 100)) : null;
    
    updateAffiliateMutation.mutate({
      id: selectedAffiliate.id,
      data: {
        commissionPercent: percent,
        commissionFixed: fixed,
        status: editStatus,
      },
    });
  };

  const handleView = (affiliate: Affiliate) => {
    setSelectedAffiliate(affiliate);
    setIsViewDialogOpen(true);
  };

  const handleDeleteClick = (affiliate: Affiliate) => {
    setAffiliateToDelete(affiliate);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (affiliateToDelete) {
      deleteAffiliateMutation.mutate(affiliateToDelete.id);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value / 100);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("pt-BR");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">
            Gerenciar Afiliados
          </h1>
          <p className="text-muted-foreground">
            Gerencie afiliados, comissões e vendas do programa de afiliados
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="affiliates" data-testid="tab-affiliates">
            <Users className="h-4 w-4 mr-2" />
            Afiliados
          </TabsTrigger>
          <TabsTrigger value="sales" data-testid="tab-sales">
            <ShoppingCart className="h-4 w-4 mr-2" />
            Vendas
          </TabsTrigger>
          <TabsTrigger value="settings" data-testid="tab-settings">
            <Settings className="h-4 w-4 mr-2" />
            Configurações
          </TabsTrigger>
          <TabsTrigger value="withdrawals" data-testid="tab-withdrawals">
            <Wallet className="h-4 w-4 mr-2" />
            Saques
            {withdrawalsStats.pending > 0 && (
              <Badge variant="destructive" className="ml-2 h-5 px-1.5">
                {withdrawalsStats.pending}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="affiliates" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium">Total de Afiliados</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-affiliates">
                  {stats.total}
                </div>
              </CardContent>
            </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Afiliados Ativos</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600" data-testid="text-active-affiliates">
              {stats.active}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Pendentes</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600" data-testid="text-pending-affiliates">
              {stats.pending}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Total em Comissões</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-earnings">
              {formatCurrency(stats.totalEarnings)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Afiliados</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="input-search-affiliates"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-status-filter">
                <SelectValue placeholder="Filtrar por status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pending">Pendentes</SelectItem>
                <SelectItem value="active">Ativos</SelectItem>
                <SelectItem value="suspended">Suspensos</SelectItem>
                <SelectItem value="inactive">Inativos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Afiliado</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Comissão</TableHead>
                  <TableHead>Ganhos Totais</TableHead>
                  <TableHead>Pendente</TableHead>
                  <TableHead>Pago</TableHead>
                  <TableHead>Mercado Pago</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAffiliates.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      Nenhum afiliado encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAffiliates.map((affiliate) => {
                    const mpStatus = getMpConnectionStatus(affiliate);
                    return (
                      <TableRow key={affiliate.id} data-testid={`row-affiliate-${affiliate.id}`}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{affiliate.admin?.name || "Sem nome"}</div>
                            <div className="text-sm text-muted-foreground">{affiliate.admin?.email || "-"}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusLabels[affiliate.status]?.variant || "outline"}>
                            {statusLabels[affiliate.status]?.label || affiliate.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {affiliate.commissionPercent}%
                          {affiliate.commissionFixed && (
                            <span className="text-xs text-muted-foreground ml-1">
                              + {formatCurrency(affiliate.commissionFixed)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>{formatCurrency(affiliate.totalEarnings || 0)}</TableCell>
                        <TableCell>{formatCurrency(affiliate.pendingAmount || 0)}</TableCell>
                        <TableCell>{formatCurrency(affiliate.paidAmount || 0)}</TableCell>
                        <TableCell>
                          <Badge variant={mpStatus.variant} className="text-xs">
                            {mpStatus.label}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDate(affiliate.createdAt)}</TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" data-testid={`button-actions-${affiliate.id}`}>
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleView(affiliate)}>
                                <Eye className="h-4 w-4 mr-2" />
                                Ver Detalhes
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleEdit(affiliate)}>
                                <Edit className="h-4 w-4 mr-2" />
                                Editar
                              </DropdownMenuItem>
                              {affiliate.status === "pending" && (
                                <DropdownMenuItem onClick={() => handleApprove(affiliate)}>
                                  <Check className="h-4 w-4 mr-2 text-green-600" />
                                  Aprovar
                                </DropdownMenuItem>
                              )}
                              {affiliate.status === "active" && (
                                <DropdownMenuItem onClick={() => handleSuspend(affiliate)}>
                                  <X className="h-4 w-4 mr-2 text-red-600" />
                                  Suspender
                                </DropdownMenuItem>
                              )}
                              {affiliate.status === "suspended" && (
                                <DropdownMenuItem onClick={() => handleApprove(affiliate)}>
                                  <Check className="h-4 w-4 mr-2 text-green-600" />
                                  Reativar
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                onClick={() => handleDeleteClick(affiliate)}
                                className="text-red-600"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Remover
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="sales" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium">Total de Vendas</CardTitle>
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-sales">
                  {salesStats.total}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium">Pendentes</CardTitle>
                <Clock className="h-4 w-4 text-yellow-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600" data-testid="text-pending-sales">
                  {salesStats.pending}
                </div>
                <p className="text-xs text-muted-foreground">{formatCurrency(salesStats.totalPending)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium">Pagas</CardTitle>
                <Check className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600" data-testid="text-paid-sales">
                  {salesStats.paid}
                </div>
                <p className="text-xs text-muted-foreground">{formatCurrency(salesStats.totalPaid)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium">Total Pago</CardTitle>
                <Wallet className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-paid-amount">
                  {formatCurrency(salesStats.totalPaid)}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Lista de Comissões</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-4 mb-4">
                <Select value={saleStatusFilter} onValueChange={setSaleStatusFilter}>
                  <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-sale-status-filter">
                    <SelectValue placeholder="Filtrar por status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="pending">Pendentes</SelectItem>
                    <SelectItem value="paid">Pagas</SelectItem>
                    <SelectItem value="cancelled">Canceladas</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {isLoadingSales ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Afiliado</TableHead>
                        <TableHead>Valor da Venda</TableHead>
                        <TableHead>Comissão</TableHead>
                        <TableHead>%</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSales.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                            Nenhuma comissão encontrada
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredSales.map((sale) => (
                          <TableRow key={sale.id} data-testid={`row-sale-${sale.id}`}>
                            <TableCell>
                              <div>
                                <div className="font-medium">{sale.affiliateName || "-"}</div>
                                <div className="text-sm text-muted-foreground">{sale.affiliateEmail || "-"}</div>
                              </div>
                            </TableCell>
                            <TableCell>{formatCurrency(sale.saleAmount)}</TableCell>
                            <TableCell className="font-medium">{formatCurrency(sale.commissionAmount)}</TableCell>
                            <TableCell>{sale.commissionPercent}%</TableCell>
                            <TableCell>
                              <Badge variant={saleStatusLabels[sale.status]?.variant || "outline"}>
                                {saleStatusLabels[sale.status]?.label || sale.status}
                              </Badge>
                            </TableCell>
                            <TableCell>{formatDate(sale.createdAt)}</TableCell>
                            <TableCell className="text-right">
                              {sale.status === "pending" && (
                                <div className="flex justify-end gap-2">
                                  <Button
                                    size="sm"
                                    onClick={() => handleMarkAsPaid(sale.id)}
                                    data-testid={`button-pay-${sale.id}`}
                                  >
                                    <Check className="h-4 w-4 mr-1" />
                                    Pagar
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => cancelSaleMutation.mutate(sale.id)}
                                    data-testid={`button-cancel-${sale.id}`}
                                  >
                                    <X className="h-4 w-4 mr-1" />
                                    Cancelar
                                  </Button>
                                </div>
                              )}
                              {sale.status === "paid" && sale.paidAt && (
                                <span className="text-xs text-muted-foreground">
                                  Pago em {formatDate(sale.paidAt)}
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-6 mt-4">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LinkIcon className="h-5 w-5" />
                  Links de Afiliados
                </CardTitle>
                <CardDescription>
                  Links para cadastro e login de afiliados
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-sm font-medium mb-2 block">Link de Convite (Cadastro)</Label>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={`${window.location.origin}/afiliado/cadastro`}
                      className="font-mono text-sm"
                      data-testid="input-invite-link"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/afiliado/cadastro`);
                        toast({ title: "Link copiado!" });
                      }}
                      data-testid="button-copy-invite"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Novos afiliados podem se cadastrar usando este link
                  </p>
                </div>
                <div>
                  <Label className="text-sm font-medium mb-2 block">Link de Login (Painel do Afiliado)</Label>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={`${window.location.origin}/afiliado/login`}
                      className="font-mono text-sm"
                      data-testid="input-login-link"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/afiliado/login`);
                        toast({ title: "Link copiado!" });
                      }}
                      data-testid="button-copy-login"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Afiliados cadastrados podem acessar o painel por aqui
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Percent className="h-5 w-5" />
                  Comissão Padrão
                </CardTitle>
                <CardDescription>
                  Define a comissão padrão para novos afiliados
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingConfig ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={configCommission}
                        onChange={(e) => setConfigCommission(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
                        className="w-24"
                        data-testid="input-default-commission"
                      />
                      <span className="text-muted-foreground">%</span>
                    </div>
                    <Button
                      onClick={() => updateConfigMutation.mutate({ defaultCommissionPercent: configCommission })}
                      disabled={updateConfigMutation.isPending}
                      data-testid="button-save-commission"
                    >
                      {updateConfigMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Salvar Comissão
                    </Button>
                    <p className="text-sm text-muted-foreground">
                      Atual: {config?.defaultCommissionPercent || 10}%
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserCheck className="h-5 w-5" />
                  Aprovação de Afiliados
                </CardTitle>
                <CardDescription>
                  Escolha se novos afiliados são aprovados automaticamente
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingConfig ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <Switch
                        checked={autoApprove}
                        onCheckedChange={(checked) => {
                          setAutoApprove(checked);
                          updateConfigMutation.mutate({ autoApprove: checked });
                        }}
                        data-testid="switch-auto-approve"
                      />
                      <div>
                        <Label className="text-base">
                          {autoApprove ? "Aprovação Automática" : "Aprovação Manual"}
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          {autoApprove 
                            ? "Novos afiliados serão aprovados automaticamente" 
                            : "Você precisará aprovar cada afiliado manualmente"}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Mercado Pago OAuth (Afiliados)
              </CardTitle>
              <CardDescription>
                Configure as credenciais do Mercado Pago para permitir que afiliados conectem suas contas.
                Você precisa criar um aplicativo no Mercado Pago Developers.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingConfig ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>App ID</Label>
                    <Input
                      value={mpAppId}
                      onChange={(e) => setMpAppId(e.target.value)}
                      placeholder="Seu App ID do Mercado Pago"
                      data-testid="input-mp-app-id"
                    />
                    <p className="text-xs text-muted-foreground">
                      Encontre em: Mercado Pago Developers → Suas integrações → Credenciais
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>App Secret</Label>
                    <Input
                      type="password"
                      value={mpAppSecret}
                      onChange={(e) => setMpAppSecret(e.target.value)}
                      placeholder="Seu App Secret do Mercado Pago"
                      data-testid="input-mp-app-secret"
                    />
                  </div>
                  <Button
                    onClick={() => updateConfigMutation.mutate({ mpAppId, mpAppSecret })}
                    disabled={updateConfigMutation.isPending}
                    data-testid="button-save-mp-oauth"
                  >
                    {updateConfigMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Salvar Credenciais
                  </Button>
                  {config?.mpAppId && (
                    <p className="text-sm text-green-600 flex items-center gap-1">
                      <CheckCircle className="h-4 w-4" />
                      OAuth configurado
                    </p>
                  )}
                  
                  <div className="mt-4 p-3 bg-muted rounded-md">
                    <Label className="text-sm font-medium">URL de Redirecionamento (Redirect URI)</Label>
                    <p className="text-xs text-muted-foreground mb-2">
                      Copie e configure esta URL no Mercado Pago Developers
                    </p>
                    <div className="flex gap-2">
                      <Input
                        readOnly
                        value={`${import.meta.env.VITE_PUBLIC_BASE_URL || window.location.origin}/api/affiliates/oauth/callback`}
                        className="font-mono text-xs"
                        data-testid="input-redirect-uri"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          const url = `${import.meta.env.VITE_PUBLIC_BASE_URL || window.location.origin}/api/affiliates/oauth/callback`;
                          navigator.clipboard.writeText(url);
                          toast({ title: "URL copiada!" });
                        }}
                        data-testid="button-copy-redirect-uri"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="withdrawals" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium">Solicitações Pendentes</CardTitle>
                <Clock className="h-4 w-4 text-yellow-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600" data-testid="text-pending-withdrawals">
                  {withdrawalsStats.pending}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatCurrency(withdrawalsStats.totalPending)} pendentes
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium">Saques Pagos</CardTitle>
                <CheckCircle className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600" data-testid="text-paid-withdrawals">
                  {withdrawalsStats.paid}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatCurrency(withdrawalsStats.totalPaid)} pagos
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium">Total de Solicitações</CardTitle>
                <Wallet className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-withdrawals">
                  {withdrawalsStats.total}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                Solicitações de Saque
              </CardTitle>
              <CardDescription>
                Gerencie as solicitações de saque dos afiliados. Após o envio do PIX, marque como pago.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 mb-4">
                <Select value={withdrawalStatusFilter} onValueChange={setWithdrawalStatusFilter}>
                  <SelectTrigger className="w-48" data-testid="select-withdrawal-status-filter">
                    <SelectValue placeholder="Filtrar por status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os status</SelectItem>
                    <SelectItem value="pending">Pendentes</SelectItem>
                    <SelectItem value="paid">Pagos</SelectItem>
                    <SelectItem value="rejected">Rejeitados</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {isLoadingWithdrawals ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Afiliado</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Chave PIX</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Solicitado em</TableHead>
                        <TableHead>Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredWithdrawals.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                            Nenhuma solicitação de saque encontrada.
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredWithdrawals.map((withdrawal) => (
                          <TableRow key={withdrawal.id} data-testid={`row-withdrawal-${withdrawal.id}`}>
                            <TableCell>
                              <div>
                                <p className="font-medium">{withdrawal.affiliateName || "Afiliado"}</p>
                                <p className="text-xs text-muted-foreground">{withdrawal.affiliateEmail || "-"}</p>
                              </div>
                            </TableCell>
                            <TableCell className="font-medium">
                              {formatCurrency(withdrawal.amount)}
                            </TableCell>
                            <TableCell className="font-mono text-xs max-w-[200px] truncate">
                              {withdrawal.pixKey}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="capitalize">
                                {withdrawal.pixKeyType}
                              </Badge>
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
                              {formatDate(withdrawal.requestedAt)}
                            </TableCell>
                            <TableCell>
                              {withdrawal.status === 'pending' && (
                                <div className="flex gap-1">
                                  <Button
                                    size="sm"
                                    onClick={() => {
                                      setWithdrawalToProcess(withdrawal);
                                      setIsPayWithdrawalDialogOpen(true);
                                    }}
                                    data-testid={`button-pay-withdrawal-${withdrawal.id}`}
                                  >
                                    <Check className="h-4 w-4 mr-1" />
                                    Pagar
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setWithdrawalToProcess(withdrawal);
                                      setIsRejectWithdrawalDialogOpen(true);
                                    }}
                                    data-testid={`button-reject-withdrawal-${withdrawal.id}`}
                                  >
                                    <X className="h-4 w-4 mr-1" />
                                    Rejeitar
                                  </Button>
                                </div>
                              )}
                              {withdrawal.status === 'paid' && withdrawal.paidAt && (
                                <span className="text-xs text-muted-foreground">
                                  Pago em {formatDate(withdrawal.paidAt)}
                                </span>
                              )}
                              {withdrawal.status === 'rejected' && (
                                <span className="text-xs text-muted-foreground">
                                  {withdrawal.notes || "Rejeitado"}
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AlertDialog open={isPayWithdrawalDialogOpen} onOpenChange={setIsPayWithdrawalDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Pagamento de Saque</AlertDialogTitle>
            <AlertDialogDescription>
              <div className="space-y-3 mt-2">
                <p>Você está prestes a marcar este saque como pago:</p>
                <div className="bg-muted p-3 rounded-md space-y-1">
                  <p><strong>Afiliado:</strong> {withdrawalToProcess?.affiliateName}</p>
                  <p><strong>Valor:</strong> {formatCurrency(withdrawalToProcess?.amount || 0)}</p>
                  <p><strong>Chave PIX:</strong> <span className="font-mono">{withdrawalToProcess?.pixKey}</span></p>
                  <p><strong>Tipo:</strong> {withdrawalToProcess?.pixKeyType}</p>
                </div>
                <p className="text-sm">Certifique-se de que você já enviou o PIX antes de confirmar.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="mt-4">
            <Label>Observações (opcional)</Label>
            <Input
              placeholder="ID da transação, comprovante, etc."
              value={withdrawalNotes}
              onChange={(e) => setWithdrawalNotes(e.target.value)}
              data-testid="input-withdrawal-notes"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setWithdrawalToProcess(null);
              setWithdrawalNotes("");
            }}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (withdrawalToProcess) {
                  markWithdrawalPaidMutation.mutate({
                    id: withdrawalToProcess.id,
                    notes: withdrawalNotes || undefined,
                  });
                }
              }}
              data-testid="button-confirm-pay-withdrawal"
            >
              {markWithdrawalPaidMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmar Pagamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isRejectWithdrawalDialogOpen} onOpenChange={setIsRejectWithdrawalDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rejeitar Saque</AlertDialogTitle>
            <AlertDialogDescription>
              <div className="space-y-3 mt-2">
                <p>Você está prestes a rejeitar este saque:</p>
                <div className="bg-muted p-3 rounded-md space-y-1">
                  <p><strong>Afiliado:</strong> {withdrawalToProcess?.affiliateName}</p>
                  <p><strong>Valor:</strong> {formatCurrency(withdrawalToProcess?.amount || 0)}</p>
                </div>
                <p className="text-sm text-destructive">O valor será devolvido ao saldo disponível do afiliado.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="mt-4">
            <Label>Motivo da rejeição</Label>
            <Input
              placeholder="Informe o motivo da rejeição"
              value={withdrawalNotes}
              onChange={(e) => setWithdrawalNotes(e.target.value)}
              data-testid="input-rejection-reason"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setWithdrawalToProcess(null);
              setWithdrawalNotes("");
            }}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (withdrawalToProcess) {
                  rejectWithdrawalMutation.mutate({
                    id: withdrawalToProcess.id,
                    notes: withdrawalNotes || undefined,
                  });
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-reject-withdrawal"
            >
              {rejectWithdrawalMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Rejeitar Saque
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isPayDialogOpen} onOpenChange={setIsPayDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Pagamento</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja marcar esta comissão como paga? Esta ação indica que você transferiu o valor para o afiliado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmPay} data-testid="button-confirm-pay">
              {markSalePaidMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmar Pagamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Afiliado</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger data-testid="select-edit-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="suspended">Suspenso</SelectItem>
                  <SelectItem value="inactive">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Comissão Percentual (%)</Label>
              <Input
                type="number"
                value={editCommissionPercent}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 0;
                  setEditCommissionPercent(Math.max(0, Math.min(100, val)));
                }}
                min={0}
                max={100}
                data-testid="input-edit-commission-percent"
              />
              <p className="text-xs text-muted-foreground">Valor entre 0 e 100</p>
            </div>
            <div className="space-y-2">
              <Label>Comissão Fixa (R$, opcional)</Label>
              <Input
                type="number"
                value={editCommissionFixed}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "" || parseFloat(val) >= 0) {
                    setEditCommissionFixed(val);
                  }
                }}
                placeholder="0.00"
                min={0}
                step="0.01"
                data-testid="input-edit-commission-fixed"
              />
              <p className="text-xs text-muted-foreground">
                Valor em reais. Ex: 10,00 = R$ 10,00
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={updateAffiliateMutation.isPending}
              data-testid="button-save-edit"
            >
              {updateAffiliateMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes do Afiliado</DialogTitle>
          </DialogHeader>
          {selectedAffiliate && (
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Nome</Label>
                  <p className="font-medium">{selectedAffiliate.admin?.name || "-"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Email</Label>
                  <p className="font-medium">{selectedAffiliate.admin?.email || "-"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <div className="mt-1">
                    <Badge variant={statusLabels[selectedAffiliate.status]?.variant}>
                      {statusLabels[selectedAffiliate.status]?.label}
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Comissão</Label>
                  <p className="font-medium">
                    {selectedAffiliate.commissionPercent}%
                    {selectedAffiliate.commissionFixed && (
                      <span className="ml-1">
                        + {formatCurrency(selectedAffiliate.commissionFixed)}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold mb-3">Financeiro</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-sm text-muted-foreground">Ganhos Totais</p>
                    <p className="text-lg font-bold text-green-600">
                      {formatCurrency(selectedAffiliate.totalEarnings || 0)}
                    </p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-sm text-muted-foreground">Pendente</p>
                    <p className="text-lg font-bold text-yellow-600">
                      {formatCurrency(selectedAffiliate.pendingAmount || 0)}
                    </p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-sm text-muted-foreground">Pago</p>
                    <p className="text-lg font-bold">
                      {formatCurrency(selectedAffiliate.paidAmount || 0)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold mb-3">Mercado Pago</h3>
                {(() => {
                  const mpStatus = getMpConnectionStatus(selectedAffiliate);
                  return (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={mpStatus.variant}>{mpStatus.label}</Badge>
                        {selectedAffiliate.mpUserId && (
                          <span className="text-sm text-muted-foreground">
                            ID: {selectedAffiliate.mpUserId}
                          </span>
                        )}
                      </div>
                      {selectedAffiliate.mpConnectedAt && (
                        <p className="text-sm text-muted-foreground">
                          Conectado em: {formatDate(selectedAffiliate.mpConnectedAt)}
                        </p>
                      )}
                      {selectedAffiliate.mpTokenExpiresAt && (
                        <p className="text-sm text-muted-foreground">
                          Expira em: {formatDate(selectedAffiliate.mpTokenExpiresAt)}
                        </p>
                      )}
                      {!selectedAffiliate.mpUserId && (
                        <p className="text-muted-foreground">
                          Afiliado ainda não conectou sua conta do Mercado Pago
                        </p>
                      )}
                    </div>
                  );
                })()}
              </div>

              <div className="border-t pt-4">
                <p className="text-sm text-muted-foreground">
                  Cadastrado em: {formatDate(selectedAffiliate.createdAt)}
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover Afiliado</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover o afiliado{" "}
              <span className="font-semibold">{affiliateToDelete?.admin?.name || "este afiliado"}</span>? Esta ação não pode
              ser desfeita e todos os dados do afiliado serão perdidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteAffiliateMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
