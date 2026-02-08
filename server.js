require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs-extra');
const path = require('path');
const slugify = require('slugify');
const multer = require('multer');
const ejs = require('ejs');
const session = require('express-session');

const app = express();
// Hostinger Shared Hosting Node.js Selector usually looks for a file like 'app.js' or 'index.js'
// and the server should be exported or started.
const PORT = process.env.PORT || 3002;
const HOST = '127.0.0.1'; // Essential for some shared hosting environments
const BASE_URL = process.env.BASE_URL || 'https://ajuda.tplay21.in';

// --- CONFIGURAÇÃO DE DIRETÓRIOS (CAMINHOS ABSOLUTOS) ---
const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');
const APPS_DIR = path.join(PUBLIC_DIR, 'apps');
const DATA_FILE = path.join(ROOT_DIR, 'data', 'apps.json');
const GLOBAL_TUTORIALS_FILE = path.join(ROOT_DIR, 'data', 'global_tutorials.json');
const SETTINGS_FILE = path.join(ROOT_DIR, 'data', 'settings.json');
const VIEWS_DIR = path.join(ROOT_DIR, 'views');
const TEMPLATES_DIR = path.join(ROOT_DIR, 'templates');

// Garantir que os diretórios necessários existam
fs.ensureDirSync(UPLOADS_DIR);
fs.ensureDirSync(APPS_DIR);
fs.ensureDirSync(path.dirname(DATA_FILE));

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'changeme';
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-me-in-production';

function loadApps() {
    try {
        return fs.readJsonSync(DATA_FILE);
    } catch (error) {
        return [];
    }
}

function saveApps(apps) {
    const tmpFile = DATA_FILE + '.tmp';
    fs.writeJsonSync(tmpFile, apps);
    fs.moveSync(tmpFile, DATA_FILE, { overwrite: true });
}

function loadGlobalTutorials() {
    try {
        return fs.readJsonSync(GLOBAL_TUTORIALS_FILE);
    } catch (error) {
        return [];
    }
}

function generateSlugFromTitle(title, existing) {
    const base = slugify(title || 'tutorial', { lower: true, strict: true });
    let slug = base;
    let counter = 1;
    const set = new Set(existing || []);
    while (set.has(slug)) {
        slug = `${base}-${counter++}`;
    }
    return slug;
}

function saveGlobalTutorials(list) {
    const tmpFile = GLOBAL_TUTORIALS_FILE + '.tmp';
    fs.writeJsonSync(tmpFile, list);
    fs.moveSync(tmpFile, GLOBAL_TUTORIALS_FILE, { overwrite: true });
}

function defaultSettings() {
    return {
        universalTutorials: {
            videoDownloaderUrl: '',
            videoNtDownUrl: '',
            videoBrowserDownloadUrl: ''
        }
    };
}

function loadSettings() {
    try {
        const fileSettings = fs.readJsonSync(SETTINGS_FILE);
        const defaults = defaultSettings();
        return {
            ...defaults,
            ...fileSettings,
            universalTutorials: {
                ...defaults.universalTutorials,
                ...(fileSettings && fileSettings.universalTutorials ? fileSettings.universalTutorials : {})
            }
        };
    } catch (error) {
        return defaultSettings();
    }
}

function saveSettings(settings) {
    const tmpFile = SETTINGS_FILE + '.tmp';
    fs.writeJsonSync(tmpFile, settings);
    fs.moveSync(tmpFile, SETTINGS_FILE, { overwrite: true });
}

if (!fs.existsSync(DATA_FILE)) {
    saveApps([]);
}
if (!fs.existsSync(GLOBAL_TUTORIALS_FILE)) {
    saveGlobalTutorials([]);
}
if (!fs.existsSync(SETTINGS_FILE)) {
    saveSettings(defaultSettings());
}

// --- CONFIGURAÇÃO DE UPLOAD (MULTER) ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        const appName = req.body.name || 'app';
        const appSlug = slugify(appName, { lower: true, strict: true });
        const fieldName = file.fieldname.replace('_file', '').replace('_images', 'img').replace('video_tutorials', 'video');
        const extension = path.extname(file.originalname);
        const timestamp = Date.now().toString().slice(-6);
        cb(null, `${appSlug}-${fieldName}-${timestamp}${extension}`);
    }
});
const upload = multer({ storage: storage });

