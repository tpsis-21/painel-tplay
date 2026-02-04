require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs-extra');
const path = require('path');
const slugify = require('slugify');
const multer = require('multer');

const app = express();
// Hostinger Shared Hosting Node.js Selector usually looks for a file like 'app.js' or 'index.js'
// and the server should be exported or started.
const PORT = process.env.PORT || 3000;
const HOST = '127.0.0.1'; // Essential for some shared hosting environments
const BASE_URL = process.env.BASE_URL || 'https://ajuda.tplay21.in';

// --- CONFIGURAÇÃO DE DIRETÓRIOS (CAMINHOS ABSOLUTOS) ---
const ROOT_DIR = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');
const APPS_DIR = path.join(PUBLIC_DIR, 'apps');
const DATA_FILE = path.join(__dirname, 'data', 'apps.json');
const VIEWS_DIR = path.join(__dirname, 'views');
const TEMPLATES_DIR = path.join(__dirname, 'templates');

// Garantir que os diretórios necessários existam
fs.ensureDirSync(UPLOADS_DIR);
fs.ensureDirSync(APPS_DIR);
fs.ensureDirSync(path.dirname(DATA_FILE));

if (!fs.existsSync(DATA_FILE)) {
    fs.writeJsonSync(DATA_FILE, []);
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
app.set('view engine', 'ejs');
app.set('views', VIEWS_DIR);
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(PUBLIC_DIR));

// --- ROTAS DO SITE PÚBLICO ---

app.get('/:slug', (req, res, next) => {
    const { slug } = req.params;
    const reserved = ['painel', 'tutorial', 'new', 'save', 'edit', 'delete', 'uploads', 'apps', 'delete-image', 'favicon.ico'];
    if (reserved.includes(slug)) return next();

    const appFilePath = path.join(APPS_DIR, slug, 'index.html');
    if (fs.existsSync(appFilePath)) {
        res.sendFile(appFilePath);
    } else {
        next();
    }
});

app.get('/', (req, res) => {
    try {
        const apps = fs.readJsonSync(DATA_FILE);
        const visibleApps = apps.filter(app => app.visibleOnHome);
        res.render('store', { apps: visibleApps });
    } catch (error) {
        res.render('store', { apps: [] });
    }
});

app.get('/tutorial', (req, res) => {
    try {
        const apps = fs.readJsonSync(DATA_FILE);
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
        res.render('tutorials', { tutorials: allVideoTutorials });
    } catch (error) {
        res.render('tutorials', { tutorials: [] });
    }
});

// --- ROTAS DO PAINEL ADMINISTRATIVO ---

app.get('/painel', (req, res) => {
    try {
        const apps = fs.readJsonSync(DATA_FILE);
        res.render('dashboard', { apps });
    } catch (error) {
        res.render('dashboard', { apps: [] });
    }
});

app.get('/new', (req, res) => {
    res.render('form', { app: null });
});

