(() => {
    'use strict';

    // Tamaño interno de la vista previa (se muestra más chico, así se ve nítido en pantallas retina)
    const PREVIEW_SIZE = 640;
    // Margen alrededor del QR (zona de silencio), como proporción del tamaño total
    const MARGIN_RATIO = 0.06;
    // Contraste mínimo entre puntos y fondo antes de mostrar el aviso
    const MIN_CONTRAST = 4;
    // A partir de este tamaño de logo se recomienda probar el QR antes de imprimir
    const LOGO_SIZE_WARNING = 0.35;
    const PLACEHOLDER_DATA = 'https://mauroads.com';
    const THEME_KEY = 'qr-theme';

    // Cada estilo de esquina combina el cuadrado exterior y el punto interior
    const CORNER_STYLES = {
        square: { outer: 'square', inner: 'square' },
        rounded: { outer: 'extra-rounded', inner: 'dot' },
        dot: { outer: 'dot', inner: 'dot' }
    };

    const COLOR_LABELS = {
        dotsColor: 'Color de los puntos',
        cornerColor: 'Color de las esquinas',
        bgColor: 'Color de fondo'
    };

    const state = {
        url: '',
        dotsType: 'square',
        dotsColor: '#000000',
        cornerType: 'square',
        cornerColor: '#000000',
        bgColor: '#ffffff',
        logo: null,
        logoImage: null,
        logoSize: 0.35,
        exportSize: 1200
    };

    const $ = (id) => document.getElementById(id);
    const els = {
        themeToggle: $('themeToggle'),
        themeMeta: document.querySelector('meta[name="theme-color"]'),
        url: $('url'),
        clearUrl: $('clearUrl'),
        qr: $('qr'),
        warning: $('contrastWarning'),
        swatches: document.querySelectorAll('.swatch[data-color]'),
        logoInput: $('logoInput'),
        removeLogo: $('removeLogo'),
        logoSize: $('logoSize'),
        logoSizeValue: $('logoSizeValue'),
        logoSizeWarning: $('logoSizeWarning'),
        logoThumb: $('logoThumb'),
        logoName: $('logoName'),
        sizeValue: $('sizeValue'),
        downloadButtons: document.querySelectorAll('[data-format]')
    };
    const emptyThumb = els.logoThumb.innerHTML;

    const clamp = (n, min = 0, max = 1) => Math.min(max, Math.max(min, n));

    /* ---------- Modo claro / oscuro ---------- */

    const lightQuery = window.matchMedia('(prefers-color-scheme: light)');

    function savedTheme() {
        try {
            const theme = localStorage.getItem(THEME_KEY);
            return theme === 'light' || theme === 'dark' ? theme : null;
        } catch {
            return null;
        }
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        els.themeMeta.content = theme === 'light' ? '#f3f4f8' : '#07070d';
        els.themeToggle.setAttribute('aria-label', theme === 'light' ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro');
    }

    els.themeToggle.addEventListener('click', () => {
        const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
        applyTheme(next);
        try { localStorage.setItem(THEME_KEY, next); } catch { /* sin almacenamiento: vale solo para esta visita */ }
    });

    // Mientras no se elija a mano, sigue lo que diga la computadora o el celular
    lightQuery.addEventListener('change', (e) => {
        if (!savedTheme()) applyTheme(e.matches ? 'light' : 'dark');
    });

    applyTheme(savedTheme() || (lightQuery.matches ? 'light' : 'dark'));

    /* ---------- Datos del QR ---------- */

    // Si la dirección no trae protocolo, se agrega https:// para que los celulares la abran como link
    function normalizeUrl(raw) {
        const value = raw.trim();
        if (!value) return '';
        if (/^([a-z][a-z0-9+.-]*:\/\/|mailto:|tel:|sms:)/i.test(value)) return value;
        return 'https://' + value;
    }

    function buildOptions(size, type) {
        const corner = CORNER_STYLES[state.cornerType];
        const options = {
            type,
            width: size,
            height: size,
            margin: Math.round(size * MARGIN_RATIO),
            data: normalizeUrl(state.url) || PLACEHOLDER_DATA,
            // Con logo se tapa parte del código: el nivel H permite recuperar hasta ~30%
            qrOptions: { errorCorrectionLevel: state.logo ? 'H' : 'M' },
            dotsOptions: { type: state.dotsType, color: state.dotsColor },
            cornersSquareOptions: { type: corner.outer, color: state.cornerColor },
            cornersDotOptions: { type: corner.inner, color: state.cornerColor },
            backgroundOptions: { color: state.bgColor }
        };
        if (state.logo) {
            options.image = state.logo;
            options.imageOptions = {
                imageSize: state.logoSize,
                margin: Math.round(size * 0.012),
                hideBackgroundDots: true,
                // Incrusta el logo dentro del archivo (clave para el SVG)
                saveAsBlob: true
            };
        }
        return options;
    }

    /* ---------- Vista previa ---------- */

    let renderTimer = 0;

    function render() {
        clearTimeout(renderTimer);
        const qr = new QRCodeStyling(buildOptions(PREVIEW_SIZE, 'canvas'));
        els.qr.replaceChildren();
        qr.append(els.qr);

        const empty = !state.url.trim();
        els.qr.classList.toggle('is-empty', empty);
        els.downloadButtons.forEach((btn) => { btn.disabled = empty; });
        els.clearUrl.hidden = empty;
        checkContrast();
    }

    function scheduleRender() {
        clearTimeout(renderTimer);
        renderTimer = setTimeout(render, 60);
    }

    /* ---------- Colores ---------- */

    function hexToRgb(hex) {
        const n = parseInt(hex.slice(1), 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }

    function rgbToHex(r, g, b) {
        return '#' + [r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('');
    }

    function rgbToHsv(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b);
        const d = max - Math.min(r, g, b);
        let h = 0;
        if (d) {
            if (max === r) h = ((g - b) / d) % 6;
            else if (max === g) h = (b - r) / d + 2;
            else h = (r - g) / d + 4;
            h *= 60;
            if (h < 0) h += 360;
        }
        return { h, s: max ? d / max : 0, v: max };
    }

    function hsvToRgb(h, s, v) {
        const f = (n) => {
            const k = (n + h / 60) % 6;
            return (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255;
        };
        return [f(5), f(3), f(1)];
    }

    // Acepta "#0A4BFF", "0a4bff" y, si allowShort, "#0AF"
    function parseHex(text, allowShort) {
        let v = String(text).trim().replace(/^#/, '');
        if (allowShort && /^[0-9a-f]{3}$/i.test(v)) v = v.replace(/./g, (c) => c + c);
        return /^[0-9a-f]{6}$/i.test(v) ? '#' + v.toLowerCase() : null;
    }

    // El gotero de pantalla devuelve "#rrggbb" (o "rgb(r, g, b)" en algunas versiones)
    function parseCssColor(text) {
        const hex = parseHex(text, true);
        if (hex) return hex;
        const m = String(text).match(/(\d+)\D+(\d+)\D+(\d+)/);
        return m ? rgbToHex(+m[1], +m[2], +m[3]) : null;
    }

    function luminance(hex) {
        const channel = (c) => {
            const v = c / 255;
            return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        };
        const [r, g, b] = hexToRgb(hex);
        return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    }

    function checkContrast() {
        const bg = luminance(state.bgColor);
        const risky = [state.dotsColor, state.cornerColor].some((color) => {
            const fg = luminance(color);
            // Puntos más claros que el fondo (QR invertido) o contraste bajo
            return fg > bg || (bg + 0.05) / (fg + 0.05) < MIN_CONTRAST;
        });
        els.warning.hidden = !risky;
    }

    function paintSwatch(key) {
        const swatch = document.querySelector(`.swatch[data-color="${key}"]`);
        swatch.querySelector('.swatch-fill').style.background = state[key];
        swatch.setAttribute('aria-label', `${COLOR_LABELS[key]}: ${state[key].toUpperCase()}`);
    }

    /* ---------- Selector de color propio ---------- */

    const picker = {
        root: $('picker'),
        title: $('pickerTitle'),
        close: $('pickerClose'),
        sv: $('pickerSv'),
        svThumb: document.querySelector('.picker-sv-thumb'),
        hue: $('pickerHue'),
        hueThumb: document.querySelector('.picker-hue-thumb'),
        preview: $('pickerPreview'),
        hex: $('pickerHex'),
        presets: document.querySelectorAll('[data-preset]'),
        fromLogo: $('pickFromLogo'),
        fromScreen: $('pickFromScreen'),
        logoCanvas: $('pickerLogoCanvas'),
        logoBack: $('pickerLogoBack'),
        // Qué color se está editando y su posición en el selector
        key: null,
        anchor: null,
        h: 0,
        s: 0,
        v: 0,
        screenPickerOpen: false
    };

    function isPickerOpen() {
        return !picker.root.hidden;
    }

    function currentPickerHex() {
        return rgbToHex(...hsvToRgb(picker.h, picker.s, picker.v));
    }

    // Pinta el selector según el color actual. skipHexField evita pisar lo que se está escribiendo
    function paintPicker(skipHexField) {
        const hex = state[picker.key];
        picker.root.style.setProperty('--hue', picker.h.toFixed(1));
        picker.svThumb.style.left = picker.s * 100 + '%';
        picker.svThumb.style.top = (1 - picker.v) * 100 + '%';
        picker.svThumb.style.background = hex;
        picker.hueThumb.style.left = (picker.h / 360) * 100 + '%';
        picker.preview.style.background = hex;
        if (!skipHexField) {
            picker.hex.value = hex.toUpperCase();
            picker.hex.classList.remove('is-invalid');
        }
        picker.presets.forEach((btn) => btn.classList.toggle('is-active', btn.dataset.preset === hex));
        picker.sv.setAttribute('aria-valuetext',
            `Saturación ${Math.round(picker.s * 100)}%, brillo ${Math.round(picker.v * 100)}%`);
        picker.hue.setAttribute('aria-valuenow', Math.round(picker.h));
    }

    // Aplica un color al elemento que se está editando (puntos, esquinas o fondo)
    function setColor(hex, { fromHsv = false, skipHexField = false } = {}) {
        if (!fromHsv) {
            const hsv = rgbToHsv(...hexToRgb(hex));
            // En grises, negro y blanco el tono no cambia: se conserva para no saltar en la barra
            if (hsv.s > 0 && hsv.v > 0) picker.h = hsv.h;
            picker.s = hsv.s;
            picker.v = hsv.v;
        }
        state[picker.key] = hex;
        paintSwatch(picker.key);
        paintPicker(skipHexField);
        scheduleRender();
    }

    function setFromHsv() {
        setColor(currentPickerHex(), { fromHsv: true });
    }

    function updateLogoTool() {
        const hasLogo = Boolean(state.logo);
        picker.fromLogo.disabled = !hasLogo;
        picker.fromLogo.querySelector('span').textContent = hasLogo ? 'Tomar del logo' : 'Subí un logo primero';
        if (!hasLogo) exitLogoMode();
    }

    function positionPicker() {
        if (!picker.anchor) return;
        const r = picker.anchor.getBoundingClientRect();
        const pw = picker.root.offsetWidth;
        const ph = picker.root.offsetHeight;
        const vw = document.documentElement.clientWidth;
        const vh = window.innerHeight;
        const gap = 12;
        const pad = 12;
        let left;
        let top;
        if (r.left - gap - pw >= pad) {
            // Hay lugar a la izquierda del círculo: se abre al costado
            left = r.left - gap - pw;
            top = clamp(r.top + r.height / 2 - 30, pad, Math.max(pad, vh - ph - pad));
        } else {
            // Pantallas angostas: se abre debajo (o arriba si abajo no entra)
            left = clamp(r.right - pw, pad, Math.max(pad, vw - pw - pad));
            top = r.bottom + gap;
            if (top + ph > vh - pad && r.top - gap - ph >= pad) top = r.top - gap - ph;
        }
        picker.root.style.left = left + window.scrollX + 'px';
        picker.root.style.top = top + window.scrollY + 'px';
    }

    function openPicker(anchor) {
        if (picker.anchor === anchor && isPickerOpen()) {
            closePicker(true);
            return;
        }
        if (isPickerOpen()) closePicker(false);

        picker.anchor = anchor;
        picker.key = anchor.dataset.color;
        picker.title.textContent = anchor.dataset.label;
        const hsv = rgbToHsv(...hexToRgb(state[picker.key]));
        picker.h = hsv.s > 0 && hsv.v > 0 ? hsv.h : 225;
        picker.s = hsv.s;
        picker.v = hsv.v;
        paintPicker();
        updateLogoTool();

        picker.root.hidden = false;
        anchor.setAttribute('aria-expanded', 'true');
        positionPicker();
        picker.sv.focus({ preventScroll: true });
    }

    function closePicker(restoreFocus) {
        if (!isPickerOpen()) return;
        exitLogoMode();
        picker.root.hidden = true;
        if (picker.anchor) {
            picker.anchor.setAttribute('aria-expanded', 'false');
            if (restoreFocus) picker.anchor.focus({ preventScroll: true });
        }
        picker.anchor = null;
    }

    // Arrastre con mouse, dedo o lápiz sobre el cuadrado y la barra de tonos
    function onDrag(el, handler) {
        el.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            el.focus({ preventScroll: true });
            el.setPointerCapture(e.pointerId);
            handler(e);
            const move = (ev) => handler(ev);
            const end = () => {
                el.removeEventListener('pointermove', move);
                el.removeEventListener('pointerup', end);
                el.removeEventListener('pointercancel', end);
            };
            el.addEventListener('pointermove', move);
            el.addEventListener('pointerup', end);
            el.addEventListener('pointercancel', end);
        });
    }

    onDrag(picker.sv, (e) => {
        const r = picker.sv.getBoundingClientRect();
        picker.s = clamp((e.clientX - r.left) / r.width);
        picker.v = 1 - clamp((e.clientY - r.top) / r.height);
        setFromHsv();
    });

    onDrag(picker.hue, (e) => {
        const r = picker.hue.getBoundingClientRect();
        picker.h = clamp((e.clientX - r.left) / r.width) * 360;
        setFromHsv();
    });

    picker.sv.addEventListener('keydown', (e) => {
        const step = e.shiftKey ? 0.1 : 0.01;
        const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
        if (!moves[e.key]) return;
        e.preventDefault();
        picker.s = clamp(picker.s + moves[e.key][0]);
        picker.v = clamp(picker.v + moves[e.key][1]);
        setFromHsv();
    });

    picker.hue.addEventListener('keydown', (e) => {
        const step = e.shiftKey ? 10 : 1;
        const moves = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step };
        if (e.key === 'Home') picker.h = 0;
        else if (e.key === 'End') picker.h = 360;
        else if (moves[e.key]) picker.h = clamp(picker.h + moves[e.key], 0, 360);
        else return;
        e.preventDefault();
        setFromHsv();
    });

    // Código del color: se aplica apenas tiene 6 dígitos; los cortos (#0AF) al confirmar
    picker.hex.addEventListener('input', () => {
        const hex = parseHex(picker.hex.value, false);
        if (hex) setColor(hex, { skipHexField: true });
        picker.hex.classList.toggle('is-invalid', !hex && /[^#0-9a-f]/i.test(picker.hex.value));
    });

    function commitHexField() {
        const hex = parseHex(picker.hex.value, true);
        if (hex) setColor(hex);
        else paintPicker();
    }

    // Al entrar al campo se selecciona todo, así se pega un código nuevo sin borrar el anterior
    let hexJustFocused = false;
    picker.hex.addEventListener('focus', () => {
        picker.hex.select();
        hexJustFocused = true;
    });
    picker.hex.addEventListener('mouseup', (e) => {
        if (hexJustFocused) e.preventDefault();
        hexJustFocused = false;
    });

    picker.hex.addEventListener('change', commitHexField);
    picker.hex.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            commitHexField();
        }
    });

    picker.presets.forEach((btn) => {
        btn.style.background = btn.dataset.preset;
        btn.addEventListener('click', () => setColor(btn.dataset.preset));
    });

    picker.close.addEventListener('click', () => closePicker(true));

    els.swatches.forEach((swatch) => {
        swatch.addEventListener('click', () => openPicker(swatch));
    });

    // Se cierra al hacer clic afuera...
    document.addEventListener('pointerdown', (e) => {
        if (!isPickerOpen() || picker.screenPickerOpen) return;
        if (picker.root.contains(e.target) || picker.anchor.contains(e.target)) return;
        closePicker(false);
    }, true);

    // ...o con Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isPickerOpen()) {
            e.preventDefault();
            closePicker(true);
        }
    });

    window.addEventListener('resize', () => {
        if (isPickerOpen()) positionPicker();
    });

    /* ---------- Gotero sobre el logo ---------- */

    let logoPixels = null;

    function enterLogoMode() {
        if (!state.logoImage) return;
        picker.root.classList.add('is-logo-mode');

        // Dibuja el logo en grande, centrado y sin deformar
        const canvas = picker.logoCanvas;
        const cssSize = canvas.clientWidth;
        const ratio = window.devicePixelRatio || 1;
        canvas.width = canvas.height = Math.round(cssSize * ratio);
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const img = state.logoImage;
        const iw = img.naturalWidth || canvas.width;
        const ih = img.naturalHeight || canvas.height;
        const box = canvas.width * 0.88;
        const scale = Math.min(box / iw, box / ih);
        const w = iw * scale;
        const h = ih * scale;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
        try {
            logoPixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
        } catch (err) {
            console.error(err);
            logoPixels = null;
        }
        positionPicker();
        picker.logoBack.focus({ preventScroll: true });
    }

    function exitLogoMode() {
        if (!picker.root.classList.contains('is-logo-mode')) return;
        picker.root.classList.remove('is-logo-mode');
        logoPixels = null;
        if (picker.key) paintPicker();
        if (isPickerOpen()) positionPicker();
    }

    // Color del logo bajo el puntero; null si es una zona transparente
    function logoColorAt(e) {
        if (!logoPixels) return null;
        const r = picker.logoCanvas.getBoundingClientRect();
        const x = Math.floor(clamp((e.clientX - r.left) / r.width, 0, 0.9999) * logoPixels.width);
        const y = Math.floor(clamp((e.clientY - r.top) / r.height, 0, 0.9999) * logoPixels.height);
        const i = (y * logoPixels.width + x) * 4;
        const d = logoPixels.data;
        return d[i + 3] < 16 ? null : rgbToHex(d[i], d[i + 1], d[i + 2]);
    }

    picker.logoCanvas.addEventListener('pointermove', (e) => {
        picker.preview.style.background = logoColorAt(e) || state[picker.key];
    });

    picker.logoCanvas.addEventListener('pointerleave', () => {
        picker.preview.style.background = state[picker.key];
    });

    picker.logoCanvas.addEventListener('click', (e) => {
        const hex = logoColorAt(e);
        if (!hex) return;
        setColor(hex);
        exitLogoMode();
        picker.sv.focus({ preventScroll: true });
    });

    picker.fromLogo.addEventListener('click', enterLogoMode);
    picker.logoBack.addEventListener('click', () => {
        exitLogoMode();
        picker.fromLogo.focus({ preventScroll: true });
    });

    /* ---------- Gotero de pantalla (solo Chrome y Edge) ---------- */

    if ('EyeDropper' in window) {
        picker.fromScreen.hidden = false;
        picker.fromScreen.addEventListener('click', async () => {
            picker.screenPickerOpen = true;
            try {
                const result = await new window.EyeDropper().open();
                const hex = parseCssColor(result.sRGBHex);
                if (hex) setColor(hex);
            } catch {
                // Se canceló con Escape: no hay nada que hacer
            } finally {
                setTimeout(() => { picker.screenPickerOpen = false; }, 100);
            }
        });
    }

    /* ---------- Logo ---------- */

    function readAsDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
        });
    }

    // Los SVG sin ancho/alto explícitos no se dibujan bien en canvas: se completan desde el viewBox
    async function svgToDataUrl(file) {
        const text = await file.text();
        const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
        const svg = doc.documentElement;
        if (svg.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) {
            return readAsDataUrl(file);
        }
        const viewBox = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
        const hasViewBox = viewBox.length === 4 && viewBox[2] > 0 && viewBox[3] > 0;
        const isAbsolute = (v) => v && !/%$/.test(v.trim());
        if (hasViewBox && !(isAbsolute(svg.getAttribute('width')) && isAbsolute(svg.getAttribute('height')))) {
            const scale = 512 / Math.max(viewBox[2], viewBox[3]);
            svg.setAttribute('width', Math.round(viewBox[2] * scale));
            svg.setAttribute('height', Math.round(viewBox[3] * scale));
        }
        const markup = new XMLSerializer().serializeToString(svg);
        return readAsDataUrl(new Blob([markup], { type: 'image/svg+xml' }));
    }

    async function handleLogo(file) {
        if (!file) return;
        const isSvg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);
        const isRaster = /^image\/(png|jpeg)$/.test(file.type) || /\.(png|jpe?g)$/i.test(file.name);
        if (!isSvg && !isRaster) {
            alert('Elegí una imagen PNG, JPG o SVG.');
            return;
        }
        let dataUrl;
        const img = new Image();
        try {
            dataUrl = isSvg ? await svgToDataUrl(file) : await readAsDataUrl(file);
            img.src = dataUrl;
            await img.decode();
        } catch (err) {
            console.error(err);
            alert('No se pudo leer la imagen.');
            return;
        }
        state.logo = dataUrl;
        state.logoImage = img;

        const thumb = new Image();
        thumb.alt = '';
        thumb.src = dataUrl;
        els.logoThumb.replaceChildren(thumb);
        els.logoThumb.classList.add('has-logo');
        els.logoName.textContent = file.name;
        els.removeLogo.disabled = false;
        els.logoSize.disabled = false;
        updateLogoSizeUi();
        updateLogoTool();
        render();
    }

    function removeLogo() {
        state.logo = null;
        state.logoImage = null;
        els.logoThumb.innerHTML = emptyThumb;
        els.logoThumb.classList.remove('has-logo');
        els.logoName.textContent = 'Sin logo';
        els.removeLogo.disabled = true;
        els.logoSize.disabled = true;
        updateLogoSizeUi();
        updateLogoTool();
        render();
    }

    function updateLogoSizeUi() {
        els.logoSizeValue.textContent = Math.round(state.logoSize * 100) + '%';
        els.logoSizeWarning.hidden = !(state.logo && state.logoSize > LOGO_SIZE_WARNING + 0.001);
    }

    /* ---------- Descarga ---------- */

    // "https://www.mauroads.com/x" → "qr-mauroads"
    function fileBaseName() {
        try {
            const host = new URL(normalizeUrl(state.url)).hostname.replace(/^www\./i, '');
            const parts = host.split('.').filter(Boolean);
            if (parts.length > 1) parts.pop();
            const secondLevel = ['com', 'co', 'org', 'net', 'gob', 'gov', 'edu', 'ac', 'mil', 'nom'];
            if (parts.length > 1 && secondLevel.includes(parts[parts.length - 1].toLowerCase())) parts.pop();
            const name = parts.join('-').toLowerCase().replace(/[^a-z0-9-]/g, '');
            return 'qr-' + (name || 'codigo');
        } catch {
            return 'qr-codigo';
        }
    }

    async function download(format, button) {
        if (!state.url.trim()) return;
        button.disabled = true;
        try {
            const size = state.exportSize;
            const qr = new QRCodeStyling(buildOptions(size, format === 'svg' ? 'svg' : 'canvas'));
            const blob = await qr.getRawData(format === 'jpg' ? 'jpeg' : format);
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `${fileBaseName()}.${format}`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(link.href), 4000);
        } catch (err) {
            console.error(err);
            alert('No se pudo generar el archivo. Probá de nuevo.');
        } finally {
            button.disabled = false;
        }
    }

    function updateExportSize() {
        const checked = document.querySelector('input[name="exportSize"]:checked');
        state.exportSize = parseInt(checked.value, 10);
        els.sizeValue.textContent = `${state.exportSize} × ${state.exportSize} px`;
    }

    /* ---------- Eventos ---------- */

    els.url.addEventListener('input', () => {
        state.url = els.url.value;
        scheduleRender();
    });

    els.clearUrl.addEventListener('click', () => {
        els.url.value = '';
        state.url = '';
        render();
        els.url.focus();
    });

    document.querySelectorAll('input[name="dotsType"], input[name="cornerType"]').forEach((radio) => {
        radio.addEventListener('change', () => {
            state[radio.name] = radio.value;
            render();
        });
    });

    document.querySelectorAll('input[name="exportSize"]').forEach((radio) => {
        radio.addEventListener('change', updateExportSize);
    });

    els.logoInput.addEventListener('change', () => {
        handleLogo(els.logoInput.files[0]);
        // Permite volver a subir el mismo archivo
        els.logoInput.value = '';
    });

    els.removeLogo.addEventListener('click', removeLogo);

    els.logoSize.addEventListener('input', () => {
        state.logoSize = parseFloat(els.logoSize.value);
        updateLogoSizeUi();
        scheduleRender();
    });

    els.downloadButtons.forEach((button) => {
        button.addEventListener('click', () => download(button.dataset.format, button));
    });

    // Estado inicial tomado del HTML (por si el navegador recuerda valores al recargar)
    state.url = els.url.value;
    state.dotsType = document.querySelector('input[name="dotsType"]:checked').value;
    state.cornerType = document.querySelector('input[name="cornerType"]:checked').value;
    state.logoSize = parseFloat(els.logoSize.value);
    Object.keys(COLOR_LABELS).forEach(paintSwatch);
    updateLogoSizeUi();
    updateLogoTool();
    updateExportSize();
    render();
})();
