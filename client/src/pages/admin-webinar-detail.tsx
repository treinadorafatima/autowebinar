import { useState, useEffect, useRef } from "react";
import { useParams, useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import OfferEditor from "@/components/OfferEditor";
import ReplayEditor from "@/components/ReplayEditor";
import WebinarAnalytics from "@/components/WebinarAnalytics";
import { 
  ArrowLeft, 
  Save, 
  Trash2, 
  Upload,
  Download,
  ExternalLink,
  Copy,
  Plus,
  Video,
  Settings,
  Palette,
  MessageSquare,
  Code,
  Clock,
  Edit,
  Check,
  X,
  Sparkles,
  Send,
  Loader2,
  Wand2,
  Gift,
  BarChart3,
  FileText,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Globe,
  Monitor,
  Mic,
  ArrowRightLeft,
  Calendar as CalendarIcon,
  Link2,
  Users
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

function DomainConfigSection({ domain, serverHost }: { domain: string; serverHost: string }) {
  const [verifying, setVerifying] = useState(false);
  const [status, setStatus] = useState<{
    configured: boolean;
    message: string;
    recordType?: string;
  } | null>(null);
  const { toast } = useToast();

  const verifyDomain = async () => {
    setVerifying(true);
    try {
      const res = await fetch("/api/verify-domain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, expectedHost: serverHost }),
      });
      const data = await res.json();
      setStatus(data);
      toast({
        title: data.configured ? "Registro Configurado!" : "Registro Pendente",
        description: data.message,
        variant: data.configured ? "default" : "destructive",
      });
    } catch (error) {
      setStatus({ configured: false, message: "Erro ao verificar domínio" });
    }
    setVerifying(false);
  };

  const domainParts = domain.split('.');
  const isRootDomain = domainParts.length === 2 || 
    (domainParts.length === 3 && domainParts[1].length <= 3);
  const isSubdomain = domain.startsWith('www.') || (!isRootDomain && domainParts.length >= 3);
  const rootDomain = isSubdomain ? domainParts.slice(-2).join('.') : domain;
  const subdomain = domain.startsWith('www.') ? 'www' : domainParts[0];

  return (
    <div className="space-y-3">
      <div className={`p-3 rounded-lg border ${
        status?.configured 
          ? "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800" 
          : "bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800"
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <Globe className="w-4 h-4 flex-shrink-0" />
            <span className="text-sm font-medium break-all">https://{domain}</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              navigator.clipboard.writeText(`https://${domain}`);
              toast({ title: "Link copiado!" });
            }}
            className="w-full sm:w-auto flex-shrink-0"
          >
            <Copy className="w-3 h-3 mr-1" />
            <span>Copiar</span>
          </Button>
        </div>
        
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <Button
            size="sm"
            variant={status?.configured ? "default" : "secondary"}
            onClick={verifyDomain}
            disabled={verifying}
            data-testid="button-verify-dns"
            className="w-full sm:w-auto"
          >
            {verifying ? (
              <><RefreshCw className="w-3 h-3 mr-1 animate-spin" /> Verificando...</>
            ) : status?.configured ? (
              <><CheckCircle2 className="w-3 h-3 mr-1" /> Verificado</>
            ) : (
              <><RefreshCw className="w-3 h-3 mr-1" /> Testar Registro</>
            )}
          </Button>
          {status && (
            <span className={`text-xs ${status.configured ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}`}>
              {status.message}
            </span>
          )}
        </div>
      </div>

      <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 p-3 sm:p-4 rounded-lg space-y-4">
        <p className="font-semibold text-sm text-amber-800 dark:text-amber-200">Configuração de Registros</p>
        
        <div className="text-sm text-amber-900 dark:text-amber-100 space-y-4">
          {isRootDomain ? (
            <div className="space-y-2">
              <p className="font-medium">Para domínio raiz ({domain}):</p>
              <div className="bg-white dark:bg-slate-800 p-2 sm:p-3 rounded space-y-2">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
                  <span><strong>Tipo:</strong> A</span>
                </div>
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
                  <span><strong>Host:</strong> @</span>
                  <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText('@'); toast({ title: "Copiado!" }); }} className="w-full sm:w-auto">
                    <Copy className="w-3 h-3 mr-1" /><span>Copiar</span>
                  </Button>
                </div>
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
                  <span><strong>Aponta para:</strong> 216.24.57.1</span>
                  <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText('216.24.57.1'); toast({ title: "Copiado!" }); }} className="w-full sm:w-auto">
                    <Copy className="w-3 h-3 mr-1" /><span>Copiar</span>
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="font-medium">Para subdomínio ({domain}):</p>
              <div className="bg-white dark:bg-slate-800 p-2 sm:p-3 rounded space-y-2">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
                  <span><strong>Tipo:</strong> CNAME</span>
                </div>
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
                  <span><strong>Host:</strong> {subdomain}</span>
                  <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(subdomain); toast({ title: "Copiado!" }); }} className="w-full sm:w-auto">
                    <Copy className="w-3 h-3 mr-1" /><span>Copiar</span>
                  </Button>
                </div>
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
                  <span className="break-all"><strong>Aponta para:</strong> {serverHost}</span>
                  <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(serverHost); toast({ title: "Copiado!" }); }} className="w-full sm:w-auto">
                    <Copy className="w-3 h-3 mr-1" /><span>Copiar</span>
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="bg-blue-50 dark:bg-blue-900/30 p-3 rounded border border-blue-200 dark:border-blue-800">
            <p className="font-medium text-blue-800 dark:text-blue-200 mb-2">Dica: Configure ambos!</p>
            <p className="text-xs text-blue-700 dark:text-blue-300">
              Para melhor funcionamento, configure tanto o domínio raiz quanto o www:
            </p>
            <ul className="text-xs text-blue-700 dark:text-blue-300 mt-1 space-y-1">
              <li><strong>{rootDomain}</strong> - Registro A apontando para 216.24.57.1</li>
              <li><strong>www.{rootDomain}</strong> - Registro CNAME apontando para {serverHost}</li>
            </ul>
          </div>

          <p className="text-xs text-amber-700 dark:text-amber-300">
            Após configurar os registros, clique em "Testar Registro" para confirmar. A propagação pode levar de 15 minutos a 24 horas.
          </p>
        </div>
      </div>
    </div>
  );
}

interface Webinar {
  id: string;
  name: string;
  slug: string;
  description: string;
  videoUrl: string;
  uploadedVideoId: string | null;
  videoDuration: number;
  startHour: number;
  startMinute: number;
  timezone: string;
  recurrence: string;
  countdownText: string;
  nextWebinarText: string;
  endedBadgeText: string;
  countdownColor: string;
  liveButtonColor: string;
  backgroundColor: string;
  backgroundImageUrl: string;
  isActive: boolean;
  pageTitle: string;
  pageBadgeText: string;
  pageBackgroundColor: string;
  participantCount: number;
  participantOscillationPercent: number;
  showLiveIndicator: boolean;
  liveIndicatorStyle: "full" | "number" | "hidden";
  showEndedScreen: boolean;
  showNextCountdown: boolean;
  showNextSessionDate: boolean;
  offerDisplayAfterEnd: number;
  showOfferInsteadOfEnded: boolean;
  offerDisplayHours: number;
  offerDisplayMinutes: number;
  offerEnabled: boolean;
  offerDelaySeconds: number;
  offerStartSeconds: number;
  offerEndsAtEnd: boolean;
  offerDurationSeconds: number;
  offerBadgeText: string;
  offerTitle: string;
  offerTitleColor: string;
  offerSubtitle: string;
  offerSubtitleColor: string;
  offerImageUrl: string;
  offerPriceText: string;
  offerPriceBorderColor: string;
  offerPriceBoxBgColor: string;
  offerPriceBoxShadow: boolean;
  offerPriceBoxPadding: string;
  offerPriceIconColor: string;
  offerPriceHighlightColor: string;
  offerPriceLabel: string;
  offerButtonText: string;
  offerButtonUrl: string;
  offerButtonColor: string;
  offerButtonSize: string;
  offerButtonShadow: boolean;
  offerButtonTextColor: string;
  offerBenefits: string;
  bannerEnabled: boolean;
  bannerStartSeconds: number;
  bannerEndsAtEnd: boolean;
  bannerDurationSeconds: number;
  bannerBackgroundColor: string;
  bannerButtonText: string;
  bannerButtonUrl: string;
  bannerButtonColor: string;
  bannerButtonTextColor: string;
  commentTheme?: string;
  customDomain?: string;
  replayEnabled?: boolean;
  replayVideoId?: string | null;
  replayShowControls?: boolean;
  replayAutoplay?: boolean;
  replayThumbnailUrl?: string;
  replayPlayerColor?: string;
  replayPlayerBorderColor?: string;
  replayBackgroundColor?: string;
  replayBadgeText?: string;
  replayTitle?: string;
  replayOfferBadgeText?: string;
  replayOfferTitle?: string;
  replayOfferSubtitle?: string;
  replayOfferImageUrl?: string;
  replayBenefits?: string;
  replayPriceText?: string;
  replayButtonText?: string;
  replayButtonUrl?: string;
  replayButtonColor?: string;
}

interface UploadedVideo {
  id: string;
  uploadedVideoId: string;
  filename: string;
  title?: string;
  duration: number;
}

interface Comment {
  id: string;
  text: string;
  author: string;
  timestamp: number;
  isSimulated: boolean;
  sessionId?: string;
  sessionDate?: string;
  createdAt?: string;
}