// --- CONFIGURAÇÕES EXPRESS ---
app.set('port', PORT);
app.set('view engine', 'ejs');
app.set('views', VIEWS_DIR);
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(PUBLIC_DIR));
app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true
    }
}));
app.use((req, res, next) => {
    res.locals.isAuthenticated = !!(req.session && req.session.user);
    next();
});

function ensureAuthenticated(req, res, next) {
    if (req.session && req.session.user) {
        return next();
    }
    res.redirect('/login');
}

app.get('/login', (req, res) => {
    if (req.session && req.session.user) {
        return res.redirect('/painel');
    }
    res.render('login', { error: null });
});

app.post('/login', (req, res) => {
    const username = req.body.username || '';
    const password = req.body.password || '';
    if (username === ADMIN_USER && password === ADMIN_PASS) {
        req.session.user = { name: username };
        return res.redirect('/painel');
    }
    res.status(401).render('login', { error: 'Credenciais inválidas' });
});

app.post('/logout', (req, res) => {
    if (req.session) {
        req.session.destroy(() => {
            res.redirect('/login');
        });
    } else {
        res.redirect('/login');
    }
});

// --- ROTAS DO SITE PÚBLICO ---

app.get('/:slug', (req, res, next) => {
    const { slug } = req.params;
    const reserved = ['painel', 'tutorial', 'new', 'save', 'edit', 'delete', 'uploads', 'apps', 'delete-image', 'favicon.ico', 'login', 'logout'];
    if (reserved.includes(slug)) return next();

    // Prioridade: Tenta achar o app no banco de dados e renderizar dinamicamente
    const apps = loadApps();
    const appData = apps.find(a => a.slug === slug);

    if (appData) {
        // Se o app existe no banco, renderiza usando o template
        // Nota: Você pode optar por servir o index.html gerado se preferir performance
        const appFilePath = path.join(APPS_DIR, slug, 'index.html');
        if (fs.existsSync(appFilePath)) {
            return res.sendFile(appFilePath);
        }
    }
    next();
});

app.get('/', (req, res) => {
    try {
        const apps = loadApps();
        const visibleApps = apps.filter(app => app.visibleOnHome);
        res.render('store', { apps: visibleApps });
    } catch (error) {
        res.render('store', { apps: [] });
    }
});

app.get('/tutorial', (req, res) => {
    try {
        const apps = loadApps();
        const allVideoTutorials = [];
        apps.forEach(app => {
            if (app.tutorials) {
                app.tutorials.forEach(tut => {
                    if (tut.is_video) {
                        allVideoTutorials.push({ ...tut, appName: app.name, appSlug: app.slug });
                    }
                });
            }
        });
        const globalTutorials = loadGlobalTutorials();
        res.render('tutorials', { tutorials: allVideoTutorials, globalTutorials });
    } catch (error) {
        res.render('tutorials', { tutorials: [], globalTutorials: [] });
    }
});

// --- ROTAS DO PAINEL ADMINISTRATIVO ---

app.get('/painel', ensureAuthenticated, (req, res) => {
    try {
        const apps = loadApps();
        res.render('dashboard', { apps, baseUrl: BASE_URL });
    } catch (error) {
        res.render('dashboard', { apps: [], baseUrl: BASE_URL });
    }
});

app.get('/painel/tutorials', ensureAuthenticated, (req, res) => {
    const tutorials = loadGlobalTutorials();
    res.render('global_tutorials', { tutorials, baseUrl: BASE_URL });
});

app.get('/painel/config', ensureAuthenticated, (req, res) => {
    const settings = loadSettings();
    res.render('settings', { settings });
});

app.post('/painel/config', ensureAuthenticated, (req, res) => {
    try {
        const body = req.body;
        const current = loadSettings();
        const next = {
            ...current,
            universalTutorials: {
                videoDownloaderUrl: body.universalVideoDownloaderUrl || '',
                videoNtDownUrl: body.universalVideoNtDownUrl || '',
                videoBrowserDownloadUrl: body.universalVideoBrowserDownloadUrl || ''
            }
        };
        saveSettings(next);
        res.redirect('/painel/config');
    } catch (error) {
        console.error('Erro ao salvar configurações gerais:', error);
        res.status(500).send('Erro ao salvar configurações gerais.');
    }
});

