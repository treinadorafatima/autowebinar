import { useEffect, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Clock, XCircle, ArrowRight } from "lucide-react";
import { usePixel } from "@/hooks/use-pixel";

type ResultType = "sucesso" | "pendente" | "erro";

interface Props {
  tipo: ResultType;
}

const resultConfig = {
  sucesso: {
    icon: CheckCircle,
    iconColor: "text-green-500",
    title: "Pagamento Aprovado!",
    description: "Seu pagamento foi processado com sucesso. Você receberá um email com as instruções de acesso.",
    bgColor: "bg-green-50 dark:bg-green-950/20",
  },
  pendente: {
    icon: Clock,
    iconColor: "text-yellow-500",
    title: "Pagamento Pendente",
    description: "Seu pagamento está sendo processado. Assim que for confirmado, você receberá um email com as instruções de acesso.",
    bgColor: "bg-yellow-50 dark:bg-yellow-950/20",
  },
  erro: {
    icon: XCircle,
    iconColor: "text-red-500",
    title: "Pagamento não Processado",
    description: "Houve um problema ao processar seu pagamento. Por favor, tente novamente ou escolha outra forma de pagamento.",
    bgColor: "bg-red-50 dark:bg-red-950/20",
  },
};

export default function PagamentoResultado({ tipo }: Props) {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const pagamentoId = params.get("id");
  const valor = params.get("valor");
  const plano = params.get("plano");
  const planoId = params.get("planoId");
  const affiliateCode = params.get("ref") || null;
  const { trackPurchase } = usePixel({ affiliateCode });
  const purchaseTracked = useRef(false);

  const config = resultConfig[tipo];
  const Icon = config.icon;

  useEffect(() => {
    if (tipo === "sucesso") {
      document.title = "Pagamento Aprovado | AutoWebinar";
      
      if (!purchaseTracked.current && (pagamentoId || planoId)) {
        purchaseTracked.current = true;
        trackPurchase({
          value: valor ? parseFloat(valor) : 0,
          currency: "BRL",
          content_name: plano || "Plano AutoWebinar",
          content_ids: planoId ? [planoId] : [],
          pagamentoId: pagamentoId || undefined,
          num_items: 1,
        });
      }
    } else if (tipo === "pendente") {
      document.title = "Pagamento Pendente | AutoWebinar";
    } else {
      document.title = "Erro no Pagamento | AutoWebinar";
    }
  }, [tipo, pagamentoId, valor, plano, trackPurchase]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className={`mx-auto w-20 h-20 rounded-full flex items-center justify-center ${config.bgColor}`}>
            <Icon className={`w-10 h-10 ${config.iconColor}`} />
          </div>
          <CardTitle className="mt-4 text-2xl" data-testid="text-result-title">
            {config.title}
          </CardTitle>
          <CardDescription className="text-base" data-testid="text-result-description">
            {config.description}
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {tipo === "sucesso" && (
            <div className="p-4 bg-muted rounded-lg text-center">
              <p className="text-sm text-muted-foreground mb-2">
                Próximos passos:
              </p>
              <ol className="text-sm text-left space-y-2">
                <li className="flex items-start gap-2">
                  <span className="font-bold">1.</span>
                  <span>Verifique seu email para as credenciais de acesso</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold">2.</span>
                  <span>Faça login no painel administrativo</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold">3.</span>
                  <span>Comece a criar seus webinários!</span>
                </li>
              </ol>
            </div>
          )}

          {tipo === "pendente" && (
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">
                Pagamentos via boleto ou PIX podem levar alguns minutos para serem confirmados.
                Assim que recebermos a confirmação, você será notificado por email.
              </p>
            </div>
          )}

          {tipo === "erro" && (
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">
                Possíveis motivos:
              </p>
              <ul className="text-sm text-muted-foreground mt-2 space-y-1">
                <li>• Cartão recusado pelo banco</li>
                <li>• Limite insuficiente</li>
                <li>• Dados incorretos</li>
                <li>• Problema de conexão</li>
              </ul>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex flex-col gap-2">
          {tipo === "sucesso" ? (
            <Button 
              className="w-full" 
              size="lg"
              onClick={() => setLocation("/admin")}
              data-testid="button-go-admin"
            >
              Ir para o Painel
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : tipo === "erro" ? (
            <Button 
              className="w-full" 
              size="lg"
              onClick={() => setLocation("/checkout")}
              data-testid="button-try-again"
            >
              Tentar Novamente
            </Button>
          ) : (
            <Button 
              variant="outline"
              className="w-full" 
              onClick={() => setLocation("/")}
              data-testid="button-go-home"
            >
              Voltar ao Início
            </Button>
          )}

          {pagamentoId && (
            <p className="text-xs text-muted-foreground text-center mt-2">
              ID do pedido: {pagamentoId.slice(0, 8)}...
            </p>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
