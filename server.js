require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs-extra');
const path = require('path');
const slugify = require('slugify');
const multer = require('multer');
const ejs = require('ejs');
const session = require('express-session');
const crypto = require('crypto');

const app = express();
// Hostinger Shared Hosting Node.js Selector usually looks for a file like 'app.js' or 'index.js'
// and the server should be exported or started.
const PORT = process.env.PORT || 3002;
// Host de bind do servidor. Em plataformas tipo EasyPanel/Nixpacks,
// 0.0.0.0 é o mais seguro para aceitar conexões externas.
const HOST = process.env.HOST || '0.0.0.0';
const BASE_URL = process.env.BASE_URL || 'https://ajuda.tplay21.in';

const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const APPS_DIR = path.join(PUBLIC_DIR, 'apps');
const VIEWS_DIR = path.join(ROOT_DIR, 'views');
const TEMPLATES_DIR = path.join(ROOT_DIR, 'templates');

function resolveAbsoluteDirFromEnv(value) {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    if (!trimmed) return '';
    return path.isAbsolute(trimmed) ? trimmed : path.resolve(ROOT_DIR, trimmed);
}

const STORAGE_DIR = resolveAbsoluteDirFromEnv(process.env.TPLAY_STORAGE_DIR) || path.resolve(ROOT_DIR, '..', 'tplay-storage');
const DATA_DIR = resolveAbsoluteDirFromEnv(process.env.TPLAY_DATA_DIR) || path.join(STORAGE_DIR, 'data');
const UPLOADS_DIR = resolveAbsoluteDirFromEnv(process.env.TPLAY_UPLOADS_DIR) || path.join(STORAGE_DIR, 'uploads');