app.post('/painel/tutorials', ensureAuthenticated, upload.array('files'), (req, res) => {
    try {
        const current = loadGlobalTutorials();
        const ids = Array.isArray(req.body.ids) ? req.body.ids : (req.body.ids ? [req.body.ids] : []);
        const slugs = Array.isArray(req.body.slugs) ? req.body.slugs : (req.body.slugs ? [req.body.slugs] : []);
        const titles = Array.isArray(req.body.titles) ? req.body.titles : (req.body.titles ? [req.body.titles] : []);
        const descriptions = Array.isArray(req.body.descriptions) ? req.body.descriptions : (req.body.descriptions ? [req.body.descriptions] : []);
        const urls = Array.isArray(req.body.urls) ? req.body.urls : (req.body.urls ? [req.body.urls] : []);

        const files = req.files || [];
        const byIndex = {};
        files.forEach((f, idx) => {
            byIndex[idx] = '/uploads/' + f.filename;
        });

        const existingById = {};
        current.forEach(t => { existingById[String(t.id)] = t; });

        const usedSlugs = current.map(t => t.slug);
        const nextList = [];

        titles.forEach((title, idx) => {
            if (!title) return;
            const id = ids[idx] || '';
            const base = existingById[id] || {};
            const description = (descriptions[idx] || '').trim();
            let url = (urls[idx] || '').trim();
            if (byIndex[idx]) {
                url = byIndex[idx];
            } else if (!url && base.url) {
                url = base.url;
            }

            let slug = slugs[idx] || base.slug;
            if (!slug) {
                slug = generateSlugFromTitle(title, usedSlugs);
                usedSlugs.push(slug);
            }

            nextList.push({
                id: id || String(Date.now()) + '-' + idx,
                title: title.trim(),
                description,
                url,
                slug
            });
        });

        saveGlobalTutorials(nextList);
        res.redirect('/painel/tutorials');
    } catch (error) {
        console.error('Erro ao salvar tutoriais globais:', error);
        res.status(500).send('Erro ao salvar tutoriais globais.');
    }
});

app.get('/new', ensureAuthenticated, (req, res) => {
    res.render('form', { app: null });
});

