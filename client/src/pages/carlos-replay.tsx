import { useEffect } from "react";

export default function CarlosReplayPage() {
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      const iframe = document.getElementById('webinar-compact-carlos-replay') as HTMLIFrameElement;
      if (e.data && e.data.type === 'webinar-resize' && e.data.height && iframe) {
        iframe.style.height = e.data.height + 'px';
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
                REPLAY DISPONÍVEL
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
              id="webinar-compact-carlos-replay"
              src="https://autowebinar-znc5.onrender.com/w/carlos/replay?embed=1&compact=1"
              frameBorder="0"
              scrolling="no"
              allow="autoplay; fullscreen"
              allowFullScreen
              loading="lazy"
              style={{ 
                width: "100%", 
                height: "600px", 
                border: "none", 
                display: "block" 
              }}
              data-testid="iframe-carlos-replay"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
