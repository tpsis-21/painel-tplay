## Visão Geral do Projeto

O projeto **painel-tplay** é uma aplicação Node.js em **Express** com renderização via **EJS** que funciona como:
- **Loja pública de apps** (TPlay App Store), acessível em `https://ajuda.tplay21.in/`
- **Painel administrativo** para gestão desses apps (`/painel`)
- **Gerador de páginas estáticas** (SSG) para cada app, otimizadas para SEO e hospedadas em ambiente compartilhado (Hostinger)

O fluxo principal é:
- O painel grava e edita configurações de aplicativos em um arquivo JSON (`data/apps.json`) e gerencia uploads de arquivos.
- Um conjunto de funções gera HTML estático da loja, da página de tutoriais e de cada app individual com base em um template HTML/CSS.
- O servidor Express serve o painel, o JSON e os arquivos estáticos em `public/`, inclusive as páginas pré-geradas.

## Stack Técnica

- **Runtime**: Node.js (>= 18, Node 20 em produção)
- **Servidor web**: Express (`server.js` / `app.js`)
- **Template engine**: EJS (views de painel, loja e tutoriais)
- **Frontend**:
  - TailwindCSS via CDN em `views` e `public/index.html`
  - CSS customizado em [`templates/base.css`](file:///c:/Users/pc-tp/Documents/SITES/tplay%20panel/painel-tplay/templates/base.css)
  - Componentes reutilizáveis de UI em React-like no diretório [`components/ui`](file:///c:/Users/pc-tp/Documents/SITES/tplay%20panel/painel-tplay/components/ui), mas hoje não são usados diretamente na renderização EJS/HTML.
- **Persistência**: arquivo JSON [`data/apps.json`](file:///c:/Users/pc-tp/Documents/SITES/tplay%20panel/painel-tplay/data/apps.json) (não versionado, criado em tempo de execução)
- **Uploads**: gerenciados por **multer**, armazenados em `public/uploads`
- **Geração estática (SSG)**: funções `generateHomePage`, `generateTutorialsPage` e `generateAppPage` em [`server.js`](file:///c:/Users/pc-tp/Documents/SITES/tplay%20panel/painel-tplay/server.js)
- **SEO/A11y**:
  - Metatags completas (title, description, canonical, OG, Twitter) em `public/index.html`, `views/store.ejs` e `templates/base.html`
  - JSON‑LD para Organization e SoftwareApplication

## Estrutura de Pastas

- [`app.js`](file:///c:/Users/pc-tp/Documents/SITES/tplay%20panel/painel-tplay/app.js)  
  Ponto de entrada que encontra uma porta livre e inicia o servidor exportado em `server.js`.

- [`server.js`](file:///c:/Users/pc-tp/Documents/SITES/tplay%20panel/painel-tplay/server.js)  
  Núcleo da aplicação:
  - Configura Express, EJS e caminhos de diretório (public, uploads, apps, views, templates, data).
  - Garante criação de diretórios e do arquivo `data/apps.json`.
  - Configura `multer` para upload de:
    - logo (`logo_file`)
    - APK (`download_file`)
    - imagens de interface (`interface_images`)
    - vídeos de tutoriais (`video_tutorials`)
  - Define as rotas públicas e do painel.
  - Implementa as funções de geração estática.

- [`views/`](file:///c:/Users/pc-tp/Documents/SITES/tplay%20panel/painel-tplay/views)
  - `layout_header.ejs` / `layout_footer.ejs`: layout base do painel (header fixo, tema dark, toasts, container geral).
  - `dashboard.ejs`: listagem de apps com ações (visualizar, editar, excluir).
  - `form.ejs`: formulário avançado para criar/editar apps (identidade, status, códigos, dispositivos, imagens, tutoriais).
  - `store.ejs`: versão EJS da loja pública, usada para gerar `public/index.html`.
  - `tutorials.ejs`: listagem de todos os vídeos de tutoriais cadastrados, usada para gerar `public/tutorial/index.html`.

- [`templates/`](file:///c:/Users/pc-tp/Documents/SITES/tplay%20panel/painel-tplay/templates)
  - `base.html`: template de página individual de app (hero, dispositivos, tutoriais, screenshots, SEO).
  - `base.css`: estilos globais da página de app (layout, responsividade, botões, grids, etc.).

- [`public/`](file:///c:/Users/pc-tp/Documents/SITES/tplay%20panel/painel-tplay/public)
  - `index.html`: homepage estática da TPlay Store gerada a partir de `views/store.ejs`.
  - `tutorial/index.html`: página estática de tutoriais gerada a partir de `views/tutorials.ejs`.
  - `uploads/`: arquivos enviados pelo painel (logos, APKs, vídeos, imagens).
  - `apps/`: diretórios por app com `index.html` e `styles.css` gerados a partir de `templates/base.html` e `base.css`.

- Outros arquivos
  - [`package.json`](file:///c:/Users/pc-tp/Documents/SITES/tplay%20panel/painel-tplay/package.json): scripts `start`, `build` e `postinstall`, dependências de produção/dev.
  - [`build.js`](file:///c:/Users/pc-tp/Documents/SITES/tplay%20panel/painel-tplay/build.js): script de build estático (chama `rebuildAll` via CLI).
  - `.htaccess`: ajustes específicos de hospedagem (rewrite/roteamento).
  - `.env.example`: exemplo de variáveis (incluindo `BASE_URL`).

## Fluxos Principais

### 1. Loja Pública de Apps (`/` / `store.ejs` → `public/index.html`)

- O servidor lê `data/apps.json` e filtra apps com `visibleOnHome = true`.
- No modo dinâmico, `GET /` renderiza `views/store.ejs` com esses apps.
- No modo estático, `generateHomePage` renderiza a mesma view EJS e grava o HTML resultante em `public/index.html`.
- Cada card de app aponta para uma rota `/slug-do-app`, que será servida pela versão estática em `public/apps/<slug>/index.html` (se existir).

### 2. Página de Tutoriais (`/tutorial` → `public/tutorial/index.html`)

- A rota lê todos os apps e agrega todos os tutoriais marcados com `is_video = true`.
- `views/tutorials.ejs` monta uma grade com vídeos (tag `<video>`) e links para as páginas dos apps.
- `generateTutorialsPage` gera `public/tutorial/index.html` a partir dessa view.

### 3. Páginas Individuais de App (SSG com `templates/base.html`)

- Cada app salvo no painel possui:
  - `name`, `slug`, `description`
  - `logo`, `downloadUrl`
  - `firestickCode`, `ntdownCode` (e compatibilidade com TV Box)
  - `compatibleDevices` (android, androidtv, firestick, tvbox)
  - `interface_images` (screenshots)
  - `tutorials` (vídeo ou link externo)
- A função `generateAppPage(appData)`:
  - Carrega `base.html` e `base.css`.
  - Substitui placeholders (`{{app_name}}`, `{{app_logo}}`, `{{meta_description}}`, `{{compat_text}}`, etc.).
  - Remove seções/botões de dispositivos não compatíveis.
  - Injeta blocos HTML de vídeos, links de tutoriais e imagens de interface.
  - Cria/atualiza `public/apps/<slug>/index.html` e `styles.css`.

### 4. Painel Administrativo (`/painel`, `/new`, `/edit/:slug`, `/delete/:slug`)

- `GET /painel`
  - Lê `data/apps.json` e renderiza `views/dashboard.ejs`.
  - Exibe cards com logo, nome, slug, status (Público/Privado) e ações.

- `GET /new`
  - Renderiza `views/form.ejs` vazio para criar um novo app.

- `GET /edit/:slug`
  - Carrega o app correspondente e popula `views/form.ejs` com os dados existentes.

- `POST /save`
  - Recebe os campos do formulário e arquivos via `multer`.
  - Calcula/normaliza:
    - `slug`
    - `visibleOnHome`
    - `compatibleDevices`
    - `ntdownCode` (fallback para `tvboxCode`)
    - lista de `interface_images` (incluindo exclusão de imagens marcadas como removidas).
    - lista de `tutorials` (vídeo ou URL).
  - Atualiza ou adiciona o app em `data/apps.json`.
  - Chama `rebuildAll()` para regenerar:
    - Home (`public/index.html`)
    - Página de tutoriais (`public/tutorial/index.html`)
    - Páginas de cada app (`public/apps/<slug>/index.html`)

- `GET /delete/:slug`
  - Remove o app do JSON.
  - Apaga o diretório `public/apps/<slug>`.
  - Regenera Home e tutoriais.

- `GET /delete-image/:slug/:imgName`
  - Atualiza `interface_images` do app removendo a imagem.
  - Chama `generateAppPage` apenas para aquele app.

### 5. Roteamento Público por Slug

- A rota `GET '/:slug'` protege slugs reservados (`painel`, `tutorial`, `new`, `save`, etc.).
- Para slugs de app:
  - Busca o app em `data/apps.json`.
  - Se existir e houver `public/apps/<slug>/index.html`, responde com esse arquivo estático.
  - Caso contrário, delega para o próximo middleware/rota.

## Deploy e Ambiente

- **Hospedagem**: Hostinger, com suporte a Node em ambiente compartilhado.
- **Entrada**:
  - `app.js` é o arquivo de entrada esperado pelo Node Selector, carrega `server.js` e sobe o servidor usando uma porta livre.
  - `server.js` pode ser invocado com `--build` para gerar apenas os arquivos estáticos e encerrar.
- **Scripts principais** (via `package.json`):
  - `npm start` → `node app.js`
  - `npm run build` → `node build.js` (internamente chama `server.rebuildAll()`)
  - `npm run postinstall` → garante diretórios `public/uploads`, `public/apps` e `data`.

## Considerações de Escalabilidade e Manutenção

- **Pontos fortes**
  - Arquitetura simples, adequada para hospedagem compartilhada: JSON + arquivos estáticos.
  - Geração estática reduz carga do servidor e melhora performance/SEO.
  - Painel único centraliza todas as informações de apps, códigos e tutoriais.

- **Limitações atuais**
  - Persistência em arquivo JSON não é ideal para alto volume ou concorrência.
  - Funções de substituição em `generateAppPage` são baseadas em `replace` de string e regex; qualquer alteração grande no HTML base exige cuidado.
  - Não há testes automatizados; a validação é feita via uso manual / build.

- **Evoluções naturais**
  - Migrar `data/apps.json` para um banco leve (SQLite, Postgres, etc.) se o volume crescer.
  - Extrair a camada de geração de páginas para módulo independente (facilitando testes e futuras migrações).
  - Reaproveitar/alinhar os componentes em `components/ui` com o código EJS, ou documentar que são apenas referência visual.
  - Introduzir testes de integração básicos para as rotas principais e para a geração de HTML.