export default function AdminWebinarDetailPage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const token = localStorage.getItem("adminToken");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [webinar, setWebinar] = useState<Webinar | null>(null);
  const [videos, setVideos] = useState<UploadedVideo[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [embedCode, setEmbedCode] = useState<string>("");
  const [embedCodeCompact, setEmbedCodeCompact] = useState<string>("");
  const [embedUrl, setEmbedUrl] = useState<string>("");
  const [embedUrlCompact, setEmbedUrlCompact] = useState<string>("");
  const [productionDomain, setProductionDomain] = useState<string>("");
  const [embedType, setEmbedType] = useState<"full" | "compact">("full");
  const [currentUser, setCurrentUser] = useState<any>(null);

  const [formData, setFormData] = useState<Record<string, any>>({
    name: "",
    slug: "",
    description: "",
    uploadedVideoId: "",
    videoDuration: 3600,
    startHour: 18,
    startMinute: 0,
    timezone: "America/Sao_Paulo",
    recurrence: "daily",
    countdownText: "O webinário começa em:",
    nextWebinarText: "Próximo webinário em:",
    endedBadgeText: "TRANSMISSÃO ENCERRADA",
    countdownColor: "#FFD700",
    liveButtonColor: "#e74c3c",
    backgroundColor: "#1a1a2e",
    backgroundImageUrl: "",
    pageTitle: "",
    pageBadgeText: "",
    pageBackgroundColor: "#4A8BB5",
    offerEnabled: false,
    offerDelaySeconds: 300,
    offerStartSeconds: 0,
    offerEndsAtEnd: true,
    offerDurationSeconds: 0,
    offerBadgeText: "OFERTA EXCLUSIVA",
    offerTitle: "",
    offerTitleColor: "#ffffff",
    offerSubtitle: "",
    offerSubtitleColor: "#ffffff",
    offerImageUrl: "",
    offerPriceText: "O valor da inscricao e 12x R$ XX,XX no cartao ou um valor unico de R$ XXX,XX por 12 meses de estudos.",
    offerPriceBorderColor: "#84cc16",
    offerPriceBoxBgColor: "rgba(0,0,0,0.3)",
    offerPriceBoxShadow: true,
    offerPriceBoxPadding: "md",
    offerPriceIconColor: "#84cc16",
    offerPriceHighlightColor: "#eab308",
    offerPriceLabel: "INVESTIMENTO",
    offerButtonText: "FAZER MINHA INSCRICAO AGORA",
    offerButtonUrl: "",
    offerButtonColor: "#22c55e",
    offerButtonSize: "lg",
    offerButtonShadow: true,
    offerButtonTextColor: "#ffffff",
    offerBenefits: "[]",
    bannerEnabled: false,
    bannerStartSeconds: 0,
    bannerEndsAtEnd: true,
    bannerDurationSeconds: 0,
    bannerBackgroundColor: "#1a1a2e",
    bannerButtonText: "Saiba Mais",
    bannerButtonUrl: "",
    bannerButtonColor: "#22c55e",
    bannerButtonTextColor: "#ffffff",
    participantCount: 200,
    participantOscillationPercent: 20,
    showLiveIndicator: true,
    liveIndicatorStyle: "full",
    showEndedScreen: true,
    showNextCountdown: true,
    showNextSessionDate: true,
    offerDisplayAfterEnd: 0,
    showOfferInsteadOfEnded: false,
    offerDisplayHours: 0,
    offerDisplayMinutes: 30,
    replayEnabled: false,
    replayVideoId: "",
    replayShowControls: true,
    replayAutoplay: false,
    replayThumbnailUrl: "",
    replayPlayerColor: "#3b82f6",
    replayPlayerBorderColor: "#ffffff",
    replayBackgroundColor: "#4A8BB5",
    replayBadgeText: "",
    replayTitle: "",
    replayOfferBadgeText: "",
    replayOfferTitle: "",
    replayOfferSubtitle: "",
    replayOfferImageUrl: "",
    replayBenefits: "[]",
    replayPriceText: "",
    replayButtonText: "FAZER MINHA INSCRIÇÃO AGORA",
    replayButtonUrl: "",
    replayButtonColor: "#22c55e",
    // SEO e compartilhamento
    seoSiteName: "",
    seoPageTitle: "",
    seoDescription: "",
    seoFaviconUrl: "",
    seoShareImageUrl: "",
  });

  const [benefitsList, setBenefitsList] = useState<string[]>([]);
  const [newBenefit, setNewBenefit] = useState("");
  
  const [replayBenefitsList, setReplayBenefitsList] = useState<string[]>([]);
  const [newReplayBenefit, setNewReplayBenefit] = useState("");

  const [userRole, setUserRole] = useState<string>("user");
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [adminsList, setAdminsList] = useState<{ id: string; name: string; email: string }[]>([]);
  const [selectedAdminId, setSelectedAdminId] = useState<string>("");
  const [transferring, setTransferring] = useState(false);
  const isSuperadmin = userRole === "superadmin";

  const [newComment, setNewComment] = useState({ author: "", text: "", hours: 0, minutes: 0, seconds: 0 });
  const [editingComment, setEditingComment] = useState<Comment | null>(null);
  const [editHours, setEditHours] = useState(0);
  const [editMinutes, setEditMinutes] = useState(0);
  const [editSeconds, setEditSeconds] = useState(0);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteContent, setPasteContent] = useState("");
  const [pasteLoading, setPasteLoading] = useState(false);
  const [commentTheme, setCommentTheme] = useState("dark");
  const [leadsEnabled, setLeadsEnabled] = useState(false);
  const [leadsCollectEmail, setLeadsCollectEmail] = useState(true);
  const [leadsCollectWhatsapp, setLeadsCollectWhatsapp] = useState(true);
  const [leads, setLeads] = useState<any[]>([]);
  
  // Real comments states
  const [realComments, setRealComments] = useState<Comment[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [sessionDates, setSessionDates] = useState<string[]>([]);
  
  // Advanced date filter states for real comments
  const [dateFilterType, setDateFilterType] = useState<'all' | 'today' | 'yesterday' | 'week' | 'month' | 'custom'>('all');
  const [customDateFrom, setCustomDateFrom] = useState<Date | undefined>(undefined);
  const [customDateTo, setCustomDateTo] = useState<Date | undefined>(undefined);
  const [selectedCommentIds, setSelectedCommentIds] = useState<Set<string>>(new Set());
  const [showDatePicker, setShowDatePicker] = useState(false);
  
  // Clear selection when date filter changes
  function handleDateFilterChange(filterType: 'all' | 'today' | 'yesterday' | 'week' | 'month' | 'custom') {
    setSelectedCommentIds(new Set());
    setDateFilterType(filterType);
  }

  // AI Designer states
  const [aiMessage, setAiMessage] = useState("");
  const [aiConversation, setAiConversation] = useState<{ role: "user" | "assistant"; content: string }[]>([]);

  // HLS conversion states
  const [hlsStatus, setHlsStatus] = useState<string | null>(null);
  const [hlsPlaylistUrl, setHlsPlaylistUrl] = useState<string | null>(null);
  const [hlsConverting, setHlsConverting] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  
  // Transcription states
  const [transcription, setTranscription] = useState<{ id: number; status: string; transcribedText: string | null; error: string | null } | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<Record<string, string> | null>(null);
  const aiChatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!token) {
      setLocation("/login");
      return;
    }
    async function fetchCurrentUser() {
      try {
        const res = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setCurrentUser(data);
          setUserRole(data.role || "user");
        }
      } catch (error) {
        console.error("Erro ao carregar usuário atual:", error);
      }
    }
    fetchCurrentUser();
    fetchWebinar();
    fetchVideos();
  }, [params.id]);

  useEffect(() => {
    if (formData.uploadedVideoId) {
      checkHlsStatus(formData.uploadedVideoId);
    }
  }, [formData.uploadedVideoId]);

  // Polling to check HLS status when processing
  useEffect(() => {
    if (hlsStatus === "processing" && formData.uploadedVideoId) {
      const interval = setInterval(() => {
        checkHlsStatus(formData.uploadedVideoId);
      }, 30000); // Check every 30 seconds
      return () => clearInterval(interval);
    }
  }, [hlsStatus, formData.uploadedVideoId]);

  // Refetch real comments when selected date changes
  useEffect(() => {
    if (webinar && selectedDate) {
      fetchRealComments(webinar.id, selectedDate, false);
    }
  }, [selectedDate, webinar?.id]);

  async function fetchWebinar() {
    try {
      const res = await fetch(`/api/webinars/${params.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Webinário não encontrado");
      const data = await res.json();
      setWebinar(data);
      setFormData({
        name: data.name || "",
        slug: data.slug || "",
        description: data.description || "",
        uploadedVideoId: data.uploadedVideoId || "",
        videoDuration: data.videoDuration || 3600,
        startHour: data.startHour ?? 18,
        startMinute: data.startMinute ?? 0,
        timezone: data.timezone || "America/Sao_Paulo",
        recurrence: data.recurrence || "daily",
        countdownText: data.countdownText || "O webinário começa em:",
        nextWebinarText: data.nextWebinarText || "Próximo webinário em:",
        endedBadgeText: data.endedBadgeText || "TRANSMISSÃO ENCERRADA",
        countdownColor: data.countdownColor || "#FFD700",
        liveButtonColor: data.liveButtonColor || "#e74c3c",
        backgroundColor: data.backgroundColor || "#1a1a2e",
        backgroundImageUrl: data.backgroundImageUrl || "",
        pageTitle: data.pageTitle || "",
        pageBadgeText: data.pageBadgeText || "",
        pageBackgroundColor: data.pageBackgroundColor || "#4A8BB5",
        participantCount: data.participantCount ?? 200,
        participantOscillationPercent: data.participantOscillationPercent ?? 20,
        offerEnabled: data.offerEnabled || false,
        offerDelaySeconds: data.offerDelaySeconds || 300,
        offerStartSeconds: data.offerStartSeconds || 0,
        offerEndsAtEnd: data.offerEndsAtEnd !== false,
        offerDurationSeconds: data.offerDurationSeconds || 0,
        offerBadgeText: data.offerBadgeText || "OFERTA EXCLUSIVA",
        offerTitle: data.offerTitle || "",
        offerTitleColor: data.offerTitleColor || "#ffffff",
        offerSubtitle: data.offerSubtitle || "",
        offerSubtitleColor: data.offerSubtitleColor || "#ffffff",
        offerImageUrl: data.offerImageUrl || "",
        offerPriceText: data.offerPriceText || "O valor da inscricao e 12x R$ XX,XX no cartao ou um valor unico de R$ XXX,XX por 12 meses de estudos.",
        offerPriceBorderColor: data.offerPriceBorderColor || "#84cc16",
        offerPriceBoxBgColor: data.offerPriceBoxBgColor || "rgba(0,0,0,0.3)",
        offerPriceBoxShadow: data.offerPriceBoxShadow !== false,
        offerPriceBoxPadding: data.offerPriceBoxPadding || "md",
        offerPriceIconColor: data.offerPriceIconColor || "#84cc16",
        offerPriceHighlightColor: data.offerPriceHighlightColor || "#eab308",
        offerPriceLabel: data.offerPriceLabel || "INVESTIMENTO",
        offerButtonText: data.offerButtonText || "FAZER MINHA INSCRICAO AGORA",
        offerButtonUrl: data.offerButtonUrl || "",
        offerButtonColor: data.offerButtonColor || "#22c55e",
        offerButtonSize: data.offerButtonSize || "lg",
        offerButtonShadow: data.offerButtonShadow !== false,
        offerButtonTextColor: data.offerButtonTextColor || "#ffffff",
        offerBenefits: data.offerBenefits || "[]",
        bannerEnabled: data.bannerEnabled || false,
        bannerStartSeconds: data.bannerStartSeconds || 0,
        bannerEndsAtEnd: data.bannerEndsAtEnd !== false,
        bannerDurationSeconds: data.bannerDurationSeconds || 0,
        bannerBackgroundColor: data.bannerBackgroundColor || "#1a1a2e",
        bannerButtonText: data.bannerButtonText || "Saiba Mais",
        bannerButtonUrl: data.bannerButtonUrl || "",
        bannerButtonColor: data.bannerButtonColor || "#22c55e",
        bannerButtonTextColor: data.bannerButtonTextColor || "#ffffff",
        showLiveIndicator: data.showLiveIndicator !== false,
        liveIndicatorStyle: data.liveIndicatorStyle || "full",
        showEndedScreen: data.showEndedScreen !== false,
        showNextCountdown: data.showNextCountdown !== false,
        showNextSessionDate: data.showNextSessionDate !== false,
        offerDisplayAfterEnd: data.offerDisplayAfterEnd || 0,
        showOfferInsteadOfEnded: data.showOfferInsteadOfEnded || false,
        offerDisplayHours: data.offerDisplayHours || 0,
        offerDisplayMinutes: data.offerDisplayMinutes || 30,
        replayEnabled: data.replayEnabled || false,
        replayVideoId: data.replayVideoId || "",
        replayShowControls: data.replayShowControls !== false,
        replayAutoplay: data.replayAutoplay || false,
        replayThumbnailUrl: data.replayThumbnailUrl || "",
        replayPlayerColor: data.replayPlayerColor || "#3b82f6",
        replayPlayerBorderColor: data.replayPlayerBorderColor || "#ffffff",
        replayBackgroundColor: data.replayBackgroundColor || "#4A8BB5",
        replayBadgeText: data.replayBadgeText || "",
        replayTitle: data.replayTitle || "",
        replayOfferBadgeText: data.replayOfferBadgeText || "",
        replayOfferTitle: data.replayOfferTitle || "",
        replayOfferSubtitle: data.replayOfferSubtitle || "",
        replayOfferImageUrl: data.replayOfferImageUrl || "",
        replayBenefits: data.replayBenefits || "[]",
        replayPriceText: data.replayPriceText || "",
        replayButtonText: data.replayButtonText || "FAZER MINHA INSCRIÇÃO AGORA",
        replayButtonUrl: data.replayButtonUrl || "",
        replayButtonColor: data.replayButtonColor || "#22c55e",
        // SEO e compartilhamento
        seoSiteName: data.seoSiteName || "",
        seoPageTitle: data.seoPageTitle || "",
        seoDescription: data.seoDescription || "",
        seoFaviconUrl: data.seoFaviconUrl || "",
        seoShareImageUrl: data.seoShareImageUrl || "",
      });
      setCommentTheme(data.commentTheme || "dark");
      setLeadsEnabled(data.leadsEnabled || false);
      setLeadsCollectEmail(data.leadsCollectEmail !== false);
      setLeadsCollectWhatsapp(data.leadsCollectWhatsapp !== false);
      try {
        const parsedBenefits = JSON.parse(data.offerBenefits || "[]");
        setBenefitsList(Array.isArray(parsedBenefits) ? parsedBenefits : []);
      } catch {
        setBenefitsList([]);
      }
      try {
        const parsedReplayBenefits = JSON.parse(data.replayBenefits || "[]");
        setReplayBenefitsList(Array.isArray(parsedReplayBenefits) ? parsedReplayBenefits : []);
      } catch {
        setReplayBenefitsList([]);
      }
      await fetchComments(data.id);
      await fetchRealComments(data.id);
      await fetchLeads(data.id);
      await fetchEmbedCode(data.slug);
      await fetchTranscription(data.id);
      await fetchLeadFormConfig(data.id);
      if (data.uploadedVideoId) {
        await checkHlsStatus(data.uploadedVideoId);
      }
    } catch (error) {
      toast({ title: "Erro ao carregar webinário", variant: "destructive" });
      setLocation("/admin/webinars");
    } finally {
      setLoading(false);
    }
  }

  async function fetchLeadFormConfig(webinarId: string) {
    try {
      const res = await fetch(`/api/webinars/${webinarId}/lead-form-config`);
      if (res.ok) {
        const config = await res.json();
        setLeadsCollectEmail(config.collectEmail !== false);
        setLeadsCollectWhatsapp(config.collectWhatsapp !== false);
        setFormData((prev: any) => ({
          ...prev,
          leadFormTitle: config.title || "Inscreva-se no Webinário",
          leadFormSubtitle: config.subtitle || "",
          leadFormButtonText: config.buttonText || "Quero Participar",
          leadFormSuccessMessage: config.successMessage || "Inscrição realizada com sucesso!",
          leadFormConsentText: config.consentText || "Concordo em receber comunicações sobre este webinário",
          leadFormRedirectUrl: config.redirectUrl || "",
          leadFormBgColor: config.backgroundColor || "#1a1a2e",
          leadFormCardColor: config.cardBackgroundColor || "#16213e",
          leadFormButtonColor: config.buttonColor || "#22c55e",
          leadFormButtonTextColor: config.buttonTextColor || "#ffffff",
          leadFormTextColor: config.textColor || "#ffffff",
          leadFormInputColor: config.inputBackgroundColor || "#0f0f23",
          leadFormInputBorderColor: config.inputBorderColor || "#374151",
          leadFormLabelColor: config.labelColor || "#9ca3af",
          leadFormFontFamily: config.fontFamily || "Inter, system-ui, sans-serif",
          leadFormBorderRadius: config.borderRadius || "8",
          leadFormCollectCity: config.collectCity || false,
          leadFormCollectState: config.collectState || false,
          leadFormRequireConsent: config.requireConsent !== false,
          leadFormShowNextSession: config.showNextSession !== false,
        }));
      }
    } catch (error) {
      console.error("Erro ao carregar config do formulário:", error);
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

  async function checkHlsStatus(videoId: string) {
    if (!videoId) {
      setHlsStatus(null);
      setHlsPlaylistUrl(null);
      return;
    }
    try {
      const res = await fetch(`/api/webinar/videos/${videoId}/hls-status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        // Backend returns { status: ..., hlsUrl: ... }
        setHlsStatus(data.status || null);
        setHlsPlaylistUrl(data.hlsUrl || null);
      }
    } catch (error) {
      console.error("Erro ao verificar status HLS:", error);
    }
  }

  async function startHlsConversion(videoId: string) {
    if (!videoId || hlsConverting) return;
    setHlsConverting(true);
    try {
      const res = await fetch(`/api/webinar/videos/${videoId}/convert-hls`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast({ title: "Conversão HLS iniciada!", description: "O processo leva cerca de 15-30 minutos para vídeos longos." });
        setHlsStatus("processing");
        setHlsPlaylistUrl(null); // Clear previous URL when starting new conversion
      } else {
        const err = await res.json();
        toast({ title: "Erro ao iniciar conversão", description: err.error, variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Erro ao iniciar conversão HLS", variant: "destructive" });
    } finally {
      setHlsConverting(false);
    }
  }

  async function fetchTranscription(webinarId: string) {
    try {
      const res = await fetch(`/api/webinars/${webinarId}/transcription`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data) {
          setTranscription(data);
        }
      }
    } catch (error) {
      console.error("Erro ao carregar transcrição:", error);
    }
  }

  async function startTranscription() {
    if (!webinar || isTranscribing) return;
    setIsTranscribing(true);
    try {
      const res = await fetch(`/api/webinars/${webinar.id}/transcribe-video`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        toast({ 
          title: "Transcrição iniciada!", 
          description: "O processo pode levar alguns minutos dependendo da duração do vídeo." 
        });
        setTranscription({ id: data.transcriptionId, status: "processing", transcribedText: null, error: null });
        pollTranscriptionStatus(webinar.id);
      } else {
        const err = await res.json();
        toast({ title: "Erro ao transcrever", description: err.error, variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Erro ao iniciar transcrição", variant: "destructive" });
    } finally {
      setIsTranscribing(false);
    }
  }

  function pollTranscriptionStatus(webinarId: string) {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/webinars/${webinarId}/transcription`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data) {
            setTranscription(data);
            if (data.status === "completed" || data.status === "failed") {
              clearInterval(interval);
              if (data.status === "completed") {
                toast({ title: "Transcrição concluída!", description: "O texto do vídeo foi extraído com sucesso." });
              } else if (data.status === "failed") {
                toast({ title: "Erro na transcrição", description: data.error || "Falha ao transcrever o vídeo.", variant: "destructive" });
              }
            }
          }
        }
      } catch (error) {
        console.error("Erro ao verificar status da transcrição:", error);
        clearInterval(interval);
      }
    }, 5000);
  }

  async function fetchComments(webinarId: string) {
    try {
      const res = await fetch(`/api/webinars/${webinarId}/comments/simulated`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setComments(data || []);
      }
    } catch (error) {
      console.error("Erro ao carregar comentários:", error);
    }
  }

  async function fetchRealComments(webinarId: string, date?: string, updateDates: boolean = true) {
    try {
      const url = date 
        ? `/api/webinars/${webinarId}/real-comments?date=${date}`
        : `/api/webinars/${webinarId}/real-comments`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        // Only extract unique dates when fetching all comments (not when filtering)
        if (updateDates && !date) {
          const dates = Array.from(new Set(data.map((c: Comment) => c.sessionDate).filter(Boolean))).sort().reverse() as string[];
          setSessionDates(dates);
          // Set initial selected date to first available date
          if (dates.length > 0) {
            setSelectedDate(dates[0]);
            // Filter comments to show only from the first date
            const filteredData = data.filter((c: Comment) => c.sessionDate === dates[0]);
            setRealComments(filteredData);
          } else {
            setRealComments(data || []);
          }
        } else {
          setRealComments(data || []);
        }
      }
    } catch (error) {
      console.error("Erro ao carregar comentários reais:", error);
    }
  }

  async function handleReleaseComment(commentId: string) {
    if (!webinar) return;
    try {
      const res = await fetch(`/api/webinars/${webinar.id}/comments/${commentId}/release`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast({ title: "Comentário liberado! Agora é simulado." });
        await fetchRealComments(webinar.id, selectedDate);
        await fetchComments(webinar.id);
      }
    } catch (error) {
      toast({ title: "Erro ao liberar comentário", variant: "destructive" });
    }
  }

  async function handleRejectComment(commentId: string) {
    if (!webinar) return;
    try {
      const res = await fetch(`/api/webinars/${webinar.id}/comments/${commentId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast({ title: "Comentário rejeitado!" });
        await fetchRealComments(webinar.id, selectedDate);
      }
    } catch (error) {
      toast({ title: "Erro ao rejeitar comentário", variant: "destructive" });
    }
  }

  // Filter comments by date range
  function getFilteredComments(): Comment[] {
    if (!realComments.length) return [];
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(today);
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    
    return realComments.filter(comment => {
      if (!comment.createdAt) return true;
      const commentDate = new Date(comment.createdAt);
      
      switch (dateFilterType) {
        case 'today':
          return commentDate >= today;
        case 'yesterday':
          return commentDate >= yesterday && commentDate < today;
        case 'week':
          return commentDate >= weekAgo;
        case 'month':
          return commentDate >= monthAgo;
        case 'custom':
          if (customDateFrom && customDateTo) {
            const from = new Date(customDateFrom);
            from.setHours(0, 0, 0, 0);
            const to = new Date(customDateTo);
            to.setHours(23, 59, 59, 999);
            return commentDate >= from && commentDate <= to;
          }
          return true;
        default:
          return true;
      }
    });
  }

  // Approve selected comments to simulated chat
  async function handleApproveToSimulated() {
    if (!webinar || selectedCommentIds.size === 0) return;
    
    const selectedComments = realComments.filter(c => selectedCommentIds.has(c.id));
    let successCount = 0;
    
    for (const comment of selectedComments) {
      try {
        const res = await fetch(`/api/webinars/${webinar.id}/comments/${comment.id}/release`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          successCount++;
        }
      } catch (error) {
        console.error("Erro ao aprovar comentário:", error);
      }
    }
    
    if (successCount > 0) {
      toast({ 
        title: `${successCount} comentário(s) aprovado(s)!`, 
        description: "Os comentários foram adicionados ao chat simulado." 
      });
      setSelectedCommentIds(new Set());
      await fetchRealComments(webinar.id, selectedDate);
      await fetchComments(webinar.id);
    } else {
      toast({ title: "Erro ao aprovar comentários", variant: "destructive" });
    }
  }

  // Toggle comment selection
  function toggleCommentSelection(commentId: string) {
    const newSelected = new Set(selectedCommentIds);
    if (newSelected.has(commentId)) {
      newSelected.delete(commentId);
    } else {
      newSelected.add(commentId);
    }
    setSelectedCommentIds(newSelected);
  }

  // Select all filtered comments
  function selectAllFilteredComments() {
    const filtered = getFilteredComments();
    const allSelected = filtered.every(c => selectedCommentIds.has(c.id));
    if (allSelected) {
      setSelectedCommentIds(new Set());
    } else {
      setSelectedCommentIds(new Set(filtered.map(c => c.id)));
    }
  }

  async function fetchLeads(webinarId: string) {
    try {
      const res = await fetch(`/api/webinars/${webinarId}/leads`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setLeads(data || []);
      }
    } catch (error) {
      console.error("Erro ao carregar leads:", error);
    }
  }

  async function fetchEmbedCode(slug: string, domain?: string) {
    try {
      const url = domain 
        ? `/api/webinars/${slug}/embed-code?base_url=${encodeURIComponent(domain)}`
        : `/api/webinars/${slug}/embed-code`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setEmbedCode(data.embedCodeFull || data.embedCode || "");
        setEmbedCodeCompact(data.embedCodeCompact || "");
        setEmbedUrl(data.embedUrlFull || data.embedUrl || "");
        setEmbedUrlCompact(data.embedUrlCompact || "");
      }
    } catch (error) {
      console.error("Erro ao carregar embed:", error);
    }
  }

  async function handleSave() {
    if (!webinar) return;
    setSaving(true);
    try {
      const selectedVideo = videos.find(v => v.uploadedVideoId === formData.uploadedVideoId);
      const res = await fetch(`/api/webinars/${webinar.id}`, {
        method: "PATCH",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({
          ...formData,
          videoDuration: selectedVideo?.duration || formData.videoDuration,
          videoUrl: formData.uploadedVideoId ? `/api/webinar/video/${formData.uploadedVideoId}` : "",
          commentTheme,
          leadsEnabled,
          leadsCollectEmail,
          leadsCollectWhatsapp,
        }),
      });
      if (!res.ok) throw new Error("Erro ao salvar");
      toast({ title: "Webinário salvo com sucesso!" });
      await fetchWebinar();
    } catch (error) {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!webinar || !confirm("Tem certeza que deseja excluir este webinário?")) return;
    try {
      const res = await fetch(`/api/webinars/${webinar.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Erro ao excluir");
      toast({ title: "Webinário excluído!" });
      setLocation("/admin/webinars");
    } catch (error) {
      toast({ title: "Erro ao excluir", variant: "destructive" });
    }
  }

  async function handleDuplicate() {
    if (!webinar) return;
    if (!confirm("Deseja duplicar este webinário? Serão copiadas todas as configurações, comentários simulados e sequências de email/WhatsApp.")) return;
    
    try {
      const res = await fetch(`/api/webinars/${webinar.id}/duplicate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao duplicar");
      toast({ title: "Webinário duplicado com sucesso!", description: `Novo webinário: ${data.webinar?.name}` });
      setLocation(`/admin/webinars/${data.webinar?.id}`);
    } catch (error: any) {
      toast({ title: "Erro ao duplicar", description: error.message, variant: "destructive" });
    }
  }

  async function fetchAdminsList() {
    try {
      const res = await fetch("/api/admins", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const filteredAdmins = data.filter((a: any) => a.id !== webinar?.ownerId);
        setAdminsList(filteredAdmins);
        if (filteredAdmins.length === 0) {
          toast({ title: "Aviso", description: "Não há outras contas disponíveis para transferência" });
        }
      } else {
        toast({ title: "Erro ao carregar contas", variant: "destructive" });
        setAdminsList([]);
      }
    } catch (error) {
      console.error("Erro ao carregar lista de admins:", error);
      toast({ title: "Erro ao carregar lista de contas", variant: "destructive" });
      setAdminsList([]);
    }
  }

  async function handleOpenTransferModal() {
    if (!isSuperadmin) {
      toast({ title: "Acesso negado", description: "Apenas superadmin pode transferir webinários", variant: "destructive" });
      return;
    }
    await fetchAdminsList();
    setSelectedAdminId("");
    setShowTransferModal(true);
  }

  async function handleTransfer() {
    if (!webinar || !selectedAdminId) return;
    setTransferring(true);
    
    try {
      const res = await fetch(`/api/webinars/${webinar.id}/transfer`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ targetAdminId: selectedAdminId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao transferir");
      
      const t = data.transferred;
      toast({ 
        title: "Webinário transferido com sucesso!", 
        description: `Vídeo: ${t?.includedVideo ? "Sim" : "Não"} | Emails: ${t?.emailSequences || 0} | WhatsApp: ${t?.whatsappSequences || 0} | Roteiros: ${t?.scripts || 0}`
      });
      setShowTransferModal(false);
      setLocation("/admin/webinars");
    } catch (error: any) {
      toast({ title: "Erro ao transferir", description: error.message, variant: "destructive" });
    } finally {
      setTransferring(false);
    }
  }

  async function handleAddComment() {
    if (!webinar || !newComment.author.trim() || !newComment.text.trim()) {
      toast({ title: "Preencha autor e mensagem", variant: "destructive" });
      return;
    }
    const timestamp = (newComment.hours * 3600) + (newComment.minutes * 60) + newComment.seconds;
    try {
      const res = await fetch(`/api/webinars/${webinar.id}/comments`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ author: newComment.author, text: newComment.text, timestamp }),
      });
      if (!res.ok) throw new Error("Erro ao adicionar");
      toast({ title: "Comentário adicionado!" });
      setNewComment({ author: "", text: "", hours: 0, minutes: 0, seconds: 0 });
      await fetchComments(webinar.id);
    } catch (error) {
      toast({ title: "Erro ao adicionar comentário", variant: "destructive" });
    }
  }

  function handleExportComments() {
    if (comments.length === 0) {
      toast({ title: "Nenhum comentário para exportar", variant: "destructive" });
      return;
    }
    const lines = comments
      .sort((a, b) => a.timestamp - b.timestamp)
      .map(c => {
        const h = Math.floor(c.timestamp / 3600);
        const m = Math.floor((c.timestamp % 3600) / 60);
        const s = c.timestamp % 60;
        const timeStr = `[${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}]`;
        return `${timeStr} ${c.author}: ${c.text}`;
      })
      .join("\n");
    const blob = new Blob([lines], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `comentarios-${webinar?.slug || "webinar"}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: "Comentários exportados!" });
  }

  function startEditComment(comment: Comment) {
    setEditingComment(comment);
    setEditHours(Math.floor(comment.timestamp / 3600));
    setEditMinutes(Math.floor((comment.timestamp % 3600) / 60));
    setEditSeconds(comment.timestamp % 60);
  }

  async function handleDeleteComment(commentId: string) {
    if (!webinar || !confirm("Tem certeza que deseja excluir este comentário?")) return;
    try {
      const res = await fetch(`/api/webinars/${webinar.id}/comments/${commentId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Erro ao excluir");
      toast({ title: "Comentário excluído!" });
      await fetchComments(webinar.id);
    } catch (error) {
      toast({ title: "Erro ao excluir comentário", variant: "destructive" });
    }
  }

  async function handleUpdateComment() {
    if (!editingComment || !webinar) return;
    if (!editingComment.author.trim() || !editingComment.text.trim()) {
      toast({ title: "Preencha autor e mensagem", variant: "destructive" });
      return;
    }
    const timestamp = (editHours * 3600) + (editMinutes * 60) + editSeconds;
    try {
      const res = await fetch(`/api/webinars/${webinar.id}/comments/${editingComment.id}`, {
        method: "PATCH",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({
          text: editingComment.text,
          author: editingComment.author,
          timestamp,
        }),
      });
      if (!res.ok) throw new Error("Erro ao atualizar");
      toast({ title: "Comentário atualizado!" });
      setEditingComment(null);
      await fetchComments(webinar.id);
    } catch (error) {
      toast({ title: "Erro ao atualizar comentário", variant: "destructive" });
    }
  }

  async function handleImportComments(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !webinar) return;

    const formDataUpload = new FormData();
    formDataUpload.append("file", file);

    try {
      const res = await fetch(`/api/webinars/${webinar.id}/upload-comments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formDataUpload,
      });
      if (!res.ok) throw new Error("Erro ao importar");
      const result = await res.json();
      toast({ title: `Importados: ${result.imported}, Erros: ${result.errors}` });
      await fetchComments(webinar.id);
    } catch (error) {
      toast({ title: "Erro ao importar comentários", variant: "destructive" });
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handlePasteImport() {
    if (!pasteContent.trim() || !webinar || pasteLoading) return;
    
    const lines = pasteContent.split('\n').filter(l => l.trim());
    console.log("Frontend: Sending", lines.length, "lines to import");
    
    setPasteLoading(true);
    try {
      // Use new JSON endpoint that bypasses file upload limits
      const res = await fetch(`/api/webinars/${webinar.id}/import-comments-text`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ content: pasteContent }),
      });
      if (!res.ok) throw new Error("Erro ao importar");
      const result = await res.json();
      toast({ title: `Importados: ${result.imported}, Erros: ${result.errors}` });
      await fetchComments(webinar.id);
      setShowPasteModal(false);
      setPasteContent("");
    } catch (error) {
      toast({ title: "Erro ao importar comentários", variant: "destructive" });
    }
    setPasteLoading(false);
  }

  function formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}min`;
  }

  function formatTimestamp(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast({ title: "Copiado!" });
  }

  async function sendAiMessage() {
    if (!aiMessage.trim() || aiLoading || !webinar) return;

    const userMessage = aiMessage.trim();
    setAiMessage("");
    setAiConversation(prev => [...prev, { role: "user", content: userMessage }]);
    setAiLoading(true);
    setAiSuggestions(null);

    try {
      const res = await fetch(`/api/webinars/${webinar.id}/ai-designer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: userMessage,
          conversationHistory: aiConversation,
        }),
      });

      if (!res.ok) throw new Error("Erro ao comunicar com IA");

      const data = await res.json();
      setAiConversation(prev => [...prev, { role: "assistant", content: data.message }]);
      
      if (data.suggestions) {
        setAiSuggestions(data.suggestions);
      }
    } catch (error) {
      toast({ title: "Erro ao enviar mensagem para IA", variant: "destructive" });
    } finally {
      setAiLoading(false);
      setTimeout(() => {
        aiChatRef.current?.scrollTo({ top: aiChatRef.current.scrollHeight, behavior: "smooth" });
      }, 100);
    }
  }

  function applyAiSuggestions() {
    if (!aiSuggestions) return;
    
    const updates: Partial<typeof formData> = {};
    if (aiSuggestions.backgroundColor) updates.backgroundColor = aiSuggestions.backgroundColor;
    if (aiSuggestions.countdownColor) updates.countdownColor = aiSuggestions.countdownColor;
    if (aiSuggestions.liveButtonColor) updates.liveButtonColor = aiSuggestions.liveButtonColor;
    if (aiSuggestions.countdownText) updates.countdownText = aiSuggestions.countdownText;
    if (aiSuggestions.nextWebinarText) updates.nextWebinarText = aiSuggestions.nextWebinarText;
    if (aiSuggestions.endedBadgeText) updates.endedBadgeText = aiSuggestions.endedBadgeText;

    setFormData(prev => ({ ...prev, ...updates }));
    setAiSuggestions(null);
    toast({ title: "Sugestões aplicadas! Clique em Salvar para confirmar." });
  }

  function clearAiConversation() {
    setAiConversation([]);
    setAiSuggestions(null);
    setAiMessage("");
  }

  function formatAiMessage(content: string): string {
    return content.replace(/```json[\s\S]*?```/g, "").trim();
  }

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-24 mt-1" />
          </div>
        </div>
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!webinar) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Webinário não encontrado</p>
        <Link href="/admin/webinars">
          <Button variant="outline" className="mt-4">Voltar</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/admin/webinars">
            <Button variant="ghost" size="icon" data-testid="button-back" title="Voltar para lista">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight truncate">{webinar.name}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-sm text-muted-foreground">/{webinar.slug}</p>
              <Badge 
                variant={webinar.isActive ? "default" : "secondary"} 
                className="text-xs"
              >
                {webinar.isActive ? "Ativo" : "Inativo"}
              </Badge>
            </div>
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Button 
            variant="outline"
            size="sm"
            onClick={() => window.open(`/w/${webinar.slug}`, "_blank")}
            title="Visualizar página pública"
            data-testid="button-preview-webinar"
          >
            <ExternalLink className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Visualizar</span>
          </Button>
          <Button 
            variant="outline"
            size="sm"
            onClick={handleDuplicate}
            title="Duplicar webinário com todas as configurações"
            data-testid="button-duplicate-webinar"
          >
            <Copy className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Duplicar</span>
          </Button>
          {isSuperadmin && (
            <Button 
              variant="outline"
              size="sm"
              onClick={handleOpenTransferModal}
              title="Transferir webinário para outra conta"
              data-testid="button-transfer-webinar"
            >
              <ArrowRightLeft className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Transferir</span>
            </Button>
          )}
          <Button 
            variant="destructive" 
            size="sm"
            onClick={handleDelete}
            title="Excluir webinário"
            data-testid="button-delete-webinar"
          >
            <Trash2 className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Excluir</span>
          </Button>
          <Button 
            size="sm"
            onClick={handleSave} 
            disabled={saving}
            title="Salvar alterações"
            data-testid="button-save-webinar"
          >
            <Save className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">{saving ? "Salvando..." : "Salvar"}</span>
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="config" className="flex flex-col lg:flex-row gap-4 lg:gap-6">
        {/* Sidebar de navegação */}
        <div className="lg:w-48 flex-shrink-0">
          <div className="lg:sticky lg:top-4 space-y-1 bg-muted/30 rounded-lg p-2">
            {/* Geral */}
            <div className="px-2 py-1.5">
              <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Geral</span>
            </div>
            <TabsList className="flex lg:flex-col w-full h-auto bg-transparent gap-1">
              <TabsTrigger value="config" className="w-full justify-start gap-2 px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Settings className="h-4 w-4" />
                <span>Config</span>
              </TabsTrigger>
              <TabsTrigger value="page" className="w-full justify-start gap-2 px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <ExternalLink className="h-4 w-4" />
                <span>Página</span>
              </TabsTrigger>
            </TabsList>
            
            {/* Visual */}
            <div className="px-2 py-1.5 pt-3">
              <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Visual</span>
            </div>
            <TabsList className="flex lg:flex-col w-full h-auto bg-transparent gap-1">
              <TabsTrigger value="appearance" className="w-full justify-start gap-2 px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Palette className="h-4 w-4" />
                <span>Aparência</span>
              </TabsTrigger>
              <TabsTrigger value="offer" className="w-full justify-start gap-2 px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Sparkles className="h-4 w-4" />
                <span>Oferta</span>
              </TabsTrigger>
              <TabsTrigger value="banner" className="w-full justify-start gap-2 px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Gift className="h-4 w-4" />
                <span>Banner</span>
              </TabsTrigger>
            </TabsList>
            
            {/* Mídia */}
            <div className="px-2 py-1.5 pt-3">
              <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Mídia</span>
            </div>
            <TabsList className="flex lg:flex-col w-full h-auto bg-transparent gap-1">
              <TabsTrigger value="video" className="w-full justify-start gap-2 px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Video className="h-4 w-4" />
                <span>Vídeo</span>
              </TabsTrigger>
              <TabsTrigger value="replay" className="w-full justify-start gap-2 px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Video className="h-4 w-4" />
                <span>Replay</span>
                {(currentUser?.webinarLimit || 5) <= 5 && (
                  <Badge variant="outline" className="ml-auto text-xs bg-purple-500/10 text-purple-400 border-purple-500/30">
                    Pro+
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
            
            {/* Interação */}
            <div className="px-2 py-1.5 pt-3">
              <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Interação</span>
            </div>
            <TabsList className="flex lg:flex-col w-full h-auto bg-transparent gap-1">
              <TabsTrigger value="comments" className="w-full justify-start gap-2 px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <MessageSquare className="h-4 w-4" />
                <span>Chat</span>
                <Badge variant="secondary" className="ml-auto h-5 px-1.5 text-xs">{comments.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="real-comments" className="w-full justify-start gap-2 px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <MessageSquare className="h-4 w-4" />
                <span>Chat Real</span>
                <Badge variant="default" className="ml-auto h-5 px-1.5 text-xs">{realComments.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="leads" className="w-full justify-start gap-2 px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Download className="h-4 w-4" />
                <span>Leads</span>
                <Badge variant="outline" className="ml-auto h-5 px-1.5 text-xs">{leads.length}</Badge>
              </TabsTrigger>
            </TabsList>
            
            {/* Integração */}
            <div className="px-2 py-1.5 pt-3">
              <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Integração</span>
            </div>
            <TabsList className="flex lg:flex-col w-full h-auto bg-transparent gap-1">
              <TabsTrigger value="seo" className="w-full justify-start gap-2 px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Globe className="h-4 w-4" />
                <span>SEO</span>
              </TabsTrigger>
              <TabsTrigger value="embed" className="w-full justify-start gap-2 px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Code className="h-4 w-4" />
                <span>Embed</span>
              </TabsTrigger>
              <TabsTrigger value="stats" className="w-full justify-start gap-2 px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <BarChart3 className="h-4 w-4" />
                <span>Estatísticas</span>
              </TabsTrigger>
            </TabsList>
          </div>
        </div>
        
        {/* Área de conteúdo */}
        <div className="flex-1 min-w-0">

        {/* Configurações */}
        <TabsContent value="config">
          <Card>
            <CardHeader>
              <CardTitle>Configurações Básicas</CardTitle>
              <CardDescription>Nome, descrição e agendamento do webinário</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    data-testid="input-webinar-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Slug (URL)</Label>
                  <Input
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                    data-testid="input-webinar-slug"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Descrição</Label>
                <Input
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  data-testid="input-webinar-description"
                />
              </div>

              <div className="space-y-4 border rounded-lg p-4 bg-gradient-to-br from-primary/5 to-secondary/5">
                <Label className="text-base font-semibold block">Conectar Domínio do Webinário</Label>

                <div className="space-y-2">
                  <Label className="text-sm">Domínio Customizado <span className="text-muted-foreground">(opcional)</span></Label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      value={formData.customDomain || ""}
                      onChange={(e) => setFormData({ ...formData, customDomain: e.target.value || undefined })}
                      placeholder="ex: webinar.seusite.com"
                      data-testid="input-custom-domain"
                      className="flex-1"
                    />
                    <Button
                      onClick={handleSave}
                      disabled={saving}
                      data-testid="button-save-domain"
                      className="w-full sm:w-auto"
                    >
                      {saving ? "Salvando..." : "Salvar"}
                    </Button>
                  </div>
                </div>

                {!formData.customDomain ? (
                  <div className="bg-muted/50 p-3 rounded-lg">
                    <p className="text-sm font-medium mb-1">URL atual do webinário:</p>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <code className="text-xs bg-background px-2 py-1.5 rounded break-all">
                        {window.location.protocol}//{window.location.hostname}/w/{formData.slug}
                      </code>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.protocol}//${window.location.hostname}/w/${formData.slug}`);
                          toast({ title: "Link copiado!" });
                        }}
                        data-testid="copy-webinar-url"
                        className="w-full sm:w-auto flex-shrink-0"
                      >
                        <Copy className="w-3 h-3 mr-1" />
                        <span>Copiar</span>
                      </Button>
                    </div>
                  </div>
                ) : (
                  <DomainConfigSection 
                    domain={formData.customDomain} 
                    serverHost={window.location.hostname}
                  />
                )}
              </div>

              <Separator />

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>Hora de Início</Label>
                  <Input
                    type="number"
                    min={0}
                    max={23}
                    value={formData.startHour}
                    onChange={(e) => setFormData({ ...formData, startHour: parseInt(e.target.value) || 0 })}
                    data-testid="input-start-hour"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Minuto de Início</Label>
                  <Input
                    type="number"
                    min={0}
                    max={59}
                    value={formData.startMinute}
                    onChange={(e) => setFormData({ ...formData, startMinute: parseInt(e.target.value) || 0 })}
                    data-testid="input-start-minute"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Fuso Horário</Label>
                  <Select 
                    value={formData.timezone || "America/Sao_Paulo"} 
                    onValueChange={(v) => setFormData({ ...formData, timezone: v })}
                  >
                    <SelectTrigger data-testid="select-timezone">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="America/Sao_Paulo">São Paulo (GMT-3)</SelectItem>
                      <SelectItem value="America/Manaus">Manaus (GMT-4)</SelectItem>
                      <SelectItem value="America/Cuiaba">Cuiabá (GMT-4)</SelectItem>
                      <SelectItem value="America/Rio_Branco">Rio Branco (GMT-5)</SelectItem>
                      <SelectItem value="America/Noronha">Fernando de Noronha (GMT-2)</SelectItem>
                      <SelectItem value="America/New_York">New York (EST)</SelectItem>
                      <SelectItem value="America/Los_Angeles">Los Angeles (PST)</SelectItem>
                      <SelectItem value="Europe/Lisbon">Lisboa (WET)</SelectItem>
                      <SelectItem value="Europe/London">Londres (GMT)</SelectItem>
                      <SelectItem value="Europe/Paris">Paris (CET)</SelectItem>
                      <SelectItem value="UTC">UTC</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    O horário será calculado neste fuso
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Frequência</Label>
                  <Select 
                    value={formData.recurrence} 
                    onValueChange={(v) => setFormData({ ...formData, recurrence: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Diário</SelectItem>
                      <SelectItem value="weekly">Semanal</SelectItem>
                      <SelectItem value="monthly">Mensal</SelectItem>
                      <SelectItem value="once">Único</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Quantidade de Assistentes</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100000}
                    value={formData.participantCount}
                    onChange={(e) => setFormData({ ...formData, participantCount: parseInt(e.target.value) || 0 })}
                    placeholder="Ex: 250"
                    data-testid="input-participant-count"
                  />
                  <p className="text-xs text-muted-foreground">
                    Número base de pessoas assistindo
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Oscilação (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={formData.participantOscillationPercent}
                    onChange={(e) => setFormData({ ...formData, participantOscillationPercent: parseInt(e.target.value) || 0 })}
                    placeholder="Ex: 20"
                    data-testid="input-oscillation-percent"
                  />
                  <p className="text-xs text-muted-foreground">
                    Varia {formData.participantOscillationPercent}% para mais e menos
                  </p>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Mostrar Indicador "AO VIVO"</Label>
                  <Select 
                    value={formData.showLiveIndicator ? "true" : "false"} 
                    onValueChange={(v) => setFormData({ ...formData, showLiveIndicator: v === "true" })}
                  >
                    <SelectTrigger data-testid="select-show-live-indicator">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Sim - Mostrar indicador</SelectItem>
                      <SelectItem value="false">Não - Ocultar indicador</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Controla se o badge "AO VIVO" aparece no vídeo
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Exibição do Contador</Label>
                  <Select 
                    value={formData.liveIndicatorStyle} 
                    onValueChange={(v) => setFormData({ ...formData, liveIndicatorStyle: v })}
                  >
                    <SelectTrigger data-testid="select-live-indicator-style">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full">Numero + "assistindo"</SelectItem>
                      <SelectItem value="number">Apenas o numero</SelectItem>
                      <SelectItem value="hidden">Nao mostrar contador</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Escolha como exibir a quantidade de pessoas
                  </p>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="text-sm font-semibold">Após Webinário Terminar</h3>
                
                {/* Escolha principal: Tela Encerrada OU Oferta no Lugar */}
                <div className="space-y-2">
                  <Label>O que mostrar quando o vídeo terminar?</Label>
                  <Select 
                    value={formData.showOfferInsteadOfEnded ? "offer" : "ended"} 
                    onValueChange={(v) => setFormData({ ...formData, showOfferInsteadOfEnded: v === "offer" })}
                  >
                    <SelectTrigger data-testid="select-post-end-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ended">Tela "Transmissão Encerrada"</SelectItem>
                      <SelectItem value="offer">Apenas a Oferta (sem caixa de vídeo)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Opções da Tela de Encerrado */}
                {!formData.showOfferInsteadOfEnded && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border rounded-lg bg-muted/30">
                      <div className="space-y-2">
                        <Label>Mostrar Badge "Transmissão Encerrada"</Label>
                        <Select 
                          value={formData.showEndedScreen ? "true" : "false"} 
                          onValueChange={(v) => setFormData({ ...formData, showEndedScreen: v === "true" })}
                        >
                          <SelectTrigger data-testid="select-show-ended-screen">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="true">Sim</SelectItem>
                            <SelectItem value="false">Não</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Mostrar Countdown Próxima Sessão</Label>
                        <Select 
                          value={formData.showNextCountdown ? "true" : "false"} 
                          onValueChange={(v) => setFormData({ ...formData, showNextCountdown: v === "true" })}
                        >
                          <SelectTrigger data-testid="select-show-next-countdown">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="true">Sim</SelectItem>
                            <SelectItem value="false">Não</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Mostrar Data Próxima Sessão</Label>
                        <Select 
                          value={formData.showNextSessionDate ? "true" : "false"} 
                          onValueChange={(v) => setFormData({ ...formData, showNextSessionDate: v === "true" })}
                        >
                          <SelectTrigger data-testid="select-show-next-date">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="true">Sim</SelectItem>
                            <SelectItem value="false">Não</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Oferta Abaixo - Horas</Label>
                          <Input
                            type="number"
                            min={0}
                            max={48}
                            value={formData.offerDisplayHours}
                            onChange={(e) => setFormData({ ...formData, offerDisplayHours: parseInt(e.target.value) || 0 })}
                            placeholder="0"
                            data-testid="input-offer-below-hours"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Oferta Abaixo - Minutos</Label>
                          <Input
                            type="number"
                            min={0}
                            max={59}
                            value={formData.offerDisplayMinutes}
                            onChange={(e) => setFormData({ ...formData, offerDisplayMinutes: parseInt(e.target.value) || 0 })}
                            placeholder="0"
                            data-testid="input-offer-below-minutes"
                          />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {(formData.offerDisplayHours > 0 || formData.offerDisplayMinutes > 0)
                          ? `Oferta visível por ${formData.offerDisplayHours}h ${formData.offerDisplayMinutes}min após o término do webinário`
                          : "0h 0min = Não mostrar oferta abaixo"}
                      </p>
                    </div>
                  </>
                )}

                {/* Opções da Oferta no Lugar */}
                {formData.showOfferInsteadOfEnded && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border rounded-lg bg-muted/30">
                    <div className="space-y-2">
                      <Label>Oferta Visível - Horas</Label>
                      <Input
                        type="number"
                        min={0}
                        max={48}
                        value={formData.offerDisplayHours}
                        onChange={(e) => setFormData({ ...formData, offerDisplayHours: parseInt(e.target.value) || 0 })}
                        placeholder="Ex: 2"
                        data-testid="input-offer-display-hours"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Oferta Visível - Minutos</Label>
                      <Input
                        type="number"
                        min={0}
                        max={59}
                        value={formData.offerDisplayMinutes}
                        onChange={(e) => setFormData({ ...formData, offerDisplayMinutes: parseInt(e.target.value) || 0 })}
                        placeholder="Ex: 30"
                        data-testid="input-offer-display-minutes"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <p className="text-xs text-muted-foreground">
                        A caixa do vídeo some e a oferta (da aba Oferta) aparece na página por {formData.offerDisplayHours || 0}h {formData.offerDisplayMinutes || 0}min após o término
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Página */}
        <TabsContent value="page">
          <Card>
            <CardHeader>
              <CardTitle>Configurações da Página</CardTitle>
              <CardDescription>Título, badge e cor de fundo da página pública</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Título da Página</Label>
                <Input
                  value={formData.pageTitle}
                  onChange={(e) => setFormData({ ...formData, pageTitle: e.target.value })}
                  placeholder="Ex: Descubra Como Transformar Sua Vida Financeira"
                  data-testid="input-page-title"
                />
                <p className="text-xs text-muted-foreground">
                  Título principal exibido acima do vídeo
                </p>
              </div>

              <div className="space-y-2">
                <Label>Texto do Badge</Label>
                <Input
                  value={formData.pageBadgeText}
                  onChange={(e) => setFormData({ ...formData, pageBadgeText: e.target.value })}
                  placeholder="Ex: EVENTO EXCLUSIVO"
                  data-testid="input-page-badge"
                />
                <p className="text-xs text-muted-foreground">
                  Badge destacado acima do título
                </p>
              </div>

              <div className="space-y-2">
                <Label>Cor de Fundo da Página</Label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={formData.pageBackgroundColor}
                    onChange={(e) => setFormData({ ...formData, pageBackgroundColor: e.target.value })}
                    className="h-10 w-14 rounded cursor-pointer border border-input"
                  />
                  <Input
                    value={formData.pageBackgroundColor}
                    onChange={(e) => setFormData({ ...formData, pageBackgroundColor: e.target.value })}
                    data-testid="input-page-bg-color"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Cor de fundo principal da página pública
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Aparência */}
        <TabsContent value="appearance">
          <Card>
            <CardHeader>
              <CardTitle>Aparência do Player</CardTitle>
              <CardDescription>Cores e mensagens exibidas no player de vídeo</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Texto do Countdown</Label>
                  <Input
                    value={formData.countdownText}
                    onChange={(e) => setFormData({ ...formData, countdownText: e.target.value })}
                    data-testid="input-countdown-text"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Texto Próximo Webinário</Label>
                  <Input
                    value={formData.nextWebinarText}
                    onChange={(e) => setFormData({ ...formData, nextWebinarText: e.target.value })}
                    data-testid="input-next-text"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Texto Transmissão Encerrada</Label>
                <Input
                  value={formData.endedBadgeText}
                  onChange={(e) => setFormData({ ...formData, endedBadgeText: e.target.value })}
                  data-testid="input-ended-text"
                />
              </div>

              <Separator />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Cor do Countdown</Label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={formData.countdownColor}
                      onChange={(e) => setFormData({ ...formData, countdownColor: e.target.value })}
                      className="h-10 w-14 rounded cursor-pointer border border-input"
                    />
                    <Input
                      value={formData.countdownColor}
                      onChange={(e) => setFormData({ ...formData, countdownColor: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Cor do Botão Ao Vivo</Label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={formData.liveButtonColor}
                      onChange={(e) => setFormData({ ...formData, liveButtonColor: e.target.value })}
                      className="h-10 w-14 rounded cursor-pointer border border-input"
                    />
                    <Input
                      value={formData.liveButtonColor}
                      onChange={(e) => setFormData({ ...formData, liveButtonColor: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Cor de Fundo</Label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={formData.backgroundColor}
                      onChange={(e) => setFormData({ ...formData, backgroundColor: e.target.value })}
                      className="h-10 w-14 rounded cursor-pointer border border-input"
                    />
                    <Input
                      value={formData.backgroundColor}
                      onChange={(e) => setFormData({ ...formData, backgroundColor: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>URL da Imagem de Fundo (opcional)</Label>
                <Input
                  value={formData.backgroundImageUrl}
                  onChange={(e) => setFormData({ ...formData, backgroundImageUrl: e.target.value })}
                  placeholder="https://..."
                  data-testid="input-bg-image"
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Tema dos Comentários</Label>
                <Select value={commentTheme} onValueChange={setCommentTheme}>
                  <SelectTrigger data-testid="select-comment-theme">
                    <SelectValue placeholder="Escolha o tema" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dark">Escuro (Padrão)</SelectItem>
                    <SelectItem value="light">Claro</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Define as cores dos comentários durante a transmissão
                </p>
              </div>
            </CardContent>
          </Card>

          {/* AI Designer */}
          <Card className="mt-4 overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-purple-500/10 via-blue-500/10 to-cyan-500/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500">
                    <Sparkles className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <CardTitle>Designer IA</CardTitle>
                    <CardDescription>Descreva como quer sua página e a IA sugere as configurações</CardDescription>
                  </div>
                </div>
                {aiConversation.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearAiConversation} data-testid="button-clear-ai-chat">
                    <X className="h-4 w-4 mr-1" />
                    Limpar
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-72" ref={aiChatRef}>
                <div className="p-4 space-y-4">
                  {aiConversation.length === 0 ? (
                    <div className="text-center py-8 space-y-3">
                      <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center">
                        <Wand2 className="h-8 w-8 text-purple-500" />
                      </div>
                      <div>
                        <p className="font-medium">Olá! Sou seu Designer IA.</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Me diga como quer que sua página fique e vou sugerir cores e textos.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 justify-center pt-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => setAiMessage("Quero um estilo profissional e corporativo")}
                          data-testid="button-ai-suggestion-1"
                        >
                          Estilo corporativo
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => setAiMessage("Cores vibrantes e modernas")}
                          data-testid="button-ai-suggestion-2"
                        >
                          Cores vibrantes
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => setAiMessage("Tema escuro elegante")}
                          data-testid="button-ai-suggestion-3"
                        >
                          Tema escuro
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {aiConversation.map((msg, idx) => (
                        <div 
                          key={idx} 
                          className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                        >
                          <div 
                            className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                              msg.role === "user" 
                                ? "bg-gradient-to-r from-purple-500 to-blue-500 text-white" 
                                : "bg-muted"
                            }`}
                          >
                            <p className="text-sm whitespace-pre-wrap">
                              {msg.role === "assistant" ? formatAiMessage(msg.content) : msg.content}
                            </p>
                          </div>
                        </div>
                      ))}
                      {aiLoading && (
                        <div className="flex justify-start">
                          <div className="bg-muted rounded-2xl px-4 py-3 flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="text-sm text-muted-foreground">Pensando...</span>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </ScrollArea>

              {aiSuggestions && (
                <div className="mx-4 mb-4 p-3 bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/20 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500" />
                      <span className="text-sm font-medium">Sugestão pronta para aplicar</span>
                    </div>
                    <Button 
                      size="sm" 
                      onClick={applyAiSuggestions}
                      className="bg-gradient-to-r from-green-500 to-emerald-500 text-white"
                      data-testid="button-apply-ai-suggestions"
                    >
                      <Check className="h-4 w-4 mr-1" />
                      Aplicar
                    </Button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {Object.entries(aiSuggestions).map(([key, value]) => (
                      <div key={key} className="flex items-center gap-1.5 text-xs bg-background/50 px-2 py-1 rounded">
                        {key.includes("Color") && (
                          <div 
                            className="w-3 h-3 rounded-sm border border-border" 
                            style={{ backgroundColor: value as string }}
                          />
                        )}
                        <span className="text-muted-foreground">{key}:</span>
                        <span className="font-mono truncate max-w-[120px]">{value as string}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="p-3 border-t flex gap-2">
                <Input
                  value={aiMessage}
                  onChange={(e) => setAiMessage(e.target.value)}
                  placeholder="Descreva o estilo que deseja..."
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendAiMessage()}
                  disabled={aiLoading}
                  data-testid="input-ai-message"
                />
                <Button 
                  onClick={sendAiMessage} 
                  disabled={!aiMessage.trim() || aiLoading}
                  className="bg-gradient-to-r from-purple-500 to-blue-500"
                  data-testid="button-send-ai-message"
                >
                  {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Oferta */}
        <TabsContent value="offer">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gift className="h-5 w-5" />
                Editor Visual da Oferta
              </CardTitle>
              <CardDescription>Edite diretamente no modelo. Clique nos textos para editar e arraste os beneficios para reordenar.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
                  <input
                    type="checkbox"
                    checked={formData.offerEnabled}
                    onChange={(e) => setFormData({ ...formData, offerEnabled: e.target.checked })}
                    className="h-5 w-5 rounded border-gray-300"
                    id="offer-enabled"
                    data-testid="checkbox-offer-enabled"
                  />
                  <Label htmlFor="offer-enabled" className="cursor-pointer font-medium">
                    Habilitar oferta na página
                  </Label>
                </div>

                {formData.offerEnabled && (
                  <div className="p-4 border rounded-lg space-y-4">
                    <div>
                      <Label className="text-sm font-medium mb-2 block">Aparecer no momento do vídeo:</Label>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min={0}
                            value={Math.floor((formData.offerStartSeconds || 0) / 3600)}
                            onChange={(e) => {
                              const hours = parseInt(e.target.value) || 0;
                              const current = formData.offerStartSeconds || 0;
                              const mins = Math.floor((current % 3600) / 60);
                              const secs = current % 60;
                              setFormData({ ...formData, offerStartSeconds: hours * 3600 + mins * 60 + secs });
                            }}
                            className="w-16 text-center"
                            data-testid="input-offer-start-hours"
                          />
                          <span className="text-sm text-muted-foreground">h</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min={0}
                            max={59}
                            value={Math.floor(((formData.offerStartSeconds || 0) % 3600) / 60)}
                            onChange={(e) => {
                              const mins = parseInt(e.target.value) || 0;
                              const current = formData.offerStartSeconds || 0;
                              const hours = Math.floor(current / 3600);
                              const secs = current % 60;
                              setFormData({ ...formData, offerStartSeconds: hours * 3600 + mins * 60 + secs });
                            }}
                            className="w-16 text-center"
                            data-testid="input-offer-start-minutes"
                          />
                          <span className="text-sm text-muted-foreground">m</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min={0}
                            max={59}
                            value={(formData.offerStartSeconds || 0) % 60}
                            onChange={(e) => {
                              const secs = parseInt(e.target.value) || 0;
                              const current = formData.offerStartSeconds || 0;
                              const hours = Math.floor(current / 3600);
                              const mins = Math.floor((current % 3600) / 60);
                              setFormData({ ...formData, offerStartSeconds: hours * 3600 + mins * 60 + secs });
                            }}
                            className="w-16 text-center"
                            data-testid="input-offer-start-seconds"
                          />
                          <span className="text-sm text-muted-foreground">s</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={formData.offerEndsAtEnd}
                        onChange={(e) => setFormData({ ...formData, offerEndsAtEnd: e.target.checked })}
                        className="h-4 w-4 rounded border-gray-300"
                        id="offer-ends-at-end"
                        data-testid="checkbox-offer-ends-at-end"
                      />
                      <Label htmlFor="offer-ends-at-end" className="cursor-pointer text-sm">
                        Permanecer até o final do vídeo
                      </Label>
                    </div>

                    {!formData.offerEndsAtEnd && (
                      <div>
                        <Label className="text-sm font-medium mb-2 block">Duração da oferta:</Label>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              min={0}
                              value={Math.floor((formData.offerDurationSeconds || 0) / 3600)}
                              onChange={(e) => {
                                const hours = parseInt(e.target.value) || 0;
                                const current = formData.offerDurationSeconds || 0;
                                const mins = Math.floor((current % 3600) / 60);
                                const secs = current % 60;
                                setFormData({ ...formData, offerDurationSeconds: hours * 3600 + mins * 60 + secs });
                              }}
                              className="w-16 text-center"
                              data-testid="input-offer-duration-hours"
                            />
                            <span className="text-sm text-muted-foreground">h</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              min={0}
                              max={59}
                              value={Math.floor(((formData.offerDurationSeconds || 0) % 3600) / 60)}
                              onChange={(e) => {
                                const mins = parseInt(e.target.value) || 0;
                                const current = formData.offerDurationSeconds || 0;
                                const hours = Math.floor(current / 3600);
                                const secs = current % 60;
                                setFormData({ ...formData, offerDurationSeconds: hours * 3600 + mins * 60 + secs });
                              }}
                              className="w-16 text-center"
                              data-testid="input-offer-duration-minutes"
                            />
                            <span className="text-sm text-muted-foreground">m</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              min={0}
                              max={59}
                              value={(formData.offerDurationSeconds || 0) % 60}
                              onChange={(e) => {
                                const secs = parseInt(e.target.value) || 0;
                                const current = formData.offerDurationSeconds || 0;
                                const hours = Math.floor(current / 3600);
                                const mins = Math.floor((current % 3600) / 60);
                                setFormData({ ...formData, offerDurationSeconds: hours * 3600 + mins * 60 + secs });
                              }}
                              className="w-16 text-center"
                              data-testid="input-offer-duration-seconds"
                            />
                            <span className="text-sm text-muted-foreground">s</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {formData.offerEnabled && (
                <div 
                  className="rounded-xl p-6"
                  style={{ backgroundColor: formData.pageBackgroundColor || "#4A8BB5" }}
                >
                  <OfferEditor
                    formData={{
                      offerBadgeText: formData.offerBadgeText,
                      offerTitle: formData.offerTitle,
                      offerTitleColor: formData.offerTitleColor,
                      offerSubtitle: formData.offerSubtitle,
                      offerSubtitleColor: formData.offerSubtitleColor,
                      offerImageUrl: formData.offerImageUrl,
                      offerPriceText: formData.offerPriceText,
                      offerPriceBorderColor: formData.offerPriceBorderColor,
                      offerPriceBoxBgColor: formData.offerPriceBoxBgColor,
                      offerPriceBoxShadow: formData.offerPriceBoxShadow,
                      offerPriceBoxPadding: formData.offerPriceBoxPadding,
                      offerPriceIconColor: formData.offerPriceIconColor,
                      offerPriceHighlightColor: formData.offerPriceHighlightColor,
                      offerPriceLabel: formData.offerPriceLabel,
                      offerButtonText: formData.offerButtonText,
                      offerButtonUrl: formData.offerButtonUrl,
                      offerButtonColor: formData.offerButtonColor,
                      offerButtonSize: formData.offerButtonSize,
                      offerButtonShadow: formData.offerButtonShadow,
                      offerButtonTextColor: formData.offerButtonTextColor,
                      countdownColor: formData.countdownColor,
                      pageBackgroundColor: formData.pageBackgroundColor,
                    }}
                    benefitsList={benefitsList}
                    onChange={(field, value) => setFormData({ ...formData, [field]: value })}
                    onBenefitsChange={(benefits) => {
                      setBenefitsList(benefits);
                      setFormData({ ...formData, offerBenefits: JSON.stringify(benefits) });
                    }}
                    onImageUpload={async (file) => {
                      const formDataUpload = new FormData();
                      formDataUpload.append("image", file);
                      const res = await fetch("/api/upload-image", {
                        method: "POST",
                        headers: { Authorization: `Bearer ${token}` },
                        body: formDataUpload,
                      });
                      if (!res.ok) throw new Error("Erro no upload");
                      const data = await res.json();
                      return data.url;
                    }}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Vídeo */}
        <TabsContent value="video">
          <Card>
            <CardHeader>
              <CardTitle>Vídeo do Webinário</CardTitle>
              <CardDescription>Selecione o vídeo que será transmitido</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Vídeo</Label>
                <Select 
                  value={formData.uploadedVideoId} 
                  onValueChange={(v) => {
                    const video = videos.find(vid => vid.uploadedVideoId === v);
                    setFormData({ 
                      ...formData, 
                      uploadedVideoId: v,
                      videoDuration: video?.duration || formData.videoDuration
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um vídeo" />
                  </SelectTrigger>
                  <SelectContent>
                    {videos.map((video) => (
                      <SelectItem key={video.uploadedVideoId} value={video.uploadedVideoId}>
                        {video.title || video.filename} ({formatDuration(video.duration)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {formData.uploadedVideoId && (
                <div className="space-y-3">
                  <div className="p-4 bg-muted rounded-lg flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Duração: {formatDuration(formData.videoDuration)}</span>
                  </div>
                  
                  <div className="p-4 bg-muted rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Video className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Streaming HLS</span>
                      </div>
                      {hlsStatus === "completed" ? (
                        <Badge className="bg-green-600">Pronto</Badge>
                      ) : hlsStatus === "processing" ? (
                        <Badge className="bg-yellow-600">Processando...</Badge>
                      ) : (
                        <Badge variant="outline">Não convertido</Badge>
                      )}
                    </div>
                    
                    <p className="text-xs text-muted-foreground">
                      HLS permite streaming suave e busca rápida em vídeos longos. 
                      {hlsStatus === "completed" 
                        ? " O vídeo está pronto para streaming otimizado." 
                        : hlsStatus === "processing" 
                        ? " A conversão está em andamento (15-30 min)."
                        : " Converta para melhor experiência do usuário."}
                    </p>
                    
                    {hlsStatus === "completed" && hlsPlaylistUrl && (
                      <div className="flex items-center gap-2 p-2 bg-background rounded border">
                        <code className="text-xs flex-1 truncate">{hlsPlaylistUrl}</code>
                        <Button 
                          size="icon" 
                          variant="ghost"
                          onClick={() => {
                            navigator.clipboard.writeText(window.location.origin + hlsPlaylistUrl);
                            toast({ title: "URL copiado!" });
                          }}
                          data-testid="button-copy-hls-url"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                    
                    {hlsStatus !== "completed" && hlsStatus !== "processing" && (
                      <Button 
                        onClick={() => startHlsConversion(formData.uploadedVideoId)}
                        disabled={hlsConverting}
                        size="sm"
                        data-testid="button-convert-hls"
                      >
                        {hlsConverting ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Iniciando...
                          </>
                        ) : (
                          <>
                            <Video className="h-4 w-4 mr-2" />
                            Converter para HLS
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              )}

              <p className="text-sm text-muted-foreground">
                Para fazer upload de novos vídeos, use a página de Vídeos no menu lateral.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Comentários */}
        <TabsContent value="comments">
          <Card>
            <CardHeader>
              <CardTitle>Comentários Simulados</CardTitle>
              <CardDescription>
                Comentários que aparecerão automaticamente durante a transmissão
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Add comment form */}
              <div className="p-4 bg-muted rounded-lg space-y-3">
                <h4 className="font-medium text-sm">Adicionar Comentário</h4>
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
                  <Input
                    placeholder="Autor (Nome – Cidade (UF))"
                    value={newComment.author}
                    onChange={(e) => setNewComment({ ...newComment, author: e.target.value })}
                    data-testid="input-comment-author"
                  />
                  <Input
                    placeholder="Mensagem"
                    value={newComment.text}
                    onChange={(e) => setNewComment({ ...newComment, text: e.target.value })}
                    className="lg:col-span-2"
                    data-testid="input-comment-text"
                  />
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        min={0}
                        max={23}
                        value={newComment.hours}
                        onChange={(e) => setNewComment({ ...newComment, hours: Math.min(23, Math.max(0, parseInt(e.target.value) || 0)) })}
                        className="w-14 text-center"
                        data-testid="input-comment-hours"
                      />
                      <span className="text-sm text-muted-foreground">h</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        min={0}
                        max={59}
                        value={newComment.minutes}
                        onChange={(e) => setNewComment({ ...newComment, minutes: Math.min(59, Math.max(0, parseInt(e.target.value) || 0)) })}
                        className="w-14 text-center"
                        data-testid="input-comment-minutes"
                      />
                      <span className="text-sm text-muted-foreground">min</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        min={0}
                        max={59}
                        value={newComment.seconds}
                        onChange={(e) => setNewComment({ ...newComment, seconds: Math.min(59, Math.max(0, parseInt(e.target.value) || 0)) })}
                        className="w-14 text-center"
                        data-testid="input-comment-seconds"
                      />
                      <span className="text-sm text-muted-foreground">seg</span>
                    </div>
                    <Button onClick={handleAddComment} size="icon" data-testid="button-add-comment" title="Adicionar comentário">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              <Separator className="my-4" />

              {/* Import/Export - 3 botões diretos sem popup */}
              <div className="flex flex-wrap items-center gap-3 py-2">
                {/* Hidden file inputs */}
                <input
                  type="file"
                  accept=".txt"
                  ref={fileInputRef}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file || !webinar) return;
                    const fileText = await file.text();
                    toast({ title: `Importando TXT: ${file.name}` });
                    try {
                      const res = await fetch(`/api/webinars/${webinar.id}/import-comments-text`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ content: fileText }),
                      });
                      if (!res.ok) throw new Error("Erro ao importar");
                      const result = await res.json();
                      toast({ title: `Importados: ${result.imported} comentários!` });
                      await fetchComments(webinar.id);
                    } catch (error) {
                      toast({ title: "Erro ao importar TXT", variant: "destructive" });
                    }
                    e.target.value = '';
                  }}
                  className="hidden"
                  data-testid="input-file-txt"
                />
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  id="excel-input"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file || !webinar) return;
                    toast({ title: `Importando Excel: ${file.name}` });
                    try {
                      const formData = new FormData();
                      formData.append("file", file);
                      const res = await fetch(`/api/webinars/${webinar.id}/import-excel`, {
                        method: "POST",
                        headers: { Authorization: `Bearer ${token}` },
                        body: formData,
                      });
                      if (!res.ok) {
                        const err = await res.json();
                        throw new Error(err.error || "Erro ao importar");
                      }
                      const result = await res.json();
                      toast({ title: `Importados: ${result.imported} comentários!` });
                      await fetchComments(webinar.id);
                    } catch (error: any) {
                      toast({ title: "Erro ao importar Excel", description: error.message, variant: "destructive" });
                    }
                    e.target.value = '';
                  }}
                  className="hidden"
                  data-testid="input-file-excel"
                />
                <input
                  type="file"
                  accept=".json"
                  id="json-input"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file || !webinar) return;
                    const fileText = await file.text();
                    toast({ title: `Importando JSON: ${file.name}` });
                    try {
                      let comments = [];
                      try {
                        const parsed = JSON.parse(fileText);
                        comments = Array.isArray(parsed) ? parsed : (parsed.comments || []);
                      } catch {
                        throw new Error("Arquivo JSON inválido");
                      }
                      
                      const res = await fetch(`/api/webinars/${webinar.id}/import-comments-json`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ comments }),
                      });
                      if (!res.ok) throw new Error("Erro ao importar");
                      const result = await res.json();
                      toast({ title: `Importados: ${result.imported} comentários!` });
                      await fetchComments(webinar.id);
                    } catch (error: any) {
                      toast({ title: "Erro ao importar JSON", description: error.message, variant: "destructive" });
                    }
                    e.target.value = '';
                  }}
                  className="hidden"
                  data-testid="input-file-json"
                />

                {/* 3 botões de importação */}
                <Button 
                  variant="outline" 
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-green-600 hover:bg-green-700 text-white border-green-600"
                  data-testid="button-import-txt"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Importar TXT
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => document.getElementById('excel-input')?.click()}
                  className="bg-blue-600 hover:bg-blue-700 text-white border-blue-600"
                  data-testid="button-import-excel"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Importar Excel
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => document.getElementById('json-input')?.click()}
                  className="bg-purple-600 hover:bg-purple-700 text-white border-purple-600"
                  data-testid="button-import-json"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Importar JSON
                </Button>
                
                <Button 
                  variant="outline" 
                  onClick={handleExportComments}
                  disabled={comments.length === 0}
                  data-testid="button-export-comments"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Exportar
                </Button>
                
                <Button 
                  variant="outline" 
                  onClick={() => setShowPasteModal(true)}
                  className="bg-orange-600 hover:bg-orange-700 text-white border-orange-600"
                  data-testid="button-paste-comments"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Colar Texto
                </Button>
              </div>
              
              <p className="text-xs text-muted-foreground mt-3">
                Formato: [HH:MM:SS] Nome – Cidade (UF): mensagem | ou segundos|autor|mensagem
              </p>

              <Separator className="my-4" />

              {/* Comments list */}
              <ScrollArea className="h-[360px]">
                {comments.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <MessageSquare className="h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Nenhum comentário simulado. Adicione comentários acima.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {comments
                      .sort((a, b) => a.timestamp - b.timestamp)
                      .map((comment) => (
                        <div 
                          key={comment.id} 
                          className="p-3 rounded-lg border"
                        >
                          {editingComment?.id === comment.id ? (
                            <div className="space-y-3">
                              <div className="grid grid-cols-1 lg:grid-cols-4 gap-2">
                                <Input
                                  value={editingComment.author}
                                  onChange={(e) => setEditingComment({ ...editingComment, author: e.target.value })}
                                  placeholder="Autor"
                                  data-testid="input-edit-author"
                                />
                                <Input
                                  value={editingComment.text}
                                  onChange={(e) => setEditingComment({ ...editingComment, text: e.target.value })}
                                  placeholder="Mensagem"
                                  className="lg:col-span-2"
                                  data-testid="input-edit-text"
                                />
                                <div className="flex items-center gap-2">
                                  <div className="flex items-center gap-1">
                                    <Input
                                      type="number"
                                      min={0}
                                      max={23}
                                      value={editHours}
                                      onChange={(e) => setEditHours(Math.min(23, Math.max(0, parseInt(e.target.value) || 0)))}
                                      className="w-14 text-center"
                                      data-testid="input-edit-hours"
                                    />
                                    <span className="text-xs text-muted-foreground">h</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <Input
                                      type="number"
                                      min={0}
                                      max={59}
                                      value={editMinutes}
                                      onChange={(e) => setEditMinutes(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                                      className="w-14 text-center"
                                      data-testid="input-edit-minutes"
                                    />
                                    <span className="text-xs text-muted-foreground">min</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <Input
                                      type="number"
                                      min={0}
                                      max={59}
                                      value={editSeconds}
                                      onChange={(e) => setEditSeconds(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                                      className="w-14 text-center"
                                      data-testid="input-edit-seconds"
                                    />
                                    <span className="text-xs text-muted-foreground">seg</span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <Button size="sm" onClick={handleUpdateComment} data-testid="button-save-edit">
                                  <Check className="h-4 w-4 mr-1" />
                                  Salvar
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="outline" 
                                  onClick={() => setEditingComment(null)}
                                  data-testid="button-cancel-edit"
                                >
                                  <X className="h-4 w-4 mr-1" />
                                  Cancelar
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge variant="secondary" className="text-xs font-mono">
                                    {formatTimestamp(comment.timestamp)}
                                  </Badge>
                                  <span className="font-medium text-sm text-primary">{comment.author}</span>
                                </div>
                                <p className="text-sm text-muted-foreground mt-1">{comment.text}</p>
                              </div>
                              <div className="flex gap-1 flex-shrink-0">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => startEditComment(comment)}
                                  data-testid={`button-edit-comment-${comment.id}`}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDeleteComment(comment.id)}
                                  data-testid={`button-delete-comment-${comment.id}`}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Comentários Reais */}
        <TabsContent value="real-comments">
          <Card>
            <CardHeader>
              <CardTitle>Comentários Reais dos Espectadores</CardTitle>
              <CardDescription>Aprove comentários reais para convertê-los em simulados</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Link de Moderação */}
              <div className="p-4 bg-muted/50 rounded-lg border">
                <div className="flex items-center justify-between mb-2">
                  <Label className="font-medium">Link de Moderação</Label>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={async () => {
                        if (!confirm("Resetar todos os comentários reais para pendentes? Eles precisarão ser aprovados novamente pelo moderador.")) return;
                        try {
                          const token = localStorage.getItem("adminToken");
                          const res = await fetch(`/api/webinars/${webinar?.id}/reset-comments-approval`, {
                            method: "POST",
                            headers: { Authorization: `Bearer ${token}` }
                          });
                          if (res.ok) {
                            const data = await res.json();
                            toast({ title: "Comentários resetados", description: `${data.updated} comentários agora estão pendentes de aprovação.` });
                          } else {
                            throw new Error("Erro ao resetar");
                          }
                        } catch (e) {
                          toast({ title: "Erro", description: "Não foi possível resetar os comentários.", variant: "destructive" });
                        }
                      }}
                      data-testid="button-reset-comments-approval"
                    >
                      <RefreshCw className="h-4 w-4 mr-1" />
                      Resetar Aprovações
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const url = `${window.location.origin}/w/${webinar?.slug}/moderate`;
                        navigator.clipboard.writeText(url);
                        toast({ title: "Link copiado!", description: "Compartilhe com seu moderador." });
                      }}
                      data-testid="button-copy-moderator-link"
                    >
                      <Copy className="h-4 w-4 mr-1" />
                      Copiar Link
                    </Button>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Compartilhe este link com seu moderador para que ele possa aprovar/recusar mensagens e enviar mensagens ao chat.
                </p>
                <code className="block mt-2 p-2 bg-background rounded text-xs break-all">
                  {`${window.location.origin}/w/${webinar?.slug}/moderate`}
                </code>
              </div>

              {/* Advanced Date Filters */}
              <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <Label className="text-sm font-medium">Filtrar por Período</Label>
                  <div className="flex gap-2 flex-wrap">
                    <Button 
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const filtered = getFilteredComments();
                        const headers = ["Autor", "Mensagem", "Data/Hora"];
                        const rows = filtered.map(c => [
                          c.author || "",
                          c.text || "",
                          c.createdAt ? new Date(c.createdAt).toLocaleString("pt-BR") : ""
                        ]);
                        const csv = [headers.join(","), ...rows.map(r => r.map(c => `"${c}"`).join(","))].join("\n");
                        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `comentarios-reais-${webinar?.slug || "webinar"}-${new Date().toISOString().split("T")[0]}.csv`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      data-testid="button-download-real-comments"
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Baixar
                    </Button>
                    <Button 
                      size="sm"
                      variant="destructive"
                      onClick={async () => {
                        if (!confirm(`Tem certeza que deseja excluir todos os ${realComments.length} comentários? Esta ação não pode ser desfeita.`)) return;
                        try {
                          const token = localStorage.getItem("adminToken");
                          const res = await fetch(`/api/webinars/${webinar?.id}/real-comments`, {
                            method: "DELETE",
                            headers: { Authorization: `Bearer ${token}` }
                          });
                          if (res.ok) {
                            setRealComments([]);
                            toast({ title: "Comentários excluídos", description: "Todos os comentários reais foram removidos com sucesso." });
                          } else {
                            throw new Error("Erro ao excluir");
                          }
                        } catch (e) {
                          toast({ title: "Erro", description: "Não foi possível excluir os comentários.", variant: "destructive" });
                        }
                      }}
                      data-testid="button-clear-real-comments"
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Limpar Todos
                    </Button>
                  </div>
                </div>

                {/* Quick Date Filters */}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={dateFilterType === 'all' ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleDateFilterChange('all')}
                    data-testid="button-filter-all"
                  >
                    Todos
                  </Button>
                  <Button
                    variant={dateFilterType === 'today' ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleDateFilterChange('today')}
                    data-testid="button-filter-today"
                  >
                    Hoje
                  </Button>
                  <Button
                    variant={dateFilterType === 'yesterday' ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleDateFilterChange('yesterday')}
                    data-testid="button-filter-yesterday"
                  >
                    Ontem
                  </Button>
                  <Button
                    variant={dateFilterType === 'week' ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleDateFilterChange('week')}
                    data-testid="button-filter-week"
                  >
                    Últimos 7 dias
                  </Button>
                  <Button
                    variant={dateFilterType === 'month' ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleDateFilterChange('month')}
                    data-testid="button-filter-month"
                  >
                    Último mês
                  </Button>
                  <Popover open={showDatePicker} onOpenChange={setShowDatePicker}>
                    <PopoverTrigger asChild>
                      <Button
                        variant={dateFilterType === 'custom' ? "default" : "outline"}
                        size="sm"
                        data-testid="button-filter-custom"
                      >
                        <CalendarIcon className="h-4 w-4 mr-1" />
                        Personalizado
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-4" align="start">
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label className="text-sm">Data inicial</Label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="outline" className="w-full justify-start text-left font-normal">
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {customDateFrom ? customDateFrom.toLocaleDateString('pt-BR') : 'Selecionar'}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                              <Calendar
                                mode="single"
                                selected={customDateFrom}
                                onSelect={setCustomDateFrom}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm">Data final</Label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="outline" className="w-full justify-start text-left font-normal">
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {customDateTo ? customDateTo.toLocaleDateString('pt-BR') : 'Selecionar'}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                              <Calendar
                                mode="single"
                                selected={customDateTo}
                                onSelect={setCustomDateTo}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                        <Button 
                          className="w-full" 
                          onClick={() => {
                            if (customDateFrom && customDateTo) {
                              handleDateFilterChange('custom');
                              setShowDatePicker(false);
                            } else {
                              toast({ title: "Selecione ambas as datas", variant: "destructive" });
                            }
                          }}
                          data-testid="button-apply-custom-date"
                        >
                          Aplicar
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Session dates (original filter) */}
                {sessionDates.length > 0 && (
                  <div className="pt-2 border-t">
                    <Label className="text-xs text-muted-foreground mb-2 block">Por sessão:</Label>
                    <div className="flex flex-wrap gap-2">
                      {sessionDates.map((date) => (
                        <Button
                          key={date}
                          variant={selectedDate === date ? "secondary" : "ghost"}
                          size="sm"
                          onClick={() => setSelectedDate(date)}
                          data-testid={`button-date-${date}`}
                          className="text-xs"
                        >
                          {new Date(date + 'T00:00:00').toLocaleDateString('pt-BR')}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Selection Actions */}
              {getFilteredComments().length > 0 && (
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={getFilteredComments().length > 0 && getFilteredComments().every(c => selectedCommentIds.has(c.id))}
                      onChange={selectAllFilteredComments}
                      className="h-4 w-4 rounded"
                      data-testid="checkbox-select-all-comments"
                    />
                    <span className="text-sm text-muted-foreground">
                      {selectedCommentIds.size > 0 
                        ? `${selectedCommentIds.size} selecionado(s)` 
                        : `${getFilteredComments().length} comentário(s)`}
                    </span>
                  </div>
                  {selectedCommentIds.size > 0 && (
                    <Button
                      size="sm"
                      onClick={handleApproveToSimulated}
                      className="bg-green-600 hover:bg-green-700"
                      data-testid="button-approve-selected"
                    >
                      <MessageSquare className="h-4 w-4 mr-1" />
                      Aprovar para Chat Simulado ({selectedCommentIds.size})
                    </Button>
                  )}
                </div>
              )}
              
              {getFilteredComments().length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">
                  Nenhum comentário real encontrado para este período
                </div>
              ) : (
                <ScrollArea className="h-96 border rounded-lg p-3 space-y-2">
                  {getFilteredComments().map((comment) => (
                    <div 
                      key={comment.id}
                      className={`p-3 border rounded-lg space-y-2 ${selectedCommentIds.has(comment.id) ? 'bg-primary/10 border-primary/30' : 'bg-muted/50'}`}
                      data-testid={`real-comment-${comment.id}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={selectedCommentIds.has(comment.id)}
                            onChange={() => toggleCommentSelection(comment.id)}
                            className="h-4 w-4 rounded"
                            data-testid={`checkbox-comment-${comment.id}`}
                          />
                          <div>
                            <p className="text-sm font-medium">{comment.author}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(comment.createdAt || '').toLocaleDateString('pt-BR')} às {new Date(comment.createdAt || '').toLocaleTimeString('pt-BR')}
                            </p>
                          </div>
                        </div>
                      </div>
                      <p className="text-sm text-foreground break-words pl-7">{comment.text}</p>
                      <div className="flex gap-2 pl-7">
                        <Button
                          size="sm"
                          onClick={() => handleReleaseComment(comment.id)}
                          data-testid={`button-release-${comment.id}`}
                        >
                          <Check className="h-4 w-4 mr-1" />
                          Liberar
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={async () => {
                            try {
                              const token = localStorage.getItem("adminToken");
                              const res = await fetch(`/api/webinars/${webinar?.id}/real-comments/${comment.id}`, {
                                method: "DELETE",
                                headers: { Authorization: `Bearer ${token}` }
                              });
                              if (res.ok) {
                                setRealComments(realComments.filter(c => c.id !== comment.id));
                                toast({ title: "Comentário excluído", description: "O comentário foi removido com sucesso." });
                              } else {
                                throw new Error("Erro ao excluir");
                              }
                            } catch (e) {
                              toast({ title: "Erro", description: "Não foi possível excluir o comentário.", variant: "destructive" });
                            }
                          }}
                          data-testid={`button-delete-real-comment-${comment.id}`}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Excluir
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRejectComment(comment.id)}
                          data-testid={`button-reject-${comment.id}`}
                        >
                          <X className="h-4 w-4 mr-1" />
                          Rejeitar
                        </Button>
                      </div>
                    </div>
                  ))}
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Leads */}
        <TabsContent value="leads">
          <div className="space-y-6">
            {/* Link de Inscrição e Embed */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Link2 className="h-5 w-5" />
                  Link de Inscrição
                </CardTitle>
                <CardDescription>Compartilhe o link ou incorpore o formulário em seu site</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Link de Inscrição</Label>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={`${window.location.origin}/w/${webinar?.slug}/register`}
                      className="font-mono text-sm"
                      data-testid="input-registration-link"
                    />
                    <Button
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/w/${webinar?.slug}/register`);
                        toast({ title: "Link copiado!" });
                      }}
                      data-testid="button-copy-registration-link"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => window.open(`/w/${webinar?.slug}/register`, "_blank")}
                      data-testid="button-preview-registration"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Código Embed (iframe)</Label>
                  <Textarea
                    readOnly
                    value={`<iframe src="${window.location.origin}/w/${webinar?.slug}/register?embed=true" width="100%" height="700" frameborder="0" style="border: none; max-width: 500px; margin: 0 auto; display: block;"></iframe>`}
                    className="font-mono text-xs h-20"
                    data-testid="input-embed-code"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard.writeText(`<iframe src="${window.location.origin}/w/${webinar?.slug}/register?embed=true" width="100%" height="700" frameborder="0" style="border: none; max-width: 500px; margin: 0 auto; display: block;"></iframe>`);
                      toast({ title: "Código embed copiado!" });
                    }}
                    data-testid="button-copy-embed-code"
                  >
                    <Copy className="h-4 w-4 mr-1" />
                    Copiar Código Embed
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Editor de Estilo do Formulário */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="h-5 w-5" />
                  Personalização do Formulário
                </CardTitle>
                <CardDescription>Configure cores, textos e campos do formulário de captura</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Campos a Coletar */}
                <div className="p-4 border rounded-lg space-y-4">
                  <h4 className="font-medium text-sm">Campos do Formulário</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    <div className="flex items-center gap-2">
                      <Checkbox checked disabled className="opacity-50" />
                      <Label className="text-sm text-muted-foreground">Nome (obrigatório)</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="form-collect-email"
                        checked={leadsCollectEmail}
                        onCheckedChange={(c: boolean) => setLeadsCollectEmail(c === true)}
                        data-testid="checkbox-form-collect-email"
                      />
                      <Label htmlFor="form-collect-email" className="text-sm cursor-pointer">E-mail</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="form-collect-whatsapp"
                        checked={leadsCollectWhatsapp}
                        onCheckedChange={(c: boolean) => setLeadsCollectWhatsapp(c === true)}
                        data-testid="checkbox-form-collect-whatsapp"
                      />
                      <Label htmlFor="form-collect-whatsapp" className="text-sm cursor-pointer">WhatsApp</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="form-collect-city"
                        checked={formData.leadFormCollectCity || false}
                        onCheckedChange={(c: boolean) => setFormData({ ...formData, leadFormCollectCity: c === true })}
                        data-testid="checkbox-form-collect-city"
                      />
                      <Label htmlFor="form-collect-city" className="text-sm cursor-pointer">Cidade</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="form-collect-state"
                        checked={formData.leadFormCollectState || false}
                        onCheckedChange={(c: boolean) => setFormData({ ...formData, leadFormCollectState: c === true })}
                        data-testid="checkbox-form-collect-state"
                      />
                      <Label htmlFor="form-collect-state" className="text-sm cursor-pointer">Estado</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="form-require-consent"
                        checked={formData.leadFormRequireConsent !== false}
                        onCheckedChange={(c: boolean) => setFormData({ ...formData, leadFormRequireConsent: c === true })}
                        data-testid="checkbox-form-require-consent"
                      />
                      <Label htmlFor="form-require-consent" className="text-sm cursor-pointer">Consentimento</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="form-show-next-session"
                        checked={formData.leadFormShowNextSession !== false}
                        onCheckedChange={(c: boolean) => setFormData({ ...formData, leadFormShowNextSession: c === true })}
                        data-testid="checkbox-form-show-next-session"
                      />
                      <Label htmlFor="form-show-next-session" className="text-sm cursor-pointer">Próxima Sessão</Label>
                    </div>
                  </div>
                </div>

                {/* Textos */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Título do Formulário</Label>
                    <Input
                      value={formData.leadFormTitle || "Inscreva-se no Webinário"}
                      onChange={(e) => setFormData({ ...formData, leadFormTitle: e.target.value })}
                      placeholder="Inscreva-se no Webinário"
                      data-testid="input-lead-form-title"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Subtítulo</Label>
                    <Input
                      value={formData.leadFormSubtitle || ""}
                      onChange={(e) => setFormData({ ...formData, leadFormSubtitle: e.target.value })}
                      placeholder="Preencha seus dados para participar"
                      data-testid="input-lead-form-subtitle"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Texto do Botão</Label>
                    <Input
                      value={formData.leadFormButtonText || "Quero Participar"}
                      onChange={(e) => setFormData({ ...formData, leadFormButtonText: e.target.value })}
                      placeholder="Quero Participar"
                      data-testid="input-lead-form-button-text"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Mensagem de Sucesso</Label>
                    <Input
                      value={formData.leadFormSuccessMessage || "Inscrição realizada com sucesso!"}
                      onChange={(e) => setFormData({ ...formData, leadFormSuccessMessage: e.target.value })}
                      placeholder="Inscrição realizada com sucesso!"
                      data-testid="input-lead-form-success"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Texto do Consentimento</Label>
                    <Input
                      value={formData.leadFormConsentText || "Concordo em receber comunicações sobre este webinário"}
                      onChange={(e) => setFormData({ ...formData, leadFormConsentText: e.target.value })}
                      placeholder="Concordo em receber comunicações"
                      data-testid="input-lead-form-consent-text"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>URL de Redirecionamento (após inscrição)</Label>
                    <Input
                      value={formData.leadFormRedirectUrl || ""}
                      onChange={(e) => setFormData({ ...formData, leadFormRedirectUrl: e.target.value })}
                      placeholder="https://... (vazio = ir para sala)"
                      data-testid="input-lead-form-redirect-url"
                    />
                  </div>
                </div>

                {/* Cores */}
                <div className="p-4 border rounded-lg space-y-4">
                  <h4 className="font-medium text-sm">Cores do Formulário</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs">Cor de Fundo</Label>
                      <div className="flex gap-2">
                        <Input
                          type="color"
                          value={formData.leadFormBgColor || "#1a1a2e"}
                          onChange={(e) => setFormData({ ...formData, leadFormBgColor: e.target.value })}
                          className="w-10 h-9 p-1"
                          data-testid="input-lead-form-bg-color"
                        />
                        <Input
                          value={formData.leadFormBgColor || "#1a1a2e"}
                          onChange={(e) => setFormData({ ...formData, leadFormBgColor: e.target.value })}
                          className="flex-1 text-xs"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Cor do Card</Label>
                      <div className="flex gap-2">
                        <Input
                          type="color"
                          value={formData.leadFormCardColor || "#16213e"}
                          onChange={(e) => setFormData({ ...formData, leadFormCardColor: e.target.value })}
                          className="w-10 h-9 p-1"
                          data-testid="input-lead-form-card-color"
                        />
                        <Input
                          value={formData.leadFormCardColor || "#16213e"}
                          onChange={(e) => setFormData({ ...formData, leadFormCardColor: e.target.value })}
                          className="flex-1 text-xs"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Cor do Botão</Label>
                      <div className="flex gap-2">
                        <Input
                          type="color"
                          value={formData.leadFormButtonColor || "#22c55e"}
                          onChange={(e) => setFormData({ ...formData, leadFormButtonColor: e.target.value })}
                          className="w-10 h-9 p-1"
                          data-testid="input-lead-form-button-color"
                        />
                        <Input
                          value={formData.leadFormButtonColor || "#22c55e"}
                          onChange={(e) => setFormData({ ...formData, leadFormButtonColor: e.target.value })}
                          className="flex-1 text-xs"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Texto do Botão</Label>
                      <div className="flex gap-2">
                        <Input
                          type="color"
                          value={formData.leadFormButtonTextColor || "#ffffff"}
                          onChange={(e) => setFormData({ ...formData, leadFormButtonTextColor: e.target.value })}
                          className="w-10 h-9 p-1"
                          data-testid="input-lead-form-button-text-color"
                        />
                        <Input
                          value={formData.leadFormButtonTextColor || "#ffffff"}
                          onChange={(e) => setFormData({ ...formData, leadFormButtonTextColor: e.target.value })}
                          className="flex-1 text-xs"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Cor do Texto</Label>
                      <div className="flex gap-2">
                        <Input
                          type="color"
                          value={formData.leadFormTextColor || "#ffffff"}
                          onChange={(e) => setFormData({ ...formData, leadFormTextColor: e.target.value })}
                          className="w-10 h-9 p-1"
                          data-testid="input-lead-form-text-color"
                        />
                        <Input
                          value={formData.leadFormTextColor || "#ffffff"}
                          onChange={(e) => setFormData({ ...formData, leadFormTextColor: e.target.value })}
                          className="flex-1 text-xs"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Cor dos Inputs</Label>
                      <div className="flex gap-2">
                        <Input
                          type="color"
                          value={formData.leadFormInputColor || "#0f0f23"}
                          onChange={(e) => setFormData({ ...formData, leadFormInputColor: e.target.value })}
                          className="w-10 h-9 p-1"
                          data-testid="input-lead-form-input-color"
                        />
                        <Input
                          value={formData.leadFormInputColor || "#0f0f23"}
                          onChange={(e) => setFormData({ ...formData, leadFormInputColor: e.target.value })}
                          className="flex-1 text-xs"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Borda dos Inputs</Label>
                      <div className="flex gap-2">
                        <Input
                          type="color"
                          value={formData.leadFormInputBorderColor || "#374151"}
                          onChange={(e) => setFormData({ ...formData, leadFormInputBorderColor: e.target.value })}
                          className="w-10 h-9 p-1"
                          data-testid="input-lead-form-input-border-color"
                        />
                        <Input
                          value={formData.leadFormInputBorderColor || "#374151"}
                          onChange={(e) => setFormData({ ...formData, leadFormInputBorderColor: e.target.value })}
                          className="flex-1 text-xs"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Cor das Labels</Label>
                      <div className="flex gap-2">
                        <Input
                          type="color"
                          value={formData.leadFormLabelColor || "#9ca3af"}
                          onChange={(e) => setFormData({ ...formData, leadFormLabelColor: e.target.value })}
                          className="w-10 h-9 p-1"
                          data-testid="input-lead-form-label-color"
                        />
                        <Input
                          value={formData.leadFormLabelColor || "#9ca3af"}
                          onChange={(e) => setFormData({ ...formData, leadFormLabelColor: e.target.value })}
                          className="flex-1 text-xs"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Tipografia e Estilo */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Fonte do Formulário</Label>
                    <Select
                      value={formData.leadFormFontFamily || "Inter, system-ui, sans-serif"}
                      onValueChange={(v) => setFormData({ ...formData, leadFormFontFamily: v })}
                    >
                      <SelectTrigger data-testid="select-lead-form-font">
                        <SelectValue placeholder="Selecione a fonte" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Inter, system-ui, sans-serif">Inter (Padrão)</SelectItem>
                        <SelectItem value="Roboto, sans-serif">Roboto</SelectItem>
                        <SelectItem value="Open Sans, sans-serif">Open Sans</SelectItem>
                        <SelectItem value="Poppins, sans-serif">Poppins</SelectItem>
                        <SelectItem value="Montserrat, sans-serif">Montserrat</SelectItem>
                        <SelectItem value="Lato, sans-serif">Lato</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Raio da Borda (px)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="32"
                      value={formData.leadFormBorderRadius || "8"}
                      onChange={(e) => setFormData({ ...formData, leadFormBorderRadius: e.target.value })}
                      placeholder="8"
                      data-testid="input-lead-form-border-radius"
                    />
                  </div>
                </div>

                <Button
                  onClick={async () => {
                    try {
                      const token = localStorage.getItem("adminToken");
                      const res = await fetch(`/api/webinars/${webinar?.id}/lead-form-config`, {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                          Authorization: `Bearer ${token}`,
                        },
                        body: JSON.stringify({
                          title: formData.leadFormTitle || "Inscreva-se no Webinário",
                          subtitle: formData.leadFormSubtitle || "",
                          collectName: true,
                          collectEmail: leadsCollectEmail,
                          collectWhatsapp: leadsCollectWhatsapp,
                          collectCity: formData.leadFormCollectCity || false,
                          collectState: formData.leadFormCollectState || false,
                          requireConsent: formData.leadFormRequireConsent !== false,
                          consentText: formData.leadFormConsentText || "Concordo em receber comunicações sobre este webinário",
                          showNextSession: formData.leadFormShowNextSession !== false,
                          buttonText: formData.leadFormButtonText || "Quero Participar",
                          successMessage: formData.leadFormSuccessMessage || "Inscrição realizada com sucesso!",
                          redirectUrl: formData.leadFormRedirectUrl || "",
                          backgroundColor: formData.leadFormBgColor || "#1a1a2e",
                          cardBackgroundColor: formData.leadFormCardColor || "#16213e",
                          buttonColor: formData.leadFormButtonColor || "#22c55e",
                          buttonTextColor: formData.leadFormButtonTextColor || "#ffffff",
                          textColor: formData.leadFormTextColor || "#ffffff",
                          inputBackgroundColor: formData.leadFormInputColor || "#0f0f23",
                          inputBorderColor: formData.leadFormInputBorderColor || "#374151",
                          inputTextColor: formData.leadFormTextColor || "#ffffff",
                          labelColor: formData.leadFormLabelColor || "#9ca3af",
                          fontFamily: formData.leadFormFontFamily || "Inter, system-ui, sans-serif",
                          borderRadius: formData.leadFormBorderRadius || "8",
                        }),
                      });
                      if (res.ok) {
                        toast({ title: "Configuração do formulário salva!" });
                      } else {
                        throw new Error("Erro ao salvar");
                      }
                    } catch (e) {
                      toast({ title: "Erro ao salvar configuração", variant: "destructive" });
                    }
                  }}
                  data-testid="button-save-lead-form-config"
                >
                  <Save className="h-4 w-4 mr-2" />
                  Salvar Configuração do Formulário
                </Button>
              </CardContent>
            </Card>

            {/* Leads Capturados */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Leads Capturados
                </CardTitle>
                <CardDescription>Visualize e exporte os leads inscritos e que assistiram</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">

              {/* Leads separados por tipo */}
              <div className="mt-6 space-y-4">
                {/* Summary Cards */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 bg-muted rounded-lg text-center">
                    <p className="text-2xl font-bold text-primary">{leads.length}</p>
                    <p className="text-xs text-muted-foreground">Total de Leads</p>
                  </div>
                  <div className="p-4 bg-green-500/10 rounded-lg text-center">
                    <p className="text-2xl font-bold text-green-600">{leads.filter(l => l.source === "registration" || l.status === "registered").length}</p>
                    <p className="text-xs text-muted-foreground">Inscritos</p>
                  </div>
                  <div className="p-4 bg-blue-500/10 rounded-lg text-center">
                    <p className="text-2xl font-bold text-blue-600">{leads.filter(l => l.status === "watched").length}</p>
                    <p className="text-xs text-muted-foreground">Assistiram</p>
                  </div>
                </div>

                {/* Export/Delete buttons */}
                {leads.length > 0 && (
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const headers = ["Nome", "Email", "WhatsApp", "Cidade", "Estado", "Tipo", "Status", "Data Inscrição", "Data Assistiu"];
                        const rows = leads.map(l => [
                          l.name || "",
                          l.email || "",
                          l.whatsapp || "",
                          l.city || "",
                          l.state || "",
                          l.source === "registration" ? "Inscrição" : "Sala",
                          l.status === "watched" ? "Assistiu" : "Inscrito",
                          l.capturedAt ? new Date(l.capturedAt).toLocaleString("pt-BR") : "",
                          l.joinedAt ? new Date(l.joinedAt).toLocaleString("pt-BR") : ""
                        ]);
                        const csv = [headers.join(","), ...rows.map(r => r.map(c => `"${c}"`).join(","))].join("\n");
                        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `leads-${webinar?.slug || "webinar"}-${new Date().toISOString().split("T")[0]}.csv`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      data-testid="button-export-leads"
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Exportar CSV
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={async () => {
                        if (!confirm(`Tem certeza que deseja excluir todos os ${leads.length} leads? Esta ação não pode ser desfeita.`)) return;
                        try {
                          const token = localStorage.getItem("adminToken");
                          const res = await fetch(`/api/webinars/${webinar?.id}/leads`, {
                            method: "DELETE",
                            headers: { Authorization: `Bearer ${token}` }
                          });
                          if (res.ok) {
                            setLeads([]);
                            toast({ title: "Leads excluídos", description: "Todos os leads foram removidos com sucesso." });
                          } else {
                            throw new Error("Erro ao excluir");
                          }
                        } catch (e) {
                          toast({ title: "Erro", description: "Não foi possível excluir os leads.", variant: "destructive" });
                        }
                      }}
                      data-testid="button-clear-leads"
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Limpar Todos
                    </Button>
                  </div>
                )}

                {/* Inscritos (Registered) */}
                <div className="p-4 bg-green-500/5 border border-green-500/20 rounded-lg">
                  <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    Inscritos ({leads.filter(l => l.source === "registration" || l.status === "registered").length})
                    <span className="text-xs text-muted-foreground ml-2">Cadastrados na página de inscrição</span>
                  </h4>
                  {leads.filter(l => l.source === "registration" || l.status === "registered").length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum lead inscrito ainda. Compartilhe a página de inscrição: <code className="bg-muted px-1 rounded">/w/{webinar?.slug}/register</code></p>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {leads.filter(l => l.source === "registration" || l.status === "registered").map((lead) => (
                        <div key={lead.id} className="text-sm p-2 bg-background rounded flex items-center justify-between">
                          <div>
                            <p className="font-medium">{lead.name}</p>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              {lead.email && <span>{lead.email}</span>}
                              {lead.whatsapp && <span>{lead.whatsapp}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {lead.status === "watched" && (
                              <Badge variant="secondary" className="text-xs bg-blue-500/10 text-blue-600">Assistiu</Badge>
                            )}
                            {lead.sequenceTriggered && (
                              <Badge variant="outline" className="text-xs">Sequência ativada</Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Assistiram direto (Entered room without registration) */}
                <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg">
                  <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
                    <Video className="h-4 w-4 text-blue-600" />
                    Entraram na Sala ({leads.filter(l => l.source === "room" && l.status !== "registered").length})
                    <span className="text-xs text-muted-foreground ml-2">Entraram direto sem inscrição prévia</span>
                  </h4>
                  {leads.filter(l => l.source === "room" && l.status !== "registered").length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum lead entrou diretamente na sala</p>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {leads.filter(l => l.source === "room" && l.status !== "registered").map((lead) => (
                        <div key={lead.id} className="text-sm p-2 bg-background rounded flex items-center justify-between">
                          <div>
                            <p className="font-medium">{lead.name}</p>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              {lead.email && <span>{lead.email}</span>}
                              {lead.whatsapp && <span>{lead.whatsapp}</span>}
                              {lead.city && lead.state && <span>{lead.city}/{lead.state}</span>}
                            </div>
                          </div>
                          {lead.joinedAt && (
                            <span className="text-xs text-muted-foreground">
                              {new Date(lead.joinedAt).toLocaleString("pt-BR")}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
          </div>
        </TabsContent>

        {/* Banner */}
        <TabsContent value="banner">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div className="h-5 w-5 border-2 rounded" />
                Banner de Anúncio
              </CardTitle>
              <CardDescription>
                Faixa que aparece abaixo do vídeo no momento configurado. Sincronizado com a oferta.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
                <input
                  type="checkbox"
                  checked={formData.bannerEnabled}
                  onChange={(e) => setFormData({ ...formData, bannerEnabled: e.target.checked })}
                  className="h-5 w-5 rounded border-gray-300"
                  id="banner-enabled"
                  data-testid="checkbox-banner-enabled"
                />
                <Label htmlFor="banner-enabled" className="cursor-pointer font-medium">
                  Habilitar banner de anúncio
                </Label>
              </div>

              {formData.bannerEnabled && (
                <div className="space-y-6">
                  {/* Timing */}
                  <div className="p-4 border rounded-lg space-y-4">
                    <h4 className="font-medium">Temporização</h4>
                    
                    <div>
                      <Label className="text-sm mb-2 block">Aparecer no momento do vídeo:</Label>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min={0}
                            value={Math.floor((formData.bannerStartSeconds || 0) / 3600)}
                            onChange={(e) => {
                              const hours = parseInt(e.target.value) || 0;
                              const current = formData.bannerStartSeconds || 0;
                              const mins = Math.floor((current % 3600) / 60);
                              const secs = current % 60;
                              setFormData({ ...formData, bannerStartSeconds: hours * 3600 + mins * 60 + secs });
                            }}
                            className="w-16 text-center"
                            data-testid="input-banner-start-hours"
                          />
                          <span className="text-sm text-muted-foreground">h</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min={0}
                            max={59}
                            value={Math.floor(((formData.bannerStartSeconds || 0) % 3600) / 60)}
                            onChange={(e) => {
                              const mins = parseInt(e.target.value) || 0;
                              const current = formData.bannerStartSeconds || 0;
                              const hours = Math.floor(current / 3600);
                              const secs = current % 60;
                              setFormData({ ...formData, bannerStartSeconds: hours * 3600 + mins * 60 + secs });
                            }}
                            className="w-16 text-center"
                            data-testid="input-banner-start-minutes"
                          />
                          <span className="text-sm text-muted-foreground">m</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min={0}
                            max={59}
                            value={(formData.bannerStartSeconds || 0) % 60}
                            onChange={(e) => {
                              const secs = parseInt(e.target.value) || 0;
                              const current = formData.bannerStartSeconds || 0;
                              const hours = Math.floor(current / 3600);
                              const mins = Math.floor((current % 3600) / 60);
                              setFormData({ ...formData, bannerStartSeconds: hours * 3600 + mins * 60 + secs });
                            }}
                            className="w-16 text-center"
                            data-testid="input-banner-start-seconds"
                          />
                          <span className="text-sm text-muted-foreground">s</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={formData.bannerEndsAtEnd}
                        onChange={(e) => setFormData({ ...formData, bannerEndsAtEnd: e.target.checked })}
                        className="h-4 w-4 rounded"
                        id="banner-ends-at-end"
                        data-testid="checkbox-banner-ends-at-end"
                      />
                      <Label htmlFor="banner-ends-at-end" className="cursor-pointer text-sm">
                        Permanecer até o final do vídeo
                      </Label>
                    </div>

                    {!formData.bannerEndsAtEnd && (
                      <div>
                        <Label className="text-sm mb-2 block">Duração do banner:</Label>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              min={0}
                              value={Math.floor((formData.bannerDurationSeconds || 0) / 3600)}
                              onChange={(e) => {
                                const hours = parseInt(e.target.value) || 0;
                                const current = formData.bannerDurationSeconds || 0;
                                const mins = Math.floor((current % 3600) / 60);
                                const secs = current % 60;
                                setFormData({ ...formData, bannerDurationSeconds: hours * 3600 + mins * 60 + secs });
                              }}
                              className="w-16 text-center"
                              data-testid="input-banner-duration-hours"
                            />
                            <span className="text-sm text-muted-foreground">h</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              min={0}
                              max={59}
                              value={Math.floor(((formData.bannerDurationSeconds || 0) % 3600) / 60)}
                              onChange={(e) => {
                                const mins = parseInt(e.target.value) || 0;
                                const current = formData.bannerDurationSeconds || 0;
                                const hours = Math.floor(current / 3600);
                                const secs = current % 60;
                                setFormData({ ...formData, bannerDurationSeconds: hours * 3600 + mins * 60 + secs });
                              }}
                              className="w-16 text-center"
                              data-testid="input-banner-duration-minutes"
                            />
                            <span className="text-sm text-muted-foreground">m</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              min={0}
                              max={59}
                              value={(formData.bannerDurationSeconds || 0) % 60}
                              onChange={(e) => {
                                const secs = parseInt(e.target.value) || 0;
                                const current = formData.bannerDurationSeconds || 0;
                                const hours = Math.floor(current / 3600);
                                const mins = Math.floor((current % 3600) / 60);
                                setFormData({ ...formData, bannerDurationSeconds: hours * 3600 + mins * 60 + secs });
                              }}
                              className="w-16 text-center"
                              data-testid="input-banner-duration-seconds"
                            />
                            <span className="text-sm text-muted-foreground">s</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Aparência */}
                  <div className="p-4 border rounded-lg space-y-4">
                    <h4 className="font-medium">Aparência</h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Cor de Fundo da Faixa</Label>
                        <div className="flex gap-2">
                          <Input
                            type="color"
                            value={formData.bannerBackgroundColor}
                            onChange={(e) => setFormData({ ...formData, bannerBackgroundColor: e.target.value })}
                            className="w-12 h-10 p-1 cursor-pointer"
                            data-testid="input-banner-bg-color"
                          />
                          <Input
                            value={formData.bannerBackgroundColor}
                            onChange={(e) => setFormData({ ...formData, bannerBackgroundColor: e.target.value })}
                            className="flex-1"
                            data-testid="input-banner-bg-color-text"
                          />
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Cor do Botão</Label>
                        <div className="flex gap-2">
                          <Input
                            type="color"
                            value={formData.bannerButtonColor}
                            onChange={(e) => setFormData({ ...formData, bannerButtonColor: e.target.value })}
                            className="w-12 h-10 p-1 cursor-pointer"
                            data-testid="input-banner-button-color"
                          />
                          <Input
                            value={formData.bannerButtonColor}
                            onChange={(e) => setFormData({ ...formData, bannerButtonColor: e.target.value })}
                            className="flex-1"
                            data-testid="input-banner-button-color-text"
                          />
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Cor do Texto do Botão</Label>
                        <div className="flex gap-2">
                          <Input
                            type="color"
                            value={formData.bannerButtonTextColor}
                            onChange={(e) => setFormData({ ...formData, bannerButtonTextColor: e.target.value })}
                            className="w-12 h-10 p-1 cursor-pointer"
                            data-testid="input-banner-button-text-color"
                          />
                          <Input
                            value={formData.bannerButtonTextColor}
                            onChange={(e) => setFormData({ ...formData, bannerButtonTextColor: e.target.value })}
                            className="flex-1"
                            data-testid="input-banner-button-text-color-text"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Conteúdo */}
                  <div className="p-4 border rounded-lg space-y-4">
                    <h4 className="font-medium">Conteúdo do Botão</h4>
                    
                    <div className="space-y-2">
                      <Label>Texto do Botão</Label>
                      <Input
                        value={formData.bannerButtonText}
                        onChange={(e) => setFormData({ ...formData, bannerButtonText: e.target.value })}
                        placeholder="Ex: Saiba Mais, Clique Aqui, Inscreva-se"
                        data-testid="input-banner-button-text"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label>URL de Destino (ação ao clicar)</Label>
                      <Input
                        value={formData.bannerButtonUrl}
                        onChange={(e) => setFormData({ ...formData, bannerButtonUrl: e.target.value })}
                        placeholder="https://exemplo.com/pagina"
                        data-testid="input-banner-button-url"
                      />
                    </div>
                  </div>

                  {/* Preview */}
                  <div className="p-4 border rounded-lg space-y-4">
                    <h4 className="font-medium">Preview do Banner</h4>
                    <div 
                      className="p-4 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: formData.bannerBackgroundColor }}
                    >
                      <button
                        className="px-6 py-3 rounded-lg font-semibold text-lg shadow-lg hover:opacity-90 transition-opacity"
                        style={{ 
                          backgroundColor: formData.bannerButtonColor,
                          color: formData.bannerButtonTextColor
                        }}
                      >
                        {formData.bannerButtonText || "Saiba Mais"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* SEO e Compartilhamento */}
        <TabsContent value="seo">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                SEO e Compartilhamento
              </CardTitle>
              <CardDescription>Configure como a página aparece nos buscadores e ao compartilhar no WhatsApp/redes sociais</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Informações básicas */}
              <div className="space-y-4">
                <h4 className="font-medium flex items-center gap-2 text-sm">
                  <FileText className="h-4 w-4" />
                  Informações da Página
                </h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Nome do Site</Label>
                    <Input
                      value={formData.seoSiteName}
                      onChange={(e) => setFormData({ ...formData, seoSiteName: e.target.value })}
                      placeholder="Ex: Minha Empresa"
                      data-testid="input-seo-site-name"
                    />
                    <p className="text-xs text-muted-foreground">Aparece na aba do navegador após o título</p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Título da Página</Label>
                    <Input
                      value={formData.seoPageTitle}
                      onChange={(e) => setFormData({ ...formData, seoPageTitle: e.target.value })}
                      placeholder="Ex: Webinário Exclusivo - Aprenda X"
                      data-testid="input-seo-page-title"
                    />
                    <p className="text-xs text-muted-foreground">Título principal que aparece nos buscadores</p>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Textarea
                    value={formData.seoDescription}
                    onChange={(e) => setFormData({ ...formData, seoDescription: e.target.value })}
                    placeholder="Descreva o conteúdo do webinário em 1-2 frases..."
                    rows={3}
                    data-testid="input-seo-description"
                  />
                  <p className="text-xs text-muted-foreground">Descrição que aparece nos resultados de busca e ao compartilhar links</p>
                </div>
              </div>
              
              <Separator />
              
              {/* Imagens */}
              <div className="space-y-4">
                <h4 className="font-medium flex items-center gap-2 text-sm">
                  <Palette className="h-4 w-4" />
                  Imagens
                </h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Favicon */}
                  <div className="space-y-3">
                    <Label>Favicon (ícone da aba)</Label>
                    <div className="flex items-start gap-4">
                      <div 
                        className="w-16 h-16 rounded-lg border bg-muted flex items-center justify-center shrink-0 overflow-hidden"
                        style={{ backgroundColor: formData.pageBackgroundColor }}
                      >
                        {formData.seoFaviconUrl ? (
                          <img 
                            src={formData.seoFaviconUrl} 
                            alt="Favicon" 
                            className="w-8 h-8 object-contain"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <Globe className="w-6 h-6 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 space-y-2">
                        <div className="flex gap-2">
                          <input
                            type="file"
                            accept=".ico,.png,.svg,.jpg,.jpeg,.webp"
                            className="hidden"
                            id="seo-favicon-upload"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              
                              const formDataUpload = new FormData();
                              formDataUpload.append('image', file);
                              formDataUpload.append('type', 'favicon');
                              
                              try {
                                const token = localStorage.getItem("adminToken");
                                const res = await fetch(`/api/webinars/${params.id}/upload-seo-image`, {
                                  method: 'POST',
                                  headers: { 'Authorization': `Bearer ${token}` },
                                  body: formDataUpload,
                                });
                                
                                if (res.ok) {
                                  const { url } = await res.json();
                                  setFormData(prev => ({ ...prev, seoFaviconUrl: url }));
                                  toast({ title: "Favicon enviado com sucesso!" });
                                } else {
                                  const err = await res.json();
                                  toast({ title: "Erro ao enviar favicon", description: err.error, variant: "destructive" });
                                }
                              } catch (error) {
                                toast({ title: "Erro ao enviar favicon", variant: "destructive" });
                              }
                              e.target.value = '';
                            }}
                            data-testid="input-seo-favicon-upload"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => document.getElementById('seo-favicon-upload')?.click()}
                            className="flex items-center gap-2"
                            data-testid="button-seo-favicon-upload"
                          >
                            <Upload className="h-4 w-4" />
                            Enviar Favicon
                          </Button>
                          {formData.seoFaviconUrl && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setFormData(prev => ({ ...prev, seoFaviconUrl: '' }))}
                              className="text-destructive"
                              data-testid="button-seo-favicon-remove"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">Imagem .ico, .png ou .svg (recomendado: 32x32px ou 64x64px)</p>
                      </div>
                    </div>
                  </div>
                  
                  {/* Imagem de Compartilhamento */}
                  <div className="space-y-3">
                    <Label>Imagem de Compartilhamento (Open Graph)</Label>
                    <div className="flex items-start gap-4">
                      <div 
                        className="w-32 h-16 rounded-lg border bg-muted flex items-center justify-center shrink-0 overflow-hidden"
                        style={{ backgroundColor: formData.pageBackgroundColor }}
                      >
                        {formData.seoShareImageUrl ? (
                          <img 
                            src={formData.seoShareImageUrl} 
                            alt="Share" 
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <Video className="w-6 h-6 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 space-y-2">
                        <div className="flex gap-2">
                          <input
                            type="file"
                            accept=".png,.jpg,.jpeg,.webp"
                            className="hidden"
                            id="seo-share-upload"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              
                              const formDataUpload = new FormData();
                              formDataUpload.append('image', file);
                              formDataUpload.append('type', 'share');
                              
                              try {
                                const token = localStorage.getItem("adminToken");
                                const res = await fetch(`/api/webinars/${params.id}/upload-seo-image`, {
                                  method: 'POST',
                                  headers: { 'Authorization': `Bearer ${token}` },
                                  body: formDataUpload,
                                });
                                
                                if (res.ok) {
                                  const { url } = await res.json();
                                  setFormData(prev => ({ ...prev, seoShareImageUrl: url }));
                                  toast({ title: "Imagem enviada com sucesso!" });
                                } else {
                                  const err = await res.json();
                                  toast({ title: "Erro ao enviar imagem", description: err.error, variant: "destructive" });
                                }
                              } catch (error) {
                                toast({ title: "Erro ao enviar imagem", variant: "destructive" });
                              }
                              e.target.value = '';
                            }}
                            data-testid="input-seo-share-upload"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => document.getElementById('seo-share-upload')?.click()}
                            className="flex items-center gap-2"
                            data-testid="button-seo-share-upload"
                          >
                            <Upload className="h-4 w-4" />
                            Enviar Imagem
                          </Button>
                          {formData.seoShareImageUrl && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setFormData(prev => ({ ...prev, seoShareImageUrl: '' }))}
                              className="text-destructive"
                              data-testid="button-seo-share-remove"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">Miniatura que aparece no WhatsApp, Facebook, etc. (recomendado: 1200x630px)</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              <Separator />
              
              {/* Preview */}
              <div className="space-y-4">
                <h4 className="font-medium text-sm">Preview</h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Preview do Google */}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Como aparece no Google</Label>
                    <div className="p-4 rounded-lg border bg-white dark:bg-zinc-900">
                      <div className="space-y-1">
                        <p className="text-blue-600 dark:text-blue-400 text-lg hover:underline cursor-pointer truncate">
                          {formData.seoPageTitle || formData.pageTitle || formData.name || "Título do Webinário"}
                          {formData.seoSiteName && ` | ${formData.seoSiteName}`}
                        </p>
                        <p className="text-green-700 dark:text-green-500 text-sm truncate">
                          {window.location.origin}/w/{formData.slug || "slug"}
                        </p>
                        <p className="text-gray-600 dark:text-gray-400 text-sm line-clamp-2">
                          {formData.seoDescription || "Descrição do webinário aparecerá aqui. Configure para melhorar sua visibilidade nos buscadores."}
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  {/* Preview do WhatsApp/Redes Sociais */}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Como aparece no WhatsApp/Redes Sociais</Label>
                    <div className="p-3 rounded-lg border bg-[#e5ddd5] dark:bg-zinc-800 max-w-sm">
                      <div className="bg-white dark:bg-zinc-900 rounded-lg overflow-hidden shadow-sm">
                        <div 
                          className="h-32 bg-muted flex items-center justify-center"
                          style={{ backgroundColor: formData.seoShareImageUrl ? undefined : formData.pageBackgroundColor }}
                        >
                          {formData.seoShareImageUrl ? (
                            <img 
                              src={formData.seoShareImageUrl} 
                              alt="Share preview" 
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <Video className="w-12 h-12 text-white/50" />
                          )}
                        </div>
                        <div className="p-3 space-y-1">
                          <p className="text-xs text-muted-foreground truncate">
                            {window.location.host}
                          </p>
                          <p className="font-medium text-sm truncate">
                            {formData.seoPageTitle || formData.pageTitle || formData.name || "Título do Webinário"}
                          </p>
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {formData.seoDescription || "Configure a descrição para aparecer aqui"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Embed */}
        <TabsContent value="embed">
          <Card>
            <CardHeader>
              <CardTitle>Código Embed e Links</CardTitle>
              <CardDescription>Use estes códigos para integrar o webinário em sites externos</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Domínio de Produção (opcional)</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="ex: meusite.com.br"
                    value={productionDomain}
                    onChange={(e) => setProductionDomain(e.target.value)}
                    data-testid="input-production-domain"
                  />
                  <Button 
                    onClick={() => {
                      const domain = productionDomain.trim();
                      const fullDomain = domain && !domain.startsWith("http") 
                        ? `https://${domain}` 
                        : domain;
                      fetchEmbedCode(webinar.slug, fullDomain || undefined);
                    }}
                    data-testid="button-generate-embed"
                  >
                    Gerar
                  </Button>
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Link da Página</Label>
                <div className="flex gap-2">
                  <Input
                    value={embedUrl.replace("?embed=1", "")}
                    readOnly
                  />
                  <Button 
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(embedUrl.replace("?embed=1", ""))}
                    data-testid="button-copy-link"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <a 
                    href={`/w/${webinar.slug}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                  >
                    <Button variant="outline" size="icon">
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </a>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <Label>Tipo de Embed</Label>
                  <div className="flex gap-2">
                    <Button
                      variant={embedType === "full" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setEmbedType("full")}
                      data-testid="button-embed-full"
                    >
                      Página Completa
                    </Button>
                    <Button
                      variant={embedType === "compact" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setEmbedType("compact")}
                      data-testid="button-embed-compact"
                    >
                      Só Transmissão
                    </Button>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-muted/50 border">
                  {embedType === "full" ? (
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center shrink-0">
                        <Monitor className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">Página Completa</p>
                        <p className="text-xs text-muted-foreground">
                          Inclui toda a página do webinário: cabeçalho, título, badge, vídeo, comentários e oferta.
                          Ideal para incorporar em páginas que não têm design próprio.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center shrink-0">
                        <Video className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">Só Transmissão</p>
                        <p className="text-xs text-muted-foreground">
                          Apenas o player de vídeo com comentários e oferta, sem cabeçalho nem título da página.
                          Ideal para incorporar em páginas que já têm seu próprio design.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Código Embed ({embedType === "full" ? "Página Completa" : "Só Transmissão"})</Label>
                  <div className="relative">
                    <textarea
                      value={embedType === "full" ? embedCode : embedCodeCompact}
                      readOnly
                      rows={4}
                      className="w-full p-3 bg-muted border border-input rounded-lg text-sm font-mono resize-none"
                    />
                    <Button 
                      variant="secondary"
                      size="sm"
                      onClick={() => copyToClipboard(embedType === "full" ? embedCode : embedCodeCompact)}
                      className="absolute top-2 right-2"
                      data-testid="button-copy-embed"
                    >
                      <Copy className="h-4 w-4 mr-1" />
                      Copiar
                    </Button>
                  </div>
                </div>

                {embedType === "compact" && (
                  <div className="flex gap-2 items-center">
                    <Label className="text-sm">Preview:</Label>
                    <a 
                      href={embedUrlCompact} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline flex items-center gap-1"
                    >
                      Abrir modo compacto <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
              </div>

              <div className="p-4 bg-muted rounded-lg">
                <h4 className="font-medium text-sm mb-2">Instruções</h4>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Cole o código embed no HTML do seu site onde deseja exibir o webinário</li>
                  <li>Para produção, informe o domínio antes de gerar o código</li>
                  <li>Use "Página Completa" para sites sem design próprio</li>
                  <li>Use "Só Transmissão" para integrar em páginas que já têm seu próprio layout</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Estatísticas */}
        <TabsContent value="stats">
          {token && <WebinarAnalytics webinarId={webinar.id} videoDuration={webinar.videoDuration} token={token} />}
        </TabsContent>

        {/* Replay */}
        <TabsContent value="replay">
          {(currentUser?.webinarLimit || 5) <= 5 ? (
            <Card className="border-purple-500/30 bg-gradient-to-br from-purple-500/5 to-blue-500/5">
              <CardHeader className="text-center pb-2">
                <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center mb-4">
                  <Video className="h-8 w-8 text-white" />
                </div>
                <CardTitle className="text-2xl">Recurso Exclusivo Pro+</CardTitle>
                <CardDescription className="text-base">
                  A funcionalidade de Replay está disponível apenas para planos Pro e superiores.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3 text-center">
                  <p className="text-muted-foreground">
                    Com o Replay, você pode:
                  </p>
                  <ul className="space-y-2 text-sm text-left max-w-md mx-auto">
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span>Criar páginas de replay personalizadas</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span>Configurar autoplay automático</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span>Personalizar ofertas e benefícios</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span>Aumentar conversões com replays</span>
                    </li>
                  </ul>
                </div>
                <div className="flex justify-center pt-4">
                  <Button 
                    className="bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white px-8"
                    onClick={() => window.location.href = "/checkout"}
                    data-testid="button-upgrade-replay"
                  >
                    <Sparkles className="h-4 w-4 mr-2" />
                    Fazer Upgrade para Pro
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Video className="h-5 w-5" />
                Editor Visual do Replay
              </CardTitle>
              <CardDescription>Edite diretamente no modelo. Clique nos textos para editar e arraste os beneficios para reordenar.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
                  <input
                    type="checkbox"
                    checked={formData.replayEnabled}
                    onChange={(e) => setFormData({ ...formData, replayEnabled: e.target.checked })}
                    className="h-5 w-5 rounded border-gray-300"
                    id="replay-enabled"
                    data-testid="checkbox-replay-enabled"
                  />
                  <Label htmlFor="replay-enabled" className="cursor-pointer font-medium">
                    Habilitar página de replay
                  </Label>
                </div>

                {formData.replayEnabled && (
                  <div className="p-4 border rounded-lg space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Vídeo do Replay</Label>
                        <Select
                          value={formData.replayVideoId || ""}
                          onValueChange={(value) => setFormData({ ...formData, replayVideoId: value })}
                        >
                          <SelectTrigger data-testid="select-replay-video">
                            <SelectValue placeholder="Selecione um vídeo" />
                          </SelectTrigger>
                          <SelectContent>
                            {videos.map((video) => (
                              <SelectItem key={video.id} value={video.uploadedVideoId}>
                                {video.title || video.filename}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>URL do Replay</Label>
                        <div className="flex gap-2">
                          <Input
                            value={formData.customDomain 
                              ? `https://${formData.customDomain}/w/${formData.slug}/replay`
                              : `${window.location.origin}/w/${formData.slug}/replay`}
                            readOnly
                            className="bg-muted"
                          />
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => {
                              const replayUrl = formData.customDomain 
                                ? `https://${formData.customDomain}/w/${formData.slug}/replay`
                                : `${window.location.origin}/w/${formData.slug}/replay`;
                              navigator.clipboard.writeText(replayUrl);
                              toast({ title: "Link copiado!" });
                            }}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={formData.replayShowControls}
                          onChange={(e) => setFormData({ ...formData, replayShowControls: e.target.checked })}
                          className="h-4 w-4 rounded border-gray-300"
                          id="replay-controls"
                          data-testid="checkbox-replay-controls"
                        />
                        <Label htmlFor="replay-controls" className="cursor-pointer text-sm">
                          Mostrar controles do player
                        </Label>
                      </div>

                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={formData.replayAutoplay}
                          onChange={(e) => setFormData({ ...formData, replayAutoplay: e.target.checked })}
                          className="h-4 w-4 rounded border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                          id="replay-autoplay"
                          data-testid="checkbox-replay-autoplay"
                          disabled={(currentUser?.webinarLimit || 5) <= 5}
                        />
                        <Label htmlFor="replay-autoplay" className={`cursor-pointer text-sm ${(currentUser?.webinarLimit || 5) <= 5 ? 'opacity-50' : ''}`}>
                          Autoplay
                          {(currentUser?.webinarLimit || 5) <= 5 && (
                            <Badge variant="outline" className="ml-2 text-xs bg-purple-500/10 text-purple-400 border-purple-500/30">
                              Pro+
                            </Badge>
                          )}
                        </Label>
                      </div>
                    </div>

                  </div>
                )}
              </div>

              {formData.replayEnabled && (
                <div 
                  className="rounded-xl p-6"
                  style={{ backgroundColor: formData.replayBackgroundColor || "#4A8BB5" }}
                >
                  <ReplayEditor
                    formData={{
                      replayBadgeText: formData.replayBadgeText,
                      replayTitle: formData.replayTitle,
                      replayOfferBadgeText: formData.replayOfferBadgeText,
                      replayOfferTitle: formData.replayOfferTitle,
                      replayOfferSubtitle: formData.replayOfferSubtitle,
                      replayOfferImageUrl: formData.replayOfferImageUrl,
                      replayThumbnailUrl: formData.replayThumbnailUrl,
                      replayPriceText: formData.replayPriceText,
                      replayButtonText: formData.replayButtonText,
                      replayButtonUrl: formData.replayButtonUrl,
                      replayButtonColor: formData.replayButtonColor,
                      replayBackgroundColor: formData.replayBackgroundColor,
                      replayPlayerColor: formData.replayPlayerColor,
                      replayPlayerBorderColor: formData.replayPlayerBorderColor,
                    }}
                    benefitsList={replayBenefitsList}
                    onChange={(field, value) => setFormData({ ...formData, [field]: value })}
                    onBenefitsChange={(benefits) => {
                      setReplayBenefitsList(benefits);
                      setFormData({ ...formData, replayBenefits: JSON.stringify(benefits) });
                    }}
                    onImageUpload={async (file) => {
                      const formDataUpload = new FormData();
                      formDataUpload.append("image", file);
                      const res = await fetch("/api/upload-image", {
                        method: "POST",
                        headers: { Authorization: `Bearer ${token}` },
                        body: formDataUpload,
                      });
                      if (!res.ok) throw new Error("Erro no upload");
                      const data = await res.json();
                      return data.url;
                    }}
                  />
                </div>
              )}
            </CardContent>
          </Card>
          )}
        </TabsContent>
        </div>
      </Tabs>
      
      {/* Modal para colar comentários */}
      <Dialog open={showPasteModal} onOpenChange={setShowPasteModal}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Colar Comentários</DialogTitle>
            <DialogDescription>
              Cole os comentários no formato abaixo. Cada linha deve seguir um dos formatos:
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="p-4 border rounded-lg text-sm bg-card">
              <p className="font-semibold mb-3 text-foreground">Formato aceito:</p>
              <div className="p-2 bg-muted/50 rounded border mb-3">
                <code className="text-primary font-mono text-xs">[HH:MM:SS] Nome – Cidade (UF): Mensagem</code>
              </div>
              <p className="text-sm text-muted-foreground">
                <span className="font-medium">Exemplo:</span> [00:01:30] João Silva – São Paulo (SP): Ótima aula!
              </p>
            </div>
            
            <Textarea
              placeholder="Cole seus comentários aqui, um por linha...