app.post('/save', ensureAuthenticated, upload.fields([
    { name: 'logo_file', maxCount: 1 },
    { name: 'download_file', maxCount: 1 },
    { name: 'interface_images', maxCount: 10 },
    { name: 'video_tutorials', maxCount: 5 }
]), async (req, res) => {
    try {
        const appData = req.body;
        const apps = loadApps();
        
        if (!appData.name) return res.status(400).send("Nome do aplicativo é obrigatório.");

        appData.visibleOnHome = appData.visibleOnHome === 'true';
        const slug = appData.slug || slugify(appData.name, { lower: true, strict: true });
        appData.slug = slug;

        if (req.files['logo_file']) appData.logo = '/uploads/' + req.files['logo_file'][0].filename;
        if (req.files['download_file']) appData.downloadUrl = '/uploads/' + req.files['download_file'][0].filename;

        // Compatibilidade de dispositivos (painel)
        const devicesField = req.body.devices;
        const allDevicesDefault = ['android','androidtv','firestick','tvbox'];
        appData.compatibleDevices = Array.isArray(devicesField) ? devicesField : (devicesField ? [devicesField] : allDevicesDefault);

        // Código NTDown (TV Box) - compatibilidade retroativa
        appData.ntdownCode = appData.ntdownCode || appData.tvboxCode || '';
        appData.browserDownloadUrl = appData.browserDownloadUrl || '';
        appData.videoDownloaderUrl = appData.videoDownloaderUrl || '';
        appData.videoNtDownUrl = appData.videoNtDownUrl || '';
        appData.videoBrowserDownloadUrl = appData.videoBrowserDownloadUrl || '';

        let interfaceImages = [];
        let interfaceImageNames = [];
        if (appData.existing_interface_images) {
            interfaceImages = Array.isArray(appData.existing_interface_images) ? appData.existing_interface_images : [appData.existing_interface_images];
        }
        if (appData.existing_interface_image_names) {
            interfaceImageNames = Array.isArray(appData.existing_interface_image_names) ? appData.existing_interface_image_names : [appData.existing_interface_image_names];
        }

        // Lógica de exclusão de imagens
        const deletedFromForm = appData.deleted_interface_images;
        if (deletedFromForm) {
            const imagesToDelete = Array.isArray(deletedFromForm)
                ? deletedFromForm.map(name => `/uploads/${name}`)
                : [`/uploads/${deletedFromForm}`];
            
            // Filtrar a lista de imagens existentes e nomes para remover as deletadas
            const filteredImages = [];
            const filteredNames = [];
            interfaceImages.forEach((imgUrl, idx) => {
                if (!imagesToDelete.includes(imgUrl)) {
                    filteredImages.push(imgUrl);
                    filteredNames.push(interfaceImageNames[idx] || '');
                }
            });
            interfaceImages = filteredImages;
            interfaceImageNames = filteredNames;

            // Excluir os arquivos físicos
            imagesToDelete.forEach(imgUrl => {
                try {
                    const filename = path.basename(imgUrl);
                    const imagePath = path.join(UPLOADS_DIR, filename);
                    if (fs.existsSync(imagePath)) {
                        fs.unlinkSync(imagePath);
                        console.log(`Arquivo de imagem deletado: ${imagePath}`);
                    }
                } catch (err) {
                    console.error(`Erro ao deletar o arquivo de imagem ${imgUrl}:`, err);
                }
            });
        }

        if (req.files['interface_images']) {
            const newNames = [];
            if (appData.interface_image_names) {
                const tmpNames = Array.isArray(appData.interface_image_names) ? appData.interface_image_names : [appData.interface_image_names];
                tmpNames.forEach(n => newNames.push((n || '').trim()));
            }
            req.files['interface_images'].forEach((file, idx) => {
                interfaceImages.push('/uploads/' + file.filename);
                interfaceImageNames.push(newNames[idx] || '');
            });
        }
        appData.interface_images = interfaceImages;
        appData.interface_image_names = interfaceImageNames;

        const tutorials = [];
        if (appData.tutorial_titles) {
            const titles = Array.isArray(appData.tutorial_titles) ? appData.tutorial_titles : [appData.tutorial_titles];
            const urls = Array.isArray(appData.tutorial_urls) ? appData.tutorial_urls : [appData.tutorial_urls];
            const texts = Array.isArray(appData.tutorial_texts) ? appData.tutorial_texts : [appData.tutorial_texts];
            const icons = Array.isArray(appData.tutorial_icons) ? appData.tutorial_icons : [appData.tutorial_icons];
            const isVideoFlags = Array.isArray(appData.tutorial_is_video) ? appData.tutorial_is_video : [appData.tutorial_is_video];
            
            titles.forEach((title, i) => {
                if (!title) return;
                const rawText = (texts[i] || '').trim();
                let finalUrl = urls[i] || '';
                if (req.files['video_tutorials'] && req.files['video_tutorials'][i]) {
                    finalUrl = '/uploads/' + req.files['video_tutorials'][i].filename;
                }
                if (!finalUrl && !rawText) return;
                const explicitIsVideo = isVideoFlags[i] === 'true';
                const autoIsVideo = finalUrl && (finalUrl.startsWith('/uploads/') || finalUrl.toLowerCase().endsWith('.mp4'));
                tutorials.push({ 
                    title, 
                    url: finalUrl || '',
                    description: rawText || '',
                    icon: icons[i] || '🎬',
                    is_video: explicitIsVideo || autoIsVideo
                });
            });
        }
        appData.tutorials = tutorials;

        const index = apps.findIndex(a => a.slug === (appData.original_slug || slug));
        const nowIso = new Date().toISOString();
        if (index > -1) {
            const existing = apps[index];
            appData.createdAt = existing.createdAt || nowIso;
            appData.updatedAt = nowIso;
            apps[index] = { ...existing, ...appData };
        } else {
            appData.createdAt = nowIso;
            appData.updatedAt = nowIso;
            apps.push(appData);
        }
        saveApps(apps);
        await rebuildAll();
        res.redirect('/painel');
    } catch (error) {
        console.error(error);
        res.status(500).send("Erro ao salvar aplicativo.");
    }
});

