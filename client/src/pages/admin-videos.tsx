import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
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
  X
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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

export default function AdminVideosPage() {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState("Enviando...");
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteVideoId, setDeleteVideoId] = useState<string | null>(null);
  const [editingVideoId, setEditingVideoId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

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
                              <>
                                <p className="font-medium truncate max-w-[200px]" title={video.title}>
                                  {video.title}
                                </p>
                                <p className="text-xs text-muted-foreground truncate max-w-[200px]" title={video.filename}>
                                  {video.filename}
                                </p>
                              </>
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
    </div>
  );
}
