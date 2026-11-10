"use client"

import { InfoIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Chip } from "@/components/ui/chip"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

const finishes = [
  { value: "nogueira", label: "Nogueira" },
  { value: "carvalho", label: "Carvalho" },
  { value: "latao", label: "Latão escovado" },
]

/**
 * Gallery with every base component and its states (default, hover,
 * focus, disabled and error), for design review (#15).
 *
 * @returns The gallery content.
 */
export function ComponentsView() {
  return (
    <main className="mx-auto flex w-full max-w-page flex-col gap-xl px-margin-mobile py-xl md:px-margin-tablet lg:px-margin">
      <header className="flex flex-col gap-sm">
        <p className="text-caps text-clay uppercase">Design system</p>
        <h1 className="text-headline-xl-mobile lg:text-headline-xl">
          Componentes base
        </h1>
        <p className="text-body text-ink-muted">
          Use Tab, Shift+Tab, Enter, Espaço e as setas para conferir a navegação
          por teclado.
        </p>
      </header>

      <section className="flex flex-col gap-md" aria-labelledby="botoes">
        <h2 id="botoes" className="text-headline-md">
          Botões
        </h2>
        <div className="flex flex-wrap items-center gap-md">
          <Button>Adicionar ao pedido</Button>
          <Button variant="ghost">Solicitar cotação</Button>
          <Button variant="subtle">Salvar na lista</Button>
          <Button variant="editorial">Ver a coleção</Button>
          <Button variant="destructive">Remover</Button>
          <Button disabled>Indisponível</Button>
          <Button size="icon" variant="ghost" aria-label="Mais informações">
            <InfoIcon />
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-md" aria-labelledby="campos">
        <h2 id="campos" className="text-headline-md">
          Campos
        </h2>
        <div className="grid gap-lg md:grid-cols-2">
          <div className="flex flex-col gap-sm">
            <Label htmlFor="empresa">Razão social</Label>
            <Input id="empresa" placeholder="Empresa Fictícia Ltda." />
          </div>
          <div className="flex flex-col gap-sm">
            <Label htmlFor="cnpj">CNPJ</Label>
            <Input
              id="cnpj"
              defaultValue="00.000.000/0000-00"
              aria-invalid
              aria-describedby="cnpj-erro"
            />
            <p id="cnpj-erro" className="text-body-sm text-error">
              CNPJ inválido.
            </p>
          </div>
          <div className="flex flex-col gap-sm">
            <Label htmlFor="bloqueado">Campo desabilitado</Label>
            <Input id="bloqueado" disabled defaultValue="Não editável" />
          </div>
          <div className="flex flex-col gap-sm">
            <Label>Acabamento</Label>
            <Select items={finishes} defaultValue="nogueira">
              <SelectTrigger className="w-full" aria-label="Acabamento">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {finishes.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-md" aria-labelledby="selecao">
        <h2 id="selecao" className="text-headline-md">
          Seleção
        </h2>
        <div className="flex flex-wrap gap-xl">
          <div className="flex flex-col gap-sm">
            <Label className="flex items-center gap-sm">
              <Checkbox defaultChecked /> Embalagem institucional
            </Label>
            <Label className="flex items-center gap-sm">
              <Checkbox /> Montagem no local
            </Label>
            <Label className="flex items-center gap-sm text-ink-disabled">
              <Checkbox disabled /> Gravação a laser (indisponível)
            </Label>
          </div>
          <RadioGroup defaultValue="pj" aria-label="Tipo de conta">
            <Label className="flex items-center gap-sm">
              <RadioGroupItem value="pj" /> Pessoa jurídica
            </Label>
            <Label className="flex items-center gap-sm">
              <RadioGroupItem value="pf" /> Pessoa física
            </Label>
          </RadioGroup>
        </div>
        <div className="flex flex-wrap gap-sm" aria-label="Filtros">
          <Chip defaultPressed>Couro</Chip>
          <Chip>Madeira maciça</Chip>
          <Chip>Latão</Chip>
          <Chip disabled>Pedra</Chip>
        </div>
      </section>

      <section className="flex flex-col gap-md" aria-labelledby="sinais">
        <h2 id="sinais" className="text-headline-md">
          Badges, tooltip e modal
        </h2>
        <div className="flex flex-wrap items-center gap-md">
          <Badge>Pronta-entrega</Badge>
          <Badge variant="secondary">Sob encomenda</Badge>
          <Badge variant="outline">Edição limitada</Badge>
          <Badge variant="destructive">Esgotado</Badge>
          <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" size="sm" />}>
              Prazo de produção
            </TooltipTrigger>
            <TooltipContent>Até 15 dias úteis após a aprovação.</TooltipContent>
          </Tooltip>
          <Dialog>
            <DialogTrigger render={<Button variant="ghost" size="sm" />}>
              Abrir modal
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Confirmar cotação</DialogTitle>
                <DialogDescription>
                  A cotação vale por 15 dias a partir do envio.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose render={<Button variant="ghost" />}>
                  Cancelar
                </DialogClose>
                <Button>Enviar cotação</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </section>
    </main>
  )
}
