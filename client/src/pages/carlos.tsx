import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function CarlosPage() {
  const benefits = [
    "Estudos versículo por versículo dos 4 Evangelhos",
    "Aula ao vivo toda segunda-feira",
    "Acesso a mais de 400 aulas sobre várias passagens da Bíblia",
    "Acompanhamento do teólogo para todas as suas dúvidas"
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#4A8BB5" }}>
      <section className="container mx-auto py-3 md:py-16">
        <div className="mx-auto px-3 md:px-4" style={{ maxWidth: "960px" }}>
          <div className="text-center mb-4 md:mb-10">
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
                AULA AO VIVO
              </div>
              <h1 
                className="text-2xl md:text-5xl lg:text-6xl font-extrabold leading-tight px-2 text-center" 
                style={{ 
                  background: "linear-gradient(180deg, #FFFFFF 0%, #FFD700 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  textShadow: "0 4px 20px rgba(255, 215, 0, 0.3)",
                  filter: "drop-shadow(0 4px 8px rgba(0, 0, 0, 0.8))",
                  display: "block",
                  width: "100%"
                }} 
                data-testid="text-title"
              >
                COMO LER E ENTENDER A BÍBLIA DE VERDADE
              </h1>
            </div>
          </div>

          <div id="video-player" className="relative w-full mx-auto mb-4 md:mb-12 -mx-3 md:mx-0" style={{ maxWidth: "100%", backgroundColor: "#ffffff", borderRadius: "12px", border: "2px solid rgba(255, 255, 255, 0.4)" }}>
            <div className="relative w-full border-4 border-white rounded-xl overflow-hidden" style={{ 
              paddingBottom: "140%",
              boxShadow: "0 10px 25px rgba(0, 0, 0, 0.15)"
            }}>
              <style>{`
                #video-player {
                  padding: 0;
                  background-color: transparent;
                }
                #video-player > div {
                  border: 2px solid white;
                  padding-bottom: 56.25% !important;
                }
                @media (min-width: 768px) {
                  #video-player > div {
                    padding-bottom: 56.25% !important;
                    height: auto;
                    border: 4px solid white;
                  }
                  #video-player iframe {
                    object-fit: cover;
                  }
                }
              `}</style>
              <iframe
                id="webinar-compact-carlos"
                src="https://autowebinar-znc5.onrender.com/w/carlos?embed=1&compact=1"
                className="absolute top-0 left-0 w-full h-full"
                frameBorder="0"
                scrolling="no"
                allow="autoplay; fullscreen"
                allowFullScreen
                loading="lazy"
                data-testid="iframe-carlos"
              />
            </div>
          </div>

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
              OFERTA ESPECIAL
            </div>

            <h2 
              className="text-2xl md:text-4xl font-bold mb-4" 
              style={{ color: "#ffffff", textShadow: "3px 3px 6px rgba(0,0,0,0.8)" }}
              data-testid="text-offer-title"
            >
              INSCRIÇÕES ABERTAS PARA OS CURSOS BÍBLICOS
            </h2>
            
            <p 
              className="text-base md:text-lg mb-6 font-medium" 
              style={{ color: "#ffffff", textShadow: "2px 2px 4px rgba(0,0,0,0.8)" }}
              data-testid="text-offer-subtitle"
            >
              A partir de agora você poderá ser meu aluno, minha aluna
            </p>

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
              className="p-8 mb-10 rounded-xl text-center"
              style={{ 
                background: "linear-gradient(135deg, rgba(255, 215, 0, 0.15) 0%, rgba(255, 165, 0, 0.1) 100%)",
                border: "3px solid rgba(255, 215, 0, 0.8)",
                boxShadow: "0 15px 40px rgba(255, 215, 0, 0.4), inset 0 1px 0 rgba(255,255,255,0.2)"
              }}
            >
              <p 
                className="text-lg md:text-2xl font-bold leading-relaxed" 
                style={{ color: "#ffffff", textShadow: "2px 2px 6px rgba(0,0,0,0.9)" }}
                data-testid="text-pricing"
              >
                O valor da inscrição é <strong style={{ 
                  color: "#FFD700", 
                  textShadow: "2px 2px 8px rgba(0,0,0,1), 0 0 20px rgba(255,215,0,0.6)",
                  fontSize: "1.2em"
                }}>12x R$ 59,90</strong> no cartão<br />
                ou um valor único de <strong style={{ 
                  color: "#FFD700", 
                  textShadow: "2px 2px 8px rgba(0,0,0,1), 0 0 20px rgba(255,215,0,0.6)",
                  fontSize: "1.2em"
                }}>R$ 660,00</strong> por 12 meses de estudos.
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
        </div>
      </section>
    </div>
  );
}
