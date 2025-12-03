import { useRef, useCallback, useEffect } from "react";
import { Bold, Italic, Underline, Type, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { createPortal } from "react-dom";

interface InlineEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  testId?: string;
  toolbarContainerId?: string;
}

const TEXT_COLORS = [
  "#ffffff", "#000000", "#ef4444", "#f97316", "#eab308", 
  "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#06b6d4"
];

export default function InlineEditor({ 
  value, 
  onChange, 
  placeholder = "Digite aqui...", 
  className = "",
  style = {},
  testId,
  toolbarContainerId = "replay-toolbar-container"
}: InlineEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const isFocusedRef = useRef(false);

  useEffect(() => {
    if (editorRef.current && !isFocusedRef.current) {
      editorRef.current.innerHTML = value || "";
    }
  }, [value]);

  const execCommand = useCallback((command: string, cmdValue?: string) => {
    document.execCommand(command, false, cmdValue);
    editorRef.current?.focus();
    handleInput();
  }, []);

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange]);

  const handleFocus = () => {
    isFocusedRef.current = true;
    const container = document.getElementById(toolbarContainerId);
    if (container) {
      container.setAttribute('data-active-editor', testId || '');
      container.classList.remove('opacity-0', 'pointer-events-none');
      container.classList.add('opacity-100');
    }
  };

  const handleBlur = (e: React.FocusEvent) => {
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (relatedTarget?.closest('.inline-editor-toolbar') || relatedTarget?.closest('[role="dialog"]')) {
      return;
    }
    setTimeout(() => {
      isFocusedRef.current = false;
      const container = document.getElementById(toolbarContainerId);
      if (container && container.getAttribute('data-active-editor') === (testId || '')) {
        container.classList.add('opacity-0', 'pointer-events-none');
        container.classList.remove('opacity-100');
      }
    }, 200);
  };

  const toolbarContainer = document.getElementById(toolbarContainerId);

  return (
    <>
      {toolbarContainer && createPortal(
        <div 
          className="inline-editor-toolbar flex items-center justify-center gap-1"
          onMouseDown={(e) => e.preventDefault()}
        >
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-white hover:bg-gray-700"
            onClick={() => execCommand("bold")}
            title="Negrito"
          >
            <Bold className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-white hover:bg-gray-700"
            onClick={() => execCommand("italic")}
            title="Italico"
          >
            <Italic className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-white hover:bg-gray-700"
            onClick={() => execCommand("underline")}
            title="Sublinhado"
          >
            <Underline className="h-3.5 w-3.5" />
          </Button>
          
          <div className="w-px h-5 bg-gray-600 mx-0.5" />
          
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-white hover:bg-gray-700"
                title="Cor do texto"
              >
                <Palette className="h-3.5 w-3.5" />
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
                className="h-7 w-7 text-white hover:bg-gray-700"
                title="Tamanho"
              >
                <Type className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2 bg-gray-900 border-gray-700" align="center" onMouseDown={(e) => e.preventDefault()}>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5, 6, 7].map((size) => (
                  <button
                    key={size}
                    type="button"
                    className="w-7 h-7 rounded bg-gray-700 text-white text-xs hover:bg-gray-600 transition-colors"
                    onMouseDown={() => execCommand("fontSize", size.toString())}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>,
        toolbarContainer
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
    </>
  );
}
