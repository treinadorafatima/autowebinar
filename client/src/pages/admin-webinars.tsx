import { useState, useEffect } from "react";
import { useLocation, Link, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { 
  Plus, 
  Video, 
  Clock,
  ExternalLink,
  Settings,
  ChevronRight,
  Play,
  X,
  Radio
} from "lucide-react";

interface Webinar {
  id: string;
  name: string;
  slug: string;
  description: string;
  videoDuration: number;
  startHour: number;
  startMinute: number;
  recurrence: string;
  backgroundColor: string;
  isActive: boolean;
}

interface UploadedVideo {
  id: string;
  uploadedVideoId: string;
  filename: string;
  title?: string;
  duration: number;
}

interface WebinarStatus {
  id: string;
  isLive: boolean;
  elapsed: string;
  remaining: string;
}

export default function AdminWebinarsPage() {
  const [webinars, setWebinars] = useState<Webinar[]>([]);
  const [videos, setVideos] = useState<UploadedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newWebinar, setNewWebinar] = useState({
    name: "",
    description: "",
  });
  const [webinarStatuses, setWebinarStatuses] = useState<Record<string, WebinarStatus>>({});
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const searchString = useSearch();

  const token = localStorage.getItem("adminToken");

  useEffect(() => {
    if (!token) {
      setLocation("/login");
      return;
    }
    fetchWebinars();
    fetchVideos();
    
    const params = new URLSearchParams(searchString);
    if (params.get("new") === "1") {
      setShowCreateForm(true);
    }
  }, [searchString]);

  async function fetchWebinars() {
    try {
      const res = await fetch("/api/webinars", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Erro ao carregar");
      const data = await res.json();
      setWebinars(data || []);
    } catch (error) {
      console.error("Erro ao carregar webinários:", error);
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

  async function handleCreateWebinar() {
    if (!newWebinar.name.trim()) {
      toast({ title: "Erro", description: "Nome é obrigatório", variant: "destructive" });
      return;
    }
    
    setCreating(true);
    try {
      const res = await fetch("/api/webinars", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newWebinar.name,
          description: newWebinar.description,
        }),
      });
      
      if (!res.ok) throw new Error("Erro ao criar webinário");
      
      const created = await res.json();
      toast({ title: "Webinário criado!" });
      setShowCreateForm(false);
      setNewWebinar({ name: "", description: "" });
      setLocation(`/admin/webinars/${created.id}`);
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  }

  function getRecurrenceLabel(recurrence: string): string {
    switch (recurrence) {
      case "daily": return "Diário";
      case "weekly": return "Semanal";
      case "monthly": return "Mensal";
      case "once": return "Uma vez";
      default: return recurrence;
    }
  }

  function calculateWebinarStatus(webinar: Webinar): WebinarStatus {
    const now = new Date();
    const todayStart = new Date();
    todayStart.setHours(webinar.startHour, webinar.startMinute, 0, 0);
    const todayEnd = new Date(todayStart.getTime() + webinar.videoDuration * 1000);

    const isLive = now >= todayStart && now < todayEnd;
    
    let elapsed = "0:00:00";
    let remaining = "0:00:00";

    if (isLive) {
      const elapsedMs = now.getTime() - todayStart.getTime();
      const elapsedSecs = Math.floor(elapsedMs / 1000);
      const h = Math.floor(elapsedSecs / 3600);
      const m = Math.floor((elapsedSecs % 3600) / 60);
      const s = elapsedSecs % 60;
      elapsed = `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;

      const remainingMs = todayEnd.getTime() - now.getTime();
      const remainingSecs = Math.max(0, Math.floor(remainingMs / 1000));
      const rh = Math.floor(remainingSecs / 3600);
      const rm = Math.floor((remainingSecs % 3600) / 60);
      const rs = remainingSecs % 60;
      remaining = `${rh}:${rm.toString().padStart(2, "0")}:${rs.toString().padStart(2, "0")}`;
    } else if (now < todayStart) {
      const diff = todayStart.getTime() - now.getTime();
      const secs = Math.floor(diff / 1000);
      const h = Math.floor(secs / 3600);
      const m = Math.floor((secs % 3600) / 60);
      const s = secs % 60;
      remaining = `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }

    return { id: webinar.id, isLive, elapsed, remaining };
  }

  useEffect(() => {
    const updateStatuses = () => {
      const newStatuses: Record<string, WebinarStatus> = {};
      webinars.forEach(webinar => {
        newStatuses[webinar.id] = calculateWebinarStatus(webinar);
      });
      setWebinarStatuses(newStatuses);
    };

    updateStatuses();
    const interval = setInterval(updateStatuses, 1000);
    return () => clearInterval(interval);
  }, [webinars]);

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-4 w-64 mt-2" />
          </div>
          <Skeleton className="h-10 w-40" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-56" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Webinários</h1>
          <p className="text-muted-foreground text-sm mt-0.5 sm:mt-1">Gerencie seus webinários independentes</p>
        </div>
        <Button 
          onClick={() => setShowCreateForm(true)}
          data-testid="button-create-webinar"
        >
          <Plus className="w-4 h-4 mr-2" />
          Novo Webinário
        </Button>
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle>Criar Novo Webinário</CardTitle>
              <CardDescription>Após criar, você poderá configurar todos os detalhes</CardDescription>
            </div>
            <Button 
              size="icon" 
              variant="ghost"
              onClick={() => setShowCreateForm(false)}
            >
              <X className="w-4 h-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Nome do Webinário *</label>
                <Input
                  value={newWebinar.name}
                  onChange={(e) => setNewWebinar({ ...newWebinar, name: e.target.value })}
                  placeholder="Ex: Aula de Marketing Digital"
                  data-testid="input-webinar-name"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Descrição (opcional)</label>
                <Input
                  value={newWebinar.description}
                  onChange={(e) => setNewWebinar({ ...newWebinar, description: e.target.value })}
                  placeholder="Descrição breve"
                  data-testid="input-webinar-description"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button 
                onClick={handleCreateWebinar} 
                disabled={creating}
                data-testid="button-save-webinar"
              >
                {creating ? "Criando..." : "Criar e Configurar"}
              </Button>
              <Button 
                variant="outline" 
                onClick={() => setShowCreateForm(false)}
                data-testid="button-cancel-create"
              >
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Webinars Grid */}
      {webinars.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 sm:py-20">
            <div className="flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-blue-100 to-cyan-100 dark:from-blue-900/30 dark:to-cyan-900/30 mb-6">
              <Play className="w-10 h-10 text-blue-500" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Comece criando seu primeiro webinário</h3>
            <p className="text-muted-foreground text-sm mb-6 max-w-md text-center">
              Webinários automatizados permitem transmitir conteúdo em horários programados, com chat simulado e personalização completa.
            </p>
            <Button 
              size="lg"
              onClick={() => setShowCreateForm(true)}
              data-testid="button-create-first"
            >
              <Plus className="w-5 h-5 mr-2" />
              Criar Meu Primeiro Webinário
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {webinars.map((webinar) => (
            <Card 
              key={webinar.id} 
              className="hover-elevate cursor-pointer overflow-hidden"
              onClick={() => setLocation(`/admin/webinars/${webinar.id}`)}
              data-testid={`card-webinar-${webinar.id}`}
            >
              <div 
                className="h-20 flex items-center justify-center"
                style={{ backgroundColor: webinar.backgroundColor }}
              >
                <Video className="w-8 h-8 text-white/60" />
              </div>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate">{webinar.name}</h3>
                    <p className="text-xs text-muted-foreground truncate">/{webinar.slug}</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                </div>
                
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  {webinarStatuses[webinar.id]?.isLive && (
                    <Badge className="text-xs bg-red-500 hover:bg-red-600">
                      <Radio className="w-2.5 h-2.5 mr-1 animate-pulse" />
                      EM EXECUÇÃO
                    </Badge>
                  )}
                  <Badge variant="secondary" className="text-xs">
                    <Clock className="w-3 h-3 mr-1" />
                    {webinar.startHour.toString().padStart(2, "0")}:{webinar.startMinute.toString().padStart(2, "0")}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {getRecurrenceLabel(webinar.recurrence)}
                  </Badge>
                </div>

                {webinarStatuses[webinar.id] && (
                  <div className="mt-3 text-xs space-y-1">
                    {webinarStatuses[webinar.id].isLive ? (
                      <>
                        <div className="text-green-600 dark:text-green-400 font-medium">
                          Decorrido: {webinarStatuses[webinar.id].elapsed}
                        </div>
                        <div className="text-orange-600 dark:text-orange-400 font-medium">
                          Falta: {webinarStatuses[webinar.id].remaining}
                        </div>
                      </>
                    ) : webinarStatuses[webinar.id].remaining === "0:00:00" ? (
                      <div className="text-muted-foreground">
                        Inicia em: {webinar.startHour.toString().padStart(2, "0")}:{webinar.startMinute.toString().padStart(2, "0")} ({getRecurrenceLabel(webinar.recurrence).toLowerCase()})
                      </div>
                    ) : (
                      <div className="text-muted-foreground">
                        Inicia em: {webinarStatuses[webinar.id].remaining}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex gap-2 mt-4" onClick={(e) => e.stopPropagation()}>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => window.open(`/w/${webinar.slug}`, "_blank")}
                    data-testid={`button-view-${webinar.id}`}
                  >
                    <ExternalLink className="w-3 h-3 mr-1" />
                    Abrir
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setLocation(`/admin/webinars/${webinar.id}`)}
                    data-testid={`button-config-${webinar.id}`}
                  >
                    <Settings className="w-3 h-3 mr-1" />
                    Configurar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
