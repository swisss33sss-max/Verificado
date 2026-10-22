document.addEventListener('DOMContentLoaded', () => {
    'use strict';

    // =========================================================
    // CONFIGURACIÓN GITHUB (técnica vanilla, igual que repo "Auto")
    // La DB vive en el repo y se lee/escribe vía GitHub Contents API.
    // Así se actualiza para cualquier usuario/móvil sin servidor propio.
    // =========================================================
    const REPO = 'swisss33sss-max';
    const REPO_NAME = 'Verificado';
    const BRANCH = 'main';
    const DATA_PATH = 'pipetas_db.json';

    let ghToken = localStorage.getItem('gh_token_pipetas') || '';
    let dbSha = null;

    const GH = {
        async get(path) {
            const r = await fetch(`https://api.github.com/repos/${REPO}/${REPO_NAME}/contents/${path}?ref=${BRANCH}`,
                { headers: { Authorization: `token ${ghToken}`, Accept: 'application/vnd.github.v3+json' } });
            if (r.status === 404) return null;
            if (!r.ok) throw new Error('GitHub GET ' + r.status);
            return r.json();
        },
        async put(path, content, sha) {
            const body = {
                message: 'update pipetas_db',
                content: btoa(unescape(encodeURIComponent(content))),
                branch: BRANCH
            };
            if (sha) body.sha = sha;
            const r = await fetch(`https://api.github.com/repos/${REPO}/${REPO_NAME}/contents/${path}`,
                { method: 'PUT', headers: { Authorization: `token ${ghToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || ('GitHub PUT ' + r.status)); }
            return r.json();
        }
    };

    // =========================================================
    // ESTADO
    // =========================================================
    const EXPORT_HEADERS = [
        'Ubicación Tecnica', 'Equipo', 'Serie', 'Modelo',
        'Magnitud', 'CLASE', 'Calibracion', 'Vencimiento',
        'Verificado', 'Observaciones'
    ];

    let estado = { generado: '', fuente: 'GENERAL', clinicas: {} };
    let clinicaActual = '';
    let editIndex = -1;

    // Elementos
    const clinicaSelect = document.getElementById('clinicaSelect');
    const dbInfo = document.getElementById('dbInfo');
    const verifyBtn = document.getElementById('verifySerieBtn');
    const registerBtn = document.getElementById('registerSerieBtn');
    const actionFeedback = document.getElementById('actionFeedback');
    const resultsArea = document.getElementById('resultsArea');
    const statsRow = document.getElementById('statsRow');
    const exportBtn = document.getElementById('exportBtn');
    const exportFileName = document.getElementById('exportFileName');
    const importInput = document.getElementById('importInput');
    const resetBtn = document.getElementById('resetBtn');
    const ioFeedback = document.getElementById('ioFeedback');
    const filterSerieInput = document.getElementById('filterSerieInput');
    const filterMagnitudInput = document.getElementById('filterMagnitudInput');

    const verifyModal = document.getElementById('verifyModal');
    const verifyInput = document.getElementById('verifyInput');
    const verifySuggestions = document.getElementById('verifySuggestions');
    const verifyFeedback = document.getElementById('verifyFeedback');
    const confirmVerifyBtn = document.getElementById('confirmVerifyBtn');
    const cancelVerifyBtn = document.getElementById('cancelVerifyBtn');

    const editModal = document.getElementById('editModal');
    const editModalTitle = document.getElementById('editModalTitle');
    const editSerie = document.getElementById('editSerie');
    const editMagnitud = document.getElementById('editMagnitud');
    const editCalib = document.getElementById('editCalib');
    const editVenc = document.getElementById('editVenc');
    const editModelo = document.getElementById('editModelo');
    const editObs = document.getElementById('editObs');
    const editFeedback = document.getElementById('editFeedback');
    const saveEditBtn = document.getElementById('saveEditBtn');
    const cancelEditBtn = document.getElementById('cancelEditBtn');

    // =========================================================
    // TOKEN
    // =========================================================
    function pedirToken() {
        const t = prompt('🔑 Pega tu token de GitHub (ghp_... o github_pat_...).\nSe guarda solo en este dispositivo y permite leer/guardar la base de datos.');
        if (t && (t.startsWith('ghp_') || t.startsWith('github_pat_'))) {
            ghToken = t.trim();
            localStorage.setItem('gh_token_pipetas', ghToken);
            return true;
        }
        if (t !== null) alert('Token inválido (debe empezar con ghp_ o github_pat_).');
        return false;
    }

    // =========================================================
    // CARGA / GUARDADO DE LA DB (GitHub)
    // =========================================================
    function normalizarDB(json) {
        const clinicas = {};
        Object.keys(json.clinicas || {}).forEach(cl => {
            clinicas[cl] = (json.clinicas[cl] || []).map(p => ({
                serie: (p.serie || '').toString().toUpperCase(),
                magnitud: p.magnitud || '',
                fecha_calibracion: p.fecha_calibracion || '',
                fecha_vencimiento: p.fecha_vencimiento || '',
                modelo: p.modelo || '',
                objeto: p.objeto || '',
                clase: p.clase || p.objeto || '',
                ubicacion: p.ubicacion || '',
                observaciones: p.observaciones || '',
                verificado: p.verificado || '',
                archivo: p.archivo || ''
            }));
        });
        return { generado: json.generado || '', fuente: json.fuente || 'GENERAL', clinicas };
    }

    async function loadDB() {
        const f = await GH.get(DATA_PATH);
        if (f) {
            dbSha = f.sha;
            const txt = decodeURIComponent(escape(atob((f.content || '').replace(/\n/g, ''))));
            estado = normalizarDB(JSON.parse(txt));
            return true;
        }
        // No existe aún en el repo: usar la semilla incrustada y crearlo
        dbSha = null;
        estado = normalizarDB(SEED_DB);
        await saveDB(); // crea el archivo en el repo
        return false;
    }

    async function saveDB() {
        const c = JSON.stringify(estado, null, 2);
        const r = await GH.put(DATA_PATH, c, dbSha);
        dbSha = r.content.sha;
    }

    async function inicializar() {
        if (!ghToken) {
            setInfo('🔑 Necesitas configurar tu token de GitHub para usar la app.', true);
            if (!pedirToken()) return;
        }
        try {
            setInfo('Cargando base de datos desde GitHub...');
            const existia = await loadDB();
            setInfo(existia
                ? 'Base cargada desde GitHub (' + totalPipetas() + ' pipetas).'
                : 'Base inicial creada en GitHub desde los PDF (' + totalPipetas() + ' pipetas).');
            poblarClinicas();
        } catch (err) {
            console.error(err);
            if (String(err.message).includes('401') || String(err.message).includes('Bad credentials')) {
                localStorage.removeItem('gh_token_pipetas'); ghToken = '';
                setInfo('❌ Token inválido o expirado. Recarga la página y vuelve a pegarlo.', true);
            } else {
                setInfo('❌ Error cargando desde GitHub: ' + err.message, true);
            }
        }
    }

    function totalPipetas() {
        return Object.values(estado.clinicas).reduce((a, v) => a + v.length, 0);
    }

    function setInfo(msg, isError) {
        dbInfo.textContent = msg;
        dbInfo.style.color = isError ? '#ff6464' : '#888';
    }

    // =========================================================
    // SELECTOR DE CLÍNICA
    // =========================================================
    function poblarClinicas() {
        const cls = Object.keys(estado.clinicas).sort();
        clinicaSelect.innerHTML = '<option value="">-- Seleccionar Clínica --</option>' +
            cls.map(c => `<option value="${c}">${c} (${estado.clinicas[c].length})</option>`).join('');
    }

    clinicaSelect.addEventListener('change', () => {
        clinicaActual = clinicaSelect.value;
        if (clinicaActual && estado.clinicas[clinicaActual]) {
            resultsArea.classList.remove('hidden');
            verifyBtn.classList.remove('disabled');
            registerBtn.classList.remove('disabled');
            renderTabla(); renderStats();
        } else {
            resultsArea.classList.add('hidden');
            verifyBtn.classList.add('disabled');
            registerBtn.classList.add('disabled');
        }
    });

    // =========================================================
    // FECHAS
    // =========================================================
    function parseFechaVenc(venc) {
        if (!venc) return null;
        const m = venc.match(/^(\d{1,2})\/(\d{4})$/);
        if (!m) { const d = new Date(venc); return isNaN(d.getTime()) ? null : d; }
        return new Date(parseInt(m[2], 10), parseInt(m[1], 10), 0);
    }
    function estadoVencimiento(venc) {
        const d = parseFechaVenc(venc);
        if (!d) return { clase: 'badge-warn', texto: 's/f' };
        const dias = Math.floor((d - new Date()) / 86400000);
        if (dias < 0) return { clase: 'badge-exp', texto: 'Vencida' };
        if (dias <= 30) return { clase: 'badge-warn', texto: 'Por vencer' };
        return { clase: 'badge-ok', texto: 'Vigente' };
    }
    function fechaCalibToInput(fc) {
        const m = (fc || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
    }
    function inputToFechaCalib(v) {
        const m = (v || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
        return m ? `${m[3]}/${m[2]}/${m[1]}` : (v || '');
    }
    function vencToInput(venc) {
        const m = (venc || '').match(/^(\d{1,2})\/(\d{4})$/);
        return m ? `${m[2]}-${m[1].padStart(2, '0')}` : '';
    }
    function inputToVenc(v) {
        const m = (v || '').match(/^(\d{4})-(\d{2})$/);
        return m ? `${m[2]}/${m[1]}` : (v || '');
    }

    // =========================================================
    // TABLA Y STATS
    // =========================================================
    function listaActual() { return estado.clinicas[clinicaActual] || []; }

    function renderStats() {
        const lista = listaActual();
        let vig = 0, pv = 0, ven = 0, verif = 0;
        lista.forEach(p => {
            const e = estadoVencimiento(p.fecha_vencimiento);
            if (e.texto === 'Vigente') vig++; else if (e.texto === 'Por vencer') pv++; else if (e.texto === 'Vencida') ven++;
            if (p.verificado) verif++;
        });
        statsRow.innerHTML = `
            <div class="stat-box"><div class="num">${lista.length}</div><div class="lbl">TOTAL</div></div>
            <div class="stat-box"><div class="num" style="color:#00ff88">${vig}</div><div class="lbl">VIGENTES</div></div>
            <div class="stat-box"><div class="num" style="color:#ffc800">${pv}</div><div class="lbl">POR VENCER</div></div>
            <div class="stat-box"><div class="num" style="color:#ff6464">${ven}</div><div class="lbl">VENCIDAS</div></div>
            <div class="stat-box"><div class="num">${verif}</div><div class="lbl">VERIFICADAS</div></div>`;
    }

    function renderTabla() {
        const thead = document.querySelector('#tableMain thead');
        const tbody = document.querySelector('#tableMain tbody');
        thead.innerHTML = `<tr><th>Serie</th><th>Magnitud</th><th>Calibración</th><th>Vencimiento</th><th>Estado</th><th>Verificado</th><th>Modelo</th><th>Observaciones</th></tr>`;
        tbody.innerHTML = '';
        const fs = (filterSerieInput.value || '').trim().toUpperCase();
        const fm = (filterMagnitudInput.value || '').trim().toUpperCase();
        listaActual().forEach((p, idx) => {
            if (fs && !String(p.serie).toUpperCase().includes(fs)) return;
            if (fm && !String(p.magnitud).toUpperCase().includes(fm)) return;
            const ev = estadoVencimiento(p.fecha_vencimiento);
            const tr = document.createElement('tr');
            tr.style.cursor = 'pointer';
            tr.addEventListener('click', () => abrirEdicion(idx));
            tr.innerHTML = `
                <td><strong>${p.serie || ''}</strong></td>
                <td>${p.magnitud || ''}</td>
                <td>${p.fecha_calibracion || ''}</td>
                <td>${p.fecha_vencimiento || ''}</td>
                <td><span class="badge ${ev.clase}">${ev.texto}</span></td>
                <td>${p.verificado ? '✅' : ''}</td>
                <td>${p.modelo || ''}</td>
                <td>${p.observaciones || ''}</td>`;
            tbody.appendChild(tr);
        });
    }

    filterSerieInput.addEventListener('input', renderTabla);
    filterMagnitudInput.addEventListener('input', renderTabla);

    // =========================================================
    // VERIFICAR POR SERIE
    // =========================================================
    verifyBtn.addEventListener('click', () => {
        if (verifyBtn.classList.contains('disabled')) return alertFeedback(actionFeedback, '⚠️ Selecciona una clínica primero.', 'warning');
        verifyInput.value = ''; verifyFeedback.classList.add('hidden'); verifySuggestions.classList.add('hidden');
        verifyModal.classList.remove('hidden'); verifyInput.focus();
    });
    cancelVerifyBtn.addEventListener('click', () => verifyModal.classList.add('hidden'));

    verifyInput.addEventListener('input', () => {
        const val = verifyInput.value.trim().toUpperCase();
        verifySuggestions.innerHTML = '';
        if (val.length < 2) { verifySuggestions.classList.add('hidden'); return; }
        const matches = listaActual().filter(p => String(p.serie).toUpperCase().includes(val)).slice(0, 10);
        if (!matches.length) { verifySuggestions.classList.add('hidden'); return; }
        matches.forEach(p => {
            const div = document.createElement('div');
            div.className = 'suggestion-item';
            div.innerHTML = `<strong>${p.serie}</strong><small>${p.magnitud} | vence ${p.fecha_vencimiento || 's/f'}</small>`;
            div.addEventListener('click', () => { verifyInput.value = p.serie; verifySuggestions.classList.add('hidden'); confirmVerifyBtn.click(); });
            verifySuggestions.appendChild(div);
        });
        verifySuggestions.classList.remove('hidden');
    });
    verifyInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') confirmVerifyBtn.click(); });

    confirmVerifyBtn.addEventListener('click', async () => {
        const val = verifyInput.value.trim().toUpperCase();
        if (!val) return alertFeedback(verifyFeedback, '⚠️ Ingresa un número de serie', 'warning');
        const lista = listaActual();
        const idx = lista.findIndex(p => String(p.serie).toUpperCase() === val);
        if (idx === -1) return alertFeedback(verifyFeedback, `❌ Serie "${val}" no encontrada en ${clinicaActual}`, 'error');
        lista[idx].verificado = '✅';
        const p = lista[idx];
        const ev = estadoVencimiento(p.fecha_vencimiento);
        alertFeedback(verifyFeedback, `✅ ${p.serie} verificada. Magnitud: ${p.magnitud}. Calibración: ${p.fecha_calibracion}. Vence: ${p.fecha_vencimiento} (${ev.texto}). Guardando...`, 'success');
        renderTabla(); renderStats();
        try { await saveDB(); alertFeedback(verifyFeedback, `✅ ${p.serie} verificada y guardada en GitHub.`, 'success'); }
        catch (err) { alertFeedback(verifyFeedback, '⚠️ Verificada localmente, pero falló el guardado: ' + err.message, 'warning'); }
        setTimeout(() => verifyModal.classList.add('hidden'), 1500);
    });

    document.addEventListener('click', (e) => {
        if (!verifyInput.contains(e.target) && !verifySuggestions.contains(e.target)) verifySuggestions.classList.add('hidden');
    });

    // =========================================================
    // REGISTRAR / EDITAR
    // =========================================================
    registerBtn.addEventListener('click', () => {
        if (registerBtn.classList.contains('disabled')) return alertFeedback(actionFeedback, '⚠️ Selecciona una clínica primero.', 'warning');
        abrirEdicion(-1);
    });

    function abrirEdicion(idx) {
        editIndex = idx; editFeedback.classList.add('hidden');
        if (idx === -1) {
            editModalTitle.textContent = '📝 Registrar Pipeta';
            editSerie.value = ''; editMagnitud.value = ''; editCalib.value = '';
            editVenc.value = ''; editModelo.value = ''; editObs.value = '';
        } else {
            const p = listaActual()[idx];
            editModalTitle.textContent = '✏️ Editar Pipeta';
            editSerie.value = p.serie; editMagnitud.value = p.magnitud || '';
            editCalib.value = fechaCalibToInput(p.fecha_calibracion);
            editVenc.value = vencToInput(p.fecha_vencimiento);
            editModelo.value = p.modelo || ''; editObs.value = p.observaciones || '';
        }
        editModal.classList.remove('hidden'); editSerie.focus();
    }
    cancelEditBtn.addEventListener('click', () => editModal.classList.add('hidden'));

    saveEditBtn.addEventListener('click', async () => {
        const serie = editSerie.value.trim().toUpperCase();
        if (!serie) return alertFeedback(editFeedback, '⚠️ Ingresa el número de serie', 'warning');
        const lista = listaActual();
        const datos = {
            serie,
            magnitud: editMagnitud.value.trim(),
            fecha_calibracion: inputToFechaCalib(editCalib.value),
            fecha_vencimiento: inputToVenc(editVenc.value),
            modelo: editModelo.value.trim(),
            observaciones: editObs.value.trim()
        };
        if (editIndex === -1) {
            if (lista.some(p => String(p.serie).toUpperCase() === serie))
                return alertFeedback(editFeedback, `⚠️ La serie "${serie}" ya existe en ${clinicaActual}`, 'warning');
            lista.push(Object.assign({ objeto: '', clase: '', ubicacion: '', verificado: '✅', archivo: '' }, datos));
        } else {
            Object.assign(lista[editIndex], datos, { verificado: '✅' });
        }
        renderTabla(); renderStats();
        alertFeedback(editFeedback, 'Guardando en GitHub...', 'success');
        try { await saveDB(); alertFeedback(editFeedback, '✅ Guardado en GitHub.', 'success'); setTimeout(() => editModal.classList.add('hidden'), 900); }
        catch (err) { alertFeedback(editFeedback, '⚠️ Guardado local, pero falló GitHub: ' + err.message, 'warning'); }
    });

    // =========================================================
    // EXPORTAR EXCEL
    // =========================================================
    exportBtn.addEventListener('click', () => {
        if (!totalPipetas()) return alertFeedback(ioFeedback, '⚠️ No hay datos para exportar', 'warning');
        try {
            const wb = XLSX.utils.book_new();
            Object.keys(estado.clinicas).sort().forEach(cl => {
                const filas = estado.clinicas[cl].map(p => ({
                    'Ubicación Tecnica': p.ubicacion || '',
                    'Equipo': p.serie ? ('PIP-' + p.serie) : '',
                    'Serie': p.serie || '',
                    'Modelo': p.modelo || '',
                    'Magnitud': p.magnitud || '',
                    'CLASE': p.clase || p.objeto || '',
                    'Calibracion': p.fecha_calibracion || '',
                    'Vencimiento': p.fecha_vencimiento || '',
                    'Verificado': p.verificado || '',
                    'Observaciones': p.observaciones || ''
                }));
                const ws = XLSX.utils.json_to_sheet(filas, { header: EXPORT_HEADERS });
                XLSX.utils.book_append_sheet(wb, ws, cl.substring(0, 31));
            });
            let name = (exportFileName.value || '').trim() || 'Pipetas_Generales';
            name = name.replace(/[\\\/:*?"<>|]/g, '_');
            XLSX.writeFile(wb, name + '.xlsx');
            alertFeedback(ioFeedback, '✅ Excel exportado (' + Object.keys(estado.clinicas).length + ' clínicas).', 'success');
        } catch (err) { console.error(err); alertFeedback(ioFeedback, '❌ Error al exportar', 'error'); }
    });

    // =========================================================
    // IMPORTAR EXCEL (formato actual y nuevo) -> guarda en GitHub
    // =========================================================
    function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim(); }
    function findKey(headers, ...cands) {
        for (const c of cands) { const k = headers.find(h => norm(h).includes(norm(c))); if (k) return k; }
        return null;
    }
    function formatCellFecha(v) {
        if (v instanceof Date && !isNaN(v.getTime())) return `${String(v.getDate()).padStart(2, '0')}/${String(v.getMonth() + 1).padStart(2, '0')}/${v.getFullYear()}`;
        const s = String(v || '').trim();
        const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
        return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
    }
    function formatCellVenc(v) {
        if (v instanceof Date && !isNaN(v.getTime())) return `${String(v.getMonth() + 1).padStart(2, '0')}/${v.getFullYear()}`;
        const s = String(v || '').trim();
        let m = s.match(/^(\d{1,2})\/(\d{4})$/); if (m) return `${m[1].padStart(2, '0')}/${m[2]}`;
        m = s.match(/^(\d{4})-(\d{2})/); if (m) return `${m[2]}/${m[1]}`;
        m = s.match(/^\d{1,2}\/(\d{1,2})\/(\d{4})$/); if (m) return `${m[1].padStart(2, '0')}/${m[2]}`;
        return s;
    }

    importInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
            try {
                const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array', cellDates: true });
                const nuevo = { generado: new Date().toISOString(), fuente: 'IMPORT', clinicas: {} };
                let total = 0;
                wb.SheetNames.forEach(sheetName => {
                    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });
                    if (!rows.length) return;
                    const headers = Object.keys(rows[0]);
                    const kSerie = findKey(headers, 'serie', 'serial');
                    if (!kSerie) return;
                    const kMag = findKey(headers, 'magnitud');
                    const kCal = findKey(headers, 'calibracion', 'calibración');
                    const kVen = findKey(headers, 'vencimiento', 'vto');
                    const kMod = findKey(headers, 'modelo');
                    const kCla = findKey(headers, 'clase');
                    const kUbi = findKey(headers, 'ubicacion', 'ubicación');
                    const kVer = findKey(headers, 'verificado');
                    const kObs = findKey(headers, 'observacion', 'observación');
                    let clinica = sheetName.trim().replace(/\s*\d+.*$/, '').trim().toUpperCase() || sheetName.trim().toUpperCase();
                    const lista = nuevo.clinicas[clinica] || [];
                    rows.forEach(r => {
                        let serie = String(r[kSerie] || '').trim().toUpperCase();
                        if (!serie) return;
                        serie = serie.replace(/^(PIPETA|PIP|MIC|DIS|MICROSC|MICROSCOPIO)-/, '');
                        lista.push({
                            serie,
                            magnitud: kMag ? String(r[kMag] || '').trim() : '',
                            fecha_calibracion: kCal ? formatCellFecha(r[kCal]) : '',
                            fecha_vencimiento: kVen ? formatCellVenc(r[kVen]) : '',
                            modelo: kMod ? String(r[kMod] || '').trim() : '',
                            clase: kCla ? String(r[kCla] || '').trim() : '',
                            objeto: '',
                            ubicacion: kUbi ? String(r[kUbi] || '').trim() : '',
                            verificado: kVer ? String(r[kVer] || '').trim() : '',
                            observaciones: kObs ? String(r[kObs] || '').trim() : '',
                            archivo: ''
                        });
                        total++;
                    });
                    if (lista.length) nuevo.clinicas[clinica] = lista;
                });
                if (!total) return alertFeedback(ioFeedback, '⚠️ No se encontraron filas con columna "Serie".', 'warning');
                estado = normalizarDB(nuevo);
                poblarClinicas();
                clinicaActual = ''; resultsArea.classList.add('hidden');
                verifyBtn.classList.add('disabled'); registerBtn.classList.add('disabled');
                alertFeedback(ioFeedback, 'Importado. Guardando en GitHub...', 'success');
                try { await saveDB(); alertFeedback(ioFeedback, `✅ Importadas ${Object.keys(estado.clinicas).length} clínicas y guardadas en GitHub.`, 'success'); }
                catch (err) { alertFeedback(ioFeedback, '⚠️ Importado local, pero falló GitHub: ' + err.message, 'warning'); }
            } catch (err) { console.error(err); alertFeedback(ioFeedback, '❌ Error al importar el Excel.', 'error'); }
            importInput.value = '';
        };
        reader.readAsArrayBuffer(file);
    });

    // =========================================================
    // RESTAURAR DESDE SEMILLA PDF
    // =========================================================
    resetBtn.addEventListener('click', async () => {
        if (!confirm('¿Restaurar la base original (desde los PDF) y guardarla en GitHub? Se perderán los cambios actuales.')) return;
        estado = normalizarDB(SEED_DB);
        poblarClinicas();
        clinicaActual = ''; resultsArea.classList.add('hidden');
        verifyBtn.classList.add('disabled'); registerBtn.classList.add('disabled');
        try { await saveDB(); alertFeedback(ioFeedback, '✅ Base restaurada desde los PDF y guardada en GitHub.', 'success'); }
        catch (err) { alertFeedback(ioFeedback, '❌ No se pudo guardar en GitHub: ' + err.message, 'error'); }
    });

    function alertFeedback(el, msg, tipo) {
        el.textContent = msg; el.className = 'feedback ' + (tipo || 'success'); el.classList.remove('hidden');
        if (tipo === 'success') setTimeout(() => el.classList.add('hidden'), 4000);
    }

    // =========================================================
    // SEMILLA (datos iniciales extraídos de los certificados PDF)
    // Se inyecta desde pipetas_seed.js (window.PIPETAS_SEED)
    // =========================================================
    const SEED_DB = window.PIPETAS_SEED || { generado: '', fuente: 'GENERAL', clinicas: {} };

    inicializar();
});
