import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function TermosServicoPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <Link href="/">
          <Button variant="ghost" className="mb-8 gap-2" data-testid="button-back-home">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
        </Link>

        <h1 className="text-3xl font-bold mb-8" data-testid="text-terms-title">Termos de Serviço</h1>
        
        <div className="prose prose-slate dark:prose-invert max-w-none space-y-6">
          <p className="text-muted-foreground">
            Última atualização: {new Date().toLocaleDateString('pt-BR')}
          </p>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-4">1. Aceitação dos Termos</h2>
            <p>
              Ao acessar ou usar a plataforma AutoWebinar, você concorda em cumprir estes Termos de Serviço. 
              Se você não concordar com algum termo, não utilize nossos serviços.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-4">2. Descrição do Serviço</h2>
            <p>
              A AutoWebinar é uma plataforma SaaS (Software as a Service) que oferece:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Criação e hospedagem de webinars automatizados</li>
              <li>Agentes de IA para atendimento via WhatsApp</li>
              <li>Integração com Google Calendar para agendamentos automáticos</li>
              <li>Ferramentas de marketing por email e WhatsApp</li>
              <li>Sistema de afiliados e checkout integrado</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-4">3. Conta de Usuário</h2>
            <p>Para usar nossos serviços, você deve:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Ter pelo menos 18 anos de idade</li>
              <li>Fornecer informações precisas e atualizadas</li>
              <li>Manter a confidencialidade de suas credenciais de acesso</li>
              <li>Ser responsável por todas as atividades em sua conta</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-4">4. Uso Aceitável</h2>
            <p>Você concorda em não usar nossa plataforma para:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Violar leis ou regulamentos aplicáveis</li>
              <li>Enviar spam ou conteúdo não solicitado</li>
              <li>Distribuir malware ou código malicioso</li>
              <li>Infringir direitos de propriedade intelectual</li>
              <li>Promover conteúdo ilegal, fraudulento ou enganoso</li>
              <li>Abusar de recursos do sistema ou APIs</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-4">5. Integrações de Terceiros</h2>
            <p>
              Nossa plataforma integra-se com serviços de terceiros como Google Calendar, WhatsApp, Stripe 
              e Mercado Pago. O uso dessas integrações está sujeito aos termos de serviço de cada provedor.
            </p>
            <p className="mt-4">
              Ao conectar sua conta Google, você autoriza a AutoWebinar a acessar suas agendas do Google Calendar 
              exclusivamente para funcionalidades de agendamento automático.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-4">6. Pagamentos e Assinaturas</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Os preços são exibidos em Reais (BRL) e incluem impostos aplicáveis</li>
              <li>Assinaturas são renovadas automaticamente até o cancelamento</li>
              <li>Cancelamentos podem ser feitos a qualquer momento pelo painel</li>
              <li>Não oferecemos reembolsos por períodos já utilizados</li>
              <li>Reservamo-nos o direito de alterar preços com aviso prévio de 30 dias</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-4">7. Propriedade Intelectual</h2>
            <p>
              A plataforma AutoWebinar, incluindo código, design, logos e conteúdo, é propriedade da empresa. 
              Você mantém a propriedade do conteúdo que criar usando nossos serviços.
            </p>
            <p className="mt-4">
              Ao usar nossa plataforma, você nos concede uma licença limitada para hospedar, exibir e 
              transmitir seu conteúdo conforme necessário para fornecer os serviços.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-4">8. Limitação de Responsabilidade</h2>
            <p>
              Na extensão máxima permitida por lei, a AutoWebinar não será responsável por:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Danos indiretos, incidentais ou consequenciais</li>
              <li>Perda de dados, lucros ou oportunidades de negócio</li>
              <li>Interrupções temporárias de serviço</li>
              <li>Ações de terceiros ou integrações externas</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-4">9. Disponibilidade do Serviço</h2>
            <p>
              Nos esforçamos para manter o serviço disponível 24/7, mas não garantimos disponibilidade 
              ininterrupta. Manutenções programadas serão comunicadas com antecedência quando possível.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-4">10. Encerramento</h2>
            <p>
              Podemos suspender ou encerrar sua conta se você violar estes termos. Você pode encerrar 
              sua conta a qualquer momento através das configurações do painel.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-4">11. Alterações nos Termos</h2>
            <p>
              Podemos modificar estes termos a qualquer momento. Alterações significativas serão comunicadas 
              por email ou aviso na plataforma com pelo menos 30 dias de antecedência.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-4">12. Lei Aplicável</h2>
            <p>
              Estes termos são regidos pelas leis da República Federativa do Brasil. Qualquer disputa 
              será resolvida no foro da comarca de São Paulo, SP.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-4">13. Contato</h2>
            <p>
              Para questões sobre estes termos:
            </p>
            <p className="mt-2">
              <strong>Email:</strong> suporte@autowebinar.com.br
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
