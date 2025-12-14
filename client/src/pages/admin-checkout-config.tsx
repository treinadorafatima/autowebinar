import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Loader2, Eye, EyeOff, Check, X, Save, CreditCard, Wallet } from "lucide-react";
import { SiMercadopago, SiStripe, SiFacebook, SiGoogleads } from "react-icons/si";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ConfigItem {
  chave: string;
  hasValue: boolean;
}

export default function AdminCheckoutConfig() {
  const { toast } = useToast();
  const [editingConfig, setEditingConfig] = useState<Record<string, string>>({});
  const [showValues, setShowValues] = useState<Record<string, boolean>>({});
  const [loadingValues, setLoadingValues] = useState<Record<string, boolean>>({});
  const [cachedValues, setCachedValues] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState("mercadopago");

  const { data: configs, isLoading } = useQuery<ConfigItem[]>({
    queryKey: ["/api/checkout/config"],
  });

  const saveMutation = useMutation({
    mutationFn: async ({ chave, valor }: { chave: string; valor: string }) => {
      const res = await apiRequest("POST", "/api/checkout/config", { chave, valor });
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/checkout/config"] });
      toast({
        title: "Configuração salva",
        description: `${variables.chave} foi atualizada com sucesso.`,
      });
      setEditingConfig((prev) => {
        const newState = { ...prev };
        delete newState[variables.chave];
        return newState;
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSave = (chave: string) => {
    const valor = editingConfig[chave];
    if (valor !== undefined) {
      saveMutation.mutate({ chave, valor });
    }
  };

  const toggleShowValue = (chave: string) => {
    setShowValues((prev) => ({ ...prev, [chave]: !prev[chave] }));
  };

  const getConfigStatus = (chave: string) => {
    const config = configs?.find((c) => c.chave === chave);
    return config?.hasValue || false;
  };

  const fetchConfigValue = async (chave: string) => {
    // Se já temos o valor em cache, usa ele
    if (cachedValues[chave]) {
      setEditingConfig((prev) => ({ ...prev, [chave]: cachedValues[chave] }));
      return;
    }

    setLoadingValues((prev) => ({ ...prev, [chave]: true }));
    try {
      const token = localStorage.getItem("adminToken");
      const res = await fetch(`/api/checkout/config/${chave}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        setCachedValues((prev) => ({ ...prev, [chave]: data.valor }));
        setEditingConfig((prev) => ({ ...prev, [chave]: data.valor }));
      } else {
        toast({
          title: "Erro ao carregar",
          description: "Não foi possível carregar o valor salvo.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Erro de conexão",
        description: "Não foi possível conectar ao servidor.",
        variant: "destructive",
      });
    } finally {
      setLoadingValues((prev) => ({ ...prev, [chave]: false }));
    }
  };

  const renderConfigField = (chave: string, label: string, placeholder: string) => {
    const hasValue = getConfigStatus(chave);
    const isEditing = editingConfig[chave] !== undefined;
    const showValue = showValues[chave];
    const isLoadingValue = loadingValues[chave];

    const handleToggleVisibility = async (chave: string) => {
      const newShowState = !showValues[chave];
      toggleShowValue(chave);
      
      // Se vai mostrar e tem valor salvo, busca o valor real
      if (newShowState && hasValue && !editingConfig[chave]) {
        await fetchConfigValue(chave);
      }
    };

    return (
      <div className="space-y-2" key={chave}>
        <div className="flex items-center justify-between">
          <Label htmlFor={chave}>{label}</Label>
          <div className="flex items-center gap-1">
            {hasValue && !isEditing ? (
              <span className="flex items-center gap-1 text-xs text-green-600">
                <Check className="w-3 h-3" /> Configurado
              </span>
            ) : !hasValue && !isEditing ? (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <X className="w-3 h-3" /> Não configurado
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              id={chave}
              data-testid={`input-config-${chave}`}
              type={showValue ? "text" : "password"}
              placeholder={hasValue && !isEditing ? "••••••••" : placeholder}
              value={editingConfig[chave] ?? ""}
              onChange={(e) =>
                setEditingConfig((prev) => ({ ...prev, [chave]: e.target.value }))
              }
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0"
              onClick={() => handleToggleVisibility(chave)}
              disabled={isLoadingValue}
              data-testid={`button-toggle-visibility-${chave}`}
            >
              {isLoadingValue ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : showValue ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </Button>
          </div>
          <Button
            onClick={() => handleSave(chave)}
            disabled={!isEditing || saveMutation.isPending}
            data-testid={`button-save-${chave}`}
          >
            {saveMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 px-4 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" data-testid="text-page-title">
          Configurações de Pagamento
        </h1>
        <p className="text-muted-foreground">
          Configure as chaves de API dos gateways de pagamento e integrações de marketing.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="mercadopago" className="flex items-center gap-2" data-testid="tab-mercadopago">
            <SiMercadopago className="w-4 h-4" />
            <span className="hidden sm:inline">Mercado Pago</span>
          </TabsTrigger>
          <TabsTrigger value="stripe" className="flex items-center gap-2" data-testid="tab-stripe">
            <SiStripe className="w-4 h-4" />
            <span className="hidden sm:inline">Stripe</span>
          </TabsTrigger>
          <TabsTrigger value="facebook" className="flex items-center gap-2" data-testid="tab-facebook">
            <SiFacebook className="w-4 h-4" />
            <span className="hidden sm:inline">Facebook</span>
          </TabsTrigger>
          <TabsTrigger value="google" className="flex items-center gap-2" data-testid="tab-google">
            <SiGoogleads className="w-4 h-4" />
            <span className="hidden sm:inline">Google Ads</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="mercadopago">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="w-5 h-5" />
                Mercado Pago
              </CardTitle>
              <CardDescription>
                Configure suas credenciais do Mercado Pago. Obtenha suas chaves em{" "}
                <a
                  href="https://www.mercadopago.com.br/developers/panel/credentials"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  mercadopago.com.br/developers
                </a>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {renderConfigField(
                "MERCADOPAGO_PUBLIC_KEY",
                "Public Key",
                "APP_USR-xxxxxxxx-xxxx-xxxx..."
              )}
              {renderConfigField(
                "MERCADOPAGO_ACCESS_TOKEN",
                "Access Token",
                "APP_USR-xxxxxxxx-xxxx-xxxx..."
              )}
              {renderConfigField(
                "MERCADOPAGO_WEBHOOK_SECRET",
                "Webhook Secret (opcional)",
                "Secret para validar webhooks"
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stripe">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                Stripe
              </CardTitle>
              <CardDescription>
                Configure suas credenciais do Stripe. Obtenha suas chaves em{" "}
                <a
                  href="https://dashboard.stripe.com/apikeys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  dashboard.stripe.com/apikeys
                </a>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {renderConfigField(
                "STRIPE_PUBLIC_KEY",
                "Publishable Key",
                "pk_test_xxxxxxxx ou pk_live_xxxxxxxx"
              )}
              {renderConfigField(
                "STRIPE_SECRET_KEY",
                "Secret Key",
                "sk_test_xxxxxxxx ou sk_live_xxxxxxxx"
              )}
              {renderConfigField(
                "STRIPE_WEBHOOK_SECRET",
                "Webhook Secret",
                "whsec_xxxxxxxx"
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="facebook">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SiFacebook className="w-5 h-5" />
                Facebook Pixel
              </CardTitle>
              <CardDescription>
                Configure o Facebook Pixel para rastrear conversões. Obtenha seu ID em{" "}
                <a
                  href="https://business.facebook.com/events_manager"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  business.facebook.com/events_manager
                </a>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {renderConfigField(
                "FACEBOOK_PIXEL_ID",
                "Pixel ID",
                "123456789012345"
              )}
              {renderConfigField(
                "FACEBOOK_ACCESS_TOKEN",
                "Access Token (API de Conversões)",
                "EAAxxxxxxxx..."
              )}
              <div className="p-4 bg-muted rounded-lg text-sm">
                <p className="font-medium mb-2">Eventos rastreados:</p>
                <ul className="space-y-1 text-muted-foreground">
                  <li><span className="font-mono text-xs bg-background px-1 rounded">PageView</span> - Ao carregar a página</li>
                  <li><span className="font-mono text-xs bg-background px-1 rounded">ViewContent</span> - Ao ver um plano</li>
                  <li><span className="font-mono text-xs bg-background px-1 rounded">Lead</span> - Ao preencher dados pessoais</li>
                  <li><span className="font-mono text-xs bg-background px-1 rounded">InitiateCheckout</span> - Ao iniciar pagamento</li>
                  <li><span className="font-mono text-xs bg-background px-1 rounded">AddPaymentInfo</span> - Ao inserir dados do cartão</li>
                  <li><span className="font-mono text-xs bg-background px-1 rounded">Purchase</span> - Pagamento aprovado (frontend + API)</li>
                </ul>
                <p className="mt-3 text-xs text-muted-foreground">
                  Os dados do usuário (email, telefone, nome) são enviados para melhor correspondência.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="google">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SiGoogleads className="w-5 h-5" />
                Google Ads
              </CardTitle>
              <CardDescription>
                Configure o Google Ads Conversion Tracking. Obtenha seus IDs em{" "}
                <a
                  href="https://ads.google.com/aw/conversions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  ads.google.com
                </a>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg text-sm mb-4">
                <p className="font-medium mb-2">Como configurar:</p>
                <ol className="space-y-1 text-muted-foreground list-decimal list-inside">
                  <li>Acesse Google Ads → Ferramentas → Conversões</li>
                  <li>Crie uma ação de conversão para "Compra"</li>
                  <li>Copie o Conversion ID (ex: AW-123456789)</li>
                  <li>Copie o Conversion Label (ex: AbC1dEfGh)</li>
                </ol>
              </div>
              {renderConfigField(
                "GOOGLE_ADS_CONVERSION_ID",
                "Conversion ID (Tag Global)",
                "AW-123456789"
              )}
              {renderConfigField(
                "GOOGLE_ADS_CONVERSION_LABEL",
                "Conversion Label (Evento de Compra)",
                "AbC1dEfGhIjKlMnO"
              )}
              <div className="p-4 bg-muted rounded-lg text-sm">
                <p className="font-medium mb-2">Eventos rastreados:</p>
                <ul className="space-y-1 text-muted-foreground">
                  <li><span className="font-mono text-xs bg-background px-1 rounded">page_view</span> - Ao carregar a página</li>
                  <li><span className="font-mono text-xs bg-background px-1 rounded">generate_lead</span> - Ao preencher dados pessoais</li>
                  <li><span className="font-mono text-xs bg-background px-1 rounded">begin_checkout</span> - Ao iniciar pagamento</li>
                  <li><span className="font-mono text-xs bg-background px-1 rounded">add_payment_info</span> - Ao inserir dados do cartão</li>
                  <li><span className="font-mono text-xs bg-background px-1 rounded">conversion</span> - Pagamento aprovado (usando o Label configurado)</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>

      {(activeTab === "mercadopago" || activeTab === "stripe") && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>URLs de Webhook</CardTitle>
            <CardDescription>
              Configure estas URLs nos painéis dos gateways de pagamento para receber notificações.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Mercado Pago Webhook URL</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 p-2 bg-muted rounded text-sm" data-testid="text-webhook-mp">
                  {window.location.origin}/webhook/mercadopago
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/webhook/mercadopago`);
                    toast({ title: "URL copiada!" });
                  }}
                  data-testid="button-copy-webhook-mp"
                >
                  Copiar
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Stripe Webhook URL</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 p-2 bg-muted rounded text-sm" data-testid="text-webhook-stripe">
                  {window.location.origin}/webhook/stripe
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/webhook/stripe`);
                    toast({ title: "URL copiada!" });
                  }}
                  data-testid="button-copy-webhook-stripe"
                >
                  Copiar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
