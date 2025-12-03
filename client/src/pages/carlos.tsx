import { useEffect, useState } from "react";

export default function CarlosPage() {
  const [iframeHeight, setIframeHeight] = useState(540);

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === 'webinar-resize' && e.data.height) {
        setIframeHeight(e.data.height);
      }
    };
    
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

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

          <div style={{ 
            borderRadius: "12px", 
            overflow: "hidden", 
            boxShadow: "0 4px 20px rgba(0,0,0,0.15)"
          }}>
            <iframe
              id="webinar-compact-carlos"
              src="https://autowebinar-znc5.onrender.com/w/carlos?embed=1"
              frameBorder="0"
              scrolling="no"
              allow="autoplay; fullscreen"
              allowFullScreen
              loading="lazy"
              style={{ 
                width: "100%", 
                height: `${iframeHeight}px`, 
                border: "none",
                display: "block",
                transition: "height 0.3s ease"
              }}
              data-testid="iframe-carlos"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
