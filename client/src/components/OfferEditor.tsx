import { useState, useRef, useEffect } from "react";
import { Check, GripVertical, Trash2, Plus, ImageIcon, Upload, CreditCard, MousePointer, ChevronDown, ExternalLink } from "lucide-react";
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
import RichTextEditor from "./RichTextEditor";
import GlobalToolbar from "./GlobalToolbar";

interface OfferEditorProps {
  formData: {
    offerBadgeText: string;
    offerTitle: string;
    offerTitleColor: string;
    offerSubtitle: string;
    offerSubtitleColor: string;
    offerImageUrl: string;
    offerPriceText: string;
    offerPriceBorderColor: string;
    offerPriceBoxBgColor: string;
    offerPriceBoxShadow: boolean;
    offerPriceBoxPadding: string;
    offerPriceIconColor: string;
    offerPriceHighlightColor: string;
    offerPriceLabel: string;
    offerButtonText: string;
    offerButtonUrl: string;
    offerButtonColor: string;
    offerButtonSize: string;
    offerButtonShadow: boolean;
    offerButtonTextColor: string;
    countdownColor: string;
    pageBackgroundColor: string;
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
        data-testid={`drag-handle-${index}`}
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
        <RichTextEditor
          value={benefit}
          onChange={(v) => onEdit(index, v)}
          placeholder="Clique para editar beneficio..."
          className="text-sm md:text-base font-medium text-white"
          testId={`input-benefit-${index}`}
        />
      </div>
      
      <button
        onClick={() => onDelete(index)}
        className="p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/20 rounded flex-shrink-0"
        data-testid={`delete-benefit-${index}`}
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
  return (
    <div className="space-y-2">
      <Label className="text-white text-xs font-medium">{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-8 h-8 rounded cursor-pointer border border-gray-600 flex-shrink-0"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 h-8 text-xs"
        />
      </div>
      <div className="flex flex-wrap gap-1">
        {colors.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className={`w-6 h-6 rounded transition-transform hover:scale-110 ${value === c ? "ring-2 ring-white" : ""}`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
    </div>
  );
}

function SizeSelector({ value, onChange, sizes, label }: {
  value: string;
  onChange: (v: string) => void;
  sizes: { value: string; label: string }[];
  label: string;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-white text-xs font-medium">{label}</Label>
      <div className="flex gap-1">
        {sizes.map((size) => (
          <button
            key={size.value}
            type="button"
            onClick={() => onChange(size.value)}
            className={`flex-1 py-2 px-2 rounded text-xs font-bold transition-all ${
              value === size.value 
                ? "bg-green-500 text-white" 
                : "bg-gray-700 text-white hover:bg-gray-600"
            }`}
          >
            {size.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function OfferEditor({ formData, benefitsList, onChange, onBenefitsChange, onImageUpload }: OfferEditorProps) {
  const [showImageInput, setShowImageInput] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = benefitsList.findIndex((_, i) => `benefit-${i}` === active.id);
      const newIndex = benefitsList.findIndex((_, i) => `benefit-${i}` === over.id);
      onBenefitsChange(arrayMove(benefitsList, oldIndex, newIndex));
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onImageUpload) return;
    
    setUploading(true);
    try {
      const url = await onImageUpload(file);
      onChange("offerImageUrl", url);
      setShowImageInput(false);
    } catch (error) {
      console.error("Erro no upload:", error);
    } finally {
      setUploading(false);
    }
  };

  const toggleSection = (section: string) => {
    setOpenSection(openSection === section ? null : section);
  };

  const BUTTON_COLORS = ["#22c55e", "#16a34a", "#10b981", "#84cc16", "#eab308", "#f59e0b", "#ef4444", "#3b82f6", "#8b5cf6", "#ec4899"];
  const BORDER_COLORS = ["#84cc16", "#22c55e", "#10b981", "#eab308", "#f59e0b", "#ef4444", "#3b82f6", "#8b5cf6"];
  const TEXT_COLORS = ["#ffffff", "#000000", "#1f2937", "#fef3c7"];

  return (
    <div className="space-y-6">
      {/* Barra de Formatacao Global */}
      <div className="sticky top-0 z-50 mb-4">
        <GlobalToolbar />
        <p className="text-center text-xs text-gray-400 mt-1">Selecione o texto e clique nos botoes para formatar</p>
      </div>

      {/* Preview da Oferta */}
      <div 
        className="rounded-xl p-4 md:p-8 text-center"
        style={{
          background: "linear-gradient(135deg, rgba(0, 0, 0, 0.5) 0%, rgba(0, 0, 0, 0.4) 100%)",
          backdropFilter: "blur(10px)",
          border: "1px solid rgba(255, 255, 255, 0.2)",
        }}
      >
        {/* Badge */}
        <div className="mb-4">
          <span 
            className="inline-block px-3 py-1 rounded-full"
            style={{ 
              backgroundColor: formData.countdownColor || "#FFD700",
            }}
          >
            <RichTextEditor
              value={formData.offerBadgeText}
              onChange={(v) => onChange("offerBadgeText", v)}
              placeholder="BADGE DA OFERTA"
              className="text-xs font-bold"
              style={{ color: "#2c3e50" }}
              testId="badge-offer"
            />
          </span>
        </div>

        {/* Titulo */}
        <div className="mb-2">
          <RichTextEditor
            value={formData.offerTitle}
            onChange={(v) => onChange("offerTitle", v)}
            placeholder="TITULO DA OFERTA"
            className="text-xl md:text-3xl font-bold"
            style={{ color: formData.offerTitleColor || "#ffffff" }}
            testId="text-offer-title"
          />
        </div>
        
        {/* Subtitulo */}
        <div className="mb-6">
          <RichTextEditor
            value={formData.offerSubtitle}
            onChange={(v) => onChange("offerSubtitle", v)}
            placeholder="Subtitulo da oferta"
            className="text-sm md:text-base font-medium"
            style={{ color: formData.offerSubtitleColor || "#ffffff" }}
            testId="text-offer-subtitle"
          />
        </div>

        {/* Imagem */}
        <div className="mb-6">
          {formData.offerImageUrl ? (
            <div className="relative inline-block group">
              <img 
                src={formData.offerImageUrl} 
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
                  onClick={() => onChange("offerImageUrl", "")}
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
                data-testid="button-upload-offer-image"
              >
                <Upload className="h-4 w-4 mr-2" />
                {uploading ? "Enviando..." : "Upload"}
              </Button>
              <Input
                value={formData.offerImageUrl}
                onChange={(e) => onChange("offerImageUrl", e.target.value)}
                placeholder="Ou cole a URL aqui"
                className="text-xs bg-white/10 border-white/20 text-white placeholder:text-white/40"
                data-testid="input-offer-image-url"
              />
              <Button size="sm" className="w-full mt-2 text-white font-semibold" onClick={() => setShowImageInput(false)} data-testid="button-close-offer-image-modal">
                Fechar
              </Button>
            </div>
          )}
        </div>

        {/* Beneficios */}
        <div 
          className="mb-6 text-left max-w-lg mx-auto p-4 rounded-xl space-y-3"
          style={{ 
            backgroundColor: "rgba(0, 0, 0, 0.4)",
            border: "1px solid rgba(255, 255, 255, 0.2)"
          }}
        >
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={benefitsList.map((_, i) => `benefit-${i}`)} strategy={verticalListSortingStrategy}>
              {benefitsList.map((benefit, index) => (
                <SortableBenefit
                  key={`benefit-${index}`}
                  id={`benefit-${index}`}
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

        {/* Caixa de Preco */}
        <div 
          className="mb-6 max-w-lg mx-auto rounded-xl text-center"
          style={{ 
            backgroundColor: formData.offerPriceBoxBgColor || "rgba(0,0,0,0.3)",
            border: `3px solid ${formData.offerPriceBorderColor || "#84cc16"}`,
            boxShadow: formData.offerPriceBoxShadow !== false 
              ? `0 0 30px ${formData.offerPriceBorderColor || "#84cc16"}40` 
              : "none",
            padding: formData.offerPriceBoxPadding === "sm" ? "12px" 
              : formData.offerPriceBoxPadding === "lg" ? "28px" 
              : formData.offerPriceBoxPadding === "xl" ? "36px" 
              : "20px"
          }}
        >
          <div className="flex items-center justify-center gap-2 mb-2">
            <CreditCard className="h-4 w-4" style={{ color: formData.offerPriceIconColor || "#84cc16" }} />
            <RichTextEditor
              value={formData.offerPriceLabel || "INVESTIMENTO"}
              onChange={(v) => onChange("offerPriceLabel", v)}
              placeholder="INVESTIMENTO"
              className="text-xs font-bold uppercase tracking-wider"
              style={{ color: formData.offerPriceIconColor || "#84cc16" }}
              testId="text-offer-price-label"
            />
          </div>
          <RichTextEditor
            value={formData.offerPriceText}
            onChange={(v) => onChange("offerPriceText", v)}
            placeholder="O valor da inscricao e 12x R$ XX,XX..."
            className="text-sm md:text-base font-semibold"
            style={{ color: "#ffffff" }}
            testId="text-offer-price"
          />
        </div>

        {/* Botao CTA */}
        <div 
          className="w-full max-w-lg mx-auto rounded-xl text-center cursor-text"
          style={{ 
            backgroundColor: formData.offerButtonColor || "#22c55e",
            color: formData.offerButtonTextColor || "#fff",
            boxShadow: formData.offerButtonShadow !== false 
              ? `0 10px 40px ${formData.offerButtonColor || "#22c55e"}60` 
              : "none",
            border: `3px solid ${formData.offerButtonColor || "#22c55e"}`,
            padding: formData.offerButtonSize === "sm" ? "12px 20px" 
              : formData.offerButtonSize === "xl" ? "32px 40px" 
              : formData.offerButtonSize === "md" ? "16px 28px"
              : "24px 36px"
          }}
        >
          <RichTextEditor
            value={formData.offerButtonText}
            onChange={(v) => onChange("offerButtonText", v)}
            placeholder="FAZER MINHA INSCRICAO AGORA"
            className="font-bold"
            style={{ 
              color: formData.offerButtonTextColor || "#fff",
              fontSize: formData.offerButtonSize === "sm" ? "14px" 
                : formData.offerButtonSize === "xl" ? "24px" 
                : formData.offerButtonSize === "md" ? "16px"
                : "20px"
            }}
            testId="text-button-offer"
          />
        </div>

        {/* URL do Botao */}
        <div className="mt-3 max-w-lg mx-auto">
          <div className="flex items-center gap-2">
            <Input
              value={formData.offerButtonUrl}
              onChange={(e) => onChange("offerButtonUrl", e.target.value)}
              placeholder="https://link-do-checkout.com"
              className="flex-1 text-xs"
            />
            {formData.offerButtonUrl && (
              <a href={formData.offerButtonUrl} target="_blank" rel="noopener noreferrer">
                <Button size="icon" variant="ghost" className="h-8 w-8">
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Paineis de Configuracao */}
      <div className="space-y-2">
        {/* Botao CTA */}
        <Collapsible open={openSection === "button"} onOpenChange={() => toggleSection("button")}>
          <CollapsibleTrigger asChild>
            <button className="w-full flex items-center justify-between p-3 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded" style={{ backgroundColor: formData.offerButtonColor || "#22c55e" }} />
                <span className="text-white text-sm font-medium">Estilo do Botao</span>
              </div>
              <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${openSection === "button" ? "rotate-180" : ""}`} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="p-4 bg-gray-900 rounded-b-lg space-y-4 border-x border-b border-gray-700">
              <SizeSelector
                value={formData.offerButtonSize || "lg"}
                onChange={(v) => onChange("offerButtonSize", v)}
                sizes={[
                  { value: "sm", label: "P" },
                  { value: "md", label: "M" },
                  { value: "lg", label: "G" },
                  { value: "xl", label: "XG" }
                ]}
                label="Tamanho"
              />
              
              <div className="flex items-center justify-between">
                <Label className="text-white text-xs">Sombra</Label>
                <Switch
                  checked={formData.offerButtonShadow !== false}
                  onCheckedChange={(v) => onChange("offerButtonShadow", v)}
                />
              </div>

              <ColorPicker
                value={formData.offerButtonColor || "#22c55e"}
                onChange={(v) => onChange("offerButtonColor", v)}
                colors={BUTTON_COLORS}
                label="Cor do Botao"
              />

              <ColorPicker
                value={formData.offerButtonTextColor || "#ffffff"}
                onChange={(v) => onChange("offerButtonTextColor", v)}
                colors={TEXT_COLORS}
                label="Cor do Texto"
              />
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Caixa de Preco */}
        <Collapsible open={openSection === "price"} onOpenChange={() => toggleSection("price")}>
          <CollapsibleTrigger asChild>
            <button className="w-full flex items-center justify-between p-3 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded border-2" style={{ borderColor: formData.offerPriceBorderColor || "#84cc16" }} />
                <span className="text-white text-sm font-medium">Estilo da Caixa de Preco</span>
              </div>
              <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${openSection === "price" ? "rotate-180" : ""}`} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="p-4 bg-gray-900 rounded-b-lg space-y-4 border-x border-b border-gray-700">
              <SizeSelector
                value={formData.offerPriceBoxPadding || "md"}
                onChange={(v) => onChange("offerPriceBoxPadding", v)}
                sizes={[
                  { value: "sm", label: "P" },
                  { value: "md", label: "M" },
                  { value: "lg", label: "G" },
                  { value: "xl", label: "XG" }
                ]}
                label="Tamanho"
              />
              
              <div className="flex items-center justify-between">
                <Label className="text-white text-xs">Efeito de Brilho</Label>
                <Switch
                  checked={formData.offerPriceBoxShadow !== false}
                  onCheckedChange={(v) => onChange("offerPriceBoxShadow", v)}
                />
              </div>

              <ColorPicker
                value={formData.offerPriceBorderColor || "#84cc16"}
                onChange={(v) => onChange("offerPriceBorderColor", v)}
                colors={BORDER_COLORS}
                label="Cor da Borda"
              />

              <ColorPicker
                value={formData.offerPriceIconColor || "#84cc16"}
                onChange={(v) => onChange("offerPriceIconColor", v)}
                colors={BORDER_COLORS}
                label="Cor do Icone/Label"
              />

              <div className="space-y-2">
                <Label className="text-white text-xs font-medium">Fundo</Label>
                <div className="grid grid-cols-2 gap-1">
                  {[
                    { value: "rgba(0,0,0,0.3)", label: "Escuro" },
                    { value: "rgba(0,0,0,0.5)", label: "Mais Escuro" },
                    { value: "rgba(0,0,0,0.7)", label: "Muito Escuro" },
                    { value: "transparent", label: "Transparente" }
                  ].map((bg) => (
                    <button
                      key={bg.value}
                      type="button"
                      onClick={() => onChange("offerPriceBoxBgColor", bg.value)}
                      className={`py-2 px-3 rounded text-xs transition-all ${
                        (formData.offerPriceBoxBgColor || "rgba(0,0,0,0.3)") === bg.value
                          ? "bg-green-500 text-white"
                          : "bg-gray-700 text-white hover:bg-gray-600"
                      }`}
                    >
                      {bg.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Cores de Texto */}
        <Collapsible open={openSection === "colors"} onOpenChange={() => toggleSection("colors")}>
          <CollapsibleTrigger asChild>
            <button className="w-full flex items-center justify-between p-3 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-gradient-to-r from-white to-gray-400" />
                <span className="text-white text-sm font-medium">Cores de Texto</span>
              </div>
              <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${openSection === "colors" ? "rotate-180" : ""}`} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="p-4 bg-gray-900 rounded-b-lg space-y-4 border-x border-b border-gray-700">
              <ColorPicker
                value={formData.offerTitleColor || "#ffffff"}
                onChange={(v) => onChange("offerTitleColor", v)}
                colors={["#ffffff", "#f1f5f9", "#e2e8f0", "#eab308", "#22c55e", "#3b82f6"]}
                label="Cor do Titulo"
              />

              <ColorPicker
                value={formData.offerSubtitleColor || "#ffffff"}
                onChange={(v) => onChange("offerSubtitleColor", v)}
                colors={["#ffffff", "#f1f5f9", "#cbd5e1", "#94a3b8", "#eab308"]}
                label="Cor do Subtitulo"
              />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}
