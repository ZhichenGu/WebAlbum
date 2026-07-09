// ===================== 状态管理 =====================
let mediaList = [];
let currentIndex = 0;
let isBrowseMode = false;
let idleTimer = null;
let idleProgress = 0;
const IDLE_TIMEOUT = 90000; // 90秒无操作后进入屏保/教程
const IDLE_CHECK_INTERVAL = 100;
let dwellTimers = {};
const DWELL_TIME = 1800;        // 悬停1.8秒首次触发
const DWELL_REPEAT_TIME = 3500;  // 保持悬停时的连续翻页间隔
const PROGRESS_CIRCUMFERENCE = 2 * Math.PI * 40; // r=40

const slotClasses = ['pos-far-left', 'pos-left', 'pos-main', 'pos-right', 'pos-far-right'];
const slotIds = ['slot0', 'slot1', 'slot2', 'slot3', 'slot4'];

const SAMPLE_MEDIA = [
    { id: 'sample-0', type: 'image', url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=2070&q=80', source: 'sample' },
    { id: 'sample-1', type: 'image', url: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=2074&q=80', source: 'sample' },
    { id: 'sample-2', type: 'image', url: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=2071&q=80', source: 'sample' },
    { id: 'sample-3', type: 'image', url: 'https://images.unsplash.com/photo-1418065460487-3956ef138977?auto=format&fit=crop&w=2070&q=80', source: 'sample' },
    { id: 'sample-4', type: 'image', url: 'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?auto=format&fit=crop&w=2070&q=80', source: 'sample' }
];

// 已删除的示例图（记在 localStorage，重启后不再出现）
function getHiddenSamples() {
    try { return JSON.parse(localStorage.getItem('hiddenSamples')) || []; } catch (e) { return []; }
}

function hideSample(id) {
    const hidden = getHiddenSamples();
    if (!hidden.includes(id)) {
        hidden.push(id);
        try { localStorage.setItem('hiddenSamples', JSON.stringify(hidden)); } catch (e) {}
    }
}

// ===================== 主题色系统（颜色滑台 + 深浅模式） =====================
let themeHue = 258;
let isLightMode = false;

function applyThemeMode(light, save = true) {
    isLightMode = light;
    document.body.classList.toggle('light', light);
    const toggle = document.getElementById('modeToggle');
    if (toggle) toggle.textContent = light ? '☀' : '☾';
    if (save) {
        try { localStorage.setItem('albumThemeMode', light ? 'light' : 'dark'); } catch (e) {}
    }
    rebuildTutorialPalette();
}

function applyThemeHue(h, save = true) {
    themeHue = h;
    document.documentElement.style.setProperty('--h', h);
    if (save) {
        try { localStorage.setItem('albumThemeHue', String(h)); } catch (e) {}
    }
    // 重新着色背景粒子
    for (const p of particles) {
        p.h = (h + p.hueOff + 360) % 360;
    }
    rebuildTutorialPalette();
}

function initTheme() {
    let saved = 258;
    try {
        const v = parseFloat(localStorage.getItem('albumThemeHue'));
        if (!isNaN(v)) saved = v;
    } catch (e) {}
    const slider = document.getElementById('hueSlider');
    slider.value = saved;
    applyThemeHue(saved, false);
    slider.addEventListener('input', () => {
        applyThemeHue(parseFloat(slider.value));
        resetIdleTimer();
    });

    // 深浅模式：默认浅色（白底）
    let mode = 'light';
    try { mode = localStorage.getItem('albumThemeMode') || 'light'; } catch (e) {}
    applyThemeMode(mode === 'light', false);
}

// ===================== IndexedDB 持久化（支持大视频，localStorage 存不下） =====================
const DB_NAME = 'albumDB';
const STORE = 'uploads';

function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE)) {
                db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function dbAdd(record) {
    return openDB().then(db => new Promise((resolve, reject) => {
        const req = db.transaction(STORE, 'readwrite').objectStore(STORE).add(record);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    }));
}

function dbGetAll() {
    return openDB().then(db => new Promise((resolve, reject) => {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    }));
}

function dbDelete(id) {
    return openDB().then(db => new Promise((resolve, reject) => {
        const req = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    }));
}

// ===================== 初始化 =====================
function init() {
    initTheme();
    initParticles();
    loadMedia();
    startIdleTimer();
    setupEventListeners();
    initTutorialParticles();
}

// ===================== 背景粒子系统（主页动效） =====================
let particles = [];
let particleCanvas, particleCtx;
let animationId;

// 相对主题色的色相偏移，构成类似原配色的类比色板
const PARTICLE_HUE_OFFSETS = [0, -41, -98, 72, 30, 160];

function initParticles() {
    particleCanvas = document.getElementById('particleCanvas');
    particleCtx = particleCanvas.getContext('2d');
    resizeCanvas();
    createParticles();
    animateParticles();
    window.addEventListener('resize', () => {
        resizeCanvas();
        createParticles();
    });
}

function resizeCanvas() {
    particleCanvas.width = window.innerWidth;
    particleCanvas.height = window.innerHeight;
}

function createParticles() {
    particles = [];
    const count = Math.floor((particleCanvas.width * particleCanvas.height) / 8000);
    for (let i = 0; i < count; i++) {
        const hueOff = PARTICLE_HUE_OFFSETS[Math.floor(Math.random() * PARTICLE_HUE_OFFSETS.length)];
        particles.push({
            x: Math.random() * particleCanvas.width,
            y: Math.random() * particleCanvas.height,
            vx: (Math.random() - 0.5) * 0.5,
            vy: (Math.random() - 0.5) * 0.5,
            size: Math.random() * 2 + 0.5,
            hueOff: hueOff,
            h: (themeHue + hueOff + 360) % 360,
            alpha: Math.random() * 0.5 + 0.2,
            phase: Math.random() * Math.PI * 2,
            speed: Math.random() * 0.01 + 0.005
        });
    }
}

function animateParticles() {
    particleCtx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
    const time = Date.now() * 0.001;
    // 白底下用更深更饱和的颜色，黑底下用浅亮色
    const L = isLightMode ? 46 : 72;
    const S = isLightMode ? 70 : 82;

    // 绘制连接线
    for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
            const dx = particles[i].x - particles[j].x;
            const dy = particles[i].y - particles[j].y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 150) {
                const alpha = (1 - dist / 150) * 0.15;
                particleCtx.beginPath();
                particleCtx.moveTo(particles[i].x, particles[i].y);
                particleCtx.lineTo(particles[j].x, particles[j].y);
                particleCtx.strokeStyle = `hsla(${particles[i].h}, ${S}%, ${L}%, ${alpha})`;
                particleCtx.lineWidth = 0.5;
                particleCtx.stroke();
            }
        }
    }

    // 更新和绘制粒子
    for (let p of particles) {
        p.phase += p.speed;
        p.x += p.vx + Math.sin(p.phase) * 0.3;
        p.y += p.vy + Math.cos(p.phase * 0.7) * 0.2;

        if (p.x < 0) p.x = particleCanvas.width;
        if (p.x > particleCanvas.width) p.x = 0;
        if (p.y < 0) p.y = particleCanvas.height;
        if (p.y > particleCanvas.height) p.y = 0;

        const glowSize = p.size * 4;
        const gradient = particleCtx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowSize);
        gradient.addColorStop(0, `hsla(${p.h}, ${S}%, ${L}%, ${p.alpha})`);
        gradient.addColorStop(0.5, `hsla(${p.h}, ${S}%, ${L}%, ${p.alpha * 0.3})`);
        gradient.addColorStop(1, `hsla(${p.h}, ${S}%, ${L}%, 0)`);

        particleCtx.beginPath();
        particleCtx.arc(p.x, p.y, glowSize, 0, Math.PI * 2);
        particleCtx.fillStyle = gradient;
        particleCtx.fill();

        particleCtx.beginPath();
        particleCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        particleCtx.fillStyle = `hsla(${p.h}, ${S}%, ${L + 3}%, ${Math.min(p.alpha + 0.3, 1)})`;
        particleCtx.fill();
    }

    drawFlowWaves(time);
    animationId = requestAnimationFrame(animateParticles);
}

