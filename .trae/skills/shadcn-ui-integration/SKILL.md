---
name: "shadcn-ui-integration"
description: "Integra shadcn-ui para criar interfaces modernas e profissionais. Use quando usuário pedir design tecnológico ou shadcn-ui."
---

# Shadcn-UI Integration Skill

Esta skill integra o shadcn-ui ao painel TPlay, transformando o design em algo moderno, tecnológico e profissional.

## O que é o shadcn-ui?

Shadcn-ui é uma biblioteca de componentes React copiáveis que fornece:
- Design system moderno e acessível
- Componentes altamente customizáveis
- Dark mode integrado
- Melhor performance que componentes tradicionais
- Padrões de design atuais

## Passos de Integração

### 1. Instalação das Dependências

```bash
npm install @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-select @radix-ui/react-tabs @radix-ui/react-toast
npm install class-variance-authority clsx tailwind-merge
npm install lucide-react
```

### 2. Configuração do Tema

Criar arquivo `components.json` na raiz:

```json
{
  "style": "default",
  "rsc": false,
  "tsx": false,
  "tailwind": {
    "config": "tailwind.config.js",
    "css": "public/css/input.css",
    "baseColor": "slate",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils"
  }
}
```

### 3. Criar Estrutura de Componentes

```bash
mkdir -p components/ui
mkdir -p lib
```

### 4. Adicionar Utilitários

Criar `lib/utils.js`:

```javascript
import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}
```

### 5. Componentes Principais para o Painel

#### Card Component
Substituir cards tradicionais por:

```javascript
import * as React from "react"
import { cn } from "@/lib/utils"

const Card = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-lg border bg-card text-card-foreground shadow-sm",
      className
    )}
    {...props}
  />
))
Card.displayName = "Card"

export { Card }
```

#### Button Component
Substituir botões por:

```javascript
import * as React from "react"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(({ className, variant, size, ...props }, ref) => {
  return (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  )
})
Button.displayName = "Button"

export { Button, buttonVariants }
```

### 6. Atualizar Templates EJS

#### Dashboard Moderno
```html
<!-- Substituir tabela tradicional -->
<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
  <% apps.forEach(app => { %>
    <Card class="hover:shadow-lg transition-shadow">
      <CardHeader>
        <img src="<%= app.logo %>" alt="<%= app.name %>" class="w-12 h-12 rounded-lg object-cover" />
        <CardTitle><%= app.name %></CardTitle>
        <CardDescription>/<%= app.slug %></CardDescription>
      </CardHeader>
      <CardContent>
        <p class="text-sm text-muted-foreground"><%= app.description %></p>
      </CardContent>
      <CardFooter class="flex justify-between">
        <Button variant="outline" size="sm">
          <i class="fas fa-eye mr-2"></i>Visualizar
        </Button>
        <div class="space-x-2">
          <Button variant="ghost" size="sm">
            <i class="fas fa-edit"></i>
          </Button>
          <Button variant="ghost" size="sm" class="text-destructive">
            <i class="fas fa-trash"></i>
          </Button>
        </div>
      </CardFooter>
    </Card>
  <% }) %>
</div>
```

#### Formulário Moderno
```html
<!-- Substituir formulário tradicional -->
<Card class="max-w-2xl mx-auto">
  <CardHeader>
    <CardTitle><%= app ? 'Editar App' : 'Novo App' %></CardTitle>
    <CardDescription>Preencha as informações do aplicativo</CardDescription>
  </CardHeader>
  <CardContent>
    <form class="space-y-6">
      <div class="grid gap-4 md:grid-cols-2">
        <div class="space-y-2">
          <Label for="name">Nome do App</Label>
          <Input id="name" name="name" value="<%= app ? app.name : '' %>" required />
        </div>
        <div class="space-y-2">
          <Label for="slug">Slug</Label>
          <Input id="slug" name="slug" value="<%= app ? app.slug : '' %>" required />
        </div>
      </div>
      <!-- Mais campos... -->
    </form>
  </CardContent>
  <CardFooter>
    <Button type="submit" class="w-full">
      <i class="fas fa-save mr-2"></i>Salvar App
    </Button>
  </CardFooter>
</Card>
```

### 7. Dark Mode Avançado

Adicionar switch de tema moderno:

```javascript
import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function ModeToggle() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon">
          <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Mudar tema</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem>Claro</DropdownMenuItem>
        <DropdownMenuItem>Escuro</DropdownMenuItem>
        <DropdownMenuItem>Sistema</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

### 8. Benefícios da Integração

- **Design Profissional**: Interface moderna e tecnológica
- **Acessibilidade**: Componentes com ARIA labels e navegação por teclado
- **Performance**: Menos CSS customizado, melhor performance
- **Consistência**: Design system uniforme em todas as páginas
- **Dark Mode**: Transição suave entre temas
- **Responsividade**: Componentes adaptativos por padrão
- **Manutenibilidade**: Código mais limpo e organizado

### 9. Verificação Final

Após integração, verificar:
- [ ] Todos os componentes estão funcionando
- [ ] Dark mode está operacional
- [ ] Formulários mantêm funcionalidade
- [ ] Dashboard exibe apps corretamente
- [ ] Botões de download funcionam
- [ ] Navegação está consistente
- [ ] Acessibilidade está adequada (contraste AA)

## Quando Invocar Esta Skill

Use esta skill quando:
- Usuário pedir design "profissional" ou "moderno"
- Usuário mencionar shadcn-ui especificamente
- Design atual for criticado como "infantil" ou "amador"
- Necessário melhorar a experiência visual do painel
- Quiser implementar dark mode avançado
- Precisar de componentes mais sofisticados