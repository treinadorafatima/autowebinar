import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  CheckCircle, XCircle, Loader2, Send, Trash2, Plus, Edit, 
  Clock, QrCode, Smartphone, Wifi, WifiOff, RefreshCcw, ArrowLeft,
  Upload, FileAudio, FileVideo, FileText, Image, Mic, Info, Check,
  Radio, Play, Pause, X, Users, Calendar, Filter, Eye
} from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface WhatsAppStatus {
  status: "disconnected" | "connecting" | "connected" | "qr_ready";
  phoneNumber?: string;
  qrCode?: string;
  lastConnected?: string;
}

interface WhatsAppAccount {
  id: string;
  adminId: string;
  label: string;
  phoneNumber: string | null;
  status: string;
  dailyLimit: number;
  messagesSentToday: number;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

interface WhatsAppSequence {
  id: string;
  adminId: string;
  webinarId: string | null;
  name: string;
  phase: string;
  offsetMinutes: number;
  messageText: string;
  messageType: string;
  mediaUrl?: string | null;
  mediaFileName?: string | null;
  mediaMimeType?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Webinar {
  id: string;
  name: string;
  slug: string;
}

interface MediaFile {
  id: string;
  adminId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  mediaType: string;
  publicUrl: string;
  createdAt: string;
}

interface WhatsAppBroadcast {
  id: string;
  adminId: string;
  webinarId: string;
  name: string;
  status: 'draft' | 'pending' | 'running' | 'paused' | 'completed' | 'cancelled';
  messageText: string;
  messageType: string;
  mediaUrl?: string | null;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  filterType?: string | null;
  filterDateStart?: string | null;
  filterDateEnd?: string | null;
  filterSessionDate?: string | null;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
}

interface BroadcastPreview {
  count: number;
  leads: { id: string; name: string; whatsapp: string; capturedAt: string }[];
}

const PHASES = [
  { value: "pre", label: "Pré-Webinar", description: "Antes do evento começar" },
  { value: "during", label: "Durante", description: "Durante o webinar" },
  { value: "post", label: "Pós-Webinar", description: "Após o evento" },
  { value: "replay", label: "Replay", description: "Quando replay disponível" },
];

const MESSAGE_TYPES = [
  { value: "text", label: "Texto", icon: FileText, description: "Mensagem de texto simples" },
  { value: "audio", label: "Audio", icon: Mic, description: "Audio gravado (max 16MB)" },
  { value: "image", label: "Imagem", icon: Image, description: "Imagem (max 5MB)" },
  { value: "video", label: "Video", icon: FileVideo, description: "Video curto (max 16MB)" },
  { value: "document", label: "Documento", icon: FileText, description: "PDF ou documento (max 100MB)" },
];

const MEDIA_LIMITS = {
  audio: { maxSize: 16 * 1024 * 1024, formats: ["audio/ogg", "audio/mpeg", "audio/mp4", "audio/wav", "audio/x-m4a"], label: "16MB", extensions: ".ogg, .mp3, .m4a, .wav" },
  video: { maxSize: 16 * 1024 * 1024, formats: ["video/mp4", "video/3gpp"], label: "16MB", extensions: ".mp4, .3gp" },
  image: { maxSize: 5 * 1024 * 1024, formats: ["image/jpeg", "image/png", "image/jpg"], label: "5MB", extensions: ".jpg, .jpeg, .png" },
  document: { maxSize: 100 * 1024 * 1024, formats: ["application/pdf"], label: "100MB", extensions: ".pdf" },
};

const convertMinutesToDHM = (totalMinutes: number) => {
  const absMinutes = Math.abs(totalMinutes);
  const days = Math.floor(absMinutes / (24 * 60));
  const hours = Math.floor((absMinutes % (24 * 60)) / 60);
  const minutes = absMinutes % 60;
  const timing = totalMinutes <= 0 ? "before" : "after";
  return { days, hours, minutes, timing };
};

const convertDHMToMinutes = (days: number, hours: number, minutes: number, timing: "before" | "after") => {
  const totalMinutes = (days * 24 * 60) + (hours * 60) + minutes;
  return timing === "before" ? -totalMinutes : totalMinutes;
};

export default function AdminWhatsAppMarketing() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("accounts");
  const [selectedWebinarId, setSelectedWebinarId] = useState<string>("");
  
  const [showNewSequenceDialog, setShowNewSequenceDialog] = useState(false);
  const [editingSequence, setEditingSequence] = useState<WhatsAppSequence | null>(null);
  const [newSequence, setNewSequence] = useState({
    name: "",
    phase: "pre",
    offsetMinutes: -60,
    messageText: "",
    messageType: "text",
    webinarId: "",
    mediaUrl: "",
    mediaFileName: "",
    mediaMimeType: ""
  });
  const [uploadingMedia, setUploadingMedia] = useState(false);
  
  const [newTiming, setNewTiming] = useState<"before" | "after" | "at_start">("before");
  const [newDays, setNewDays] = useState(0);
  const [newHours, setNewHours] = useState(1);
  const [newMinutes, setNewMinutes] = useState(0);
  
  const [editTiming, setEditTiming] = useState<"before" | "after" | "at_start">("before");
  const [editDays, setEditDays] = useState(0);
  const [editHours, setEditHours] = useState(1);
  const [editMinutes, setEditMinutes] = useState(0);

  const [testPhone, setTestPhone] = useState("");
  const [testMessage, setTestMessage] = useState("");
  const [showMergeTagsInfo, setShowMergeTagsInfo] = useState(false);

  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [showNewAccountDialog, setShowNewAccountDialog] = useState(false);
  const [editingAccount, setEditingAccount] = useState<WhatsAppAccount | null>(null);
  const [newAccount, setNewAccount] = useState({
    label: "",
    dailyLimit: 100,
    priority: 0,
  });

  // Broadcast states
  const [broadcastWebinarId, setBroadcastWebinarId] = useState<string>("");
  const [broadcastFilterType, setBroadcastFilterType] = useState<"all" | "date_range" | "session">("all");
  const [broadcastDateStart, setBroadcastDateStart] = useState<string>("");
  const [broadcastDateEnd, setBroadcastDateEnd] = useState<string>("");
  const [broadcastSessionDate, setBroadcastSessionDate] = useState<string>("");
  const [showNewBroadcastDialog, setShowNewBroadcastDialog] = useState(false);
  const [newBroadcast, setNewBroadcast] = useState({
    name: "",
    messageText: "",
    messageType: "text",
    mediaUrl: "",
    mediaFileName: "",
    mediaMimeType: "",
  });
  const [previewLeads, setPreviewLeads] = useState<BroadcastPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const qrRefreshInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  interface AccountLimitInfo {
    currentCount: number;
    limit: number;
    planName: string;
    canCreate: boolean;
    remaining: number;
    isSuperadmin?: boolean;
  }

  const { data: accountLimit } = useQuery<AccountLimitInfo>({
    queryKey: ["/api/whatsapp/accounts/limit"],
    queryFn: async () => {
      const res = await fetch("/api/whatsapp/accounts/limit", {
        headers: { Authorization: `Bearer ${localStorage.getItem("adminToken")}` }
      });
      return res.json();
    },
  });

  const { data: accounts, isLoading: loadingAccounts } = useQuery<WhatsAppAccount[]>({
    queryKey: ["/api/whatsapp/accounts"],
  });

  useEffect(() => {
    if (accounts && accounts.length > 0 && !selectedAccountId) {
      setSelectedAccountId(accounts[0].id);
    }
  }, [accounts, selectedAccountId]);

