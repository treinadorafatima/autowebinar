import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  Upload, 
  Trash2, 
  Check, 
  Video, 
  BarChart3, 
  Edit, 
  Play, 
  ArrowRight,
  Clock,
  Plus,
  FileVideo,
  User
} from "lucide-react";

interface UploadedVideo {
  id: string;
  uploadedVideoId: string;
  filename: string;
  title?: string;
  duration: number;
  uploadedAt: string;
}

interface Webinar {
  id: string;
  name: string;
  slug: string;
  views?: number;
}

function StatCard({ 
  icon: Icon, 
  value, 
  label,
  color = "blue"
}: { 
  icon: any; 
  value: string | number; 
  label: string;
  color?: "blue" | "purple" | "orange";
}) {
  const gradientMap = {
    blue: "from-blue-500 to-cyan-500",
    purple: "from-purple-500 to-pink-500",
    orange: "from-orange-500 to-amber-500"
  };
  
  return (
    <Card className="group hover-elevate overflow-hidden border shadow-sm">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className={`flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-gradient-to-br ${gradientMap[color]} shadow-md transform group-hover:scale-105 transition-transform duration-200`}>
            <Icon className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-2xl sm:text-3xl font-bold tracking-tight">{value}</p>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 truncate">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [videos, setVideos] = useState<UploadedVideo[]>([]);
  const [webinars, setWebinars] = useState<Webinar[]>([]);
  const [renamingVideoId, setRenamingVideoId] = useState<string | null>(null);
  const [renamingTitle, setRenamingTitle] = useState("");
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileData, setProfileData] = useState({ name: "", email: "" });
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileFormData, setProfileFormData] = useState({ name: "", newEmail: "", currentPassword: "", newPassword: "", confirmPassword: "" });
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const token = localStorage.getItem("adminToken");

  useEffect(() => {
    if (!token) {
      setLocation("/login");
      return;
    }
    fetchData();
    fetchProfile();
  }, []);

  async function fetchProfile() {
    try {
      const res = await fetch("/api/admin/profile", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setProfileData(data);
        setProfileFormData(prev => ({ ...prev, name: data.name, newEmail: "" }));
      }
    } catch (err) {
      console.error("Erro ao carregar perfil:", err);
    }
  }

  async function handleProfileUpdate() {
    if (!profileFormData.name.trim()) {
      toast({ title: "Nome não pode estar vazio", variant: "destructive" });
      return;
    }

    if (profileFormData.newEmail && !profileFormData.newEmail.includes("@")) {
      toast({ title: "Email inválido", variant: "destructive" });
      return;
    }

    if (profileFormData.newPassword && profileFormData.newPassword !== profileFormData.confirmPassword) {
      toast({ title: "Senhas não coincidem", variant: "destructive" });
      return;
    }

    setProfileLoading(true);
    try {
      const res = await fetch("/api/admin/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          name: profileFormData.name,
          newEmail: profileFormData.newEmail || undefined,
          currentPassword: profileFormData.currentPassword || undefined,
          newPassword: profileFormData.newPassword || undefined
        })
      });

      if (res.ok) {
        toast({ title: "Perfil atualizado com sucesso!" });
        setShowProfileModal(false);
        if (profileFormData.newEmail) {
          localStorage.removeItem("adminToken");
          setLocation("/login");
        }
        fetchProfile();
      } else {
        const error = await res.json();
        toast({ title: error.error || "Erro ao atualizar perfil", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Erro ao atualizar perfil", variant: "destructive" });
    } finally {
      setProfileLoading(false);
    }
  }

  async function fetchData() {
    setLoading(true);
    try {
      await Promise.all([fetchVideos(), fetchWebinars()]);
    } finally {
      setLoading(false);
    }
  }

  async function fetchVideos() {
    try {
      const res = await fetch("/api/webinar/videos", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setVideos(data || []);
      }
    } catch (error) {
      console.error("Erro ao carregar vídeos:", error);
    }
  }

  async function fetchWebinars() {
    try {
      const res = await fetch("/api/webinars", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setWebinars(data || []);
      }
    } catch (error) {
      console.error("Erro ao carregar webinários:", error);
    }
  }

  const [uploadStatus, setUploadStatus] = useState<string>("Enviando...");

  function getVideoDuration(file: File): Promise<number> {
    return new Promise((resolve) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(video.src);
        resolve(Math.round(video.duration) || 0);
      };
      video.onerror = () => {
        URL.revokeObjectURL(video.src);
        resolve(0);
      };
      video.src = URL.createObjectURL(file);
    });
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadProgress(0);
    setUploadStatus("Detectando duração...");

    const duration = await getVideoDuration(file);
    console.log(`[upload] Duração detectada: ${duration}s`);

    const formData = new FormData();
    formData.append("video", file);
    formData.append("duration", duration.toString());

    setUploadStatus("Enviando...");

    try {
      const xhr = new XMLHttpRequest();
      
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(percent);
          if (percent === 100) {
            setUploadStatus("Salvando no servidor...");
          }
        }
      });

      xhr.onload = () => {
        if (xhr.status === 200) {
          toast({ title: "Vídeo enviado com sucesso!" });
          fetchVideos();
        } else {
          let errorMsg = "Falha ao enviar";
          try {
            const response = JSON.parse(xhr.responseText);
            errorMsg = response.error || errorMsg;
          } catch {}
          toast({
            title: "Erro",
            description: errorMsg,
            variant: "destructive",
          });
        }
        setUploading(false);
        setUploadProgress(0);
        setUploadStatus("Enviando...");
        // Reset file input
        e.target.value = "";
      };

      xhr.onerror = () => {
        toast({ title: "Erro", description: "Falha na conexão", variant: "destructive" });
        setUploading(false);
        setUploadProgress(0);
        setUploadStatus("Enviando...");
        e.target.value = "";
      };

      xhr.ontimeout = () => {
        toast({ title: "Erro", description: "Tempo limite excedido", variant: "destructive" });
        setUploading(false);
        setUploadProgress(0);
        setUploadStatus("Enviando...");
        e.target.value = "";
      };

      xhr.open("POST", "/api/webinar/upload-video");
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.timeout = 600000; // 10 minutes timeout
      xhr.send(formData);
    } catch (error) {
      toast({ title: "Erro", description: "Falha ao enviar", variant: "destructive" });
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleDeleteVideo(videoId: string) {
    if (!confirm("Tem certeza que deseja excluir este vídeo?")) return;

    try {
      const res = await fetch(`/api/webinar/videos/${videoId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast({ title: "Vídeo excluído!" });
        fetchVideos();
      } else {
        throw new Error("Erro ao excluir");
      }
    } catch (error) {
      toast({ title: "Erro ao excluir vídeo", variant: "destructive" });
    }
  }

  async function handleRenameVideo(videoId: string) {
    if (!renamingTitle.trim()) {
      toast({ title: "Digite um título", variant: "destructive" });
      return;
    }

    try {
      const res = await fetch(`/api/webinar/videos/${videoId}/title`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title: renamingTitle }),
      });
      
      if (res.ok) {
        toast({ title: "Título atualizado!" });
        setRenamingVideoId(null);
        setRenamingTitle("");
        fetchVideos();
      } else {
        throw new Error("Erro ao renomear");
      }
    } catch (error) {
      toast({ title: "Erro ao renomear", variant: "destructive" });
    }
  }

  function formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
      return `${h}h ${m}min ${s}s`;
    }
    return `${m}min ${s}s`;
  }

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <Skeleton className="w-12 h-12 rounded-lg" />
                  <div className="space-y-2">
                    <Skeleton className="h-8 w-16" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalViews = webinars.reduce((sum, w) => sum + (w.views || 0), 0);

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      {/* Header com Perfil */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-bold">Painel Admin</h1>
          <p className="text-muted-foreground">Bem-vindo, {profileData.name}!</p>
        </div>
        <Button
          variant="default"
          size="default"
          onClick={() => setShowProfileModal(true)}
          data-testid="button-edit-profile"
          className="gap-2 shrink-0"
        >
          <User className="w-4 h-4" />
          Editar Perfil
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <StatCard icon={Play} value={webinars.length} label="Webinários Ativos" color="blue" />
        <StatCard icon={FileVideo} value={videos.length} label="Vídeos na Biblioteca" color="purple" />
        <StatCard icon={BarChart3} value={totalViews.toLocaleString()} label="Visualizações Totais" color="orange" />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Webinars Section */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
            <div>
              <CardTitle className="text-lg">Webinários</CardTitle>
              <CardDescription>Gerencie seus webinários</CardDescription>
            </div>
            <Link href="/admin/webinars">
              <Button variant="outline" size="sm" data-testid="button-manage-webinars">
                Ver todos
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {webinars.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-blue-100 to-cyan-100 dark:from-blue-900/30 dark:to-cyan-900/30 mb-4">
                  <Play className="w-8 h-8 text-blue-500" />
                </div>
                <h3 className="font-semibold mb-1">Nenhum webinário ainda</h3>
                <p className="text-sm text-muted-foreground mb-4 max-w-[200px]">Crie seu primeiro webinário para começar a transmitir</p>
                <Link href="/admin/webinars?new=1">
                  <Button size="sm" data-testid="button-create-webinar">
                    <Plus className="w-4 h-4 mr-2" />
                    Criar Webinário
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-1">
                {webinars.slice(0, 5).map((webinar, index) => (
                  <div key={webinar.id}>
                    <div 
                      className="flex items-center justify-between p-3 rounded-md hover-elevate cursor-pointer"
                      onClick={() => setLocation(`/admin/webinars/${webinar.id}`)}
                      data-testid={`webinar-item-${webinar.id}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex items-center justify-center w-8 h-8 rounded bg-secondary flex-shrink-0">
                          <Play className="w-4 h-4 text-secondary-foreground" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{webinar.name}</p>
                          <p className="text-xs text-muted-foreground">/{webinar.slug}</p>
                        </div>
                      </div>
                      <Button size="icon" variant="ghost">
                        <Edit className="w-4 h-4" />
                      </Button>
                    </div>
                    {index < webinars.slice(0, 5).length - 1 && <Separator className="my-1" />}
                  </div>
                ))}
                {webinars.length > 5 && (
                  <div className="pt-2 text-center">
                    <Link href="/admin/webinars">
                      <Button variant="ghost" size="sm" className="text-primary">
                        Ver todos ({webinars.length})
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Videos Section */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
            <div>
              <CardTitle className="text-lg">Biblioteca de Vídeos</CardTitle>
              <CardDescription>Vídeos disponíveis para webinários</CardDescription>
            </div>
            <label>
              <input
                type="file"
                accept="video/*"
                className="hidden"
                onChange={handleUpload}
                disabled={uploading}
              />
              <Button 
                asChild 
                size="sm"
                disabled={uploading}
                className="cursor-pointer"
                data-testid="button-upload-video"
              >
                <span>
                  <Upload className="w-4 h-4 mr-2" />
                  {uploading ? `${uploadProgress}%` : "Enviar"}
                </span>
              </Button>
            </label>
          </CardHeader>
          <CardContent>
            {uploading && (
              <div className="mb-4">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                  <span>{uploadStatus}</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${uploadProgress === 100 ? 'bg-green-500 animate-pulse' : 'bg-primary'}`}
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {videos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 mb-4">
                  <Video className="w-8 h-8 text-purple-500" />
                </div>
                <h3 className="font-semibold mb-1">Biblioteca vazia</h3>
                <p className="text-sm text-muted-foreground max-w-[200px]">Envie vídeos para usar em seus webinários</p>
              </div>
            ) : (
              <ScrollArea className="h-[280px]">
                <div className="space-y-1">
                  {videos.map((video, index) => (
                    <div key={video.id}>
                      <div 
                        className="flex items-center justify-between p-3 rounded-md"
                        data-testid={`video-item-${video.id}`}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="flex items-center justify-center w-8 h-8 rounded bg-secondary flex-shrink-0">
                            <FileVideo className="w-4 h-4 text-secondary-foreground" />
                          </div>
                          {renamingVideoId === video.uploadedVideoId ? (
                            <div className="flex gap-2 flex-1">
                              <Input
                                value={renamingTitle}
                                onChange={(e) => setRenamingTitle(e.target.value)}
                                placeholder="Novo título"
                                className="flex-1"
                                autoFocus
                                data-testid="input-rename-video"
                              />
                              <Button
                                size="icon"
                                onClick={() => handleRenameVideo(video.uploadedVideoId)}
                                data-testid="button-confirm-rename"
                              >
                                <Check className="w-4 h-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => {
                                  setRenamingVideoId(null);
                                  setRenamingTitle("");
                                }}
                              >
                                ×
                              </Button>
                            </div>
                          ) : (
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate text-sm">{video.title || video.filename}</p>
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="w-3 h-3" />
                                {formatDuration(video.duration)}
                              </div>
                            </div>
                          )}
                        </div>
                        {renamingVideoId !== video.uploadedVideoId && (
                          <div className="flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                setRenamingVideoId(video.uploadedVideoId);
                                setRenamingTitle(video.title || video.filename);
                              }}
                              data-testid={`button-rename-${video.id}`}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleDeleteVideo(video.uploadedVideoId)}
                              data-testid={`button-delete-${video.id}`}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        )}
                      </div>
                      {index < videos.length - 1 && <Separator className="my-1" />}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modal de Editar Perfil */}
      <Dialog open={showProfileModal} onOpenChange={setShowProfileModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Perfil</DialogTitle>
            <DialogDescription>
              Atualize suas informações de perfil
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Nome */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Nome</label>
              <Input
                type="text"
                value={profileFormData.name}
                onChange={(e) => setProfileFormData({ ...profileFormData, name: e.target.value })}
                placeholder="Seu nome"
                data-testid="input-profile-name"
              />
            </div>

            {/* Email */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Email (deixe em branco para não alterar)</label>
              <Input
                type="email"
                value={profileFormData.newEmail}
                onChange={(e) => setProfileFormData({ ...profileFormData, newEmail: e.target.value })}
                placeholder="novo@email.com"
                data-testid="input-profile-email"
              />
            </div>

            {/* Nova Senha */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Nova Senha (deixe em branco para não alterar)</label>
              <Input
                type="password"
                value={profileFormData.newPassword}
                onChange={(e) => setProfileFormData({ ...profileFormData, newPassword: e.target.value })}
                placeholder="Nova senha"
                data-testid="input-profile-password"
              />
            </div>

            {/* Confirmar Senha */}
            {profileFormData.newPassword && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Confirmar Senha</label>
                <Input
                  type="password"
                  value={profileFormData.confirmPassword}
                  onChange={(e) => setProfileFormData({ ...profileFormData, confirmPassword: e.target.value })}
                  placeholder="Confirme a senha"
                  data-testid="input-profile-confirm-password"
                />
              </div>
            )}

            {/* Senha Atual (requerida se mudando email/senha) */}
            {(profileFormData.newEmail || profileFormData.newPassword) && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-red-500">Senha Atual (requerida)*</label>
                <Input
                  type="password"
                  value={profileFormData.currentPassword}
                  onChange={(e) => setProfileFormData({ ...profileFormData, currentPassword: e.target.value })}
                  placeholder="Sua senha atual"
                  data-testid="input-profile-current-password"
                />
              </div>
            )}

            {/* Botões */}
            <div className="flex gap-2 justify-end pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setShowProfileModal(false);
                  setProfileFormData({ name: profileData.name, newEmail: "", currentPassword: "", newPassword: "", confirmPassword: "" });
                }}
                data-testid="button-cancel-profile"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleProfileUpdate}
                disabled={profileLoading}
                data-testid="button-save-profile"
              >
                {profileLoading ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
