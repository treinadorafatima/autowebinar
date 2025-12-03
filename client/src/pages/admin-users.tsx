import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Trash2, 
  Plus, 
  Edit,
  Users,
  Crown,
  Play,
  Shield,
  Mail,
  Key,
  Clock,
  AlertCircle,
  LogIn,
  CheckCircle2,
  Package,
  Filter,
  XCircle,
  AlertTriangle
} from "lucide-react";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  webinarLimit: number;
  uploadLimit?: number;
  webinarCount: number;
  isActive: boolean;
  accessExpiresAt: string | null;
  createdAt: string;
  planoId?: string | null;
}

interface Plano {
  id: string;
  nome: string;
  descricao: string;
  preco: number;
  prazoDias: number;
  webinarLimit: number;
  uploadLimit: number;
  ativo: boolean;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteCompleteModal, setShowDeleteCompleteModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [deletingComplete, setDeletingComplete] = useState(false);
  const [filterExpired, setFilterExpired] = useState(false);
  const [filterActive, setFilterActive] = useState<boolean | null>(null); // null = todos, true = ativos, false = inativos
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    webinarLimit: 5,
    uploadLimit: 5,
    accessExpiresAt: "",
    planoId: "",
  });
  const [saving, setSaving] = useState(false);
  const [impersonating, setImpersonating] = useState<string | null>(null);
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  
  function getExpiredDuration(expiresAt: string | null): string | null {
    if (!expiresAt) return null;
    const expiryDate = new Date(expiresAt);
    const now = new Date();
    if (expiryDate >= now) return null;
    
    const diffMs = now.getTime() - expiryDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return "Expirou hoje";
    if (diffDays === 1) return "Expirou há 1 dia";
    if (diffDays < 30) return `Expirou há ${diffDays} dias`;
    
    const diffMonths = Math.floor(diffDays / 30);
    if (diffMonths === 1) return "Expirou há 1 mês";
    return `Expirou há ${diffMonths} meses`;
  }
  
  function isExpired(expiresAt: string | null): boolean {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  }

  const token = localStorage.getItem("adminToken");

  useEffect(() => {
    if (!token) {
      setLocation("/login");
      return;
    }
    fetchUsers();
    fetchPlanos();
  }, []);

  async function fetchUsers() {
    try {
      const res = await fetch("/api/users", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 403) {
        toast({
          title: "Acesso negado",
          description: "Apenas o superadmin pode acessar esta página",
          variant: "destructive",
        });
        setLocation("/admin");
        return;
      }

      if (!res.ok) {
        throw new Error("Falha ao carregar usuários");
      }

      const data = await res.json();
      setUsers(data);
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  async function fetchPlanos() {
    try {
      const res = await fetch("/api/checkout/planos", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPlanos(data.filter((p: Plano) => p.ativo));
      }
    } catch (error) {
      console.error("Erro ao carregar planos:", error);
    }
  }

  function handlePlanoChange(planoId: string) {
    if (planoId === "none" || !planoId) {
      setFormData({
        ...formData,
        planoId: "none",
      });
      return;
    }
    
    const plano = planos.find(p => p.id === planoId);
    if (plano) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + plano.prazoDias);
      
      setFormData({
        ...formData,
        planoId,
        webinarLimit: plano.webinarLimit,
        uploadLimit: plano.uploadLimit,
        accessExpiresAt: expiresAt.toISOString().split('T')[0],
      });
    }
  }

  async function handleLoginAsUser(userId: string, userName: string) {
    setImpersonating(userId);
    try {
      const res = await fetch(`/api/users/${userId}/login-as`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error("Falha ao acessar conta do usuário");
      }

      const data = await res.json();
      localStorage.setItem("adminToken", data.token);
      toast({
        title: "Sucesso",
        description: `Acessando como ${userName}`,
      });
      
      setTimeout(() => {
        setLocation("/admin");
      }, 500);
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setImpersonating(null);
    }
  }

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.email || !formData.password) {
      toast({ title: "Erro", description: "Email e senha são obrigatórios", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Falha ao criar usuário");
      }

      const newUser = await res.json();
      setUsers([...users, { ...newUser, webinarCount: 0 }]);
      setFormData({ name: "", email: "", password: "", webinarLimit: 5, uploadLimit: 5, accessExpiresAt: "", planoId: "" });
      setShowAddModal(false);
      toast({ title: "Sucesso", description: "Usuário criado com sucesso!" });
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateUser(e: React.FormEvent) {
    e.preventDefault();
    if (!editingUser) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/users/${editingUser.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password: formData.password || undefined,
          webinarLimit: formData.webinarLimit,
          uploadLimit: formData.uploadLimit,
          accessExpiresAt: formData.accessExpiresAt || undefined,
          planoId: formData.planoId || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Falha ao atualizar usuário");
      }

      await fetchUsers();
      setShowEditModal(false);
      setEditingUser(null);
      toast({ title: "Sucesso", description: "Usuário atualizado!" });
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(user: User) {
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isActive: !user.isActive }),
      });

      if (!res.ok) {
        throw new Error("Falha ao atualizar status");
      }

      setUsers(users.map(u => u.id === user.id ? { ...u, isActive: !u.isActive } : u));
      toast({ 
        title: "Sucesso", 
        description: user.isActive ? "Usuário desativado" : "Usuário ativado" 
      });
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    }
  }

  async function handleDeleteUser(id: string) {
    if (!confirm("Tem certeza que deseja excluir este usuário? Esta ação não pode ser desfeita.")) return;

    try {
      const res = await fetch(`/api/users/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Falha ao deletar");
      }

      setUsers(users.filter((u) => u.id !== id));
      toast({ title: "Sucesso", description: "Usuário removido!" });
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    }
  }
  
  function openDeleteCompleteModal(user: User) {
    setUserToDelete(user);
    setShowDeleteCompleteModal(true);
  }
  
  async function handleDeleteComplete() {
    if (!userToDelete) return;
    
    setDeletingComplete(true);
    try {
      const res = await fetch(`/api/users/${userToDelete.id}/complete`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Falha ao deletar completamente");
      }

      const result = await res.json();
      setUsers(users.filter((u) => u.id !== userToDelete.id));
      setShowDeleteCompleteModal(false);
      setUserToDelete(null);
      toast({ 
        title: "Conta excluída completamente", 
        description: `Removidos: ${result.deletedWebinars} webinars, ${result.deletedVideos} vídeos, ${result.deletedComments} comentários` 
      });
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDeletingComplete(false);
    }
  }

  function openEditModal(user: User) {
    setEditingUser(user);
    const expiresDate = user.accessExpiresAt ? new Date(user.accessExpiresAt).toISOString().split('T')[0] : "";
    setFormData({
      name: user.name || "",
      email: user.email,
      password: "",
      webinarLimit: user.webinarLimit ?? 5,
      uploadLimit: user.uploadLimit ?? 5,
      accessExpiresAt: expiresDate,
      planoId: user.planoId || "none",
    });
    setShowEditModal(true);
  }

  if (loading) {
    return (
      <div className="p-4 sm:p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const allRegularUsers = users.filter(u => u.role !== "superadmin");
  const activeCount = allRegularUsers.filter(u => u.isActive).length;
  const inactiveCount = allRegularUsers.filter(u => !u.isActive).length;
  const expiredCount = allRegularUsers.filter(u => isExpired(u.accessExpiresAt)).length;
  
  // Aplicar filtros
  let regularUsers = allRegularUsers;
  if (filterExpired) {
    regularUsers = regularUsers.filter(u => isExpired(u.accessExpiresAt));
  }
  if (filterActive === true) {
    regularUsers = regularUsers.filter(u => u.isActive);
  } else if (filterActive === false) {
    regularUsers = regularUsers.filter(u => !u.isActive);
  }
  
  const superadmins = users.filter(u => u.role === "superadmin");
  
  // Função para limpar filtros
  function clearFilters() {
    setFilterExpired(false);
    setFilterActive(null);
  }
  
  const hasActiveFilters = filterExpired || filterActive !== null;

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Users className="w-8 h-8 text-primary" />
            Gerenciar Usuários
          </h1>
          <p className="text-muted-foreground">Controle de acesso e limites de webinars</p>
        </div>
        <Button 
          onClick={() => {
            setFormData({ name: "", email: "", password: "", webinarLimit: 5, uploadLimit: 5, accessExpiresAt: "", planoId: "" });
            setShowAddModal(true);
          }}
          className="gap-2"
          data-testid="button-add-user"
        >
          <Plus className="w-4 h-4" />
          Novo Usuário
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card 
          className={`cursor-pointer transition-all hover-elevate ${hasActiveFilters ? '' : 'ring-2 ring-blue-500'}`}
          onClick={clearFilters}
          data-testid="filter-all-users"
        >
          <CardContent className="p-4 flex items-center gap-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 shadow-md">
              <Users className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold">{allRegularUsers.length}</p>
              <p className="text-sm text-muted-foreground">
                Total de Clientes
                {!hasActiveFilters && <span className="ml-1 text-blue-500">(todos)</span>}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card 
          className={`cursor-pointer transition-all hover-elevate ${filterActive === true ? 'ring-2 ring-green-500' : ''}`}
          onClick={() => {
            setFilterActive(filterActive === true ? null : true);
            setFilterExpired(false);
          }}
          data-testid="filter-active-users"
        >
          <CardContent className="p-4 flex items-center gap-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 shadow-md">
              <CheckCircle2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold">{activeCount}</p>
              <p className="text-sm text-muted-foreground">
                Usuários Ativos
                {filterActive === true && <span className="ml-1 text-green-500">(filtrado)</span>}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card 
          className={`cursor-pointer transition-all hover-elevate ${filterExpired ? 'ring-2 ring-red-500' : ''}`}
          onClick={() => {
            setFilterExpired(!filterExpired);
            setFilterActive(null);
          }}
          data-testid="filter-expired-users"
        >
          <CardContent className="p-4 flex items-center gap-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-orange-500 shadow-md">
              <XCircle className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold">{expiredCount}</p>
              <p className="text-sm text-muted-foreground">
                Planos Expirados
                {filterExpired && <span className="ml-1 text-red-500">(filtrado)</span>}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 shadow-md">
              <Play className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold">{users.reduce((sum, u) => sum + u.webinarCount, 0)}</p>
              <p className="text-sm text-muted-foreground">Webinars Criados</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Superadmins */}
      {superadmins.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Crown className="w-5 h-5 text-yellow-500" />
              Superadministradores
            </CardTitle>
            <CardDescription>Acesso total ao sistema</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {superadmins.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-4 rounded-lg border bg-gradient-to-r from-yellow-500/5 to-orange-500/5"
                  data-testid={`user-item-${user.id}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-yellow-500 to-orange-500">
                      <Crown className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="font-semibold">{user.name || "Sem nome"}</p>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-700 dark:text-yellow-400">
                    Superadmin
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Regular Users */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="w-5 h-5 text-blue-500" />
                Clientes
              </CardTitle>
              <CardDescription>Usuários com acesso limitado</CardDescription>
            </div>
            {hasActiveFilters && (
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="gap-1">
                  <Filter className="w-3 h-3" />
                  {filterActive === true && "Ativos"}
                  {filterExpired && "Expirados"}
                  {` (${regularUsers.length})`}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="h-6 px-2 text-xs"
                  data-testid="button-clear-filters"
                >
                  Limpar
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {regularUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-blue-100 to-cyan-100 dark:from-blue-900/30 dark:to-cyan-900/30 mb-4">
                <Users className="w-8 h-8 text-blue-500" />
              </div>
              <h3 className="font-semibold mb-1">Nenhum cliente ainda</h3>
              <p className="text-sm text-muted-foreground mb-4">Adicione clientes para que possam criar webinars</p>
              <Button 
                size="sm" 
                onClick={() => {
                  setFormData({ name: "", email: "", password: "", webinarLimit: 5, uploadLimit: 5, accessExpiresAt: "", planoId: "" });
                  setShowAddModal(true);
                }}
                data-testid="button-add-first-user"
              >
                <Plus className="w-4 h-4 mr-2" />
                Adicionar Cliente
              </Button>
            </div>
          ) : (
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-3">
                {regularUsers.map((user, index) => (
                  <div key={user.id}>
                    <div
                      className="flex items-center justify-between p-4 rounded-lg border hover-elevate"
                      data-testid={`user-item-${user.id}`}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className={`flex items-center justify-center w-10 h-10 rounded-full ${user.isActive ? 'bg-gradient-to-br from-blue-500 to-cyan-500' : 'bg-gray-300 dark:bg-gray-700'}`}>
                          <Users className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold truncate">{user.name || "Sem nome"}</p>
                            {!user.isActive && (
                              <Badge variant="outline" className="text-xs">Inativo</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <Badge variant="secondary" className="text-xs">
                              <Play className="w-3 h-3 mr-1" />
                              {user.webinarCount}/{user.webinarLimit} webinars
                            </Badge>
                            {user.accessExpiresAt ? (
                              isExpired(user.accessExpiresAt) ? (
                                <Badge 
                                  variant="outline" 
                                  className="text-xs bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30"
                                >
                                  <XCircle className="w-3 h-3 mr-1" />
                                  {getExpiredDuration(user.accessExpiresAt)}
                                </Badge>
                              ) : (
                                <Badge 
                                  variant="outline" 
                                  className={`text-xs ${
                                    new Date(user.accessExpiresAt).getTime() - new Date().getTime() < 7 * 24 * 60 * 60 * 1000
                                      ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30'
                                      : 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30'
                                  }`}
                                >
                                  <Clock className="w-3 h-3 mr-1" />
                                  Vence: {new Date(user.accessExpiresAt).toLocaleDateString('pt-BR')}
                                </Badge>
                              )
                            ) : (
                              <Badge variant="outline" className="text-xs bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30">
                                <CheckCircle2 className="w-3 h-3 mr-1" />
                                Sem expiração
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleLoginAsUser(user.id, user.name || user.email)}
                          disabled={impersonating === user.id}
                          data-testid={`button-login-as-${user.id}`}
                          title="Entrar nesta conta"
                        >
                          <LogIn className="w-4 h-4" />
                        </Button>
                        <Switch
                          checked={user.isActive}
                          onCheckedChange={() => handleToggleActive(user)}
                          data-testid={`switch-active-${user.id}`}
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => openEditModal(user)}
                          data-testid={`button-edit-${user.id}`}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDeleteUser(user.id)}
                          data-testid={`button-delete-${user.id}`}
                          title="Remover usuário (mantém dados)"
                        >
                          <Trash2 className="w-4 h-4 text-muted-foreground" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => openDeleteCompleteModal(user)}
                          data-testid={`button-delete-complete-${user.id}`}
                          title="Excluir completamente (apaga todos os dados)"
                        >
                          <AlertTriangle className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    {index < regularUsers.length - 1 && <Separator className="my-1" />}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Add User Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Usuário</DialogTitle>
            <DialogDescription>
              Adicione um novo cliente ao sistema
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddUser} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Users className="w-4 h-4" />
                Nome
              </label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Nome do usuário"
                data-testid="input-user-name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Email *
              </label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="email@exemplo.com"
                required
                data-testid="input-user-email"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Key className="w-4 h-4" />
                Senha *
              </label>
              <Input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="Senha inicial"
                required
                data-testid="input-user-password"
              />
            </div>
            {planos.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  Plano
                </label>
                <Select
                  value={formData.planoId}
                  onValueChange={handlePlanoChange}
                >
                  <SelectTrigger data-testid="select-user-plano">
                    <SelectValue placeholder="Selecione um plano (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Configuração manual</SelectItem>
                    {planos.map((plano) => (
                      <SelectItem key={plano.id} value={plano.id}>
                        {plano.nome} - {plano.webinarLimit} webinars, {plano.prazoDias} dias
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Ao selecionar um plano, os limites serão aplicados automaticamente
                </p>
              </div>
            )}
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Play className="w-4 h-4" />
                  Limite de Webinars
                </label>
                <Input
                  type="number"
                  min="1"
                  max="999"
                  value={formData.webinarLimit}
                  onChange={(e) => setFormData({ ...formData, webinarLimit: parseInt(e.target.value) || 5 })}
                  data-testid="input-user-limit"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  Limite de Uploads
                </label>
                <Input
                  type="number"
                  min="1"
                  max="999"
                  value={formData.uploadLimit}
                  onChange={(e) => setFormData({ ...formData, uploadLimit: parseInt(e.target.value) || 5 })}
                  data-testid="input-user-upload-limit"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Acesso Expira Em
              </label>
              <Input
                type="date"
                value={formData.accessExpiresAt}
                onChange={(e) => setFormData({ ...formData, accessExpiresAt: e.target.value })}
                data-testid="input-user-expires"
              />
              <p className="text-xs text-muted-foreground">Deixe em branco para acesso permanente</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAddModal(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving} data-testid="button-save-user">
                {saving ? "Salvando..." : "Criar Usuário"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit User Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Usuário</DialogTitle>
            <DialogDescription>
              Atualize as informações do usuário
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdateUser} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Users className="w-4 h-4" />
                Nome
              </label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Nome do usuário"
                data-testid="input-edit-name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Email
              </label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="email@exemplo.com"
                data-testid="input-edit-email"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Key className="w-4 h-4" />
                Nova Senha (deixe em branco para não alterar)
              </label>
              <Input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="Nova senha"
                data-testid="input-edit-password"
              />
            </div>
            
            {planos.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  Trocar Plano
                </label>
                <Select
                  value={formData.planoId}
                  onValueChange={handlePlanoChange}
                >
                  <SelectTrigger data-testid="select-edit-plano">
                    <SelectValue placeholder="Selecione um plano (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Configuração manual</SelectItem>
                    {planos.map((plano) => (
                      <SelectItem key={plano.id} value={plano.id}>
                        {plano.nome} - {plano.webinarLimit} webinars, {plano.prazoDias} dias
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Ao selecionar um plano, os limites e data de expiração serão aplicados automaticamente
                </p>
              </div>
            )}
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Play className="w-4 h-4" />
                  Limite de Webinars
                </label>
                <Input
                  type="number"
                  min="1"
                  max="999"
                  value={formData.webinarLimit}
                  onChange={(e) => setFormData({ ...formData, webinarLimit: parseInt(e.target.value) || 5 })}
                  data-testid="input-edit-limit"
                />
                {editingUser && (
                  <p className="text-xs text-muted-foreground">
                    Usando {editingUser.webinarCount} de {editingUser.webinarLimit}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  Limite de Uploads
                </label>
                <Input
                  type="number"
                  min="1"
                  max="999"
                  value={formData.uploadLimit}
                  onChange={(e) => setFormData({ ...formData, uploadLimit: parseInt(e.target.value) || 5 })}
                  data-testid="input-edit-upload-limit"
                />
                <p className="text-xs text-muted-foreground">
                  Vídeos permitidos
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Acesso Expira Em
              </label>
              <Input
                type="date"
                value={formData.accessExpiresAt}
                onChange={(e) => setFormData({ ...formData, accessExpiresAt: e.target.value })}
                data-testid="input-edit-expires"
              />
              <p className="text-xs text-muted-foreground">Deixe em branco para acesso permanente</p>
              {editingUser?.accessExpiresAt && (
                <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Expira em {new Date(editingUser.accessExpiresAt).toLocaleDateString("pt-BR")}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowEditModal(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving} data-testid="button-update-user">
                {saving ? "Salvando..." : "Salvar Alterações"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Complete Deletion Confirmation Modal */}
      <Dialog open={showDeleteCompleteModal} onOpenChange={setShowDeleteCompleteModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Excluir Conta Completamente
            </DialogTitle>
            <DialogDescription>
              Esta ação é irreversível e removerá permanentemente:
            </DialogDescription>
          </DialogHeader>
          
          {userToDelete && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30">
                <p className="font-semibold text-destructive mb-2">
                  Usuário: {userToDelete.name || userToDelete.email}
                </p>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <Play className="w-3 h-3" />
                    Todos os webinars ({userToDelete.webinarCount})
                  </li>
                  <li className="flex items-center gap-2">
                    <Package className="w-3 h-3" />
                    Todos os vídeos e arquivos
                  </li>
                  <li className="flex items-center gap-2">
                    <Users className="w-3 h-3" />
                    Todos os comentários e leads
                  </li>
                  <li className="flex items-center gap-2">
                    <Clock className="w-3 h-3" />
                    Todo o histórico e analytics
                  </li>
                </ul>
              </div>
              
              {isExpired(userToDelete.accessExpiresAt) && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <p className="text-sm text-amber-700 dark:text-amber-400 flex items-center gap-2">
                    <XCircle className="w-4 h-4" />
                    {getExpiredDuration(userToDelete.accessExpiresAt)}
                  </p>
                </div>
              )}
              
              <p className="text-sm text-muted-foreground">
                Tem certeza que deseja excluir completamente esta conta e todos os dados associados?
              </p>
            </div>
          )}
          
          <DialogFooter className="gap-2">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => {
                setShowDeleteCompleteModal(false);
                setUserToDelete(null);
              }}
              disabled={deletingComplete}
            >
              Cancelar
            </Button>
            <Button 
              type="button" 
              variant="destructive" 
              onClick={handleDeleteComplete}
              disabled={deletingComplete}
              data-testid="button-confirm-delete-complete"
            >
              {deletingComplete ? "Excluindo..." : "Excluir Permanentemente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