app.get('/edit/:slug', ensureAuthenticated, (req, res) => {
    const apps = loadApps();
    const appToEdit = apps.find(a => a.slug === req.params.slug);
    res.render('form', { app: appToEdit });
});

app.get('/delete/:slug', ensureAuthenticated, async (req, res) => {
    try {
        let apps = loadApps();
        apps = apps.filter(a => a.slug !== req.params.slug);
        saveApps(apps);
        
        // Remover diretório do app
        const appDir = path.join(APPS_DIR, req.params.slug);
        if (fs.existsSync(appDir)) fs.removeSync(appDir);
        
        // RECONSTRUIR Home e Tutoriais para remover o app da lista
        await generateHomePage();
        await generateTutorialsPage();
        
        res.redirect('/painel');
    } catch (error) {
        console.error('Erro ao excluir app:', error);
        res.status(500).send("Erro ao excluir aplicativo.");
    }
});

app.get('/delete-image/:slug/:imgName', ensureAuthenticated, (req, res) => {
    const { slug, imgName } = req.params;
    const apps = loadApps();
    const appIndex = apps.findIndex(a => a.slug === slug);
    if (appIndex > -1) {
        const imgPath = `/uploads/${imgName}`;
        apps[appIndex].interface_images = apps[appIndex].interface_images.filter(img => img !== imgPath);
        fs.writeJsonSync(DATA_FILE, apps);
        generateAppPage(apps[appIndex]);
    }
    res.redirect(`/edit/${slug}`);
});

// --- FUNÇÕES GERADORAS DE PÁGINAS ESTÁTICAS (SSG) ---

async function generateHomePage() {
    try {
        const apps = loadApps();
        const visibleApps = apps.filter(app => app.visibleOnHome);
        const html = await ejs.renderFile(path.join(VIEWS_DIR, 'store.ejs'), { apps: visibleApps });
        await fs.writeFile(path.join(PUBLIC_DIR, 'index.html'), html);
        console.log('✅ Home page gerada com sucesso!');
    } catch (error) {
        console.error('❌ Erro ao gerar Home page:', error);
    }
}

async function generateTutorialsPage() {
    try {
        const apps = loadApps();
        const allVideoTutorials = [];
        apps.forEach(app => {
            if (app.tutorials) {
                app.tutorials.forEach(tut => {
                    if (tut.is_video) {
                        allVideoTutorials.push({ ...tut, appName: app.name, appSlug: app.slug });
                    }
                });
            }
        });
        const globalTutorials = loadGlobalTutorials();
        const html = await ejs.renderFile(
            path.join(VIEWS_DIR, 'tutorials.ejs'),
            { tutorials: allVideoTutorials, globalTutorials },
            { async: true }
        );
        const tutorialDir = path.join(PUBLIC_DIR, 'tutorial');
        await fs.ensureDir(tutorialDir);
        await fs.writeFile(path.join(tutorialDir, 'index.html'), html);
        console.log('✅ Página de tutoriais gerada com sucesso!');
    } catch (error) {
        console.error('❌ Erro ao gerar página de tutoriais:', error);
    }
}

async function rebuildAll() {
    console.log('🔄 Iniciando reconstrução total do site estático...');
    await generateHomePage();
    await generateTutorialsPage();
    
    const apps = loadApps();
    for (const appData of apps) {
        await generateAppPage(appData);
    }
    console.log('✨ Reconstrução concluída!');
}

