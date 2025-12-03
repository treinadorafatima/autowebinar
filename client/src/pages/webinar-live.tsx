import { useState, useEffect, useCallback } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import WebinarPlayer from "@/components/webinar-player";
import bibliaPlusLogo from "@assets/WhatsApp Image 2025-11-25 at 20.59.53_1764115207955.jpeg";
import { WEBINAR_COMMENTS } from "@/data/webinar-comments";

interface WebinarConfig {
  videoUrl: string;
  startHour: number;
  startMinute: number;
  videoDuration: number;
  countdownText?: string;
  nextWebinarText?: string;
  endedBadgeText?: string;
  countdownColor?: string;
  liveButtonColor?: string;
  backgroundColor?: string;
  backgroundImageUrl?: string;
}

interface ApiComment {
  id: string;
  text: string;
  author: string;
  timestamp: number;
}

interface Comment {
  id: number;
  timestamp: number;
  name: string;
  location: string;
  message: string;
}

interface UserInfo {
  name: string;
  city: string;
  state: string;
}

export default function WebinarLivePage() {
  const [showOffer, setShowOffer] = useState(false);
  const [config, setConfig] = useState<WebinarConfig>({
    videoUrl: "",
    startHour: 0,
    startMinute: 0,
    videoDuration: 0,
    countdownText: "O webinário começa em:",
    nextWebinarText: "Próximo webinário em:",
    endedBadgeText: "TRANSMISSÃO ENCERRADA",
    countdownColor: "#FFD700",
    liveButtonColor: "#e74c3c",
    backgroundColor: "#1a1a2e",
    backgroundImageUrl: "",
  });
  const [comments, setComments] = useState<Comment[]>(WEBINAR_COMMENTS);
  const [loading, setLoading] = useState(true);
  
  // User info state - this is the source of truth
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [showUserModal, setShowUserModal] = useState(true);
  
  // Form fields
  const [formName, setFormName] = useState("");
  const [formCity, setFormCity] = useState("");
  const [formState, setFormState] = useState("");

  // Load user info from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("userInfo");
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as UserInfo;
        if (parsed.name && parsed.city && parsed.state) {
          setUserInfo(parsed);
          setShowUserModal(false);
        }
      } catch (e) {
        localStorage.removeItem("userInfo");
      }
    }
  }, []);

  // Handle form submission
  const handleFormSubmit = useCallback(() => {
    const name = formName.trim();
    const city = formCity.trim();
    const state = formState.trim().toUpperCase();
    
    if (!name || !city || !state) {
      return;
    }
    
    const newUserInfo: UserInfo = { name, city, state };
    
    // Save to localStorage
    localStorage.setItem("userInfo", JSON.stringify(newUserInfo));
    
    // Update state
    setUserInfo(newUserInfo);
    setShowUserModal(false);
    
    // Clear form
    setFormName("");
    setFormCity("");
    setFormState("");
  }, [formName, formCity, formState]);

  // Handle "ENTRAR E AGUARDAR" button click
  const handleEnterClick = useCallback(() => {
    // If user already has info, don't show modal
    if (userInfo) {
      return;
    }
    // Show modal to collect user info
    setShowUserModal(true);
  }, [userInfo]);

  // Fetch config and comments from API
  useEffect(() => {
    async function fetchData() {
      try {
        const configRes = await fetch("/api/webinar/config");
        const configData = await configRes.json();
        setConfig({
          videoUrl: configData.videoUrl || "https://videomng.builderall.com/user_data/videos/yp5Nhf8tsE.mp4",
          startHour: configData.startHour,
          startMinute: configData.startMinute,
          videoDuration: configData.videoDuration,
          countdownText: configData.countdownText,
          nextWebinarText: configData.nextWebinarText,
          endedBadgeText: configData.endedBadgeText,
          countdownColor: configData.countdownColor,
          liveButtonColor: configData.liveButtonColor,
          backgroundColor: configData.backgroundColor,
          backgroundImageUrl: configData.backgroundImageUrl,
        });

        // Fetch comments from API
        try {
          const commentsRes = await fetch("/api/webinar/comments");
          if (commentsRes.ok) {
            const commentsData: ApiComment[] = await commentsRes.json();
            if (Array.isArray(commentsData)) {
              // Map API comments to expected format
              // Parse author format: "Name – City (State)" into name and location
              const mappedComments: Comment[] = commentsData.map((c, idx) => {
                const author = c.author || "Sistema";
                const parts = author.split(" – ");
                const name = parts[0] || author;
                // Keep location as-is (may be "City (State)" or empty)
                const location = parts.length > 1 ? parts[1] : "";
                return {
                  id: idx,
                  timestamp: c.timestamp,
                  name,
                  location,
                  message: c.text
                };
              });
              setComments(mappedComments);
            }
          }
        } catch (error) {
          console.error("Erro ao carregar comentários:", error);
          // Keep current comments on error
        }
      } catch (error) {
        console.error("Erro ao carregar configuração:", error);
        // Keep default config on error
      } finally {
        setLoading(false);
      }
    }
    fetchData();
    
    // Poll for changes every 5 seconds
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);
  
  const benefits = [
    "Estudos versículo por versículo dos 4 Evangelhos",
    "Aula ao vivo toda segunda-feira",
    "Acesso a mais de 400 aulas sobre várias passagens da Bíblia",
    "Acompanhamento do teólogo para todas as suas dúvidas"
  ];

  const handleWebinarEnd = () => {
    setShowOffer(true);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowOffer(true);
    }, 10473000);

    return () => clearTimeout(timer);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#4A8BB5" }}>
        <div style={{ color: "white", fontSize: "18px" }}>Carregando webinário...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#4A8BB5" }}>
      <section className="container mx-auto py-4 md:py-8">
        <div className="mx-auto px-2 md:px-4" style={{ maxWidth: "960px" }}>
          <div className="text-center mb-6">
            <div 
              className="inline-block px-6 md:px-10 py-4 md:py-6 rounded-2xl"
              style={{
                background: "linear-gradient(135deg, rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0.4) 100%)",
                backdropFilter: "blur(15px)",
                border: "3px solid rgba(255, 215, 0, 0.4)",
                boxShadow: "0 20px 60px rgba(0, 0, 0, 0.5), 0 0 40px rgba(255, 215, 0, 0.2)"
              }}
            >
              <div 
                className="inline-block px-3 py-1 mb-3 rounded-full text-xs md:text-sm font-bold"
                style={{
                  background: "linear-gradient(90deg, #FFD700 0%, #FFA500 100%)",
                  color: "#000000",
                  boxShadow: "0 4px 15px rgba(255, 215, 0, 0.5)"
                }}
              >
                Aulão
              </div>
              <h1 
                className="text-xl md:text-4xl lg:text-5xl font-extrabold leading-tight px-2" 
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

          <div className="mb-8">
            <WebinarPlayer
              videoUrl={config.videoUrl}
              startHour={config.startHour}
              startMinute={config.startMinute}
              videoDuration={config.videoDuration}
              comments={comments}
              onWebinarEnd={handleWebinarEnd}
              countdownText={config.countdownText}
              nextWebinarText={config.nextWebinarText}
              endedBadgeText={config.endedBadgeText}
              countdownColor={config.countdownColor}
              liveButtonColor={config.liveButtonColor}
              backgroundColor={config.backgroundColor}
              backgroundImageUrl={config.backgroundImageUrl}
              onEnterClick={handleEnterClick}
              userInfo={userInfo}
              onRequestUserInfo={() => setShowUserModal(true)}
            />
          </div>

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
                  O valor da inscrição é <strong style={{ color: "#FFD700", textShadow: "2px 2px 6px rgba(0,0,0,1)" }}>12x R$ 59,90</strong> no cartão<br />
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

      {showUserModal && (
        <div 
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.7)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowUserModal(false);
            }
          }}
        >
          <div 
            className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl mx-4 relative"
            style={{ boxShadow: "0 20px 60px rgba(0, 0, 0, 0.4)" }}
          >
            <button
              onClick={() => setShowUserModal(false)}
              className="absolute top-4 right-4 p-1 rounded-full hover:bg-gray-200 transition-colors"
              data-testid="button-close-modal"
              type="button"
            >
              <X className="w-6 h-6 text-gray-600" />
            </button>
            <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">Bem-vindo!</h2>
            <p className="text-gray-600 text-center mb-6">Para participar, preencha seus dados:</p>
            
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                handleFormSubmit();
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Nome</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Seu nome"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  data-testid="input-user-name"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Cidade</label>
                <input
                  type="text"
                  value={formCity}
                  onChange={(e) => setFormCity(e.target.value)}
                  placeholder="Sua cidade"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  data-testid="input-user-city"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Estado</label>
                <input
                  type="text"
                  value={formState}
                  onChange={(e) => setFormState(e.target.value.toUpperCase())}
                  placeholder="UF"
                  maxLength={2}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  data-testid="input-user-state"
                />
              </div>

              <Button
                type="submit"
                disabled={!formName.trim() || !formCity.trim() || !formState.trim()}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="button-user-submit"
              >
                Continuar
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
