import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PoliticaPrivacidadePage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <Link href="/">
          <Button variant="ghost" className="mb-8 gap-2" data-testid="button-back-home">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
        </Link>

        <h1 className="text-3xl font-bold mb-8" data-testid="text-privacy-title">Política de Privacidade</h1>
        
        <div className="prose prose-slate dark:prose-invert max-w-none space-y-6">
          <p className="text-muted-foreground">
            Última atualização: {new Date().toLocaleDateString('pt-BR')}
          </p>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-4">1. Introdução</h2>
            <p>
              A AutoWebinar ("nós", "nosso" ou "empresa") está comprometida em proteger a privacidade dos usuários 
              de nossa plataforma de webinars automatizados. Esta Política de Privacidade descreve como coletamos, 
              usamos, armazenamos e protegemos suas informações pessoais.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-4">2. Informações que Coletamos</h2>
            <p>Podemos coletar os seguintes tipos de informações:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Informações de conta:</strong> Nome, email, senha (criptografada), telefone</li>
              <li><strong>Dados de uso:</strong> Logs de acesso, preferências, interações com webinars</li>
              <li><strong>Informações de pagamento:</strong> Processadas por gateways seguros (Stripe, Mercado Pago)</li>
              <li><strong>Dados do Google Calendar:</strong> Quando você conecta sua conta Google, acessamos suas agendas para permitir agendamentos automáticos através de nossos agentes de IA</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-4">3. Uso de Dados do Google</h2>
            <p>
              Quando você conecta sua conta Google à nossa plataforma, utilizamos os seguintes escopos de acesso:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Google Calendar:</strong> Para criar, visualizar e gerenciar eventos de agendamento</li>
            </ul>
            <p className="mt-4">
              <strong>Importante:</strong> Nosso uso e transferência de informações recebidas das APIs do Google 
              estão em conformidade com a 
              <a href="https://developers.google.com/terms/api-services-user-data-policy" 
                 className="text-primary hover:underline" 
                 target="_blank" 
                 rel="noopener noreferrer">
                Política de Dados do Usuário dos Serviços de API do Google
              </a>, incluindo os requisitos de Uso Limitado.
            </p>
            <p className="mt-4">
              Especificamente, nós:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Usamos os dados do Google apenas para fornecer funcionalidades de agendamento</li>
              <li>Não vendemos dados do Google para terceiros</li>
              <li>Não usamos dados do Google para publicidade</li>
              <li>Armazenamos tokens de acesso de forma segura e criptografada</li>
              <li>Permitimos que você revogue o acesso a qualquer momento</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-4">4. Como Usamos Suas Informações</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Fornecer e melhorar nossos serviços de webinars</li>
              <li>Processar pagamentos e gerenciar assinaturas</li>
              <li>Enviar comunicações importantes sobre sua conta</li>
              <li>Criar agendamentos automáticos via agentes de IA</li>
              <li>Garantir a segurança da plataforma</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-4">5. Compartilhamento de Dados</h2>
            <p>
              Não vendemos suas informações pessoais. Podemos compartilhar dados apenas com:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Processadores de pagamento (Stripe, Mercado Pago) para transações</li>
              <li>Provedores de infraestrutura (hospedagem, banco de dados) sob contratos de confidencialidade</li>
              <li>Autoridades legais quando exigido por lei</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-4">6. Segurança dos Dados</h2>
            <p>
              Implementamos medidas de segurança técnicas e organizacionais para proteger seus dados, incluindo:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Criptografia de dados em trânsito (HTTPS/TLS)</li>
              <li>Criptografia de senhas com bcrypt</li>
              <li>Tokens de acesso armazenados de forma segura</li>
              <li>Acesso restrito a dados pessoais</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-4">7. Seus Direitos</h2>
            <p>Você tem direito a:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Acessar seus dados pessoais</li>
              <li>Corrigir informações incorretas</li>
              <li>Solicitar exclusão de seus dados</li>
              <li>Revogar acesso ao Google Calendar a qualquer momento</li>
              <li>Exportar seus dados</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-4">8. Retenção de Dados</h2>
            <p>
              Mantemos seus dados enquanto sua conta estiver ativa ou conforme necessário para fornecer nossos serviços. 
              Após o encerramento da conta, seus dados serão excluídos em até 30 dias, exceto quando a retenção 
              for exigida por lei.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-4">9. Contato</h2>
            <p>
              Para questões sobre privacidade, entre em contato:
            </p>
            <p className="mt-2">
              <strong>Email:</strong> suporte@autowebinar.com.br
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-4">10. Alterações nesta Política</h2>
            <p>
              Podemos atualizar esta política periodicamente. Notificaremos sobre mudanças significativas 
              por email ou através de aviso em nossa plataforma.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
