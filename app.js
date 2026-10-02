(() => {
    'use strict';

    // Tamaño interno de la vista previa (se muestra más chico, así se ve nítido en pantallas retina)
    const PREVIEW_SIZE = 640;
    // Margen blanco alrededor del QR (zona de silencio), como proporción del tamaño total
    const MARGIN_RATIO = 0.06;
    // Contraste mínimo entre puntos y fondo antes de mostrar el aviso
    const MIN_CONTRAST = 4;
    const EXPORT_MIN = 200;
    const EXPORT_MAX = 4000;
    const PLACEHOLDER_DATA = 'https://mauroads.com';

    // Cada estilo de esquina combina el cuadrado exterior y el punto interior
    const CORNER_STYLES = {
        square: { outer: 'square', inner: 'square' },
        rounded: { outer: 'extra-rounded', inner: 'dot' },
        dot: { outer: 'dot', inner: 'dot' }
    };

    const state = {
        url: '',
        dotsType: 'square',
        dotsColor: '#000000',
        cornerType: 'square',
        cornerColor: '#000000',
        bgColor: '#ffffff',
        logo: null,
        logoSize: 0.35
    };

    const $ = (id) => document.getElementById(id);
    const els = {
        url: $('url'),
        clearUrl: $('clearUrl'),
        qr: $('qr'),
        warning: $('contrastWarning'),
        dotsColor: $('dotsColor'),
        cornerColor: $('cornerColor'),
        bgColor: $('bgColor'),
        logoInput: $('logoInput'),
        removeLogo: $('removeLogo'),
        logoSize: $('logoSize'),
        logoSizeValue: $('logoSizeValue'),
        logoThumb: $('logoThumb'),
        logoName: $('logoName'),
        exportSize: $('exportSize'),
        downloadButtons: document.querySelectorAll('[data-format]')
    };
    const emptyThumb = els.logoThumb.innerHTML;

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

    /* ---------- Aviso de contraste ---------- */

    function luminance(hex) {
        const n = parseInt(hex.slice(1), 16);
        const channel = (c) => {
            const v = c / 255;
            return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
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
        try {
            state.logo = isSvg ? await svgToDataUrl(file) : await readAsDataUrl(file);
        } catch (err) {
            console.error(err);
            alert('No se pudo leer la imagen.');
            return;
        }
        const img = new Image();
        img.alt = '';
        img.src = state.logo;
        els.logoThumb.replaceChildren(img);
        els.logoThumb.classList.add('has-logo');
        els.logoName.textContent = file.name;
        els.removeLogo.disabled = false;
        els.logoSize.disabled = false;
        render();
    }

    function removeLogo() {
        state.logo = null;
        els.logoThumb.innerHTML = emptyThumb;
        els.logoThumb.classList.remove('has-logo');
        els.logoName.textContent = 'Sin logo';
        els.removeLogo.disabled = true;
        els.logoSize.disabled = true;
        render();
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

    function exportSize() {
        let size = parseInt(els.exportSize.value, 10);
        if (!Number.isFinite(size)) size = 1200;
        size = Math.min(EXPORT_MAX, Math.max(EXPORT_MIN, size));
        els.exportSize.value = size;
        return size;
    }

    async function download(format, button) {
        if (!state.url.trim()) return;
        button.disabled = true;
        try {
            const size = exportSize();
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

    [['dotsColor', els.dotsColor], ['cornerColor', els.cornerColor], ['bgColor', els.bgColor]].forEach(([key, input]) => {
        input.addEventListener('input', () => {
            state[key] = input.value;
            scheduleRender();
        });
    });

    els.logoInput.addEventListener('change', () => {
        handleLogo(els.logoInput.files[0]);
        // Permite volver a subir el mismo archivo
        els.logoInput.value = '';
    });

    els.removeLogo.addEventListener('click', removeLogo);

    els.logoSize.addEventListener('input', () => {
        state.logoSize = parseFloat(els.logoSize.value);
        els.logoSizeValue.textContent = Math.round(state.logoSize * 100) + '%';
        scheduleRender();
    });

    els.exportSize.addEventListener('change', exportSize);

    els.downloadButtons.forEach((button) => {
        button.addEventListener('click', () => download(button.dataset.format, button));
    });

    // Estado inicial tomado del HTML (por si el navegador recuerda valores al recargar)
    state.url = els.url.value;
    state.dotsColor = els.dotsColor.value;
    state.cornerColor = els.cornerColor.value;
    state.bgColor = els.bgColor.value;
    state.dotsType = document.querySelector('input[name="dotsType"]:checked').value;
    state.cornerType = document.querySelector('input[name="cornerType"]:checked').value;
    state.logoSize = parseFloat(els.logoSize.value);
    els.logoSizeValue.textContent = Math.round(state.logoSize * 100) + '%';
    render();
})();
