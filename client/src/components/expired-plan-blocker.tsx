import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { 
  AlertTriangle, 
  Clock, 
  CreditCard, 
  Trash2, 
  Crown,
  ArrowRight,
  LogOut,
  Bot,
  FileText,
  Mail,
  Mic,
  Check
} from "lucide-react";
import logoImage from "@assets/ChatGPT Image 30 de nov. de 2025, 00_00_41_1764471665393.png";

interface ExpiredPlanBlockerProps {
  userName: string;
  expirationDate: string;
  isTrial: boolean;
  onLogout: () => void;
}

export function ExpiredPlanBlocker({ 
  userName, 
  expirationDate, 
  isTrial,
  onLogout 
}: ExpiredPlanBlockerProps) {
  const [, setLocation] = useLocation();
  
  const expiredDate = new Date(expirationDate);
  const deleteDate = new Date(expiredDate);
  deleteDate.setDate(deleteDate.getDate() + 30);
  
  const daysUntilDelete = Math.max(0, Math.ceil((deleteDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)));

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('pt-BR', { 
      day: '2-digit', 
      month: 'long', 
      year: 'numeric' 
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-red-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-orange-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-lg">
        <div className="flex justify-center mb-8">
          <img 
            src={logoImage} 
            alt="AutoWebinar" 
            className="h-16 w-auto object-contain opacity-50"
          />
        </div>

        <Card className="bg-slate-800/80 border-red-500/30 backdrop-blur-xl shadow-2xl">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
              <AlertTriangle className="w-8 h-8 text-red-400" />
            </div>
            
            <Badge className="bg-red-500/20 text-red-400 border-red-500/30 mx-auto mb-3">
              {isTrial ? "Teste Grátis Expirado" : "Plano Expirado"}
            </Badge>
            
            <CardTitle className="text-2xl text-white">
              Olá, {userName}!
            </CardTitle>
            <CardDescription className="text-slate-400 text-base">
              {isTrial 
                ? "Seu período de teste grátis terminou." 
                : "Seu plano expirou."}
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-6">
            <Alert className="bg-orange-500/10 border-orange-500/30">
              <Clock className="h-4 w-4 text-orange-400" />
              <AlertTitle className="text-orange-400">Acesso Bloqueado</AlertTitle>
              <AlertDescription className="text-orange-300/80">
                Seu acesso expirou em <strong>{formatDate(expiredDate)}</strong>. 
                Para continuar usando a plataforma, é necessário renovar ou fazer upgrade do seu plano.
              </AlertDescription>
            </Alert>

            <Alert className="bg-red-500/10 border-red-500/30">
              <Trash2 className="h-4 w-4 text-red-400" />
              <AlertTitle className="text-red-400">Atenção: Exclusão Permanente de Dados</AlertTitle>
              <AlertDescription className="text-red-300/80 space-y-2">
                {daysUntilDelete > 0 ? (
                  <>
                    <p>
                      Em <strong className="text-red-400">{daysUntilDelete} dias</strong> ({formatDate(deleteDate)}), 
                      todos os seus dados serão excluídos permanentemente:
                    </p>
                    <ul className="list-disc list-inside text-sm space-y-1 ml-1">
                      <li>Webinários e configurações</li>
                      <li>Vídeos enviados</li>
                      <li>Roteiros e mensagens</li>
                      <li>Comentários simulados</li>
                      <li>Imagens e arquivos</li>
                    </ul>
                    <p className="text-xs text-red-400/80 pt-1">
                      Esta ação é irreversível. Renove seu plano para manter seus dados.
                    </p>
                  </>
                ) : (
                  <>
                    <p>
                      <strong className="text-red-400">Prazo de exclusão atingido!</strong> Seus dados 
                      (webinários, vídeos, roteiros, comentários e arquivos) podem ser excluídos a qualquer momento.
                    </p>
                    <p className="text-xs text-red-400/80">
                      Renove agora para evitar a perda permanente de todo seu conteúdo.
                    </p>
                  </>
                )}
              </AlertDescription>
            </Alert>

            {/* AI Features - What you're missing */}
            <div className="p-4 rounded-xl bg-gradient-to-r from-violet-500/10 via-purple-500/10 to-emerald-500/10 border border-violet-500/20" data-testid="section-ai-features-expired">
              <div className="flex items-center gap-2 mb-3">
                <Bot className="w-5 h-5 text-violet-400" />
                <span className="text-white font-semibold text-sm" data-testid="text-ai-features-title">Ferramentas IA Exclusivas incluídas:</span>
              </div>
              <div className="grid grid-cols-1 gap-2">
                <div className="flex items-center gap-2 text-sm" data-testid="text-ai-script-generator">
                  <FileText className="w-4 h-4 text-violet-400 flex-shrink-0" />
                  <span className="text-slate-300">Gerador de Roteiro IA</span>
                </div>
                <div className="flex items-center gap-2 text-sm" data-testid="text-ai-message-generator">
                  <Mail className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span className="text-slate-300">Gerador de Mensagens IA</span>
                </div>
                <div className="flex items-center gap-2 text-sm" data-testid="text-ai-transcription">
                  <Mic className="w-4 h-4 text-rose-400 flex-shrink-0" />
                  <span className="text-slate-300">Transcrição Automática</span>
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-2" data-testid="text-ai-differentiator">
                Diferenciais exclusivos que nenhum concorrente oferece
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <Button 
                size="lg"
                className="w-full h-14 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-lg font-semibold"
                onClick={() => setLocation("/admin/subscription")}
                data-testid="button-renew-plan"
              >
                <CreditCard className="w-5 h-5 mr-2" />
                Renovar Meu Plano
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>

              <Button 
                size="lg"
                className="w-full h-12 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 font-semibold"
                onClick={() => setLocation("/checkout")}
                data-testid="button-upgrade-plan"
              >
                <Crown className="w-5 h-5 mr-2" />
                Fazer Upgrade de Plano
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
              Dúvidas? Entre em contato com nosso suporte.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
