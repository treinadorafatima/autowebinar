import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, AlertCircle, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function ClientCalendarConnect() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const agentId = new URLSearchParams(window.location.search).get("agentId");
  const clientPhone = new URLSearchParams(window.location.search).get("clientPhone");
  const connected = new URLSearchParams(window.location.search).get("calendar") === "connected";
  const error = new URLSearchParams(window.location.search).get("calendar") === "error";
  const message = new URLSearchParams(window.location.search).get("message");

  useEffect(() => {
    if (connected) {
      setStatus("success");
      toast({ title: "Calendário conectado com sucesso!" });
      setTimeout(() => {
        setLocation(`/?agentId=${agentId}`);
      }, 3000);
    } else if (error) {
      setStatus("error");
      toast({ title: "Erro ao conectar", description: message || "", variant: "destructive" });
    }
  }, [connected, error, message, agentId, setLocation, toast]);

  const handleConnect = async () => {
    if (!agentId || !clientPhone) {
      toast({ title: "Parâmetros inválidos", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    setStatus("loading");
    try {
      const response = await fetch("/api/client/google/auth-url", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) throw new Error("Erro ao gerar URL de autenticação");

      const { authUrl } = await response.json();
      window.location.href = authUrl;
    } catch (err: any) {
      setStatus("error");
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-secondary/5 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-primary/10 p-3 rounded-full">
              <Calendar className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle>Conectar Google Calendar</CardTitle>
          <CardDescription>
            Autorize a conexão com sua conta Google para agendar compromissos
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {status === "idle" && (
            <>
              <div className="space-y-3 text-sm">
                <div className="flex gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span>Agende compromissos diretamente no seu calendário</span>
                </div>
                <div className="flex gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span>Sincronização automática com Google Calendar</span>
                </div>
                <div className="flex gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span>Você mantém controle total dos seus dados</span>
                </div>
              </div>

              <Button 
                onClick={handleConnect}
                disabled={isLoading}
                size="lg"
                className="w-full"
                data-testid="button-connect-google"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Conectando...
                  </>
                ) : (
                  "Conectar com Google"
                )}
              </Button>
            </>
          )}

          {status === "loading" && (
            <div className="text-center py-8">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary mb-3" />
              <p className="text-sm text-muted-foreground">Aguarde redirecionamento...</p>
            </div>
          )}

          {status === "success" && (
            <div className="text-center py-8">
              <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-3" />
              <p className="font-medium mb-1">Calendário conectado!</p>
              <p className="text-sm text-muted-foreground mb-4">
                Você será redirecionado em alguns segundos...
              </p>
              <Button
                variant="outline"
                onClick={() => setLocation(`/?agentId=${agentId}`)}
                data-testid="button-continue"
              >
                Continuar
              </Button>
            </div>
          )}

          {status === "error" && (
            <div className="text-center py-8">
              <AlertCircle className="h-12 w-12 text-red-600 mx-auto mb-3" />
              <p className="font-medium mb-1">Erro na autenticação</p>
              <p className="text-sm text-muted-foreground mb-4">
                {message || "Não foi possível conectar o calendário"}
              </p>
              <Button
                onClick={handleConnect}
                disabled={isLoading}
                data-testid="button-retry"
              >
                Tentar Novamente
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
