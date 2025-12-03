import { useEffect } from "react";

export default function CarlosPage() {
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      const iframe = document.getElementById('webinar-compact-carlos') as HTMLIFrameElement;
      if (e.data && e.data.type === 'webinar-resize' && e.data.height && iframe) {
        iframe.style.height = e.data.height + 'px';
      }
    };
    
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#4A8BB5" }}>
      <div style={{ width: "100%", maxWidth: "900px", margin: "0 auto", padding: "12px" }}>
        <div style={{ 
          borderRadius: "12px", 
          overflow: "hidden", 
          boxShadow: "0 4px 20px rgba(0,0,0,0.15)" 
        }}>
          <iframe
            id="webinar-compact-carlos"
            src="https://autowebinar-znc5.onrender.com/w/carlos?embed=1&compact=1"
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
            data-testid="iframe-carlos"
          />
        </div>
      </div>
    </div>
  );
}
