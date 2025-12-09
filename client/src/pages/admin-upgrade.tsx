import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Check, Sparkles, ArrowRight, Crown, Star } from "lucide-react";

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
  beneficios: string;
  destaque: boolean;
  tipoCobranca: string;
}

interface SubscriptionInfo {
  admin: {
    id: string;
    name: string;
    email: string;
    planoId: string | null;
  };
  plano: {
    id: string;
    nome: string;
    preco: number;
  } | null;
}

export default function AdminUpgradePage() {
  const [, setLocation] = useLocation();

  const { data: subscription, isLoading: isLoadingSubscription } = useQuery<SubscriptionInfo>({
    queryKey: ["/api/admin/subscription"],
  });

  const { data: planos, isLoading: isLoadingPlanos } = useQuery<Plano[]>({
    queryKey: ["/api/checkout/planos/ativos"],
  });

  const isLoading = isLoadingSubscription || isLoadingPlanos;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]" data-testid="loader-upgrade">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const currentPlano = subscription?.plano;
  const currentPlanPrice = currentPlano?.preco || 0;

  const upgradePlanos = planos?.filter(p => p.preco > currentPlanPrice) || [];

  const parseBeneficios = (beneficiosStr: string): string[] => {
    try {
      const parsed = JSON.parse(beneficiosStr);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const handleSelectPlan = (planoId: string) => {
    setLocation(`/checkout/${planoId}`);
  };

  return (
    <div className="space-y-6 p-6" data-testid="page-admin-upgrade">
      <div className="text-center max-w-2xl mx-auto">
        <div className="inline-flex items-center justify-center p-3 rounded-full bg-primary/10 mb-4">
          <Crown className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-3xl font-bold mb-2" data-testid="text-upgrade-title">
          Faça Upgrade do seu Plano
        </h1>
        <p className="text-muted-foreground" data-testid="text-upgrade-description">
          Desbloqueie funcionalidades avançadas de IA e aumente seus limites
        </p>
        {currentPlano && (
          <Badge variant="outline" className="mt-4" data-testid="badge-current-plan">
            Plano atual: {currentPlano.nome}
          </Badge>
        )}
      </div>

      {upgradePlanos.length === 0 ? (
        <Card className="max-w-md mx-auto" data-testid="card-no-upgrades">
          <CardContent className="pt-6 text-center">
            <Star className="h-12 w-12 text-primary mx-auto mb-4" />
            <p className="text-lg font-medium">Você já possui o melhor plano!</p>
            <p className="text-muted-foreground mt-2">
              Não há planos superiores disponíveis para upgrade.
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => setLocation("/admin")}
              data-testid="button-back-dashboard"
            >
              Voltar ao Painel
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 max-w-5xl mx-auto" data-testid="grid-upgrade-plans">
          {upgradePlanos.map((plano) => {
            const beneficios = parseBeneficios(plano.beneficios);
            const hasAIFeatures = plano.featureAI || plano.featureDesignerIA || plano.featureGeradorMensagens || plano.featureTranscricao;
            
            return (
              <Card 
                key={plano.id} 
                className={`relative ${plano.destaque ? 'border-primary ring-2 ring-primary/20' : ''}`}
                data-testid={`card-plan-${plano.id}`}
              >
                {plano.destaque && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground" data-testid={`badge-recommended-${plano.id}`}>
                      Recomendado
                    </Badge>
                  </div>
                )}
                
                <CardHeader className="text-center pb-2">
                  <CardTitle className="text-xl" data-testid={`text-plan-name-${plano.id}`}>
                    {plano.nome}
                  </CardTitle>
                  <CardDescription data-testid={`text-plan-description-${plano.id}`}>
                    {plano.descricao}
                  </CardDescription>
                  <div className="pt-4">
                    <span className="text-4xl font-bold" data-testid={`text-plan-price-${plano.id}`}>
                      R$ {plano.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-muted-foreground">
                      /{plano.tipoCobranca === 'recorrente' ? 'mês' : 'único'}
                    </span>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {hasAIFeatures && (
                    <div className="p-3 rounded-lg bg-gradient-to-r from-violet-500/10 via-purple-500/10 to-emerald-500/10 border border-violet-500/20">
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="h-4 w-4 text-violet-500" />
                        <span className="text-sm font-medium">Recursos de IA inclusos:</span>
                      </div>
                      <ul className="text-xs text-muted-foreground space-y-1">
                        {plano.featureDesignerIA && <li data-testid={`feature-designer-${plano.id}`}>Designer IA para páginas</li>}
                        {plano.featureAI && <li data-testid={`feature-scripts-${plano.id}`}>Roteirizador com IA</li>}
                        {plano.featureGeradorMensagens && <li data-testid={`feature-messages-${plano.id}`}>Gerador de mensagens</li>}
                        {plano.featureTranscricao && <li data-testid={`feature-transcription-${plano.id}`}>Transcrição de vídeos</li>}
                      </ul>
                    </div>
                  )}

                  <ul className="space-y-2">
                    <li className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span>{plano.webinarLimit} webinars</span>
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span>{plano.storageLimit} GB de armazenamento</span>
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span>{plano.whatsappAccountLimit} contas WhatsApp</span>
                    </li>
                    {beneficios.slice(0, 3).map((beneficio, idx) => (
                      <li key={idx} className="flex items-center gap-2 text-sm">
                        <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                        <span>{beneficio}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    className="w-full"
                    onClick={() => handleSelectPlan(plano.id)}
                    data-testid={`button-select-plan-${plano.id}`}
                  >
                    Escolher este plano
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <div className="text-center">
        <Button
          variant="ghost"
          onClick={() => setLocation("/admin")}
          data-testid="button-back-to-dashboard"
        >
          Voltar ao Painel
        </Button>
      </div>
    </div>
  );
}
