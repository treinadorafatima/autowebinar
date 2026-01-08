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
  Radio, Play, Pause, X, Users, Calendar, Filter, Eye, Download,
  FileSpreadsheet, List, History, FolderOpen, Pencil, Copy, Video
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
  provider: "baileys" | "cloud_api";
  cloudApiAccessToken?: string | null;
  cloudApiPhoneNumberId?: string | null;
  cloudApiBusinnessAccountId?: string | null;
  cloudApiWebhookVerifyToken?: string | null;
  cloudApiVersion?: string | null;
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

interface WhatsappContactList {
  id: string;
  adminId: string;
  name: string;
  description: string | null;
  totalContacts: number;
  createdAt: string;
  updatedAt: string;
}

interface WhatsappContact {
  id: string;
  listId: string;
  name: string;
  phone: string;
  email: string | null;
  createdAt: string;
}

interface BroadcastRecipient {
  id: string;
  broadcastId: string;
  leadId: string | null;
  contactId: string | null;
  phone: string;
  name: string | null;
  email: string | null;
  sessionDate: string | null;
  accountId: string | null;
  status: string;
  attempts: number;
  lastAttemptAt: string | null;
  sentAt: string | null;
  errorMessage: string | null;
  createdAt: string;
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

function ContactListsTab() {
  const { toast } = useToast();
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importName, setImportName] = useState("");
  const [importDescription, setImportDescription] = useState("");
  const [importData, setImportData] = useState<any[]>([]);
  const [importFileName, setImportFileName] = useState("");
  const [showContactsDialog, setShowContactsDialog] = useState(false);
  const [selectedList, setSelectedList] = useState<WhatsappContactList | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: contactLists, isLoading } = useQuery<WhatsappContactList[]>({
    queryKey: ["/api/whatsapp/contact-lists"],
  });

  const { data: contacts, isLoading: loadingContacts } = useQuery<WhatsappContact[]>({
    queryKey: ["/api/whatsapp/contact-lists", selectedList?.id, "contacts"],
    enabled: !!selectedList,
  });

  const importMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; data: any[] }) => {
      const res = await apiRequest("POST", "/api/whatsapp/contact-lists/import", data);
      return res.json();
    },
    onSuccess: (result: any) => {
      toast({ 
        title: "Lista importada", 
        description: `${result.imported} contatos importados com sucesso${result.totalErrors > 0 ? `. ${result.totalErrors} erros.` : ""}` 
      });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/contact-lists"] });
      setShowImportDialog(false);
      resetImport();
    },
    onError: (error: any) => {
      toast({ title: "Erro ao importar", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/whatsapp/contact-lists/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Lista excluída" });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/contact-lists"] });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    },
  });

  const resetImport = () => {
    setImportName("");
    setImportDescription("");
    setImportData([]);
    setImportFileName("");
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFileName(file.name);
    
    try {
      const XLSX = await import("xlsx");
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet);
      
      setImportData(data);
      setImportName(file.name.replace(/\.(xlsx?|csv)$/i, ""));
      setShowImportDialog(true);
    } catch (error: any) {
      toast({ title: "Erro ao ler arquivo", description: error.message, variant: "destructive" });
    }
    
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const downloadTemplate = async () => {
    try {
      const token = localStorage.getItem("adminToken");
      const res = await fetch("/api/whatsapp/contact-lists/template", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Erro ao baixar modelo");
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "modelo_contatos.xlsx";
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      toast({ title: "Erro ao baixar modelo", description: error.message, variant: "destructive" });
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <List className="w-5 h-5" />
            Listas de Contatos
          </CardTitle>
          <CardDescription>
            Importe listas de contatos de arquivos Excel para enviar mensagens em massa
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Button onClick={downloadTemplate} variant="outline" data-testid="button-download-template">
              <Download className="w-4 h-4 mr-2" />
              Baixar Modelo Excel
            </Button>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileChange}
            />
            <Button onClick={() => fileInputRef.current?.click()} data-testid="button-import-excel">
              <Upload className="w-4 h-4 mr-2" />
              Importar Planilha
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : contactLists && contactLists.length > 0 ? (
            <div className="space-y-3">
              {contactLists.map((list) => (
                <div
                  key={list.id}
                  className="flex items-center justify-between p-4 bg-muted/50 rounded-lg gap-4"
                  data-testid={`contact-list-${list.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4 text-green-500 shrink-0" />
                      <span className="font-medium truncate">{list.name}</span>
                    </div>
                    {list.description && (
                      <p className="text-sm text-muted-foreground mt-1 truncate">{list.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {list.totalContacts} contatos | Importado em {new Date(list.createdAt).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setSelectedList(list); setShowContactsDialog(true); }}
                      data-testid={`button-view-contacts-${list.id}`}
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      Ver
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        if (confirm("Tem certeza que deseja excluir esta lista?")) {
                          deleteMutation.mutate(list.id);
                        }
                      }}
                      disabled={deleteMutation.isPending}
                      data-testid={`button-delete-list-${list.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <FileSpreadsheet className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Nenhuma lista importada</h3>
              <p className="text-muted-foreground text-sm mb-4">
                Baixe o modelo Excel, preencha com seus contatos e importe aqui
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Importar Lista de Contatos</DialogTitle>
            <DialogDescription>
              {importData.length} contatos encontrados em "{importFileName}"
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome da Lista</Label>
              <Input
                value={importName}
                onChange={(e) => setImportName(e.target.value)}
                placeholder="Ex: Leads Novembro 2024"
                data-testid="input-list-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Descrição (opcional)</Label>
              <Input
                value={importDescription}
                onChange={(e) => setImportDescription(e.target.value)}
                placeholder="Ex: Contatos do evento de lançamento"
                data-testid="input-list-description"
              />
            </div>
            {importData.length > 0 && (
              <div className="p-3 bg-muted rounded-lg text-sm">
                <p className="font-medium mb-2">Preview:</p>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {importData.slice(0, 5).map((row, i) => (
                    <div key={i} className="text-muted-foreground">
                      {row.nome || row.name || row.Nome || "?"} - {row.telefone || row.phone || row.Telefone || "?"}
                    </div>
                  ))}
                  {importData.length > 5 && (
                    <p className="text-muted-foreground">... e mais {importData.length - 5} contatos</p>
                  )}
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setShowImportDialog(false); resetImport(); }}>
              Cancelar
            </Button>
            <Button
              onClick={() => importMutation.mutate({ name: importName, description: importDescription, data: importData })}
              disabled={!importName || importData.length === 0 || importMutation.isPending}
              data-testid="button-confirm-import"
            >
              {importMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              Importar {importData.length} Contatos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showContactsDialog} onOpenChange={setShowContactsDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{selectedList?.name}</DialogTitle>
            <DialogDescription>{selectedList?.totalContacts} contatos</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            {loadingContacts ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : contacts && contacts.length > 0 ? (
              <div className="space-y-2">
                {contacts.map((contact) => (
                  <div key={contact.id} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                    <Users className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{contact.name}</p>
                      <p className="text-sm text-muted-foreground">{contact.phone}</p>
                    </div>
                    {contact.email && (
                      <span className="text-xs text-muted-foreground truncate max-w-32">{contact.email}</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center py-8 text-muted-foreground">Nenhum contato encontrado</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function BroadcastHistoryTab() {
  const { data: broadcasts, isLoading } = useQuery<WhatsAppBroadcast[]>({
    queryKey: ["/api/whatsapp/broadcasts"],
  });

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { className: string; label: string }> = {
      draft: { className: "bg-gray-500/10 text-gray-500", label: "Rascunho" },
      pending: { className: "bg-yellow-500/10 text-yellow-500", label: "Pendente" },
      running: { className: "bg-blue-500/10 text-blue-500", label: "Enviando" },
      paused: { className: "bg-orange-500/10 text-orange-500", label: "Pausado" },
      completed: { className: "bg-green-500/10 text-green-500", label: "Concluído" },
      cancelled: { className: "bg-red-500/10 text-red-500", label: "Cancelado" },
    };
    const v = variants[status] || variants.draft;
    return <Badge className={v.className}>{v.label}</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="w-5 h-5" />
          Histórico de Envios
        </CardTitle>
        <CardDescription>
          Veja o histórico completo de todos os envios em massa realizados
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : broadcasts && broadcasts.length > 0 ? (
          <div className="space-y-4">
            {broadcasts.map((broadcast) => (
              <div
                key={broadcast.id}
                className="p-4 bg-muted/50 rounded-lg space-y-3"
                data-testid={`broadcast-history-${broadcast.id}`}
              >
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <Radio className="w-5 h-5 text-green-500" />
                    <div>
                      <h4 className="font-medium">{broadcast.name}</h4>
                      <p className="text-sm text-muted-foreground">
                        Criado em {new Date(broadcast.createdAt).toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                  {getStatusBadge(broadcast.status)}
                </div>
                
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="p-2 bg-background rounded-lg">
                    <p className="text-2xl font-bold">{broadcast.totalRecipients}</p>
                    <p className="text-xs text-muted-foreground">Total</p>
                  </div>
                  <div className="p-2 bg-green-500/10 rounded-lg">
                    <p className="text-2xl font-bold text-green-500">{broadcast.sentCount}</p>
                    <p className="text-xs text-muted-foreground">Enviados</p>
                  </div>
                  <div className="p-2 bg-red-500/10 rounded-lg">
                    <p className="text-2xl font-bold text-red-500">{broadcast.failedCount}</p>
                    <p className="text-xs text-muted-foreground">Falhas</p>
                  </div>
                </div>

                {broadcast.messageText && (
                  <div className="p-3 bg-background rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Mensagem:</p>
                    <p className="text-sm whitespace-pre-wrap line-clamp-3">{broadcast.messageText}</p>
                  </div>
                )}

                {(broadcast.startedAt || broadcast.completedAt) && (
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    {broadcast.startedAt && (
                      <span>Iniciado: {new Date(broadcast.startedAt).toLocaleString("pt-BR")}</span>
                    )}
                    {broadcast.completedAt && (
                      <span>Concluído: {new Date(broadcast.completedAt).toLocaleString("pt-BR")}</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <History className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Nenhum envio realizado</h3>
            <p className="text-muted-foreground text-sm">
              Os envios em massa que você realizar aparecerão aqui
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

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
  const [broadcastSourceType, setBroadcastSourceType] = useState<"webinar" | "contact_list">("webinar");
  const [broadcastWebinarId, setBroadcastWebinarId] = useState<string>("");
  const [broadcastContactListId, setBroadcastContactListId] = useState<string>("");
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
    sendAsVoiceNote: false,
  });
  const [previewLeads, setPreviewLeads] = useState<BroadcastPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [broadcastAction, setBroadcastAction] = useState<"draft" | "scheduled" | "immediate">("draft");
  const [broadcastScheduledDate, setBroadcastScheduledDate] = useState<string>("");
  const [broadcastScheduledTime, setBroadcastScheduledTime] = useState<string>("");
  const [broadcastMediaSource, setBroadcastMediaSource] = useState<"upload" | "library">("upload");

  // Broadcast details modal states
  const [showBroadcastDetailsDialog, setShowBroadcastDetailsDialog] = useState(false);
  const [selectedBroadcastId, setSelectedBroadcastId] = useState<string | null>(null);
  const [detailsStatusFilter, setDetailsStatusFilter] = useState<string>("all");

  // Media file rename states
  const [renamingFileId, setRenamingFileId] = useState<string | null>(null);
  const [renameFileName, setRenameFileName] = useState("");

  // Cloud API states
  const [showCloudApiDialog, setShowCloudApiDialog] = useState(false);
  const [cloudApiConfig, setCloudApiConfig] = useState({
    accessToken: "",
    phoneNumberId: "",
    businessAccountId: "",
    webhookVerifyToken: "",
    apiVersion: "v20.0",
  });
  const [validatingCloudApi, setValidatingCloudApi] = useState(false);
  const [cloudApiValidation, setCloudApiValidation] = useState<{ valid: boolean; phoneNumber?: string; displayName?: string; error?: string } | null>(null);

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
    queryKey: ["/api/whatsapp/accounts/limit", "marketing"],
    queryFn: async () => {
      const res = await fetch("/api/whatsapp/accounts/limit?scope=marketing", {
        headers: { Authorization: `Bearer ${localStorage.getItem("adminToken")}` }
      });
      return res.json();
    },
  });

  // Use marketing-only endpoint to get only marketing accounts
  const { data: accounts, isLoading: loadingAccounts } = useQuery<WhatsAppAccount[]>({
    queryKey: ["/api/whatsapp/accounts/marketing"],
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
    enabled: activeTab === "files" || showNewBroadcastDialog
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
    enabled: !!broadcastWebinarId && (activeTab === "broadcasts" || showNewBroadcastDialog),
  });

  const { data: broadcastContactLists } = useQuery<WhatsappContactList[]>({
    queryKey: ["/api/whatsapp/contact-lists"],
    enabled: activeTab === "broadcasts",
  });

  // Query for broadcast recipients (details view)
  const { data: broadcastRecipients, isLoading: loadingRecipients } = useQuery<BroadcastRecipient[]>({
    queryKey: ["/api/whatsapp/broadcasts", selectedBroadcastId, "recipients"],
    queryFn: async () => {
      if (!selectedBroadcastId) return [];
      const res = await fetch(`/api/whatsapp/broadcasts/${selectedBroadcastId}/recipients`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("adminToken")}` }
      });
      return res.json();
    },
    enabled: !!selectedBroadcastId && showBroadcastDetailsDialog,
    refetchInterval: showBroadcastDetailsDialog ? 3000 : false,
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
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/accounts/marketing"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/accounts/marketing"] });
    },
    onError: (error: any) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const createAccountMutation = useMutation({
    mutationFn: async (data: { label: string; dailyLimit: number; priority: number }) => {
      const res = await apiRequest("POST", "/api/whatsapp/accounts", { ...data, scope: "marketing" });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Erro ao criar conta");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Conta WhatsApp criada com sucesso" });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/accounts/marketing"] });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/accounts/limit", "marketing"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/accounts/marketing"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/accounts/marketing"] });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/accounts/limit", "marketing"] });
      if (selectedAccountId && accounts) {
        const remaining = accounts.filter(a => a.id !== selectedAccountId);
        setSelectedAccountId(remaining.length > 0 ? remaining[0].id : null);
      }
    },
    onError: (error: any) => {
      toast({ title: "Erro ao excluir conta", description: error.message, variant: "destructive" });
    },
  });

  const configureCloudApiMutation = useMutation({
    mutationFn: async ({ id, config }: { id: string; config: typeof cloudApiConfig }) => {
      const res = await apiRequest("POST", `/api/whatsapp/accounts/${id}/cloud-api`, config);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Erro ao configurar Cloud API");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Cloud API configurada com sucesso" });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/accounts/marketing"] });
      setShowCloudApiDialog(false);
      setCloudApiConfig({ accessToken: "", phoneNumberId: "", businessAccountId: "", webhookVerifyToken: "", apiVersion: "v20.0" });
      setCloudApiValidation(null);
    },
    onError: (error: any) => {
      toast({ title: "Erro ao configurar Cloud API", description: error.message, variant: "destructive" });
    },
  });

  const switchProviderMutation = useMutation({
    mutationFn: async ({ id, provider }: { id: string; provider: "baileys" | "cloud_api" }) => {
      const res = await apiRequest("PATCH", `/api/whatsapp/accounts/${id}/provider`, { provider });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Erro ao trocar provider");
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      toast({ title: `Alterado para ${variables.provider === "cloud_api" ? "Cloud API (Meta)" : "Baileys (QR Code)"}` });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/accounts/marketing"] });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/status"] });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao trocar provider", description: error.message, variant: "destructive" });
    },
  });

  const handleValidateCloudApi = async () => {
    if (!cloudApiConfig.accessToken || !cloudApiConfig.phoneNumberId) {
      toast({ title: "Preencha o Access Token e Phone Number ID", variant: "destructive" });
      return;
    }
    setValidatingCloudApi(true);
    try {
      const res = await fetch("/api/whatsapp/validate-cloud-api", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("adminToken")}`,
        },
        body: JSON.stringify({
          accessToken: cloudApiConfig.accessToken,
          phoneNumberId: cloudApiConfig.phoneNumberId,
          apiVersion: cloudApiConfig.apiVersion,
        }),
      });
      const data = await res.json();
      setCloudApiValidation(data);
      if (data.valid) {
        toast({ title: "Credenciais válidas!", description: `Número: ${data.phoneNumber}` });
      } else {
        toast({ title: "Credenciais inválidas", description: data.error, variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Erro ao validar", description: error.message, variant: "destructive" });
    } finally {
      setValidatingCloudApi(false);
    }
  };

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

  const renameMediaFileMutation = useMutation({
    mutationFn: async ({ id, fileName }: { id: string; fileName: string }) => {
      const res = await apiRequest("PATCH", `/api/media/${id}`, { fileName });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Arquivo renomeado" });
      queryClient.invalidateQueries({ queryKey: ["/api/media"] });
      setRenamingFileId(null);
      setRenameFileName("");
    },
    onError: (error: any) => {
      toast({ title: "Erro ao renomear", description: error.message, variant: "destructive" });
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
      const actionMessages = {
        draft: "Rascunho salvo com sucesso",
        scheduled: "Envio agendado com sucesso",
        immediate: "Envio iniciado com sucesso"
      };
      toast({ title: actionMessages[broadcastAction] || "Envio criado" });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/broadcasts"] });
      setShowNewBroadcastDialog(false);
      setNewBroadcast({ name: "", messageText: "", messageType: "text", mediaUrl: "", mediaFileName: "", mediaMimeType: "", sendAsVoiceNote: false });
      setPreviewLeads(null);
      setBroadcastAction("draft");
      setBroadcastScheduledDate("");
      setBroadcastScheduledTime("");
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
    // Message is only required for text type, optional for media types (caption)
    if (newBroadcast.messageType === "text" && !newBroadcast.messageText) {
      toast({ title: "Preencha a mensagem", variant: "destructive" });
      return;
    }
    
    if (broadcastSourceType === "webinar" && !broadcastWebinarId) {
      toast({ title: "Selecione um webinar", variant: "destructive" });
      return;
    }
    if (broadcastSourceType === "contact_list" && !broadcastContactListId) {
      toast({ title: "Selecione uma lista de contatos", variant: "destructive" });
      return;
    }

    // Validate scheduled date/time
    if (broadcastAction === "scheduled") {
      if (!broadcastScheduledDate || !broadcastScheduledTime) {
        toast({ title: "Preencha a data e hora do agendamento", variant: "destructive" });
        return;
      }
      const scheduledDateTime = new Date(`${broadcastScheduledDate}T${broadcastScheduledTime}:00`);
      if (scheduledDateTime <= new Date()) {
        toast({ title: "A data/hora deve ser no futuro", variant: "destructive" });
        return;
      }
    }

    // Build scheduledAt ISO string for scheduled broadcasts
    const scheduledAt = broadcastAction === "scheduled" 
      ? new Date(`${broadcastScheduledDate}T${broadcastScheduledTime}:00`).toISOString()
      : undefined;

    createBroadcastMutation.mutate({
      sourceType: broadcastSourceType,
      webinarId: broadcastSourceType === "webinar" ? broadcastWebinarId : undefined,
      contactListId: broadcastSourceType === "contact_list" ? broadcastContactListId : undefined,
      name: newBroadcast.name,
      messageText: newBroadcast.messageText,
      messageType: newBroadcast.messageType,
      mediaUrl: newBroadcast.mediaUrl || undefined,
      mediaFileName: newBroadcast.mediaFileName || undefined,
      mediaMimeType: newBroadcast.mediaMimeType || undefined,
      sendAsVoiceNote: newBroadcast.sendAsVoiceNote,
      filterType: broadcastSourceType === "webinar" ? broadcastFilterType : undefined,
      filterDateStart: broadcastSourceType === "webinar" && broadcastFilterType === "date_range" ? broadcastDateStart : undefined,
      filterDateEnd: broadcastSourceType === "webinar" && broadcastFilterType === "date_range" ? broadcastDateEnd : undefined,
      filterSessionDate: broadcastSourceType === "webinar" && broadcastFilterType === "session" ? broadcastSessionDate : undefined,
      action: broadcastAction,
      scheduledAt,
    });
  };

  const getBroadcastStatusBadge = (status: string) => {
    switch (status) {
      case "draft": return <Badge variant="outline">Rascunho</Badge>;
      case "scheduled": return <Badge className="bg-purple-500/10 text-purple-500 border-purple-500/20"><Clock className="w-3 h-3 mr-1" />Agendado</Badge>;
      case "pending": return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">Pendente</Badge>;
      case "sending": return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Enviando</Badge>;
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

  const handleBroadcastMediaUpload = async (file: File) => {
    const messageType = newBroadcast.messageType;
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

      setNewBroadcast({
        ...newBroadcast,
        mediaUrl: data.url,
        mediaFileName: file.name,
        mediaMimeType: file.type,
      });
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
          <TabsList className="grid grid-cols-8 w-full max-w-5xl">
            <TabsTrigger value="accounts" data-testid="tab-accounts">
              <SiWhatsapp className="w-4 h-4 mr-1" />
              Contas
            </TabsTrigger>
            <TabsTrigger value="connection" data-testid="tab-connection">
              <Smartphone className="w-4 h-4 mr-1" />
              Conexão
            </TabsTrigger>
            <TabsTrigger value="sequences" data-testid="tab-sequences">
              <Clock className="w-4 h-4 mr-1" />
              Sequências
            </TabsTrigger>
            <TabsTrigger value="broadcasts" data-testid="tab-broadcasts">
              <Radio className="w-4 h-4 mr-1" />
              Envios
            </TabsTrigger>
            <TabsTrigger value="contact-lists" data-testid="tab-contact-lists">
              <List className="w-4 h-4 mr-1" />
              Listas
            </TabsTrigger>
            <TabsTrigger value="history" data-testid="tab-history">
              <History className="w-4 h-4 mr-1" />
              Histórico
            </TabsTrigger>
            <TabsTrigger value="files" data-testid="tab-files">
              <Image className="w-4 h-4 mr-1" />
              Arquivos
            </TabsTrigger>
            <TabsTrigger value="test" data-testid="tab-test">
              <Send className="w-4 h-4 mr-1" />
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
                        <div className="flex justify-between items-center">
                          <span>Provider:</span>
                          <Badge 
                            variant="outline" 
                            className={account.provider === "cloud_api" ? "bg-blue-500/10 text-blue-500 border-blue-500/20" : "bg-purple-500/10 text-purple-500 border-purple-500/20"}
                            data-testid={`badge-provider-${account.id}`}
                          >
                            {account.provider === "cloud_api" ? "Cloud API (Meta)" : "Baileys (QR)"}
                          </Badge>
                        </div>
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
                <div className="flex items-center gap-4 mb-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Label>Conta:</Label>
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
                  <div className="flex items-center gap-2">
                    <Label>Método:</Label>
                    <Select 
                      value={accounts?.find(a => a.id === selectedAccountId)?.provider || "baileys"}
                      onValueChange={(value: "baileys" | "cloud_api") => {
                        if (selectedAccountId) {
                          switchProviderMutation.mutate({ id: selectedAccountId, provider: value });
                        }
                      }}
                    >
                      <SelectTrigger className="w-48" data-testid="select-provider">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="baileys">QR Code (Baileys)</SelectItem>
                        <SelectItem value="cloud_api">API Oficial (Meta)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {(() => {
                  const selectedAccount = accounts?.find(a => a.id === selectedAccountId);
                  const isCloudApi = selectedAccount?.provider === "cloud_api";
                  
                  if (isCloudApi) {
                    const hasCloudApiConfig = selectedAccount?.cloudApiAccessToken && selectedAccount?.cloudApiPhoneNumberId;
                    
                    return (
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <SiWhatsapp className="w-5 h-5 text-green-500" />
                            Cloud API (Meta) - {selectedAccount?.label}
                          </CardTitle>
                          <CardDescription>
                            Conecte usando a API oficial do WhatsApp Business da Meta
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                          {hasCloudApiConfig ? (
                            <div className="text-center space-y-4">
                              <div className="w-24 h-24 mx-auto bg-green-500/10 rounded-full flex items-center justify-center">
                                <CheckCircle className="w-12 h-12 text-green-500" />
                              </div>
                              <div>
                                <p className="text-lg font-medium text-green-500">Cloud API Configurada</p>
                                {selectedAccount?.phoneNumber && (
                                  <p className="text-muted-foreground">{selectedAccount.phoneNumber}</p>
                                )}
                                <Badge variant="outline" className="mt-2">
                                  API Version: {selectedAccount?.cloudApiVersion || "v20.0"}
                                </Badge>
                              </div>
                              <div className="flex items-center justify-center gap-2">
                                <Button 
                                  variant="outline"
                                  onClick={() => {
                                    setCloudApiConfig({
                                      accessToken: "",
                                      phoneNumberId: selectedAccount?.cloudApiPhoneNumberId || "",
                                      businessAccountId: selectedAccount?.cloudApiBusinnessAccountId || "",
                                      webhookVerifyToken: selectedAccount?.cloudApiWebhookVerifyToken || "",
                                      apiVersion: selectedAccount?.cloudApiVersion || "v20.0",
                                    });
                                    setShowCloudApiDialog(true);
                                  }}
                                  data-testid="button-edit-cloud-api"
                                >
                                  <Edit className="w-4 h-4 mr-2" />
                                  Editar Configuração
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="text-center space-y-4">
                              <div className="w-24 h-24 mx-auto bg-muted rounded-full flex items-center justify-center">
                                <SiWhatsapp className="w-12 h-12 text-muted-foreground" />
                              </div>
                              <div>
                                <p className="font-medium">Configure suas credenciais da Cloud API</p>
                                <p className="text-sm text-muted-foreground mt-1">
                                  Você precisará do Access Token e Phone Number ID do Meta Business
                                </p>
                              </div>
                              <Button 
                                onClick={() => {
                                  setCloudApiConfig({
                                    accessToken: "",
                                    phoneNumberId: "",
                                    businessAccountId: "",
                                    webhookVerifyToken: "",
                                    apiVersion: "v20.0",
                                  });
                                  setShowCloudApiDialog(true);
                                }}
                                data-testid="button-configure-cloud-api"
                              >
                                <Plus className="w-4 h-4 mr-2" />
                                Configurar Cloud API
                              </Button>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  }
                  
                  return (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <QrCode className="w-5 h-5" />
                          Conexão WhatsApp - {selectedAccount?.label}
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
                  );
                })()}
              </>
            )}

            {(() => {
              const selectedAccount = accounts?.find(a => a.id === selectedAccountId);
              const isCloudApi = selectedAccount?.provider === "cloud_api";
              
              if (isCloudApi) {
                return (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Info className="w-5 h-5 text-blue-500" />
                        Como configurar a API Oficial (Meta)
                      </CardTitle>
                      <CardDescription>
                        Passo a passo para conectar usando o WhatsApp Cloud API
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-4">
                        <div className="flex gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 font-bold shrink-0">1</div>
                          <div>
                            <p className="font-medium">Acesse o Meta for Developers</p>
                            <p className="text-sm text-muted-foreground">
                              Vá para <a href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">developers.facebook.com</a> e faça login com sua conta do Facebook
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 font-bold shrink-0">2</div>
                          <div>
                            <p className="font-medium">Crie um App</p>
                            <p className="text-sm text-muted-foreground">
                              Clique em "Criar App" → Selecione "Negócios" → Dê um nome ao app → Clique em "Criar App"
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 font-bold shrink-0">3</div>
                          <div>
                            <p className="font-medium">Adicione o produto WhatsApp</p>
                            <p className="text-sm text-muted-foreground">
                              No dashboard do app, encontre "WhatsApp" na lista de produtos e clique em "Configurar"
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 font-bold shrink-0">4</div>
                          <div>
                            <p className="font-medium">Configure o WhatsApp Business</p>
                            <p className="text-sm text-muted-foreground">
                              Crie ou vincule uma conta WhatsApp Business (WABA). Você pode usar um número de teste gratuito para começar.
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 font-bold shrink-0">5</div>
                          <div>
                            <p className="font-medium">Obtenha as credenciais</p>
                            <p className="text-sm text-muted-foreground">
                              Na página "Primeiros Passos", você encontrará:
                            </p>
                            <ul className="text-sm text-muted-foreground list-disc list-inside mt-1 space-y-1">
                              <li><span className="font-medium text-foreground">Phone Number ID</span> - ID do número de telefone</li>
                              <li><span className="font-medium text-foreground">Access Token</span> - Token de acesso (clique em "Gerar token")</li>
                              <li><span className="font-medium text-foreground">Business Account ID</span> - ID da conta comercial (opcional)</li>
                            </ul>
                          </div>
                        </div>
                        <div className="flex gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 font-bold shrink-0">6</div>
                          <div>
                            <p className="font-medium">Configure aqui no sistema</p>
                            <p className="text-sm text-muted-foreground">
                              Clique em "Configurar Cloud API" acima e cole as credenciais. Clique em "Validar" para verificar se está tudo correto.
                            </p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 mt-4">
                        <div className="flex gap-2">
                          <Info className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                          <div className="text-sm">
                            <p className="font-medium text-amber-600 dark:text-amber-400">Importante sobre o Token de Acesso</p>
                            <p className="text-muted-foreground mt-1">
                              O token temporário expira em 24 horas. Para produção, gere um token permanente em Configurações do App → Básico → Token de Acesso do Sistema.
                            </p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              }
              
              return (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Info className="w-5 h-5 text-green-500" />
                      Como funciona o QR Code (Baileys)
                    </CardTitle>
                    <CardDescription>
                      Passo a passo para conectar via QR Code
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4">
                      <div className="flex gap-3">
                        <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center text-green-500 font-bold shrink-0">1</div>
                        <div>
                          <p className="font-medium">Conecte seu WhatsApp</p>
                          <p className="text-sm text-muted-foreground">Clique em "Conectar WhatsApp" para gerar o QR Code</p>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center text-green-500 font-bold shrink-0">2</div>
                        <div>
                          <p className="font-medium">Escaneie o QR Code</p>
                          <p className="text-sm text-muted-foreground">
                            No WhatsApp do celular, vá em Configurações → Aparelhos conectados → Conectar aparelho → Escaneie o código
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center text-green-500 font-bold shrink-0">3</div>
                        <div>
                          <p className="font-medium">Crie sequências de mensagens</p>
                          <p className="text-sm text-muted-foreground">Configure mensagens automáticas para antes, durante e após o webinar</p>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center text-green-500 font-bold shrink-0">4</div>
                        <div>
                          <p className="font-medium">Envio automático</p>
                          <p className="text-sm text-muted-foreground">As mensagens são enviadas automaticamente nos horários configurados</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 mt-4">
                      <div className="flex gap-2">
                        <Info className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                        <div className="text-sm">
                          <p className="font-medium text-amber-600 dark:text-amber-400">Atenção</p>
                          <p className="text-muted-foreground mt-1">
                            Este método usa uma API não-oficial. Para maior estabilidade e para evitar bloqueios, recomendamos a API Oficial (Meta).
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })()}
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
                onClick={() => setShowNewBroadcastDialog(true)}
                data-testid="button-new-broadcast"
              >
                <Plus className="w-4 h-4 mr-2" />
                Novo Envio
              </Button>
            </div>

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
                                {broadcast.status === "scheduled" && broadcast.scheduledAt && (
                                  <span className="ml-2 text-purple-500">
                                    • Agendado para {new Date(broadcast.scheduledAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" })}
                                  </span>
                                )}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              {(broadcast.status === "draft" || broadcast.status === "pending" || broadcast.status === "paused") && (
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
                              {broadcast.status === "scheduled" && (
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => {
                                    if (confirm("Tem certeza que deseja cancelar este agendamento?")) {
                                      cancelBroadcastMutation.mutate(broadcast.id);
                                    }
                                  }}
                                  disabled={cancelBroadcastMutation.isPending}
                                  data-testid={`button-cancel-scheduled-${broadcast.id}`}
                                >
                                  <X className="w-3 h-3 mr-1" />
                                  Cancelar
                                </Button>
                              )}
                              {(broadcast.status === "draft" || broadcast.status === "completed" || broadcast.status === "cancelled") && (
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
                          <div className="mt-3 flex justify-end">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedBroadcastId(broadcast.id);
                                setDetailsStatusFilter("all");
                                setShowBroadcastDetailsDialog(true);
                              }}
                              data-testid={`button-details-${broadcast.id}`}
                            >
                              <Eye className="w-3 h-3 mr-1" />
                              Ver Detalhes
                            </Button>
                          </div>
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
                      variant="ghost" 
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

          <TabsContent value="contact-lists" className="space-y-6">
            <ContactListsTab />
          </TabsContent>

          <TabsContent value="history" className="space-y-6">
            <BroadcastHistoryTab />
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
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {mediaFiles.map((file) => {
                      const MediaIcon = getMediaIcon(file.mediaType);
                      const isEditing = renamingFileId === file.id;
                      return (
                        <div key={file.id} className="group relative" data-testid={`card-media-${file.id}`}>
                          <div className="aspect-square bg-muted rounded-lg overflow-hidden relative">
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
                              <div className="w-full h-full flex items-center justify-center">
                                <MediaIcon className="w-10 h-10 text-muted-foreground" />
                              </div>
                            )}
                            <Badge className="absolute top-1 right-1 text-xs py-0" variant="secondary">
                              {file.mediaType}
                            </Badge>
                            
                            {/* Hover overlay with actions */}
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-white hover:bg-white/20"
                                onClick={() => {
                                  setRenamingFileId(file.id);
                                  setRenameFileName(file.fileName);
                                }}
                                title="Renomear"
                                data-testid={`button-rename-${file.id}`}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-white hover:bg-white/20"
                                onClick={() => {
                                  navigator.clipboard.writeText(file.publicUrl);
                                  toast({ title: "URL copiada!" });
                                }}
                                title="Copiar URL"
                                data-testid={`button-copy-url-${file.id}`}
                              >
                                <Copy className="w-4 h-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-white hover:bg-red-500/50"
                                onClick={() => {
                                  if (confirm("Excluir este arquivo?")) {
                                    deleteMediaFileMutation.mutate(file.id);
                                  }
                                }}
                                title="Excluir"
                                data-testid={`button-delete-file-${file.id}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                          
                          {/* File info */}
                          <div className="mt-1 px-1">
                            {isEditing ? (
                              <div className="flex gap-1">
                                <Input
                                  value={renameFileName}
                                  onChange={(e) => setRenameFileName(e.target.value)}
                                  className="h-6 text-xs"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      renameMediaFileMutation.mutate({ id: file.id, fileName: renameFileName });
                                    } else if (e.key === 'Escape') {
                                      setRenamingFileId(null);
                                    }
                                  }}
                                  data-testid={`input-rename-${file.id}`}
                                />
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6"
                                  onClick={() => renameMediaFileMutation.mutate({ id: file.id, fileName: renameFileName })}
                                  disabled={renameMediaFileMutation.isPending}
                                >
                                  <Check className="w-3 h-3" />
                                </Button>
                              </div>
                            ) : (
                              <p className="text-xs truncate" title={file.fileName}>
                                {file.fileName}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground">
                              {formatFileSize(file.sizeBytes)}
                            </p>
                          </div>
                        </div>
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
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Novo Envio em Massa</DialogTitle>
              <DialogDescription>
                Selecione a fonte dos contatos e configure a mensagem
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Fonte dos Contatos</Label>
                <Select 
                  value={broadcastSourceType} 
                  onValueChange={(v) => {
                    setBroadcastSourceType(v as "webinar" | "contact_list");
                    setPreviewLeads(null);
                  }}
                >
                  <SelectTrigger data-testid="select-broadcast-source">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="webinar">Leads de Webinar</SelectItem>
                    <SelectItem value="contact_list">Lista Importada</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {broadcastSourceType === "webinar" && (
                <div className="space-y-4 p-3 border rounded-lg bg-muted/30">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Webinar</Label>
                      <Select value={broadcastWebinarId} onValueChange={(v) => { setBroadcastWebinarId(v); setPreviewLeads(null); }}>
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
                      <Label>Filtro</Label>
                      <Select value={broadcastFilterType} onValueChange={(v) => { setBroadcastFilterType(v as any); setPreviewLeads(null); }}>
                        <SelectTrigger data-testid="select-filter-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos os leads</SelectItem>
                          <SelectItem value="date_range">Intervalo de datas</SelectItem>
                          <SelectItem value="session">Data de sessão</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {broadcastFilterType === "date_range" && (
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Data Inicial</Label>
                        <Input
                          type="date"
                          value={broadcastDateStart}
                          onChange={(e) => { setBroadcastDateStart(e.target.value); setPreviewLeads(null); }}
                          data-testid="input-date-start"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Data Final</Label>
                        <Input
                          type="date"
                          value={broadcastDateEnd}
                          onChange={(e) => { setBroadcastDateEnd(e.target.value); setPreviewLeads(null); }}
                          data-testid="input-date-end"
                        />
                      </div>
                    </div>
                  )}

                  {broadcastFilterType === "session" && (
                    <div className="space-y-2">
                      <Label>Data da Sessão</Label>
                      <Input
                        type="date"
                        value={broadcastSessionDate}
                        onChange={(e) => { setBroadcastSessionDate(e.target.value); setPreviewLeads(null); }}
                        data-testid="input-session-date"
                      />
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <Button 
                      type="button"
                      variant="outline" 
                      size="sm"
                      onClick={handlePreviewLeads}
                      disabled={loadingPreview || !broadcastWebinarId}
                      data-testid="button-preview-leads"
                    >
                      {loadingPreview ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Eye className="w-4 h-4 mr-2" />
                      )}
                      Buscar Leads
                    </Button>
                    {previewLeads && (
                      <Badge variant="secondary">
                        <Users className="w-3 h-3 mr-1" />
                        {previewLeads.count} leads
                      </Badge>
                    )}
                  </div>
                </div>
              )}

              {broadcastSourceType === "contact_list" && (
                <div className="space-y-2">
                  <Label>Lista de Contatos</Label>
                  <Select 
                    value={broadcastContactListId} 
                    onValueChange={setBroadcastContactListId}
                  >
                    <SelectTrigger data-testid="select-broadcast-contact-list">
                      <SelectValue placeholder="Selecione uma lista" />
                    </SelectTrigger>
                    <SelectContent>
                      {broadcastContactLists?.map(list => (
                        <SelectItem key={list.id} value={list.id}>
                          {list.name} ({list.totalContacts} contatos)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {(!broadcastContactLists || broadcastContactLists.length === 0) && (
                    <p className="text-xs text-muted-foreground">
                      Nenhuma lista importada. Vá para a aba "Listas" para importar.
                    </p>
                  )}
                </div>
              )}

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
                <Label>Tipo de Mensagem</Label>
                <div className="grid grid-cols-5 gap-2">
                  {MESSAGE_TYPES.map((type) => {
                    const Icon = type.icon;
                    return (
                      <Button
                        key={type.value}
                        type="button"
                        variant={newBroadcast.messageType === type.value ? "default" : "outline"}
                        className="flex flex-col h-auto py-3 gap-1"
                        onClick={() => setNewBroadcast({ 
                          ...newBroadcast, 
                          messageType: type.value,
                          mediaUrl: "",
                          mediaFileName: "",
                          mediaMimeType: ""
                        })}
                        data-testid={`button-broadcast-type-${type.value}`}
                      >
                        <Icon className="w-4 h-4" />
                        <span className="text-xs">{type.label}</span>
                      </Button>
                    );
                  })}
                </div>
              </div>

              {newBroadcast.messageType !== "text" && (
                <div className="space-y-2">
                  <Label>Arquivo de Mídia</Label>
                  {newBroadcast.mediaUrl ? (
                    <div className="relative inline-block">
                      {newBroadcast.messageType === "image" && (
                        <img 
                          src={newBroadcast.mediaUrl} 
                          alt="Preview" 
                          className="w-16 h-16 rounded-lg object-cover"
                        />
                      )}
                      {newBroadcast.messageType === "video" && (
                        <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center">
                          <Video className="w-8 h-8 text-muted-foreground" />
                        </div>
                      )}
                      {newBroadcast.messageType === "audio" && (
                        <div className="flex items-center gap-2">
                          <div className="w-10 h-10 rounded bg-muted flex items-center justify-center flex-shrink-0">
                            <Mic className="w-5 h-5 text-muted-foreground" />
                          </div>
                          <audio controls className="h-8 max-w-[180px]" src={newBroadcast.mediaUrl} />
                        </div>
                      )}
                      {newBroadcast.messageType === "document" && (
                        <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center">
                          <FileText className="w-8 h-8 text-muted-foreground" />
                        </div>
                      )}
                      <button
                        type="button"
                        className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                        onClick={() => setNewBroadcast({
                          ...newBroadcast,
                          mediaUrl: "",
                          mediaFileName: "",
                          mediaMimeType: ""
                        })}
                        data-testid="button-remove-broadcast-media"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <Tabs value={broadcastMediaSource} onValueChange={(v) => setBroadcastMediaSource(v as "upload" | "library")}>
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="upload" className="gap-2" data-testid="tab-media-upload">
                          <Upload className="w-4 h-4" />
                          Enviar Arquivo
                        </TabsTrigger>
                        <TabsTrigger value="library" className="gap-2" data-testid="tab-media-library">
                          <FolderOpen className="w-4 h-4" />
                          Meus Arquivos
                        </TabsTrigger>
                      </TabsList>
                      <TabsContent value="upload" className="mt-3">
                        <div className="border-2 border-dashed rounded-lg p-4">
                          <label className="cursor-pointer block">
                            <div className="flex flex-col items-center gap-2 text-muted-foreground">
                              <Upload className="w-8 h-8" />
                              <span className="text-sm">Clique para enviar</span>
                              <span className="text-xs">
                                {MEDIA_LIMITS[newBroadcast.messageType as keyof typeof MEDIA_LIMITS]?.extensions || ""}
                                {" - Máx: "}
                                {MEDIA_LIMITS[newBroadcast.messageType as keyof typeof MEDIA_LIMITS]?.label || ""}
                              </span>
                            </div>
                            <input
                              type="file"
                              className="hidden"
                              accept={MEDIA_LIMITS[newBroadcast.messageType as keyof typeof MEDIA_LIMITS]?.formats.join(",")}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleBroadcastMediaUpload(file);
                              }}
                              disabled={uploadingMedia}
                              data-testid="input-broadcast-media-upload"
                            />
                            {uploadingMedia && (
                              <div className="flex items-center gap-2 mt-2 justify-center">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span className="text-sm">Enviando...</span>
                              </div>
                            )}
                          </label>
                        </div>
                      </TabsContent>
                      <TabsContent value="library" className="mt-3">
                        <div className="border rounded-lg max-h-48 overflow-y-auto">
                          {loadingMediaFiles ? (
                            <div className="flex items-center justify-center py-8">
                              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                            </div>
                          ) : (() => {
                            const filteredFiles = mediaFiles?.filter(f => f.mediaType === newBroadcast.messageType) || [];
                            if (filteredFiles.length === 0) {
                              return (
                                <div className="text-center py-6 text-muted-foreground">
                                  <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                  <p className="text-sm">Nenhum arquivo de {newBroadcast.messageType === "audio" ? "áudio" : newBroadcast.messageType === "image" ? "imagem" : newBroadcast.messageType === "video" ? "vídeo" : "documento"} encontrado</p>
                                  <p className="text-xs mt-1">Envie um arquivo ou acesse "Meus Arquivos"</p>
                                </div>
                              );
                            }
                            return (
                              <div className="grid grid-cols-4 gap-2 p-2">
                                {filteredFiles.map((file) => (
                                  <button
                                    key={file.id}
                                    type="button"
                                    className="aspect-square rounded-lg overflow-hidden hover-elevate border-2 border-transparent hover:border-primary"
                                    onClick={() => {
                                      setNewBroadcast(prev => ({
                                        ...prev,
                                        mediaUrl: file.publicUrl,
                                        mediaFileName: file.fileName,
                                        mediaMimeType: file.mimeType
                                      }));
                                    }}
                                    title={file.fileName}
                                    data-testid={`button-select-file-${file.id}`}
                                  >
                                    {file.mediaType === "image" && (
                                      <img src={file.publicUrl} alt={file.fileName} className="w-full h-full object-cover" />
                                    )}
                                    {file.mediaType === "audio" && (
                                      <div className="w-full h-full bg-muted flex items-center justify-center">
                                        <FileAudio className="w-6 h-6 text-muted-foreground" />
                                      </div>
                                    )}
                                    {file.mediaType === "video" && (
                                      <div className="w-full h-full bg-muted flex items-center justify-center">
                                        <FileVideo className="w-6 h-6 text-muted-foreground" />
                                      </div>
                                    )}
                                    {file.mediaType === "document" && (
                                      <div className="w-full h-full bg-muted flex items-center justify-center">
                                        <FileText className="w-6 h-6 text-muted-foreground" />
                                      </div>
                                    )}
                                  </button>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                      </TabsContent>
                    </Tabs>
                  )}
                </div>
              )}

              {newBroadcast.messageType === "audio" && (
                <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                  <Switch
                    checked={newBroadcast.sendAsVoiceNote}
                    onCheckedChange={(checked) => setNewBroadcast({ ...newBroadcast, sendAsVoiceNote: checked })}
                    data-testid="switch-voice-note"
                  />
                  <div>
                    <Label className="text-sm">Enviar como gravação de voz</Label>
                    <p className="text-xs text-muted-foreground">
                      Aparece como "bolinha" ao invés de player de áudio
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>{newBroadcast.messageType === "text" ? "Mensagem" : "Legenda (opcional)"}</Label>
                <Textarea
                  placeholder={newBroadcast.messageType === "text" 
                    ? "Digite a mensagem... Use {{nome}} para personalizar"
                    : "Digite uma legenda para a mídia (opcional)..."
                  }
                  value={newBroadcast.messageText}
                  onChange={(e) => setNewBroadcast({ ...newBroadcast, messageText: e.target.value })}
                  rows={newBroadcast.messageType === "text" ? 6 : 3}
                  data-testid="input-broadcast-message"
                />
                <p className="text-xs text-muted-foreground">
                  Merge tags: {"{{nome}}"} = nome | {"{{email}}"} = email | {"{{telefone}}"} = telefone
                </p>
              </div>

              {broadcastSourceType === "webinar" && previewLeads && (
                <div className="bg-muted/50 p-3 rounded-lg">
                  <p className="text-sm"><strong>{previewLeads.count}</strong> leads serão enviados</p>
                </div>
              )}
              {broadcastSourceType === "contact_list" && broadcastContactListId && (
                <div className="bg-muted/50 p-3 rounded-lg">
                  <p className="text-sm">
                    <strong>{broadcastContactLists?.find(l => l.id === broadcastContactListId)?.totalContacts || 0}</strong> contatos serão enviados
                  </p>
                </div>
              )}

              <div className="space-y-3 pt-2 border-t">
                <Label>Ação</Label>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    type="button"
                    variant={broadcastAction === "draft" ? "default" : "outline"}
                    className="flex flex-col h-auto py-3 gap-1"
                    onClick={() => setBroadcastAction("draft")}
                    data-testid="button-action-draft"
                  >
                    <FileText className="w-4 h-4" />
                    <span className="text-xs">Salvar Rascunho</span>
                  </Button>
                  <Button
                    type="button"
                    variant={broadcastAction === "scheduled" ? "default" : "outline"}
                    className="flex flex-col h-auto py-3 gap-1"
                    onClick={() => setBroadcastAction("scheduled")}
                    data-testid="button-action-scheduled"
                  >
                    <Clock className="w-4 h-4" />
                    <span className="text-xs">Agendar</span>
                  </Button>
                  <Button
                    type="button"
                    variant={broadcastAction === "immediate" ? "default" : "outline"}
                    className="flex flex-col h-auto py-3 gap-1"
                    onClick={() => setBroadcastAction("immediate")}
                    data-testid="button-action-immediate"
                  >
                    <Send className="w-4 h-4" />
                    <span className="text-xs">Enviar Agora</span>
                  </Button>
                </div>

                {broadcastAction === "scheduled" && (
                  <div className="grid grid-cols-2 gap-3 p-3 border rounded-lg bg-muted/30">
                    <div className="space-y-2">
                      <Label>Data</Label>
                      <Input
                        type="date"
                        value={broadcastScheduledDate}
                        onChange={(e) => setBroadcastScheduledDate(e.target.value)}
                        min={new Date().toISOString().split("T")[0]}
                        data-testid="input-scheduled-date"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Hora</Label>
                      <Input
                        type="time"
                        value={broadcastScheduledTime}
                        onChange={(e) => setBroadcastScheduledTime(e.target.value)}
                        data-testid="input-scheduled-time"
                      />
                    </div>
                    <p className="col-span-2 text-xs text-muted-foreground">
                      O envio será iniciado automaticamente na data e hora selecionadas (horário de Brasília)
                    </p>
                  </div>
                )}
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setShowNewBroadcastDialog(false)}>Cancelar</Button>
              <Button 
                onClick={() => {
                  handleCreateBroadcast();
                }}
                disabled={
                  createBroadcastMutation.isPending || 
                  !newBroadcast.name || 
                  (newBroadcast.messageType === "text" && !newBroadcast.messageText) ||
                  (newBroadcast.messageType !== "text" && !newBroadcast.mediaUrl) ||
                  (broadcastSourceType === "webinar" && (!broadcastWebinarId || !previewLeads || previewLeads.count === 0)) ||
                  (broadcastSourceType === "contact_list" && !broadcastContactListId) ||
                  (broadcastAction === "scheduled" && (!broadcastScheduledDate || !broadcastScheduledTime))
                }
                data-testid="button-create-broadcast"
              >
                {createBroadcastMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {broadcastAction === "draft" ? "Salvar Rascunho" : broadcastAction === "scheduled" ? "Agendar Envio" : "Enviar Agora"}
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

        <Dialog open={showCloudApiDialog} onOpenChange={(open) => {
          setShowCloudApiDialog(open);
          if (!open) {
            setCloudApiValidation(null);
          }
        }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <SiWhatsapp className="w-5 h-5 text-green-500" />
                Configurar Cloud API (Meta)
              </DialogTitle>
              <DialogDescription>
                Configure as credenciais da API oficial do WhatsApp da Meta. 
                Isso permite enviar mensagens sem precisar de QR Code.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                <p className="text-sm text-blue-500">
                  Para obter as credenciais, acesse o 
                  <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer" className="underline ml-1">
                    Facebook Developers
                  </a> e configure seu aplicativo WhatsApp Business.
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="cloud-api-token">Access Token *</Label>
                <Input
                  id="cloud-api-token"
                  type="password"
                  placeholder="Token de acesso da API"
                  value={cloudApiConfig.accessToken}
                  onChange={(e) => setCloudApiConfig({ ...cloudApiConfig, accessToken: e.target.value })}
                  data-testid="input-cloud-api-token"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="cloud-api-phone-id">Phone Number ID *</Label>
                <Input
                  id="cloud-api-phone-id"
                  placeholder="ID do número de telefone"
                  value={cloudApiConfig.phoneNumberId}
                  onChange={(e) => setCloudApiConfig({ ...cloudApiConfig, phoneNumberId: e.target.value })}
                  data-testid="input-cloud-api-phone-id"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="cloud-api-business-id">Business Account ID (Opcional)</Label>
                <Input
                  id="cloud-api-business-id"
                  placeholder="ID da conta comercial"
                  value={cloudApiConfig.businessAccountId}
                  onChange={(e) => setCloudApiConfig({ ...cloudApiConfig, businessAccountId: e.target.value })}
                  data-testid="input-cloud-api-business-id"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="cloud-api-version">Versão da API</Label>
                <Select 
                  value={cloudApiConfig.apiVersion} 
                  onValueChange={(value) => setCloudApiConfig({ ...cloudApiConfig, apiVersion: value })}
                >
                  <SelectTrigger data-testid="select-cloud-api-version">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="v20.0">v20.0 (Recomendado)</SelectItem>
                    <SelectItem value="v19.0">v19.0</SelectItem>
                    <SelectItem value="v18.0">v18.0</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {cloudApiValidation && (
                <div className={`p-3 rounded-lg ${cloudApiValidation.valid ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                  {cloudApiValidation.valid ? (
                    <div className="flex items-center gap-2 text-green-500">
                      <CheckCircle className="w-4 h-4" />
                      <div>
                        <p className="font-medium">Credenciais válidas!</p>
                        <p className="text-sm">Número: {cloudApiValidation.phoneNumber}</p>
                        {cloudApiValidation.displayName && (
                          <p className="text-sm">Nome: {cloudApiValidation.displayName}</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-red-500">
                      <XCircle className="w-4 h-4" />
                      <div>
                        <p className="font-medium">Credenciais inválidas</p>
                        <p className="text-sm">{cloudApiValidation.error}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <DialogFooter className="gap-2">
              <Button 
                variant="outline" 
                onClick={handleValidateCloudApi}
                disabled={validatingCloudApi || !cloudApiConfig.accessToken || !cloudApiConfig.phoneNumberId}
                data-testid="button-validate-cloud-api"
              >
                {validatingCloudApi && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Validar Credenciais
              </Button>
              <Button 
                onClick={() => {
                  if (selectedAccountId) {
                    configureCloudApiMutation.mutate({ id: selectedAccountId, config: cloudApiConfig });
                  }
                }}
                disabled={configureCloudApiMutation.isPending || !cloudApiValidation?.valid}
                data-testid="button-save-cloud-api"
              >
                {configureCloudApiMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Salvar e Ativar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Broadcast Details Modal */}
        <Dialog open={showBroadcastDetailsDialog} onOpenChange={setShowBroadcastDetailsDialog}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Eye className="w-5 h-5" />
                Detalhes do Envio
              </DialogTitle>
              <DialogDescription>
                Visualize o status de envio para cada destinatário
              </DialogDescription>
            </DialogHeader>
            
            <div className="flex items-center gap-4 py-2">
              <Label>Filtrar por status:</Label>
              <Select value={detailsStatusFilter} onValueChange={setDetailsStatusFilter}>
                <SelectTrigger className="w-[180px]" data-testid="select-details-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="sent">Enviado</SelectItem>
                  <SelectItem value="failed">Falha</SelectItem>
                </SelectContent>
              </Select>
              
              {broadcastRecipients && (
                <div className="flex gap-4 text-sm ml-auto">
                  <span className="text-green-500 font-medium">
                    {broadcastRecipients.filter(r => r.status === 'sent').length} enviados
                  </span>
                  <span className="text-red-500 font-medium">
                    {broadcastRecipients.filter(r => r.status === 'failed').length} falhas
                  </span>
                  <span className="text-muted-foreground">
                    {broadcastRecipients.filter(r => r.status === 'pending').length} pendentes
                  </span>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-auto border rounded-lg">
              {loadingRecipients ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              ) : broadcastRecipients && broadcastRecipients.length > 0 ? (
                <table className="w-full text-sm">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="text-left p-3 font-medium">Telefone</th>
                      <th className="text-left p-3 font-medium">Nome</th>
                      <th className="text-left p-3 font-medium">Status</th>
                      <th className="text-left p-3 font-medium">Conta</th>
                      <th className="text-left p-3 font-medium">Data/Hora</th>
                      <th className="text-left p-3 font-medium">Erro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {broadcastRecipients
                      .filter(r => detailsStatusFilter === "all" || r.status === detailsStatusFilter)
                      .map((recipient) => {
                        const account = accounts?.find(a => a.id === recipient.accountId);
                        return (
                          <tr key={recipient.id} className="border-t hover-elevate" data-testid={`row-recipient-${recipient.id}`}>
                            <td className="p-3 font-mono text-xs">{recipient.phone}</td>
                            <td className="p-3">{recipient.name || "-"}</td>
                            <td className="p-3">
                              {recipient.status === "sent" && (
                                <Badge variant="default" className="bg-green-500/10 text-green-500 border-green-500/20">
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  Enviado
                                </Badge>
                              )}
                              {recipient.status === "failed" && (
                                <Badge variant="destructive">
                                  <XCircle className="w-3 h-3 mr-1" />
                                  Falha
                                </Badge>
                              )}
                              {recipient.status === "pending" && (
                                <Badge variant="outline">
                                  <Clock className="w-3 h-3 mr-1" />
                                  Pendente
                                </Badge>
                              )}
                            </td>
                            <td className="p-3 text-xs">
                              {account ? account.label : (recipient.accountId ? recipient.accountId.substring(0, 8) : "-")}
                            </td>
                            <td className="p-3 text-xs text-muted-foreground">
                              {recipient.sentAt 
                                ? new Date(recipient.sentAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
                                : recipient.lastAttemptAt 
                                  ? new Date(recipient.lastAttemptAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
                                  : "-"}
                            </td>
                            <td className="p-3 text-xs text-red-500 max-w-[200px] truncate" title={recipient.errorMessage || undefined}>
                              {recipient.errorMessage || "-"}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhum destinatário encontrado</p>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowBroadcastDetailsDialog(false)}>
                Fechar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