Exemplo:
[00:00:31] Ana Paula – Recife (PE): Boa noite, povo de Deus! 🙌
[00:00:48] Roberto Lima – Goiânia (GO): Música linda pra começar 💙
[01:03:15] Sílvia Torres – Rio de Janeiro (RJ): Essa canção me emociona sempre…"
              value={pasteContent}
              onChange={(e) => setPasteContent(e.target.value)}
              rows={12}
              className="font-mono text-sm"
              data-testid="textarea-paste-comments"
            />
            
            <p className="text-xs text-muted-foreground">
              {pasteContent.split('\n').filter(l => l.trim()).length} linhas detectadas
            </p>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPasteModal(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={async () => {
                if (!pasteContent.trim() || !webinar || pasteLoading) return;
                setPasteLoading(true);
                try {
                  const res = await fetch(`/api/webinars/${webinar.id}/import-comments-text`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ content: pasteContent }),
                  });
                  if (!res.ok) throw new Error("Erro ao importar");
                  const result = await res.json();
                  toast({ title: `Importados: ${result.imported} comentários!` });
                  await fetchComments(webinar.id);
                  setShowPasteModal(false);
                  setPasteContent("");
                } catch (error) {
                  toast({ title: "Erro ao importar comentários", variant: "destructive" });
                } finally {
                  setPasteLoading(false);
                }
              }}
              disabled={pasteLoading || !pasteContent.trim()}
              data-testid="button-submit-paste"
            >
              {pasteLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Importar Comentários
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal para transferir webinário (apenas superadmin) */}
      <Dialog open={showTransferModal} onOpenChange={setShowTransferModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Transferir Webinário</DialogTitle>
            <DialogDescription>
              Selecione a conta de destino para transferir este webinário. Serão transferidos: configurações, vídeo, domínio, sequências de email/WhatsApp, formulários de leads e roteiros.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="target-admin">Conta de Destino</Label>
              {adminsList.length === 0 ? (
                <div className="p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
                  Nenhuma outra conta disponível para transferência.
                </div>
              ) : (
                <Select value={selectedAdminId} onValueChange={setSelectedAdminId}>
                  <SelectTrigger id="target-admin" data-testid="select-transfer-admin">
                    <SelectValue placeholder="Selecione uma conta..." />
                  </SelectTrigger>
                  <SelectContent>
                    {adminsList.map((admin) => (
                      <SelectItem key={admin.id} value={admin.id} data-testid={`option-admin-${admin.id}`}>
                        {admin.name} ({admin.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {selectedAdminId && (
              <div className="p-3 bg-muted/50 rounded-lg text-sm space-y-1">
                <p className="font-medium text-foreground">O que será transferido:</p>
                <ul className="text-muted-foreground space-y-0.5 pl-4 list-disc">
                  <li>Todas as configurações do webinário</li>
                  <li>Vídeo associado (se houver)</li>
                  <li>Domínio personalizado (se houver)</li>
                  <li>Sequências de email</li>
                  <li>Sequências de WhatsApp</li>
                  <li>Formulários de leads</li>
                  <li>Roteiros salvos</li>
                </ul>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTransferModal(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleTransfer}
              disabled={transferring || !selectedAdminId || adminsList.length === 0}
              data-testid="button-confirm-transfer"
            >
              {transferring ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArrowRightLeft className="h-4 w-4 mr-2" />}
              Transferir Webinário
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
