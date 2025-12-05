import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  Upload, 
  Trash2, 
  Film, 
  Calendar, 
  HardDrive,
  Link2,
  AlertCircle,
  Play,
  Search,
  RefreshCw,
  Pencil,
  Check,
  X,
  Code,
  Copy,
  Image,
  Camera
} from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogDescription,
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

interface VideoWithWebinar {
  id: string;
  uploadedVideoId: string;
  filename: string;
  title: string;
  duration: number;
  fileSize: number | null;
  uploadedAt: string;
  hlsStatus: string;
  linkedWebinars: {
    id: string;
    title: string;
    slug: string;
  }[];
}

interface StorageInfo {
  usedBytes: number;
  usedGB: number;
  limitGB: number;
  percentUsed: number;
  videoCount: number;
}

interface EmbedConfig {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  playerColor: string;
  showTime: boolean;
}

export default function AdminVideosPage() {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState("Enviando...");
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteVideoId, setDeleteVideoId] = useState<string | null>(null);
  const [editingVideoId, setEditingVideoId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  
  const [embedModalOpen, setEmbedModalOpen] = useState(false);
  const [embedConfig, setEmbedConfig] = useState<EmbedConfig | null>(null);
  const [uploadingThumbnail, setUploadingThumbnail] = useState(false);
  const [capturingFrame, setCapturingFrame] = useState(false);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const token = localStorage.getItem("adminToken");

  const { data: videos = [], isLoading: loadingVideos, refetch: refetchVideos } = useQuery<VideoWithWebinar[]>({
    queryKey: ["/api/admin/videos-with-webinars"],
  });

  const { data: storageInfo, isLoading: loadingStorage, refetch: refetchStorage } = useQuery<StorageInfo>({
    queryKey: ["/api/admin/storage-info"],
  });

  const deleteVideoMutation = useMutation({
    mutationFn: async (videoId: string) => {
      await apiRequest("DELETE", `/api/webinar/videos/${videoId}`);
    },
    onSuccess: () => {
      toast({ title: "Vídeo excluído com sucesso!" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/videos-with-webinars"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/storage-info"] });
      queryClient.invalidateQueries({ queryKey: ["/api/webinar/videos"] });
      setDeleteVideoId(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao excluir",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const renameVideoMutation = useMutation({
    mutationFn: async ({ videoId, title }: { videoId: string; title: string }) => {
      await apiRequest("PATCH", `/api/webinar/videos/${videoId}/title`, { title });
    },
    onSuccess: () => {
      toast({ title: "Título atualizado!" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/videos-with-webinars"] });
      queryClient.invalidateQueries({ queryKey: ["/api/webinar/videos"] });
      setEditingVideoId(null);
      setEditingTitle("");
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao renomear",
        description: error.message,
        variant: "destructive",
      });
    },
  });

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

    if (storageInfo && storageInfo.percentUsed >= 100) {
      toast({
        title: "Limite de armazenamento atingido",
        description: "Exclua alguns vídeos ou faça upgrade do seu plano.",
        variant: "destructive",
      });
      e.target.value = "";
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setUploadStatus("Detectando duração...");

    const duration = await getVideoDuration(file);

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

      xhr.onload = async () => {
        if (xhr.status === 200) {
          toast({ title: "Vídeo enviado com sucesso!" });
          // Invalidar cache e forçar refetch para atualizar lista
          await queryClient.invalidateQueries({ queryKey: ["/api/admin/videos-with-webinars"] });
          await queryClient.invalidateQueries({ queryKey: ["/api/admin/storage-info"] });
          await queryClient.invalidateQueries({ queryKey: ["/api/webinar/videos"] });
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
        e.target.value = "";
      };

      xhr.onerror = () => {
        toast({ title: "Erro", description: "Falha na conexão", variant: "destructive" });
        setUploading(false);
        setUploadProgress(0);
        e.target.value = "";
      };

      xhr.ontimeout = () => {
        toast({ title: "Erro", description: "Tempo limite excedido", variant: "destructive" });
        setUploading(false);
        setUploadProgress(0);
        e.target.value = "";
      };

      xhr.open("POST", "/api/webinar/upload-video");
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.timeout = 600000;
      xhr.send(formData);
    } catch (error) {
      toast({ title: "Erro", description: "Falha ao enviar", variant: "destructive" });
      setUploading(false);
      e.target.value = "";
    }
  }

  function formatBytes(bytes: number | null): string {
    if (bytes === null || bytes === undefined) return "—";
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  function formatDuration(seconds: number): string {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs}h ${mins}m ${secs}s`;
    }
    return `${mins}m ${secs}s`;
  }

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function startEditing(video: VideoWithWebinar) {
    setEditingVideoId(video.uploadedVideoId);
    setEditingTitle(video.title);
  }

  function cancelEditing() {
    setEditingVideoId(null);
    setEditingTitle("");
  }

  function handleRename() {
    if (!editingTitle.trim() || !editingVideoId) return;
    renameVideoMutation.mutate({ videoId: editingVideoId, title: editingTitle });
  }

  async function openEmbedModal(video: VideoWithWebinar) {
    setEmbedModalOpen(true);
    
    // Carregar configurações existentes do vídeo
    try {
      const response = await fetch(`/api/embed/video/${video.uploadedVideoId}/config`);
      if (response.ok) {
        const data = await response.json();
        setEmbedConfig({
          videoId: video.uploadedVideoId,
          title: video.title,
          thumbnailUrl: data.thumbnailUrl || "",
          playerColor: data.playerColor || "#8B5CF6",
          showTime: data.showTime !== false,
        });
      } else {
        // Valores padrão se não encontrar config
        setEmbedConfig({
          videoId: video.uploadedVideoId,
          title: video.title,
          thumbnailUrl: "",
          playerColor: "#8B5CF6",
          showTime: true,
        });
      }
    } catch {
      setEmbedConfig({
        videoId: video.uploadedVideoId,
        title: video.title,
        thumbnailUrl: "",
        playerColor: "#8B5CF6",
        showTime: true,
      });
    }
  }

  async function saveEmbedConfig() {
    if (!embedConfig) return;
    try {
      await apiRequest("PATCH", `/api/webinar/videos/${embedConfig.videoId}/embed-config`, {
        thumbnailUrl: embedConfig.thumbnailUrl || null,
        playerColor: embedConfig.playerColor,
        showTime: embedConfig.showTime,
      });
      toast({ title: "Configurações salvas!" });
      setEmbedModalOpen(false);
      // Invalidar queries relacionadas
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/videos-with-webinars"] });
    } catch (error: any) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    }
  }

  async function handleThumbnailUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !embedConfig) return;
    
    setUploadingThumbnail(true);
    const formData = new FormData();
    formData.append("thumbnail", file);

    try {
      const response = await fetch(`/api/webinar/videos/${embedConfig.videoId}/thumbnail`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await response.json();
      if (data.thumbnailUrl) {
        setEmbedConfig(prev => prev ? { ...prev, thumbnailUrl: data.thumbnailUrl } : null);
        toast({ title: "Thumbnail atualizada!" });
      }
    } catch (error: any) {
      toast({ title: "Erro ao enviar thumbnail", description: error.message, variant: "destructive" });
    } finally {
      setUploadingThumbnail(false);
      e.target.value = "";
    }
  }

  async function captureVideoFrame() {
    if (!videoPreviewRef.current || !canvasRef.current || !embedConfig) return;
    
    setCapturingFrame(true);
    const video = videoPreviewRef.current;
    const canvas = canvasRef.current;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    canvas.toBlob(async (blob) => {
      if (!blob) {
        setCapturingFrame(false);
        return;
      }
      
      const formData = new FormData();
      formData.append("thumbnail", blob, "thumbnail.jpg");

      try {
        const response = await fetch(`/api/webinar/videos/${embedConfig.videoId}/thumbnail`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        const data = await response.json();
        if (data.thumbnailUrl) {
          setEmbedConfig(prev => prev ? { ...prev, thumbnailUrl: data.thumbnailUrl } : null);
          toast({ title: "Frame capturado como thumbnail!" });
        }
      } catch (error: any) {
        toast({ title: "Erro ao capturar frame", description: error.message, variant: "destructive" });
      } finally {
        setCapturingFrame(false);
      }
    }, "image/jpeg", 0.9);
  }

  function getEmbedCode() {
    if (!embedConfig) return "";
    const baseUrl = window.location.origin;
    return `<iframe src="${baseUrl}/embed/video/${embedConfig.videoId}" width="100%" height="450" frameborder="0" allowfullscreen></iframe>`;
  }

  function copyEmbedCode() {
    navigator.clipboard.writeText(getEmbedCode());
    toast({ title: "Código copiado!" });
  }

  const filteredVideos = videos.filter((video) =>
    video.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    video.filename.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Biblioteca de Vídeos</h1>
          <p className="text-muted-foreground">Gerencie todos os seus vídeos em um só lugar</p>
        </div>

        <label>
          <input
            type="file"
            accept="video/*"
            className="hidden"
            onChange={handleUpload}
            disabled={uploading}
            data-testid="input-video-upload"
          />
          <Button 
            asChild 
            disabled={uploading || (storageInfo && storageInfo.percentUsed >= 100)}
            className="cursor-pointer"
            data-testid="button-upload-video"
          >
            <span>
              <Upload className="w-4 h-4 mr-2" />
              {uploading ? `${uploadProgress}%` : "Enviar Vídeo"}
            </span>
          </Button>
        </label>
      </div>

      {uploading && (
        <Card>
          <CardContent className="py-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>{uploadStatus}</span>
                <span>{uploadProgress}%</span>
              </div>
              <Progress value={uploadProgress} />
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="w-5 h-5" />
            Uso de Armazenamento
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingStorage ? (
            <div className="h-12 flex items-center justify-center">
              <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : storageInfo ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <Film className="w-4 h-4 text-muted-foreground" />
                  {storageInfo.videoCount} vídeo{storageInfo.videoCount !== 1 ? "s" : ""}
                </span>
                <span className={storageInfo.percentUsed >= 90 ? "text-destructive font-medium" : ""}>
                  {storageInfo.usedGB.toFixed(2)} GB / {storageInfo.limitGB} GB
                </span>
              </div>
              <Progress 
                value={Math.min(storageInfo.percentUsed, 100)} 
                className={storageInfo.percentUsed >= 90 ? "[&>div]:bg-destructive" : ""}
              />
              {storageInfo.percentUsed >= 90 && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="w-4 h-4" />
                  {storageInfo.percentUsed >= 100 
                    ? "Limite atingido! Exclua vídeos ou faça upgrade."
                    : "Quase no limite! Considere fazer upgrade."}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Informações não disponíveis</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Todos os Vídeos</CardTitle>
              <CardDescription>
                {filteredVideos.length} vídeo{filteredVideos.length !== 1 ? "s" : ""} encontrado{filteredVideos.length !== 1 ? "s" : ""}
              </CardDescription>
            </div>
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar vídeos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
                data-testid="input-search-videos"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingVideos ? (
            <div className="h-32 flex items-center justify-center">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredVideos.length === 0 ? (
            <div className="h-32 flex flex-col items-center justify-center text-muted-foreground">
              <Film className="w-10 h-10 mb-2" />
              <p>{searchTerm ? "Nenhum vídeo encontrado" : "Nenhum vídeo enviado ainda"}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vídeo</TableHead>
                    <TableHead>Data de Upload</TableHead>
                    <TableHead>Tamanho</TableHead>
                    <TableHead>Duração</TableHead>
                    <TableHead>Webinários Vinculados</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredVideos.map((video) => (
                    <TableRow key={video.id} data-testid={`row-video-${video.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
                            <Play className="w-4 h-4 text-muted-foreground" />
                          </div>
                          <div className="min-w-0">
                            {editingVideoId === video.uploadedVideoId ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  value={editingTitle}
                                  onChange={(e) => setEditingTitle(e.target.value)}
                                  className="h-8 text-sm w-40"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") handleRename();
                                    if (e.key === "Escape") cancelEditing();
                                  }}
                                  data-testid={`input-rename-video-${video.id}`}
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={handleRename}
                                  disabled={renameVideoMutation.isPending}
                                  data-testid={`button-save-rename-${video.id}`}
                                >
                                  <Check className="w-4 h-4 text-green-500" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={cancelEditing}
                                  data-testid={`button-cancel-rename-${video.id}`}
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              </div>
                            ) : (
                              <p className="font-medium truncate max-w-[200px]" title={video.title}>
                                {video.title}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="w-4 h-4 text-muted-foreground" />
                          {formatDate(video.uploadedAt)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-sm">
                          <HardDrive className="w-4 h-4 text-muted-foreground" />
                          {formatBytes(video.fileSize)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{formatDuration(video.duration)}</span>
                      </TableCell>
                      <TableCell>
                        {video.linkedWebinars.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {video.linkedWebinars.map((webinar) => (
                              <Badge 
                                key={webinar.id} 
                                variant="secondary" 
                                className="text-xs"
                                title={webinar.title || "Sem título"}
                              >
                                <Link2 className="w-3 h-3 mr-1" />
                                {(webinar.title || "Sem título").length > 15 
                                  ? (webinar.title || "Sem título").substring(0, 15) + "..." 
                                  : (webinar.title || "Sem título")}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">Nenhum</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEmbedModal(video)}
                            title="Código Embed"
                            data-testid={`button-embed-video-${video.id}`}
                          >
                            <Code className="w-4 h-4" />
                          </Button>
                          {editingVideoId !== video.uploadedVideoId && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => startEditing(video)}
                              title="Renomear vídeo"
                              data-testid={`button-rename-video-${video.id}`}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteVideoId(video.uploadedVideoId)}
                            disabled={video.linkedWebinars.length > 0}
                            title={video.linkedWebinars.length > 0 
                              ? "Desvincule dos webinários antes de excluir" 
                              : "Excluir vídeo"}
                            data-testid={`button-delete-video-${video.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteVideoId} onOpenChange={() => setDeleteVideoId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir vídeo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O vídeo será removido permanentemente do seu armazenamento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteVideoId && deleteVideoMutation.mutate(deleteVideoId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteVideoMutation.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={embedModalOpen} onOpenChange={setEmbedModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Código Embed do Vídeo</DialogTitle>
            <DialogDescription>
              Configure e copie o código para incorporar o vídeo em sites externos
            </DialogDescription>
          </DialogHeader>

          {embedConfig && (
            <div className="space-y-6">
              <Tabs defaultValue="config">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="config">Configurações</TabsTrigger>
                  <TabsTrigger value="code">Código</TabsTrigger>
                </TabsList>

                <TabsContent value="config" className="space-y-4 mt-4">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Cor do Player</Label>
                      <div className="flex items-center gap-3">
                        <input
                          type="color"
                          value={embedConfig.playerColor}
                          onChange={(e) => setEmbedConfig(prev => prev ? { ...prev, playerColor: e.target.value } : null)}
                          className="w-12 h-10 rounded cursor-pointer border"
                          data-testid="input-player-color"
                        />
                        <Input
                          value={embedConfig.playerColor}
                          onChange={(e) => setEmbedConfig(prev => prev ? { ...prev, playerColor: e.target.value } : null)}
                          className="w-28"
                          data-testid="input-player-color-hex"
                        />
                        <div className="flex gap-2">
                          {["#8B5CF6", "#EF4444", "#22C55E", "#3B82F6", "#F59E0B"].map(color => (
                            <button
                              key={color}
                              className="w-8 h-8 rounded-full border-2 border-transparent hover:border-white/50 transition-colors"
                              style={{ backgroundColor: color }}
                              onClick={() => setEmbedConfig(prev => prev ? { ...prev, playerColor: color } : null)}
                            />
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label>Mostrar Tempo/Controles</Label>
                        <p className="text-sm text-muted-foreground">Exibe a barra de progresso e tempo no player</p>
                      </div>
                      <Switch
                        checked={embedConfig.showTime}
                        onCheckedChange={(checked) => setEmbedConfig(prev => prev ? { ...prev, showTime: checked } : null)}
                        data-testid="switch-show-time"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Miniatura (Thumbnail)</Label>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block">
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={handleThumbnailUpload}
                              disabled={uploadingThumbnail}
                              data-testid="input-thumbnail-upload"
                            />
                            <Button variant="outline" className="w-full" asChild disabled={uploadingThumbnail}>
                              <span className="cursor-pointer">
                                <Image className="w-4 h-4 mr-2" />
                                {uploadingThumbnail ? "Enviando..." : "Enviar Imagem"}
                              </span>
                            </Button>
                          </label>
                        </div>
                        <Button
                          variant="outline"
                          onClick={captureVideoFrame}
                          disabled={capturingFrame}
                          data-testid="button-capture-frame"
                        >
                          <Camera className="w-4 h-4 mr-2" />
                          {capturingFrame ? "Capturando..." : "Capturar Frame"}
                        </Button>
                      </div>
                      {embedConfig.thumbnailUrl && (
                        <div className="mt-2 relative">
                          <img 
                            src={embedConfig.thumbnailUrl} 
                            alt="Thumbnail" 
                            className="w-full h-32 object-cover rounded border"
                          />
                          <Button
                            variant="destructive"
                            size="icon"
                            className="absolute top-2 right-2"
                            onClick={() => setEmbedConfig(prev => prev ? { ...prev, thumbnailUrl: "" } : null)}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label>Preview do Vídeo (para captura de frame)</Label>
                      <div className="relative bg-black rounded overflow-hidden">
                        <video
                          ref={videoPreviewRef}
                          src={`/api/webinar/video/${embedConfig.videoId}`}
                          className="w-full h-48 object-contain"
                          controls
                          data-testid="video-preview"
                        />
                        <canvas ref={canvasRef} className="hidden" />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Navegue até o momento desejado e clique em "Capturar Frame"
                      </p>
                    </div>

                    <Button onClick={saveEmbedConfig} className="w-full" data-testid="button-save-config">
                      Salvar Configurações
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="code" className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label>Código Iframe</Label>
                    <div className="relative">
                      <textarea
                        readOnly
                        value={getEmbedCode()}
                        className="w-full h-24 p-3 text-sm bg-muted rounded border font-mono resize-none"
                        data-testid="textarea-embed-code"
                      />
                      <Button
                        size="sm"
                        className="absolute top-2 right-2"
                        onClick={copyEmbedCode}
                        data-testid="button-copy-embed"
                      >
                        <Copy className="w-4 h-4 mr-1" />
                        Copiar
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Preview</Label>
                    <div className="border rounded p-4 bg-muted/50">
                      <div 
                        className="w-full aspect-video bg-black rounded overflow-hidden flex items-center justify-center"
                        style={{ maxHeight: "300px" }}
                      >
                        <div className="text-center text-white">
                          <div 
                            className="w-16 h-16 rounded-full mx-auto mb-2 flex items-center justify-center"
                            style={{ backgroundColor: embedConfig.playerColor }}
                          >
                            <Play className="w-8 h-8 text-white ml-1" />
                          </div>
                          <p className="text-sm opacity-70">{embedConfig.title}</p>
                          {embedConfig.showTime && (
                            <p className="text-xs opacity-50 mt-1">00:00 / --:--</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="text-sm text-muted-foreground">
                    <p className="font-medium mb-1">Como usar:</p>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Copie o código acima</li>
                      <li>Cole no HTML do seu site onde deseja exibir o vídeo</li>
                      <li>Ajuste width e height conforme necessário</li>
                    </ol>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
