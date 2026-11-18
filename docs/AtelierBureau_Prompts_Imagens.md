# Atelier Bureau: imagens de apresentação

Este documento registra quais imagens já estão aplicadas no projeto e traz os prompts das que ainda faltam. As imagens são **fictícias**, como o restante do catálogo de demonstração.

## 1. O que já está aplicado

O seed (`npm run db:seed`) cadastra as imagens abaixo. Ele só preenche o que está vazio, então produtos e slides que o admin já editou não são alterados.

| Onde | Quantidade | Origem |
|---|---|---|
| Slides da home (`slide-1`, `slide-2`) | 2 | `prisma/seed-media/content/` |
| Produtos do seed (6) | 2 por produto: visão geral e detalhe | `prisma/seed-media/products/<slug>/` |

- As artes são **ilustrações vetoriais** na paleta do "Warm Editorial Atelier", não fotografias. Foram geradas por `scripts/seed-media/generate.mts` (`npm run media:generate`), de forma determinística.
- O seed converte cada arte nas larguras de 320, 640, 1024 e 1600 px, com no máximo 300 KB por arquivo (RNF04), e grava em `storage/uploads/`. O banco guarda só a chave (`product_images.storage_key` e `content.home`).
- Para trocar por fotos reais, envie pelo admin: **Conteúdo da home** para os slides e o **formulário do produto** para os produtos. O seed não sobrescreve o que o admin cadastrou.

## 2. Estilo para qualquer imagem nova

Use este bloco como base em todos os prompts, para o conjunto ficar coeso.

```text
Editorial still life, soft diffused north-window light, warm neutral studio
backdrop (off-white #FBF9F5 to warm greige #E6DFD2), muted sage green (#4A6353)
and clay brown (#7A5C4C) as the only accent colors, natural materials (full-grain
leather, oiled walnut, brushed brass, oak), realistic textures, shallow depth of
field, calm and premium mood, generous negative space, no text, no logos, no
people, no watermark.
```

Regras de formato:

- Produto: retrato **4:5**, mínimo 1600 px de largura, produto centralizado com folga nas bordas (o cartão corta com `object-cover`).
- Slide: horizontal **16:10**, mínimo 1600 px de largura, assunto no centro (no celular a imagem é cortada em faixa larga).
- Formatos aceitos pelo admin: JPG, PNG ou WebP, até 10 MB.
- Todo envio precisa de texto alternativo em português, descrevendo a imagem.

## 3. Prompts das imagens que faltam

Estas imagens **não estão cadastradas** e dependem de geração externa.

### 3.1 Variações de cor ou madeira (hoje sem foto própria)

**Caderno em couro toscano A5, cor Grafite** (SKU `PAP-CAD-A5-GRA`), retrato 4:5:

```text
A5 notebook in graphite-grey vegetable-tanned leather, visible exposed stitching
on the spine, charcoal elastic band, dark red ribbon bookmark, front view on a
warm off-white backdrop. <bloco de estilo da seção 2>
```

**Organizador modular, acabamento Carvalho** (SKU `ORG-MOD-CAR`), retrato 4:5:

```text
Top-down view of a modular desk organizer in solid light oak with brushed brass
inlay strips, compartments holding a notepad, two fountain pens and paper clips.
<bloco de estilo da seção 2>
```

### 3.2 Fotos extras dos produtos (galeria)

Cada uma entra como 3ª ou 4ª foto do produto, retrato 4:5.

| Produto | Prompt (acrescente o bloco de estilo da seção 2) |
|---|---|
| Caderno em couro toscano A5 | `Open A5 leather notebook showing cream 90 gsm paper, a fountain pen resting across the pages, seen from slightly above.` |
| Caneta tinteiro Heritage | `Green resin fountain pen with brass trim and a gold-plated nib, uncapped, resting on a leather desk pad next to a small inkwell.` |
| Organizador modular em nogueira | `Walnut desk organizer in use on an executive desk, three-quarter angle, with a brass lamp softly out of focus in the background.` |
| Luminária articulada em latão | `Articulated brass desk lamp lit with a warm 3000 K glow over an open notebook, evening mood, dark walnut desk.` |
| Poltrona executiva em couro | `Cognac leather executive armchair with walnut frame in a quiet corporate office, window light from the side, three-quarter angle.` |
| Mesa com regulagem elétrica | `Oak electric height-adjustable desk raised to standing height, laptop and notebook on top, minimalist office, wide shot.` |

Sugestão de texto alternativo: descreva o objeto, o material e o ângulo, por exemplo "Caderno em couro toscano aberto, com caneta sobre as páginas".

### 3.3 Versão fotográfica dos slides da home

Troque as ilustrações atuais por fotos, horizontal 16:10.

**Slide 1, "O escritório como obra de autor":**

```text
Author's writing desk in oiled walnut, stack of cloth-bound books, leather
notebook, fountain pen and a lit brass articulated lamp, framed print on the wall,
tall window with soft light. <bloco de estilo da seção 2>
```

**Slide 2, "Cotação sob medida para a sua empresa":**

```text
Bright executive office with an oak height-adjustable desk and a cognac leather
armchair, sage green wall, large window, tidy and professional, wide angle.
<bloco de estilo da seção 2>
```

### 3.4 Imagens que o site ainda não usa

O código não tem campo ou rota para elas. Para usá-las, antes é preciso abrir uma issue.

- **Imagem de compartilhamento da home (Open Graph), 1200 × 630:** `Atelier Bureau brand mood: leather notebook, fountain pen and brass lamp on a walnut desk, large empty area on the left for a title. <bloco de estilo da seção 2>`
- **Imagem de cada categoria (6), 4:5:** uma por categoria, com o mesmo estilo. Categorias: Papelaria nobre, Escrita fina, Organização de mesa, Iluminação, Mobiliário ergonômico e Projetos B2B.
- **Ilustração de estado vazio (carrinho, busca sem resultado), 1:1:** `Minimal line illustration of an empty leather document folder, sage green line on warm off-white, lots of whitespace, no text.`
