import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
} from "lucide-react";

interface Affiliate {
  id: string;
  adminId: string;
  name: string;
  email: string;
  whatsapp: string | null;
  cpf: string | null;
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
}

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
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedAffiliate, setSelectedAffiliate] = useState<Affiliate | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [affiliateToDelete, setAffiliateToDelete] = useState<Affiliate | null>(null);
  const [editCommissionPercent, setEditCommissionPercent] = useState<number>(30);
  const [editCommissionFixed, setEditCommissionFixed] = useState<string>("");
  const [editStatus, setEditStatus] = useState<string>("active");

  const { data: affiliates = [], isLoading } = useQuery<Affiliate[]>({
    queryKey: ["/api/affiliates"],
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

  const filteredAffiliates = affiliates.filter((affiliate) => {
    const matchesSearch =
      affiliate.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      affiliate.email?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || affiliate.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

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
    setEditCommissionFixed(affiliate.commissionFixed?.toString() || "");
    setEditStatus(affiliate.status);
    setIsEditDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (!selectedAffiliate) return;
    
    const percent = Math.max(0, Math.min(100, editCommissionPercent));
    const fixed = editCommissionFixed ? Math.max(0, parseInt(editCommissionFixed)) : null;
    
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
                            <div className="font-medium">{affiliate.name}</div>
                            <div className="text-sm text-muted-foreground">{affiliate.email}</div>
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
              <Label>Comissão Fixa (centavos, opcional)</Label>
              <Input
                type="number"
                value={editCommissionFixed}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "" || parseInt(val) >= 0) {
                    setEditCommissionFixed(val);
                  }
                }}
                placeholder="0"
                min={0}
                data-testid="input-edit-commission-fixed"
              />
              <p className="text-xs text-muted-foreground">
                Valor em centavos. Ex: 1000 = R$ 10,00
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
                  <p className="font-medium">{selectedAffiliate.name}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Email</Label>
                  <p className="font-medium">{selectedAffiliate.email}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">WhatsApp</Label>
                  <p className="font-medium">{selectedAffiliate.whatsapp || "-"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">CPF</Label>
                  <p className="font-medium">{selectedAffiliate.cpf || "-"}</p>
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
              <span className="font-semibold">{affiliateToDelete?.name}</span>? Esta ação não pode
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