app.post('/save', upload.fields([
    { name: 'logo_file', maxCount: 1 },
    { name: 'download_file', maxCount: 1 },
    { name: 'interface_images', maxCount: 10 },
    { name: 'video_tutorials', maxCount: 5 }
]), async (req, res) => {
    try {
        const appData = req.body;
        const apps = fs.readJsonSync(DATA_FILE);
        
        if (!appData.name) return res.status(400).send("Nome do aplicativo é obrigatório.");

        appData.visibleOnHome = appData.visibleOnHome === 'true';
        const slug = appData.slug || slugify(appData.name, { lower: true, strict: true });
        appData.slug = slug;

        if (req.files['logo_file']) appData.logo = '/uploads/' + req.files['logo_file'][0].filename;
        if (req.files['download_file']) appData.downloadUrl = '/uploads/' + req.files['download_file'][0].filename;

        let interfaceImages = [];
        if (appData.existing_interface_images) {
            interfaceImages = Array.isArray(appData.existing_interface_images) ? appData.existing_interface_images : [appData.existing_interface_images];
        }
        if (req.files['interface_images']) {
            req.files['interface_images'].forEach(file => interfaceImages.push('/uploads/' + file.filename));
        }
        appData.interface_images = interfaceImages;

        const tutorials = [];
        if (appData.tutorial_titles) {
            const titles = Array.isArray(appData.tutorial_titles) ? appData.tutorial_titles : [appData.tutorial_titles];
            const urls = Array.isArray(appData.tutorial_urls) ? appData.tutorial_urls : [appData.tutorial_urls];
            const icons = Array.isArray(appData.tutorial_icons) ? appData.tutorial_icons : [appData.tutorial_icons];
            const isVideoFlags = Array.isArray(appData.tutorial_is_video) ? appData.tutorial_is_video : [appData.tutorial_is_video];
            
            titles.forEach((title, i) => {
                if (title) {
                    let finalUrl = urls[i] || '';
                    if (req.files['video_tutorials'] && req.files['video_tutorials'][i]) {
                        finalUrl = '/uploads/' + req.files['video_tutorials'][i].filename;
                    }
                    tutorials.push({ 
                        title, 
                        url: finalUrl, 
                        icon: icons[i] || '🎬',
                        is_video: isVideoFlags[i] === 'true'
                    });
                }
            });
        }
        appData.tutorials = tutorials;

        const index = apps.findIndex(a => a.slug === (appData.original_slug || slug));
        if (index > -1) {
            apps[index] = { ...apps[index], ...appData };
        } else {
            apps.push(appData);
        }
        fs.writeJsonSync(DATA_FILE, apps);
        await generateAppPage(appData);
        res.redirect('/painel');
    } catch (error) {
        console.error(error);
        res.status(500).send("Erro ao salvar aplicativo.");
    }
});

app.get('/edit/:slug', (req, res) => {
    const apps = fs.readJsonSync(DATA_FILE);
    const appToEdit = apps.find(a => a.slug === req.params.slug);
    res.render('form', { app: appToEdit });
});

app.get('/delete/:slug', (req, res) => {
    let apps = fs.readJsonSync(DATA_FILE);
    apps = apps.filter(a => a.slug !== req.params.slug);
    fs.writeJsonSync(DATA_FILE, apps);
    const appDir = path.join(APPS_DIR, req.params.slug);
    if (fs.existsSync(appDir)) fs.removeSync(appDir);
    res.redirect('/painel');
});

app.get('/delete-image/:slug/:imgName', (req, res) => {
    const { slug, imgName } = req.params;
    const apps = fs.readJsonSync(DATA_FILE);
    const appIndex = apps.findIndex(a => a.slug === slug);
    if (appIndex > -1) {
        const imgPath = `/uploads/${imgName}`;
        apps[appIndex].interface_images = apps[appIndex].interface_images.filter(img => img !== imgPath);
        fs.writeJsonSync(DATA_FILE, apps);
        generateAppPage(apps[appIndex]);
    }
    res.redirect(`/edit/${slug}`);
});

// --- FUNÇÃO GERADORA DE PÁGINAS ---

