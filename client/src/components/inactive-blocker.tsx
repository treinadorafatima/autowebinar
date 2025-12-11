import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { 
  UserX, 
  LogOut,
  Mail,
  Shield,
  Check
} from "lucide-react";
import logoImage from "@assets/autowebinar-logo.png";

interface InactiveBlockerProps {
  userName: string;
  userEmail: string;
  onLogout: () => void;
}

export function InactiveBlocker({ 
  userName, 
  userEmail,
  onLogout 
}: InactiveBlockerProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-red-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-slate-500/5 rounded-full blur-3xl" />
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
              <UserX className="w-8 h-8 text-red-400" />
            </div>
            
            <Badge className="bg-red-500/20 text-red-400 border-red-500/30 mx-auto mb-3">
              Conta Desativada
            </Badge>
            
            <CardTitle className="text-2xl text-white">
              Ola, {userName}!
            </CardTitle>
            <CardDescription className="text-slate-400 text-base">
              Sua conta foi desativada pelo administrador
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-6">
            <Alert className="bg-red-500/10 border-red-500/30">
              <UserX className="h-4 w-4 text-red-400" />
              <AlertTitle className="text-red-400">Acesso Suspenso</AlertTitle>
              <AlertDescription className="text-red-300/80">
                Sua conta foi desativada e voce nao pode acessar a plataforma no momento. 
                Entre em contato com o suporte para mais informacoes.
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
                  <span>Seus webinarios e configuracoes estao salvos</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span>Seus videos permanecem armazenados</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span>Acesso sera restaurado quando a conta for reativada</span>
                </li>
              </ul>
            </div>

            <div className="p-4 rounded-xl bg-slate-700/50 border border-slate-600/30">
              <p className="text-slate-400 text-sm mb-2">Entre em contato:</p>
              <p className="text-slate-300 text-sm">
                Envie um email para nosso suporte explicando sua situacao. 
                Responderemos o mais breve possivel.
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <Button 
                size="lg"
                className="w-full h-14 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-lg font-semibold"
                onClick={() => window.location.href = "mailto:suporte@autowebinar.com.br?subject=Conta Desativada - " + encodeURIComponent(userEmail)}
                data-testid="button-contact-support"
              >
                <Mail className="w-5 h-5 mr-2" />
                Entrar em Contato
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
              Sua conta: {userEmail}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
