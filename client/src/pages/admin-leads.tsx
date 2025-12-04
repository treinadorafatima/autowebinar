import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Users, 
  Search, 
  Mail, 
  Phone, 
  Calendar, 
  Eye, 
  MousePointer, 
  Send,
  Filter,
  Download,
  Radio,
  CheckCircle2,
  Clock,
  AlertCircle,
  MessageSquare,
  Loader2
} from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface LeadStats {
  emailsSent: number;
  emailsOpened: number;
  emailsClicked: number;
  whatsappSent: number;
  whatsappDelivered: number;
}

interface Lead {
  id: string;
  webinarId: string;
  webinarName: string;
  name: string;
  email: string | null;
  whatsapp: string | null;
  city: string | null;
  state: string | null;
  status: string;
  source: string;
  capturedAt: string;
  joinedAt: string | null;
  stats: LeadStats;
}

interface LeadMessage {
  id: string;
  channel: string;
  messageType: string;
  subject: string | null;
  content: string | null;
  status: string;
  sentAt: string;
  deliveredAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
}

interface LeadDetails extends Lead {
  messages: LeadMessage[];
}

interface WebinarFilter {
  id: string;
  name: string;
}

export default function AdminLeads() {
  const [searchTerm, setSearchTerm] = useState("");
  const [webinarFilter, setWebinarFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedLead, setSelectedLead] = useState<string | null>(null);

  const { data: leads, isLoading: leadsLoading } = useQuery<Lead[]>({
    queryKey: ["/api/admin/leads"],
  });

  const { data: webinars } = useQuery<WebinarFilter[]>({
    queryKey: ["/api/admin/leads/filters/webinars"],
  });

  const { data: leadDetails, isLoading: detailsLoading } = useQuery<LeadDetails>({
    queryKey: ["/api/admin/leads", selectedLead],
    enabled: !!selectedLead,
  });

  const filteredLeads = leads?.filter((lead) => {
    const matchesSearch = 
      lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (lead.email?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false) ||
      (lead.whatsapp?.includes(searchTerm) ?? false);
    
    const matchesWebinar = webinarFilter === "all" || lead.webinarId === webinarFilter;
    const matchesStatus = statusFilter === "all" || lead.status === statusFilter;
    
    return matchesSearch && matchesWebinar && matchesStatus;
  }) || [];

  const totalLeads = filteredLeads.length;
  const totalEmails = filteredLeads.reduce((acc, l) => acc + l.stats.emailsSent, 0);
  const totalEmailsOpened = filteredLeads.reduce((acc, l) => acc + l.stats.emailsOpened, 0);
  const totalWhatsapp = filteredLeads.reduce((acc, l) => acc + l.stats.whatsappSent, 0);
  const emailOpenRate = totalEmails > 0 ? Math.round((totalEmailsOpened / totalEmails) * 100) : 0;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "registered":
        return <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20">Inscrito</Badge>;
      case "watched":
        return <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">Assistiu</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getSourceBadge = (source: string) => {
    switch (source) {
      case "registration":
        return <Badge variant="secondary">Inscrição</Badge>;
      case "room":
        return <Badge variant="secondary">Sala</Badge>;
      default:
        return <Badge variant="secondary">{source}</Badge>;
    }
  };

  const getMessageStatusIcon = (status: string) => {
    switch (status) {
      case "sent":
        return <Send className="w-4 h-4 text-blue-500" />;
      case "delivered":
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case "opened":
        return <Eye className="w-4 h-4 text-amber-500" />;
      case "clicked":
        return <MousePointer className="w-4 h-4 text-purple-500" />;
      case "failed":
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const exportLeads = () => {
    const csvContent = [
      ["Nome", "Email", "WhatsApp", "Webinário", "Status", "Origem", "Capturado em", "Emails Enviados", "Emails Abertos", "WhatsApp Enviados"].join(","),
      ...filteredLeads.map(lead => [
        `"${lead.name}"`,
        lead.email || "",
        lead.whatsapp || "",
        `"${lead.webinarName}"`,
        lead.status,
        lead.source,
        format(new Date(lead.capturedAt), "dd/MM/yyyy HH:mm", { locale: ptBR }),
        lead.stats.emailsSent,
        lead.stats.emailsOpened,
        lead.stats.whatsappSent,
      ].join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `leads_${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
  };

  return (
    <div className="container mx-auto py-6 px-4 max-w-7xl">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Users className="w-6 h-6" />
              Leads
            </h1>
            <p className="text-muted-foreground">
              Gerencie todos os leads captados nos seus webinários
            </p>
          </div>
          <Button onClick={exportLeads} variant="outline" className="gap-2" data-testid="button-export-leads">
            <Download className="w-4 h-4" />
            Exportar CSV
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card data-testid="card-stat-total-leads">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total de Leads</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalLeads}</div>
            </CardContent>
          </Card>
          <Card data-testid="card-stat-emails-sent">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
              <CardTitle className="text-sm font-medium">Emails Enviados</CardTitle>
              <Mail className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-emails-sent">{totalEmails}</div>
              <p className="text-xs text-muted-foreground" data-testid="text-emails-opened">
                {totalEmailsOpened} abertos ({emailOpenRate}%)
              </p>
            </CardContent>
          </Card>
          <Card data-testid="card-stat-whatsapp-sent">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
              <CardTitle className="text-sm font-medium">WhatsApp Enviados</CardTitle>
              <SiWhatsapp className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-whatsapp-sent">{totalWhatsapp}</div>
            </CardContent>
          </Card>
          <Card data-testid="card-stat-open-rate">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
              <CardTitle className="text-sm font-medium">Taxa de Abertura</CardTitle>
              <Eye className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-open-rate">{emailOpenRate}%</div>
              <p className="text-xs text-muted-foreground">dos emails</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome, email ou WhatsApp..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-lead-search"
                />
              </div>
              <div className="flex gap-2">
                <Select value={webinarFilter} onValueChange={setWebinarFilter}>
                  <SelectTrigger className="w-[200px]" data-testid="select-webinar-filter">
                    <Radio className="w-4 h-4 mr-2" />
                    <SelectValue placeholder="Webinário" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Webinários</SelectItem>
                    {webinars?.map((w) => (
                      <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[150px]" data-testid="select-status-filter">
                    <Filter className="w-4 h-4 mr-2" />
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="registered">Inscritos</SelectItem>
                    <SelectItem value="watched">Assistiram</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {leadsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredLeads.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum lead encontrado</p>
                {searchTerm && <p className="text-sm mt-2">Tente ajustar os filtros de busca</p>}
              </div>
            ) : (
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Lead</TableHead>
                      <TableHead>Webinário</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Origem</TableHead>
                      <TableHead className="text-center">Emails</TableHead>
                      <TableHead className="text-center">WhatsApp</TableHead>
                      <TableHead>Capturado</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLeads.map((lead) => (
                      <TableRow key={lead.id} data-testid={`row-lead-${lead.id}`}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{lead.name}</span>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              {lead.email && (
                                <span className="flex items-center gap-1">
                                  <Mail className="w-3 h-3" />
                                  {lead.email}
                                </span>
                              )}
                            </div>
                            {lead.whatsapp && (
                              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                                <Phone className="w-3 h-3" />
                                {lead.whatsapp}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{lead.webinarName}</span>
                        </TableCell>
                        <TableCell>{getStatusBadge(lead.status)}</TableCell>
                        <TableCell>{getSourceBadge(lead.source)}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-sm font-medium">{lead.stats.emailsSent}</span>
                            {lead.stats.emailsOpened > 0 && (
                              <span className="text-xs text-green-500 flex items-center gap-1">
                                <Eye className="w-3 h-3" />
                                {lead.stats.emailsOpened}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-sm font-medium">{lead.stats.whatsappSent}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Calendar className="w-3 h-3" />
                            {format(new Date(lead.capturedAt), "dd/MM/yyyy", { locale: ptBR })}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedLead(lead.id)}
                            data-testid={`button-view-lead-${lead.id}`}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!selectedLead} onOpenChange={() => setSelectedLead(null)} data-testid="dialog-lead-details">
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="dialog-content-lead-details">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Detalhes do Lead
            </DialogTitle>
            <DialogDescription>
              Histórico de mensagens e interações
            </DialogDescription>
          </DialogHeader>

          {detailsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : leadDetails ? (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Informações</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">{leadDetails.name}</span>
                    </div>
                    {leadDetails.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-muted-foreground" />
                        <span>{leadDetails.email}</span>
                      </div>
                    )}
                    {leadDetails.whatsapp && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-muted-foreground" />
                        <span>{leadDetails.whatsapp}</span>
                      </div>
                    )}
                    {(leadDetails.city || leadDetails.state) && (
                      <div className="text-sm text-muted-foreground">
                        {[leadDetails.city, leadDetails.state].filter(Boolean).join(", ")}
                      </div>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Webinário</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Radio className="w-4 h-4 text-muted-foreground" />
                      <span>{leadDetails.webinarName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(leadDetails.status)}
                      {getSourceBadge(leadDetails.source)}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="w-4 h-4" />
                      Capturado em {format(new Date(leadDetails.capturedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </div>
                    {leadDetails.joinedAt && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Eye className="w-4 h-4" />
                        Entrou na sala em {format(new Date(leadDetails.joinedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <Tabs defaultValue="all" data-testid="tabs-lead-messages">
                <TabsList>
                  <TabsTrigger value="all" className="gap-2" data-testid="tab-all-messages">
                    <MessageSquare className="w-4 h-4" />
                    Todas ({leadDetails.messages.length})
                  </TabsTrigger>
                  <TabsTrigger value="email" className="gap-2" data-testid="tab-email-messages">
                    <Mail className="w-4 h-4" />
                    Email ({leadDetails.messages.filter(m => m.channel === 'email').length})
                  </TabsTrigger>
                  <TabsTrigger value="whatsapp" className="gap-2" data-testid="tab-whatsapp-messages">
                    <SiWhatsapp className="w-4 h-4" />
                    WhatsApp ({leadDetails.messages.filter(m => m.channel === 'whatsapp').length})
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="all" className="mt-4">
                  <MessagesList messages={leadDetails.messages} getMessageStatusIcon={getMessageStatusIcon} />
                </TabsContent>
                <TabsContent value="email" className="mt-4">
                  <MessagesList 
                    messages={leadDetails.messages.filter(m => m.channel === 'email')} 
                    getMessageStatusIcon={getMessageStatusIcon}
                  />
                </TabsContent>
                <TabsContent value="whatsapp" className="mt-4">
                  <MessagesList 
                    messages={leadDetails.messages.filter(m => m.channel === 'whatsapp')} 
                    getMessageStatusIcon={getMessageStatusIcon}
                  />
                </TabsContent>
              </Tabs>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MessagesList({ 
  messages, 
  getMessageStatusIcon 
}: { 
  messages: LeadMessage[];
  getMessageStatusIcon: (status: string) => JSX.Element;
}) {
  if (messages.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>Nenhuma mensagem enviada ainda</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[300px]">
      <div className="space-y-3">
        {messages.map((message) => (
          <Card key={message.id} className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="mt-1">
                  {message.channel === 'email' ? (
                    <Mail className="w-4 h-4 text-blue-500" />
                  ) : (
                    <SiWhatsapp className="w-4 h-4 text-green-500" />
                  )}
                </div>
                <div className="flex-1">
                  {message.subject && (
                    <p className="font-medium text-sm">{message.subject}</p>
                  )}
                  {message.content && (
                    <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                      {message.content}
                    </p>
                  )}
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {format(new Date(message.sentAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {message.messageType}
                    </Badge>
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                {getMessageStatusIcon(message.status)}
                <span className="text-xs text-muted-foreground capitalize">{message.status}</span>
              </div>
            </div>
            {(message.openedAt || message.clickedAt) && (
              <div className="mt-3 pt-3 border-t border-border flex gap-4 text-xs">
                {message.openedAt && (
                  <span className="flex items-center gap-1 text-amber-500">
                    <Eye className="w-3 h-3" />
                    Aberto em {format(new Date(message.openedAt), "dd/MM HH:mm", { locale: ptBR })}
                  </span>
                )}
                {message.clickedAt && (
                  <span className="flex items-center gap-1 text-purple-500">
                    <MousePointer className="w-3 h-3" />
                    Clicou em {format(new Date(message.clickedAt), "dd/MM HH:mm", { locale: ptBR })}
                  </span>
                )}
              </div>
            )}
          </Card>
        ))}
      </div>
    </ScrollArea>
  );
}