async function generateAppPage(appData) {
    const templateHtmlPath = path.join(TEMPLATES_DIR, 'base.html');
    const templateCssPath = path.join(TEMPLATES_DIR, 'base.css');
    let templateHtml = await fs.readFile(templateHtmlPath, 'utf-8');
    let templateCss = await fs.readFile(templateCssPath, 'utf-8');

    let finalHtml = templateHtml
        .replace(/{{app_name}}/g, appData.name)
        .replace(/{{app_logo}}/g, appData.logo || '')
        .replace(/{{download_url}}/g, appData.downloadUrl || '#')
        .replace(/{{app_url}}/g, `${BASE_URL}/${appData.slug}`)
        .replace(/{{android_code}}/g, appData.firestickCode || '2787533')
        .replace(/{{firestick_code}}/g, appData.firestickCode || '2787533')
        .replace(/{{tvbox_code}}/g, appData.tvboxCode || '51412');

    // Tutoriais e Vídeos
    let tutorialsHtml = '';
    let videoSectionHtml = '';
    let hasVideos = false;
    let hasLinks = false;
    
    if (appData.tutorials && appData.tutorials.length > 0) {
        appData.tutorials.forEach((tut) => {
            if (tut.is_video) {
                hasVideos = true;
                videoSectionHtml += `
                <div class="video-card">
                    <h3>${tut.icon} ${tut.title}</h3>
                    <div class="video-wrapper">
                        <video controls preload="metadata"><source src="${tut.url}" type="video/mp4">Seu navegador não suporta vídeos.</video>
                    </div>
                </div>`;
            } else {
                hasLinks = true;
                tutorialsHtml += `<a class="tutorial-button" href="${tut.url}" target="_blank" rel="noopener noreferrer">${tut.icon} ${tut.title}</a>\n`;
            }
        });
    }
    
    if (hasVideos) {
        finalHtml = finalHtml.replace('id="video-tutorials-section" class="section-card tutorial-section" style="display: none;"', 'id="video-tutorials-section" class="section-card tutorial-section" style="display: block;"');
        finalHtml = finalHtml.replace('<div id="video-grid-placeholder"></div>', `<div class="video-grid">${videoSectionHtml}</div>`);
    }

    if (hasLinks) {
        finalHtml = finalHtml.replace('id="links-tutorials-section" class="section-card tutorial-section" style="display: none;"', 'id="links-tutorials-section" class="section-card tutorial-section" style="display: block;"');
        finalHtml = finalHtml.replace('<div class="tutorial-buttons" id="links-grid-placeholder">', `<div class="tutorial-buttons" id="links-grid-placeholder">${tutorialsHtml}`);
    }

    // Carrossel de Imagens
    if (appData.interface_images && appData.interface_images.length > 0) {
        let carouselHtml = `
        <h2 id="interface" style="text-align:center; margin-top:0; margin-bottom:20px;">🖥️ Interface do App</h2>
        <div class="carousel-container" style="position: relative; max-width: 100%; overflow: hidden; margin: 0 auto; border-radius: 1.25rem;">
            <div class="carousel-images" style="display: flex; transition: transform 0.5s ease-in-out;">
                ${appData.interface_images.map(img => `<img src="${img}" style="width: 100%; flex-shrink: 0;" alt="Interface ${appData.name}">`).join('')}
            </div>
            <button class="carousel-btn prev" onclick="moveCarousel(-1)" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); background: rgba(0,0,0,0.5); color: white; border: none; width: 40px; height: 40px; cursor: pointer; border-radius: 50%; z-index: 10;">&#10094;</button>
            <button class="carousel-btn next" onclick="moveCarousel(1)" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: rgba(0,0,0,0.5); color: white; border: none; width: 40px; height: 40px; cursor: pointer; border-radius: 50%; z-index: 10;">&#10095;</button>
        </div>
        <script>
            let currentIndex = 0;
            function moveCarousel(direction) {
                const images = document.querySelector('.carousel-images');
                if (!images) return;
                const total = images.children.length;
                currentIndex = (currentIndex + direction + total) % total;
                images.style.transform = 'translateX(-' + (currentIndex * 100) + '%)';
            }
        </script>`;
        finalHtml = finalHtml.replace('id="interface-placeholder" class="section-card" style="display: none;"', 'id="interface-placeholder" class="section-card" style="display: block;"');
        finalHtml = finalHtml.replace('<div id="interface-placeholder" class="section-card" style="display: block;"></div>', `<div id="interface-placeholder" class="section-card" style="display: block;">${carouselHtml}</div>`);
    }

    const appDir = path.join(APPS_DIR, appData.slug);
    await fs.ensureDir(appDir);
    await fs.writeFile(path.join(appDir, 'index.html'), finalHtml);
    await fs.writeFile(path.join(appDir, 'styles.css'), templateCss);
}

app.listen(PORT, HOST, () => {
    console.log(`Servidor rodando em http://${HOST}:${PORT}`);
});
