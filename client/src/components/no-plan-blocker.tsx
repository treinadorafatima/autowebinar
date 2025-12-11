import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { 
  ShoppingCart, 
  CreditCard, 
  Crown,
  ArrowRight,
  LogOut,
  Bot,
  FileText,
  Mail,
  Mic,
  Video,
  Users,
  Zap,
  Check
} from "lucide-react";
import logoImage from "@assets/autowebinar-logo.png";

interface NoPlanBlockerProps {
  userName: string;
  userEmail: string;
  onLogout: () => void;
}

export function NoPlanBlocker({ 
  userName, 
  userEmail,
  onLogout 
}: NoPlanBlockerProps) {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-lg">
        <div className="flex justify-center mb-8">
          <img 
            src={logoImage} 
            alt="AutoWebinar" 
            className="h-16 w-auto object-contain opacity-50"
          />
        </div>

        <Card className="bg-slate-800/80 border-cyan-500/30 backdrop-blur-xl shadow-2xl">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-16 h-16 rounded-full bg-cyan-500/20 flex items-center justify-center mb-4">
              <ShoppingCart className="w-8 h-8 text-cyan-400" />
            </div>
            
            <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30 mx-auto mb-3">
              Conta sem plano ativo
            </Badge>
            
            <CardTitle className="text-2xl text-white">
              Bem-vindo, {userName}!
            </CardTitle>
            <CardDescription className="text-slate-400 text-base">
              Para acessar a plataforma, escolha um plano.
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-6">
            <Alert className="bg-cyan-500/10 border-cyan-500/30">
              <CreditCard className="h-4 w-4 text-cyan-400" />
              <AlertTitle className="text-cyan-400">Acesso Pendente</AlertTitle>
              <AlertDescription className="text-cyan-300/80">
                Sua conta foi criada com sucesso! Para liberar o acesso às ferramentas, 
                escolha um dos nossos planos disponíveis.
              </AlertDescription>
            </Alert>

            <div className="p-4 rounded-xl bg-gradient-to-r from-slate-700/50 to-slate-600/50 border border-slate-600/50">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="w-5 h-5 text-yellow-400" />
                <span className="text-white font-semibold text-sm">O que você terá acesso:</span>
              </div>
              <div className="grid grid-cols-1 gap-2">
                <div className="flex items-center gap-2 text-sm">
                  <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                  <Video className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                  <span className="text-slate-300">Webinários Automatizados 24/7</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                  <Users className="w-4 h-4 text-blue-400 flex-shrink-0" />
                  <span className="text-slate-300">Chat Simulado com IA</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                  <FileText className="w-4 h-4 text-violet-400 flex-shrink-0" />
                  <span className="text-slate-300">Captura de Leads</span>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-gradient-to-r from-violet-500/10 via-purple-500/10 to-emerald-500/10 border border-violet-500/20" data-testid="section-ai-features">
              <div className="flex items-center gap-2 mb-3">
                <Bot className="w-5 h-5 text-violet-400" />
                <span className="text-white font-semibold text-sm" data-testid="text-ai-features-title">Ferramentas IA (planos Pro+):</span>
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
            </div>

            <div className="space-y-3 pt-2">
              <Button 
                size="lg"
                className="w-full h-14 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-lg font-semibold"
                onClick={() => setLocation(`/checkout?email=${encodeURIComponent(userEmail)}&nome=${encodeURIComponent(userName)}`)}
                data-testid="button-choose-plan"
              >
                <Crown className="w-5 h-5 mr-2" />
                Escolher Meu Plano
                <ArrowRight className="w-5 h-5 ml-2" />
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