const DATA_FILE = path.join(DATA_DIR, 'apps.json');
const GLOBAL_TUTORIALS_FILE = path.join(DATA_DIR, 'global_tutorials.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

const LEGACY_DATA_DIR = path.join(ROOT_DIR, 'data');
const LEGACY_UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');
const LEGACY_DATA_FILE = path.join(LEGACY_DATA_DIR, 'apps.json');
const LEGACY_GLOBAL_TUTORIALS_FILE = path.join(LEGACY_DATA_DIR, 'global_tutorials.json');
const LEGACY_SETTINGS_FILE = path.join(LEGACY_DATA_DIR, 'settings.json');

fs.ensureDirSync(PUBLIC_DIR);
fs.ensureDirSync(APPS_DIR);
fs.ensureDirSync(DATA_DIR);
fs.ensureDirSync(UPLOADS_DIR);

const ADMIN_USER = (process.env.ADMIN_USER || 'admin').trim();
const ADMIN_PASS = (process.env.ADMIN_PASS || 'changeme').trim();
const SESSION_SECRET = (process.env.SESSION_SECRET || 'change-me-in-production').trim();
const FORCE_HTTPS = process.env.FORCE_HTTPS === 'true';
// Por padrão NÃO força cookie secure; isso é controlado apenas via env.
// Em produção, defina COOKIE_SECURE=true no painel se o app estiver atrás de HTTPS.
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true';

if (SESSION_SECRET === 'change-me-in-production') {
    console.warn('SESSION_SECRET está usando valor padrão. Defina SESSION_SECRET em produção.');
}
if (ADMIN_USER.toLowerCase() === 'admin' && ADMIN_PASS === 'changeme') {
    console.warn('ADMIN_USER/ADMIN_PASS estão com valores padrão. Defina credenciais fortes em produção.');
}

function readJsonSafe(filePath, fallbackValue) {
    try {
        return fs.readJsonSync(filePath);
    } catch (error) {
        return fallbackValue;
    }
}

function shouldMigrateJsonFile(fromPath, toPath) {
    if (!fs.existsSync(fromPath)) return false;
    if (!fs.existsSync(toPath)) return true;

    const from = readJsonSafe(fromPath, null);
    const to = readJsonSafe(toPath, null);

    const fromIsNonEmptyArray = Array.isArray(from) && from.length > 0;
    const toIsEmptyArray = Array.isArray(to) && to.length === 0;
    if (fromIsNonEmptyArray && toIsEmptyArray) return true;

    const fromIsObject = from && typeof from === 'object' && !Array.isArray(from);
    const toIsEmptyObject = to && typeof to === 'object' && !Array.isArray(to) && Object.keys(to).length === 0;
    if (fromIsObject && toIsEmptyObject) return true;

    return false;
}

function migrateJsonFileIfNeeded(fromPath, toPath) {
    if (!shouldMigrateJsonFile(fromPath, toPath)) return;
    fs.ensureDirSync(path.dirname(toPath));
    fs.copySync(fromPath, toPath, { overwrite: true });
}

function dirHasUserFiles(dirPath) {
    try {
        if (!fs.existsSync(dirPath)) return false;
        const entries = fs.readdirSync(dirPath);
        return entries.some(name => name !== '.gitkeep');
    } catch (error) {
        return false;
    }
}

function migrateUploadsDirIfNeeded(fromDir, toDir) {
    if (!dirHasUserFiles(fromDir)) return;
    if (dirHasUserFiles(toDir)) return;
    fs.ensureDirSync(toDir);
    fs.copySync(fromDir, toDir, { overwrite: false, errorOnExist: false });
}

migrateJsonFileIfNeeded(LEGACY_DATA_FILE, DATA_FILE);
migrateJsonFileIfNeeded(LEGACY_GLOBAL_TUTORIALS_FILE, GLOBAL_TUTORIALS_FILE);
migrateJsonFileIfNeeded(LEGACY_SETTINGS_FILE, SETTINGS_FILE);
migrateUploadsDirIfNeeded(LEGACY_UPLOADS_DIR, UPLOADS_DIR);

function loadApps() {
    try {
        const raw = fs.readJsonSync(DATA_FILE);
        const list = Array.isArray(raw) ? raw : [];
        return list
            .map((app) => {
                if (!app || typeof app !== 'object') return null;
                const normalized = { ...app };
                if (!normalized.slug && typeof normalized.name === 'string' && normalized.name.trim()) {
                    normalized.slug = slugify(normalized.name, { lower: true, strict: true });
                }
                if (!normalized.downloadUrl && typeof normalized.download_url === 'string') {
                    normalized.downloadUrl = normalized.download_url.trim();
                }
                if (!normalized.logo && typeof normalized.logo_url === 'string') {
                    normalized.logo = normalized.logo_url.trim();
                }
                if (!normalized.ntdownCode && (normalized.tvboxCode || normalized.tvbox_code)) {
                    normalized.ntdownCode = normalized.tvboxCode || normalized.tvbox_code || '';
                }
                return normalized;
            })
            .filter(Boolean);
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
            videoAndroidTvDownloaderUrl: '',
            videoFirestickDownloaderUrl: '',
            videoDownloaderUrl: '',
            videoNtDownUrl: '',
            videoBrowserDownloadUrl: ''
        },
        adminAuth: null
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
            },
            adminAuth: fileSettings && typeof fileSettings.adminAuth !== 'undefined' ? fileSettings.adminAuth : defaults.adminAuth
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

function buildPasswordHashRecord(password) {
    const iterations = 120000;
    const digest = 'sha256';
    const keylen = 32;
    const salt = crypto.randomBytes(16);
    const hash = crypto.pbkdf2Sync(password, salt, iterations, keylen, digest);
    return {
        iterations,
        digest,
        keylen,
        salt: salt.toString('base64'),
        hash: hash.toString('base64')
    };
}

function verifyPasswordHashRecord(password, record) {
    if (!record || typeof record !== 'object') return false;
    if (typeof record.salt !== 'string' || typeof record.hash !== 'string') return false;
    const iterations = Number(record.iterations) || 120000;
    const digest = typeof record.digest === 'string' ? record.digest : 'sha256';
    const keylen = Number(record.keylen) || 32;
    const salt = Buffer.from(record.salt, 'base64');
    const expectedHash = Buffer.from(record.hash, 'base64');
    const actualHash = crypto.pbkdf2Sync(password, salt, iterations, keylen, digest);
    if (actualHash.length !== expectedHash.length) return false;
    return crypto.timingSafeEqual(actualHash, expectedHash);
}

function syncAdminFromEnvToSettings() {
    const envUser = (process.env.ADMIN_USER || 'admin').trim();
    const envPass = (process.env.ADMIN_PASS || 'changeme').trim();
    const envIsDefault = envUser.toLowerCase() === 'admin' && envPass === 'changeme';
    if (envIsDefault) return;

    const current = loadSettings();
    const currentAuth = current && current.adminAuth ? current.adminAuth : null;
    const alreadyHasSameUser = currentAuth && typeof currentAuth.username === 'string' && currentAuth.username.trim().toLowerCase() === envUser.toLowerCase();
    if (alreadyHasSameUser && currentAuth && verifyPasswordHashRecord(envPass, currentAuth)) return;

    const next = {
        ...current,
        adminAuth: {
            username: envUser,
            ...buildPasswordHashRecord(envPass)
        }
    };
    saveSettings(next);
}

function getAdminAuth() {
    const envUser = (process.env.ADMIN_USER || 'admin').trim();
    const envPass = (process.env.ADMIN_PASS || 'changeme').trim();
    const envIsDefault = envUser.toLowerCase() === 'admin' && envPass === 'changeme';
    if (!envIsDefault) {
        return {
            username: envUser,
            verify: (password) => password === envPass
        };
    }

    const settings = loadSettings();
    const auth = settings && settings.adminAuth ? settings.adminAuth : null;
    if (auth && typeof auth.username === 'string' && auth.username.trim()) {
        return {
            username: auth.username.trim(),
            verify: (password) => verifyPasswordHashRecord(password, auth)
        };
    }

    return {
        username: envUser,
        verify: (password) => password === envPass
    };
}

syncAdminFromEnvToSettings();

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
app.set('trust proxy', 1);
app.use(bodyParser.urlencoded({ extended: true }));
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(PUBLIC_DIR));
if (FORCE_HTTPS) {
    app.use((req, res, next) => {
        const proto = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
        if (proto !== 'https') {
            const host = req.headers.host;
            const url = `https://${host}${req.originalUrl}`;
            return res.redirect(301, url);
        }
        next();
    });
}
app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: COOKIE_SECURE,
        httpOnly: true
    }
}));
app.use((req, res, next) => {
    res.locals.isAuthenticated = !!(req.session && req.session.user);
    next();
});

