import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import bibliaPlusLogo from "@assets/biblia-plus-logo.jpeg";

export default function WebinarPage() {
  const [showOffer, setShowOffer] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [userName, setUserName] = useState("");
  const [userCity, setUserCity] = useState("");
  const [userState, setUserState] = useState("");
  const [userInfo, setUserInfo] = useState<{ name: string; city: string; state: string } | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("userInfo");
    if (stored) {
      const parsed = JSON.parse(stored);
      setUserInfo(parsed);
    } else {
      setShowUserModal(true);
    }
  }, []);

  const handleSaveUserInfo = () => {
    if (!userName.trim() || !userCity.trim() || !userState.trim()) {
      alert("Preencha todos os campos!");
      return;
    }
    const info = { name: userName, city: userCity, state: userState };
    localStorage.setItem("userInfo", JSON.stringify(info));
    setUserInfo(info);
    setShowUserModal(false);
  };
  
  const benefits = [
    "Estudos versículo por versículo dos 4 Evangelhos",
    "Aula ao vivo toda segunda-feira",
    "Acesso a mais de 400 aulas sobre várias passagens da Bíblia",
    "Acompanhamento do teólogo para todas as suas dúvidas"
  ];

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowOffer(true);
    }, 10473000); // 174 minutos e 33 segundos

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#4A8BB5" }}>
      {showUserModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl p-8 max-w-md w-full">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Bem-vindo ao Webinar! 👋</h2>
            <p className="text-gray-600 mb-6">Por favor, identifique-se para participar do chat:</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Nome</label>
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="Seu nome"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  data-testid="input-user-name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Cidade</label>
                <input
                  type="text"
                  value={userCity}
                  onChange={(e) => setUserCity(e.target.value)}
                  placeholder="Ex: São Paulo"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  data-testid="input-user-city"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Estado (UF)</label>
                <input
                  type="text"
                  value={userState}
                  onChange={(e) => setUserState(e.target.value.toUpperCase().slice(0, 2))}
                  placeholder="Ex: SP"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  data-testid="input-user-state"
                />
              </div>
              <Button
                onClick={handleSaveUserInfo}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                data-testid="button-save-user-info"
              >
                Continuar
              </Button>
            </div>
          </div>
        </div>
      )}
      <section className="container mx-auto py-6 md:py-16">
        <div className="mx-auto px-3 md:px-4" style={{ maxWidth: "960px" }}>
          <div className="text-center mb-10">
            <div 
              className="inline-block px-8 md:px-12 py-6 md:py-8 rounded-2xl"
              style={{
                background: "linear-gradient(135deg, rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0.4) 100%)",
                backdropFilter: "blur(15px)",
                border: "3px solid rgba(255, 215, 0, 0.4)",
                boxShadow: "0 20px 60px rgba(0, 0, 0, 0.5), 0 0 40px rgba(255, 215, 0, 0.2)"
              }}
            >
              <div 
                className="inline-block px-3 py-1 mb-4 rounded-full text-xs md:text-sm font-bold"
                style={{
                  background: "linear-gradient(90deg, #FFD700 0%, #FFA500 100%)",
                  color: "#000000",
                  boxShadow: "0 4px 15px rgba(255, 215, 0, 0.5)"
                }}
              >
                Aulão
              </div>
              <h1 
                className="text-2xl md:text-5xl lg:text-6xl font-extrabold leading-tight px-2" 
                style={{ 
                  background: "linear-gradient(180deg, #FFFFFF 0%, #FFD700 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  textShadow: "0 4px 20px rgba(255, 215, 0, 0.3)",
                  filter: "drop-shadow(0 4px 8px rgba(0, 0, 0, 0.8))"
                }} 
                data-testid="text-title"
              >
                COMO LER E ENTENDER A BÍBLIA DE VERDADE
              </h1>
            </div>
          </div>
          <div id="video-player" className="relative w-full mx-auto mb-12 -mx-3 md:mx-0" style={{ maxWidth: "100%", backgroundColor: "#ffffff", borderRadius: "12px", border: "2px solid rgba(255, 255, 255, 0.4)" }}>
            <div className="relative w-full border-4 border-white rounded-xl overflow-hidden" style={{ 
              paddingBottom: "180%",
              boxShadow: "0 10px 25px rgba(0, 0, 0, 0.15)"
            }}>
              <style>{`
                #video-player {
                  padding: 0;
                  background-color: transparent;
                }
                #video-player > div {
                  border: none;
                }
                @media (min-width: 768px) {
                  #video-player > div {
                    padding-bottom: 56.25% !important;
                    height: auto;
                    border: 3px solid white;
                  }
                }
              `}</style>
              <iframe
                src="https://webinar2.builderall.com/embed/41000/p2XK33IQ5R"
                className="absolute top-0 left-0 w-full h-full"
                frameBorder="0"
                allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                data-testid="iframe-webinar"
              />
            </div>
          </div>

          {/* Seção de Oferta Premium */}
          {showOffer && (
            <div 
              className="text-center px-6 md:px-12 py-10 md:py-16 rounded-2xl"
              style={{ 
                maxWidth: "900px", 
                margin: "0 auto",
                background: "linear-gradient(135deg, rgba(0, 0, 0, 0.5) 0%, rgba(0, 0, 0, 0.4) 100%)",
                backdropFilter: "blur(10px)",
                border: "2px solid rgba(255, 255, 255, 0.3)",
                boxShadow: "0 20px 60px rgba(0, 0, 0, 0.4)"
              }}
            >
            <div 
              className="inline-block px-4 py-2 mb-6 rounded-full text-sm font-bold"
              style={{ 
                backgroundColor: "#FFD700",
                color: "#2c3e50",
                boxShadow: "0 4px 15px rgba(255, 215, 0, 0.4)"
              }}
              data-testid="badge-special"
            >
              🎁 OFERTA ESPECIAL 🎁
            </div>

            <h2 
              className="text-2xl md:text-4xl font-bold mb-4" 
              style={{ color: "#ffffff", textShadow: "3px 3px 6px rgba(0,0,0,0.8)" }}
              data-testid="text-offer-title"
            >
              INSCRIÇÕES ABERTAS PARA OS CURSOS BÍBLICOS 😊
            </h2>
            
            <p 
              className="text-base md:text-lg mb-6 font-medium" 
              style={{ color: "#ffffff", textShadow: "2px 2px 4px rgba(0,0,0,0.8)" }}
              data-testid="text-offer-subtitle"
            >
              A partir de agora você poderá ser meu aluno, minha aluna na
            </p>

            <div className="mb-10" data-testid="badge-biblia-plus">
              <img 
                src={bibliaPlusLogo} 
                alt="Bíblia+" 
                className="mx-auto rounded-lg"
                style={{ 
                  maxWidth: "280px",
                  boxShadow: "0 8px 25px rgba(227, 30, 36, 0.5)"
                }}
              />
            </div>

            <div 
              className="space-y-4 mb-10 text-left max-w-2xl mx-auto p-6 rounded-xl"
              style={{ 
                backgroundColor: "rgba(0, 0, 0, 0.4)",
                backdropFilter: "blur(5px)",
                border: "1px solid rgba(255, 255, 255, 0.2)"
              }}
            >
              {benefits.map((benefit, index) => (
                <div 
                  key={index} 
                  className="flex items-start gap-4"
                  data-testid={`benefit-item-${index}`}
                >
                  <div 
                    className="flex-shrink-0 rounded-full p-1.5"
                    style={{ backgroundColor: "#90EE90" }}
                  >
                    <Check 
                      className="h-5 w-5" 
                      style={{ color: "#000000", strokeWidth: 4 }}
                      data-testid={`icon-check-${index}`}
                    />
                  </div>
                  <span 
                    className="text-base md:text-lg font-semibold"
                    style={{ color: "#ffffff", textShadow: "1px 1px 3px rgba(0,0,0,0.8)" }}
                    data-testid={`text-benefit-${index}`}
                  >
                    {benefit}
                  </span>
                </div>
              ))}
            </div>

            <div 
              className="p-6 mb-10 rounded-xl"
              style={{ 
                backgroundColor: "rgba(255, 215, 0, 0.25)",
                border: "2px solid rgba(255, 215, 0, 0.6)"
              }}
            >
              <p 
                className="text-lg md:text-xl font-bold" 
                style={{ color: "#ffffff", textShadow: "2px 2px 4px rgba(0,0,0,0.9)" }}
                data-testid="text-pricing"
              >
                💳 O valor da inscrição é <strong style={{ color: "#FFD700", textShadow: "2px 2px 6px rgba(0,0,0,1)" }}>12x R$ 59,90</strong> no cartão<br />
                ou um valor único de <strong style={{ color: "#FFD700", textShadow: "2px 2px 6px rgba(0,0,0,1)" }}>R$ 660,00</strong> por 12 meses de estudos.
              </p>
            </div>

            <a 
              href="https://clkdmg.site/pay/curso-biblico-perpetuo-a-vistacartao"
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full"
            >
              <Button
                size="lg"
                className="w-full text-base md:text-2xl px-6 md:px-12 py-6 md:py-8 font-extrabold rounded-xl transition-all duration-300 hover:scale-105 uppercase tracking-wide"
                style={{ 
                  background: "linear-gradient(135deg, #27AE60 0%, #2ECC71 100%)",
                  color: "#FFFFFF",
                  minHeight: "60px",
                  boxShadow: "0 15px 40px rgba(46, 204, 113, 0.7), inset 0 2px 0 rgba(255,255,255,0.3)",
                  border: "4px solid rgba(255, 255, 255, 0.5)",
                  textShadow: "2px 2px 6px rgba(0,0,0,0.8), 0 0 20px rgba(0,0,0,0.5)"
                }}
                data-testid="button-cta"
              >
                FAZER MINHA INSCRIÇÃO AGORA
              </Button>
            </a>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
