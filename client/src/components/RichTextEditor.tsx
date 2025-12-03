import { useState, useRef, useEffect, useCallback } from "react";
import { Bold, Italic, Underline, Type, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  testId?: string;
}

const TEXT_COLORS = [
  "#ffffff", "#000000", "#ef4444", "#f97316", "#eab308", 
  "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#06b6d4"
];

export default function RichTextEditor({ 
  value, 
  onChange, 
  placeholder = "Digite aqui...", 
  className = "",
  style = {},
  testId
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [showToolbar, setShowToolbar] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || "";
    }
  }, []);

  const execCommand = useCallback((command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    handleInput();
  }, []);

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange]);

  const handleFocus = () => {
    setIsFocused(true);
    setShowToolbar(true);
  };

  const handleBlur = (e: React.FocusEvent) => {
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (relatedTarget?.closest('.rich-text-toolbar') || relatedTarget?.closest('[role="dialog"]')) {
      return;
    }
    setTimeout(() => {
      setIsFocused(false);
      setShowToolbar(false);
    }, 200);
  };

  return (
    <div className="flex flex-col">
      {showToolbar && (
        <div 
          className="rich-text-toolbar flex items-center justify-center gap-1 bg-gray-900 border border-gray-700 rounded-lg p-1.5 shadow-xl mb-2"
          onMouseDown={(e) => e.preventDefault()}
          spellCheck="false"
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

          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-white hover:bg-gray-700"
                title="Tamanho"
              >
                <Type className="h-4 w-4" />
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
        </div>
      )}
      
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        spellCheck="false"
        onInput={handleInput}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className={`outline-none min-h-[1.5em] cursor-text ${className}`}
        style={style}
        data-placeholder={placeholder}
        data-testid={testId}
      />
      
      <style>{`
        [contenteditable]:empty:before {
          content: attr(data-placeholder);
          color: rgba(255, 255, 255, 0.4);
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}