function drawFlowWaves(time) {
    const waveHues = [0, -41, -98];
    const waveAlphas = isLightMode ? [0.12, 0.09, 0.07] : [0.08, 0.06, 0.05];
    const L = isLightMode ? 42 : 68;
    for (let w = 0; w < 3; w++) {
        particleCtx.beginPath();
        const h = (themeHue + waveHues[w] + 360) % 360;

        for (let x = 0; x < particleCanvas.width; x += 5) {
            const y = particleCanvas.height * 0.5 +
                     Math.sin(x * 0.003 + time * 0.5 + w * 2) * 100 +
                     Math.sin(x * 0.007 + time * 0.3 + w) * 50;
            if (x === 0) particleCtx.moveTo(x, y);
            else particleCtx.lineTo(x, y);
        }

        particleCtx.strokeStyle = `hsla(${h}, 80%, ${L}%, ${waveAlphas[w]})`;
        particleCtx.lineWidth = 2;
        particleCtx.stroke();
    }
}

// ===================== 屏保高密度粒子（流场丝带，~10000粒子） =====================
let tutCanvas, tutCtx, tutRAF = null;
let tutGroups = []; // 按颜色分组，减少 fillStyle 切换
const TUT_BANDS = 3;         // 丝带条数
const TUT_BINS_PER_BAND = 4; // 每条丝带按车道远近分档（内亮外暗）
let TUT_TOTAL = 10000;

