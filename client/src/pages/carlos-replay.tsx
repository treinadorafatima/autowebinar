import { useEffect, useState } from "react";

export default function CarlosReplayPage() {
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
      <section className="container mx-auto py-3 md:py-8">
        <div className="mx-auto px-3 md:px-4" style={{ maxWidth: "960px" }}>
          <div style={{ 
            borderRadius: "12px", 
            overflow: "hidden", 
            boxShadow: "0 4px 20px rgba(0,0,0,0.15)"
          }}>
            <iframe
              id="webinar-compact-carlos-replay"
              src="/w/carlos/replay?embed=1"
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
              data-testid="iframe-carlos-replay"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