  const { data: status, isLoading: loadingStatus } = useQuery<WhatsAppStatus>({
    queryKey: ["/api/whatsapp/status", selectedAccountId],
    queryFn: async () => {
      if (!selectedAccountId) return { status: "disconnected" };
      const res = await fetch(`/api/whatsapp/status?accountId=${selectedAccountId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("adminToken")}` }
      });
      return res.json();
    },
    enabled: !!selectedAccountId,
    refetchInterval: (query) => {
      const data = query.state.data as WhatsAppStatus | undefined;
      if (data?.status === "connecting" || data?.status === "qr_ready") {
        return 3000;
      }
      return false;
    },
  });

  const { data: webinars } = useQuery<Webinar[]>({
    queryKey: ["/api/webinars"],
  });

  const { data: sequences, isLoading: loadingSequences } = useQuery<WhatsAppSequence[]>({
    queryKey: ["/api/whatsapp/sequences", selectedWebinarId],
    queryFn: async () => {
      const url = selectedWebinarId 
        ? `/api/whatsapp/sequences?webinarId=${selectedWebinarId}`
        : "/api/whatsapp/sequences";
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${localStorage.getItem("adminToken")}` }
      });
      return res.json();
    },
    enabled: activeTab === "sequences"
  });

  const { data: mediaFiles, isLoading: loadingMediaFiles } = useQuery<MediaFile[]>({
    queryKey: ["/api/media"],
    queryFn: async () => {
      const res = await fetch("/api/media", {
        headers: { Authorization: `Bearer ${localStorage.getItem("adminToken")}` }
      });
      if (!res.ok) {
        throw new Error("Failed to load media files");
      }
      return res.json();
    },
    enabled: activeTab === "files"
  });

  // Broadcast queries
  const { data: broadcasts, isLoading: loadingBroadcasts } = useQuery<WhatsAppBroadcast[]>({
    queryKey: ["/api/whatsapp/broadcasts"],
    queryFn: async () => {
      const res = await fetch("/api/whatsapp/broadcasts", {
        headers: { Authorization: `Bearer ${localStorage.getItem("adminToken")}` }
      });
      return res.json();
    },
    enabled: activeTab === "broadcasts",
    refetchInterval: 5000,
  });

  const { data: sessionDates } = useQuery<string[]>({
    queryKey: ["/api/whatsapp/broadcasts/webinar", broadcastWebinarId, "dates"],
    queryFn: async () => {
      const res = await fetch(`/api/whatsapp/broadcasts/webinar/${broadcastWebinarId}/dates`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("adminToken")}` }
      });
      return res.json();
    },
    enabled: !!broadcastWebinarId && activeTab === "broadcasts",
  });

  useEffect(() => {
    if (webinars && webinars.length > 0 && !selectedWebinarId) {
      setSelectedWebinarId(webinars[0].id);
    }
  }, [webinars, selectedWebinarId]);

  useEffect(() => {
    if (webinars && webinars.length > 0 && !broadcastWebinarId) {
      setBroadcastWebinarId(webinars[0].id);
    }
  }, [webinars, broadcastWebinarId]);

  useEffect(() => {
    if (editingSequence) {
      const { days, hours, minutes, timing } = convertMinutesToDHM(editingSequence.offsetMinutes);
      if (editingSequence.offsetMinutes === 0) {
        setEditTiming("at_start");
        setEditDays(0);
        setEditHours(0);
        setEditMinutes(0);
      } else {
        setEditTiming(timing as "before" | "after");
        setEditDays(days);
        setEditHours(hours);
        setEditMinutes(minutes);
      }
    }
  }, [editingSequence?.id]);

  const connectMutation = useMutation({
    mutationFn: async (accountId: string) => {
      const res = await apiRequest("POST", "/api/whatsapp/connect", { accountId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/accounts"] });
    },
    onError: (error: any) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async (accountId: string) => {
      const res = await apiRequest("POST", "/api/whatsapp/disconnect", { accountId });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Desconectado do WhatsApp" });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/accounts"] });
    },
    onError: (error: any) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const createAccountMutation = useMutation({
    mutationFn: async (data: { label: string; dailyLimit: number; priority: number }) => {
      const res = await apiRequest("POST", "/api/whatsapp/accounts", data);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Erro ao criar conta");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Conta WhatsApp criada com sucesso" });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/accounts/limit"] });
      setShowNewAccountDialog(false);
      setNewAccount({ label: "", dailyLimit: 100, priority: 0 });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao criar conta", description: error.message, variant: "destructive" });
    },
  });

  const updateAccountMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { label?: string; dailyLimit?: number; priority?: number } }) => {
      const res = await apiRequest("PATCH", `/api/whatsapp/accounts/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Conta atualizada com sucesso" });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/accounts"] });
      setEditingAccount(null);
    },
    onError: (error: any) => {
      toast({ title: "Erro ao atualizar conta", description: error.message, variant: "destructive" });
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/whatsapp/accounts/${id}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Conta excluída com sucesso" });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/accounts/limit"] });
      if (selectedAccountId && accounts) {
        const remaining = accounts.filter(a => a.id !== selectedAccountId);
        setSelectedAccountId(remaining.length > 0 ? remaining[0].id : null);
      }
    },
    onError: (error: any) => {
      toast({ title: "Erro ao excluir conta", description: error.message, variant: "destructive" });
    },
  });

  const sendTestMutation = useMutation({
    mutationFn: async (data: { phone: string; message: string; accountId: string }) => {
      const res = await apiRequest("POST", "/api/whatsapp/send-test", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Mensagem enviada com sucesso!" });
      setTestPhone("");
      setTestMessage("");
    },
    onError: (error: any) => {
      toast({ title: "Erro ao enviar", description: error.message, variant: "destructive" });
    },
  });

  const createSequenceMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/whatsapp/sequences", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Sequência criada" });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/sequences"] });
      setShowNewSequenceDialog(false);
      resetNewSequence();
    },
    onError: (error: any) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const updateSequenceMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/whatsapp/sequences/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Sequência atualizada" });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/sequences"] });
      setEditingSequence(null);
    },
    onError: (error: any) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const deleteSequenceMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/whatsapp/sequences/${id}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Sequência excluída" });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/sequences"] });
    },
    onError: (error: any) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const resetNewSequence = () => {
    setNewSequence({
      name: "",
      phase: "pre",
      offsetMinutes: -60,
      messageText: "",
      messageType: "text",
      webinarId: selectedWebinarId,
      mediaUrl: "",
      mediaFileName: "",
      mediaMimeType: ""
    });
    setNewTiming("before");
    setNewDays(0);
    setNewHours(1);
    setNewMinutes(0);
  };

  const deleteMediaFileMutation = useMutation({
    mutationFn: async (mediaId: string) => {
      const res = await apiRequest("DELETE", `/api/media/${mediaId}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Arquivo excluído com sucesso" });
      queryClient.invalidateQueries({ queryKey: ["/api/media"] });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    },
  });

  // Broadcast mutations
  const createBroadcastMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/whatsapp/broadcasts", data);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Erro ao criar broadcast");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Envio em massa criado com sucesso" });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/broadcasts"] });
      setShowNewBroadcastDialog(false);
      setNewBroadcast({ name: "", messageText: "", messageType: "text", mediaUrl: "", mediaFileName: "", mediaMimeType: "" });
      setPreviewLeads(null);
    },
    onError: (error: any) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const startBroadcastMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/whatsapp/broadcasts/${id}/start`);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Erro ao iniciar");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Envio iniciado" });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/broadcasts"] });
    },
    onError: (error: any) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const pauseBroadcastMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/whatsapp/broadcasts/${id}/pause`);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Erro ao pausar");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Envio pausado" });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/broadcasts"] });
    },
    onError: (error: any) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const cancelBroadcastMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/whatsapp/broadcasts/${id}/cancel`);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Erro ao cancelar");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Envio cancelado" });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/broadcasts"] });
    },
    onError: (error: any) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const deleteBroadcastMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/whatsapp/broadcasts/${id}`);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Erro ao excluir");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Envio excluído" });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/broadcasts"] });
    },
    onError: (error: any) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const handlePreviewLeads = async () => {
    if (!broadcastWebinarId) {
      toast({ title: "Selecione um webinar", variant: "destructive" });
      return;
    }
    setLoadingPreview(true);
    try {
      const res = await fetch("/api/whatsapp/broadcasts/preview", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("adminToken")}` 
        },
        body: JSON.stringify({
          webinarId: broadcastWebinarId,
          filterType: broadcastFilterType,
          filterDateStart: broadcastFilterType === "date_range" ? broadcastDateStart : undefined,
          filterDateEnd: broadcastFilterType === "date_range" ? broadcastDateEnd : undefined,
          filterSessionDate: broadcastFilterType === "session" ? broadcastSessionDate : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPreviewLeads(data);
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleCreateBroadcast = () => {
    if (!newBroadcast.name) {
      toast({ title: "Preencha o nome do envio", variant: "destructive" });
      return;
    }
    if (!newBroadcast.messageText) {
      toast({ title: "Preencha a mensagem", variant: "destructive" });
      return;
    }
    if (!broadcastWebinarId) {
      toast({ title: "Selecione um webinar", variant: "destructive" });
      return;
    }
    createBroadcastMutation.mutate({
      webinarId: broadcastWebinarId,
      name: newBroadcast.name,
      messageText: newBroadcast.messageText,
      messageType: newBroadcast.messageType,
      mediaUrl: newBroadcast.mediaUrl || undefined,
      mediaFileName: newBroadcast.mediaFileName || undefined,
      mediaMimeType: newBroadcast.mediaMimeType || undefined,
      filterType: broadcastFilterType,
      filterDateStart: broadcastFilterType === "date_range" ? broadcastDateStart : undefined,
      filterDateEnd: broadcastFilterType === "date_range" ? broadcastDateEnd : undefined,
      filterSessionDate: broadcastFilterType === "session" ? broadcastSessionDate : undefined,
    });
  };

  const getBroadcastStatusBadge = (status: string) => {
    switch (status) {
      case "draft": return <Badge variant="outline">Rascunho</Badge>;
      case "pending": return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">Pendente</Badge>;
      case "running": return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Enviando</Badge>;
      case "paused": return <Badge className="bg-orange-500/10 text-orange-500 border-orange-500/20">Pausado</Badge>;
      case "completed": return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Concluído</Badge>;
      case "cancelled": return <Badge variant="secondary">Cancelado</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const getMediaIcon = (mediaType: string) => {
    switch (mediaType) {
      case "image": return Image;
      case "audio": return Mic;
      case "video": return FileVideo;
      case "document": return FileText;
      default: return FileText;
    }
  };

  const handleCreateSequence = () => {
    if (!newSequence.name) {
      toast({ title: "Preencha o nome da sequência", variant: "destructive" });
      return;
    }
    if (newSequence.messageType === "text" && !newSequence.messageText) {
      toast({ title: "Preencha a mensagem", variant: "destructive" });
      return;
    }
    if (newSequence.messageType !== "text" && !newSequence.mediaUrl) {
      toast({ title: "Envie um arquivo de mídia", variant: "destructive" });
      return;
    }
    if (!newSequence.webinarId) {
      toast({ title: "Selecione um webinar", variant: "destructive" });
      return;
    }
    let calculatedOffset = 0;
    if (newTiming !== "at_start") {
      calculatedOffset = convertDHMToMinutes(newDays, newHours, newMinutes, newTiming as "before" | "after");
    }
    createSequenceMutation.mutate({
      ...newSequence,
      offsetMinutes: calculatedOffset,
      isActive: true,
    });
  };

  const handleOpenNewSequence = () => {
    setNewSequence({
      name: "",
      phase: "pre",
      offsetMinutes: -60,
      messageText: "",
      messageType: "text",
      webinarId: selectedWebinarId,
      mediaUrl: "",
      mediaFileName: "",
      mediaMimeType: ""
    });
    setNewTiming("before");
    setNewDays(0);
    setNewHours(1);
    setNewMinutes(0);
    setShowNewSequenceDialog(true);
  };

  const handleMediaUpload = async (file: File, isEditing: boolean = false) => {
    const messageType = newSequence.messageType;
    if (messageType === "text") return;
    const mediaType = messageType as keyof typeof MEDIA_LIMITS;
    
    const limits = MEDIA_LIMITS[mediaType];
    if (!limits) {
      toast({ title: "Tipo de mídia inválido", variant: "destructive" });
      return;
    }

    if (file.size > limits.maxSize) {
      toast({ 
        title: "Arquivo muito grande", 
        description: `O limite para ${mediaType} é ${limits.label}`,
        variant: "destructive" 
      });
      return;
    }

    if (!limits.formats.includes(file.type)) {
      toast({ 
        title: "Formato não suportado", 
        description: `Formatos aceitos: ${limits.extensions}`,
        variant: "destructive" 
      });
      return;
    }

    setUploadingMedia(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", "whatsapp-media");

      const res = await fetch("/api/upload-file", {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("adminToken")}` },
        body: formData,
      });

      if (!res.ok) throw new Error("Erro no upload");
      const data = await res.json();

      if (isEditing && editingSequence) {
        setEditingSequence({
          ...editingSequence,
          mediaUrl: data.url,
          mediaFileName: file.name,
          mediaMimeType: file.type,
        });
      } else {
        setNewSequence({
          ...newSequence,
          mediaUrl: data.url,
          mediaFileName: file.name,
          mediaMimeType: file.type,
        });
      }
      toast({ title: "Arquivo enviado com sucesso" });
    } catch (error: any) {
      toast({ title: "Erro no upload", description: error.message, variant: "destructive" });
    } finally {
      setUploadingMedia(false);
    }
  };

  const getPhaseLabel = (phase: string) => {
    const p = PHASES.find(p => p.value === phase);
    return p?.label || phase;
  };

  const formatOffset = (minutes: number) => {
    if (minutes === 0) {
      return "No inicio";
    }
    
    const absMinutes = Math.abs(minutes);
    const days = Math.floor(absMinutes / (24 * 60));
    const hours = Math.floor((absMinutes % (24 * 60)) / 60);
    const mins = absMinutes % 60;
    
    let timeStr = "";
    if (days > 0) {
      timeStr += `${days}d `;
    }
    if (hours > 0) {
      timeStr += `${hours}h `;
    }
    if (mins > 0) {
      timeStr += `${mins}min`;
    }
    if (timeStr.trim() === "") {
      timeStr = "0min";
    }
    
    return minutes < 0 ? `${timeStr.trim()} antes` : `${timeStr.trim()} depois`;
  };

  const getStatusBadge = () => {
    if (!status) return null;
    
    switch (status.status) {
      case "connected":
        return (
          <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
            <Wifi className="w-3 h-3 mr-1" />
            Conectado
          </Badge>
        );
      case "connecting":
        return (
          <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            Conectando...
          </Badge>
        );
      case "qr_ready":
        return (
          <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">
            <QrCode className="w-3 h-3 mr-1" />
            Aguardando Scan
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-muted-foreground">
            <WifiOff className="w-3 h-3 mr-1" />
            Desconectado
          </Badge>
        );
    }
  };

  const MERGE_TAGS = [
    { tag: "{{nome}}", description: "Nome do lead" },
    { tag: "{{email}}", description: "Email do lead" },
    { tag: "{{telefone}}", description: "Telefone do lead" },
    { tag: "{{webinar_titulo}}", description: "Título do webinar" },
    { tag: "{{webinar_data}}", description: "Data do webinar (DD/MM/YYYY)" },
    { tag: "{{webinar_horario}}", description: "Horário do webinar" },
    { tag: "{{webinar_link}}", description: "Link para assistir o webinar" },
    { tag: "{{replay_link}}", description: "Link do replay" },
  ];

  return (
    <div className="min-h-screen bg-background p-6" data-testid="page-whatsapp-marketing">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => window.history.back()}
              data-testid="button-back"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-2">
              <SiWhatsapp className="w-6 h-6 text-green-500" />
              <h1 className="text-2xl font-bold">WhatsApp Marketing</h1>
            </div>
          </div>
          {getStatusBadge()}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-6 w-full max-w-4xl">
            <TabsTrigger value="accounts" data-testid="tab-accounts">
              <SiWhatsapp className="w-4 h-4 mr-2" />
              Contas
            </TabsTrigger>
            <TabsTrigger value="connection" data-testid="tab-connection">
              <Smartphone className="w-4 h-4 mr-2" />
              Conexão
            </TabsTrigger>
            <TabsTrigger value="sequences" data-testid="tab-sequences">
              <Clock className="w-4 h-4 mr-2" />
              Sequências
            </TabsTrigger>
            <TabsTrigger value="broadcasts" data-testid="tab-broadcasts">
              <Radio className="w-4 h-4 mr-2" />
              Envios em Massa
            </TabsTrigger>
            <TabsTrigger value="files" data-testid="tab-files">
              <Image className="w-4 h-4 mr-2" />
              Arquivos
            </TabsTrigger>
            <TabsTrigger value="test" data-testid="tab-test">
              <Send className="w-4 h-4 mr-2" />
              Testar
            </TabsTrigger>
          </TabsList>

          <TabsContent value="accounts" className="space-y-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold">Minhas Contas WhatsApp</h2>
                {accountLimit && (
                  <Badge variant="outline" className="text-muted-foreground" data-testid="badge-account-limit">
                    {accountLimit.isSuperadmin || accountLimit.limit >= 999 
                      ? `${accountLimit.currentCount} contas (Ilimitado)` 
                      : `${accountLimit.currentCount}/${accountLimit.limit} contas`}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                {accountLimit && !accountLimit.canCreate && (
                  <span className="text-sm text-muted-foreground" data-testid="text-limit-reached">
                    Limite atingido
                  </span>
                )}
                <Button 
                  onClick={() => setShowNewAccountDialog(true)} 
                  disabled={accountLimit && !accountLimit.canCreate}
                  data-testid="button-new-account"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Nova Conta
                </Button>
              </div>
            </div>

            {loadingAccounts ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : accounts && accounts.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {accounts.map((account) => (
                  <Card 
                    key={account.id} 
                    className={`cursor-pointer transition-all ${selectedAccountId === account.id ? 'ring-2 ring-primary' : ''}`}
                    onClick={() => setSelectedAccountId(account.id)}
                    data-testid={`card-account-${account.id}`}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-base">{account.label}</CardTitle>
                        <Badge 
                          variant={account.status === "connected" ? "default" : "secondary"}
                          className={account.status === "connected" ? "bg-green-500/10 text-green-500 border-green-500/20" : ""}
                        >
                          {account.status === "connected" ? (
                            <><Wifi className="w-3 h-3 mr-1" />Conectado</>
                          ) : (
                            <><WifiOff className="w-3 h-3 mr-1" />Desconectado</>
                          )}
                        </Badge>
                      </div>
                      {account.phoneNumber && (
                        <CardDescription>{account.phoneNumber}</CardDescription>
                      )}
                    </CardHeader>
                    <CardContent className="pb-3">
                      <div className="space-y-2 text-sm text-muted-foreground">
                        <div className="flex justify-between">
                          <span>Mensagens hoje:</span>
                          <span className="font-medium">{account.messagesSentToday} / {account.dailyLimit}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Prioridade:</span>
                          <span className="font-medium">{account.priority}</span>
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter className="pt-0 gap-2 flex-wrap">
                      {account.status === "connected" ? (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            disconnectMutation.mutate(account.id);
                          }}
                          disabled={disconnectMutation.isPending}
                          data-testid={`button-disconnect-${account.id}`}
                        >
                          {disconnectMutation.isPending ? (
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          ) : (
                            <WifiOff className="w-3 h-3 mr-1" />
                          )}
                          Desconectar
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedAccountId(account.id);
                            setActiveTab("connection");
                          }}
                          data-testid={`button-connect-${account.id}`}
                        >
                          <QrCode className="w-3 h-3 mr-1" />
                          Conectar
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingAccount(account);
                        }}
                        data-testid={`button-edit-account-${account.id}`}
                      >
                        <Edit className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm("Tem certeza que deseja excluir esta conta? Ela será desconectada primeiro.")) {
                            deleteAccountMutation.mutate(account.id);
                          }
                        }}
                        disabled={deleteAccountMutation.isPending}
                        data-testid={`button-delete-account-${account.id}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <SiWhatsapp className="w-12 h-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">
                    Nenhuma conta WhatsApp configurada ainda
                  </p>
                  <Button onClick={() => setShowNewAccountDialog(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Criar primeira conta
                  </Button>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Sistema de Round-Robin</CardTitle>
                <CardDescription>
                  O sistema distribui automaticamente as mensagens entre suas contas conectadas
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4">
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center text-green-500 font-bold">1</div>
                    <div>
                      <p className="font-medium">Crie múltiplas contas</p>
                      <p className="text-sm text-muted-foreground">Adicione várias contas WhatsApp para distribuir a carga</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center text-green-500 font-bold">2</div>
                    <div>
                      <p className="font-medium">Configure limites diários</p>
                      <p className="text-sm text-muted-foreground">Defina quantas mensagens cada conta pode enviar por dia</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center text-green-500 font-bold">3</div>
                    <div>
                      <p className="font-medium">Distribuição automática</p>
                      <p className="text-sm text-muted-foreground">As mensagens serão enviadas alternando entre as contas conectadas</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="connection" className="space-y-6">
            {!selectedAccountId ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <SiWhatsapp className="w-12 h-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">
                    Selecione ou crie uma conta WhatsApp primeiro
                  </p>
                  <Button onClick={() => setActiveTab("accounts")}>
                    Ir para Contas
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="flex items-center gap-4 mb-4">
                  <Label>Conta selecionada:</Label>
                  <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                    <SelectTrigger className="w-64" data-testid="select-account">
                      <SelectValue placeholder="Selecione uma conta" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts?.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.label} {account.status === "connected" ? "(Conectado)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <QrCode className="w-5 h-5" />
                      Conexão WhatsApp - {accounts?.find(a => a.id === selectedAccountId)?.label}
                    </CardTitle>
                    <CardDescription>
                      Conecte seu WhatsApp escaneando o QR Code com o aplicativo
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {loadingStatus ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                      </div>
                    ) : status?.status === "connected" ? (
                      <div className="text-center space-y-4">
                        <div className="w-24 h-24 mx-auto bg-green-500/10 rounded-full flex items-center justify-center">
                          <CheckCircle className="w-12 h-12 text-green-500" />
                        </div>
                        <div>
                          <p className="text-lg font-medium text-green-500">WhatsApp Conectado</p>
                          {status.phoneNumber && (
                            <p className="text-muted-foreground">{status.phoneNumber}</p>
                          )}
                        </div>
                        <Button 
                          variant="destructive" 
                          onClick={() => selectedAccountId && disconnectMutation.mutate(selectedAccountId)}
                          disabled={disconnectMutation.isPending}
                          data-testid="button-disconnect"
                        >
                          {disconnectMutation.isPending ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <WifiOff className="w-4 h-4 mr-2" />
                          )}
                          Desconectar
                        </Button>
                      </div>
                    ) : status?.status === "qr_ready" && status.qrCode ? (
                      <div className="text-center space-y-4">
                        <p className="text-muted-foreground">
                          Escaneie o QR Code com o WhatsApp no seu celular
                        </p>
                        <div className="bg-white p-4 rounded-lg inline-block">
                          <img 
                            src={status.qrCode} 
                            alt="QR Code WhatsApp" 
                            className="w-64 h-64"
                            data-testid="img-qrcode"
                          />
                        </div>
                        <p className="text-sm text-muted-foreground">
                          O QR Code atualiza automaticamente a cada 30 segundos
                        </p>
                      </div>
                    ) : status?.status === "connecting" ? (
                      <div className="text-center space-y-4">
                        <Loader2 className="w-12 h-12 mx-auto animate-spin text-muted-foreground" />
                        <p className="text-muted-foreground">Gerando QR Code...</p>
                      </div>
                    ) : (
                      <div className="text-center space-y-4">
                        <div className="w-24 h-24 mx-auto bg-muted rounded-full flex items-center justify-center">
                          <Smartphone className="w-12 h-12 text-muted-foreground" />
                        </div>
                        <p className="text-muted-foreground">
                          Clique no botão abaixo para gerar o QR Code e conectar seu WhatsApp
                        </p>
                        <Button 
                          onClick={() => selectedAccountId && connectMutation.mutate(selectedAccountId)}
                          disabled={connectMutation.isPending}
                          data-testid="button-connect"
                        >
                          {connectMutation.isPending ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <QrCode className="w-4 h-4 mr-2" />
                          )}
                          Conectar WhatsApp
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Como funciona?</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4">
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center text-green-500 font-bold">1</div>
                    <div>
                      <p className="font-medium">Conecte seu WhatsApp</p>
                      <p className="text-sm text-muted-foreground">Escaneie o QR Code com o aplicativo do WhatsApp</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center text-green-500 font-bold">2</div>
                    <div>
                      <p className="font-medium">Crie sequências de mensagens</p>
                      <p className="text-sm text-muted-foreground">Configure mensagens automáticas para antes, durante e após o webinar</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center text-green-500 font-bold">3</div>
                    <div>
                      <p className="font-medium">Envio automático</p>
                      <p className="text-sm text-muted-foreground">As mensagens são enviadas automaticamente nos horários configurados</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sequences" className="space-y-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <Label>Webinar:</Label>
                <Select value={selectedWebinarId} onValueChange={setSelectedWebinarId}>
                  <SelectTrigger className="w-64" data-testid="select-webinar">
                    <SelectValue placeholder="Selecione um webinar" />
                  </SelectTrigger>
                  <SelectContent>
                    {webinars?.map((webinar) => (
                      <SelectItem key={webinar.id} value={webinar.id}>
                        {webinar.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleOpenNewSequence} data-testid="button-new-sequence">
                <Plus className="w-4 h-4 mr-2" />
                Nova Sequência
              </Button>
            </div>

            {loadingSequences ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : sequences && sequences.length > 0 ? (
              <div className="grid gap-4">
                {sequences.map((sequence) => (
                  <Card key={sequence.id} data-testid={`card-sequence-${sequence.id}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <CardTitle className="text-lg">{sequence.name}</CardTitle>
                          <Badge variant={sequence.isActive ? "default" : "secondary"}>
                            {sequence.isActive ? "Ativa" : "Inativa"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingSequence(sequence)}
                            data-testid={`button-edit-${sequence.id}`}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => {
                              if (confirm("Tem certeza que deseja excluir esta sequência?")) {
                                deleteSequenceMutation.mutate(sequence.id);
                              }
                            }}
                            data-testid={`button-delete-${sequence.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
                        <Badge variant="outline">{getPhaseLabel(sequence.phase)}</Badge>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatOffset(sequence.offsetMinutes)}
                        </span>
                        {sequence.messageType !== "text" && (
                          <Badge variant="secondary" className="flex items-center gap-1">
                            {sequence.messageType === "audio" && <Mic className="w-3 h-3" />}
                            {sequence.messageType === "image" && <Image className="w-3 h-3" />}
                            {sequence.messageType === "video" && <FileVideo className="w-3 h-3" />}
                            {sequence.messageType === "document" && <FileText className="w-3 h-3" />}
                            {MESSAGE_TYPES.find(t => t.value === sequence.messageType)?.label}
                          </Badge>
                        )}
                      </div>
                      {sequence.messageType !== "text" && sequence.mediaUrl && (
                        <div className="mb-3 p-3 bg-muted/30 rounded-lg border">
                          <div className="flex items-center gap-2 text-sm">
                            <Check className="w-4 h-4 text-green-500" />
                            <span className="text-muted-foreground">
                              {sequence.mediaFileName || "Arquivo de mídia anexado"}
                            </span>
                          </div>
                        </div>
                      )}
                      {sequence.messageText && (
                        <div className="bg-muted/50 p-3 rounded-lg">
                          <p className="text-sm whitespace-pre-wrap">
                            {sequence.messageType === "text" ? sequence.messageText : `Legenda: ${sequence.messageText}`}
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <SiWhatsapp className="w-12 h-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">
                    Nenhuma sequência de WhatsApp configurada
                  </p>
                  <Button onClick={handleOpenNewSequence}>
                    <Plus className="w-4 h-4 mr-2" />
                    Criar primeira sequência
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="broadcasts" className="space-y-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <h2 className="text-lg font-semibold">Envios em Massa</h2>
              <Button 
                onClick={() => {
                  if (!previewLeads || previewLeads.count === 0) {
                    toast({ title: "Visualize os leads primeiro", description: "Selecione os filtros e clique em 'Visualizar Leads' antes de criar um envio", variant: "destructive" });
                    return;
                  }
                  setShowNewBroadcastDialog(true);
                }}
                data-testid="button-new-broadcast"
              >
                <Plus className="w-4 h-4 mr-2" />
                Novo Envio
              </Button>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Filter className="w-5 h-5" />
                  Filtros de Leads
                </CardTitle>
                <CardDescription>
                  Selecione o webinar e filtre os leads por data de sessão
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Webinar</Label>
                    <Select value={broadcastWebinarId} onValueChange={setBroadcastWebinarId}>
                      <SelectTrigger data-testid="select-broadcast-webinar">
                        <SelectValue placeholder="Selecione um webinar" />
                      </SelectTrigger>
                      <SelectContent>
                        {webinars?.map((webinar) => (
                          <SelectItem key={webinar.id} value={webinar.id}>
                            {webinar.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Tipo de Filtro</Label>
                    <Select value={broadcastFilterType} onValueChange={(v) => setBroadcastFilterType(v as any)}>
                      <SelectTrigger data-testid="select-filter-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os leads</SelectItem>
                        <SelectItem value="date_range">Intervalo de datas</SelectItem>
                        <SelectItem value="session">Data de sessão específica</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {broadcastFilterType === "date_range" && (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Data Inicial</Label>
                      <Input
                        type="date"
                        value={broadcastDateStart}
                        onChange={(e) => setBroadcastDateStart(e.target.value)}
                        data-testid="input-date-start"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Data Final</Label>
                      <Input
                        type="date"
                        value={broadcastDateEnd}
                        onChange={(e) => setBroadcastDateEnd(e.target.value)}
                        data-testid="input-date-end"
                      />
                    </div>
                  </div>
                )}

                {broadcastFilterType === "session" && (
                  <div className="space-y-2">
                    <Label>Data da Sessão</Label>
                    <Select value={broadcastSessionDate} onValueChange={setBroadcastSessionDate}>
                      <SelectTrigger data-testid="select-session-date">
                        <SelectValue placeholder="Selecione uma data" />
                      </SelectTrigger>
                      <SelectContent>
                        {sessionDates?.map((date) => (
                          <SelectItem key={date} value={date}>
                            {new Date(date).toLocaleDateString("pt-BR")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="flex items-center gap-4 flex-wrap">
                  <Button 
                    variant="outline" 
                    onClick={handlePreviewLeads}
                    disabled={loadingPreview || !broadcastWebinarId}
                    data-testid="button-preview-leads"
                  >
                    {loadingPreview ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Eye className="w-4 h-4 mr-2" />
                    )}
                    Visualizar Leads
                  </Button>

                  {previewLeads && (
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">
                        <span className="font-medium">{previewLeads.count}</span> leads encontrados
                      </span>
                    </div>
                  )}
                </div>

                {previewLeads && previewLeads.leads.length > 0 && (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="bg-muted p-2 text-sm font-medium">
                      Prévia dos leads (mostrando até 50)
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50 sticky top-0">
                          <tr>
                            <th className="text-left p-2">Nome</th>
                            <th className="text-left p-2">WhatsApp</th>
                            <th className="text-left p-2">Capturado em</th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewLeads.leads.map((lead) => (
                            <tr key={lead.id} className="border-t">
                              <td className="p-2">{lead.name}</td>
                              <td className="p-2">{lead.whatsapp}</td>
                              <td className="p-2">{new Date(lead.capturedAt).toLocaleDateString("pt-BR")}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Radio className="w-5 h-5" />
                  Histórico de Envios
                </CardTitle>
                <CardDescription>
                  Acompanhe o progresso dos seus envios em massa
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingBroadcasts ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                  </div>
                ) : broadcasts && broadcasts.length > 0 ? (
                  <div className="space-y-4">
                    {broadcasts.map((broadcast) => (
                      <Card key={broadcast.id} data-testid={`card-broadcast-${broadcast.id}`}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-4 flex-wrap">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <h3 className="font-medium">{broadcast.name}</h3>
                                {getBroadcastStatusBadge(broadcast.status)}
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {new Date(broadcast.createdAt).toLocaleDateString("pt-BR")} - {broadcast.totalRecipients} destinatários
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              {(broadcast.status === "pending" || broadcast.status === "paused") && (
                                <Button
                                  size="sm"
                                  onClick={() => startBroadcastMutation.mutate(broadcast.id)}
                                  disabled={startBroadcastMutation.isPending}
                                  data-testid={`button-start-${broadcast.id}`}
                                >
                                  <Play className="w-3 h-3 mr-1" />
                                  {broadcast.status === "paused" ? "Retomar" : "Iniciar"}
                                </Button>
                              )}
                              {broadcast.status === "running" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => pauseBroadcastMutation.mutate(broadcast.id)}
                                  disabled={pauseBroadcastMutation.isPending}
                                  data-testid={`button-pause-${broadcast.id}`}
                                >
                                  <Pause className="w-3 h-3 mr-1" />
                                  Pausar
                                </Button>
                              )}
                              {(broadcast.status === "pending" || broadcast.status === "running" || broadcast.status === "paused") && (
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => {
                                    if (confirm("Tem certeza que deseja cancelar este envio?")) {
                                      cancelBroadcastMutation.mutate(broadcast.id);
                                    }
                                  }}
                                  disabled={cancelBroadcastMutation.isPending}
                                  data-testid={`button-cancel-${broadcast.id}`}
                                >
                                  <X className="w-3 h-3 mr-1" />
                                  Cancelar
                                </Button>
                              )}
                              {(broadcast.status === "completed" || broadcast.status === "cancelled") && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    if (confirm("Excluir este envio?")) {
                                      deleteBroadcastMutation.mutate(broadcast.id);
                                    }
                                  }}
                                  disabled={deleteBroadcastMutation.isPending}
                                  data-testid={`button-delete-${broadcast.id}`}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              )}
                            </div>
                          </div>
                          <div className="mt-3 grid grid-cols-3 gap-4 text-center">
                            <div>
                              <p className="text-2xl font-bold text-green-500">{broadcast.sentCount}</p>
                              <p className="text-xs text-muted-foreground">Enviados</p>
                            </div>
                            <div>
                              <p className="text-2xl font-bold text-red-500">{broadcast.failedCount}</p>
                              <p className="text-xs text-muted-foreground">Falhas</p>
                            </div>
                            <div>
                              <p className="text-2xl font-bold text-muted-foreground">
                                {broadcast.totalRecipients - broadcast.sentCount - broadcast.failedCount}
                              </p>
                              <p className="text-xs text-muted-foreground">Pendentes</p>
                            </div>
                          </div>
                          {broadcast.status === "running" && (
                            <div className="mt-3">
                              <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-green-500 transition-all"
                                  style={{ width: `${((broadcast.sentCount + broadcast.failedCount) / broadcast.totalRecipients) * 100}%` }}
                                />
                              </div>
                              <p className="text-xs text-muted-foreground mt-1 text-center">
                                {Math.round(((broadcast.sentCount + broadcast.failedCount) / broadcast.totalRecipients) * 100)}% concluído
                              </p>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Radio className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Nenhum envio em massa criado ainda</p>
                    <Button 
                      className="mt-4" 
                      onClick={() => setShowNewBroadcastDialog(true)}
                      data-testid="button-create-first-broadcast"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Criar primeiro envio
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Contas Disponíveis para Rotação</CardTitle>
                <CardDescription>
                  Contas WhatsApp conectadas que serão usadas para distribuir os envios
                </CardDescription>
              </CardHeader>
              <CardContent>
                {accounts && accounts.filter(a => a.status === "connected").length > 0 ? (
                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {accounts.filter(a => a.status === "connected").map((account) => (
                      <div key={account.id} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                        <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                          <SiWhatsapp className="w-5 h-5 text-green-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{account.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {account.messagesSentToday}/{account.dailyLimit} hoje
                          </p>
                        </div>
                        <Badge variant="outline" className="shrink-0">
                          P{account.priority}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4 text-muted-foreground">
                    <WifiOff className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Nenhuma conta conectada</p>
                    <Button 
                      variant="link" 
                      onClick={() => setActiveTab("accounts")}
                      className="mt-2"
                    >
                      Ir para Contas
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="files" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Image className="w-5 h-5" />
                  Meus Arquivos
                </CardTitle>
                <CardDescription>
                  Gerencie todos os arquivos de mídia que você enviou para usar nas sequências de WhatsApp
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingMediaFiles ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                  </div>
                ) : mediaFiles && mediaFiles.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {mediaFiles.map((file) => {
                      const MediaIcon = getMediaIcon(file.mediaType);
                      return (
                        <Card key={file.id} className="overflow-hidden" data-testid={`card-media-${file.id}`}>
                          <div className="aspect-video bg-muted flex items-center justify-center relative">
                            {file.mediaType === "image" ? (
                              <img 
                                src={file.publicUrl} 
                                alt={file.fileName}
                                className="w-full h-full object-cover"
                              />
                            ) : file.mediaType === "video" ? (
                              <video 
                                src={file.publicUrl}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <MediaIcon className="w-16 h-16 text-muted-foreground" />
                            )}
                            <Badge className="absolute top-2 right-2" variant="secondary">
                              {file.mediaType}
                            </Badge>
                          </div>
                          <CardContent className="p-3 space-y-2">
                            <p className="font-medium text-sm truncate" title={file.fileName}>
                              {file.fileName}
                            </p>
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>{formatFileSize(file.sizeBytes)}</span>
                              <span>{new Date(file.createdAt).toLocaleDateString('pt-BR')}</span>
                            </div>
                          </CardContent>
                          <CardFooter className="p-3 pt-0 gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1"
                              onClick={() => {
                                navigator.clipboard.writeText(file.publicUrl);
                                toast({ title: "URL copiada!" });
                              }}
                              data-testid={`button-copy-url-${file.id}`}
                            >
                              Copiar URL
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => {
                                if (confirm("Tem certeza que deseja excluir este arquivo? Sequências que usam este arquivo podem parar de funcionar.")) {
                                  deleteMediaFileMutation.mutate(file.id);
                                }
                              }}
                              disabled={deleteMediaFileMutation.isPending}
                              data-testid={`button-delete-file-${file.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </CardFooter>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Image className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">Nenhum arquivo ainda</h3>
                    <p className="text-muted-foreground text-sm">
                      Os arquivos que você enviar nas sequências de WhatsApp aparecerão aqui
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="test" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Send className="w-5 h-5" />
                  Enviar Mensagem de Teste
                </CardTitle>
                <CardDescription>
                  Envie uma mensagem de teste para verificar se a conexão está funcionando
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {status?.status !== "connected" ? (
                  <div className="text-center py-8">
                    <WifiOff className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">
                      Conecte seu WhatsApp primeiro para enviar mensagens de teste
                    </p>
                    <Button 
                      variant="outline" 
                      className="mt-4"
                      onClick={() => setActiveTab("connection")}
                    >
                      Ir para Conexão
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="test-phone">Número do WhatsApp</Label>
                      <Input
                        id="test-phone"
                        placeholder="5511999999999"
                        value={testPhone}
                        onChange={(e) => setTestPhone(e.target.value)}
                        data-testid="input-test-phone"
                      />
                      <p className="text-xs text-muted-foreground">
                        Digite o número com código do país (ex: 5511999999999)
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="test-message">Mensagem</Label>
                      <Textarea
                        id="test-message"
                        placeholder="Digite sua mensagem de teste..."
                        value={testMessage}
                        onChange={(e) => setTestMessage(e.target.value)}
                        rows={4}
                        data-testid="input-test-message"
                      />
                    </div>
                    <Button
                      onClick={() => selectedAccountId && sendTestMutation.mutate({ phone: testPhone, message: testMessage, accountId: selectedAccountId })}
                      disabled={sendTestMutation.isPending || !testPhone || !testMessage || !selectedAccountId}
                      data-testid="button-send-test"
                    >
                      {sendTestMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4 mr-2" />
                      )}
                      Enviar Teste
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={showNewSequenceDialog} onOpenChange={setShowNewSequenceDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Nova Sequência de WhatsApp</DialogTitle>
              <DialogDescription>
                Configure uma nova mensagem automática para os leads
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="seq-name">Nome da Sequência</Label>
                <Input
                  id="seq-name"
                  placeholder="Ex: Lembrete 1h antes"
                  value={newSequence.name}
                  onChange={(e) => setNewSequence({ ...newSequence, name: e.target.value })}
                  data-testid="input-sequence-name"
                />
              </div>

              <div className="space-y-2">
                <Label>Webinar</Label>
                <Select 
                  value={newSequence.webinarId} 
                  onValueChange={(v) => setNewSequence({ ...newSequence, webinarId: v })}
                >
                  <SelectTrigger data-testid="select-sequence-webinar">
                    <SelectValue placeholder="Selecione um webinar" />
                  </SelectTrigger>
                  <SelectContent>
                    {webinars?.map((webinar) => (
                      <SelectItem key={webinar.id} value={webinar.id}>
                        {webinar.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Fase</Label>
                  <Select 
                    value={newSequence.phase} 
                    onValueChange={(v) => setNewSequence({ ...newSequence, phase: v })}
                  >
                    <SelectTrigger data-testid="select-sequence-phase">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PHASES.map((phase) => (
                        <SelectItem key={phase.value} value={phase.value}>
                          {phase.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Momento do Envio</Label>
                  <Select 
                    value={newTiming} 
                    onValueChange={(v) => setNewTiming(v as "before" | "after")}
                  >
                    <SelectTrigger data-testid="select-sequence-timing">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="before">Antes da sessao</SelectItem>
                      <SelectItem value="at_start">No inicio</SelectItem>
                      <SelectItem value="after">Depois da sessao</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {newTiming !== "at_start" && (
                <div className="space-y-2">
                  <Label>Tempo personalizado</Label>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Dias</Label>
                      <Input
                        type="number"
                        min={0}
                        value={newDays}
                        onChange={(e) => setNewDays(Math.max(0, parseInt(e.target.value) || 0))}
                        data-testid="input-sequence-days"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Horas</Label>
                      <Input
                        type="number"
                        min={0}
                        max={23}
                        value={newHours}
                        onChange={(e) => setNewHours(Math.max(0, Math.min(23, parseInt(e.target.value) || 0)))}
                        data-testid="input-sequence-hours"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Minutos</Label>
                      <Input
                        type="number"
                        min={0}
                        max={59}
                        value={newMinutes}
                        onChange={(e) => setNewMinutes(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                        data-testid="input-sequence-minutes"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    A mensagem sera enviada {newDays > 0 ? `${newDays} dia(s), ` : ""}{newHours > 0 ? `${newHours}h ` : ""}{newMinutes > 0 ? `${newMinutes}min ` : ""}{newTiming === "before" ? "antes" : "depois"} da sessao
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label>Tipo de Mensagem</Label>
                <div className="grid grid-cols-5 gap-2">
                  {MESSAGE_TYPES.map((type) => {
                    const Icon = type.icon;
                    return (
                      <Button
                        key={type.value}
                        type="button"
                        variant={newSequence.messageType === type.value ? "default" : "outline"}
                        className="flex flex-col h-auto py-3 gap-1"
                        onClick={() => setNewSequence({ 
                          ...newSequence, 
                          messageType: type.value,
                          mediaUrl: "",
                          mediaFileName: "",
                          mediaMimeType: ""
                        })}
                        data-testid={`button-message-type-${type.value}`}
                      >
                        <Icon className="w-4 h-4" />
                        <span className="text-xs">{type.label}</span>
                      </Button>
                    );
                  })}
                </div>
              </div>

              {newSequence.messageType !== "text" && (
                <div className="space-y-2">
                  <Label>Upload de Mídia</Label>
                  <div className="border-2 border-dashed rounded-lg p-4">
                    {newSequence.mediaUrl ? (
                      <div className="space-y-3">
                        {newSequence.messageType === "image" && (
                          <div className="flex justify-center">
                            <img 
                              src={newSequence.mediaUrl} 
                              alt="Prévia" 
                              className="max-h-48 rounded-lg object-contain border"
                            />
                          </div>
                        )}
                        {newSequence.messageType === "video" && (
                          <div className="flex justify-center">
                            <video 
                              src={newSequence.mediaUrl}
                              className="max-h-48 rounded-lg border"
                              controls
                            />
                          </div>
                        )}
                        {newSequence.messageType === "audio" && (
                          <div className="flex justify-center">
                            <audio 
                              src={newSequence.mediaUrl}
                              controls
                              className="w-full max-w-md"
                            />
                          </div>
                        )}
                        <div className="flex items-center justify-between bg-muted p-3 rounded-lg">
                          <div className="flex items-center gap-2">
                            <Check className="w-4 h-4 text-green-500" />
                            <span className="text-sm font-medium">{newSequence.mediaFileName}</span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setNewSequence({
                              ...newSequence,
                              mediaUrl: "",
                              mediaFileName: "",
                              mediaMimeType: ""
                            })}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center gap-2 cursor-pointer">
                        <Upload className="w-8 h-8 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          Clique para enviar {MESSAGE_TYPES.find(t => t.value === newSequence.messageType)?.label.toLowerCase()}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {MEDIA_LIMITS[newSequence.messageType as keyof typeof MEDIA_LIMITS]?.extensions} (máx {MEDIA_LIMITS[newSequence.messageType as keyof typeof MEDIA_LIMITS]?.label})
                        </span>
                        <input
                          type="file"
                          className="hidden"
                          accept={MEDIA_LIMITS[newSequence.messageType as keyof typeof MEDIA_LIMITS]?.formats.join(",")}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleMediaUpload(file, false);
                          }}
                          disabled={uploadingMedia}
                          data-testid="input-media-upload"
                        />
                        {uploadingMedia && (
                          <div className="flex items-center gap-2 mt-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span className="text-sm">Enviando...</span>
                          </div>
                        )}
                      </label>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="seq-message">
                    {newSequence.messageType === "text" ? "Mensagem" : "Legenda (opcional)"}
                  </Label>
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setShowMergeTagsInfo(!showMergeTagsInfo)}
                  >
                    Ver Merge Tags
                  </Button>
                </div>
                <Textarea
                  id="seq-message"
                  placeholder={newSequence.messageType === "text" 
                    ? "Digite a mensagem que será enviada..." 
                    : "Digite uma legenda para a mídia (opcional)..."
                  }
                  value={newSequence.messageText}
                  onChange={(e) => setNewSequence({ ...newSequence, messageText: e.target.value })}
                  rows={newSequence.messageType === "text" ? 6 : 3}
                  data-testid="input-sequence-message"
                />
                {showMergeTagsInfo && (
                  <div className="bg-muted p-3 rounded-lg mt-2">
                    <p className="text-sm font-medium mb-2">Merge Tags Disponíveis:</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {MERGE_TAGS.map((tag) => (
                        <div key={tag.tag} className="flex items-center gap-2">
                          <code className="bg-background px-1 rounded">{tag.tag}</code>
                          <span className="text-muted-foreground">{tag.description}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {newSequence.messageType === "text" && (
                  <div className="bg-muted/50 p-3 rounded-lg">
                    <p className="text-xs font-medium mb-1">Formatação WhatsApp:</p>
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span><code>*texto*</code> = <strong>negrito</strong></span>
                      <span><code>_texto_</code> = <em>itálico</em></span>
                      <span><code>~texto~</code> = <s>riscado</s></span>
                      <span><code>```texto```</code> = <code>monoespaçado</code></span>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNewSequenceDialog(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={handleCreateSequence}
                disabled={createSequenceMutation.isPending}
                data-testid="button-create-sequence"
              >
                {createSequenceMutation.isPending && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                Criar Sequência
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!editingSequence} onOpenChange={(open) => !open && setEditingSequence(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Editar Sequência</DialogTitle>
            </DialogHeader>
            {editingSequence && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Nome da Sequência</Label>
                  <Input
                    id="edit-name"
                    value={editingSequence.name}
                    onChange={(e) => setEditingSequence({ ...editingSequence, name: e.target.value })}
                    data-testid="input-edit-name"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Fase</Label>
                    <Select 
                      value={editingSequence.phase} 
                      onValueChange={(v) => setEditingSequence({ ...editingSequence, phase: v })}
                    >
                      <SelectTrigger data-testid="select-edit-phase">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PHASES.map((phase) => (
                          <SelectItem key={phase.value} value={phase.value}>
                            {phase.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Momento do Envio</Label>
                    <Select 
                      value={editTiming} 
                      onValueChange={(v) => setEditTiming(v as "before" | "after" | "at_start")}
                    >
                      <SelectTrigger data-testid="select-edit-timing">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="before">Antes da sessao</SelectItem>
                        <SelectItem value="at_start">No inicio</SelectItem>
                        <SelectItem value="after">Depois da sessao</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {editTiming !== "at_start" && (
                  <div className="space-y-2">
                    <Label>Tempo personalizado</Label>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Dias</Label>
                        <Input
                          type="number"
                          min={0}
                          value={editDays}
                          onChange={(e) => setEditDays(Math.max(0, parseInt(e.target.value) || 0))}
                          data-testid="input-edit-days"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Horas</Label>
                        <Input
                          type="number"
                          min={0}
                          max={23}
                          value={editHours}
                          onChange={(e) => setEditHours(Math.max(0, Math.min(23, parseInt(e.target.value) || 0)))}
                          data-testid="input-edit-hours"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Minutos</Label>
                        <Input
                          type="number"
                          min={0}
                          max={59}
                          value={editMinutes}
                          onChange={(e) => setEditMinutes(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                          data-testid="input-edit-minutes"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      A mensagem sera enviada {editDays > 0 ? `${editDays} dia(s), ` : ""}{editHours > 0 ? `${editHours}h ` : ""}{editMinutes > 0 ? `${editMinutes}min ` : ""}{editTiming === "before" ? "antes" : "depois"} da sessao
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Tipo de Mensagem</Label>
                  <div className="grid grid-cols-5 gap-2">
                    {MESSAGE_TYPES.map((type) => {
                      const Icon = type.icon;
                      return (
                        <Button
                          key={type.value}
                          type="button"
                          variant={editingSequence.messageType === type.value ? "default" : "outline"}
                          className="flex flex-col h-auto py-3 gap-1"
                          onClick={() => setEditingSequence({ 
                            ...editingSequence, 
                            messageType: type.value,
                            mediaUrl: type.value === editingSequence.messageType ? editingSequence.mediaUrl : null,
                            mediaFileName: type.value === editingSequence.messageType ? editingSequence.mediaFileName : null,
                            mediaMimeType: type.value === editingSequence.messageType ? editingSequence.mediaMimeType : null
                          })}
                          data-testid={`button-edit-message-type-${type.value}`}
                        >
                          <Icon className="w-4 h-4" />
                          <span className="text-xs">{type.label}</span>
                        </Button>
                      );
                    })}
                  </div>
                </div>

                {editingSequence.messageType !== "text" && (
                  <div className="space-y-2">
                    <Label>Upload de Mídia</Label>
                    <div className="border-2 border-dashed rounded-lg p-4">
                      {editingSequence.mediaUrl ? (
                        <div className="space-y-3">
                          {editingSequence.messageType === "image" && (
                            <div className="flex justify-center">
                              <img 
                                src={editingSequence.mediaUrl} 
                                alt="Prévia" 
                                className="max-h-48 rounded-lg object-contain border"
                              />
                            </div>
                          )}
                          {editingSequence.messageType === "video" && (
                            <div className="flex justify-center">
                              <video 
                                src={editingSequence.mediaUrl}
                                className="max-h-48 rounded-lg border"
                                controls
                              />
                            </div>
                          )}
                          {editingSequence.messageType === "audio" && (
                            <div className="flex justify-center">
                              <audio 
                                src={editingSequence.mediaUrl}
                                controls
                                className="w-full max-w-md"
                              />
                            </div>
                          )}
                          <div className="flex items-center justify-between bg-muted p-3 rounded-lg">
                            <div className="flex items-center gap-2">
                              <Check className="w-4 h-4 text-green-500" />
                              <span className="text-sm font-medium">{editingSequence.mediaFileName || "Arquivo enviado"}</span>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingSequence({
                                ...editingSequence,
                                mediaUrl: null,
                                mediaFileName: null,
                                mediaMimeType: null
                              })}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <label className="flex flex-col items-center gap-2 cursor-pointer">
                          <Upload className="w-8 h-8 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">
                            Clique para enviar {MESSAGE_TYPES.find(t => t.value === editingSequence.messageType)?.label.toLowerCase()}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {MEDIA_LIMITS[editingSequence.messageType as keyof typeof MEDIA_LIMITS]?.extensions} (máx {MEDIA_LIMITS[editingSequence.messageType as keyof typeof MEDIA_LIMITS]?.label})
                          </span>
                          <input
                            type="file"
                            className="hidden"
                            accept={MEDIA_LIMITS[editingSequence.messageType as keyof typeof MEDIA_LIMITS]?.formats.join(",")}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleMediaUpload(file, true);
                            }}
                            disabled={uploadingMedia}
                            data-testid="input-edit-media-upload"
                          />
                          {uploadingMedia && (
                            <div className="flex items-center gap-2 mt-2">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span className="text-sm">Enviando...</span>
                            </div>
                          )}
                        </label>
                      )}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="edit-message">
                    {editingSequence.messageType === "text" ? "Mensagem" : "Legenda (opcional)"}
                  </Label>
                  <Textarea
                    id="edit-message"
                    placeholder={editingSequence.messageType === "text" 
                      ? "Digite a mensagem que será enviada..." 
                      : "Digite uma legenda para a mídia (opcional)..."
                    }
                    value={editingSequence.messageText}
                    onChange={(e) => setEditingSequence({ ...editingSequence, messageText: e.target.value })}
                    rows={editingSequence.messageType === "text" ? 6 : 3}
                    data-testid="input-edit-message"
                  />
                  {editingSequence.messageType === "text" && (
                    <div className="bg-muted/50 p-3 rounded-lg">
                      <p className="text-xs font-medium mb-1">Formatação WhatsApp:</p>
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <span><code>*texto*</code> = <strong>negrito</strong></span>
                        <span><code>_texto_</code> = <em>itálico</em></span>
                        <span><code>~texto~</code> = <s>riscado</s></span>
                        <span><code>```texto```</code> = <code>monoespaçado</code></span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Switch
                    checked={editingSequence.isActive}
                    onCheckedChange={(checked) => setEditingSequence({ ...editingSequence, isActive: checked })}
                    data-testid="switch-edit-active"
                  />
                  <Label>Sequência Ativa</Label>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingSequence(null)}>
                Cancelar
              </Button>
              <Button 
                onClick={() => {
                  if (editingSequence) {
                    let calculatedOffset = 0;
                    if (editTiming !== "at_start") {
                      calculatedOffset = convertDHMToMinutes(editDays, editHours, editMinutes, editTiming as "before" | "after");
                    }
                    updateSequenceMutation.mutate({
                      id: editingSequence.id,
                      data: {
                        name: editingSequence.name,
                        phase: editingSequence.phase,
                        offsetMinutes: calculatedOffset,
                        messageText: editingSequence.messageText,
                        messageType: editingSequence.messageType,
                        mediaUrl: editingSequence.mediaUrl,
                        mediaFileName: editingSequence.mediaFileName,
                        mediaMimeType: editingSequence.mediaMimeType,
                        isActive: editingSequence.isActive,
                      }
                    });
                  }
                }}
                disabled={updateSequenceMutation.isPending}
                data-testid="button-save-sequence"
              >
                {updateSequenceMutation.isPending && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                Salvar Alterações
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showNewBroadcastDialog} onOpenChange={setShowNewBroadcastDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Novo Envio em Massa</DialogTitle>
              <DialogDescription>
                Crie um novo envio para os {previewLeads?.count || 0} leads selecionados
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nome do Envio</Label>
                <Input
                  placeholder="Ex: Lembrete Webinar Dezembro"
                  value={newBroadcast.name}
                  onChange={(e) => setNewBroadcast({ ...newBroadcast, name: e.target.value })}
                  data-testid="input-broadcast-name"
                />
              </div>
              <div className="space-y-2">
                <Label>Mensagem</Label>
                <Textarea
                  placeholder="Digite a mensagem... Use {nome} para personalizar"
                  value={newBroadcast.messageText}
                  onChange={(e) => setNewBroadcast({ ...newBroadcast, messageText: e.target.value })}
                  rows={6}
                  data-testid="input-broadcast-message"
                />
                <p className="text-xs text-muted-foreground">Use {"{nome}"} para inserir o nome do lead</p>
              </div>
              {previewLeads && (
                <div className="bg-muted/50 p-3 rounded-lg">
                  <p className="text-sm"><strong>{previewLeads.count}</strong> leads serão enviados</p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNewBroadcastDialog(false)}>Cancelar</Button>
              <Button 
                onClick={() => {
                  handleCreateBroadcast();
                }}
                disabled={createBroadcastMutation.isPending || !newBroadcast.name || !newBroadcast.messageText}
                data-testid="button-create-broadcast"
              >
                {createBroadcastMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Criar Envio
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showNewAccountDialog} onOpenChange={setShowNewAccountDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova Conta WhatsApp</DialogTitle>
              <DialogDescription>
                Adicione uma nova conta WhatsApp para distribuir mensagens
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="account-label">Nome da Conta</Label>
                <Input
                  id="account-label"
                  placeholder="Ex: Conta Principal"
                  value={newAccount.label}
                  onChange={(e) => setNewAccount({ ...newAccount, label: e.target.value })}
                  data-testid="input-account-label"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="account-limit">Limite Diário de Mensagens</Label>
                <Input
                  id="account-limit"
                  type="number"
                  min={1}
                  value={newAccount.dailyLimit}
                  onChange={(e) => setNewAccount({ ...newAccount, dailyLimit: parseInt(e.target.value) || 100 })}
                  data-testid="input-account-limit"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="account-priority">Prioridade</Label>
                <Input
                  id="account-priority"
                  type="number"
                  min={0}
                  value={newAccount.priority}
                  onChange={(e) => setNewAccount({ ...newAccount, priority: parseInt(e.target.value) || 0 })}
                  data-testid="input-account-priority"
                />
                <p className="text-xs text-muted-foreground">
                  Contas com maior prioridade serão usadas primeiro
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNewAccountDialog(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={() => createAccountMutation.mutate(newAccount)}
                disabled={createAccountMutation.isPending || !newAccount.label}
                data-testid="button-create-account"
              >
                {createAccountMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Criar Conta
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!editingAccount} onOpenChange={(open) => !open && setEditingAccount(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Conta WhatsApp</DialogTitle>
            </DialogHeader>
            {editingAccount && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-account-label">Nome da Conta</Label>
                  <Input
                    id="edit-account-label"
                    value={editingAccount.label}
                    onChange={(e) => setEditingAccount({ ...editingAccount, label: e.target.value })}
                    data-testid="input-edit-account-label"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-account-limit">Limite Diário de Mensagens</Label>
                  <Input
                    id="edit-account-limit"
                    type="number"
                    min={1}
                    value={editingAccount.dailyLimit}
                    onChange={(e) => setEditingAccount({ ...editingAccount, dailyLimit: parseInt(e.target.value) || 100 })}
                    data-testid="input-edit-account-limit"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-account-priority">Prioridade</Label>
                  <Input
                    id="edit-account-priority"
                    type="number"
                    min={0}
                    value={editingAccount.priority}
                    onChange={(e) => setEditingAccount({ ...editingAccount, priority: parseInt(e.target.value) || 0 })}
                    data-testid="input-edit-account-priority"
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingAccount(null)}>
                Cancelar
              </Button>
              <Button 
                onClick={() => editingAccount && updateAccountMutation.mutate({ 
                  id: editingAccount.id, 
                  data: { 
                    label: editingAccount.label, 
                    dailyLimit: editingAccount.dailyLimit, 
                    priority: editingAccount.priority 
                  } 
                })}
                disabled={updateAccountMutation.isPending}
                data-testid="button-save-account"
              >
                {updateAccountMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Salvar Alterações
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