function initTutorialParticles() {
    tutCanvas = document.getElementById('tutorialCanvas');
    tutCtx = tutCanvas.getContext('2d');
    window.addEventListener('resize', () => {
        if (tutRAF) sizeTutorialCanvas();
    });
}

function sizeTutorialCanvas() {
    tutCanvas.width = window.innerWidth;
    tutCanvas.height = window.innerHeight;
}

function rebuildTutorialPalette() {
    for (const g of tutGroups) {
        const c = g.bin;
        // 黑底：越靠芯部越亮（叠加发光）；白底：越靠芯部越深（墨色沉淀）
        const sat = isLightMode ? 68 + c * 7 : 82 + c * 5;
        const light = isLightMode ? 62 - c * 9 : 46 + c * 8;
        const alpha = isLightMode ? 0.22 + c * 0.16 : 0.18 + c * 0.16;
        g.style = `hsla(${(themeHue + g.hueOff + 360) % 360}, ${sat}%, ${light}%, ${alpha})`;
    }
}

function buildTutorialParticles() {
    sizeTutorialCanvas();
    tutGroups = [];
    // 低配设备适当降数量
    TUT_TOTAL = (window.innerWidth * window.innerHeight > 1.6e6) ? 10000 : 7500;
    const perGroup = Math.floor(TUT_TOTAL / (TUT_BANDS * TUT_BINS_PER_BAND));
    const W = tutCanvas.width, H = tutCanvas.height;

    // 每条丝带由 22 条平行"车道"细线组成；bin 越靠内车道越居中、越亮，
    // 形成中心致密发光、边缘稀疏的粒子流截面（参考图的丝带质感）
    const LANE_RANGES = [
        [0.55, 1.0],   // bin 0: 最外圈，最暗
        [0.3, 0.55],
        [0.12, 0.3],
        [0.0, 0.12]    // bin 3: 芯部，最亮
    ];
    const LANES_HALF = 11;

    for (let b = 0; b < TUT_BANDS; b++) {
        for (let c = 0; c < TUT_BINS_PER_BAND; c++) {
            // 色相沿丝带截面渐变：芯部偏主题色，外缘偏移
            const hueOff = b * 26 + (3 - c) * 16 - 30;
            const [lo, hi] = LANE_RANGES[c];
            const g = {
                band: b,
                bin: c,
                hueOff: hueOff,
                style: '',
                // stride 4: x, y, lane(-1..1, 量化到车道), speed
                data: new Float32Array(perGroup * 4)
            };
            for (let i = 0; i < perGroup; i++) {
                // 在该 bin 的车道范围内量化取车道，正负对称
                const mag = lo + Math.random() * (hi - lo);
                const lane = Math.round(mag * LANES_HALF) / LANES_HALF;
                const sign = Math.random() < 0.5 ? -1 : 1;
                g.data[i * 4] = Math.random() * W;
                g.data[i * 4 + 1] = Math.random() * H;
                g.data[i * 4 + 2] = lane * sign;
                g.data[i * 4 + 3] = 1.0 + Math.random() * 1.8;
            }
            tutGroups.push(g);
        }
    }
    rebuildTutorialPalette();
}

