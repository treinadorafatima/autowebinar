import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import logoAutoWebinar from "@assets/logo-autowebinar_1764493901947.png";

export default function TermosServicoPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800/50 bg-slate-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <Link href="/">
            <img 
              src={logoAutoWebinar} 
              alt="AutoWebinar" 
              className="h-8 w-auto cursor-pointer"
            />
          </Link>
          <Link href="/">
            <Button variant="ghost" className="gap-2 text-slate-300 hover:text-white" data-testid="button-back-home">
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl sm:text-4xl font-bold mb-8 text-white" data-testid="text-terms-title">Termos de Serviço</h1>
          
          <div className="prose prose-invert max-w-none space-y-6">
            <p className="text-slate-400">
              Última atualização: {new Date().toLocaleDateString('pt-BR')}
            </p>

            <section>
              <h2 className="text-xl font-semibold mt-8 mb-4 text-white">1. Aceitação dos Termos</h2>
              <p className="text-slate-300">
                Ao acessar ou usar a plataforma AutoWebinar, você concorda em cumprir estes Termos de Serviço. 
                Se você não concordar com algum termo, não utilize nossos serviços.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-8 mb-4 text-white">2. Descrição do Serviço</h2>
              <p className="text-slate-300">
                A AutoWebinar é uma plataforma SaaS (Software as a Service) que oferece:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-slate-300">
                <li>Criação e hospedagem de webinars automatizados</li>
                <li>Agentes de IA para atendimento via WhatsApp</li>
                <li>Integração com Google Calendar para agendamentos automáticos</li>
                <li>Ferramentas de marketing por email e WhatsApp</li>
                <li>Sistema de afiliados e checkout integrado</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-8 mb-4 text-white">3. Conta de Usuário</h2>
              <p className="text-slate-300">Para usar nossos serviços, você deve:</p>
              <ul className="list-disc pl-6 space-y-2 text-slate-300">
                <li>Ter pelo menos 18 anos de idade</li>
                <li>Fornecer informações precisas e atualizadas</li>
                <li>Manter a confidencialidade de suas credenciais de acesso</li>
                <li>Ser responsável por todas as atividades em sua conta</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-8 mb-4 text-white">4. Uso Aceitável</h2>
              <p className="text-slate-300">Você concorda em não usar nossa plataforma para:</p>
              <ul className="list-disc pl-6 space-y-2 text-slate-300">
                <li>Violar leis ou regulamentos aplicáveis</li>
                <li>Enviar spam ou conteúdo não solicitado</li>
                <li>Distribuir malware ou código malicioso</li>
                <li>Infringir direitos de propriedade intelectual</li>
                <li>Promover conteúdo ilegal, fraudulento ou enganoso</li>
                <li>Abusar de recursos do sistema ou APIs</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-8 mb-4 text-white">5. Integrações de Terceiros</h2>
              <p className="text-slate-300">
                Nossa plataforma integra-se com serviços de terceiros como Google Calendar, WhatsApp, Stripe 
                e Mercado Pago. O uso dessas integrações está sujeito aos termos de serviço de cada provedor.
              </p>
              <p className="mt-4 text-slate-300">
                Ao conectar sua conta Google, você autoriza a AutoWebinar a acessar suas agendas do Google Calendar 
                exclusivamente para funcionalidades de agendamento automático.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-8 mb-4 text-white">6. Pagamentos e Assinaturas</h2>
              <ul className="list-disc pl-6 space-y-2 text-slate-300">
                <li>Os preços são exibidos em Reais (BRL) e incluem impostos aplicáveis</li>
                <li>Assinaturas são renovadas automaticamente até o cancelamento</li>
                <li>Cancelamentos podem ser feitos a qualquer momento pelo painel</li>
                <li>Não oferecemos reembolsos por períodos já utilizados</li>
                <li>Reservamo-nos o direito de alterar preços com aviso prévio de 30 dias</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-8 mb-4 text-white">7. Propriedade Intelectual</h2>
              <p className="text-slate-300">
                A plataforma AutoWebinar, incluindo código, design, logos e conteúdo, é propriedade da empresa. 
                Você mantém a propriedade do conteúdo que criar usando nossos serviços.
              </p>
              <p className="mt-4 text-slate-300">
                Ao usar nossa plataforma, você nos concede uma licença limitada para hospedar, exibir e 
                transmitir seu conteúdo conforme necessário para fornecer os serviços.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-8 mb-4 text-white">8. Limitação de Responsabilidade</h2>
              <p className="text-slate-300">
                Na extensão máxima permitida por lei, a AutoWebinar não será responsável por:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-slate-300">
                <li>Danos indiretos, incidentais ou consequenciais</li>
                <li>Perda de dados, lucros ou oportunidades de negócio</li>
                <li>Interrupções temporárias de serviço</li>
                <li>Ações de terceiros ou integrações externas</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-8 mb-4 text-white">9. Disponibilidade do Serviço</h2>
              <p className="text-slate-300">
                Nos esforçamos para manter o serviço disponível 24/7, mas não garantimos disponibilidade 
                ininterrupta. Manutenções programadas serão comunicadas com antecedência quando possível.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-8 mb-4 text-white">10. Encerramento</h2>
              <p className="text-slate-300">
                Podemos suspender ou encerrar sua conta se você violar estes termos. Você pode encerrar 
                sua conta a qualquer momento através das configurações do painel.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-8 mb-4 text-white">11. Alterações nos Termos</h2>
              <p className="text-slate-300">
                Podemos modificar estes termos a qualquer momento. Alterações significativas serão comunicadas 
                por email ou aviso na plataforma com pelo menos 30 dias de antecedência.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-8 mb-4 text-white">12. Lei Aplicável</h2>
              <p className="text-slate-300">
                Estes termos são regidos pelas leis da República Federativa do Brasil. Qualquer disputa 
                será resolvida no foro da comarca de São Paulo, SP.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-8 mb-4 text-white">13. Contato</h2>
              <p className="text-slate-300">
                Para questões sobre estes termos:
              </p>
              <p className="mt-2 text-slate-300">
                <strong className="text-white">Email:</strong> suporte@autowebinar.com.br
              </p>
            </section>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/50 bg-slate-950/80 mt-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="mb-4">
                <img 
                  src={logoAutoWebinar} 
                  alt="AutoWebinar" 
                  className="h-10 w-auto"
                />
              </div>
              <p className="text-slate-400 text-sm">
                A plataforma brasileira de webinários automáticos mais completa do mercado.
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Produto</h4>
              <ul className="space-y-2 text-slate-400 text-sm">
                <li><button onClick={() => setLocation("/login")} className="hover:text-white transition-colors">Dashboard</button></li>
                <li><button onClick={() => setLocation("/")} className="hover:text-white transition-colors">Início</button></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Empresa</h4>
              <ul className="space-y-2 text-slate-400 text-sm">
                <li><a href="mailto:contato@autowebinar.com.br" className="hover:text-white transition-colors">contato@autowebinar.com.br</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-slate-400 text-sm">
                <li><button onClick={() => setLocation("/privacidade")} className="hover:text-white transition-colors">Política de Privacidade</button></li>
                <li><button onClick={() => setLocation("/termos")} className="hover:text-white transition-colors text-blue-400">Termos de Serviço</button></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-800/50 pt-8 text-center text-slate-500 text-sm">
            <p>© {new Date().getFullYear()} AutoWebinar. Todos os direitos reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
