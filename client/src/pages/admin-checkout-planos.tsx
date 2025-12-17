import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Plus, Pencil, Trash2, Star, Package, Link, Copy, ExternalLink, RefreshCw, CreditCard } from "lucide-react";

interface Plano {
  id: string;
  nome: string;
  descricao: string;
  preco: number;
  prazoDias: number;
  webinarLimit: number;
  uploadLimit: number;
  storageLimit: number;
  whatsappAccountLimit: number;
  featureAI: boolean;
  featureTranscricao: boolean;
  featureDesignerIA: boolean;
  featureGeradorMensagens: boolean;
  ativo: boolean;
  gateway: string;
  tipoCobranca: string;
  frequencia: number;
  frequenciaTipo: string;
  disponivelRenovacao: boolean;
  beneficios: string;
  destaque: boolean;
  exibirNaLanding: boolean;
  ordem: number;
  criadoEm?: string;
  atualizadoEm?: string;
}

const defaultPlano: Partial<Plano> = {
  nome: "",
  descricao: "",
  preco: 0,
  prazoDias: 30,
  webinarLimit: 5,
  uploadLimit: 999,
  storageLimit: 5,
  whatsappAccountLimit: 2,
  featureAI: false,
  featureTranscricao: false,
  featureDesignerIA: false,
  featureGeradorMensagens: false,
  ativo: true,
  gateway: "mercadopago",
  tipoCobranca: "unico",
  frequencia: 1,
  frequenciaTipo: "months",
  disponivelRenovacao: false,
  beneficios: "[]",
  destaque: false,
  exibirNaLanding: true,
  ordem: 0,
};