function drawTutorialFrame() {
    const W = tutCanvas.width, H = tutCanvas.height;
    const t = performance.now() * 0.001;

    // 拖尾：用背景色半透明覆盖
    tutCtx.globalCompositeOperation = 'source-over';
    tutCtx.fillStyle = isLightMode ? 'rgba(242, 242, 247, 0.2)' : 'rgba(0, 0, 4, 0.2)';
    tutCtx.fillRect(0, 0, W, H);

    // 黑底用叠加发光；白底叠加会变白，改用普通绘制
    tutCtx.globalCompositeOperation = isLightMode ? 'source-over' : 'lighter';

    for (const g of tutGroups) {
        const b = g.band;
        const baseY = H * (0.24 + b * 0.26);
        const amp1 = H * 0.09;
        const amp2 = H * 0.045;
        const bandPhase = b * 2.1;
        const d = g.data;
        const n = d.length / 4;

        tutCtx.fillStyle = g.style;
        for (let i = 0; i < n; i++) {
            const o = i * 4;
            let x = d[o] + d[o + 3];           // 沿 x 匀速漂移
            if (x > W + 4) x -= W + 8;
            const lane = d[o + 2];

            // 车道间距随 x 与时间张合（收窄处线条聚拢变亮，张开处扇形散开=编织感）
            const spread = H * 0.075 * (0.25 + 0.75 * (0.5 + 0.5 * Math.sin(x * 0.0021 + t * 0.45 + bandPhase * 1.3)));

            // 目标曲线：两层正弦波浪 + 车道偏移
            const targetY = baseY
                + Math.sin(x * 0.0035 + t * 0.5 + bandPhase) * amp1
                + Math.sin(x * 0.0013 - t * 0.28 + bandPhase * 0.6) * amp2
                + lane * spread;

            // 快速吸附到自己的车道曲线上，保持线条清晰
            let y = d[o + 1] + (targetY - d[o + 1]) * 0.18;

            d[o] = x;
            d[o + 1] = y;
            tutCtx.fillRect(x, y, 1.5, 1.5);
        }
    }
    tutCtx.globalCompositeOperation = 'source-over';

    tutRAF = requestAnimationFrame(drawTutorialFrame);
}

function startTutorialParticles() {
    buildTutorialParticles();
    tutCtx.fillStyle = isLightMode ? '#f2f2f7' : '#000004';
    tutCtx.fillRect(0, 0, tutCanvas.width, tutCanvas.height);
    if (tutRAF) cancelAnimationFrame(tutRAF);
    tutRAF = requestAnimationFrame(drawTutorialFrame);
}

function stopTutorialParticles() {
    if (tutRAF) cancelAnimationFrame(tutRAF);
    tutRAF = null;
    tutGroups = [];
}

// ===================== 媒体加载与存储 =====================
function loadMedia() {
    const hidden = getHiddenSamples();
    mediaList = SAMPLE_MEDIA.filter(s => !hidden.includes(s.id));
    dbGetAll().then(records => {
        records.sort((a, b) => a.createdAt - b.createdAt);
        for (const r of records) {
            mediaList.push({
                type: r.type,
                url: URL.createObjectURL(r.blob),
                name: r.name,
                dbId: r.id,
                source: 'upload'
            });
        }
        updateInfoBar();
        if (isBrowseMode) updatePhotoDisplay();
    }).catch(e => {
        console.warn('无法读取已保存的上传内容', e);
        updateInfoBar();
    });
}

// ===================== 上传功能 =====================
function setupUpload() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');

    uploadArea.addEventListener('click', () => fileInput.click());

    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
    });

    fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
        fileInput.value = '';
    });
}

function handleFiles(files) {
    const grid = document.getElementById('mediaPreviewGrid');

    Array.from(files).forEach(file => {
        if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) return;

        const record = {
            blob: file,
            type: file.type.startsWith('video/') ? 'video' : 'image',
            name: file.name,
            createdAt: Date.now()
        };
        dbAdd(record).then(id => {
            const media = {
                type: record.type,
                url: URL.createObjectURL(file),
                name: file.name,
                dbId: id,
                source: 'upload'
            };
            mediaList.push(media);
            addPreviewItem(media, grid);
            updateInfoBar();
            if (isBrowseMode) updatePhotoDisplay();
        }).catch(e => {
            console.warn('保存失败', e);
        });
    });
}

