import { AlertTriangle, Sparkles, Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

interface FeatureBlockedProps {
  featureName: string;
  description: string;
}

export function FeatureBlocked({ featureName, description }: FeatureBlockedProps) {
  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-200px)] p-6" data-testid="container-feature-blocked">
      <Card className="max-w-md w-full border-yellow-500/30 bg-yellow-500/5" data-testid="card-feature-blocked">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 p-3 rounded-full bg-yellow-500/10 w-fit" data-testid="icon-feature-locked">
            <Lock className="h-8 w-8 text-yellow-500" />
          </div>
          <CardTitle className="text-xl" data-testid="text-feature-name">{featureName}</CardTitle>
          <CardDescription className="text-muted-foreground" data-testid="text-feature-description">
            {description}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 rounded-lg bg-gradient-to-r from-violet-500/10 via-purple-500/10 to-emerald-500/10 border border-violet-500/20" data-testid="section-upgrade-benefits">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-violet-500" />
              <span className="text-sm font-medium" data-testid="text-upgrade-title">Disponível no plano Avançado ou superior</span>
            </div>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li data-testid="text-benefit-designer">Designer IA para criar páginas</li>
              <li data-testid="text-benefit-scripts">Roteirizador com IA avançada</li>
              <li data-testid="text-benefit-messages">Gerador de mensagens automático</li>
              <li data-testid="text-benefit-transcription">Transcrição de vídeos com IA</li>
            </ul>
          </div>
          
          <div className="flex flex-col gap-2">
            <Link href="/admin/upgrade">
              <Button className="w-full" data-testid="button-upgrade-plan">
                <Sparkles className="h-4 w-4 mr-2" />
                Fazer Upgrade do Plano
              </Button>
            </Link>
            <Link href="/admin">
              <Button variant="outline" className="w-full" data-testid="button-back-dashboard">
                Voltar ao Painel
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
