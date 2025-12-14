import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Loader2, FileText, Edit3, Save, AlertCircle, Mail
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { EmailNotificationTemplate } from "@shared/schema";

const templatePlaceholders: Record<string, string[]> = {
  credentials: ["{name}", "{email}", "{planName}", "{tempPassword}", "{loginUrl}", "{appName}"],
  payment_confirmed: ["{name}", "{planName}", "{expirationDate}", "{loginUrl}", "{appName}"],
  password_reset: ["{name}", "{resetUrl}", "{appName}"],
  plan_expired: ["{name}", "{planName}", "{renewUrl}", "{appName}"],
  payment_failed: ["{name}", "{planName}", "{reason}", "{paymentUrl}", "{appName}"],
  welcome: ["{name}", "{adminUrl}", "{appName}"],
};

export default function AdminEmailNotificationsPage() {
  const { toast } = useToast();
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editingSubject, setEditingSubject] = useState<string>("");
  const [editingHtmlTemplate, setEditingHtmlTemplate] = useState<string>("");
  const [editingTextTemplate, setEditingTextTemplate] = useState<string>("");
  const [editingIsActive, setEditingIsActive] = useState<boolean>(true);

  const { data: templates = [], isLoading: loadingTemplates, isError: templatesError } = useQuery<EmailNotificationTemplate[]>({
    queryKey: ["/api/notifications/email/templates"],
    refetchOnWindowFocus: false,
    staleTime: 30000,
  });

  const updateTemplateMutation = useMutation({
    mutationFn: async ({ templateId, subject, htmlTemplate, textTemplate, isActive }: { 
      templateId: string; 
      subject: string; 
      htmlTemplate: string; 
      textTemplate: string;
      isActive: boolean;
    }) => {
      return apiRequest("PATCH", `/api/notifications/email/templates/${templateId}`, {
        subject,
        htmlTemplate,
        textTemplate,
        isActive,
      });
    },
    onSuccess: () => {
      setEditingTemplateId(null);
      setEditingSubject("");
      setEditingHtmlTemplate("");
      setEditingTextTemplate("");
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/email/templates"] });
      toast({
        title: "Template salvo",
        description: "O template de email foi atualizado com sucesso",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao salvar",
        description: error.message || "Não foi possível salvar o template",
        variant: "destructive",
      });
    },
  });

  const startEditingTemplate = (template: EmailNotificationTemplate) => {
    setEditingTemplateId(template.id);
    setEditingSubject(template.subject);
    setEditingHtmlTemplate(template.htmlTemplate);
    setEditingTextTemplate(template.textTemplate || "");
    setEditingIsActive(template.isActive);
  };

  const cancelEditingTemplate = () => {
    setEditingTemplateId(null);
    setEditingSubject("");
    setEditingHtmlTemplate("");
    setEditingTextTemplate("");
  };

  const getNotificationTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      credentials: "Credenciais de Acesso",
      payment_confirmed: "Confirmação de Pagamento",
      password_reset: "Redefinição de Senha",
      plan_expired: "Expiração de Plano",
      payment_failed: "Falha no Pagamento",
      welcome: "Boas-vindas",
    };
    return labels[type] || type;
  };

  if (loadingTemplates) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Notificações por E-mail</h1>
        <p className="text-muted-foreground">
          Configure os templates de e-mails automáticos enviados para clientes do SaaS
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            Templates de E-mail
          </CardTitle>
          <CardDescription>
            Personalize o assunto e o conteúdo dos e-mails automáticos enviados aos clientes. 
            Use os placeholders disponíveis para incluir informações dinâmicas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {templatesError ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <AlertCircle className="w-10 h-10 mb-2 text-destructive" />
              <p>Erro ao carregar templates</p>
            </div>
          ) : templates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <FileText className="w-10 h-10 mb-2" />
              <p>Nenhum template encontrado</p>
            </div>
          ) : (
            <div className="space-y-4">
              {templates.map((template) => (
                <div 
                  key={template.id}
                  className="p-4 border rounded-lg space-y-3"
                  data-testid={`card-template-${template.id}`}
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <div>
                        <p className="font-medium" data-testid={`text-template-name-${template.id}`}>{template.name}</p>
                        {template.description && (
                          <p className="text-sm text-muted-foreground">{template.description}</p>
                        )}
                      </div>
                      <Badge variant={template.isActive ? "default" : "secondary"}>
                        {template.isActive ? "Ativo" : "Inativo"}
                      </Badge>
                    </div>
                    {editingTemplateId !== template.id && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => startEditingTemplate(template)}
                        data-testid={`button-edit-template-${template.id}`}
                      >
                        <Edit3 className="w-4 h-4 mr-2" />
                        Editar
                      </Button>
                    )}
                  </div>

                  {editingTemplateId === template.id ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <Switch
                          id={`active-${template.id}`}
                          checked={editingIsActive}
                          onCheckedChange={setEditingIsActive}
                          data-testid={`switch-active-${template.id}`}
                        />
                        <Label htmlFor={`active-${template.id}`}>Template ativo</Label>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={`subject-${template.id}`}>Assunto do E-mail</Label>
                        <Input
                          id={`subject-${template.id}`}
                          value={editingSubject}
                          onChange={(e) => setEditingSubject(e.target.value)}
                          placeholder="Assunto do email..."
                          data-testid={`input-subject-${template.id}`}
                        />
                      </div>

                      <Tabs defaultValue="html" className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                          <TabsTrigger value="html" data-testid={`tab-html-${template.id}`}>HTML</TabsTrigger>
                          <TabsTrigger value="text" data-testid={`tab-text-${template.id}`}>Texto Puro</TabsTrigger>
                        </TabsList>
                        <TabsContent value="html" className="space-y-2">
                          <Label htmlFor={`html-${template.id}`}>Conteúdo HTML</Label>
                          <Textarea
                            id={`html-${template.id}`}
                            value={editingHtmlTemplate}
                            onChange={(e) => setEditingHtmlTemplate(e.target.value)}
                            rows={12}
                            className="font-mono text-sm"
                            placeholder="<html>...</html>"
                            data-testid={`textarea-html-${template.id}`}
                          />
                        </TabsContent>
                        <TabsContent value="text" className="space-y-2">
                          <Label htmlFor={`text-${template.id}`}>Conteúdo Texto Puro (fallback)</Label>
                          <Textarea
                            id={`text-${template.id}`}
                            value={editingTextTemplate}
                            onChange={(e) => setEditingTextTemplate(e.target.value)}
                            rows={8}
                            className="font-mono text-sm"
                            placeholder="Versão em texto puro do email..."
                            data-testid={`textarea-text-${template.id}`}
                          />
                        </TabsContent>
                      </Tabs>

                      <div className="flex flex-wrap gap-1">
                        <span className="text-xs text-muted-foreground mr-1">Placeholders:</span>
                        {(templatePlaceholders[template.notificationType] || []).map((placeholder) => (
                          <Badge 
                            key={placeholder} 
                            variant="outline" 
                            className="text-xs cursor-pointer"
                            onClick={() => {
                              setEditingHtmlTemplate(prev => prev + " " + placeholder);
                            }}
                            data-testid={`badge-placeholder-${template.id}-${placeholder.replace(/[{}]/g, '')}`}
                          >
                            {placeholder}
                          </Badge>
                        ))}
                      </div>

                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => updateTemplateMutation.mutate({ 
                            templateId: template.id, 
                            subject: editingSubject,
                            htmlTemplate: editingHtmlTemplate,
                            textTemplate: editingTextTemplate,
                            isActive: editingIsActive,
                          })}
                          disabled={updateTemplateMutation.isPending}
                          data-testid={`button-save-template-${template.id}`}
                        >
                          {updateTemplateMutation.isPending ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Save className="w-4 h-4 mr-2" />
                          )}
                          Salvar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={cancelEditingTemplate}
                          data-testid={`button-cancel-template-${template.id}`}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="p-2 bg-muted/30 rounded-md">
                        <p className="text-xs text-muted-foreground mb-1">Assunto:</p>
                        <p className="text-sm font-medium" data-testid={`text-template-subject-${template.id}`}>
                          {template.subject}
                        </p>
                      </div>
                      <div className="p-3 bg-muted/30 rounded-md max-h-32 overflow-y-auto">
                        <p className="text-xs text-muted-foreground mb-1">Preview HTML:</p>
                        <pre className="whitespace-pre-wrap text-xs font-mono" data-testid={`text-template-html-${template.id}`}>
                          {template.htmlTemplate.substring(0, 300)}{template.htmlTemplate.length > 300 ? "..." : ""}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