function addPreviewItem(media, container) {
    const item = document.createElement('div');
    item.className = 'media-preview-item';

    if (media.type === 'video') {
        item.innerHTML = `<video src="${media.url}" muted loop playsinline></video>`;
    } else {
        item.innerHTML = `<img src="${media.url}" alt="${media.name || ''}">`;
    }

    const removeBtn = document.createElement('div');
    removeBtn.className = 'remove-btn';
    removeBtn.innerHTML = '&times;';
    item.appendChild(removeBtn);

    const removeHandler = (e) => {
        if (e) e.stopPropagation();
        const idx = mediaList.indexOf(media);
        if (idx !== -1) {
            mediaList.splice(idx, 1);
            if (currentIndex >= mediaList.length) currentIndex = Math.max(0, mediaList.length - 1);
        }
        if (media.source === 'sample') {
            hideSample(media.id); // 记住删除，重启后不再出现
        } else {
            if (media.dbId != null) dbDelete(media.dbId).catch(() => {});
            URL.revokeObjectURL(media.url);
        }
        item.remove();
        updateInfoBar();
        if (isBrowseMode) updatePhotoDisplay();
    };

    removeBtn.addEventListener('click', removeHandler);

    // 悬停停留自动删除（同样带液体填充倒计时）
    const removeFill = document.createElement('span');
    removeFill.className = 'dwell-fill';
    removeBtn.appendChild(removeFill);

    let dwellTimer = null;
    removeBtn.addEventListener('mouseenter', () => {
        const dwellStart = Date.now();
        removeBtn.classList.add('dwell-active');
        dwellTimer = setInterval(() => {
            const progress = Math.min((Date.now() - dwellStart) / DWELL_TIME, 1);
            removeFill.style.width = (progress * 100) + '%';
            if (progress >= 1) {
                clearInterval(dwellTimer);
                dwellTimer = null;
                removeHandler();
            }
        }, 50);
    });
    removeBtn.addEventListener('mouseleave', () => {
        if (dwellTimer) { clearInterval(dwellTimer); dwellTimer = null; }
        removeFill.style.width = '0%';
        removeBtn.classList.remove('dwell-active');
    });

    container.appendChild(item);
}

// ===================== 界面切换 =====================
function showBrowseScreen() {
    isBrowseMode = true;
    document.getElementById('startScreen').style.display = 'none';
    document.getElementById('uploadModal').classList.remove('active');
    document.getElementById('browseScreen').classList.add('active');
    document.getElementById('tutorialScreen').classList.remove('active');
    currentIndex = 0;
    updatePhotoDisplay();
}

function showStartScreen() {
    isBrowseMode = false;
    document.getElementById('startScreen').style.display = 'flex';
    document.getElementById('browseScreen').classList.remove('active');
    document.getElementById('fullscreenViewer').classList.remove('active');
}

function showUploadModal() {
    document.getElementById('uploadModal').classList.add('active');
    const grid = document.getElementById('mediaPreviewGrid');
    grid.innerHTML = '';
    mediaList.forEach((media) => addPreviewItem(media, grid));
}

function hideUploadModal() {
    document.getElementById('uploadModal').classList.remove('active');
}

function showTutorial() {
    clearTimeout(idleTimer); // 屏保期间暂停空闲计时
    document.getElementById('tutorialScreen').classList.add('active');
    document.getElementById('idleBar').style.width = '0%';
    startTutorialParticles();
}

function hideTutorial() {
    document.getElementById('tutorialScreen').classList.remove('active');
    stopTutorialParticles();
    resetIdleTimer();
}

// ===================== 照片浏览 =====================
function updatePhotoDisplay() {
    const len = mediaList.length;

    if (len === 0) {
        slotIds.forEach(id => {
            const slot = document.getElementById(id);
            slot.className = 'photo-slot pos-hidden';
            slot.innerHTML = '<div class="empty-hint">暂无照片</div>';
        });
        return;
    }

    const indices = [
        (currentIndex - 2 + len) % len,
        (currentIndex - 1 + len) % len,
        currentIndex,
        (currentIndex + 1) % len,
        (currentIndex + 2) % len
    ];

    for (let i = 0; i < 5; i++) {
        const slot = document.getElementById(slotIds[i]);
        const media = mediaList[indices[i]];

        let targetClass = slotClasses[i];
        if (len <= 2 && (i === 0 || i === 4)) {
            targetClass = 'pos-hidden';
        }
        if (len === 1 && (i === 0 || i === 1 || i === 3 || i === 4)) {
            targetClass = 'pos-hidden';
        }

        slot.className = 'photo-slot ' + targetClass;

        const expectedHtml = media.type === 'video'
            ? `<video src="${media.url}" autoplay muted loop playsinline></video>`
            : `<img src="${media.url}" alt="photo">`;

        if (slot.innerHTML !== expectedHtml) {
            slot.innerHTML = expectedHtml;
        }

        if (i === 2) {
            slot.style.cursor = 'pointer';
            slot.onclick = () => showFullscreen(media);
        } else {
            slot.style.cursor = 'default';
            slot.onclick = null;
        }
    }

    updateInfoBar();
}

