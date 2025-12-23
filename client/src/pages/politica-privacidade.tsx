import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { useEffect } from "react";
import logoAutoWebinar from "@assets/logo-autowebinar_1764493901947.png";

export default function PoliticaPrivacidadePage() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    document.title = "Política de Privacidade | AutoWebinar";
  }, []);

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
          <h1 className="text-3xl sm:text-4xl font-bold mb-8 text-white" data-testid="text-privacy-title">Política de Privacidade</h1>
          
          <div className="prose prose-invert max-w-none space-y-6">
            <p className="text-slate-400">
              Última atualização: {new Date().toLocaleDateString('pt-BR')}
            </p>

            <section>
              <h2 className="text-xl font-semibold mt-8 mb-4 text-white">1. Introdução</h2>
              <p className="text-slate-300">
                A AutoWebinar ("nós", "nosso" ou "empresa") está comprometida em proteger a privacidade dos usuários 
                de nossa plataforma de webinars automatizados. Esta Política de Privacidade descreve como coletamos, 
                usamos, armazenamos e protegemos suas informações pessoais.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-8 mb-4 text-white">2. Informações que Coletamos</h2>
              <p className="text-slate-300">Podemos coletar os seguintes tipos de informações:</p>
              <ul className="list-disc pl-6 space-y-2 text-slate-300">
                <li><strong className="text-white">Informações de conta:</strong> Nome, email, senha (criptografada), telefone</li>
                <li><strong className="text-white">Dados de uso:</strong> Logs de acesso, preferências, interações com webinars</li>
                <li><strong className="text-white">Informações de pagamento:</strong> Processadas por gateways seguros (Stripe, Mercado Pago)</li>
                <li><strong className="text-white">Dados do Google Calendar:</strong> Quando você conecta sua conta Google, acessamos suas agendas para permitir agendamentos automáticos através de nossos agentes de IA</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-8 mb-4 text-white">3. Uso de Dados do Google</h2>
              <p className="text-slate-300">
                Quando você conecta sua conta Google à nossa plataforma, utilizamos os seguintes escopos de acesso:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-slate-300">
                <li><strong className="text-white">Google Calendar:</strong> Para criar, visualizar e gerenciar eventos de agendamento</li>
              </ul>
              <p className="mt-4 text-slate-300">
                <strong className="text-white">Importante:</strong> Nosso uso e transferência de informações recebidas das APIs do Google 
                estão em conformidade com a{" "}
                <a href="https://developers.google.com/terms/api-services-user-data-policy" 
                   className="text-blue-400 hover:text-blue-300 underline" 
                   target="_blank" 
                   rel="noopener noreferrer">
                  Política de Dados do Usuário dos Serviços de API do Google
                </a>, incluindo os requisitos de Uso Limitado.
              </p>
              <p className="mt-4 text-slate-300">
                Especificamente, nós:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-slate-300">
                <li>Usamos os dados do Google apenas para fornecer funcionalidades de agendamento</li>
                <li>Não vendemos dados do Google para terceiros</li>
                <li>Não usamos dados do Google para publicidade</li>
                <li>Armazenamos tokens de acesso de forma segura e criptografada</li>
                <li>Permitimos que você revogue o acesso a qualquer momento</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-8 mb-4 text-white">4. Como Usamos Suas Informações</h2>
              <ul className="list-disc pl-6 space-y-2 text-slate-300">
                <li>Fornecer e melhorar nossos serviços de webinars</li>
                <li>Processar pagamentos e gerenciar assinaturas</li>
                <li>Enviar comunicações importantes sobre sua conta</li>
                <li>Criar agendamentos automáticos via agentes de IA</li>
                <li>Garantir a segurança da plataforma</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-8 mb-4 text-white">5. Compartilhamento de Dados</h2>
              <p className="text-slate-300">
                Não vendemos suas informações pessoais. Podemos compartilhar dados apenas com:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-slate-300">
                <li>Processadores de pagamento (Stripe, Mercado Pago) para transações</li>
                <li>Provedores de infraestrutura (hospedagem, banco de dados) sob contratos de confidencialidade</li>
                <li>Autoridades legais quando exigido por lei</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-8 mb-4 text-white">6. Segurança dos Dados</h2>
              <p className="text-slate-300">
                Implementamos medidas de segurança técnicas e organizacionais para proteger seus dados, incluindo:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-slate-300">
                <li>Criptografia de dados em trânsito (HTTPS/TLS)</li>
                <li>Criptografia de senhas com bcrypt</li>
                <li>Tokens de acesso armazenados de forma segura</li>
                <li>Acesso restrito a dados pessoais</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-8 mb-4 text-white">7. Seus Direitos</h2>
              <p className="text-slate-300">Você tem direito a:</p>
              <ul className="list-disc pl-6 space-y-2 text-slate-300">
                <li>Acessar seus dados pessoais</li>
                <li>Corrigir informações incorretas</li>
                <li>Solicitar exclusão de seus dados</li>
                <li>Revogar acesso ao Google Calendar a qualquer momento</li>
                <li>Exportar seus dados</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-8 mb-4 text-white">8. Retenção de Dados</h2>
              <p className="text-slate-300">
                Mantemos seus dados enquanto sua conta estiver ativa ou conforme necessário para fornecer nossos serviços. 
                Após o encerramento da conta, seus dados serão excluídos em até 30 dias, exceto quando a retenção 
                for exigida por lei.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-8 mb-4 text-white">9. Contato</h2>
              <p className="text-slate-300">
                Para questões sobre privacidade, entre em contato:
              </p>
              <p className="mt-2 text-slate-300">
                <strong className="text-white">Email:</strong> suporte@autowebinar.com.br
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-8 mb-4 text-white">10. Alterações nesta Política</h2>
              <p className="text-slate-300">
                Podemos atualizar esta política periodicamente. Notificaremos sobre mudanças significativas 
                por email ou através de aviso em nossa plataforma.
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
                <li><button onClick={() => setLocation("/privacidade")} className="hover:text-white transition-colors text-blue-400">Política de Privacidade</button></li>
                <li><button onClick={() => setLocation("/termos")} className="hover:text-white transition-colors">Termos de Serviço</button></li>
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
