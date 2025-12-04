import { useState, useRef, useCallback } from "react";
import { Check, GripVertical, Trash2, Plus, ImageIcon, Upload, CreditCard, ChevronDown, ExternalLink, Video, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import GlobalToolbar from "./GlobalToolbar";

function SimpleTextEditor({ 
  value, 
  onChange, 
  placeholder = "Digite aqui...", 
  className = "",
  style = {},
  testId
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  testId?: string;
}) {
  const editorRef = useRef<HTMLDivElement>(null);

  const stripHtml = (html: string) => {
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || "";
  };

  const displayValue = stripHtml(value);

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      onChange(editorRef.current.textContent || "");
    }
  }, [onChange]);

  return (
    <div className="relative">
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        spellCheck="false"
        onInput={handleInput}
        className={`outline-none min-h-[1.5em] cursor-text ${className}`}
        style={style}
        data-placeholder={placeholder}
        data-testid={testId}
        dangerouslySetInnerHTML={{ __html: displayValue }}
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

interface ReplayEditorProps {
  formData: {
    replayBadgeText: string;
    replayTitle: string;
    replayOfferBadgeText: string;
    replayOfferTitle: string;
    replayOfferSubtitle: string;
    replayOfferImageUrl: string;
    replayThumbnailUrl: string;
    replayPriceText: string;
    replayButtonText: string;
    replayButtonUrl: string;
    replayButtonColor: string;
    replayBackgroundColor: string;
    replayPlayerColor: string;
    replayPlayerBorderColor: string;
  };
  benefitsList: string[];
  onChange: (field: string, value: string | boolean) => void;
  onBenefitsChange: (benefits: string[]) => void;
  onImageUpload?: (file: File) => Promise<string>;
}

interface SortableBenefitProps {
  id: string;
  index: number;
  benefit: string;
  onEdit: (index: number, value: string) => void;
  onDelete: (index: number) => void;
}

function SortableBenefit({ id, index, benefit, onEdit, onDelete }: SortableBenefitProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 group"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 opacity-50 hover:opacity-100 transition-opacity flex-shrink-0"
        data-testid={`replay-drag-handle-${index}`}
      >
        <GripVertical className="h-4 w-4 text-white" />
      </button>
      
      <div 
        className="flex-shrink-0 rounded-full p-1"
        style={{ backgroundColor: "#90EE90" }}
      >
        <Check className="h-4 w-4" style={{ color: "#000000", strokeWidth: 3 }} />
      </div>
      
      <div className="flex-1 min-w-0">
        <SimpleTextEditor
          value={benefit}
          onChange={(v) => onEdit(index, v)}
          placeholder="Clique para editar beneficio..."
          className="text-sm md:text-base font-medium text-white"
          testId={`replay-input-benefit-${index}`}
        />
      </div>
      
      <button
        onClick={() => onDelete(index)}
        className="p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/20 rounded flex-shrink-0"
        data-testid={`replay-delete-benefit-${index}`}
      >
        <Trash2 className="h-4 w-4 text-red-400" />
      </button>
    </div>
  );
}

