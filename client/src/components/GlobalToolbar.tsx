import { useCallback } from "react";
import { Bold, Italic, Underline, Type, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const TEXT_COLORS = [
  "#ffffff", "#000000", "#FFD700", "#ef4444", "#f97316", 
  "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#06b6d4"
];

const FONTS = [
  { name: "Arial", value: "Arial, sans-serif" },
  { name: "Times", value: "Times New Roman, serif" },
  { name: "Georgia", value: "Georgia, serif" },
  { name: "Verdana", value: "Verdana, sans-serif" },
  { name: "Impact", value: "Impact, sans-serif" },
  { name: "Comic Sans", value: "Comic Sans MS, cursive" },
  { name: "Courier", value: "Courier New, monospace" },
  { name: "Trebuchet", value: "Trebuchet MS, sans-serif" },
];

export default function GlobalToolbar() {
  const execCommand = useCallback((command: string, value?: string) => {
    document.execCommand(command, false, value);
  }, []);

  const applyEffect = useCallback((effect: string) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    const range = selection.getRangeAt(0);
    const span = document.createElement('span');
    
    switch (effect) {
      case 'shadow':
        span.style.textShadow = '2px 2px 4px rgba(0,0,0,0.5)';
        break;
      case 'glow':
        span.style.textShadow = '0 0 10px #FFD700, 0 0 20px #FFD700';
        break;
      case 'outline':
        span.style.textShadow = '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000';
        break;
      case 'gradient-gold':
        span.style.background = 'linear-gradient(180deg, #FFFFFF 0%, #FFD700 100%)';
        span.style.webkitBackgroundClip = 'text';
        span.style.webkitTextFillColor = 'transparent';
        span.style.backgroundClip = 'text';
        break;
      case 'gradient-orange':
        span.style.background = 'linear-gradient(180deg, #FFD700 0%, #FFA500 100%)';
        span.style.webkitBackgroundClip = 'text';
        span.style.webkitTextFillColor = 'transparent';
        span.style.backgroundClip = 'text';
        break;
      case 'gradient-blue':
        span.style.background = 'linear-gradient(180deg, #60A5FA 0%, #3B82F6 100%)';
        span.style.webkitBackgroundClip = 'text';
        span.style.webkitTextFillColor = 'transparent';
        span.style.backgroundClip = 'text';
        break;
      case 'gradient-green':
        span.style.background = 'linear-gradient(180deg, #4ADE80 0%, #22C55E 100%)';
        span.style.webkitBackgroundClip = 'text';
        span.style.webkitTextFillColor = 'transparent';
        span.style.backgroundClip = 'text';
        break;
      case 'highlight':
        span.style.backgroundColor = 'rgba(255, 215, 0, 0.3)';
        span.style.padding = '0 4px';
        span.style.borderRadius = '2px';
        break;
    }
    
    span.appendChild(range.extractContents());
    range.insertNode(span);
    selection.removeAllRanges();
    selection.addRange(range);
  }, []);

  return (
    <div 
      className="flex flex-wrap items-center justify-center gap-1 bg-gray-900/95 border border-gray-700 rounded-lg p-2 shadow-xl backdrop-blur-sm"
      onMouseDown={(e) => e.preventDefault()}
    >
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-8 w-8 text-white hover:bg-gray-700"
        onClick={() => execCommand("bold")}
        title="Negrito"
      >
        <Bold className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-8 w-8 text-white hover:bg-gray-700"
        onClick={() => execCommand("italic")}
        title="Italico"
      >
        <Italic className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-8 w-8 text-white hover:bg-gray-700"
        onClick={() => execCommand("underline")}
        title="Sublinhado"
      >
        <Underline className="h-4 w-4" />
      </Button>
      
      <div className="w-px h-6 bg-gray-600 mx-1" />
      
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-white hover:bg-gray-700 text-xs"
            title="Fonte"
          >
            <Type className="h-4 w-4 mr-1" />
            Fonte
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2 bg-gray-900 border-gray-700" align="center" onMouseDown={(e) => e.preventDefault()}>
          <div className="flex flex-col gap-1">
            {FONTS.map((font) => (
              <button
                key={font.name}
                type="button"
                className="px-3 py-1.5 rounded bg-gray-700 text-white text-sm hover:bg-gray-600 transition-colors text-left"
                style={{ fontFamily: font.value }}
                onMouseDown={() => execCommand("fontName", font.value)}
              >
                {font.name}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-white hover:bg-gray-700 text-xs"
            title="Tamanho"
          >
            Tam
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2 bg-gray-900 border-gray-700" align="center" onMouseDown={(e) => e.preventDefault()}>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5, 6, 7].map((size) => (
              <button
                key={size}
                type="button"
                className="w-8 h-8 rounded bg-gray-700 text-white text-xs hover:bg-gray-600 transition-colors"
                onMouseDown={() => execCommand("fontSize", size.toString())}
              >
                {size}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-white hover:bg-gray-700"
            title="Cor do texto"
          >
            <Palette className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2 bg-gray-900 border-gray-700" align="center" onMouseDown={(e) => e.preventDefault()}>
          <div className="grid grid-cols-5 gap-1">
            {TEXT_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className="w-6 h-6 rounded border border-gray-600 hover:scale-110 transition-transform"
                style={{ backgroundColor: color }}
                onMouseDown={() => execCommand("foreColor", color)}
              />
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <div className="w-px h-6 bg-gray-600 mx-1" />

      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-white hover:bg-gray-700 text-xs"
            title="Efeitos"
          >
            Efeitos
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2 bg-gray-900 border-gray-700" align="center" onMouseDown={(e) => e.preventDefault()}>
          <div className="flex flex-col gap-1">
            <button
              type="button"
              className="px-3 py-1.5 rounded bg-gray-700 text-white text-sm hover:bg-gray-600 transition-colors text-left"
              style={{ textShadow: '2px 2px 4px rgba(0,0,0,0.5)' }}
              onMouseDown={() => applyEffect('shadow')}
            >
              Sombra
            </button>
            <button
              type="button"
              className="px-3 py-1.5 rounded bg-gray-700 text-sm hover:bg-gray-600 transition-colors text-left"
              style={{ textShadow: '0 0 10px #FFD700, 0 0 20px #FFD700', color: '#FFD700' }}
              onMouseDown={() => applyEffect('glow')}
            >
              Brilho
            </button>
            <button
              type="button"
              className="px-3 py-1.5 rounded bg-gray-700 text-white text-sm hover:bg-gray-600 transition-colors text-left"
              style={{ textShadow: '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000' }}
              onMouseDown={() => applyEffect('outline')}
            >
              Contorno
            </button>
            <button
              type="button"
              className="px-3 py-1.5 rounded bg-gray-700 text-sm hover:bg-gray-600 transition-colors text-left"
              style={{ 
                background: 'linear-gradient(180deg, #FFFFFF 0%, #FFD700 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}
              onMouseDown={() => applyEffect('gradient-gold')}
            >
              Gradiente Dourado
            </button>
            <button
              type="button"
              className="px-3 py-1.5 rounded bg-gray-700 text-sm hover:bg-gray-600 transition-colors text-left"
              style={{ 
                background: 'linear-gradient(180deg, #FFD700 0%, #FFA500 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}
              onMouseDown={() => applyEffect('gradient-orange')}
            >
              Gradiente Laranja
            </button>
            <button
              type="button"
              className="px-3 py-1.5 rounded bg-gray-700 text-sm hover:bg-gray-600 transition-colors text-left"
              style={{ 
                background: 'linear-gradient(180deg, #60A5FA 0%, #3B82F6 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}
              onMouseDown={() => applyEffect('gradient-blue')}
            >
              Gradiente Azul
            </button>
            <button
              type="button"
              className="px-3 py-1.5 rounded bg-gray-700 text-sm hover:bg-gray-600 transition-colors text-left"
              style={{ 
                background: 'linear-gradient(180deg, #4ADE80 0%, #22C55E 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}
              onMouseDown={() => applyEffect('gradient-green')}
            >
              Gradiente Verde
            </button>
            <button
              type="button"
              className="px-3 py-1.5 rounded bg-gray-700 text-white text-sm hover:bg-gray-600 transition-colors text-left"
              onMouseDown={() => applyEffect('highlight')}
            >
              <span style={{ backgroundColor: 'rgba(255, 215, 0, 0.3)', padding: '0 4px', borderRadius: '2px' }}>Destaque</span>
            </button>
          </div>
        </PopoverContent>
      </Popover>

      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 px-2 text-white hover:bg-gray-700 text-xs"
        onClick={() => execCommand("strikeThrough")}
        title="Tachado"
      >
        <span className="line-through">abc</span>
      </Button>
    </div>
  );
}
