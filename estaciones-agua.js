document.addEventListener('DOMContentLoaded', () => {
    // === CONFIGURACIÓN DE ESTACIONES ===
    const ESTACIONES = [
        {
            id: 'A',
            nombre: 'Estación A',
            serie: 'EST-01543',
            proveedor: 'Abbott'
        },
        {
            id: 'B',
            nombre: 'Estación B',
            serie: 'EST-MR120H2732252',
            proveedor: 'Abbott'
        },
        {
            id: 'C',
            nombre: 'Estación C',
            serie: 'EST-MP00003507',
            proveedor: 'Abbott'
        },
        {
            id: 'D',
            nombre: 'Estación D',
            serie: 'EST-AGU-MP00005085',
            proveedor: 'Roche'
        },
        {
            id: 'PRE01',
            nombre: 'PRE 01',
            serie: 'N/A',
            proveedor: 'N/A'
        },
        {
            id: 'PRE02',
            nombre: 'PRE 02',
            serie: 'N/A',
            proveedor: 'N/A'
        }
    ];

    // === INDEXEDDB ===
    let db = null;
    const DB_NAME = 'EstacionesAguaDB';
    const DB_VERSION = 2;

    function initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                db = request.result;
                resolve(db);
            };

            request.onupgradeneeded = (e) => {
                const database = e.target.result;

                // Store para preventivos
                if (!database.objectStoreNames.contains('preventivos')) {
                    const prevStore = database.createObjectStore('preventivos', { keyPath: 'id', autoIncrement: true });
                    prevStore.createIndex('estacionId', 'estacionId', { unique: false });
                    prevStore.createIndex('fecha', 'fecha', { unique: false });
                }

                // Store para correctivos
                if (!database.objectStoreNames.contains('correctivos')) {
                    const corrStore = database.createObjectStore('correctivos', { keyPath: 'id', autoIncrement: true });
                    corrStore.createIndex('estacionId', 'estacionId', { unique: false });
                    corrStore.createIndex('fecha', 'fecha', { unique: false });
                }

                // Store para suministros
                if (!database.objectStoreNames.contains('suministros')) {
                    const sumStore = database.createObjectStore('suministros', { keyPath: 'id', autoIncrement: true });
                    sumStore.createIndex('estacionId', 'estacionId', { unique: false });
                    sumStore.createIndex('fecha', 'fecha', { unique: false });
                }

                // Store para certificados
                if (!database.objectStoreNames.contains('certificados')) {
                    const certStore = database.createObjectStore('certificados', { keyPath: 'id', autoIncrement: true });
                    certStore.createIndex('estacionId', 'estacionId', { unique: false });
                    certStore.createIndex('fecha', 'fecha', { unique: false });
                }
            };
        });
    }

    // === FUNCIONES DE BASE DE DATOS ===
    function addRecord(storeName, data) {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.add(data);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    function getRecordsByStation(storeName, estacionId) {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const index = store.index('estacionId');
            const request = index.getAll(estacionId);

            request.onsuccess = () => {
                const records = request.result || [];
                // Ordenar por fecha descendente
                records.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
                resolve(records);
            };
            request.onerror = () => reject(request.error);
        });
    }

    function deleteRecord(storeName, id) {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    function updateRecord(storeName, data) {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.put(data);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    function getAllRecords(storeName) {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    // === VARIABLES GLOBALES ===
    let currentStationId = null;
    let cameraStream = null;
    let capturedPhoto = null;

    // === ELEMENTOS DEL DOM ===
    const stationsGrid = document.getElementById('stationsGrid');
    const managementPanel = document.getElementById('managementPanel');
    const currentStationTitle = document.getElementById('currentStationTitle');

    // Tabs
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');

    // Modales
    const preventivoModal = document.getElementById('preventivoModal');
    const correctivoModal = document.getElementById('correctivoModal');
    const suministroModal = document.getElementById('suministroModal');

    // Botones
    const addPreventivoBtn = document.getElementById('addPreventivoBtn');
    const addCorrectivoBtn = document.getElementById('addCorrectivoBtn');
    const addSuministroBtn = document.getElementById('addSuministroBtn');

    // Listas
    const preventivosList = document.getElementById('preventivosList');
    const correctivosList = document.getElementById('correctivosList');
    const suministrosList = document.getElementById('suministrosList');
    const certificadosList = document.getElementById('certificadosList');

    // Elementos de Certificados (Cámara)
    const certificadoModal = document.getElementById('certificadoModal');
    const addCertBtn = document.getElementById('addCertBtn');
    const certVideo = document.getElementById('certVideo');
    const certCapturedImg = document.getElementById('certCapturedImg');
    const startCertCameraBtn = document.getElementById('startCertCameraBtn');
    const captureCertBtn = document.getElementById('captureCertBtn');
    const retakeCertBtn = document.getElementById('retakeCertBtn');
    const saveCertBtn = document.getElementById('saveCertBtn');
    const cancelCertBtn = document.getElementById('cancelCertBtn');
    const certCameraContainer = document.getElementById('certCameraContainer');

    // Visor de Imagen
    const imageViewerModal = document.getElementById('imageViewerModal');
    const fullSizeImage = document.getElementById('fullSizeImage');
    const closeImageViewer = document.getElementById('closeImageViewer');

    // === RENDERIZAR ESTACIONES ===
    async function renderStations() {
        stationsGrid.innerHTML = '';

        for (const estacion of ESTACIONES) {
            const preventivos = await getRecordsByStation('preventivos', estacion.id);
            const correctivos = await getRecordsByStation('correctivos', estacion.id);
            const suministros = await getRecordsByStation('suministros', estacion.id);
            const certificados = await getRecordsByStation('certificados', estacion.id);

            const card = document.createElement('div');
            card.className = 'station-card';
            if (currentStationId === estacion.id) {
                card.classList.add('active');
            }

            card.innerHTML = `
                <div class="station-header">
                    <div class="station-name">${estacion.nombre}</div>
                    <div class="station-provider">${estacion.proveedor}</div>
                </div>
                <div class="station-serie">Serie: ${estacion.serie}</div>
                <div class="station-stats">
                    <div class="stat-item">
                        <div class="stat-value">${preventivos.length}</div>
                        <div class="stat-label">Preventivos</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${correctivos.length}</div>
                        <div class="stat-label">Correctivos</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${suministros.length}</div>
                        <div class="stat-label">Suministros</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${certificados.length}</div>
                        <div class="stat-label">Certificados</div>
                    </div>
                </div>
            `;

            card.addEventListener('click', () => selectStation(estacion.id));
            stationsGrid.appendChild(card);
        }
    }

    // === SELECCIONAR ESTACIÓN ===
    async function selectStation(estacionId) {
        currentStationId = estacionId;
        const estacion = ESTACIONES.find(e => e.id === estacionId);

        currentStationTitle.innerHTML = `
            💧 ${estacion.nombre} 
            <span style="font-size: 0.9rem; color: #888; font-weight: 400;">
                (${estacion.serie} - ${estacion.proveedor})
            </span>
        `;

        managementPanel.classList.remove('hidden');
        await renderStations();
        await loadCurrentTabData();

        // Scroll al panel
        managementPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // === TABS ===
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(tc => tc.classList.remove('active'));

            tab.classList.add('active');
            const tabName = tab.dataset.tab;
            document.getElementById(`${tabName}-content`).classList.add('active');

            loadCurrentTabData();
        });
    });

    async function loadCurrentTabData() {
        if (!currentStationId) return;

        const activeTab = document.querySelector('.tab.active').dataset.tab;

        if (activeTab === 'preventivos') {
            await loadPreventivos();
        } else if (activeTab === 'correctivos') {
            await loadCorrectivos();
        } else if (activeTab === 'suministros') {
            await loadSuministros();
        } else if (activeTab === 'certificados') {
            await loadCertificados();
        }
    }

    // === PREVENTIVOS ===
    async function loadPreventivos() {
        const preventivos = await getRecordsByStation('preventivos', currentStationId);
        preventivosList.innerHTML = '';

        if (preventivos.length === 0) {
            preventivosList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📅</div>
                    <div>No hay preventivos registrados</div>
                </div>
            `;
            return;
        }

        preventivos.forEach(prev => {
            const item = document.createElement('div');
            item.className = 'timeline-item';
            item.innerHTML = `
                <div class="timeline-date">${formatDate(prev.fecha)}</div>
                <div class="timeline-content">${prev.novedades}</div>
                <div class="timeline-actions">
                    <button class="btn btn-danger btn-small" onclick="deletePreventivo(${prev.id})">🗑️ Eliminar</button>
                </div>
            `;
            preventivosList.appendChild(item);
        });
    }

    addPreventivoBtn.addEventListener('click', () => {
        document.getElementById('preventivoFecha').value = new Date().toISOString().split('T')[0];
        document.getElementById('preventivoNovedades').value = '';
        preventivoModal.classList.remove('hidden');
    });

    document.getElementById('savePreventivoBtn').addEventListener('click', async () => {
        const fecha = document.getElementById('preventivoFecha').value;
        const novedades = document.getElementById('preventivoNovedades').value.trim();

        if (!fecha || !novedades) {
            alert('Por favor completa todos los campos');
            return;
        }

        await addRecord('preventivos', {
            estacionId: currentStationId,
            fecha: fecha,
            novedades: novedades,
            createdAt: new Date().toISOString()
        });

        preventivoModal.classList.add('hidden');
        await loadPreventivos();
        await renderStations();
    });

    document.getElementById('cancelPreventivoBtn').addEventListener('click', () => {
        preventivoModal.classList.add('hidden');
    });

    window.deletePreventivo = async (id) => {
        if (confirm('¿Eliminar este preventivo?')) {
            await deleteRecord('preventivos', id);
            await loadPreventivos();
            await renderStations();
        }
    };

    // === CORRECTIVOS ===
    async function loadCorrectivos() {
        const correctivos = await getRecordsByStation('correctivos', currentStationId);
        correctivosList.innerHTML = '';

        if (correctivos.length === 0) {
            correctivosList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🔧</div>
                    <div>No hay correctivos registrados</div>
                </div>
            `;
            return;
        }

        correctivos.forEach(corr => {
            const item = document.createElement('div');
            item.className = 'timeline-item';
            item.innerHTML = `
                <div class="timeline-date">${formatDate(corr.fecha)}</div>
                <div style="color: #ffc800; font-weight: 600; font-size: 0.85rem; margin-bottom: 6px;">
                    ${corr.clase}
                </div>
                <div class="timeline-content">${corr.novedades}</div>
                <div class="timeline-actions">
                    <button class="btn btn-danger btn-small" onclick="deleteCorrectivo(${corr.id})">🗑️ Eliminar</button>
                </div>
            `;
            correctivosList.appendChild(item);
        });
    }

    addCorrectivoBtn.addEventListener('click', () => {
        document.getElementById('correctivoFecha').value = new Date().toISOString().split('T')[0];
        document.getElementById('correctivoClase').value = '';
        document.getElementById('correctivoNovedades').value = '';
        correctivoModal.classList.remove('hidden');
    });

    document.getElementById('saveCorrectivoBtn').addEventListener('click', async () => {
        const fecha = document.getElementById('correctivoFecha').value;
        const clase = document.getElementById('correctivoClase').value;
        const novedades = document.getElementById('correctivoNovedades').value.trim();

        if (!fecha || !clase || !novedades) {
            alert('Por favor completa todos los campos');
            return;
        }

        await addRecord('correctivos', {
            estacionId: currentStationId,
            fecha: fecha,
            clase: clase,
            novedades: novedades,
            createdAt: new Date().toISOString()
        });

        correctivoModal.classList.add('hidden');
        await loadCorrectivos();
        await renderStations();
    });

    document.getElementById('cancelCorrectivoBtn').addEventListener('click', () => {
        correctivoModal.classList.add('hidden');
    });

    window.deleteCorrectivo = async (id) => {
        if (confirm('¿Eliminar este correctivo?')) {
            await deleteRecord('correctivos', id);
            await loadCorrectivos();
            await renderStations();
        }
    };

    // === SUMINISTROS ===
    async function loadSuministros() {
        const suministros = await getRecordsByStation('suministros', currentStationId);
        suministrosList.innerHTML = '';

        if (suministros.length === 0) {
            suministrosList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📦</div>
                    <div>No hay suministros registrados</div>
                </div>
            `;
            return;
        }

        suministros.forEach(sum => {
            const item = document.createElement('div');
            item.className = 'timeline-item';
            item.innerHTML = `
                <div class="timeline-date">${formatDate(sum.fecha)}</div>
                <div style="color: #43e97b; font-weight: 600; font-size: 0.95rem; margin-bottom: 6px;">
                    ${sum.accesorio} (x${sum.cantidad})
                </div>
                <div class="timeline-content">${sum.observaciones || 'Sin observaciones'}</div>
                <div class="timeline-actions">
                    <button class="btn btn-danger btn-small" onclick="deleteSuministro(${sum.id})">🗑️ Eliminar</button>
                </div>
            `;
            suministrosList.appendChild(item);
        });
    }

    addSuministroBtn.addEventListener('click', () => {
        document.getElementById('suministroFecha').value = new Date().toISOString().split('T')[0];
        document.getElementById('suministroAccesorio').value = '';
        document.getElementById('suministroCantidad').value = '1';
        document.getElementById('suministroObservaciones').value = '';
        suministroModal.classList.remove('hidden');
    });

    document.getElementById('saveSuministroBtn').addEventListener('click', async () => {
        const fecha = document.getElementById('suministroFecha').value;
        const accesorioSelect = document.getElementById('suministroAccesorio');
        const accesorio = accesorioSelect.value;
        const cantidad = parseInt(document.getElementById('suministroCantidad').value);
        const observaciones = document.getElementById('suministroObservaciones').value.trim();

        if (!fecha || !accesorio || !cantidad) {
            alert('Por favor completa los campos requeridos');
            return;
        }

        await addRecord('suministros', {
            estacionId: currentStationId,
            fecha: fecha,
            accesorio: accesorio,
            cantidad: cantidad,
            observaciones: observaciones,
            createdAt: new Date().toISOString()
        });

        suministroModal.classList.add('hidden');
        await loadSuministros();
        await renderStations();
    });

    document.getElementById('cancelSuministroBtn').addEventListener('click', () => {
        suministroModal.classList.add('hidden');
    });

    window.deleteSuministro = async (id) => {
        if (confirm('¿Eliminar este suministro?')) {
            await deleteRecord('suministros', id);
            await loadSuministros();
            await renderStations();
        }
    };

    // === CERTIFICADOS (CÁMARA) ===
    async function loadCertificados() {
        const certificados = await getRecordsByStation('certificados', currentStationId);
        certificadosList.innerHTML = '';

        if (certificados.length === 0) {
            certificadosList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📜</div>
                    <div>No hay certificados registrados</div>
                </div>
            `;
            return;
        }

        certificados.forEach(cert => {
            const item = document.createElement('div');
            item.className = 'timeline-item';
            item.innerHTML = `
                <div class="timeline-date">${formatDate(cert.fecha)}</div>
                <div style="margin-bottom: 10px;">
                    <img src="${cert.photo}" style="width: 100px; height: 100px; object-fit: cover; border-radius: 8px; cursor: pointer; border: 1px solid rgba(255,255,255,0.1);" onclick="showImage('${cert.photo}')">
                </div>
                <div class="timeline-actions">
                    <button class="btn btn-secondary btn-small" onclick="showImage('${cert.photo}')">📄 Ver</button>
                    <button class="btn btn-danger btn-small" onclick="deleteCertificado(${cert.id})">🗑️ Eliminar</button>
                </div>
            `;
            certificadosList.appendChild(item);
        });
    }

    addCertBtn.addEventListener('click', () => {
        document.getElementById('certFecha').value = new Date().toISOString().split('T')[0];
        resetCertModal();
        certificadoModal.classList.remove('hidden');
    });

    function resetCertModal() {
        stopCamera();
        capturedPhoto = null;
        certCapturedImg.src = '';
        certCapturedImg.classList.add('hidden');
        certCameraContainer.classList.add('hidden');
        startCertCameraBtn.classList.remove('hidden');
        captureCertBtn.classList.add('hidden');
        retakeCertBtn.classList.add('hidden');
    }

    async function startCamera() {
        try {
            cameraStream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: 'environment' } 
            });
            certVideo.srcObject = cameraStream;
            certCameraContainer.classList.remove('hidden');
            startCertCameraBtn.classList.add('hidden');
            captureCertBtn.classList.remove('hidden');
        } catch (err) {
            console.error('Error al acceder a la cámara:', err);
            alert('No se pudo acceder a la cámara. Revisa los permisos.');
        }
    }

    function stopCamera() {
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
            cameraStream = null;
        }
    }

    function capturePhoto() {
        const canvas = document.createElement('canvas');
        canvas.width = certVideo.videoWidth;
        canvas.height = certVideo.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(certVideo, 0, 0);
        
        // Comprimir imagen (JPEG, calidad 0.6 para no saturar DB)
        capturedPhoto = canvas.toDataURL('image/jpeg', 0.6);
        
        certCapturedImg.src = capturedPhoto;
        certCapturedImg.classList.remove('hidden');
        certCameraContainer.classList.add('hidden');
        
        captureCertBtn.classList.add('hidden');
        retakeCertBtn.classList.remove('hidden');
        
        stopCamera();
    }

    startCertCameraBtn.addEventListener('click', startCamera);
    captureCertBtn.addEventListener('click', capturePhoto);
    retakeCertBtn.addEventListener('click', () => {
        resetCertModal();
        startCamera();
    });

    saveCertBtn.addEventListener('click', async () => {
        const fecha = document.getElementById('certFecha').value;
        
        if (!fecha || !capturedPhoto) {
            alert('Por favor selecciona una fecha y toma una foto');
            return;
        }

        await addRecord('certificados', {
            estacionId: currentStationId,
            fecha: fecha,
            photo: capturedPhoto,
            createdAt: new Date().toISOString()
        });

        certificadoModal.classList.add('hidden');
        resetCertModal();
        await loadCertificados();
        await renderStations();
    });

    cancelCertBtn.addEventListener('click', () => {
        stopCamera();
        certificadoModal.classList.add('hidden');
    });

    window.deleteCertificado = async (id) => {
        if (confirm('¿Eliminar este certificado?')) {
            await deleteRecord('certificados', id);
            await loadCertificados();
            await renderStations();
        }
    };

    // === VISOR DE IMAGEN ===
    window.showImage = (src) => {
        fullSizeImage.src = src;
        imageViewerModal.classList.remove('hidden');
    };

    closeImageViewer.addEventListener('click', () => {
        imageViewerModal.classList.add('hidden');
        fullSizeImage.src = '';
    });

    imageViewerModal.addEventListener('click', (e) => {
        if (e.target === imageViewerModal) {
            imageViewerModal.classList.add('hidden');
            fullSizeImage.src = '';
        }
    });

    // === UTILIDADES ===
    function formatDate(dateStr) {
        const date = new Date(dateStr + 'T00:00:00');
        return date.toLocaleDateString('es-ES', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    // === INICIALIZACIÓN ===
    initDB().then(() => {
        console.log('Base de datos inicializada');
        renderStations();
    }).catch(err => {
        console.error('Error inicializando DB:', err);
        alert('Error al inicializar la base de datos');
    });
});
