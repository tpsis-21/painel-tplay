require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs-extra');
const path = require('path');
const slugify = require('slugify');
const multer = require('multer');
const ejs = require('ejs');

const app = express();
// Hostinger Shared Hosting Node.js Selector usually looks for a file like 'app.js' or 'index.js'
// and the server should be exported or started.
const PORT = process.env.PORT || 3001;
const HOST = '127.0.0.1'; // Essential for some shared hosting environments
const BASE_URL = process.env.BASE_URL || 'https://ajuda.tplay21.in';

// --- CONFIGURAÇÃO DE DIRETÓRIOS (CAMINHOS ABSOLUTOS) ---
const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');
const APPS_DIR = path.join(PUBLIC_DIR, 'apps');
const DATA_FILE = path.join(ROOT_DIR, 'data', 'apps.json');
const VIEWS_DIR = path.join(ROOT_DIR, 'views');
const TEMPLATES_DIR = path.join(ROOT_DIR, 'templates');

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
app.set('port', PORT);
app.set('view engine', 'ejs');
app.set('views', VIEWS_DIR);
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(PUBLIC_DIR));

// --- ROTAS DO SITE PÚBLICO ---

app.get('/:slug', (req, res, next) => {
    const { slug } = req.params;
    const reserved = ['painel', 'tutorial', 'new', 'save', 'edit', 'delete', 'uploads', 'apps', 'delete-image', 'favicon.ico'];
    if (reserved.includes(slug)) return next();

    // Prioridade: Tenta achar o app no banco de dados e renderizar dinamicamente
    const apps = fs.readJsonSync(DATA_FILE);
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

        // Compatibilidade de dispositivos (painel)
        const devicesField = req.body.devices;
        const allDevicesDefault = ['android','androidtv','firestick','tvbox'];
        appData.compatibleDevices = Array.isArray(devicesField) ? devicesField : (devicesField ? [devicesField] : allDevicesDefault);

        // Código NTDown (TV Box) - compatibilidade retroativa
        appData.ntdownCode = appData.ntdownCode || appData.tvboxCode || '';

        let interfaceImages = [];
        if (appData.existing_interface_images) {
            interfaceImages = Array.isArray(appData.existing_interface_images) ? appData.existing_interface_images : [appData.existing_interface_images];
        }

        // Lógica de exclusão de imagens
        if (appData.deleted_images) {
            const imagesToDelete = Array.isArray(appData.deleted_images) ? appData.deleted_images : [appData.deleted_images];
            
            // Filtrar a lista de imagens existentes para remover as deletadas
            interfaceImages = interfaceImages.filter(imgUrl => !imagesToDelete.includes(imgUrl));

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
        await rebuildAll();
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

app.get('/delete/:slug', async (req, res) => {
    try {
        let apps = fs.readJsonSync(DATA_FILE);
        apps = apps.filter(a => a.slug !== req.params.slug);
        fs.writeJsonSync(DATA_FILE, apps);
        
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

// --- FUNÇÕES GERADORAS DE PÁGINAS ESTÁTICAS (SSG) ---

async function generateHomePage() {
    try {
        const apps = fs.readJsonSync(DATA_FILE);
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
        const html = await ejs.renderFile(path.join(VIEWS_DIR, 'tutorials.ejs'), { tutorials: allVideoTutorials });
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
    
    const apps = fs.readJsonSync(DATA_FILE);
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

    let finalHtml = templateHtml
        .replace(/{{app_name}}/g, appData.name)
        .replace(/{{app_logo}}/g, appData.logo || '')
        .replace(/{{download_url}}/g, appData.downloadUrl || '#')
        .replace(/{{app_url}}/g, `${BASE_URL}/${appData.slug}`)
        .replace(/{{android_code}}/g, appData.firestickCode || '2787533')
        .replace(/{{firestick_code}}/g, appData.firestickCode || '2787533')
        .replace(/{{tvbox_code}}/g, appData.tvboxCode || '51412')
        .replace(/{{NtdownCode}}/g, appData.ntdownCode || appData.tvboxCode || '51412');

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
    const appDesc = (appData.description && appData.description.trim())
        ? appData.description.trim()
        : `${appData.name} — Instalação rápida e segura para ${compatText}.`;
    finalHtml = finalHtml
        .replace(/{{compat_text}}/g, compatText)
        .replace(/{{app_description}}/g, appDesc)
        .replace(/{{meta_description}}/g, appDesc);

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
    let videosHtml = '';
    let linksHtml = '';
    if (appData.tutorials && appData.tutorials.length > 0) {
        appData.tutorials.forEach((tut) => {
            if (tut.is_video) {
                videosHtml += `
                <div class="bg-muted rounded-lg aspect-video flex items-center justify-center relative overflow-hidden">
                    <video controls preload="metadata" class="w-full h-full object-cover"><source src="${tut.url}" type="video/mp4"></video>
                </div>`;
            } else {
                linksHtml += `
                <a href="${tut.url}" target="_blank" rel="noopener noreferrer" class="bg-muted rounded-lg p-4 flex items-center hover:bg-accent transition-colors">
                    <span class="mr-3">${tut.icon}</span>
                    <span class="font-medium">${tut.title}</span>
                </a>`;
            }
        });
    }
    if (videosHtml) {
        finalHtml = replaceContainerInner(finalHtml, 'video-grid', videosHtml);
    }
    if (linksHtml) {
        finalHtml = replaceContainerInner(finalHtml, 'links-grid', linksHtml);
    }
    if (appData.interface_images && appData.interface_images.length > 0) {
        const imagesHtml = appData.interface_images.map(img => `
            <div class="bg-muted rounded-lg aspect-video overflow-hidden">
                <img src="${img}" alt="Interface ${appData.name}" class="w-full h-full object-cover" loading="lazy" decoding="async">
            </div>
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
