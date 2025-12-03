import { useRef, useState, useCallback } from "react";
import EmailEditor, { EditorRef, EmailEditorProps } from "react-email-editor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Save, Send, Eye, Loader2, Tags, ChevronDown, Copy, Check } from "lucide-react";

interface EmailEditorComponentProps {
  initialDesign?: object;
  onSave: (design: object, html: string) => void;
  onTest?: () => void;
  saving?: boolean;
  testing?: boolean;
  title?: string;
  description?: string;
}

const mergeTagsConfig = {
  first_name: {
    name: "Nome",
    value: "{{nome}}"
  },
  email: {
    name: "Email",
    value: "{{email}}"
  },
  webinar_title: {
    name: "Título do Webinar",
    value: "{{webinar_titulo}}"
  },
  webinar_date: {
    name: "Data do Webinar",
    value: "{{webinar_data}}"
  },
  webinar_time: {
    name: "Horário do Webinar",
    value: "{{webinar_horario}}"
  },
  webinar_link: {
    name: "Link do Webinar",
    value: "{{webinar_link}}"
  },
  replay_link: {
    name: "Link do Replay",
    value: "{{replay_link}}"
  },
  unsubscribe_link: {
    name: "Link Descadastrar",
    value: "{{descadastrar_link}}"
  }
};

const mergeTagsDocumentation = [
  {
    category: "Dados do Lead",
    tags: [
      { tag: "{{nome}}", description: "Nome completo do inscrito", example: "João Silva" },
      { tag: "{{email}}", description: "Email do inscrito", example: "joao@email.com" }
    ]
  },
  {
    category: "Dados do Webinário",
    tags: [
      { tag: "{{webinar_titulo}}", description: "Título/nome do webinário", example: "Como Dobrar suas Vendas" },
      { tag: "{{webinar_data}}", description: "Data do webinário (DD/MM/AAAA)", example: "15/03/2024" },
      { tag: "{{webinar_horario}}", description: "Horário de início", example: "20:00" }
    ]
  },
  {
    category: "Links",
    tags: [
      { tag: "{{webinar_link}}", description: "Link de acesso à transmissão ao vivo", example: "https://seusite.com/webinar/abc" },
      { tag: "{{replay_link}}", description: "Link para assistir ao replay", example: "https://seusite.com/replay/abc" },
      { tag: "{{descadastrar_link}}", description: "Link para cancelar inscrição", example: "https://seusite.com/unsubscribe" }
    ]
  }
];

export default function EmailEditorComponent({
  initialDesign,
  onSave,
  onTest,
  saving = false,
  testing = false,
  title = "Editor de Email",
  description = "Crie emails bonitos com arraste e solte"
}: EmailEditorComponentProps) {
  const emailEditorRef = useRef<EditorRef>(null);
  const [showMergeTags, setShowMergeTags] = useState(true);
  const [copiedTag, setCopiedTag] = useState<string | null>(null);

  const onReady: EmailEditorProps["onReady"] = (unlayer) => {
    if (initialDesign && Object.keys(initialDesign).length > 0) {
      unlayer.loadDesign(initialDesign as any);
    }
  };

  const handleSave = useCallback(() => {
    const unlayer = emailEditorRef.current?.editor;
    if (!unlayer) return;

    unlayer.exportHtml((data) => {
      const { design, html } = data;
      onSave(design, html);
    });
  }, [onSave]);

  const handlePreview = useCallback(() => {
    const unlayer = emailEditorRef.current?.editor;
    if (!unlayer) return;
    unlayer.showPreview({ device: "desktop" });
  }, []);

  const copyTag = (tag: string) => {
    navigator.clipboard.writeText(tag);
    setCopiedTag(tag);
    setTimeout(() => setCopiedTag(null), 2000);
  };

  return (
    <div className="space-y-4">
      <Collapsible open={showMergeTags} onOpenChange={setShowMergeTags}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover-elevate py-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Tags className="w-5 h-5 text-primary" />
                  <div>
                    <CardTitle className="text-base">Merge Tags Disponíveis</CardTitle>
                    <CardDescription className="text-xs">
                      Clique para copiar e usar no seu email
                    </CardDescription>
                  </div>
                </div>
                <ChevronDown className={`w-4 h-4 transition-transform ${showMergeTags ? 'rotate-180' : ''}`} />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0">
              <div className="grid gap-4 md:grid-cols-3">
                {mergeTagsDocumentation.map((category) => (
                  <div key={category.category} className="space-y-2">
                    <h4 className="text-sm font-medium text-muted-foreground">{category.category}</h4>
                    <div className="space-y-1">
                      {category.tags.map((item) => (
                        <button
                          key={item.tag}
                          onClick={() => copyTag(item.tag)}
                          className="w-full text-left p-2 rounded border hover-elevate active-elevate-2 transition-colors group"
                          data-testid={`button-copy-tag-${item.tag.replace(/\{\{|\}\}/g, '')}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                              {item.tag}
                            </code>
                            {copiedTag === item.tag ? (
                              <Check className="w-3 h-3 text-green-500" />
                            ) : (
                              <Copy className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity" />
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
                          <p className="text-xs text-muted-foreground/70 italic">Ex: {item.example}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground">
                  <strong>Dica:</strong> Você também pode inserir merge tags diretamente no editor usando o menu de inserção. 
                  Clique em "Merge Tags" na barra de ferramentas do editor para ver as opções disponíveis.
                </p>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Card className="h-full flex flex-col">
        <CardHeader className="flex-shrink-0 pb-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePreview}
                data-testid="button-preview-email"
              >
                <Eye className="w-4 h-4 mr-2" />
                Visualizar
              </Button>
              {onTest && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onTest}
                  disabled={testing}
                  data-testid="button-test-email"
                >
                  {testing ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4 mr-2" />
                  )}
                  Testar
                </Button>
              )}
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
                data-testid="button-save-email"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Salvar
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 p-0 min-h-[600px]">
        <EmailEditor
          ref={emailEditorRef}
          onReady={onReady}
          minHeight="600px"
          options={{
            locale: "pt-BR",
            appearance: {
              theme: "modern_dark",
              panels: {
                tools: {
                  dock: "left"
                }
              }
            },
            features: {
              textEditor: {
                spellChecker: true
              }
            },
            mergeTags: mergeTagsConfig,
            tools: {
              button: {
                enabled: true
              },
              divider: {
                enabled: true
              },
              heading: {
                enabled: true
              },
              html: {
                enabled: true
              },
              image: {
                enabled: true
              },
              menu: {
                enabled: true
              },
              social: {
                enabled: true
              },
              text: {
                enabled: true
              },
              timer: {
                enabled: true
              },
              video: {
                enabled: true
              }
            }
          }}
        />
        </CardContent>
      </Card>
    </div>
  );
}
