/**
 * Generates the fictitious demo illustrations (home slides and the seeded
 * products) as WebP files in `prisma/seed-media/`. The seed copies them to
 * the storage and registers them in the database (`prisma/seed-media.ts`).
 *
 * Run with `npm run media:generate`. The arts are vector illustrations in
 * the "Warm Editorial Atelier" palette, not photographs.
 */
import { mkdir, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import sharp from "sharp"

const OUT = join(process.cwd(), "prisma", "seed-media")

let uid = 0

/** Deterministic pseudo random generator, so the arts never change. */
function rng(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type GrainOptions = {
  seed: number
  count: number
  color: string
  opacity: number
  amp: number
  rx?: number
}

/** Wavy lines clipped to a rectangle, used as wood and leather grain. */
function grain(
  x: number,
  y: number,
  w: number,
  h: number,
  o: GrainOptions
): string {
  const id = `g${uid++}`
  const rand = rng(o.seed)
  let paths = ""
  for (let i = 0; i < o.count; i++) {
    const yy = y + (h * (i + rand() * 0.8)) / o.count
    const a = (rand() - 0.5) * o.amp
    paths += `<path d="M${x - 10} ${yy.toFixed(1)} Q${(x + w * 0.3).toFixed(1)} ${(yy + a).toFixed(1)} ${(x + w * 0.6).toFixed(1)} ${yy.toFixed(1)} T${x + w + 10} ${(yy + a / 2).toFixed(1)}"/>`
  }
  return `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${o.rx ?? 0}"/></clipPath><g clip-path="url(#${id})" fill="none" stroke="${o.color}" stroke-opacity="${o.opacity}" stroke-width="1.6">${paths}</g>`
}

const DEFS = `<defs>
<linearGradient id="walnut" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a5036"/><stop offset="1" stop-color="#4b2f1d"/></linearGradient>
<linearGradient id="oak" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d6b080"/><stop offset="1" stop-color="#b08550"/></linearGradient>
<linearGradient id="brass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f0d594"/><stop offset=".5" stop-color="#c49a4a"/><stop offset="1" stop-color="#8f6a2a"/></linearGradient>
<linearGradient id="brassV" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3dc9f"/><stop offset=".5" stop-color="#c9a050"/><stop offset="1" stop-color="#8f6a2a"/></linearGradient>
<linearGradient id="leatherCaramel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b87740"/><stop offset="1" stop-color="#86501f"/></linearGradient>
<linearGradient id="leatherCognac" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8a4a26"/><stop offset="1" stop-color="#4f2813"/></linearGradient>
<linearGradient id="graphite" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#50545a"/><stop offset=".5" stop-color="#2a2c2d"/><stop offset="1" stop-color="#3b3e40"/></linearGradient>
<linearGradient id="graphiteLight" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8d9296"/><stop offset=".5" stop-color="#5a5e61"/><stop offset="1" stop-color="#76797c"/></linearGradient>
<linearGradient id="resin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a6b55"/><stop offset=".45" stop-color="#17382b"/><stop offset="1" stop-color="#0c2118"/></linearGradient>
<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f8e6a8"/><stop offset="1" stop-color="#c2963d"/></linearGradient>
<linearGradient id="spineShade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".38"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>
<linearGradient id="gloss" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></linearGradient>
<linearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe4b0" stop-opacity=".62"/><stop offset="1" stop-color="#ffe4b0" stop-opacity="0"/></linearGradient>
<radialGradient id="warm"><stop offset="0" stop-color="#ffe2a8" stop-opacity=".85"/><stop offset="1" stop-color="#ffe2a8" stop-opacity="0"/></radialGradient>
<radialGradient id="vignette" cx=".5" cy=".5" r=".75"><stop offset=".6" stop-color="#3c2814" stop-opacity="0"/><stop offset="1" stop-color="#3c2814" stop-opacity=".2"/></radialGradient>
<filter id="blur6" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="6"/></filter>
<filter id="blur14" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="14"/></filter>
<filter id="blur30" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="30"/></filter>
</defs>`

/** Soft studio backdrop with a vignette. */
function backdrop(w: number, h: number, top: string, bottom: string): string {
  const id = `bg${uid++}`
  return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient><rect width="${w}" height="${h}" fill="url(#${id})"/><rect width="${w}" height="${h}" fill="url(#vignette)"/>`
}

/** Leather notebook, front view, centred on the origin (340 x 470). */
function notebook(): string {
  const lines = [236.5, 238.5, 240]
    .map(
      (y) =>
        `<line x1="-150" y1="${y}" x2="170" y2="${y}" stroke="#d6c8ac" stroke-width=".8"/>`
    )
    .join("")
  return `
<ellipse cx="14" cy="252" rx="230" ry="24" fill="#3b2a1a" opacity=".3" filter="url(#blur14)"/>
<rect x="-160" y="-222" width="338" height="463" rx="6" fill="#efe6d3"/>
${lines}
<line x1="173" y1="-214" x2="173" y2="232" stroke="#d6c8ac" stroke-width=".8"/>
<line x1="176" y1="-214" x2="176" y2="232" stroke="#d6c8ac" stroke-width=".8"/>
<path d="M56 233 L56 312 L68 297 L80 312 L80 233 Z" fill="#7b2a26"/>
<path d="M56 233 L56 312 L62 304 L62 233 Z" fill="#000" opacity=".18"/>
<rect x="-170" y="-235" width="340" height="470" rx="9" fill="url(#leatherCaramel)"/>
${grain(-170, -235, 340, 470, { seed: 11, count: 46, color: "#3a2210", opacity: 0.1, amp: 8, rx: 9 })}
<rect x="-170" y="-235" width="340" height="470" rx="9" fill="url(#gloss)"/>
<rect x="-170" y="-235" width="70" height="470" rx="9" fill="url(#spineShade)"/>
<line x1="-132" y1="-215" x2="-132" y2="215" stroke="#3a2210" stroke-opacity=".35" stroke-width="3" stroke-dasharray="9 7" stroke-linecap="round" transform="translate(1.5 1.5)"/>
<line x1="-132" y1="-215" x2="-132" y2="215" stroke="#f0d9a8" stroke-width="3" stroke-dasharray="9 7" stroke-linecap="round"/>
<rect x="-90" y="150" width="70" height="52" rx="3" fill="none" stroke="#2e1a0b" stroke-opacity=".3" stroke-width="2"/>
<rect x="-82" y="158" width="54" height="36" rx="2" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width="1.5"/>
<rect x="104" y="-235" width="16" height="470" fill="#26282a"/>
<rect x="104" y="-235" width="4" height="470" fill="#fff" opacity=".18"/>`
}

/** Fountain pen lying horizontally, centred on the origin (600 long). */
function pen(): string {
  return `
<ellipse cx="0" cy="40" rx="290" ry="12" fill="#10241b" opacity=".35" filter="url(#blur14)"/>
<rect x="-300" y="-22" width="360" height="44" rx="22" fill="url(#resin)"/>
<rect x="-300" y="-22" width="14" height="44" rx="7" fill="url(#brassV)"/>
<rect x="-240" y="-30" width="170" height="9" rx="4" fill="url(#brass)"/>
<rect x="-40" y="-22" width="12" height="44" fill="url(#brassV)"/>
<rect x="0" y="-22" width="8" height="44" fill="url(#brassV)"/>
<rect x="-290" y="-17" width="340" height="5" rx="2.5" fill="#fff" opacity=".22"/>
<path d="M60 -20 L158 -14 L158 14 L60 20 Z" fill="#0f261c"/>
<path d="M60 -20 L158 -14 L158 -9 L60 -14 Z" fill="#fff" opacity=".12"/>
<rect x="158" y="-15" width="10" height="30" rx="3" fill="url(#brassV)"/>
<path d="M168 -11 L238 -10 Q280 -6 304 0 Q280 6 238 10 L168 11 Z" fill="url(#gold)"/>
<path d="M226 0 L302 0" stroke="#6b4c14" stroke-width="2.2" stroke-linecap="round"/>
<circle cx="230" cy="0" r="4.5" fill="#6b4c14"/>
<path d="M176 -8 L236 -7" stroke="#fff" stroke-opacity=".55" stroke-width="2.4" stroke-linecap="round"/>`
}

/** Walnut desk organizer, top view, centred on the origin (640 x 440). */
function organizer(): string {
  const recess = (x: number, y: number, w: number, h: number) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="9" fill="#2a170c"/><rect x="${x + 4}" y="${y + 9}" width="${w - 8}" height="${h - 13}" rx="6" fill="#3c2414"/>`
  return `
<rect x="-300" y="-190" width="640" height="440" rx="16" fill="#2e1c0f" opacity=".35" filter="url(#blur30)"/>
<rect x="-320" y="-220" width="640" height="440" rx="16" fill="url(#walnut)"/>
${grain(-320, -220, 640, 440, { seed: 5, count: 64, color: "#1e0f06", opacity: 0.16, amp: 14, rx: 16 })}
<rect x="-320" y="-220" width="640" height="440" rx="16" fill="url(#gloss)"/>
${recess(-290, -190, 260, 220)}
${recess(-10, -190, 150, 220)}
${recess(160, -190, 130, 220)}
${recess(-290, 62, 580, 128)}
<rect x="-290" y="38" width="580" height="8" rx="4" fill="url(#brass)"/>
<g transform="rotate(-4 -160 -80)">
<rect x="-262" y="-166" width="200" height="160" rx="3" fill="#fbf9f5"/>
<g stroke="#c9bfa9" stroke-width="1.4"><line x1="-246" y1="-130" x2="-80" y2="-130"/><line x1="-246" y1="-106" x2="-80" y2="-106"/><line x1="-246" y1="-82" x2="-80" y2="-82"/><line x1="-246" y1="-58" x2="-80" y2="-58"/><line x1="-246" y1="-34" x2="-120" y2="-34"/></g>
<rect x="-262" y="-166" width="200" height="14" fill="#4a6353"/>
</g>
<g transform="translate(70 -80)">
<circle cx="0" cy="0" r="48" fill="#2a170c"/>
<rect x="-6" y="-86" width="12" height="150" rx="6" fill="url(#brassV)" transform="rotate(14)"/>
<rect x="-6" y="-80" width="12" height="150" rx="6" fill="#26282a" transform="rotate(-10)"/>
</g>
<g transform="translate(225 -80)">
<circle cx="-20" cy="-30" r="18" fill="none" stroke="#c9a050" stroke-width="4"/>
<circle cx="22" cy="10" r="18" fill="none" stroke="#c9a050" stroke-width="4"/>
<rect x="-34" y="46" width="64" height="40" rx="4" fill="#dce5dd"/>
</g>
<rect x="-270" y="82" width="520" height="14" rx="7" fill="#17382b"/>
<rect x="-250" y="110" width="500" height="14" rx="7" fill="#26282a"/>
<rect x="-230" y="138" width="470" height="14" rx="7" fill="url(#brassV)"/>
<rect x="-270" y="82" width="520" height="4" rx="2" fill="#fff" opacity=".2"/>
<rect x="-250" y="110" width="500" height="4" rx="2" fill="#fff" opacity=".2"/>`
}

/** Articulated brass lamp, origin at the centre of the base. */
function lamp(withBeam = true): string {
  const arm = (x1: number, y1: number, x2: number, y2: number, w: number) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="url(#brass)" stroke-width="${w}" stroke-linecap="round"/><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#fff" stroke-opacity=".28" stroke-width="2" stroke-linecap="round" transform="translate(-2 -2)"/>`
  const beam = withBeam
    ? `<g transform="translate(-300 -430) rotate(-10)"><polygon points="-52,4 52,4 200,430 -200,430" fill="url(#beam)"/></g>`
    : ""
  return `
${beam}
<ellipse cx="0" cy="8" rx="130" ry="20" fill="#2e1c0f" opacity=".4" filter="url(#blur14)"/>
<ellipse cx="0" cy="-2" rx="112" ry="24" fill="#8f6a2a"/>
<ellipse cx="0" cy="-12" rx="112" ry="24" fill="url(#brass)"/>
<ellipse cx="0" cy="-16" rx="86" ry="15" fill="#fff" opacity=".16"/>
${arm(0, -22, -110, -300, 16)}
${arm(14, -22, -96, -300, 8)}
${arm(-110, -300, -312, -500, 14)}
${arm(-98, -292, -300, -494, 7)}
<circle cx="-110" cy="-300" r="22" fill="url(#brass)"/>
<circle cx="-110" cy="-300" r="9" fill="#6e4f1d"/>
<g transform="translate(-300 -430) rotate(-10)">
<circle cx="0" cy="-70" r="14" fill="url(#brass)"/>
<path d="M-60 0 Q-60 -62 0 -66 Q60 -62 60 0 Z" fill="url(#brass)"/>
<path d="M-46 -8 Q-44 -46 -8 -56" fill="none" stroke="#fff" stroke-opacity=".4" stroke-width="5" stroke-linecap="round"/>
<ellipse cx="0" cy="3" rx="58" ry="8" fill="#6e4f1d"/>
<ellipse cx="0" cy="6" rx="36" ry="9" fill="#fff6dc"/>
<circle cx="0" cy="10" r="54" fill="url(#warm)" opacity=".7"/>
</g>`
}

/** Executive leather armchair, front view, origin on the floor, centred. */
function armchair(): string {
  const arm = (side: 1 | -1) => {
    const x = side * 249
    return `<rect x="${x - 26}" y="-345" width="52" height="222" rx="10" fill="url(#walnut)"/><rect x="${x - 43}" y="-362" width="86" height="36" rx="18" fill="url(#walnut)"/><rect x="${x - 36}" y="-358" width="72" height="6" rx="3" fill="#fff" opacity=".2"/>`
  }
  const leg = (side: 1 | -1) =>
    `<path d="M${side * 185} -126 L${side * 170} -10 Q${side * 170} 0 ${side * 160} 0 L${side * 140} 0 Q${side * 130} 0 ${side * 130} -10 L${side * 130} -126 Z" fill="url(#walnut)"/>`
  return `
<ellipse cx="0" cy="8" rx="300" ry="30" fill="#2e1c0f" opacity=".32" filter="url(#blur14)"/>
<rect x="-152" y="-126" width="26" height="124" rx="6" fill="#3b2415"/>
<rect x="126" y="-126" width="26" height="124" rx="6" fill="#3b2415"/>
<path d="M-205 -215 L-195 -560 Q-190 -625 -120 -625 L120 -625 Q190 -625 195 -560 L205 -215 Z" fill="url(#leatherCognac)"/>
${grain(-205, -625, 410, 410, { seed: 21, count: 40, color: "#1e0d05", opacity: 0.12, amp: 8 })}
<path d="M-190 -515 Q0 -495 190 -515" fill="none" stroke="#1e0d05" stroke-opacity=".5" stroke-width="3"/>
<path d="M-192 -420 Q0 -400 192 -420" fill="none" stroke="#1e0d05" stroke-opacity=".5" stroke-width="3"/>
<path d="M-180 -585 Q-120 -612 0 -610" fill="none" stroke="#fff" stroke-opacity=".2" stroke-width="8" stroke-linecap="round"/>
<path d="M-205 -215 L-195 -560 Q-190 -625 -120 -625 L120 -625 Q190 -625 195 -560 L205 -215 Z" fill="url(#gloss)"/>
${leg(-1)}${leg(1)}
${arm(-1)}
<rect x="-215" y="-235" width="430" height="110" rx="34" fill="url(#leatherCognac)"/>
${grain(-215, -235, 430, 110, { seed: 33, count: 18, color: "#1e0d05", opacity: 0.12, amp: 6, rx: 34 })}
<path d="M-190 -198 Q0 -182 190 -198" fill="none" stroke="#1e0d05" stroke-opacity=".5" stroke-width="3"/>
<path d="M-170 -226 Q0 -238 170 -226" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="6" stroke-linecap="round"/>
${arm(1)}`
}

/** Electric height-adjustable oak desk, front view, origin on the floor. */
function desk(withDimension: boolean): string {
  const leg = (side: 1 | -1) => {
    const x = side * 300
    return `<rect x="${x - 20}" y="-470" width="40" height="224" fill="url(#graphite)"/><rect x="${x - 15}" y="-250" width="30" height="226" fill="url(#graphiteLight)"/><rect x="${x - 15}" y="-250" width="30" height="6" fill="#000" opacity=".3"/><rect x="${x - 62}" y="-24" width="124" height="24" rx="8" fill="url(#graphite)"/>`
  }
  const dim = withDimension
    ? `<g stroke="#4a6353" stroke-width="3" fill="none"><line x1="450" y1="-8" x2="450" y2="-514"/><path d="M438 -26 L450 -8 L462 -26"/><path d="M438 -496 L450 -514 L462 -496"/><line x1="430" y1="-8" x2="470" y2="-8"/><line x1="430" y1="-514" x2="470" y2="-514"/></g>`
    : ""
  return `
<ellipse cx="0" cy="8" rx="420" ry="26" fill="#2e1c0f" opacity=".28" filter="url(#blur14)"/>
${leg(-1)}${leg(1)}
<rect x="-330" y="-490" width="660" height="22" fill="url(#graphite)"/>
<rect x="-380" y="-520" width="760" height="34" rx="7" fill="url(#oak)"/>
${grain(-380, -520, 760, 34, { seed: 9, count: 12, color: "#6b4a22", opacity: 0.35, amp: 5, rx: 7 })}
<rect x="-380" y="-520" width="760" height="6" rx="3" fill="#fff" opacity=".28"/>
<rect x="228" y="-482" width="96" height="26" rx="6" fill="#1e2221"/>
<rect x="238" y="-474" width="26" height="10" rx="2" fill="#dce5dd"/>
<g fill="#8d9296"><circle cx="276" cy="-469" r="3.5"/><circle cx="288" cy="-469" r="3.5"/><circle cx="300" cy="-469" r="3.5"/><circle cx="312" cy="-469" r="3.5"/></g>
<rect x="-240" y="-528" width="220" height="8" rx="3" fill="#2a2c2d"/>
<rect x="-230" y="-690" width="200" height="164" rx="8" fill="#2a2c2d"/>
<rect x="-221" y="-681" width="182" height="146" rx="3" fill="#dfe6e1"/>
<rect x="-221" y="-681" width="182" height="146" rx="3" fill="url(#gloss)"/>
<rect x="-205" y="-660" width="80" height="8" rx="3" fill="#4a6353" opacity=".7"/>
<rect x="-205" y="-640" width="140" height="6" rx="3" fill="#7a5c4c" opacity=".35"/>
<rect x="-205" y="-624" width="120" height="6" rx="3" fill="#7a5c4c" opacity=".35"/>
${dim}`
}

/** Builds a complete SVG document. */
function svgDoc(
  viewBox: [number, number, number, number],
  outW: number,
  outH: number,
  body: string
): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${outW}" height="${outH}" viewBox="${viewBox.join(" ")}">${DEFS}${body}</svg>`
}

type ProductArt = {
  slug: string
  body: string
  detail: [number, number, number, number]
}

const PRODUCT_ARTS: ProductArt[] = [
  {
    slug: "caderno-couro-toscano-a5",
    body: `${backdrop(800, 1000, "#efe3d8", "#e0cfbc")}<g transform="translate(400 470) scale(1.4)">${notebook()}</g>`,
    detail: [150, 540, 368, 460],
  },
  {
    slug: "caneta-tinteiro-heritage",
    body: `${backdrop(800, 1000, "#dce5dd", "#c6d3c8")}
<g transform="translate(400 540) rotate(-6)"><rect x="-262" y="-330" width="540" height="650" rx="4" fill="#1e2221" opacity=".16" filter="url(#blur14)"/><rect x="-270" y="-340" width="540" height="650" rx="3" fill="#fbf9f5"/>${[
      -250, -200, -150, -100, -50, 0, 50, 100, 150, 200, 250,
    ]
      .map(
        (y) =>
          `<line x1="-240" y1="${y}" x2="240" y2="${y}" stroke="#c9d3c9" stroke-width="1.6"/>`
      )
      .join("")}</g>
<g transform="translate(400 520) rotate(-32) scale(1.2)">${pen()}</g>`,
    detail: [489, 183, 300, 375],
  },
  {
    slug: "organizador-modular-nogueira",
    body: `${backdrop(800, 1000, "#f4f1ea", "#e2d9c9")}<g transform="translate(400 500) scale(1.15)">${organizer()}</g>`,
    detail: [460, 350, 320, 400],
  },
  {
    slug: "luminaria-articulada-latao",
    body: `${backdrop(800, 1000, "#efe8dc", "#dcd0bc")}
<ellipse cx="338" cy="900" rx="240" ry="38" fill="url(#warm)"/>
<g transform="translate(560 900)">${lamp()}</g>`,
    detail: [120, 250, 320, 400],
  },
  {
    slug: "poltrona-executiva-walnut",
    body: `${backdrop(800, 1000, "#e9e2d6", "#d6cbb9")}<g transform="translate(400 900) scale(1.2)">${armchair()}</g>`,
    detail: [40, 420, 360, 450],
  },
  {
    slug: "mesa-regulavel-carvalho",
    body: `${backdrop(800, 1000, "#f4f1ea", "#e1d9ca")}<g transform="translate(400 940) scale(.95)">${desk(true)}</g>`,
    detail: [440, 380, 336, 420],
  },
]

/** Home slide 1: author's desk with books, notebook, pen and lamp. */
function slideOne(): string {
  return `${backdrop(1600, 1000, "#efe7da", "#e2d6c2")}
<rect x="1010" y="90" width="400" height="500" fill="#fbf9f5" opacity=".6"/>
<g stroke="#7a5c4c" stroke-opacity=".5" stroke-width="4" fill="none"><rect x="1010" y="90" width="400" height="500"/><line x1="1210" y1="90" x2="1210" y2="590"/><line x1="1010" y1="340" x2="1410" y2="340"/></g>
<rect x="210" y="150" width="200" height="260" fill="#f4f1ea" stroke="#7a5c4c" stroke-width="6"/>
<rect x="240" y="180" width="140" height="200" fill="#dce5dd"/>
<path d="M240 340 L290 280 L330 320 L360 290 L380 310 L380 380 L240 380 Z" fill="#4a6353" opacity=".55"/>
<ellipse cx="1105" cy="560" rx="360" ry="260" fill="url(#warm)" opacity=".35"/>
<rect x="0" y="790" width="1600" height="210" fill="url(#walnut)"/>
<rect x="0" y="752" width="1600" height="40" fill="url(#oak)"/>
${grain(0, 752, 1600, 40, { seed: 3, count: 14, color: "#6b4a22", opacity: 0.35, amp: 6 })}
<rect x="0" y="752" width="1600" height="6" fill="#fff" opacity=".3"/>
<rect x="0" y="792" width="1600" height="10" fill="#000" opacity=".25"/>
<g transform="translate(360 0)">
<rect x="-160" y="712" width="320" height="40" rx="3" fill="#4a6353"/>
<rect x="-150" y="674" width="300" height="38" rx="3" fill="#7a5c4c"/>
<rect x="-165" y="638" width="330" height="36" rx="3" fill="#b9a487"/>
<g stroke="#e8cfa0" stroke-width="3"><line x1="-130" y1="722" x2="-130" y2="742"/><line x1="130" y1="722" x2="130" y2="742"/><line x1="-120" y1="684" x2="-120" y2="702"/></g>
</g>
<g transform="translate(790 600) scale(.62)">${notebook()}</g>
<g transform="translate(1000 742) scale(.3) rotate(-2)">${pen()}</g>
<g transform="translate(1340 752) scale(.78)">${lamp()}</g>`
}

/** Home slide 2: corporate office with desk, armchair and rug. */
function slideTwo(): string {
  return `${backdrop(1600, 1000, "#dce5dd", "#c9d6cb")}
<rect x="130" y="110" width="440" height="540" fill="#f7f4ec"/>
<g stroke="#4a6353" stroke-opacity=".55" stroke-width="5" fill="none"><rect x="130" y="110" width="440" height="540"/><line x1="350" y1="110" x2="350" y2="650"/><line x1="130" y1="380" x2="570" y2="380"/></g>
<rect x="1060" y="130" width="130" height="170" fill="#fbf9f5" stroke="#7a5c4c" stroke-width="5"/>
<rect x="1215" y="130" width="130" height="170" fill="#fbf9f5" stroke="#7a5c4c" stroke-width="5"/>
<rect x="1080" y="150" width="90" height="12" fill="#4a6353" opacity=".6"/>
<rect x="1235" y="150" width="90" height="12" fill="#7a5c4c" opacity=".5"/>
<rect x="0" y="770" width="1600" height="230" fill="#d9cdb9"/>
<rect x="0" y="758" width="1600" height="14" fill="#fbf9f5" opacity=".8"/>
<ellipse cx="860" cy="880" rx="620" ry="62" fill="#efe6d4"/>
<g transform="translate(640 790) scale(.8)">${desk(false)}</g>
<g transform="translate(1160 800) scale(.64)">${armchair()}</g>`
}

/**
 * Renders an SVG document to a WebP file, creating the folders.
 *
 * @param file - Destination path.
 * @param svg - SVG source.
 */
async function render(file: string, svg: string): Promise<void> {
  const data = await sharp(Buffer.from(svg))
    .webp({ quality: 80, effort: 5 })
    .toBuffer()
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, data)
  console.log(
    `${file.replace(OUT, "prisma/seed-media")}  ${Math.round(data.byteLength / 1024)} KB`
  )
}

await render(
  join(OUT, "content", "slide-1.webp"),
  svgDoc([0, 0, 1600, 1000], 1600, 1000, slideOne())
)
await render(
  join(OUT, "content", "slide-2.webp"),
  svgDoc([0, 0, 1600, 1000], 1600, 1000, slideTwo())
)
for (const art of PRODUCT_ARTS) {
  await render(
    join(OUT, "products", art.slug, "1.webp"),
    svgDoc([0, 0, 800, 1000], 1600, 2000, art.body)
  )
  await render(
    join(OUT, "products", art.slug, "2.webp"),
    svgDoc(art.detail, 1600, 2000, art.body)
  )
}