function showFullscreen(media) {
    const viewer = document.getElementById('fullscreenViewer');
    const content = document.getElementById('fsContent');
    content.innerHTML = '';

    if (media.type === 'video') {
        const video = document.createElement('video');
        video.src = media.url;
        video.autoplay = true;
        video.controls = true;
        video.style.maxWidth = '90vw';
        video.style.maxHeight = '90vh';
        content.appendChild(video);
    } else {
        const img = document.createElement('img');
        img.src = media.url;
        content.appendChild(img);
    }

    viewer.classList.add('active');
}

function hideFullscreen() {
    document.getElementById('fullscreenViewer').classList.remove('active');
    document.getElementById('fsContent').innerHTML = '';
}

function previousPhoto() {
    if (mediaList.length <= 1) return;
    currentIndex = (currentIndex - 1 + mediaList.length) % mediaList.length;
    updatePhotoDisplay();
    resetIdleTimer();
}

function nextPhoto() {
    if (mediaList.length <= 1) return;
    currentIndex = (currentIndex + 1) % mediaList.length;
    updatePhotoDisplay();
    resetIdleTimer();
}

function updateInfoBar() {
    const bar = document.getElementById('infoBar');
    if (!bar) return;

    const prevBtn = bar.querySelector('#toolbarPrevBtn');
    const nextBtn = bar.querySelector('#toolbarNextBtn');

    const dynamicEls = bar.querySelectorAll('.dot, .counter');
    dynamicEls.forEach(el => el.remove());

    // 点指示器（数量太多时只显示计数器）
    if (mediaList.length > 0 && mediaList.length <= 15) {
        const dotsContainer = document.createDocumentFragment();
        for (let i = 0; i < mediaList.length; i++) {
            const dot = document.createElement('div');
            dot.className = 'dot' + (i === currentIndex ? ' active' : '');
            dotsContainer.appendChild(dot);
        }
        if (prevBtn && prevBtn.nextSibling) {
            bar.insertBefore(dotsContainer, prevBtn.nextSibling);
        }
    }

    if (mediaList.length > 0) {
        const counter = document.createElement('span');
        counter.className = 'counter';
        counter.textContent = `${currentIndex + 1} / ${mediaList.length}`;
        if (nextBtn) {
            bar.insertBefore(counter, nextBtn);
        }
    }
}

// ===================== 悬停停留交互 =====================
// 首次停留 DWELL_TIME 触发；触发后如果继续停留，每 DWELL_REPEAT_TIME 连续触发（连续翻页）
function startDwell(side, callback, duration = DWELL_TIME) {
    if (dwellTimers[side]) return;

    const startTime = Date.now();
    const indicator = document.getElementById(side === 'left' ? 'navLeft' : 'navRight');
    const progressCircle = document.getElementById(side === 'left' ? 'progressLeft' : 'progressRight');

    if (indicator) indicator.style.transform = 'translateY(-50%) scale(1.2)';

    dwellTimers[side] = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        const offset = PROGRESS_CIRCUMFERENCE * (1 - progress);
        if (progressCircle) progressCircle.style.strokeDashoffset = offset;

        if (progress >= 1) {
            callback();
            stopDwell(side);
            // 鼠标还在区域内 → 用更短的间隔继续翻，直到 mouseleave 调用 stopDwell
            startDwell(side, callback, DWELL_REPEAT_TIME);
        }
    }, 50);
}

function stopDwell(side) {
    if (dwellTimers[side]) {
        clearInterval(dwellTimers[side]);
        delete dwellTimers[side];
    }

    const indicator = document.getElementById(side === 'left' ? 'navLeft' : 'navRight');
    const progressCircle = document.getElementById(side === 'left' ? 'progressLeft' : 'progressRight');

    if (indicator) indicator.style.transform = 'translateY(-50%) scale(1)';
    if (progressCircle) progressCircle.style.strokeDashoffset = PROGRESS_CIRCUMFERENCE;
}

