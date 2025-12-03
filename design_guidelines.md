# Design Guidelines - Página de Webinar Builderall

## Abordagem de Design

**Design System:** Material Design adaptado para experiência de webinar
**Inspiração:** Zoom Webinar, Demio, plataformas modernas de streaming de eventos
**Princípio Central:** Maximizar visibilidade e engajamento com o webinar mantendo contexto profissional

## Layout e Estrutura

### Hierarquia de Seções
1. **Header compacto** (sticky) - Branding e navegação mínima
2. **Hero Section com Webinar Player** - Seção principal com iframe em destaque
3. **Informações do Webinar** - Detalhes, palestrante, agenda
4. **Benefícios/Takeaways** - O que os participantes aprenderão
5. **Call-to-Action** - Registro de email ou próximos passos
6. **Footer** - Links úteis e informações de contato

### Sistema de Espaçamento
Unidades Tailwind: **4, 8, 12, 16** para consistência vertical e horizontal
- Seções desktop: `py-16` a `py-20`
- Seções mobile: `py-8` a `py-12`
- Espaçamento interno de componentes: `p-4` a `p-8`

## Tipografia

**Fontes:** Google Fonts
- **Primária:** Inter ou Poppins (moderna, legível) - headings e UI
- **Secundária:** System font stack - corpo de texto

**Hierarquia:**
- H1 (Título Principal): `text-4xl md:text-5xl lg:text-6xl` - `font-bold`
- H2 (Seções): `text-3xl md:text-4xl` - `font-semibold`
- H3 (Subtítulos): `text-xl md:text-2xl` - `font-semibold`
- Body: `text-base md:text-lg` - `font-normal`
- Small text: `text-sm` - detalhes e metadados

## Biblioteca de Componentes

### Header
- Design: Barra fixa superior (`sticky top-0`)
- Conteúdo: Logo do webinar/marca, horário do evento, botão CTA secundário
- Altura: `h-16` desktop, `h-14` mobile
- Backdrop blur para scroll sobre conteúdo

### Webinar Player Section
- Container: `max-w-6xl` centralizado
- Aspect Ratio: Iframe em container 16:9 responsivo
- Padding generoso: `px-4 py-12 md:py-16`
- Iframe ocupa largura total do container em mobile, 85% em desktop
- Acima do player: Badge de "AO VIVO" ou "GRAVAÇÃO" com pulse animation
- Abaixo do player: Título do webinar, data/hora, contador de participantes

### Info Cards (3 colunas em desktop, stack em mobile)
- Grid: `grid-cols-1 md:grid-cols-3 gap-6`
- Cards com: Ícone, título, descrição curta
- Ícones: Heroicons via CDN
- Elevation: Sombra sutil `shadow-md` com hover `shadow-lg`
- Padding interno: `p-6`

### Benefícios/Takeaways
- Layout: Lista com ícones de check
- 2 colunas em desktop (`md:grid-cols-2`), stack em mobile
- Cada item: Ícone + texto descritivo
- Espaçamento entre itens: `gap-4`

### CTA Section
- Background: Contraste forte
- Layout: Centrado verticalmente e horizontalmente
- Botão primário: Grande, `px-8 py-4`, `rounded-lg`
- Texto de suporte acima e abaixo do botão
- Opcional: Campo de email + botão para captura de leads

### Footer
- Layout: 2-3 colunas em desktop, stack em mobile
- Conteúdo: Links rápidos, informações de contato, redes sociais
- Ícones sociais: Font Awesome via CDN
- Copyright e disclaimers

## Responsividade

### Breakpoints Tailwind
- Mobile-first: Base styles para mobile
- Tablet: `md:` (768px+)
- Desktop: `lg:` (1024px+)

### Player Responsivo
```
Container com aspect-ratio 16:9
Mobile: w-full
Tablet: w-11/12
Desktop: w-10/12 max
```

### Ajustes Críticos
- Header reduz altura em mobile
- Grid de 3 colunas vira stack
- Texto reduz 1-2 tamanhos
- Padding/margin reduzido em 50%

## Ícones e Assets

**Biblioteca:** Heroicons via CDN
**Uso:**
- Check marks para listas de benefícios
- Clock/Calendar para informações de horário
- User/Users para contador de participantes
- Play para indicar conteúdo de vídeo
- ChevronDown para scroll indicators

## Imagens

**Hero Background (opcional):**
- Imagem de fundo sutil com overlay escuro (opacity-60) atrás do player
- Tema: Profissional, tecnologia, networking ou abstrato
- Uso: Apenas como background atmosférico, nunca competindo com o player

**Palestrante:**
- Photo circular do apresentador (rounded-full, w-24 h-24 md:w-32 md:h-32)
- Localização: Seção de informações do webinar
- Style: Border com leve shadow

**Sem hero image tradicional** - O webinar player É o hero

## Animações

**Minimalistas e Funcionais:**
- Pulse animation no badge "AO VIVO"
- Smooth scroll para navegação interna
- Fade-in suave ao carregar seções (intersection observer)
- Hover states sutis em cards (transform scale-105)

**Proibido:** Animações que distraiam do webinar

## Acessibilidade

- Contraste WCAG AA em todo texto
- Labels em formulários
- Alt text descritivo
- Keyboard navigation funcional
- Focus states visíveis em todos elementos interativos

## Considerações Específicas

- **Prioridade máxima:** Webinar player deve ser imediatamente visível
- **Load performance:** Iframe lazy-load opcional se houver muito conteúdo acima
- **Mobile:** Player responsivo que não quebre em telas pequenas
- **Engagement:** Clear CTAs para compartilhamento e registro
- **Trust signals:** Contador de participantes, badges, testimonials breves se aplicável