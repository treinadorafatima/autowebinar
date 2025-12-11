import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { 
  AlertTriangle, 
  CreditCard, 
  RefreshCcw,
  ArrowRight,
  LogOut,
  Shield,
  Check
} from "lucide-react";
import logoImage from "@assets/autowebinar-logo.png";

interface PaymentFailedBlockerProps {
  userName: string;
  userEmail: string;
  planoId?: string | null;
  failedReason?: string | null;
  onLogout: () => void;
}

export function PaymentFailedBlocker({ 
  userName, 
  userEmail,
  planoId,
  failedReason,
  onLogout 
}: PaymentFailedBlockerProps) {
  const [, setLocation] = useLocation();
  
  const checkoutUrl = planoId 
    ? `/checkout/${planoId}?renovacao=true&email=${encodeURIComponent(userEmail)}&nome=${encodeURIComponent(userName)}`
    : `/checkout?renovacao=true&email=${encodeURIComponent(userEmail)}&nome=${encodeURIComponent(userName)}`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-orange-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-red-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-lg">
        <div className="flex justify-center mb-8">
          <img 
            src={logoImage} 
            alt="AutoWebinar" 
            className="h-16 w-auto object-contain opacity-50"
          />
        </div>

        <Card className="bg-slate-800/80 border-orange-500/30 backdrop-blur-xl shadow-2xl">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-16 h-16 rounded-full bg-orange-500/20 flex items-center justify-center mb-4">
              <CreditCard className="w-8 h-8 text-orange-400" />
            </div>
            
            <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 mx-auto mb-3">
              Pagamento Pendente
            </Badge>
            
            <CardTitle className="text-2xl text-white">
              Ola, {userName}!
            </CardTitle>
            <CardDescription className="text-slate-400 text-base">
              Houve um problema com seu pagamento
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-6">
            <Alert className="bg-orange-500/10 border-orange-500/30">
              <AlertTriangle className="h-4 w-4 text-orange-400" />
              <AlertTitle className="text-orange-400">Pagamento Nao Aprovado</AlertTitle>
              <AlertDescription className="text-orange-300/80">
                {failedReason || "Seu ultimo pagamento nao foi aprovado. Isso pode ter ocorrido por limite insuficiente, cartao expirado ou dados incorretos."}
              </AlertDescription>
            </Alert>

            <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-500/10 to-green-500/10 border border-emerald-500/20">
              <div className="flex items-center gap-2 mb-3">
                <Shield className="w-5 h-5 text-emerald-400" />
                <span className="text-white font-semibold text-sm">Seus dados estao seguros!</span>
              </div>
              <ul className="space-y-2 text-sm text-slate-300">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span>Seus webinarios estao salvos</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span>Seus videos e configuracoes estao intactos</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span>Acesso sera liberado ao regularizar o pagamento</span>
                </li>
              </ul>
            </div>

            <div className="p-4 rounded-xl bg-slate-700/50 border border-slate-600/30">
              <p className="text-slate-400 text-sm mb-2">O que voce pode fazer:</p>
              <ul className="space-y-1 text-sm text-slate-300">
                <li>- Verificar o limite disponivel no seu cartao</li>
                <li>- Usar outro cartao ou metodo de pagamento</li>
                <li>- Entrar em contato com seu banco</li>
              </ul>
            </div>

            <div className="space-y-3 pt-2">
              <Button 
                size="lg"
                className="w-full h-14 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-lg font-semibold"
                onClick={() => setLocation(checkoutUrl)}
                data-testid="button-retry-payment"
              >
                <RefreshCcw className="w-5 h-5 mr-2" />
                Tentar Novamente
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>

              <Button 
                variant="outline"
                size="lg"
                className="w-full h-12 border-slate-600 text-slate-300 hover:bg-slate-700/50"
                onClick={() => setLocation("/admin/subscription")}
                data-testid="button-view-plans"
              >
                <CreditCard className="w-5 h-5 mr-2" />
                Ver Outros Planos
              </Button>

              <Button 
                variant="ghost"
                className="w-full text-slate-500 hover:text-slate-300"
                onClick={onLogout}
                data-testid="button-logout"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sair da Conta
              </Button>
            </div>

            <p className="text-center text-xs text-slate-500 pt-2">
              Duvidas? Entre em contato com nosso suporte.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