function ColorPicker({ value, onChange, colors, label }: { 
  value: string; 
  onChange: (v: string) => void; 
  colors: string[];
  label: string;
}) {
  const handleChange = (newValue: string) => {
    console.log(`[ColorPicker] ${label} changed from ${value} to ${newValue}`);
    onChange(newValue);
  };
  
  return (
    <div className="space-y-2">
      <Label className="text-white text-xs font-medium">{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          className="w-8 h-8 rounded cursor-pointer border border-gray-600 flex-shrink-0"
        />
        <Input
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          className="flex-1 h-8 text-xs"
        />
      </div>
      <div className="flex flex-wrap gap-1">
        {colors.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => handleChange(c)}
            className={`w-6 h-6 rounded transition-transform hover:scale-110 ${value === c ? "ring-2 ring-white" : ""}`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
    </div>
  );
}

export default function ReplayEditor({ formData, benefitsList, onChange, onBenefitsChange, onImageUpload }: ReplayEditorProps) {
  const [showImageInput, setShowImageInput] = useState(false);
  const [showThumbnailInput, setShowThumbnailInput] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [thumbnailUploading, setThumbnailUploading] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const thumbnailFileInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = benefitsList.findIndex((_, i) => `replay-benefit-${i}` === active.id);
      const newIndex = benefitsList.findIndex((_, i) => `replay-benefit-${i}` === over.id);
      onBenefitsChange(arrayMove(benefitsList, oldIndex, newIndex));
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onImageUpload) return;
    
    setUploading(true);
    try {
      const url = await onImageUpload(file);
      onChange("replayOfferImageUrl", url);
      setShowImageInput(false);
    } catch (error) {
      console.error("Erro no upload:", error);
    } finally {
      setUploading(false);
    }
  };

  const handleThumbnailUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onImageUpload) return;
    
    setThumbnailUploading(true);
    try {
      const url = await onImageUpload(file);
      onChange("replayThumbnailUrl", url);
      setShowThumbnailInput(false);
    } catch (error) {
      console.error("Erro no upload da miniatura:", error);
    } finally {
      setThumbnailUploading(false);
    }
  };

  const toggleSection = (section: string) => {
    setOpenSection(openSection === section ? null : section);
  };

  const BUTTON_COLORS = ["#22c55e", "#16a34a", "#10b981", "#84cc16", "#eab308", "#f59e0b", "#ef4444", "#3b82f6", "#8b5cf6", "#ec4899"];
  const BG_COLORS = ["#4A8BB5", "#1a1a2e", "#0f172a", "#1e293b", "#134e4a", "#1e3a5f", "#3b0764", "#4c0519"];
  const PLAYER_COLORS = ["#3b82f6", "#22c55e", "#ef4444", "#eab308", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-50 mb-4">
        <GlobalToolbar />
        <p className="text-center text-xs text-gray-400 mt-1">Selecione o texto e clique nos botoes para formatar</p>
      </div>

      <div 
        className="rounded-xl p-4 md:p-8 text-center"
        style={{
          background: "linear-gradient(135deg, rgba(0, 0, 0, 0.5) 0%, rgba(0, 0, 0, 0.4) 100%)",
          backdropFilter: "blur(10px)",
          border: "1px solid rgba(255, 255, 255, 0.2)",
        }}
      >
        <div className="mb-6">
          <div 
            className="inline-block px-6 py-4 rounded-xl mb-4"
            style={{
              background: "linear-gradient(135deg, rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0.4) 100%)",
              border: "2px solid rgba(255, 215, 0, 0.4)",
            }}
          >
            <div className="mb-3">
              <SimpleTextEditor
                value={formData.replayBadgeText}
                onChange={(v) => onChange("replayBadgeText", v)}
                placeholder="BADGE DO REPLAY"
                className="inline-block px-3 py-1 rounded-full text-xs font-bold"
                style={{ 
                  background: "linear-gradient(90deg, #FFD700 0%, #FFA500 100%)",
                  color: "#000000"
                }}
                testId="replay-badge"
              />
            </div>
            <SimpleTextEditor
              value={formData.replayTitle}
              onChange={(v) => onChange("replayTitle", v)}
              placeholder="TITULO DO REPLAY"
              className="text-xl md:text-3xl font-extrabold"
              style={{ 
                background: "linear-gradient(180deg, #FFFFFF 0%, #FFD700 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text"
              }}
              testId="replay-title"
            />
          </div>
        </div>

        <div className="mb-6 max-w-lg mx-auto">
          <div 
            className="relative rounded-xl overflow-hidden flex items-center justify-center group cursor-pointer"
            style={{ 
              border: `4px solid ${formData.replayPlayerBorderColor || "#ffffff"}`,
              aspectRatio: "16/9",
              background: formData.replayThumbnailUrl 
                ? `url(${formData.replayThumbnailUrl}) center/cover no-repeat`
                : "linear-gradient(135deg, #1a1a2e 0%, #0f0f1a 100%)"
            }}
            onClick={() => setShowThumbnailInput(true)}
            data-testid="button-thumbnail-area"
          >
            <div 
              className="w-16 h-16 rounded-full flex items-center justify-center z-10"
              style={{ backgroundColor: formData.replayPlayerColor || "#3b82f6" }}
            >
              <Play className="w-8 h-8 text-white ml-1" />
            </div>
            
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="flex flex-col items-center gap-2 text-white">
                <ImageIcon className="h-8 w-8" />
                <span className="text-sm font-medium">
                  {formData.replayThumbnailUrl ? "Alterar miniatura" : "Adicionar miniatura"}
                </span>
              </div>
            </div>
          </div>
          
          {showThumbnailInput && (
            <div className="mt-3 bg-slate-700 p-4 rounded-lg border border-white/20">
              <input
                ref={thumbnailFileInputRef}
                type="file"
                accept="image/*"
                onChange={handleThumbnailUpload}
                className="hidden"
              />
              <div className="flex flex-col gap-2">
                <Button 
                  variant="default" 
                  size="sm"
                  className="w-full text-white font-semibold"
                  onClick={() => thumbnailFileInputRef.current?.click()}
                  disabled={thumbnailUploading}
                  data-testid="button-upload-thumbnail"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {thumbnailUploading ? "Enviando..." : "Upload da Miniatura"}
                </Button>
                <Input
                  value={formData.replayThumbnailUrl}
                  onChange={(e) => onChange("replayThumbnailUrl", e.target.value)}
                  placeholder="Ou cole a URL da miniatura aqui"
                  className="text-xs bg-white/10 border-white/20 text-white placeholder:text-white/40"
                  data-testid="input-thumbnail-url"
                />
                <div className="flex gap-2">
                  {formData.replayThumbnailUrl && (
                    <Button 
                      size="sm" 
                      variant="destructive"
                      className="flex-1"
                      onClick={() => {
                        onChange("replayThumbnailUrl", "");
                        setShowThumbnailInput(false);
                      }}
                      data-testid="button-remove-thumbnail"
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Remover
                    </Button>
                  )}
                  <Button 
                    size="sm" 
                    className="flex-1 text-white font-semibold" 
                    onClick={() => setShowThumbnailInput(false)}
                    data-testid="button-close-thumbnail-modal"
                  >
                    Fechar
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mb-4">
          <SimpleTextEditor
            value={formData.replayOfferBadgeText}
            onChange={(v) => onChange("replayOfferBadgeText", v)}
            placeholder="BADGE DA OFERTA"
            className="inline-block px-3 py-1 rounded-full text-xs font-bold"
            style={{ 
              backgroundColor: "#FFD700",
              color: "#2c3e50"
            }}
            testId="replay-offer-badge"
          />
        </div>

        <div className="mb-2">
          <SimpleTextEditor
            value={formData.replayOfferTitle}
            onChange={(v) => onChange("replayOfferTitle", v)}
            placeholder="TITULO DA OFERTA"
            className="text-xl md:text-3xl font-bold"
            style={{ color: "#ffffff" }}
            testId="replay-offer-title"
          />
        </div>
        
        <div className="mb-6">
          <SimpleTextEditor
            value={formData.replayOfferSubtitle}
            onChange={(v) => onChange("replayOfferSubtitle", v)}
            placeholder="Subtitulo da oferta"
            className="text-sm md:text-base font-medium"
            style={{ color: "#ffffff" }}
            testId="replay-offer-subtitle"
          />
        </div>

        <div className="mb-6">
          {formData.replayOfferImageUrl ? (
            <div className="relative inline-block group">
              <img 
                src={formData.replayOfferImageUrl} 
                alt="Oferta" 
                className="mx-auto rounded-lg max-w-[200px] md:max-w-[280px]"
              />
              <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg">
                <button
                  onClick={() => setShowImageInput(true)}
                  className="p-2 bg-white/20 rounded-full hover:bg-white/30"
                >
                  <ImageIcon className="h-5 w-5 text-white" />
                </button>
                <button
                  onClick={() => onChange("replayOfferImageUrl", "")}
                  className="p-2 bg-red-500/50 rounded-full hover:bg-red-500/70"
                >
                  <Trash2 className="h-5 w-5 text-white" />
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowImageInput(true)}
              className="mx-auto flex flex-col items-center justify-center gap-2 w-48 h-32 border-2 border-dashed border-white/30 rounded-lg hover:border-white/60 transition-colors"
            >
              <ImageIcon className="h-8 w-8 text-white/50" />
              <span className="text-white/50 text-xs">Adicionar imagem</span>
            </button>
          )}
          
          {showImageInput && (
            <div className="mt-3 max-w-sm mx-auto bg-slate-700 p-4 rounded-lg border border-white/20">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Button 
                variant="default" 
                size="sm"
                className="w-full mb-2 text-white font-semibold"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <Upload className="h-4 w-4 mr-2" />
                {uploading ? "Enviando..." : "Upload"}
              </Button>
              <Input
                value={formData.replayOfferImageUrl}
                onChange={(e) => onChange("replayOfferImageUrl", e.target.value)}
                placeholder="Ou cole a URL aqui"
                className="text-xs bg-white/10 border-white/20 text-white placeholder:text-white/40"
              />
              <Button size="sm" className="w-full mt-2 text-white font-semibold" onClick={() => setShowImageInput(false)}>
                Fechar
              </Button>
            </div>
          )}
        </div>

        <div 
          className="mb-6 text-left max-w-lg mx-auto p-4 rounded-xl space-y-3"
          style={{ 
            backgroundColor: "rgba(0, 0, 0, 0.4)",
            border: "1px solid rgba(255, 255, 255, 0.2)"
          }}
        >
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={benefitsList.map((_, i) => `replay-benefit-${i}`)} strategy={verticalListSortingStrategy}>
              {benefitsList.map((benefit, index) => (
                <SortableBenefit
                  key={`replay-benefit-${index}`}
                  id={`replay-benefit-${index}`}
                  index={index}
                  benefit={benefit}
                  onEdit={(i, v) => {
                    const newList = [...benefitsList];
                    newList[i] = v;
                    onBenefitsChange(newList);
                  }}
                  onDelete={(i) => onBenefitsChange(benefitsList.filter((_, idx) => idx !== i))}
                />
              ))}
            </SortableContext>
          </DndContext>
          
          <button
            onClick={() => onBenefitsChange([...benefitsList, "Novo beneficio"])}
            className="flex items-center gap-2 w-full p-2 border border-dashed border-white/20 rounded-lg hover:border-white/40 text-white/50 hover:text-white/80 text-sm"
          >
            <Plus className="h-4 w-4" />
            <span>Adicionar beneficio</span>
          </button>
        </div>

        <div 
          className="mb-6 max-w-lg mx-auto rounded-xl text-center p-6"
          style={{ 
            background: "linear-gradient(135deg, rgba(255, 215, 0, 0.15) 0%, rgba(255, 165, 0, 0.1) 100%)",
            border: "3px solid rgba(255, 215, 0, 0.8)",
            boxShadow: "0 15px 40px rgba(255, 215, 0, 0.4)"
          }}
        >
          <div className="flex items-center justify-center gap-2 mb-2">
            <CreditCard className="h-4 w-4" style={{ color: "#FFD700" }} />
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "#FFD700" }}>
              INVESTIMENTO
            </span>
          </div>
          <SimpleTextEditor
            value={formData.replayPriceText}
            onChange={(v: string) => onChange("replayPriceText", v)}
            placeholder="O valor da inscricao e 12x R$ XX,XX..."
            className="text-sm md:text-base font-semibold text-white"
            testId="replay-price-text"
          />
        </div>

        <div 
          className="w-full max-w-lg mx-auto rounded-xl text-center cursor-text py-5 px-8"
          style={{ 
            background: `linear-gradient(135deg, ${formData.replayButtonColor || "#22c55e"} 0%, ${formData.replayButtonColor || "#22c55e"}dd 100%)`,
            color: "#fff",
            boxShadow: `0 15px 40px ${formData.replayButtonColor || "#22c55e"}99`,
            border: "4px solid rgba(255, 255, 255, 0.5)"
          }}
        >
          <SimpleTextEditor
            value={formData.replayButtonText}
            onChange={(v: string) => onChange("replayButtonText", v)}
            placeholder="FAZER MINHA INSCRICAO AGORA"
            className="font-extrabold text-lg md:text-xl uppercase tracking-wide text-white"
            testId="replay-button-text"
          />
        </div>

        <div className="mt-3 max-w-lg mx-auto">
          <div className="flex items-center gap-2">
            <Input
              value={formData.replayButtonUrl}
              onChange={(e) => onChange("replayButtonUrl", e.target.value)}
              placeholder="https://link-do-checkout.com"
              className="flex-1 text-xs"
            />
            {formData.replayButtonUrl && (
              <a href={formData.replayButtonUrl} target="_blank" rel="noopener noreferrer">
                <Button size="icon" variant="ghost" className="h-8 w-8">
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Collapsible open={openSection === "player"} onOpenChange={() => toggleSection("player")}>
          <CollapsibleTrigger asChild>
            <button className="w-full flex items-center justify-between p-3 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors">
              <div className="flex items-center gap-2">
                <Video className="h-5 w-5 text-blue-400" />
                <span className="text-white text-sm font-medium">Estilo do Player</span>
              </div>
              <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${openSection === "player" ? "rotate-180" : ""}`} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="p-4 bg-gray-900 rounded-b-lg space-y-4 border-x border-b border-gray-700">
              <ColorPicker
                value={formData.replayPlayerColor || "#3b82f6"}
                onChange={(v) => onChange("replayPlayerColor", v)}
                colors={PLAYER_COLORS}
                label="Cor do Botao Play"
              />

              <ColorPicker
                value={formData.replayPlayerBorderColor || "#ffffff"}
                onChange={(v) => onChange("replayPlayerBorderColor", v)}
                colors={["#ffffff", "#000000", "#3b82f6", "#22c55e", "#eab308", "#ef4444", "#8b5cf6"]}
                label="Cor da Borda do Player"
              />
            </div>
          </CollapsibleContent>
        </Collapsible>

        <Collapsible open={openSection === "button"} onOpenChange={() => toggleSection("button")}>
          <CollapsibleTrigger asChild>
            <button className="w-full flex items-center justify-between p-3 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded" style={{ backgroundColor: formData.replayButtonColor || "#22c55e" }} />
                <span className="text-white text-sm font-medium">Estilo do Botao CTA</span>
              </div>
              <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${openSection === "button" ? "rotate-180" : ""}`} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="p-4 bg-gray-900 rounded-b-lg space-y-4 border-x border-b border-gray-700">
              <ColorPicker
                value={formData.replayButtonColor || "#22c55e"}
                onChange={(v) => onChange("replayButtonColor", v)}
                colors={BUTTON_COLORS}
                label="Cor do Botao"
              />
            </div>
          </CollapsibleContent>
        </Collapsible>

        <Collapsible open={openSection === "background"} onOpenChange={() => toggleSection("background")}>
          <CollapsibleTrigger asChild>
            <button className="w-full flex items-center justify-between p-3 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded" style={{ backgroundColor: formData.replayBackgroundColor || "#4A8BB5" }} />
                <span className="text-white text-sm font-medium">Cor de Fundo da Pagina</span>
              </div>
              <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${openSection === "background" ? "rotate-180" : ""}`} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="p-4 bg-gray-900 rounded-b-lg space-y-4 border-x border-b border-gray-700">
              <ColorPicker
                value={formData.replayBackgroundColor || "#4A8BB5"}
                onChange={(v) => onChange("replayBackgroundColor", v)}
                colors={BG_COLORS}
                label="Cor de Fundo"
              />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}