export default function AdminCheckoutPlanos() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPlano, setEditingPlano] = useState<Partial<Plano> | null>(null);
  const [beneficiosText, setBeneficiosText] = useState("");

  const { data: planos, isLoading } = useQuery<Plano[]>({
    queryKey: ["/api/checkout/planos"],
  });

  const createMutation = useMutation({
    mutationFn: async (plano: Partial<Plano>) => {
      const res = await apiRequest("POST", "/api/checkout/planos", plano);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/checkout/planos"] });
      toast({ title: "Plano criado com sucesso!" });
      setIsDialogOpen(false);
      setEditingPlano(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao criar plano",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: Partial<Plano> & { id: string }) => {
      const res = await apiRequest("PUT", `/api/checkout/planos/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/checkout/planos"] });
      toast({ title: "Plano atualizado com sucesso!" });
      setIsDialogOpen(false);
      setEditingPlano(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar plano",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/checkout/planos/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/checkout/planos"] });
      toast({ title: "Plano excluído com sucesso!" });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao excluir plano",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleOpenCreate = () => {
    setEditingPlano({ ...defaultPlano });
    setBeneficiosText("");
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (plano: Plano) => {
    setEditingPlano({ ...plano });
    try {
      const beneficios = JSON.parse(plano.beneficios || "[]");
      setBeneficiosText(beneficios.join("\n"));
    } catch {
      setBeneficiosText("");
    }
    setIsDialogOpen(true);
  };

  const handleSave = () => {
    if (!editingPlano) return;

    const beneficiosArray = beneficiosText
      .split("\n")
      .map((b) => b.trim())
      .filter((b) => b.length > 0);

    const { criadoEm, atualizadoEm, ...planoWithoutDates } = editingPlano as Plano;
    const planoData = {
      ...planoWithoutDates,
      beneficios: JSON.stringify(beneficiosArray),
    };

    if (editingPlano.id) {
      updateMutation.mutate(planoData as Plano);
    } else {
      createMutation.mutate(planoData);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value / 100);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">
            Gestão de Planos
          </h1>
          <p className="text-muted-foreground">
            Crie e gerencie os planos de assinatura disponíveis para venda.
          </p>
        </div>
        <Button onClick={handleOpenCreate} data-testid="button-create-plano">
          <Plus className="w-4 h-4 mr-2" />
          Novo Plano
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Preço</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Prazo</TableHead>
                <TableHead>Limites</TableHead>
                <TableHead>Gateway</TableHead>
                <TableHead>Link de Pagamento</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {planos?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    Nenhum plano cadastrado
                  </TableCell>
                </TableRow>
              ) : (
                planos?.map((plano) => {
                  const checkoutUrl = `${window.location.origin}/checkout/${plano.id}`;
                  const isRecorrente = plano.tipoCobranca === 'recorrente';
                  const frequenciaLabel = isRecorrente 
                    ? `${plano.frequencia || 1} ${plano.frequenciaTipo === 'days' ? 'dia(s)' : plano.frequenciaTipo === 'years' ? 'ano(s)' : 'mês(es)'}`
                    : null;
                  return (
                    <TableRow key={plano.id} data-testid={`row-plano-${plano.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {plano.destaque && <Star className="w-4 h-4 text-yellow-500" />}
                          <span className="font-medium">{plano.nome}</span>
                        </div>
                      </TableCell>
                      <TableCell>{formatCurrency(plano.preco)}</TableCell>
                      <TableCell>
                        <Badge variant={isRecorrente ? "default" : "outline"} className="gap-1">
                          {isRecorrente ? (
                            <>
                              <RefreshCw className="w-3 h-3" />
                              Recorrente
                            </>
                          ) : (
                            <>
                              <CreditCard className="w-3 h-3" />
                              Único
                            </>
                          )}
                        </Badge>
                        {frequenciaLabel && (
                          <span className="text-xs text-muted-foreground block mt-1">
                            A cada {frequenciaLabel}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{plano.prazoDias} dias</TableCell>
                      <TableCell>
                        <div className="text-sm space-y-1">
                          <div>{plano.webinarLimit === 999 ? '∞' : plano.webinarLimit} webinars</div>
                          <div className="text-muted-foreground">{plano.storageLimit || 5}GB armazenamento</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{plano.gateway}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-2"
                            onClick={() => {
                              navigator.clipboard.writeText(checkoutUrl);
                              toast({ title: "Link copiado!", description: checkoutUrl });
                            }}
                            data-testid={`button-copy-link-${plano.id}`}
                          >
                            <Copy className="w-3 h-3 mr-1" />
                            Copiar
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => window.open(checkoutUrl, '_blank')}
                            data-testid={`button-open-link-${plano.id}`}
                          >
                            <ExternalLink className="w-3 h-3" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={plano.ativo ? "default" : "secondary"}>
                          {plano.ativo ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenEdit(plano)}
                            data-testid={`button-edit-${plano.id}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm("Tem certeza que deseja excluir este plano?")) {
                                deleteMutation.mutate(plano.id);
                              }
                            }}
                            data-testid={`button-delete-${plano.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingPlano?.id ? "Editar Plano" : "Criar Plano"}
            </DialogTitle>
            <DialogDescription>
              Configure os detalhes do plano de assinatura.
            </DialogDescription>
          </DialogHeader>

          {editingPlano && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="nome">Nome do Plano</Label>
                  <Input
                    id="nome"
                    data-testid="input-plano-nome"
                    value={editingPlano.nome || ""}
                    onChange={(e) =>
                      setEditingPlano({ ...editingPlano, nome: e.target.value })
                    }
                    placeholder="Ex: Plano Básico"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="preco">Preço (R$)</Label>
                  <Input
                    id="preco"
                    data-testid="input-plano-preco"
                    type="number"
                    step="0.01"
                    value={((editingPlano.preco || 0) / 100).toFixed(2)}
                    onChange={(e) =>
                      setEditingPlano({
                        ...editingPlano,
                        preco: Math.round(parseFloat(e.target.value) * 100) || 0,
                      })
                    }
                    placeholder="97.00"
                  />
                  <p className="text-xs text-muted-foreground">
                    Valor em reais (ex: 97.00 para R$ 97,00)
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="descricao">Descrição</Label>
                <Textarea
                  id="descricao"
                  data-testid="input-plano-descricao"
                  value={editingPlano.descricao || ""}
                  onChange={(e) =>
                    setEditingPlano({ ...editingPlano, descricao: e.target.value })
                  }
                  placeholder="Descrição do plano..."
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                {editingPlano.tipoCobranca !== "recorrente" && (
                  <div className="space-y-2">
                    <Label htmlFor="prazoDias">Prazo de Acesso (dias)</Label>
                    <Input
                      id="prazoDias"
                      data-testid="input-plano-prazo"
                      type="number"
                      value={editingPlano.prazoDias || 30}
                      onChange={(e) =>
                        setEditingPlano({
                          ...editingPlano,
                          prazoDias: parseInt(e.target.value) || 30,
                        })
                      }
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="webinarLimit">Limite de Webinars</Label>
                  <Input
                    id="webinarLimit"
                    data-testid="input-plano-webinar-limit"
                    type="number"
                    value={editingPlano.webinarLimit || 5}
                    onChange={(e) =>
                      setEditingPlano({
                        ...editingPlano,
                        webinarLimit: parseInt(e.target.value) || 5,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="uploadLimit">Limite de Uploads</Label>
                  <Input
                    id="uploadLimit"
                    data-testid="input-plano-upload-limit"
                    type="number"
                    value={editingPlano.uploadLimit || 999}
                    onChange={(e) =>
                      setEditingPlano({
                        ...editingPlano,
                        uploadLimit: parseInt(e.target.value) || 999,
                      })
                    }
                  />
                  <p className="text-xs text-muted-foreground">Use 999 para ilimitado</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="storageLimit">Limite de Armazenamento (GB)</Label>
                  <Input
                    id="storageLimit"
                    data-testid="input-plano-storage-limit"
                    type="number"
                    value={editingPlano.storageLimit || 5}
                    onChange={(e) =>
                      setEditingPlano({
                        ...editingPlano,
                        storageLimit: parseInt(e.target.value) || 5,
                      })
                    }
                  />
                  <p className="text-xs text-muted-foreground">Limite de espaço para vídeos</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="whatsappAccountLimit">Limite de Contas WhatsApp</Label>
                  <Input
                    id="whatsappAccountLimit"
                    data-testid="input-plano-whatsapp-limit"
                    type="number"
                    value={editingPlano.whatsappAccountLimit || 2}
                    onChange={(e) =>
                      setEditingPlano({
                        ...editingPlano,
                        whatsappAccountLimit: parseInt(e.target.value) || 2,
                      })
                    }
                  />
                  <p className="text-xs text-muted-foreground">Conexões WhatsApp permitidas</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="gateway">Gateway de Pagamento</Label>
                  <Select
                    value={editingPlano.gateway || "mercadopago"}
                    onValueChange={(value) =>
                      setEditingPlano({ ...editingPlano, gateway: value })
                    }
                  >
                    <SelectTrigger data-testid="select-plano-gateway">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mercadopago">Mercado Pago</SelectItem>
                      <SelectItem value="stripe">Stripe</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tipoCobranca">Tipo de Cobrança</Label>
                  <Select
                    value={editingPlano.tipoCobranca || "unico"}
                    onValueChange={(value) =>
                      setEditingPlano({ ...editingPlano, tipoCobranca: value })
                    }
                  >
                    <SelectTrigger data-testid="select-plano-tipo">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unico">Pagamento Único</SelectItem>
                      <SelectItem value="recorrente">Assinatura</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {editingPlano.tipoCobranca === "recorrente" && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="frequencia">Frequência</Label>
                    <Input
                      id="frequencia"
                      data-testid="input-plano-frequencia"
                      type="number"
                      value={editingPlano.frequencia || 1}
                      onChange={(e) => {
                        const freq = parseInt(e.target.value) || 1;
                        const tipo = editingPlano.frequenciaTipo || "months";
                        const prazoDias = tipo === "days" ? freq : tipo === "months" ? freq * 30 : freq * 365;
                        setEditingPlano({
                          ...editingPlano,
                          frequencia: freq,
                          prazoDias: prazoDias,
                        });
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="frequenciaTipo">Período</Label>
                    <Select
                      value={editingPlano.frequenciaTipo || "months"}
                      onValueChange={(value) => {
                        const freq = editingPlano.frequencia || 1;
                        const prazoDias = value === "days" ? freq : value === "months" ? freq * 30 : freq * 365;
                        setEditingPlano({ 
                          ...editingPlano, 
                          frequenciaTipo: value,
                          prazoDias: prazoDias,
                        });
                      }}
                    >
                      <SelectTrigger data-testid="select-plano-frequencia-tipo">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="days">Dias</SelectItem>
                        <SelectItem value="months">Meses</SelectItem>
                        <SelectItem value="years">Anos</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2 text-sm text-muted-foreground">
                    Prazo de acesso calculado automaticamente: {editingPlano.prazoDias || 30} dias
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="beneficios">Benefícios (um por linha)</Label>
                <Textarea
                  id="beneficios"
                  data-testid="input-plano-beneficios"
                  value={beneficiosText}
                  onChange={(e) => setBeneficiosText(e.target.value)}
                  placeholder="Acesso a todos os recursos&#10;Suporte prioritário&#10;Webinars ilimitados"
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ordem">Ordem de Exibição</Label>
                <Input
                  id="ordem"
                  data-testid="input-plano-ordem"
                  type="number"
                  value={editingPlano.ordem || 0}
                  onChange={(e) =>
                    setEditingPlano({
                      ...editingPlano,
                      ordem: parseInt(e.target.value) || 0,
                    })
                  }
                />
              </div>

              <div className="space-y-4">
                <div className="border rounded-lg p-4 bg-muted/30">
                  <h4 className="font-medium mb-3 text-sm">Recursos de IA</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <Switch
                          id="featureAI"
                          checked={editingPlano.featureAI ?? false}
                          onCheckedChange={(checked) =>
                            setEditingPlano({ 
                              ...editingPlano, 
                              featureAI: checked,
                              featureTranscricao: checked,
                              featureDesignerIA: checked,
                              featureGeradorMensagens: checked,
                            })
                          }
                          data-testid="switch-plano-feature-ai"
                        />
                        <Label htmlFor="featureAI">Todas IA</Label>
                      </div>
                      <p className="text-xs text-muted-foreground">Ativa todas as features de IA</p>
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <Switch
                          id="featureTranscricao"
                          checked={editingPlano.featureTranscricao ?? false}
                          onCheckedChange={(checked) =>
                            setEditingPlano({ ...editingPlano, featureTranscricao: checked })
                          }
                          data-testid="switch-plano-feature-transcricao"
                        />
                        <Label htmlFor="featureTranscricao">Transcrição</Label>
                      </div>
                      <p className="text-xs text-muted-foreground">Transcrição de vídeo</p>
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <Switch
                          id="featureDesignerIA"
                          checked={editingPlano.featureDesignerIA ?? false}
                          onCheckedChange={(checked) =>
                            setEditingPlano({ ...editingPlano, featureDesignerIA: checked })
                          }
                          data-testid="switch-plano-feature-designer-ia"
                        />
                        <Label htmlFor="featureDesignerIA">Designer IA</Label>
                      </div>
                      <p className="text-xs text-muted-foreground">Personalização com IA</p>
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <Switch
                          id="featureGeradorMensagens"
                          checked={editingPlano.featureGeradorMensagens ?? false}
                          onCheckedChange={(checked) =>
                            setEditingPlano({ ...editingPlano, featureGeradorMensagens: checked })
                          }
                          data-testid="switch-plano-feature-gerador-mensagens"
                        />
                        <Label htmlFor="featureGeradorMensagens">Gerador Mensagens</Label>
                      </div>
                      <p className="text-xs text-muted-foreground">Gerar mensagens com IA</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <Switch
                        id="ativo"
                        checked={editingPlano.ativo ?? true}
                        onCheckedChange={(checked) =>
                          setEditingPlano({ ...editingPlano, ativo: checked })
                        }
                        data-testid="switch-plano-ativo"
                      />
                      <Label htmlFor="ativo">Ativo</Label>
                    </div>
                    <p className="text-xs text-muted-foreground">Link funciona</p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <Switch
                        id="exibirNaLanding"
                        checked={editingPlano.exibirNaLanding ?? true}
                        onCheckedChange={(checked) =>
                          setEditingPlano({ ...editingPlano, exibirNaLanding: checked })
                        }
                        data-testid="switch-plano-exibir-landing"
                      />
                      <Label htmlFor="exibirNaLanding">Na Landing</Label>
                    </div>
                    <p className="text-xs text-muted-foreground">Aparece na página</p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <Switch
                        id="destaque"
                        checked={editingPlano.destaque ?? false}
                        onCheckedChange={(checked) =>
                          setEditingPlano({ ...editingPlano, destaque: checked })
                        }
                        data-testid="switch-plano-destaque"
                      />
                      <Label htmlFor="destaque">Destacar</Label>
                    </div>
                    <p className="text-xs text-muted-foreground">Exibe como "Mais Escolhido"</p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <Switch
                        id="disponivelRenovacao"
                        checked={editingPlano.disponivelRenovacao ?? false}
                        onCheckedChange={(checked) =>
                          setEditingPlano({ ...editingPlano, disponivelRenovacao: checked })
                        }
                        data-testid="switch-plano-renovacao"
                      />
                      <Label htmlFor="disponivelRenovacao">Renovação</Label>
                    </div>
                    <p className="text-xs text-muted-foreground">Aparece para quem renova</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-plano"
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              {editingPlano?.id ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