async function generateAppPage(appData) {
    const templateHtmlPath = path.join(TEMPLATES_DIR, 'base.html');
    const templateCssPath = path.join(TEMPLATES_DIR, 'base.css');
    let templateHtml = await fs.readFile(templateHtmlPath, 'utf-8');
    let templateCss = await fs.readFile(templateCssPath, 'utf-8');

    const pageTitle = `${appData.name} - Loja TPlay | Download Oficial`;

    let finalHtml = templateHtml
        .replace(/{{app_name}}/g, appData.name)
        .replace(/{{app_logo}}/g, appData.logo || '')
        .replace(/{{download_url}}/g, appData.downloadUrl || '#')
        .replace(/{{app_url}}/g, `${BASE_URL}/${appData.slug}`)
        .replace(/{{android_code}}/g, appData.firestickCode || '2787533')
        .replace(/{{firestick_code}}/g, appData.firestickCode || '2787533')
        .replace(/{{tvbox_code}}/g, appData.tvboxCode || '51412')
        .replace(/{{NtdownCode}}/g, appData.ntdownCode || appData.tvboxCode || '51412')
        .replace(/{{page_title}}/g, pageTitle);

    // Dispositivo padrão
    const devicesList = Array.isArray(appData.compatibleDevices) && appData.compatibleDevices.length > 0
        ? appData.compatibleDevices
        : ['android','androidtv','firestick','tvbox'];
    const defaultDeviceId = `${devicesList[0]}-section`;
    finalHtml = finalHtml.replace(/{{default_device}}/g, defaultDeviceId);

    // Texto de compatibilidade e descrição
    const labels = {
        android: 'Celular Android',
        androidtv: 'Android TV / Mi Stick',
        firestick: 'Fire Stick',
        tvbox: 'TV Box / Receptores / Projetores'
    };
    const compatItems = devicesList.map(d => labels[d]).filter(Boolean);
    const compatText = compatItems.length > 1
        ? compatItems.slice(0, -1).join(', ') + ' e ' + compatItems.slice(-1)
        : (compatItems[0] || 'Android');

    const hasCustomDescription = !!(appData.description && appData.description.trim());
    const appDesc = hasCustomDescription ? appData.description.trim() : '';
    const metaDesc = hasCustomDescription ? appData.description.trim() : (appData.name || '');

    finalHtml = finalHtml
        .replace(/{{compat_text}}/g, compatText)
        .replace(/{{app_description}}/g, appDesc)
        .replace(/{{meta_description}}/g, metaDesc);

    // Remover botões/Seções de dispositivos não compatíveis
    const allDevices = ['android','androidtv','firestick','tvbox'];
    for (const dev of allDevices) {
        if (!devicesList.includes(dev)) {
            const sectionId = `${dev}-section`;
            const buttonRegex = new RegExp(`<button[\\s\\S]*?data-target="${sectionId}"[\\s\\S]*?<\\/button>`, 'g');
            const sectionRegex = new RegExp(`<section[\\s\\S]*?id="${sectionId}"[\\s\\S]*?<\\/section>`, 'g');
            finalHtml = finalHtml.replace(buttonRegex, '');
            finalHtml = finalHtml.replace(sectionRegex, '');
        }
    }

    const replaceContainerInner = (html, id, content) => {
        const rx = new RegExp(`(<div\\s+id="${id}"[\\s\\S]*?>)[\\s\\S]*?(<\\/div>)`);
        return html.replace(rx, `$1${content}$2`);
    };
    const settings = loadSettings();
    const universal = settings && settings.universalTutorials ? settings.universalTutorials : {};

    let videosHtml = '';
    let linksHtml = '';
    if (appData.tutorials && appData.tutorials.length > 0) {
        appData.tutorials.forEach((tut) => {
            if (tut.is_video) {
                videosHtml += `
                <div class="bg-card border border-border rounded-lg overflow-hidden shadow-sm">
                    <div class="aspect-video bg-black flex items-center justify-center">
                        <video controls preload="metadata" class="w-full h-full object-contain">
                            <source src="${tut.url}" type="video/mp4">
                        </video>
                    </div>
                    <div class="p-3">
                        <p class="text-sm font-medium text-card-foreground truncate">${tut.title}</p>
                    </div>
                </div>`;
            } else {
                linksHtml += `
                <article class="w-full bg-card border border-border rounded-lg p-4 hover:bg-accent/40 transition-colors">
                    <div class="flex items-start gap-3">
                        <span class="text-lg mt-1" aria-hidden="true">${tut.icon}</span>
                        <div class="flex-1 min-w-0">
                            <h3 class="text-sm font-semibold text-card-foreground mb-1">${tut.title}</h3>
                            ${tut.description ? `<p class="text-xs text-muted-foreground whitespace-pre-line mb-2">${tut.description}</p>` : ''}
                            ${tut.url ? `
                                <button type="button" onclick="window.open('${tut.url}','_blank')" class="inline-flex items-center gap-2 text-xs font-medium text-primary hover:underline">
                                    <i class="fas fa-external-link-alt"></i>
                                    Abrir link relacionado
                                </button>
                            ` : ''}
                        </div>
                    </div>
                </article>`;
            }
        });
    }
    if (videosHtml) {
        finalHtml = replaceContainerInner(finalHtml, 'video-grid', videosHtml);
    }
    if (linksHtml) {
        finalHtml = replaceContainerInner(finalHtml, 'links-grid', linksHtml);
    } else {
        const textSectionRegex = /<section\s+id="text-guides-section"[\s\S]*?<\/section>/;
        finalHtml = finalHtml.replace(textSectionRegex, '');
    }
    const firestickVideoUrl = appData.videoDownloaderUrl || universal.videoDownloaderUrl || '';
    const ntdownVideoUrl = appData.videoNtDownUrl || universal.videoNtDownUrl || '';
    const browserVideoUrl = appData.videoBrowserDownloadUrl || universal.videoBrowserDownloadUrl || '';
    const firestickTutorialButton = firestickVideoUrl
        ? `<a class="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors inline-flex items-center" href="${firestickVideoUrl}" target="_blank" rel="noopener noreferrer"><i class="fas fa-play-circle mr-2"></i>Vídeo tutorial</a>`
        : '';
    const ntdownTutorialButton = ntdownVideoUrl
        ? `<a class="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors inline-flex items-center" href="${ntdownVideoUrl}" target="_blank" rel="noopener noreferrer"><i class="fas fa-play-circle mr-2"></i>Vídeo tutorial</a>`
        : '';
    const browserDownloadUrl = appData.browserDownloadUrl && appData.browserDownloadUrl.trim()
        ? appData.browserDownloadUrl.trim()
        : appData.downloadUrl || '';
    const browserDownloadTutorialButton = browserVideoUrl
        ? `<a class="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors inline-flex items-center" href="${browserVideoUrl}" target="_blank" rel="noopener noreferrer"><i class="fas fa-play-circle mr-2"></i>Vídeo tutorial</a>`
        : '';
    finalHtml = finalHtml
        .replace(/{{firestick_tutorial_button}}/g, firestickTutorialButton)
        .replace(/{{ntdown_tutorial_button}}/g, ntdownTutorialButton)
        .replace(/{{browser_download_url}}/g, browserDownloadUrl)
        .replace(/{{browser_download_tutorial_button}}/g, browserDownloadTutorialButton);

    if (appData.interface_images && appData.interface_images.length > 0) {
        const names = appData.interface_image_names || [];
        const imagesHtml = appData.interface_images.map((img, idx) => `
            <figure class="flex flex-col gap-2">
                <button type="button" class="group relative bg-muted rounded-lg aspect-video overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background" onclick="abrirLightbox('${img}')">
                    <img src="${img}" alt="Interface ${appData.name}" class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" decoding="async">
                    <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <i class="fas fa-search-plus text-white text-2xl"></i>
                    </div>
                </button>
                ${names[idx] ? `<figcaption class="text-xs text-muted-foreground text-center truncate" title="${names[idx]}">${names[idx]}</figcaption>` : ''}
            </figure>
        `).join('');
        finalHtml = replaceContainerInner(finalHtml, 'interface-grid', imagesHtml);
    }

    const appDir = path.join(APPS_DIR, appData.slug);
    await fs.ensureDir(appDir);
    await fs.writeFile(path.join(appDir, 'index.html'), finalHtml);
    await fs.writeFile(path.join(appDir, 'styles.css'), templateCss);
}

// --- INICIALIZAÇÃO DO SERVIDOR ---

if (require.main === module) {
    if (process.argv.includes('--build')) {
        rebuildAll().then(() => {
            console.log('🚀 Build estático finalizado.');
            process.exit(0);
        }).catch(err => {
            console.error('❌ Erro no build:', err);
            process.exit(1);
        });
    } else {
        app.listen(PORT, HOST, async () => {
            console.log(`Servidor rodando em http://${HOST}:${PORT}`);
        });
    }
}

module.exports = app;
module.exports.rebuildAll = rebuildAll;