// ===================== 空闲计时器 =====================
function startIdleTimer() {
    idleProgress = 0;
    const bar = document.getElementById('idleBar');

    function tick() {
        idleProgress += IDLE_CHECK_INTERVAL;
        const pct = (idleProgress / IDLE_TIMEOUT) * 100;
        bar.style.width = pct + '%';

        if (idleProgress >= IDLE_TIMEOUT) {
            showTutorial();
        } else {
            idleTimer = setTimeout(tick, IDLE_CHECK_INTERVAL);
        }
    }

    idleTimer = setTimeout(tick, IDLE_CHECK_INTERVAL);
}

function resetIdleTimer() {
    clearTimeout(idleTimer);
    idleProgress = 0;
    document.getElementById('idleBar').style.width = '0%';
    startIdleTimer();
}

// ===================== 事件监听 =====================
function setupEventListeners() {
    setupDwellButton('exploreBtn', showBrowseScreen);
    setupDwellButton('uploadBtn', showUploadModal);
    setupDwellButton('homeBtn', showStartScreen);
    setupDwellButton('closeUpload', hideUploadModal);
    setupDwellButton('closeFs', hideFullscreen);
    setupDwellButton('toolbarPrevBtn', previousPhoto, { repeat: true });
    setupDwellButton('toolbarNextBtn', nextPhoto, { repeat: true });
    setupDwellButton('modeToggle', () => applyThemeMode(!isLightMode));

    setupUpload();

    const hoverLeft = document.getElementById('hoverLeft');
    const hoverRight = document.getElementById('hoverRight');

    hoverLeft.addEventListener('mouseenter', () => {
        if (isBrowseMode) startDwell('left', previousPhoto);
    });
    hoverLeft.addEventListener('mouseleave', () => stopDwell('left'));

    hoverRight.addEventListener('mouseenter', () => {
        if (isBrowseMode) startDwell('right', nextPhoto);
    });
    hoverRight.addEventListener('mouseleave', () => stopDwell('right'));

    document.addEventListener('keydown', (e) => {
        resetIdleTimer();
        if (!isBrowseMode) return;
        if (e.key === 'ArrowLeft') previousPhoto();
        if (e.key === 'ArrowRight') nextPhoto();
        if (e.key === 'Escape') {
            if (document.getElementById('fullscreenViewer').classList.contains('active')) {
                hideFullscreen();
            } else {
                showStartScreen();
            }
        }
    });

    let touchStartX = 0;
    document.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX;
    }, { passive: true });
    document.addEventListener('touchend', (e) => {
        const diff = e.changedTouches[0].clientX - touchStartX;
        if (Math.abs(diff) > 50) {
            if (diff > 0) previousPhoto();
            else nextPhoto();
        }
    }, { passive: true });

    document.addEventListener('mousemove', () => {
        resetIdleTimer();
        if (document.getElementById('tutorialScreen').classList.contains('active')) {
            hideTutorial();
        }
    });

    document.addEventListener('click', resetIdleTimer);

    document.getElementById('tutorialScreen').addEventListener('mousemove', hideTutorial);
    document.getElementById('tutorialScreen').addEventListener('click', hideTutorial);

    window.addEventListener('resize', () => {
        if (isBrowseMode) updatePhotoDisplay();
    });
}

function setupDwellButton(id, callback, opts = {}) {
    const btn = document.getElementById(id);
    if (!btn) return;

    // 倒计时可视化：按钮内的液体填充层，涨满即触发
    const fill = document.createElement('span');
    fill.className = 'dwell-fill';
    btn.appendChild(fill);

    let timer = null;

    function resetFill() {
        fill.style.width = '0%';
    }

    function run(duration) {
        const startTime = Date.now();
        timer = setInterval(() => {
            const progress = Math.min((Date.now() - startTime) / duration, 1);
            fill.style.width = (progress * 100) + '%';
            if (progress >= 1) {
                clearInterval(timer);
                timer = null;
                resetFill();
                callback();
                if (opts.repeat) run(DWELL_REPEAT_TIME); // 保持悬停 → 连续触发
            }
        }, 50);
    }

    btn.addEventListener('mouseenter', () => run(DWELL_TIME));

    btn.addEventListener('mouseleave', () => {
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
        resetFill();
    });

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
        resetFill();
        callback();
    });
}

// 启动
init();