app.get('/healthz', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

function ensureAuthenticated(req, res, next) {
    if (req.session && req.session.user) {
        return next();
    }
    res.redirect('/login?msg=auth');
}

app.get('/login', (req, res) => {
    if (req.session && req.session.user) {
        return res.redirect('/painel');
    }
    const msg = req.query && req.query.msg;
    const error = msg === 'auth' ? 'Sua sessão expirou ou você não está autenticado.' : null;
    let hint = null;
    try {
        const envUser = (process.env.ADMIN_USER || 'admin').trim();
        const envPass = (process.env.ADMIN_PASS || 'changeme').trim();
        const envIsDefault = envUser.toLowerCase() === 'admin' && envPass === 'changeme';
        const settings = loadSettings();
        const hasStoredAuth = !!(settings && settings.adminAuth && typeof settings.adminAuth.username === 'string' && settings.adminAuth.username.trim());
        if (process.env.NODE_ENV !== 'production' && envIsDefault && !hasStoredAuth) {
            hint = `Credenciais locais padrão: usuário "${envUser}" e senha "${envPass}". Para alterar, defina ADMIN_USER e ADMIN_PASS no ambiente (.env).`;
        }
    } catch {}
    res.render('login', { error, hint });
});

app.post('/login', (req, res) => {
    const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body.password === 'string' ? req.body.password.trim() : '';
    const auth = getAdminAuth();
    const usernameOk = username.length > 0 && username.toLowerCase() === auth.username.toLowerCase();
    const passwordOk = auth.verify(password);
    if (usernameOk && passwordOk) {
        req.session.user = { name: username };
        return res.redirect('/painel');
    }
    console.warn('Falha de login: usuário ou senha inválidos');
    res.status(401).render('login', { error: 'Credenciais inválidas. Verifique as variáveis do ambiente ou as credenciais persistidas.' });
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

app.get('/:slug', async (req, res, next) => {
    const { slug } = req.params;
    const reserved = ['painel', 'tutorial', 'new', 'save', 'edit', 'delete', 'uploads', 'apps', 'delete-image', 'favicon.ico', 'login', 'logout'];
    if (reserved.includes(slug)) return next();

    // Prioridade: Tenta achar o app no banco de dados e renderizar dinamicamente
    const apps = loadApps();
    const appData = apps.find(a => a.slug === slug);

    if (appData) {
        const appFilePath = path.join(APPS_DIR, slug, 'index.html');
        const templateHtmlPath = path.join(TEMPLATES_DIR, 'base.html');
        const templateCssPath = path.join(TEMPLATES_DIR, 'base.css');

        const hasMinimumAppUi = (html) => {
            if (typeof html !== 'string' || !html) return false;
            return html.includes('id="download-btn"') && html.includes('data-target="android-section"');
        };

        const safeMtimeMs = (filePath) => {
            try {
                return fs.statSync(filePath).mtimeMs || 0;
            } catch {
                return 0;
            }
        };

        const templateStamp = Math.max(safeMtimeMs(templateHtmlPath), safeMtimeMs(templateCssPath));
        const generatorStamp = safeMtimeMs(__filename);
        const pageStamp = safeMtimeMs(appFilePath);
        const updatedAtStamp = (() => {
            const raw = (appData.updatedAt || appData.createdAt || '').toString();
            const parsed = Date.parse(raw);
            return Number.isFinite(parsed) ? parsed : 0;
        })();

        let cachedHtml = '';
        if (fs.existsSync(appFilePath)) {
            try {
                cachedHtml = await fs.readFile(appFilePath, 'utf-8');
            } catch {}
        }

        const shouldRegenerate = !cachedHtml || !hasMinimumAppUi(cachedHtml) || templateStamp > pageStamp || generatorStamp > pageStamp || updatedAtStamp > pageStamp;

        if (shouldRegenerate) {
            try {
                const html = await generateAppPage(appData);
                if (typeof html === 'string' && html.trim()) {
                    return res.send(html);
                }
            } catch (error) {
                console.error('Erro ao gerar página do app:', error);
            }
        }

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

app.get('/tutorial/global/:slug', (req, res) => {
    try {
        const slug = typeof req.params.slug === 'string' ? req.params.slug.trim() : '';
        if (!slug) return res.status(404).send('Tutorial não encontrado.');

        const tutorials = loadGlobalTutorials();
        const tutorial = tutorials.find(t => String(t.slug || '').trim() === slug);
        if (!tutorial) return res.status(404).send('Tutorial não encontrado.');

        const publicUrl = `${BASE_URL}/tutorial/global/${tutorial.slug}`;
        res.render('tutorial_global_view', { tutorial, publicUrl });
    } catch (error) {
        console.error(error);
        res.status(500).send('Erro ao carregar tutorial.');
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
    res.render('settings', { settings, baseUrl: BASE_URL });
});

app.post('/painel/config', ensureAuthenticated, upload.fields([
    { name: 'universal_androidtv_video_file', maxCount: 1 },
    { name: 'universal_firestick_video_file', maxCount: 1 },
    { name: 'universal_ntdown_video_file', maxCount: 1 },
    { name: 'universal_browser_video_file', maxCount: 1 }
]), async (req, res) => {
    try {
        const body = req.body;
        const current = loadSettings();
        const existing = (current && current.universalTutorials) ? current.universalTutorials : {};
        const filesByField = req.files || {};

        const fileUrl = (field) => {
            const f = filesByField[field] && filesByField[field][0];
            return f ? ('/uploads/' + f.filename) : '';
        };

        const pickUrl = (bodyValue, uploadedValue, fallbackValue) => {
            if (uploadedValue) return uploadedValue;
            if (typeof bodyValue === 'string') return bodyValue.trim();
            return fallbackValue || '';
        };

        const legacyDownloaderFallback = existing.videoDownloaderUrl || '';
        const next = {
            ...current,
            universalTutorials: {
                ...existing,
                videoAndroidTvDownloaderUrl: pickUrl(
                    body.universalVideoAndroidTvDownloaderUrl,
                    fileUrl('universal_androidtv_video_file'),
                    existing.videoAndroidTvDownloaderUrl || legacyDownloaderFallback
                ),
                videoFirestickDownloaderUrl: pickUrl(
                    body.universalVideoFirestickDownloaderUrl,
                    fileUrl('universal_firestick_video_file'),
                    existing.videoFirestickDownloaderUrl || legacyDownloaderFallback
                ),
                videoNtDownUrl: pickUrl(
                    body.universalVideoNtDownUrl,
                    fileUrl('universal_ntdown_video_file'),
                    existing.videoNtDownUrl || ''
                ),
                videoBrowserDownloadUrl: pickUrl(
                    body.universalVideoBrowserDownloadUrl,
                    fileUrl('universal_browser_video_file'),
                    existing.videoBrowserDownloadUrl || ''
                )
            }
        };
        saveSettings(next);
        await rebuildAll();
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

function buildTutorialsFromPayload(appData, files) {
    const tutorials = [];
    const toArray = (value) => {
        if (typeof value === 'undefined' || value === null) return [];
        return Array.isArray(value) ? value : [value];
    };
    const titles = toArray(appData.tutorial_titles);
    const urls = toArray(appData.tutorial_urls);
    const texts = toArray(appData.tutorial_texts);
    const icons = toArray(appData.tutorial_icons);
    const isVideoFlags = toArray(appData.tutorial_is_video);
    const videoFiles = files && files['video_tutorials'] ? files['video_tutorials'] : [];
    const hasPayload = titles.length || urls.length || texts.length || isVideoFlags.length || videoFiles.length;
    if (!hasPayload) return tutorials;
    const maxLen = Math.max(
        titles.length,
        urls.length,
        texts.length,
        icons.length,
        isVideoFlags.length,
        videoFiles.length
    );
    for (let i = 0; i < maxLen; i++) {
        const label = (titles[i] || '').trim();
        const rawText = (texts[i] || '').trim();
        let finalUrl = (urls[i] || '').trim();
        if (videoFiles[i]) {
            finalUrl = '/uploads/' + videoFiles[i].filename;
        }
        if (!finalUrl && !rawText) continue;
        const explicitIsVideo = isVideoFlags[i] === 'true';
        const autoIsVideo = finalUrl && (finalUrl.startsWith('/uploads/') || finalUrl.toLowerCase().endsWith('.mp4'));
        tutorials.push({
            title: label || (finalUrl ? 'Tutorial em vídeo' : 'Tutorial'),
            url: finalUrl || '',
            description: rawText || '',
            icon: (icons[i] || '🎬'),
            is_video: explicitIsVideo || autoIsVideo
        });
    }
    return tutorials;
}

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

        const pickPublicUrl = (value) => {
            if (typeof value !== 'string') return '';
            const trimmed = value.trim();
            if (!trimmed) return '';
            if (trimmed.startsWith('/uploads/')) return trimmed;
            try {
                const parsed = new URL(trimmed);
                if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return trimmed;
                return '';
            } catch {
                return '';
            }
        };

        const typedLogoUrl = pickPublicUrl(req.body.logo_url);
        const typedDownloadUrl = pickPublicUrl(req.body.download_url);
        const existingLogo = pickPublicUrl(req.body.logo);
        const existingDownloadUrl = pickPublicUrl(req.body.downloadUrl);

        if (req.files['logo_file']) {
            appData.logo = '/uploads/' + req.files['logo_file'][0].filename;
        } else {
            appData.logo = typedLogoUrl || existingLogo || '';
        }

        if (req.files['download_file']) {
            appData.downloadUrl = '/uploads/' + req.files['download_file'][0].filename;
        } else {
            appData.downloadUrl = typedDownloadUrl || existingDownloadUrl || '';
        }
        delete appData.logo_url;
        delete appData.download_url;

        // Compatibilidade de dispositivos (painel)
        const devicesField = req.body.devices;
        const allDevicesDefault = ['android','androidtv','firestick','tvbox'];
        appData.compatibleDevices = Array.isArray(devicesField) ? devicesField : (devicesField ? [devicesField] : allDevicesDefault);

        const existingDeviceInstructions = appData.deviceInstructions && typeof appData.deviceInstructions === 'object'
            ? appData.deviceInstructions
            : {};
        const readInstructionsField = (value) => (typeof value === 'string' ? value.trim() : '');
        appData.deviceInstructions = {
            ...existingDeviceInstructions,
            samsung: readInstructionsField(req.body.device_instructions_samsung),
            lg: readInstructionsField(req.body.device_instructions_lg),
            roku: readInstructionsField(req.body.device_instructions_roku),
            pc: readInstructionsField(req.body.device_instructions_pc)
        };

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

        appData.tutorials = buildTutorialsFromPayload(appData, req.files);

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

app.get('/delete/:slug', ensureAuthenticated, (req, res) => {
    res.status(405).send('Método não permitido. Use o painel para confirmar a exclusão do app.');
});

app.post('/delete/:slug', ensureAuthenticated, async (req, res) => {
    try {
        const slug = typeof req.params.slug === 'string' ? req.params.slug.trim() : '';
        const confirmSlug = typeof req.body.confirmSlug === 'string' ? req.body.confirmSlug.trim() : '';
        const confirmed = req.body.confirmed === 'true';

        if (!slug) return res.status(400).send('Slug inválido.');

        const apps = loadApps();
        const existing = apps.find(a => a.slug === slug);
        if (!existing) return res.status(404).send('App não encontrado.');

        if (!confirmed || confirmSlug !== slug) {
            return res.status(400).send('Confirmação inválida. Verifique o slug digitado e tente novamente.');
        }

        const nextApps = apps.filter(a => a.slug !== slug);
        saveApps(nextApps);

        const appDir = path.join(APPS_DIR, slug);
        if (fs.existsSync(appDir)) fs.removeSync(appDir);

        await generateHomePage();
        await generateTutorialsPage();

        res.redirect('/painel');
    } catch (error) {
        console.error('Erro ao excluir app:', error);
        res.status(500).send('Erro ao excluir aplicativo.');
    }
});

app.get('/delete-image/:slug/:imgName', ensureAuthenticated, (req, res) => {
    res.status(405).send('Método não permitido. Use o painel para confirmar a remoção da imagem.');
});

app.post('/delete-image/:slug/:imgName', ensureAuthenticated, async (req, res) => {
    try {
        const { slug, imgName } = req.params;
        const confirmImgName = typeof req.body.confirmImgName === 'string' ? req.body.confirmImgName.trim() : '';
        const confirmed = req.body.confirmed === 'true';

        if (!confirmed || confirmImgName !== imgName) {
            return res.status(400).send('Confirmação inválida. Verifique o nome do arquivo e tente novamente.');
        }

        const apps = loadApps();
        const appIndex = apps.findIndex(a => a.slug === slug);
        if (appIndex === -1) return res.status(404).send('App não encontrado.');

        const imgPath = `/uploads/${imgName}`;
        const nextImages = (apps[appIndex].interface_images || []).filter(img => img !== imgPath);
        apps[appIndex].interface_images = nextImages;

        saveApps(apps);
        await rebuildAll();

        res.redirect(`/edit/${slug}`);
    } catch (error) {
        console.error('Erro ao excluir imagem:', error);
        res.status(500).send('Erro ao excluir imagem.');
    }
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

function computeEmbedSrc(url) {
    if (!url || !/^https?:\/\//i.test(url)) return '';
    try {
        const parsed = new URL(url);
        const host = parsed.hostname.toLowerCase();
        if (host.includes('youtube.com') || host.includes('youtu.be')) {
            let videoId = '';
            if (host.includes('youtu.be')) {
                videoId = parsed.pathname.replace('/', '').split(/[?&#]/)[0];
            } else {
                videoId = parsed.searchParams.get('v') || '';
            }
            if (videoId) {
                return `https://www.youtube.com/embed/${videoId}`;
            }
        } else if (host.includes('vimeo.com')) {
            const parts = parsed.pathname.split('/').filter(Boolean);
            const last = parts[parts.length - 1] || '';
            if (last && /^\d+$/.test(last)) {
                return `https://player.vimeo.com/video/${last}`;
            }
        }
    } catch {
        return '';
    }
    return '';
}

function buildTutorialSectionsHtml(tutorials) {
    let videosHtml = '';
    let linksHtml = '';
    if (!Array.isArray(tutorials) || tutorials.length === 0) {
        return { videosHtml, linksHtml };
    }
    tutorials.forEach((tut) => {
        const title = (tut.title || '').trim();
        const description = (tut.description || '').trim();
        const url = (tut.url || '').trim();
        const icon = tut.icon || '🎬';
        const hasUrl = !!url;
        const isLocalVideo = hasUrl && (
            url.startsWith('/uploads/') ||
            url.toLowerCase().endsWith('.mp4') ||
            url.toLowerCase().endsWith('.webm') ||
            url.toLowerCase().endsWith('.ogg')
        );
        const embedSrc = computeEmbedSrc(url);

        if (tut.is_video && isLocalVideo) {
            videosHtml += `
                <div class="bg-card border border-border rounded-lg overflow-hidden shadow-sm">
                    <div class="aspect-video bg-black flex items-center justify-center">
                        <video controls preload="metadata" class="w-full h-full object-contain">
                            <source src="${url}" type="video/mp4">
                        </video>
                    </div>
                    <div class="p-3">
                        <p class="text-sm font-medium text-card-foreground truncate">${title}</p>
                        ${description ? `<p class="mt-1 text-xs text-muted-foreground line-clamp-2">${description}</p>` : ''}
                    </div>
                </div>`;
        } else if (tut.is_video && hasUrl && embedSrc) {
            videosHtml += `
                <div class="bg-card border border-border rounded-lg overflow-hidden shadow-sm">
                    <div class="aspect-video bg-black">
                        <iframe src="${embedSrc}" title="${title || 'Vídeo tutorial'}" loading="lazy" allowfullscreen class="w-full h-full border-0 rounded-none"></iframe>
                    </div>
                    <div class="p-3">
                        <p class="text-sm font-medium text-card-foreground truncate">${title}</p>
                        ${description ? `<p class="mt-1 text-xs text-muted-foreground line-clamp-2">${description}</p>` : ''}
                    </div>
                </div>`;
        } else if (tut.is_video && hasUrl) {
            videosHtml += `
                <article class="w-full bg-card border border-border rounded-lg p-4 hover:bg-accent/40 transition-colors">
                    <div class="flex items-start gap-3">
                        <span class="text-lg mt-1" aria-hidden="true">${icon}</span>
                        <div class="flex-1 min-w-0">
                            <h3 class="text-sm font-semibold text-card-foreground mb-1">${title}</h3>
                            ${description ? `<p class="text-xs text-muted-foreground whitespace-pre-line mb-2">${description}</p>` : ''}
                            <button type="button" onclick="window.open('${url}','_blank')" class="inline-flex items-center gap-2 text-xs font-medium text-primary hover:underline">
                                <i class="fas fa-external-link-alt"></i>
                                Assistir tutorial em nova aba
                            </button>
                        </div>
                    </div>
                </article>`;
        } else {
            if (!hasUrl && !description) {
                return;
            }
            const fullText = description || '';
            const maxPreviewLength = 160;
            const hasMoreText = fullText.length > maxPreviewLength;
            const previewText = hasMoreText ? `${fullText.slice(0, maxPreviewLength).trimEnd()}...` : fullText;
            linksHtml += `
                <article class="w-full bg-card border border-border rounded-lg p-4">
                    <details class="group">
                        <summary class="flex items-start gap-3 cursor-pointer list-none">
                            <span class="text-lg mt-1" aria-hidden="true">${icon}</span>
                            <div class="flex-1 min-w-0">
                                <h3 class="text-sm font-semibold text-card-foreground mb-1">${title}</h3>
                                ${fullText ? `<p class="text-xs text-muted-foreground mb-1">${previewText}</p>` : ''}
                                ${hasMoreText ? `<span class="inline-flex items-center gap-1 text-[11px] font-medium text-primary group-open:hidden">Clique para ler o guia completo<i class="fas fa-chevron-down text-[10px]"></i></span>` : ''}
                                ${hasMoreText ? `<span class="hidden group-open:inline-flex items-center gap-1 text-[11px] font-medium text-primary">Ocultar guia completo<i class="fas fa-chevron-up text-[10px]"></i></span>` : ''}
                                ${!hasMoreText && fullText ? `<span class="text-[11px] font-medium text-muted-foreground">Guia curto: leitura rápida</span>` : ''}
                            </div>
                        </summary>
                        <div class="mt-3 pl-8 space-y-2">
                            ${fullText ? `<div class="text-xs text-muted-foreground whitespace-pre-line">${fullText}</div>` : ''}
                            ${hasUrl ? `
                                <button type="button" onclick="window.open('${url}','_blank')" class="inline-flex items-center gap-2 text-xs font-medium text-primary hover:underline">
                                    <i class="fas fa-external-link-alt"></i>
                                    Abrir link relacionado
                                </button>
                            ` : ''}
                        </div>
                    </details>
                </article>`;
        }
    });
    return { videosHtml, linksHtml };
}


function buildDeviceSteps(appData) {
    const deviceInstructions = appData && appData.deviceInstructions && typeof appData.deviceInstructions === 'object'
        ? appData.deviceInstructions
        : {};
    const buildStepsHtml = (raw, fallbackLines) => {
        const lines = (typeof raw === 'string' ? raw.split(/\r?\n/) : [])
            .map(l => l.trim())
            .filter(Boolean);
        const finalLines = lines.length > 0 ? lines : (fallbackLines || []);
        return finalLines.map((text, idx) => `
            <li class="flex items-center"><span class="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs mr-3">${idx + 1}</span> ${text}</li>
        `).join('');
    };
    const appName = appData.name || 'o aplicativo';
    const defaultTvSteps = [
        'Acesse a <strong>loja de aplicativos</strong> da sua TV',
        `Procure por "<strong>${appName}</strong>"`,
        'Clique em <strong>"Instalar"</strong>',
        'Aguarde a instalação e abra o aplicativo'
    ];
    return {
        samsung_steps: buildStepsHtml(deviceInstructions.samsung, defaultTvSteps),
        lg_steps: buildStepsHtml(deviceInstructions.lg, defaultTvSteps),
        roku_steps: buildStepsHtml(deviceInstructions.roku, defaultTvSteps),
        pc_steps: buildStepsHtml(deviceInstructions.pc, [
            'Instale um emulador Android confiável',
            'Baixe o APK pelo navegador e abra no emulador',
            'Conclua a instalação e abra o app'
        ])
    };
}

function buildAppPageView(appData) {
    const devicesList = Array.isArray(appData.compatibleDevices) && appData.compatibleDevices.length > 0
        ? appData.compatibleDevices
        : ['android','androidtv','firestick','tvbox'];
    const labels = {
        android: 'Celular Android',
        androidtv: 'Android TV / Mi Stick',
        firestick: 'Fire Stick',
        tvbox: 'TV Box / Receptores / Projetores',
        samsung: 'Smart TV Samsung (Tizen)',
        lg: 'Smart TV LG (webOS)',
        roku: 'Smart TV Roku',
        pc: 'PC / Notebook'
    };
    const compatItems = devicesList.map(d => labels[d]).filter(Boolean);
    const compatText = compatItems.length > 1
        ? compatItems.slice(0, -1).join(', ') + ' e ' + compatItems.slice(-1)
        : (compatItems[0] || 'Android');
    const hasCustomDescription = !!(appData.description && appData.description.trim());
    const appDesc = hasCustomDescription ? appData.description.trim() : '';
    const metaDesc = hasCustomDescription ? appData.description.trim() : (appData.name || '');
    const defaultDeviceId = `${devicesList[0]}-section`;
    return {
        devicesList,
        compatText,
        appDesc,
        metaDesc,
        defaultDeviceId
    };
}

async function generateAppPage(appData) {

    const templateHtmlPath = path.join(TEMPLATES_DIR, 'base.html');
    const templateCssPath = path.join(TEMPLATES_DIR, 'base.css');
    let templateHtml = await fs.readFile(templateHtmlPath, 'utf-8');
    let templateCss = await fs.readFile(templateCssPath, 'utf-8');

    const pageTitle = `${appData.name} - Loja TPlay | Download Oficial`;
    const view = buildAppPageView(appData);

    let finalHtml = templateHtml
        .replace(/{{app_name}}/g, appData.name)
        .replace(/{{app_logo}}/g, appData.logo || '')
        .replace(/{{download_url}}/g, appData.downloadUrl || '#')
        .replace(/{{app_url}}/g, `${BASE_URL}/${appData.slug}`)
        .replace(/{{android_code}}/g, appData.firestickCode || '2787533')
        .replace(/{{firestick_code}}/g, appData.firestickCode || '2787533')
        .replace(/{{tvbox_code}}/g, appData.tvboxCode || '51412')
        .replace(/{{NtdownCode}}/g, appData.ntdownCode || appData.tvboxCode || '51412')
        .replace(/{{page_title}}/g, pageTitle)
        .replace(/{{default_device}}/g, view.defaultDeviceId)
        .replace(/{{compat_text}}/g, view.compatText)
        .replace(/{{app_description}}/g, view.appDesc)
        .replace(/{{meta_description}}/g, view.metaDesc);

    const deviceSteps = buildDeviceSteps(appData);
    finalHtml = finalHtml
        .replace(/{{samsung_steps}}/g, deviceSteps.samsung_steps)
        .replace(/{{lg_steps}}/g, deviceSteps.lg_steps)
        .replace(/{{roku_steps}}/g, deviceSteps.roku_steps)
        .replace(/{{pc_steps}}/g, deviceSteps.pc_steps);

    const allDevices = ['android','androidtv','firestick','tvbox','samsung','lg','roku','pc'];
    for (const dev of allDevices) {
        if (!view.devicesList.includes(dev)) {
            const sectionId = `${dev}-section`;
            const buttonRegex = new RegExp(`<button\\b[^>]*\\bdata-target="${sectionId}"[^>]*>[\\s\\S]*?<\\/button>`, 'g');
            const sectionRegex = new RegExp(`<section\\b[^>]*\\bid="${sectionId}"[^>]*>[\\s\\S]*?<\\/section>`, 'g');
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

    const tutorialSections = buildTutorialSectionsHtml(appData.tutorials || []);
    if (tutorialSections.videosHtml) {
        finalHtml = replaceContainerInner(finalHtml, 'video-grid', tutorialSections.videosHtml);
    }
    if (tutorialSections.linksHtml) {
        finalHtml = replaceContainerInner(finalHtml, 'links-grid', tutorialSections.linksHtml);
    } else {
        const textSectionRegex = /<section\s+id="text-guides-section"[\s\S]*?<\/section>/;
        finalHtml = finalHtml.replace(textSectionRegex, '');
    }
    const androidTvVideoUrl = appData.videoAndroidTvDownloaderUrl
        || appData.videoDownloaderUrl
        || universal.videoAndroidTvDownloaderUrl
        || universal.videoDownloaderUrl
        || '';
    const firestickVideoUrl = appData.videoFirestickDownloaderUrl
        || appData.videoDownloaderUrl
        || universal.videoFirestickDownloaderUrl
        || universal.videoDownloaderUrl
        || '';
    const ntdownVideoUrl = appData.videoNtDownUrl || universal.videoNtDownUrl || '';
    const browserVideoUrl = appData.videoBrowserDownloadUrl || universal.videoBrowserDownloadUrl || '';
    const androidTvTutorialButton = androidTvVideoUrl
        ? `<a class="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors inline-flex items-center" href="${androidTvVideoUrl}" target="_blank" rel="noopener noreferrer"><i class="fas fa-play-circle mr-2"></i>Vídeo tutorial</a>`
        : '';
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
        .replace(/{{androidtv_tutorial_button}}/g, androidTvTutorialButton)
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
    return finalHtml;
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
