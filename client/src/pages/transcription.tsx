import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Mic, 
  Video, 
  Loader2, 
  Clock,
  FileText,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Copy,
  Download,
  Save,
  BookOpen
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface UploadedVideo {
  id: string;
  uploadedVideoId: string;
  filename: string;
  title?: string;
  duration: number;
  ownerId: string;
}

interface Webinar {
  id: string;
  name: string;
  uploadedVideoId: string | null;
}

interface Transcription {
  id: string;
  uploadedVideoId: string;
  webinarId: string | null;
  status: string;
  transcription: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}h ${m}min`;
  }
  return `${m}min ${s}s`;
}

export default function TranscriptionPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const token = localStorage.getItem("adminToken");
  
  const [loading, setLoading] = useState(true);
  const [videos, setVideos] = useState<UploadedVideo[]>([]);
  const [webinars, setWebinars] = useState<Webinar[]>([]);
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([]);
  
  const [selectedVideoId, setSelectedVideoId] = useState<string>("");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [pollingVideoId, setPollingVideoId] = useState<string | null>(null);
  
  const [saveScriptDialogOpen, setSaveScriptDialogOpen] = useState(false);
  const [scriptTitle, setScriptTitle] = useState("");
  const [savingScript, setSavingScript] = useState(false);

  useEffect(() => {
    if (!token) {
      setLocation("/login");
      return;
    }
    fetchData();
  }, [token]);

  useEffect(() => {
    if (pollingVideoId) {
      const interval = setInterval(() => {
        checkTranscriptionStatus(pollingVideoId);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [pollingVideoId]);

  async function fetchData() {
    setLoading(true);
    try {
      const [videosRes, webinarsRes] = await Promise.all([
        fetch("/api/webinar/videos", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/webinars", { headers: { Authorization: `Bearer ${token}` } })
      ]);
      
      if (videosRes.ok) {
        const videosData = await videosRes.json();
        setVideos(videosData || []);
        
        // Fetch transcriptions for each video
        const transcriptionsPromises = videosData.map(async (v: UploadedVideo) => {
          try {
            const res = await fetch(`/api/videos/${v.uploadedVideoId}/transcription`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
              const data = await res.json();
              return data;
            }
          } catch {
            return null;
          }
          return null;
        });
        
        const transcriptionsData = await Promise.all(transcriptionsPromises);
        const validTranscriptions = transcriptionsData.filter(Boolean);
        setTranscriptions(validTranscriptions);
        
        // Retomar polling se houver transcrição em progresso
        const processingTranscription = validTranscriptions.find((t: Transcription) => t.status === "processing");
        if (processingTranscription && !pollingVideoId) {
          setPollingVideoId(processingTranscription.uploadedVideoId);
        }
      }
      
      if (webinarsRes.ok) {
        const webinarsData = await webinarsRes.json();
        setWebinars(webinarsData || []);
      }
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
      toast({ title: "Erro ao carregar dados", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function checkTranscriptionStatus(videoId: string) {
    try {
      const res = await fetch(`/api/videos/${videoId}/transcription`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data) {
          setTranscriptions(prev => {
            const existing = prev.findIndex(t => t.uploadedVideoId === videoId);
            if (existing >= 0) {
              const updated = [...prev];
              updated[existing] = data;
              return updated;
            }
            return [...prev, data];
          });
          
          if (data.status === "completed" || data.status === "failed") {
            setPollingVideoId(null);
            if (data.status === "completed") {
              toast({ title: "Transcrição concluída!", description: "O texto do vídeo foi extraído com sucesso." });
            } else {
              toast({ title: "Erro na transcrição", description: data.error || "Falha ao transcrever.", variant: "destructive" });
            }
          }
        }
      }
    } catch (error) {
      console.error("Erro ao verificar status:", error);
    }
  }

  async function startTranscription() {
    console.log("🎤 startTranscription called - selectedVideoId:", selectedVideoId, "isTranscribing:", isTranscribing);
    if (!selectedVideoId || isTranscribing) {
      console.log("❌ Retornando - selectedVideoId vazio ou já transcrevendo");
      return;
    }
    
    console.log("✅ Iniciando transcrição para:", selectedVideoId);
    setIsTranscribing(true);
    try {
      const url = `/api/videos/${selectedVideoId}/transcribe`;
      console.log("📡 Enviando POST para:", url);
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      
      console.log("📥 Resposta recebida:", res.status);
      if (res.ok) {
        const data = await res.json();
        console.log("✨ Transcrição iniciada!", data);
        toast({ 
          title: "Transcrição iniciada!", 
          description: "O processo pode levar alguns minutos dependendo da duração do vídeo." 
        });
        
        setTranscriptions(prev => [...prev.filter(t => t.uploadedVideoId !== selectedVideoId), {
          id: data.transcriptionId,
          uploadedVideoId: selectedVideoId,
          webinarId: null,
          status: "processing",
          transcription: null,
          error: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }]);
        
        setPollingVideoId(selectedVideoId);
      } else {
        const err = await res.json();
        console.error("❌ Erro do servidor:", err);
        toast({ title: "Erro ao transcrever", description: err.error, variant: "destructive" });
      }
    } catch (error) {
      console.error("💥 Erro de rede:", error);
      toast({ title: "Erro ao iniciar transcrição", variant: "destructive" });
    } finally {
      setIsTranscribing(false);
    }
  }

  async function restartTranscription(videoId: string) {
    if (!videoId) return;
    
    setSelectedVideoId(videoId);
    setIsTranscribing(true);
    
    try {
      console.log("🔄 Reiniciando transcrição para:", videoId);
      
      const res = await fetch(`/api/videos/${videoId}/transcribe`, {
        method: "POST",
        headers: { 
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });
      
      if (res.ok) {
        toast({ 
          title: "Transcrição reiniciada!", 
          description: "Aguarde enquanto processamos o vídeo..." 
        });
        
        setTranscriptions(prev => prev.map(t => 
          t.uploadedVideoId === videoId 
            ? { ...t, status: "processing", updatedAt: new Date().toISOString() }
            : t
        ));
        
        setPollingVideoId(videoId);
      } else {
        const err = await res.json();
        console.error("❌ Erro ao reiniciar:", err);
        toast({ title: "Erro ao reiniciar transcrição", description: err.error, variant: "destructive" });
      }
    } catch (error) {
      console.error("💥 Erro de rede:", error);
      toast({ title: "Erro ao reiniciar transcrição", variant: "destructive" });
    } finally {
      setIsTranscribing(false);
    }
  }

  async function saveAsScript() {
    if (!selectedTranscription?.transcription || !scriptTitle.trim()) return;
    
    // Find webinar associated with this video, or use first webinar
    const webinarForScript = selectedWebinar || webinars[0];
    if (!webinarForScript) {
      toast({ 
        title: "Nenhum webinário encontrado", 
        description: "Crie um webinário primeiro para salvar o roteiro.",
        variant: "destructive" 
      });
      return;
    }
    
    setSavingScript(true);
    try {
      const res = await fetch(`/api/webinars/${webinarForScript.id}/scripts`, {
        method: "POST",
        headers: { 
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          title: scriptTitle.trim(),
          script: selectedTranscription.transcription
        })
      });
      
      if (res.ok) {
        toast({ 
          title: "Roteiro salvo!", 
          description: "A transcrição foi salva como roteiro. Agora você pode usá-la no Gerador de Mensagens." 
        });
        setSaveScriptDialogOpen(false);
        setScriptTitle("");
      } else {
        const err = await res.json();
        toast({ title: "Erro ao salvar roteiro", description: err.error, variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Erro ao salvar roteiro", variant: "destructive" });
    } finally {
      setSavingScript(false);
    }
  }

  const selectedVideo = videos.find(v => v.uploadedVideoId === selectedVideoId);
  const selectedWebinar = webinars.find(w => w.uploadedVideoId === selectedVideoId);
  const selectedTranscription = transcriptions.find(t => t.uploadedVideoId === selectedVideoId);
  
  // Sempre permitir reiniciar transcrição em processing (pode ter travado)
  const isTranscriptionStuck = selectedTranscription?.status === "processing";

  if (loading) {
    return (
      <div className="container mx-auto p-6 max-w-4xl space-y-6">
        <Skeleton className="h-10 w-48" />
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-4 w-96" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Transcrição de Vídeos</h1>
        <p className="text-muted-foreground">Extraia o texto dos seus vídeos usando inteligência artificial</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mic className="h-5 w-5" />
            Nova Transcrição
          </CardTitle>
          <CardDescription>
            Selecione um vídeo para extrair automaticamente o texto falado
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium">Selecionar Vídeo</label>
            <Select value={selectedVideoId} onValueChange={setSelectedVideoId}>
              <SelectTrigger data-testid="select-video">
                <SelectValue placeholder="Escolha um vídeo para transcrever" />
              </SelectTrigger>
              <SelectContent>
                {videos.map((video) => (
                  <SelectItem key={video.uploadedVideoId} value={video.uploadedVideoId}>
                    <div className="flex items-center gap-2">
                      <Video className="h-4 w-4" />
                      <span>{video.title || video.filename}</span>
                      <span className="text-muted-foreground text-xs">
                        ({formatDuration(video.duration)})
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedVideo && (
            <div className="p-4 bg-muted rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Video className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{selectedVideo.title || selectedVideo.filename}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  {formatDuration(selectedVideo.duration)}
                </div>
              </div>
              
              {selectedWebinar ? (
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span>Associado ao webinário: <strong>{selectedWebinar.name}</strong></span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-amber-600">
                  <AlertCircle className="h-4 w-4" />
                  <span>Este vídeo não está associado a nenhum webinário</span>
                </div>
              )}
              
              {selectedTranscription && (
                <div className="flex items-center gap-2">
                  <span className="text-sm">Status:</span>
                  {selectedTranscription.status === "completed" ? (
                    <Badge className="bg-green-600">Transcrito</Badge>
                  ) : selectedTranscription.status === "processing" ? (
                    isTranscriptionStuck ? (
                      <Badge variant="destructive">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Travada - clique para reiniciar
                      </Badge>
                    ) : (
                      <Badge className="bg-yellow-600">
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        Transcrevendo...
                      </Badge>
                    )
                  ) : selectedTranscription.status === "failed" ? (
                    <Badge variant="destructive">Falhou</Badge>
                  ) : (
                    <Badge variant="outline">Pendente</Badge>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <Button 
              onClick={startTranscription}
              disabled={!selectedVideoId || isTranscribing || (selectedTranscription?.status === "processing" && !isTranscriptionStuck)}
              data-testid="button-start-transcription"
            >
              {isTranscribing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Transcrevendo...
                </>
              ) : selectedTranscription?.status === "processing" && !isTranscriptionStuck ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Transcrevendo...
                </>
              ) : isTranscriptionStuck ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Reiniciar Transcrição
                </>
              ) : (
                <>
                  <Mic className="h-4 w-4 mr-2" />
                  {selectedTranscription?.status === "completed" ? "Transcrever Novamente" : "Transcrever Vídeo"}
                </>
              )}
            </Button>
            
            <Button variant="outline" onClick={fetchData} data-testid="button-refresh">
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar
            </Button>
          </div>
        </CardContent>
      </Card>

      {selectedTranscription?.status === "completed" && selectedTranscription.transcription && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Texto Transcrito
              </CardTitle>
              <CardDescription>
                Salve como roteiro para usar no Gerador de Mensagens
              </CardDescription>
            </div>
            <Button 
              onClick={() => {
                setScriptTitle(`Transcrição - ${selectedVideo?.title || selectedVideo?.filename || "Vídeo"}`);
                setSaveScriptDialogOpen(true);
              }}
              data-testid="button-save-as-script"
            >
              <BookOpen className="h-4 w-4 mr-2" />
              Salvar como Roteiro
            </Button>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-64 w-full rounded-md border p-4">
              <p className="text-sm whitespace-pre-wrap" data-testid="text-transcription">
                {selectedTranscription.transcription}
              </p>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
      
      <Dialog open={saveScriptDialogOpen} onOpenChange={setSaveScriptDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Salvar como Roteiro</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="script-title">Nome do Roteiro</Label>
              <Input
                id="script-title"
                value={scriptTitle}
                onChange={(e) => setScriptTitle(e.target.value)}
                placeholder="Ex: Transcrição do Webinar de Vendas"
                data-testid="input-script-title"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              O roteiro será salvo e ficará disponível no menu <strong>Mensagens</strong> para gerar emails e WhatsApp personalizados.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveScriptDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={saveAsScript} 
              disabled={!scriptTitle.trim() || savingScript}
              data-testid="button-confirm-save-script"
            >
              {savingScript ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Salvar Roteiro
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {transcriptions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Histórico de Transcrições</CardTitle>
            <CardDescription>
              Todas as transcrições realizadas
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {transcriptions.map((t) => {
                const video = videos.find(v => v.uploadedVideoId === t.uploadedVideoId);
                const webinar = t.webinarId ? webinars.find(w => w.id === t.webinarId) : null;
                
                return (
                  <div 
                    key={t.id} 
                    className="flex items-center justify-between p-3 bg-muted rounded-lg cursor-pointer hover-elevate"
                    onClick={() => setSelectedVideoId(t.uploadedVideoId)}
                    data-testid={`transcription-item-${t.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <Video className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium text-sm">{video?.title || video?.filename || "Vídeo"}</p>
                        {webinar && (
                          <p className="text-xs text-muted-foreground">
                            Webinário: {webinar.name}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {t.status === "completed" ? (
                        <Badge className="bg-green-600">Transcrito</Badge>
                      ) : t.status === "processing" ? (
                        <>
                          <Badge variant="destructive">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Travada
                          </Badge>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isTranscribing}
                            onClick={(e) => {
                              e.stopPropagation();
                              restartTranscription(t.uploadedVideoId);
                            }}
                            data-testid={`button-restart-${t.id}`}
                          >
                            {isTranscribing && selectedVideoId === t.uploadedVideoId ? (
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3 w-3 mr-1" />
                            )}
                            Reiniciar
                          </Button>
                        </>
                      ) : t.status === "failed" ? (
                        <>
                          <Badge variant="destructive">Falhou</Badge>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isTranscribing}
                            onClick={(e) => {
                              e.stopPropagation();
                              restartTranscription(t.uploadedVideoId);
                            }}
                            data-testid={`button-retry-${t.id}`}
                          >
                            {isTranscribing && selectedVideoId === t.uploadedVideoId ? (
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3 w-3 mr-1" />
                            )}
                            Tentar Novamente
                          </Button>
                        </>
                      ) : (
                        <Badge variant="outline">{t.status}</Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <div className="flex-shrink-0">
              <Mic className="h-5 w-5 text-blue-600" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                Como funciona a transcrição?
              </p>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                A transcrição usa inteligência artificial para extrair automaticamente o texto falado do seu vídeo. 
                Salve como <strong>Roteiro</strong> para usar no menu <strong>Mensagens</strong> e gerar emails e WhatsApp personalizados para seus leads.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
