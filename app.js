document.addEventListener('DOMContentLoaded', () => {
    // === INDEXEDDB PARA IMÁGENES Y EXCEL ===
    let imageDB = null;
    const DB_NAME = 'EquiposImageDB';
    const DB_VERSION = 2; // Incrementar versión para agregar store
    const STORE_NAME = 'images';
    const EXCEL_STORE = 'excelData';

    function initImageDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                imageDB = request.result;
                resolve(imageDB);
            };
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains(EXCEL_STORE)) {
                    db.createObjectStore(EXCEL_STORE, { keyPath: 'id' });
                }
            };
        });
    }

    // === VARIABLES PARA MÚLTIPLES HOJAS ===
    let globalAllSheetsData = {}; // Datos de todas las hojas
    let globalAllSheetsHeaders = {}; // Headers de todas las hojas
    let globalSheetNames = []; // Nombres de todas las hojas
    let globalCurrentSheetName = ''; // Hoja actualmente seleccionada

    // === FUNCIONES PARA GUARDAR/CARGAR EXCEL ===
    async function saveExcelToDB() {
        if (!imageDB) await initImageDB();

        // Guardar datos actuales en el objeto de todas las hojas
        if (globalCurrentSheetName) {
            globalAllSheetsData[globalCurrentSheetName] = globalDataRaw;
            globalAllSheetsHeaders[globalCurrentSheetName] = globalHeaders;
        }

        const excelData = {
            id: 'currentExcel',
            allSheetsData: globalAllSheetsData,
            allSheetsHeaders: globalAllSheetsHeaders,
            sheetNames: globalSheetNames,
            currentSheetName: globalCurrentSheetName,
            // Mantener compatibilidad con versión anterior
            data: globalDataRaw,
            headers: globalHeaders,
            sheetName: globalCurrentSheetName,
            fileName: exportFileName.value,
            savedAt: new Date().toISOString()
        };

        return new Promise((resolve, reject) => {
            try {
                const tx = imageDB.transaction(EXCEL_STORE, 'readwrite');
                const store = tx.objectStore(EXCEL_STORE);
                store.put(excelData);
                tx.oncomplete = () => {
                    console.log('Excel guardado en IndexedDB (hoja:', globalCurrentSheetName, ')');
                    resolve();
                };
                tx.onerror = () => reject(tx.error);
            } catch (err) {
                reject(err);
            }
        });
    }

    async function loadExcelFromDB() {
        if (!imageDB) await initImageDB();

        return new Promise((resolve) => {
            try {
                const tx = imageDB.transaction(EXCEL_STORE, 'readonly');
                const store = tx.objectStore(EXCEL_STORE);
                const request = store.get('currentExcel');
                request.onsuccess = () => resolve(request.result || null);
                request.onerror = () => resolve(null);
            } catch (err) {
                resolve(null);
            }
        });
    }

    async function clearExcelFromDB() {
        if (!imageDB) await initImageDB();

        return new Promise((resolve, reject) => {
            try {
                const tx = imageDB.transaction(EXCEL_STORE, 'readwrite');
                const store = tx.objectStore(EXCEL_STORE);
                store.delete('currentExcel');
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            } catch (err) {
                reject(err);
            }
        });
    }

    // Comprimir imagen antes de guardar
    function compressImage(dataUrl, maxSize = 100000) {
        return new Promise((resolve) => {
            // Si ya es pequeña, retornar
            if (dataUrl.length < maxSize) {
                resolve(dataUrl);
                return;
            }

            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // Reducir tamaño si es muy grande
                const maxDim = 600;
                if (width > maxDim || height > maxDim) {
                    const ratio = Math.min(maxDim / width, maxDim / height);
                    width = Math.round(width * ratio);
                    height = Math.round(height * ratio);
                }

                canvas.width = width;
                canvas.height = height;
                canvas.getContext('2d').drawImage(img, 0, 0, width, height);

                // Comprimir más agresivamente
                resolve(canvas.toDataURL('image/jpeg', 0.4));
            };
            img.onerror = () => resolve(dataUrl);
            img.src = dataUrl;
        });
    }

    async function saveImageToDB(id, dataUrl) {
        if (!imageDB) {
            await initImageDB();
        }

        // Comprimir antes de guardar
        const compressed = await compressImage(dataUrl);

        return new Promise((resolve, reject) => {
            try {
                const tx = imageDB.transaction(STORE_NAME, 'readwrite');
                const store = tx.objectStore(STORE_NAME);
                const request = store.put({ id, dataUrl: compressed });

                request.onsuccess = () => resolve();
                request.onerror = (e) => {
                    console.error('Error guardando en IndexedDB:', e);
                    reject(e.target.error);
                };

                tx.onerror = (e) => {
                    console.error('Error transacción:', e);
                    reject(tx.error);
                };
            } catch (err) {
                console.error('Error general:', err);
                reject(err);
            }
        });
    }

    function getImageFromDB(id) {
        return new Promise((resolve, reject) => {
            if (!imageDB) return resolve(null);
            const tx = imageDB.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result?.dataUrl || null);
            request.onerror = () => resolve(null);
        });
    }

    function getAllImagesFromDB() {
        return new Promise((resolve, reject) => {
            if (!imageDB) return resolve([]);
            const tx = imageDB.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => resolve([]);
        });
    }

    // Elementos del selector de hojas
    const sheetSelectorContainer = document.getElementById('sheetSelectorContainer');
    const sheetSelector = document.getElementById('sheetSelector');
    const sheetInfo = document.getElementById('sheetInfo');

    // Función para poblar el selector de hojas
    function populateSheetSelector(sheetNames, currentSheet) {
        sheetSelector.innerHTML = '';
        sheetNames.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            if (name === currentSheet) option.selected = true;
            sheetSelector.appendChild(option);
        });
        sheetInfo.textContent = `${sheetNames.length} hoja(s) disponible(s)`;
        sheetSelectorContainer.classList.remove('hidden');
    }

    // Función para cargar datos de una hoja específica
    function loadSheetData(sheetName) {
        // Guardar datos actuales antes de cambiar
        if (globalCurrentSheetName && globalDataRaw.length > 0) {
            globalAllSheetsData[globalCurrentSheetName] = globalDataRaw;
            globalAllSheetsHeaders[globalCurrentSheetName] = globalHeaders;
        }

        globalCurrentSheetName = sheetName;
        globalDataRaw = globalAllSheetsData[sheetName] || [];
        globalHeaders = globalAllSheetsHeaders[sheetName] || [];

        renderTable();
        populateLocations();
        editPanel.classList.add('hidden');

        console.log('Hoja cargada:', sheetName, '- Filas:', globalDataRaw.length);
    }

    // Evento cambio de hoja
    sheetSelector.addEventListener('change', async (e) => {
        const selectedSheet = e.target.value;
        if (selectedSheet) {
            loadSheetData(selectedSheet);
            await saveExcelToDB();
        }
    });

    // Inicializar DB y cargar Excel guardado
    initImageDB().then(async () => {
        console.log('ImageDB lista');

        // Intentar cargar Excel guardado
        const savedExcel = await loadExcelFromDB();
        if (savedExcel && savedExcel.data && savedExcel.data.length > 0) {
            // Cargar datos de múltiples hojas si existen
            if (savedExcel.allSheetsData && savedExcel.sheetNames) {
                globalAllSheetsData = savedExcel.allSheetsData;
                globalAllSheetsHeaders = savedExcel.allSheetsHeaders || {};
                globalSheetNames = savedExcel.sheetNames;
                globalCurrentSheetName = savedExcel.currentSheetName || savedExcel.sheetNames[0];

                // Cargar datos de la hoja actual
                globalDataRaw = globalAllSheetsData[globalCurrentSheetName] || savedExcel.data;
                globalHeaders = globalAllSheetsHeaders[globalCurrentSheetName] || savedExcel.headers;

                // Poblar selector de hojas
                populateSheetSelector(globalSheetNames, globalCurrentSheetName);
            } else {
                // Compatibilidad con versión anterior (una sola hoja)
                globalDataRaw = savedExcel.data;
                globalHeaders = savedExcel.headers;
                globalCurrentSheetName = savedExcel.sheetName || 'Sheet1';
                globalSheetNames = [globalCurrentSheetName];
                globalAllSheetsData[globalCurrentSheetName] = globalDataRaw;
                globalAllSheetsHeaders[globalCurrentSheetName] = globalHeaders;

                populateSheetSelector(globalSheetNames, globalCurrentSheetName);
            }

            globalFirstSheetName = globalCurrentSheetName;

            renderTable();
            populateLocations();

            resultsArea.classList.remove('hidden');
            exportBtn.disabled = false;
            registerSerieBtn.classList.remove('disabled');
            verifySerieBtn.classList.remove('disabled');
            clearExcelBtn.classList.remove('hidden');
            exportNameContainer.classList.remove('hidden');

            if (savedExcel.fileName) {
                exportFileName.value = savedExcel.fileName;
            }

            const fecha = new Date(savedExcel.savedAt).toLocaleString('es-ES');
            fileLabel.textContent = `📂 Datos cargados (guardado: ${fecha})`;
            fileLabel.style.color = '#00ff88';

            console.log('Excel cargado desde IndexedDB:', globalDataRaw.length, 'filas en hoja:', globalCurrentSheetName);
        }
    }).catch(console.error);

    // --- BACKUP DE IMÁGENES ---
    const exportImagesBtn = document.getElementById('exportImagesBtn');
    const importImagesInput = document.getElementById('importImagesInput');
    const backupStatus = document.getElementById('backupStatus');

    function showBackupStatus(msg, isError = false) {
        backupStatus.textContent = msg;
        backupStatus.style.color = isError ? '#ff6464' : '#00ff88';
        backupStatus.classList.remove('hidden');
        setTimeout(() => backupStatus.classList.add('hidden'), 4000);
    }

    exportImagesBtn.addEventListener('click', async () => {
        try {
            exportImagesBtn.disabled = true;
            exportImagesBtn.textContent = '⏳ Exportando...';

            const images = await getAllImagesFromDB();

            if (images.length === 0) {
                showBackupStatus('No hay imágenes para exportar', true);
                return;
            }

            const zip = new JSZip();

            images.forEach(img => {
                // Convertir dataUrl a blob
                const base64 = img.dataUrl.split(',')[1];
                zip.file(img.id, base64, { base64: true });
            });

            const content = await zip.generateAsync({ type: 'blob' });

            // Descargar
            const link = document.createElement('a');
            link.href = URL.createObjectURL(content);
            link.download = `backup_imagenes_${new Date().toISOString().slice(0, 10)}.zip`;
            link.click();

            showBackupStatus(`✅ ${images.length} imágenes exportadas`);

        } catch (err) {
            console.error(err);
            showBackupStatus('Error al exportar', true);
        } finally {
            exportImagesBtn.disabled = false;
            exportImagesBtn.textContent = '⬇️ Exportar Imágenes';
        }
    });

    importImagesInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            showBackupStatus('⏳ Importando...');

            const zip = await JSZip.loadAsync(file);
            let count = 0;

            for (const [filename, zipEntry] of Object.entries(zip.files)) {
                if (!zipEntry.dir) {
                    const base64 = await zipEntry.async('base64');
                    const dataUrl = `data:image/jpeg;base64,${base64}`;
                    await saveImageToDB(filename, dataUrl);
                    count++;
                }
            }

            showBackupStatus(`✅ ${count} imágenes importadas`);

        } catch (err) {
            console.error(err);
            showBackupStatus('Error al importar', true);
        }

        importImagesInput.value = '';
    });

    // Elementos principales
    const fileInput = document.getElementById('fileInput');
    const fileLabel = document.getElementById('fileLabel');
    const processBtn = document.getElementById('processBtn');
    const loadingDiv = document.getElementById('loading');
    const resultsArea = document.getElementById('resultsArea');
    const exportBtn = document.getElementById('exportBtn');
    const clearExcelBtn = document.getElementById('clearExcelBtn');
    const exportNameContainer = document.getElementById('exportNameContainer');
    const exportFileName = document.getElementById('exportFileName');

    // Variables Globales
    let globalDataRaw = [];
    let globalHeaders = [];
    let globalWorkbook = null;
    let globalFirstSheetName = "";

    // Elementos de Edición
    const editPanel = document.getElementById('editPanel');
    const matchInfo = document.getElementById('matchInfo');
    const equipoNombre = document.getElementById('equipoNombre');
    const editSerieInput = document.getElementById('editSerieInput');
    const editLocationSelect = document.getElementById('editLocationSelect');
    const dateInput = document.getElementById('dateInput');
    const editObservaciones = document.getElementById('editObservaciones');
    const observacionesContainer = document.getElementById('observacionesContainer');
    const addObsBtn = document.getElementById('addObsBtn');
    const updateBtn = document.getElementById('updateBtn');
    const editImagesGallery = document.getElementById('editImagesGallery');
    const noImageMsg = document.getElementById('noImageMsg');
    const editCameraContainer = document.getElementById('editCameraContainer');
    const editCameraVideo = document.getElementById('editCameraVideo');
    const addImageBtn = document.getElementById('addImageBtn');
    const captureEditPhotoBtn = document.getElementById('captureEditPhotoBtn');
    const cancelEditCameraBtn = document.getElementById('cancelEditCameraBtn');
    let currentMatchIndex = -1;
    let editCameraStream = null;

    // Elementos de Registro
    const registerSerieBtn = document.getElementById('registerSerieBtn');
    const registerModal = document.getElementById('registerModal');
    const regSerieInput = document.getElementById('regSerieInput');
    const regLocationSelect = document.getElementById('regLocationSelect');
    const regObservaciones = document.getElementById('regObservaciones');
    const confirmRegBtn = document.getElementById('confirmRegBtn');
    const cancelRegBtn = document.getElementById('cancelRegBtn');
    const regFeedback = document.getElementById('regFeedback');

    // Elementos de cámara para registro
    const cameraContainer = document.getElementById('cameraContainer');
    const cameraVideo = document.getElementById('cameraVideo');
    const capturedImage = document.getElementById('capturedImage');
    const startCameraBtn = document.getElementById('startCameraBtn');
    const capturePhotoBtn = document.getElementById('capturePhotoBtn');
    const retakePhotoBtn = document.getElementById('retakePhotoBtn');
    const deletePhotoBtn = document.getElementById('deletPhotoBtn');
    let cameraStream = null;
    let capturedImageData = null;

    // QR Elements
    const startScanBtn = document.getElementById('startScanBtn');
    const stopScanBtn = document.getElementById('stopScanBtn');
    const readerDiv = document.getElementById('reader');
    const scanResult = document.getElementById('scanResult');
    let html5QrcodeScanner = null;

    // Verify Serie Elements
    const verifySerieBtn = document.getElementById('verifySerieBtn');
    const verifySerieModal = document.getElementById('verifySerieModal');
    const verifySerieInput = document.getElementById('verifySerieInput');
    const confirmVerifyBtn = document.getElementById('confirmVerifyBtn');
    const cancelVerifyBtn = document.getElementById('cancelVerifyBtn');
    const verifyFeedback = document.getElementById('verifyFeedback');

    // Image Viewer Elements
    const imageViewerModal = document.getElementById('imageViewerModal');
    const fullSizeImage = document.getElementById('fullSizeImage');
    const closeImageViewer = document.getElementById('closeImageViewer');

    function showImageViewer(src) {
        if (!src) return;
        fullSizeImage.src = src;
        imageViewerModal.classList.remove('hidden');
    }

    function hideImageViewer() {
        imageViewerModal.classList.add('hidden');
        fullSizeImage.src = '';
    }

    imageViewerModal.addEventListener('click', hideImageViewer);
    closeImageViewer.addEventListener('click', hideImageViewer);

    // --- ARCHIVO ---
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            const file = e.target.files[0];
            fileLabel.textContent = file.name;
            fileLabel.style.color = '#00d9ff';

            // Sugerir nombre de archivo basado en el original (sin extensión)
            const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
            exportFileName.value = nameWithoutExt;
            exportNameContainer.classList.remove('hidden');
        }
    });

    processBtn.addEventListener('click', () => {
        const file = fileInput.files[0];
        if (!file) {
            alert('Selecciona un archivo Excel primero.');
            return;
        }

        loadingDiv.classList.remove('hidden');
        processBtn.disabled = true;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                globalWorkbook = XLSX.read(data, { type: 'array', cellDates: true });

                // Cargar TODAS las hojas del Excel
                globalSheetNames = globalWorkbook.SheetNames;
                globalAllSheetsData = {};
                globalAllSheetsHeaders = {};

                console.log('Hojas encontradas:', globalSheetNames);

                // Procesar cada hoja
                globalSheetNames.forEach(sheetName => {
                    const worksheet = globalWorkbook.Sheets[sheetName];
                    let rawSheetData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

                    if (rawSheetData.length > 0) {
                        // 1. Identificar headers válidos (que no sean __EMPTY)
                        const allKeys = Object.keys(rawSheetData[0]);
                        const validHeaders = allKeys.filter(h => !h.startsWith('__EMPTY'));
                        globalAllSheetsHeaders[sheetName] = validHeaders;

                        // 2. Limpiar datos: eliminar filas donde todos los valores en las columnas válidas sean vacíos
                        const cleanedData = rawSheetData.filter(row => {
                            return validHeaders.some(h => {
                                const val = row[h];
                                return val !== "" && val !== null && val !== undefined;
                            });
                        });

                        globalAllSheetsData[sheetName] = cleanedData;
                    } else {
                        globalAllSheetsHeaders[sheetName] = [];
                        globalAllSheetsData[sheetName] = [];
                    }
                });

                // Seleccionar la primera hoja por defecto
                globalCurrentSheetName = globalSheetNames[0];
                globalFirstSheetName = globalCurrentSheetName;
                globalDataRaw = globalAllSheetsData[globalCurrentSheetName];
                globalHeaders = globalAllSheetsHeaders[globalCurrentSheetName];

                console.log("Hoja actual:", globalCurrentSheetName, "- Headers:", globalHeaders);

                // Poblar selector de hojas
                populateSheetSelector(globalSheetNames, globalCurrentSheetName);

                renderTable();
                populateLocations();

                // Guardar en IndexedDB automáticamente
                await saveExcelToDB();
                fileLabel.textContent = `✅ ${file.name} (guardado)`;
                fileLabel.style.color = '#00ff88';

                loadingDiv.classList.add('hidden');
                resultsArea.classList.remove('hidden');
                exportBtn.disabled = false;
                registerSerieBtn.classList.remove('disabled');
                verifySerieBtn.classList.remove('disabled');
                clearExcelBtn.classList.remove('hidden');

            } catch (error) {
                console.error(error);
                alert('Error al leer el archivo.');
                loadingDiv.classList.add('hidden');
            }
            processBtn.disabled = false;
        };
        reader.readAsArrayBuffer(file);
    });

    // --- LIMPIAR DATOS GUARDADOS ---
    clearExcelBtn.addEventListener('click', async () => {
        if (confirm('¿Borrar datos guardados? Podrás cargar un nuevo archivo.')) {
            await clearExcelFromDB();
            globalDataRaw = [];
            globalHeaders = [];
            globalFirstSheetName = '';

            // Limpiar variables de múltiples hojas
            globalAllSheetsData = {};
            globalAllSheetsHeaders = {};
            globalSheetNames = [];
            globalCurrentSheetName = '';

            resultsArea.classList.add('hidden');
            exportBtn.disabled = true;
            registerSerieBtn.classList.add('disabled');
            verifySerieBtn.classList.add('disabled');
            clearExcelBtn.classList.add('hidden');
            sheetSelectorContainer.classList.add('hidden');
            fileLabel.textContent = 'Haz clic para seleccionar archivo';
            fileLabel.style.color = '#aaa';
            fileInput.value = '';
            exportFileName.value = '';
            exportNameContainer.classList.add('hidden');

            alert('Datos borrados. Puedes cargar un nuevo archivo.');
        }
    });

    // --- EXPORTAR ---
    exportBtn.addEventListener('click', () => {
        if (globalSheetNames.length === 0) return;

        // Asegurar que la hoja actual esté actualizada en globalAllSheetsData
        if (globalCurrentSheetName) {
            globalAllSheetsData[globalCurrentSheetName] = globalDataRaw;
        }

        try {
            const newWb = XLSX.utils.book_new();

            // Agregar cada hoja al nuevo libro
            globalSheetNames.forEach(sheetName => {
                let sheetData = globalAllSheetsData[sheetName] || [];
                
                // AGREGAR COLUMNAS DINÁMICAS SI NO EXISTEN
                // Si alguna fila tiene nuevas propiedades que no están en las columnas originales,
                // agregarlas automáticamente
                if (sheetData.length > 0) {
                    // Obtener todas las claves únicas de todas las filas
                    const allKeys = new Set();
                    sheetData.forEach(row => {
                        Object.keys(row).forEach(key => allKeys.add(key));
                    });
                    
                    // Asegurar que todas las filas tengan todas las columnas (agregar vacías si faltan)
                    sheetData = sheetData.map(row => {
                        const completeRow = {};
                        allKeys.forEach(key => {
                            completeRow[key] = row[key] !== undefined ? row[key] : '';
                        });
                        return completeRow;
                    });
                }
                
                const newSheet = XLSX.utils.json_to_sheet(sheetData);
                XLSX.utils.book_append_sheet(newWb, newSheet, sheetName);
            });

            // Obtener nombre del archivo y sanitizar
            let fileName = exportFileName.value.trim();
            if (!fileName) fileName = "Equipos_Actualizados";

            // Sanitizar: quitar caracteres no deseados
            fileName = fileName.replace(/[\\\/:*?"<>|]/g, "_");

            XLSX.writeFile(newWb, `${fileName}.xlsx`);
            console.log("Exportación multi-hoja completada con columnas dinámicas:", fileName);
        } catch (err) {
            console.error(err);
            alert("Error al exportar.");
        }
    });

    // --- HELPERS ---
    function getColumnKey(name) {
        // Normalizar: quitar tildes y convertir a minúsculas
        const normalize = str => str.toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // Quita tildes

        const searchTerm = normalize(name);

        return globalHeaders.find(h => normalize(h).includes(searchTerm)) || null;
    }

    function formatDate(val) {
        if (val instanceof Date) return val.toLocaleDateString('es-ES');
        if (typeof val === 'string') {
            const d = new Date(val);
            if (!isNaN(d.getTime())) return d.toLocaleDateString('es-ES');
        }
        return val;
    }

    function formatDateForInput(val) {
        if (!val) return "";
        let d = val instanceof Date ? val : new Date(val);
        if (isNaN(d.getTime())) return "";
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function renderTable(filterSerieValue = '', filterMagnitudValue = '') {
        const thead = document.querySelector('#tableMain thead');
        const tbody = document.querySelector('#tableMain tbody');
        thead.innerHTML = '';
        tbody.innerHTML = '';

        if (globalDataRaw.length === 0) return;

        const headerRow = document.createElement('tr');
        globalHeaders.forEach(h => {
            const th = document.createElement('th');
            th.textContent = h;
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);

        const serieKey = getColumnKey('serie');
        const magnitudKey = getColumnKey('magnitud');
        const normalize = s => String(s || '').trim().toUpperCase();
        const filterSerieNorm = normalize(filterSerieValue);
        const filterMagnitudNorm = normalize(filterMagnitudValue);

        globalDataRaw.forEach((row, index) => {
            // Filtrar por serie
            if (filterSerieValue && serieKey) {
                const serieVal = normalize(row[serieKey]);
                if (!serieVal.includes(filterSerieNorm)) return;
            }

            // Filtrar por magnitud
            if (filterMagnitudValue && magnitudKey) {
                const magnitudVal = normalize(row[magnitudKey]);
                if (!magnitudVal.includes(filterMagnitudNorm)) return;
            }

            const tr = document.createElement('tr');
            tr.style.cursor = 'pointer';
            tr.addEventListener('click', () => openEditFromTable(index));

            globalHeaders.forEach(h => {
                const td = document.createElement('td');
                let val = row[h];
                if (val instanceof Date) val = formatDate(val);
                td.textContent = val !== undefined && val !== null ? val : '';
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
    }

    // Abrir edición desde la tabla
    async function openEditFromTable(index) {
        currentMatchIndex = index;
        const row = globalDataRaw[index];

        const idKey = globalHeaders[0];
        const serieKey = getColumnKey('serie');
        const equipoKey = getColumnKey('equipo');
        const locKey = getColumnKey('ubicacion') || getColumnKey('tecnica');

        scanResult.textContent = `📝 Editando fila ${index + 2}`;
        scanResult.className = 'feedback success';
        scanResult.classList.remove('hidden');

        matchInfo.innerHTML = `<strong>ID:</strong> ${row[idKey] || 'N/A'} | <strong>Serie:</strong> ${serieKey ? (row[serieKey] || 'Sin serie') : 'N/A'}`;

        equipoNombre.textContent = equipoKey ? (row[equipoKey] || 'Sin nombre') : 'N/A';

        // Cargar serie actual
        if (serieKey) {
            editSerieInput.value = row[serieKey] || '';
        } else {
            editSerieInput.value = '';
        }

        // Cargar todas las observaciones
        loadObservacionesForRow(row);

        // Cargar ubicación actual
        if (locKey && row[locKey]) {
            editLocationSelect.value = row[locKey];
        } else {
            editLocationSelect.value = '';
        }

        // Cargar galería de imágenes
        await loadImagesForRow(row);

        const dateKey = getColumnKey('calibracion') || getColumnKey('fecha');
        if (dateKey) {
            dateInput.value = formatDateForInput(row[dateKey]);
            dateInput.dataset.targetKey = dateKey;
        }

        editPanel.classList.remove('hidden');

        // Scroll al panel de edición
        editPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Evento filtro de tabla
    document.getElementById('filterSerieInput').addEventListener('input', function () {
        const filterMagnitud = document.getElementById('filterMagnitudInput').value;
        renderTable(this.value, filterMagnitud);
    });

    document.getElementById('filterMagnitudInput').addEventListener('input', function () {
        const filterSerie = document.getElementById('filterSerieInput').value;
        renderTable(filterSerie, this.value);
    });

    // --- CARGAR MÚLTIPLES IMÁGENES EN EDICIÓN ---
    function getImageColumns() {
        const normalize = str => str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return globalHeaders.filter(h => normalize(h).includes('imagen') || normalize(h).includes('foto'));
    }

    async function loadImagesForRow(row) {
        editImagesGallery.innerHTML = '';
        const imgCols = getImageColumns();
        let hasImages = false;

        for (const col of imgCols) {
            if (row[col]) {
                hasImages = true;
                const imgRef = row[col];

                const imgContainer = document.createElement('div');
                imgContainer.style.cssText = 'position:relative; width:calc(50% - 4px);';

                // Mostrar placeholder mientras carga
                imgContainer.innerHTML = `
                    <div style="width:100%; height:80px; background:rgba(255,255,255,0.05); border-radius:8px; display:flex; align-items:center; justify-content:center; color:#00d9ff; font-size:0.75rem;">Cargando...</div>
                    <small style="color:#888; font-size:0.7rem; display:block; text-align:center; margin-top:2px;">${imgRef}</small>
                `;
                editImagesGallery.appendChild(imgContainer);

                // Cargar imagen de forma asíncrona
                getImageFromDB(imgRef).then(dataUrl => {
                    if (dataUrl) {
                        imgContainer.innerHTML = `
                            <img src="${dataUrl}" style="width:100%; height:80px; object-fit:cover; border-radius:8px; border:2px solid #00ff88; cursor:pointer; transition:transform 0.2s;" loading="lazy">
                            <small style="color:#888; font-size:0.7rem; display:block; text-align:center; margin-top:2px;">${imgRef}</small>
                        `;
                        const img = imgContainer.querySelector('img');
                        img.onclick = () => showImageViewer(dataUrl);
                        img.onmouseover = () => img.style.transform = 'scale(1.05)';
                        img.onmouseout = () => img.style.transform = 'scale(1)';
                    } else {
                        imgContainer.innerHTML = `
                            <div style="width:100%; height:80px; background:rgba(255,255,255,0.05); border-radius:8px; display:flex; align-items:center; justify-content:center; color:#666; font-size:0.75rem;">No encontrada</div>
                            <small style="color:#888; font-size:0.7rem; display:block; text-align:center; margin-top:2px;">${imgRef}</small>
                        `;
                    }
                }).catch(() => {
                    imgContainer.innerHTML = `
                        <div style="width:100%; height:80px; background:rgba(255,100,100,0.1); border-radius:8px; display:flex; align-items:center; justify-content:center; color:#ff6464; font-size:0.75rem;">Error</div>
                        <small style="color:#888; font-size:0.7rem; display:block; text-align:center; margin-top:2px;">${imgRef}</small>
                    `;
                });
            }
        }

        if (hasImages) {
            noImageMsg.classList.add('hidden');
        } else {
            noImageMsg.classList.remove('hidden');
        }
    }

    function stopEditCamera() {
        if (editCameraStream) {
            editCameraStream.getTracks().forEach(track => track.stop());
            editCameraStream = null;
        }
        editCameraContainer.classList.add('hidden');
        captureEditPhotoBtn.classList.add('hidden');
        cancelEditCameraBtn.classList.add('hidden');
        addImageBtn.classList.remove('hidden');
    }

    addImageBtn.addEventListener('click', async () => {
        if (currentMatchIndex === -1) {
            alert('Primero selecciona un equipo');
            return;
        }

        // Asegurar que no hay otra cámara activa
        stopEditCamera();

        addImageBtn.textContent = '⏳ Abriendo...';
        addImageBtn.disabled = true;

        try {
            editCameraStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } }
            });

            editCameraVideo.srcObject = editCameraStream;
            await editCameraVideo.play();
            editCameraContainer.classList.remove('hidden');
            addImageBtn.classList.add('hidden');
            captureEditPhotoBtn.classList.remove('hidden');
            cancelEditCameraBtn.classList.remove('hidden');
        } catch (e) {
            console.error('Error cámara:', e);
            alert('No se pudo acceder a la cámara: ' + e.message);
            addImageBtn.classList.remove('hidden');
        }

        addImageBtn.textContent = '📷 Agregar Foto';
        addImageBtn.disabled = false;
    });

    cancelEditCameraBtn.addEventListener('click', stopEditCamera);

    captureEditPhotoBtn.addEventListener('click', async () => {
        // Reducir resolución para evitar problemas de memoria
        const maxWidth = 800;
        const maxHeight = 600;

        let width = editCameraVideo.videoWidth;
        let height = editCameraVideo.videoHeight;

        // Escalar si es muy grande
        if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(editCameraVideo, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.5); // Más compresión
        stopEditCamera();

        // Determinar nombre de archivo y columna
        const row = globalDataRaw[currentMatchIndex];
        const serieKey = getColumnKey('serie');
        const serieVal = serieKey ? row[serieKey] : `equipo_${currentMatchIndex}`;

        const imgCols = getImageColumns();
        let colIndex = 1;

        // Buscar siguiente columna disponible
        for (const col of imgCols) {
            if (!row[col]) break;
            colIndex++;
        }

        const newColName = colIndex === 1 ? 'Imagen' : `Imagen ${colIndex}`;
        const imgFilename = `${String(serieVal).replace(/[^a-zA-Z0-9]/g, '_')}_${colIndex}.jpg`;

        // Crear columna si no existe
        if (!globalHeaders.includes(newColName)) {
            globalHeaders.push(newColName);
            globalDataRaw.forEach(r => { if (!(newColName in r)) r[newColName] = ''; });
        }

        // Guardar referencia y en IndexedDB
        globalDataRaw[currentMatchIndex][newColName] = imgFilename;

        try {
            await saveImageToDB(imgFilename, dataUrl);
            downloadImage(dataUrl, imgFilename);
            await loadImagesForRow(globalDataRaw[currentMatchIndex]);
            console.log(`Imagen guardada: ${imgFilename}`);
        } catch (err) {
            console.error('Error guardando imagen:', err);
            // Aún así descargar la imagen
            downloadImage(dataUrl, imgFilename);
            alert('⚠️ No se pudo guardar en el navegador (memoria llena), pero la imagen se descargó a tu dispositivo.');
            await loadImagesForRow(globalDataRaw[currentMatchIndex]);
        }
    });

    // --- MÚLTIPLES OBSERVACIONES ---
    let obsFieldCount = 1;

    function getObsColumns() {
        // Buscar todas las columnas que contengan "observacion"
        const normalize = str => str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return globalHeaders.filter(h => normalize(h).includes('observacion'));
    }

    function resetObservacionesUI() {
        // Limpiar campos adicionales
        observacionesContainer.innerHTML = `
            <textarea id="editObservaciones" placeholder="Observación principal..." rows="2" 
                style="width:100%; padding:14px; border:1px solid rgba(255,255,255,0.1); border-radius:10px; background:rgba(0,0,0,0.3); color:#fff; font-size:1rem; resize:vertical; outline:none; margin-bottom:8px;"></textarea>
        `;
        obsFieldCount = 1;
    }

    function loadObservacionesForRow(row) {
        resetObservacionesUI();
        const obsCols = getObsColumns();

        // Cargar primera observación
        const mainTextarea = document.getElementById('editObservaciones');
        if (obsCols.length > 0 && row[obsCols[0]]) {
            mainTextarea.value = row[obsCols[0]] || '';
        } else {
            mainTextarea.value = '';
        }

        // Cargar observaciones adicionales existentes
        for (let i = 1; i < obsCols.length; i++) {
            if (row[obsCols[i]]) {
                addObservacionField(obsCols[i], row[obsCols[i]]);
            }
        }
    }

    function addObservacionField(colName = null, value = '') {
        obsFieldCount++;
        const fieldId = `editObs_${obsFieldCount}`;
        const label = colName || `Observaciones ${obsFieldCount}`;

        const div = document.createElement('div');
        div.style.marginBottom = '8px';
        div.innerHTML = `
            <small style="color:#888; font-size:0.75rem;">${label}</small>
            <textarea id="${fieldId}" data-colname="${colName || ''}" placeholder="Nueva observación..." rows="2" 
                style="width:100%; padding:12px; border:1px solid rgba(0,217,255,0.3); border-radius:10px; background:rgba(0,0,0,0.3); color:#fff; font-size:0.95rem; resize:vertical; outline:none;">${value}</textarea>
        `;
        observacionesContainer.appendChild(div);
        return fieldId;
    }

    addObsBtn.addEventListener('click', () => {
        if (currentMatchIndex === -1) {
            alert('Primero selecciona un equipo');
            return;
        }

        // Contar columnas de observaciones existentes
        const obsCols = getObsColumns();
        let maxNum = 1;

        // Buscar el número más alto existente
        obsCols.forEach(col => {
            const match = col.match(/(\d+)$/);
            if (match) {
                const num = parseInt(match[1]);
                if (num > maxNum) maxNum = num;
            }
        });

        const newColName = `Observaciones ${maxNum + 1}`;

        // Agregar columna a headers si no existe
        if (!globalHeaders.includes(newColName)) {
            globalHeaders.push(newColName);
            // Agregar columna vacía a todos los registros
            globalDataRaw.forEach(row => {
                if (!(newColName in row)) row[newColName] = '';
            });
        }

        addObservacionField(newColName, '');

        // Scroll al nuevo campo
        observacionesContainer.lastChild.scrollIntoView({ behavior: 'smooth' });
    });

    function populateLocations() {
        // Buscar columna que contenga "ubicacion" o "tecnica" o "location"
        const locKey = getColumnKey('ubicacion') || getColumnKey('tecnica') || getColumnKey('location');

        console.log("Headers disponibles:", globalHeaders);
        console.log("Columna ubicación encontrada:", locKey);

        if (!locKey) {
            console.warn("No se encontró columna de ubicación. Headers:", globalHeaders);
            regLocationSelect.innerHTML = '<option value="">-- No se encontró columna ubicación --</option>';
            editLocationSelect.innerHTML = '<option value="">-- No se encontró columna ubicación --</option>';
            return;
        }

        const locSet = new Set();
        globalDataRaw.forEach(row => {
            const val = row[locKey];
            if (val && String(val).trim()) {
                locSet.add(String(val).trim());
            }
        });

        console.log("Ubicaciones encontradas:", Array.from(locSet));

        const options = '<option value="">-- Seleccionar Ubicación --</option>' +
            Array.from(locSet).sort().map(loc => `<option value="${loc}">${loc}</option>`).join('');

        regLocationSelect.innerHTML = options;
        editLocationSelect.innerHTML = options;
    }

    // --- REGISTRO SERIE ---
    registerSerieBtn.addEventListener('click', () => {
        if (globalDataRaw.length === 0) {
            alert("⚠️ No hay datos cargados. Por favor, carga un archivo Excel primero para definir las columnas del inventario.");
            return;
        }
        resetCameraUI();
        regSerieInput.value = '';
        regLocationSelect.value = '';
        regObservaciones.value = '';
        regFeedback.classList.add('hidden');
        registerModal.classList.remove('hidden');
        regSerieInput.focus();
    });

    cancelRegBtn.addEventListener('click', () => {
        stopCamera();
        registerModal.classList.add('hidden');
    });

    // --- VERIFICAR POR SERIE ---
    verifySerieBtn.addEventListener('click', () => {
        if (globalDataRaw.length === 0) {
            alert("⚠️ No hay datos cargados. Por favor, carga un archivo Excel primero para realizar verificaciones.");
            return;
        }
        verifySerieInput.value = '';
        verifyFeedback.classList.add('hidden');
        verifySerieModal.classList.remove('hidden');
        verifySerieInput.focus();
    });

    cancelVerifyBtn.addEventListener('click', () => {
        verifySerieModal.classList.add('hidden');
    });

    confirmVerifyBtn.addEventListener('click', () => {
        const serieVal = verifySerieInput.value.trim().toUpperCase();

        if (!serieVal) {
            verifyFeedback.textContent = "⚠️ Ingresa un número de serie";
            verifyFeedback.className = 'feedback warning';
            verifyFeedback.classList.remove('hidden');
            return;
        }

        // Buscar en los datos usando la misma lógica que QR
        const normalize = s => String(s || '').trim().toUpperCase();
        const target = normalize(serieVal);

        const idKey = globalHeaders[0];
        const serieKey = getColumnKey('serie');

        // Buscar por ID o Serie
        let index = globalDataRaw.findIndex(row => normalize(row[idKey]) === target);
        if (index === -1 && serieKey) {
            index = globalDataRaw.findIndex(row => normalize(row[serieKey]) === target);
        }

        if (index !== -1) {
            // ENCONTRADO - Aplicar misma lógica que QR
            verifyFeedback.textContent = `✅ Serie encontrada en fila ${index + 2}`;
            verifyFeedback.className = 'feedback success';
            verifyFeedback.classList.remove('hidden');

            // Cerrar modal después de un momento
            setTimeout(() => {
                verifySerieModal.classList.add('hidden');
                // Llamar a findOrRegister para aplicar la lógica de verificación
                findOrRegister(serieVal);
            }, 800);
        } else {
            // NO ENCONTRADO
            verifyFeedback.textContent = `❌ Serie "${serieVal}" no encontrada en el archivo`;
            verifyFeedback.className = 'feedback error';
            verifyFeedback.classList.remove('hidden');
        }
    });

    // Permitir Enter para buscar
    verifySerieInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            confirmVerifyBtn.click();
        }
    });

    // --- AUTOCOMPLETE PARA VERIFICACIÓN ---
    const verifySuggestions = document.getElementById('verifySuggestions');

    verifySerieInput.addEventListener('input', () => {
        const searchVal = verifySerieInput.value.trim().toUpperCase();
        verifySuggestions.innerHTML = '';

        if (searchVal.length < 2) {
            verifySuggestions.classList.add('hidden');
            return;
        }

        const serieKey = getColumnKey('serie');
        const idKey = globalHeaders[0];
        const equipoKey = getColumnKey('equipo');
        const normalize = s => String(s || '').trim().toUpperCase();

        // Buscar coincidencias
        const matches = globalDataRaw.filter(row => {
            const serieVal = normalize(row[serieKey]);
            const idVal = normalize(row[idKey]);
            return serieVal.includes(searchVal) || idVal.includes(searchVal);
        }).slice(0, 10); // Limitar a 10 sugerencias

        if (matches.length > 0) {
            matches.forEach(row => {
                const div = document.createElement('div');
                div.className = 'suggestion-item';
                const sVal = row[serieKey] || 'Sin serie';
                const iVal = row[idKey] || 'N/A';
                const eVal = row[equipoKey] || 'Sin nombre';

                div.innerHTML = `
                    <strong>${sVal}</strong>
                    <small>${eVal} | ID: ${iVal}</small>
                `;

                div.addEventListener('click', () => {
                    verifySerieInput.value = sVal !== 'Sin serie' ? sVal : iVal;
                    verifySuggestions.classList.add('hidden');
                    confirmVerifyBtn.click();
                });

                verifySuggestions.appendChild(div);
            });
            verifySuggestions.classList.remove('hidden');
        } else {
            verifySuggestions.classList.add('hidden');
        }
    });

    // Cerrar sugerencias al hacer clic fuera
    document.addEventListener('click', (e) => {
        if (!verifySerieInput.contains(e.target) && !verifySuggestions.contains(e.target)) {
            verifySuggestions.classList.add('hidden');
        }
    });

    // --- CÁMARA PARA FOTO ---
    function resetCameraUI() {
        stopCamera();
        cameraContainer.classList.add('hidden');
        capturedImage.classList.add('hidden');
        startCameraBtn.classList.remove('hidden');
        capturePhotoBtn.classList.add('hidden');
        retakePhotoBtn.classList.add('hidden');
        deletePhotoBtn.classList.add('hidden');
        capturedImageData = null;
    }

    function stopCamera() {
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
            cameraStream = null;
        }
    }

    startCameraBtn.addEventListener('click', async () => {
        startCameraBtn.textContent = '⏳ Cargando...';
        startCameraBtn.disabled = true;

        try {
            cameraStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: "environment",
                    width: { ideal: 640 },
                    height: { ideal: 480 }
                }
            });

            cameraVideo.srcObject = cameraStream;
            cameraContainer.classList.remove('hidden');
            startCameraBtn.classList.add('hidden');
            capturePhotoBtn.classList.remove('hidden');

        } catch (e) {
            alert("No se pudo acceder a la cámara: " + e.message);
        }

        startCameraBtn.textContent = '📷 Abrir Cámara';
        startCameraBtn.disabled = false;
    });

    capturePhotoBtn.addEventListener('click', () => {
        // Reducir resolución para evitar problemas de memoria
        const maxWidth = 800;
        const maxHeight = 600;

        let width = cameraVideo.videoWidth;
        let height = cameraVideo.videoHeight;

        if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(cameraVideo, 0, 0, width, height);

        capturedImageData = canvas.toDataURL('image/jpeg', 0.5);
        capturedImage.src = capturedImageData;
        capturedImage.style.cursor = 'pointer';
        capturedImage.onclick = () => showImageViewer(capturedImageData);

        stopCamera();
        cameraContainer.classList.add('hidden');
        capturedImage.classList.remove('hidden');
        capturePhotoBtn.classList.add('hidden');
        retakePhotoBtn.classList.remove('hidden');
        deletePhotoBtn.classList.remove('hidden');
    });

    retakePhotoBtn.addEventListener('click', () => {
        capturedImage.classList.add('hidden');
        retakePhotoBtn.classList.add('hidden');
        deletePhotoBtn.classList.add('hidden');
        capturedImageData = null;
        startCameraBtn.click();
    });

    deletePhotoBtn.addEventListener('click', () => {
        capturedImage.classList.add('hidden');
        retakePhotoBtn.classList.add('hidden');
        deletePhotoBtn.classList.add('hidden');
        startCameraBtn.classList.remove('hidden');
        capturedImageData = null;
    });

    function downloadImage(dataUrl, filename) {
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = filename;
        link.click();
    }

    // Filtro en tiempo real mientras escribe la serie
    let foundExistingIndex = -1; // Para guardar el índice si existe

    regSerieInput.addEventListener('input', () => {
        const searchVal = regSerieInput.value.trim().toUpperCase();
        foundExistingIndex = -1;

        if (searchVal.length < 2) {
            regFeedback.classList.add('hidden');
            return;
        }

        const serieKey = getColumnKey('serie');
        if (!serieKey) return;

        const normalize = s => String(s || '').trim().toUpperCase();

        // Buscar coincidencia exacta
        const exactMatch = globalDataRaw.findIndex(row => normalize(row[serieKey]) === searchVal);

        if (exactMatch !== -1) {
            foundExistingIndex = exactMatch;
            const row = globalDataRaw[exactMatch];
            const locKey = getColumnKey('ubicacion') || getColumnKey('tecnica');
            const equipoKey = getColumnKey('equipo');
            const obsKey = getColumnKey('observacion');

            // Cargar datos existentes
            if (locKey && row[locKey]) {
                // Seleccionar la ubicación existente
                regLocationSelect.value = row[locKey];
            }
            if (obsKey) {
                regObservaciones.value = row[obsKey] || '';
            }

            regFeedback.innerHTML = `⚠️ Serie existe (fila ${exactMatch + 2})<br>Equipo: <strong>${equipoKey ? row[equipoKey] : 'N/A'}</strong><br>Puedes actualizar las observaciones`;
            regFeedback.className = 'feedback warning';
            regFeedback.classList.remove('hidden');
        } else {
            // Buscar coincidencias parciales
            const partialMatches = globalDataRaw.filter(row => normalize(row[serieKey]).includes(searchVal));

            if (partialMatches.length > 0 && partialMatches.length <= 5) {
                const matches = partialMatches.map(r => r[serieKey]).join(', ');
                regFeedback.textContent = `🔍 Similares: ${matches}`;
                regFeedback.className = 'feedback warning';
                regFeedback.classList.remove('hidden');
            } else if (partialMatches.length === 0) {
                regFeedback.textContent = `✅ Serie disponible para registrar`;
                regFeedback.className = 'feedback success';
                regFeedback.classList.remove('hidden');
            } else {
                regFeedback.classList.add('hidden');
            }
        }
    });

    confirmRegBtn.addEventListener('click', () => {
        const serieVal = regSerieInput.value.trim().toUpperCase();
        const locVal = regLocationSelect.value;
        const obsVal = regObservaciones.value.trim();

        if (!serieVal) {
            alert("Ingresa un número de serie.");
            return;
        }
        if (!locVal) {
            alert("Selecciona una ubicación.");
            return;
        }

        const serieKey = getColumnKey('serie');
        const locKey = getColumnKey('ubicacion') || getColumnKey('tecnica');
        const obsKey = getColumnKey('observacion');

        console.log("Columnas encontradas:", { serieKey, locKey, obsKey });
        console.log("Headers:", globalHeaders);

        if (!serieKey) {
            alert("No se encontró columna 'Serie' en el Excel. Columnas disponibles: " + globalHeaders.join(', '));
            return;
        }

        // Verificar si existe
        const normalize = s => String(s || '').trim().toUpperCase();
        const existsIndex = globalDataRaw.findIndex(row => normalize(row[serieKey]) === serieVal);

        if (existsIndex !== -1) {
            // EXISTE - Actualizar observaciones e imagen
            if (obsKey) {
                globalDataRaw[existsIndex][obsKey] = obsVal;
            }

            // Marcar como verificado automáticamente
            const verifiedCol = 'Verificado';
            if (!globalHeaders.includes(verifiedCol)) {
                globalHeaders.push(verifiedCol);
                globalDataRaw.forEach(r => { if (!(verifiedCol in r)) r[verifiedCol] = ''; });
            }
            globalDataRaw[existsIndex][verifiedCol] = '✅';

            // Si hay imagen nueva, descargarla y actualizar referencia
            const imgKey = getColumnKey('imagen') || getColumnKey('foto');
            if (capturedImageData) {
                const imgFilename = `${serieVal.replace(/[^a-zA-Z0-9]/g, '_')}.jpg`;
                if (imgKey) globalDataRaw[existsIndex][imgKey] = imgFilename;

                // Guardar en IndexedDB
                saveImageToDB(imgFilename, capturedImageData)
                    .then(() => console.log('Imagen actualizada en DB:', imgFilename))
                    .catch(console.error);

                downloadImage(capturedImageData, imgFilename);
            }

            renderTable();
            regFeedback.textContent = `✅ Actualizado para serie "${serieVal}"` + (capturedImageData ? ' (imagen descargada)' : '');
            regFeedback.className = 'feedback success';
            regFeedback.classList.remove('hidden');

            setTimeout(() => {
                resetCameraUI();
                registerModal.classList.add('hidden');
            }, 1500);
            return;
        }

        // NO EXISTE - Crear nueva fila
        const newRow = {};
        globalHeaders.forEach(h => newRow[h] = "");
        newRow[serieKey] = serieVal;
        if (locKey) newRow[locKey] = locVal;
        if (obsKey) newRow[obsKey] = obsVal;

        const dateKey = getColumnKey('calibracion') || getColumnKey('fecha');
        if (dateKey) newRow[dateKey] = new Date();

        // Guardar referencia de imagen si se capturó
        const imgKey = getColumnKey('imagen') || getColumnKey('foto');
        if (capturedImageData) {
            const imgFilename = `${serieVal.replace(/[^a-zA-Z0-9]/g, '_')}.jpg`;
            if (imgKey) newRow[imgKey] = imgFilename;

            // Guardar en IndexedDB
            saveImageToDB(imgFilename, capturedImageData)
                .then(() => console.log('Imagen guardada en DB:', imgFilename))
                .catch(console.error);

            // También descargar
            downloadImage(capturedImageData, imgFilename);
        }

        // Marcar como verificado automáticamente
        const verifiedCol = 'Verificado';
        if (!globalHeaders.includes(verifiedCol)) {
            globalHeaders.push(verifiedCol);
            globalDataRaw.forEach(r => { if (!(verifiedCol in r)) r[verifiedCol] = ''; });
        }
        newRow[verifiedCol] = '✅';

        globalDataRaw.push(newRow);
        renderTable();

        // Guardar en IndexedDB automáticamente
        saveExcelToDB();

        regFeedback.textContent = `✅ Serie "${serieVal}" registrada` + (capturedImageData ? ' (imagen descargada)' : '');
        regFeedback.className = 'feedback success';
        regFeedback.classList.remove('hidden');

        setTimeout(() => {
            resetCameraUI();
            registerModal.classList.add('hidden');
        }, 1500);
    });

    // --- QR ---
    startScanBtn.addEventListener('click', () => {
        if (globalDataRaw.length === 0) {
            alert("⚠️ No hay datos cargados. Por favor, carga un archivo Excel primero para poder escanear y verificar equipos.");
            return;
        }

        readerDiv.classList.remove('hidden');
        startScanBtn.classList.add('hidden');
        stopScanBtn.classList.remove('hidden');
        editPanel.classList.add('hidden');
        scanResult.classList.add('hidden');

        html5QrcodeScanner = new Html5Qrcode("reader");
        html5QrcodeScanner.start(
            { facingMode: "environment" },
            { fps: 15, qrbox: { width: 250, height: 250 } },
            onScanSuccess
        ).catch(err => {
            alert("Error cámara: " + err);
            stopScanning();
        });
    });

    stopScanBtn.addEventListener('click', stopScanning);

    function stopScanning() {
        if (html5QrcodeScanner) {
            html5QrcodeScanner.stop().then(() => {
                readerDiv.classList.add('hidden');
                startScanBtn.classList.remove('hidden');
                stopScanBtn.classList.add('hidden');
                html5QrcodeScanner.clear();
            }).catch(console.error);
        }
    }

    function onScanSuccess(decodedText) {
        let finalValue = decodedText;
        if (decodedText.includes('%2F') || decodedText.includes('%2f')) {
            const parts = decodedText.split(/%2F|%2f/);
            finalValue = parts[parts.length - 1].replace(/%/g, '-');
        }

        stopScanning();
        findOrRegister(finalValue);
    }

    async function findOrRegister(scannedValue) {
        const normalize = s => String(s || '').trim().toUpperCase();
        const target = normalize(scannedValue);

        const idKey = globalHeaders[0];
        const serieKey = getColumnKey('serie');

        // Buscar por ID o Serie
        let index = globalDataRaw.findIndex(row => normalize(row[idKey]) === target);
        if (index === -1 && serieKey) {
            index = globalDataRaw.findIndex(row => normalize(row[serieKey]) === target);
        }

        if (index !== -1) {
            // ENCONTRADO
            currentMatchIndex = index;
            const row = globalDataRaw[index];

            // Marcar como verificado
            const verifiedCol = 'Verificado';
            if (!globalHeaders.includes(verifiedCol)) {
                globalHeaders.push(verifiedCol);
                globalDataRaw.forEach(r => { if (!(verifiedCol in r)) r[verifiedCol] = ''; });
            }
            globalDataRaw[index][verifiedCol] = '✅';

            // Guardar automáticamente
            saveExcelToDB();

            scanResult.textContent = `✅ Encontrado en fila ${index + 2} - VERIFICADO`;
            scanResult.className = 'feedback success';
            scanResult.classList.remove('hidden');

            const equipoKey = getColumnKey('equipo');
            const locKey = getColumnKey('ubicacion') || getColumnKey('tecnica');

            matchInfo.innerHTML = `<strong>ID:</strong> ${row[idKey] || 'N/A'} | <strong>Serie:</strong> ${serieKey ? (row[serieKey] || 'Sin serie') : 'N/A'}`;

            // Mostrar nombre del equipo
            equipoNombre.textContent = equipoKey ? (row[equipoKey] || 'Sin nombre') : 'N/A';

            // Cargar serie actual
            if (serieKey) {
                editSerieInput.value = row[serieKey] || '';
            } else {
                editSerieInput.value = '';
            }

            // Cargar todas las observaciones
            loadObservacionesForRow(row);

            // Cargar ubicación actual
            if (locKey && row[locKey]) {
                editLocationSelect.value = row[locKey];
            } else {
                editLocationSelect.value = '';
            }

            // Cargar galería de imágenes
            await loadImagesForRow(row);

            const dateKey = getColumnKey('calibracion') || getColumnKey('fecha');
            if (dateKey) {
                dateInput.value = formatDateForInput(row[dateKey]);
                dateInput.dataset.targetKey = dateKey;
            }

            editPanel.classList.remove('hidden');

        } else {
            // NO ENCONTRADO - Abrir registro
            scanResult.textContent = `⚠️ "${scannedValue}" no encontrado. Registrando...`;
            scanResult.className = 'feedback warning';
            scanResult.classList.remove('hidden');

            resetCameraUI();
            regSerieInput.value = scannedValue;
            regLocationSelect.value = '';
            regObservaciones.value = '';
            regFeedback.classList.add('hidden');
            registerModal.classList.remove('hidden');
        }
    }

    // --- ACTUALIZAR FECHA, UBICACIÓN, SERIE Y OBSERVACIONES ---
    updateBtn.addEventListener('click', async () => {
        if (currentMatchIndex === -1) return;

        const newDate = dateInput.value;
        const newLoc = editLocationSelect.value;
        const newSerie = editSerieInput.value.trim().toUpperCase();

        const targetKey = dateInput.dataset.targetKey;
        const locKey = getColumnKey('ubicacion') || getColumnKey('tecnica');
        const serieKey = getColumnKey('serie');

        // Guardar serie
        if (serieKey && newSerie) {
            globalDataRaw[currentMatchIndex][serieKey] = newSerie;
        }

        if (targetKey && newDate) {
            const [y, m, d] = newDate.split('-').map(Number);
            globalDataRaw[currentMatchIndex][targetKey] = new Date(y, m - 1, d);
        }

        if (locKey && newLoc) {
            globalDataRaw[currentMatchIndex][locKey] = newLoc;
        }

        // Guardar todas las observaciones
        const obsCols = getObsColumns();

        // Primera observación
        const mainObs = document.getElementById('editObservaciones');
        if (mainObs && obsCols.length > 0) {
            globalDataRaw[currentMatchIndex][obsCols[0]] = mainObs.value.trim();
        }

        // Observaciones adicionales
        const additionalTextareas = observacionesContainer.querySelectorAll('textarea[id^="editObs_"]');
        additionalTextareas.forEach(textarea => {
            const colName = textarea.dataset.colname;
            if (colName && globalHeaders.includes(colName)) {
                globalDataRaw[currentMatchIndex][colName] = textarea.value.trim();
            }
        });

        // Guardar en IndexedDB automáticamente
        await saveExcelToDB();

        alert(`✅ Actualizado (fila ${currentMatchIndex + 2})`);
        editPanel.classList.add('hidden');
        scanResult.classList.add('hidden');

        // Mantener el filtro actual
        const filterInput = document.getElementById('filterSerieInput');
        renderTable(filterInput ? filterInput.value : '');
    });
});


// ============================================
// FUNCIONALIDAD ESTACIONES DE AGUA (INDEPENDIENTE)
// ============================================

(function () {
    // === BOTÓN PARA ABRIR/CERRAR SECCIÓN ===
    const openEstacionesBtn = document.getElementById('openEstacionesBtn');
    const closeEstacionesBtn = document.getElementById('closeEstacionesBtn');
    const estacionesSection = document.getElementById('estacionesSection');
    const exportEstacionesBtn = document.getElementById('exportEstacionesBtn');
    const importEstacionesInput = document.getElementById('importEstacionesInput');
    const estacionesFeedback = document.getElementById('estacionesFeedback');

    function showEstacionesFeedback(message, type = 'success') {
        estacionesFeedback.textContent = message;
        estacionesFeedback.className = `feedback ${type}`;
        estacionesFeedback.classList.remove('hidden');
        setTimeout(() => {
            estacionesFeedback.classList.add('hidden');
        }, 4000);
    }

    openEstacionesBtn.addEventListener('click', () => {
        estacionesSection.classList.remove('hidden');
        estacionesSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    closeEstacionesBtn.addEventListener('click', () => {
        estacionesSection.classList.add('hidden');
        // Scroll de vuelta a las acciones
        document.querySelector('.actions-grid').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

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

    // === INDEXEDDB PARA ESTACIONES ===
    let stationsDB = null;
    const STATIONS_DB_NAME = 'EstacionesAguaDB';
    const STATIONS_DB_VERSION = 3; // Incrementar versión para agregar store de certificados

    function initStationsDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(STATIONS_DB_NAME, STATIONS_DB_VERSION);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                stationsDB = request.result;
                resolve(stationsDB);
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

                // Store para volúmenes
                if (!database.objectStoreNames.contains('volumenes')) {
                    const volStore = database.createObjectStore('volumenes', { keyPath: 'id', autoIncrement: true });
                    volStore.createIndex('estacionId', 'estacionId', { unique: false });
                    volStore.createIndex('mes', 'mes', { unique: false });
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
    function addStationRecord(storeName, data) {
        return new Promise((resolve, reject) => {
            const tx = stationsDB.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.add(data);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    function getStationRecordsByStation(storeName, estacionId) {
        return new Promise((resolve, reject) => {
            const tx = stationsDB.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const index = store.index('estacionId');
            const request = index.getAll(estacionId);

            request.onsuccess = () => {
                const records = request.result || [];
                records.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
                resolve(records);
            };
            request.onerror = () => reject(request.error);
        });
    }

    function getAllStationRecords(storeName) {
        return new Promise((resolve, reject) => {
            const tx = stationsDB.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    function clearAllStationRecords(storeName) {
        return new Promise((resolve, reject) => {
            const tx = stationsDB.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    function deleteStationRecord(storeName, id) {
        return new Promise((resolve, reject) => {
            const tx = stationsDB.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // === EXPORTAR A EXCEL ===
    exportEstacionesBtn.addEventListener('click', async () => {
        try {
            exportEstacionesBtn.disabled = true;
            exportEstacionesBtn.textContent = '⏳ Exportando...';

            // Obtener todos los registros
            const preventivos = await getAllStationRecords('preventivos');
            const correctivos = await getAllStationRecords('correctivos');
            const suministros = await getAllStationRecords('suministros');
            const volumenes = await getAllStationRecords('volumenes');

            if (preventivos.length === 0 && correctivos.length === 0 && suministros.length === 0 && volumenes.length === 0) {
                showEstacionesFeedback('No hay datos para exportar', 'warning');
                return;
            }

            // Crear libro de Excel
            const wb = XLSX.utils.book_new();

            // Hoja 1: Preventivos
            const prevData = preventivos.map(p => {
                const estacion = ESTACIONES.find(e => e.id === p.estacionId);
                return {
                    'Estación': estacion ? estacion.nombre : p.estacionId,
                    'Serie': estacion ? estacion.serie : '',
                    'Proveedor': estacion ? estacion.proveedor : '',
                    'Fecha': p.fecha,
                    'Novedades': p.novedades,
                    'Registrado': new Date(p.createdAt).toLocaleString('es-ES')
                };
            });
            if (prevData.length > 0) {
                const ws1 = XLSX.utils.json_to_sheet(prevData);
                XLSX.utils.book_append_sheet(wb, ws1, 'Preventivos');
            }

            // Hoja 2: Correctivos
            const corrData = correctivos.map(c => {
                const estacion = ESTACIONES.find(e => e.id === c.estacionId);
                return {
                    'Estación': estacion ? estacion.nombre : c.estacionId,
                    'Serie': estacion ? estacion.serie : '',
                    'Proveedor': estacion ? estacion.proveedor : '',
                    'Fecha': c.fecha,
                    'Clase de Correctivo': c.clase,
                    'Novedades': c.novedades,
                    'Registrado': new Date(c.createdAt).toLocaleString('es-ES')
                };
            });
            if (corrData.length > 0) {
                const ws2 = XLSX.utils.json_to_sheet(corrData);
                XLSX.utils.book_append_sheet(wb, ws2, 'Correctivos');
            }

            // Hoja 3: Suministros
            const sumData = suministros.map(s => {
                const estacion = ESTACIONES.find(e => e.id === s.estacionId);
                return {
                    'Estación': estacion ? estacion.nombre : s.estacionId,
                    'Serie': estacion ? estacion.serie : '',
                    'Proveedor': estacion ? estacion.proveedor : '',
                    'Fecha': s.fecha,
                    'Accesorio/Insumo': s.accesorio,
                    'Cantidad': s.cantidad,
                    'Observaciones': s.observaciones || '',
                    'Registrado': new Date(s.createdAt).toLocaleString('es-ES')
                };
            });
            if (sumData.length > 0) {
                const ws3 = XLSX.utils.json_to_sheet(sumData);
                XLSX.utils.book_append_sheet(wb, ws3, 'Suministros');
            }

            // Hoja 4: Volúmenes
            const volData = volumenes.map(v => {
                const estacion = ESTACIONES.find(e => e.id === v.estacionId);
                return {
                    'Estación': estacion ? estacion.nombre : v.estacionId,
                    'Serie': estacion ? estacion.serie : '',
                    'Proveedor': estacion ? estacion.proveedor : '',
                    'Mes': v.mes,
                    'Volumen (Litros)': v.litros,
                    'Observaciones': v.observaciones || '',
                    'Registrado': new Date(v.createdAt).toLocaleString('es-ES')
                };
            });
            if (volData.length > 0) {
                const ws4 = XLSX.utils.json_to_sheet(volData);
                XLSX.utils.book_append_sheet(wb, ws4, 'Volumenes');
            }

            // Descargar archivo
            const fileName = `Estaciones_Agua_${new Date().toISOString().slice(0, 10)}.xlsx`;
            XLSX.writeFile(wb, fileName);

            showEstacionesFeedback('✅ Excel exportado correctamente', 'success');

        } catch (error) {
            console.error('Error exportando:', error);
            showEstacionesFeedback('Error al exportar', 'error');
        } finally {
            exportEstacionesBtn.disabled = false;
            exportEstacionesBtn.textContent = '💾 Exportar a Excel';
        }
    });

    // === IMPORTAR DESDE EXCEL ===
    importEstacionesInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            showEstacionesFeedback('⏳ Importando datos...', 'warning');

            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data, { type: 'array' });

            let importedCount = 0;

            // Importar Preventivos
            if (workbook.SheetNames.includes('Preventivos')) {
                const prevSheet = workbook.Sheets['Preventivos'];
                const prevData = XLSX.utils.sheet_to_json(prevSheet);

                for (const row of prevData) {
                    // Buscar estación por nombre o serie
                    const estacion = ESTACIONES.find(e =>
                        e.nombre === row['Estación'] || e.serie === row['Serie']
                    );

                    if (estacion && row['Fecha'] && row['Novedades']) {
                        await addStationRecord('preventivos', {
                            estacionId: estacion.id,
                            fecha: row['Fecha'],
                            novedades: row['Novedades'],
                            createdAt: new Date().toISOString()
                        });
                        importedCount++;
                    }
                }
            }

            // Importar Correctivos
            if (workbook.SheetNames.includes('Correctivos')) {
                const corrSheet = workbook.Sheets['Correctivos'];
                const corrData = XLSX.utils.sheet_to_json(corrSheet);

                for (const row of corrData) {
                    const estacion = ESTACIONES.find(e =>
                        e.nombre === row['Estación'] || e.serie === row['Serie']
                    );

                    if (estacion && row['Fecha'] && row['Clase de Correctivo'] && row['Novedades']) {
                        await addStationRecord('correctivos', {
                            estacionId: estacion.id,
                            fecha: row['Fecha'],
                            clase: row['Clase de Correctivo'],
                            novedades: row['Novedades'],
                            createdAt: new Date().toISOString()
                        });
                        importedCount++;
                    }
                }
            }

            // Importar Suministros
            if (workbook.SheetNames.includes('Suministros')) {
                const sumSheet = workbook.Sheets['Suministros'];
                const sumData = XLSX.utils.sheet_to_json(sumSheet);

                for (const row of sumData) {
                    const estacion = ESTACIONES.find(e =>
                        e.nombre === row['Estación'] || e.serie === row['Serie']
                    );

                    if (estacion && row['Fecha'] && row['Accesorio/Insumo'] && row['Cantidad']) {
                        await addStationRecord('suministros', {
                            estacionId: estacion.id,
                            fecha: row['Fecha'],
                            accesorio: row['Accesorio/Insumo'],
                            cantidad: parseInt(row['Cantidad']) || 1,
                            observaciones: row['Observaciones'] || '',
                            createdAt: new Date().toISOString()
                        });
                        importedCount++;
                    }
                }
            }

            // Importar Volúmenes
            if (workbook.SheetNames.includes('Volumenes')) {
                const volSheet = workbook.Sheets['Volumenes'];
                const volData = XLSX.utils.sheet_to_json(volSheet);

                for (const row of volData) {
                    const estacion = ESTACIONES.find(e =>
                        e.nombre === row['Estación'] || e.serie === row['Serie']
                    );

                    if (estacion && row['Mes'] && row['Volumen (Litros)']) {
                        await addStationRecord('volumenes', {
                            estacionId: estacion.id,
                            mes: row['Mes'],
                            litros: parseFloat(row['Volumen (Litros)']) || 0,
                            observaciones: row['Observaciones'] || '',
                            createdAt: new Date().toISOString()
                        });
                        importedCount++;
                    }
                }
            }

            showEstacionesFeedback(`✅ ${importedCount} registros importados correctamente`, 'success');

            // Actualizar vista si está abierta
            if (!estacionesSection.classList.contains('hidden')) {
                await renderStations();
                if (currentStationId) {
                    await loadCurrentTabData();
                }
            }

        } catch (error) {
            console.error('Error importando:', error);
            showEstacionesFeedback('Error al importar el archivo', 'error');
        }

        // Limpiar input
        importEstacionesInput.value = '';
    });

    // === VARIABLES GLOBALES ===
    let currentStationId = null;
    let certCameraStream = null;
    let certCapturedPhoto = null;

    // === ELEMENTOS DEL DOM ===
    const stationsGrid = document.getElementById('stationsGrid');
    const managementPanel = document.getElementById('managementPanel');
    const currentStationTitle = document.getElementById('currentStationTitle');

    // Modales
    const preventivoModal = document.getElementById('preventivoModal');
    const correctivoModal = document.getElementById('correctivoModal');
    const suministroModal = document.getElementById('suministroModal');
    const volumenModal = document.getElementById('volumenModal');

    // Botones
    const addPreventivoBtn = document.getElementById('addPreventivoBtn');
    const addCorrectivoBtn = document.getElementById('addCorrectivoBtn');
    const addSuministroBtn = document.getElementById('addSuministroBtn');
    const addVolumenBtn = document.getElementById('addVolumenBtn');

    // Listas
    const preventivosList = document.getElementById('preventivosList');
    const correctivosList = document.getElementById('correctivosList');
    const suministrosList = document.getElementById('suministrosList');
    const volumenesList = document.getElementById('volumenesList');
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

    // Visor de Imagen Certificados
    const certImageViewerModal = document.getElementById('certImageViewerModal');
    const fullSizeCertImage = document.getElementById('fullSizeCertImage');
    const closeCertImageViewer = document.getElementById('closeCertImageViewer');

    // === INICIALIZAR TABS ===
    function initializeTabs() {
        const stationTabs = document.querySelectorAll('.station-tab');
        const stationTabContents = document.querySelectorAll('.station-tab-content');

        stationTabs.forEach(tab => {
            // Remover listeners anteriores clonando el elemento
            const newTab = tab.cloneNode(true);
            tab.parentNode.replaceChild(newTab, tab);
        });

        // Agregar nuevos listeners
        document.querySelectorAll('.station-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.station-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.station-tab-content').forEach(tc => tc.classList.remove('active'));

                tab.classList.add('active');
                const tabName = tab.dataset.tab;
                const content = document.getElementById(`${tabName}-content`);
                if (content) {
                    content.classList.add('active');
                }

                loadCurrentTabData();
            });
        });
    }

    // === RENDERIZAR ESTACIONES ===
    async function renderStations() {
        stationsGrid.innerHTML = '';

        for (const estacion of ESTACIONES) {
            const preventivos = await getStationRecordsByStation('preventivos', estacion.id);
            const correctivos = await getStationRecordsByStation('correctivos', estacion.id);
            const suministros = await getStationRecordsByStation('suministros', estacion.id);
            const volumenes = await getStationRecordsByStation('volumenes', estacion.id);
            const certificados = await getStationRecordsByStation('certificados', estacion.id);

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
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; padding: 8px; background: rgba(79, 172, 254, 0.1); border-radius: 8px; text-align: center;">
                    <div>
                        <div style="font-size: 0.7rem; color: #888;">Volumen</div>
                        <div style="font-size: 1rem; font-weight: 600; color: #4facfe;">${volumenes.length}</div>
                    </div>
                    <div>
                        <div style="font-size: 0.7rem; color: #888;">Certificados</div>
                        <div style="font-size: 1rem; font-weight: 600; color: #43e97b;">${certificados.length}</div>
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

        // Inicializar tabs cada vez que se abre el panel
        initializeTabs();

        await renderStations();
        await loadCurrentTabData();

        managementPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // === TABS ===
    async function loadCurrentTabData() {
        if (!currentStationId) return;

        const activeTab = document.querySelector('.station-tab.active').dataset.tab;

        if (activeTab === 'preventivos') {
            await loadPreventivos();
        } else if (activeTab === 'correctivos') {
            await loadCorrectivos();
        } else if (activeTab === 'suministros') {
            await loadSuministros();
        } else if (activeTab === 'volumenes') {
            await loadVolumenes();
        } else if (activeTab === 'certificados') {
            await loadCertificados();
        }
    }

    // === PREVENTIVOS ===
    async function loadPreventivos() {
        const preventivos = await getStationRecordsByStation('preventivos', currentStationId);
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
                <div class="timeline-date">${formatStationDate(prev.fecha)}</div>
                <div class="timeline-content">${prev.novedades}</div>
                <div class="timeline-actions">
                    <button class="btn btn-danger btn-small" onclick="window.deletePreventivo(${prev.id})">🗑️ Eliminar</button>
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

        await addStationRecord('preventivos', {
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
            await deleteStationRecord('preventivos', id);
            await loadPreventivos();
            await renderStations();
        }
    };

    // === CORRECTIVOS ===
    async function loadCorrectivos() {
        const correctivos = await getStationRecordsByStation('correctivos', currentStationId);
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
                <div class="timeline-date">${formatStationDate(corr.fecha)}</div>
                <div style="color: #ffc800; font-weight: 600; font-size: 0.85rem; margin-bottom: 6px;">
                    ${corr.clase}
                </div>
                <div class="timeline-content">${corr.novedades}</div>
                <div class="timeline-actions">
                    <button class="btn btn-danger btn-small" onclick="window.deleteCorrectivo(${corr.id})">🗑️ Eliminar</button>
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

        await addStationRecord('correctivos', {
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
            await deleteStationRecord('correctivos', id);
            await loadCorrectivos();
            await renderStations();
        }
    };

    // === SUMINISTROS ===
    async function loadSuministros() {
        const suministros = await getStationRecordsByStation('suministros', currentStationId);
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
                <div class="timeline-date">${formatStationDate(sum.fecha)}</div>
                <div style="color: #43e97b; font-weight: 600; font-size: 0.95rem; margin-bottom: 6px;">
                    ${sum.accesorio} (x${sum.cantidad})
                </div>
                <div class="timeline-content">${sum.observaciones || 'Sin observaciones'}</div>
                <div class="timeline-actions">
                    <button class="btn btn-danger btn-small" onclick="window.deleteSuministro(${sum.id})">🗑️ Eliminar</button>
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

        await addStationRecord('suministros', {
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
            await deleteStationRecord('suministros', id);
            await loadSuministros();
            await renderStations();
        }
    };

    // === VOLÚMENES ===
    async function loadVolumenes() {
        const volumenes = await getStationRecordsByStation('volumenes', currentStationId);
        volumenesList.innerHTML = '';

        if (volumenes.length === 0) {
            volumenesList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">💧</div>
                    <div>No hay volúmenes registrados</div>
                </div>
            `;
            return;
        }

        volumenes.forEach(vol => {
            const item = document.createElement('div');
            item.className = 'timeline-item';
            const mesFormateado = formatMonthYear(vol.mes);
            const litrosFormateados = parseFloat(vol.litros).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

            item.innerHTML = `
                <div class="timeline-date">${mesFormateado}</div>
                <div style="color: #4facfe; font-weight: 600; font-size: 1.1rem; margin-bottom: 6px;">
                    ${litrosFormateados} Litros
                </div>
                <div class="timeline-content">${vol.observaciones || 'Sin observaciones'}</div>
                <div class="timeline-actions">
                    <button class="btn btn-danger btn-small" onclick="window.deleteVolumen(${vol.id})">🗑️ Eliminar</button>
                </div>
            `;
            volumenesList.appendChild(item);
        });
    }

    addVolumenBtn.addEventListener('click', () => {
        // Establecer mes actual por defecto
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        document.getElementById('volumenMes').value = currentMonth;
        document.getElementById('volumenLitros').value = '';
        document.getElementById('volumenObservaciones').value = '';
        volumenModal.classList.remove('hidden');
    });

    document.getElementById('saveVolumenBtn').addEventListener('click', async () => {
        const mes = document.getElementById('volumenMes').value;
        const litros = document.getElementById('volumenLitros').value;
        const observaciones = document.getElementById('volumenObservaciones').value.trim();

        if (!mes || !litros) {
            alert('Por favor completa los campos requeridos');
            return;
        }

        const litrosNum = parseFloat(litros);
        if (isNaN(litrosNum) || litrosNum < 0) {
            alert('Por favor ingresa un volumen válido');
            return;
        }

        await addStationRecord('volumenes', {
            estacionId: currentStationId,
            mes: mes,
            litros: litrosNum,
            observaciones: observaciones,
            createdAt: new Date().toISOString()
        });

        volumenModal.classList.add('hidden');
        await loadVolumenes();
        await renderStations();
    });

    document.getElementById('cancelVolumenBtn').addEventListener('click', () => {
        volumenModal.classList.add('hidden');
    });

    window.deleteVolumen = async (id) => {
        if (confirm('¿Eliminar este registro de volumen?')) {
            await deleteStationRecord('volumenes', id);
            await loadVolumenes();
            await renderStations();
        }
    };

    // === CERTIFICADOS (CÁMARA) ===
    async function loadCertificados() {
        if (!currentStationId) return;
        const certificados = await getStationRecordsByStation('certificados', currentStationId);
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
                <div class="timeline-date">${formatStationDate(cert.fecha)}</div>
                <div style="margin-bottom: 10px;">
                    <img src="${cert.photo}" style="width: 100px; height: 100px; object-fit: cover; border-radius: 8px; cursor: pointer; border: 1px solid rgba(255,255,255,0.1);" onclick="window.showCertImage('${cert.photo}')">
                </div>
                <div class="timeline-actions">
                    <button class="btn btn-secondary btn-small" onclick="window.showCertImage('${cert.photo}')">📄 Ver</button>
                    <button class="btn btn-danger btn-small" onclick="window.deleteCertificado(${cert.id})">🗑️ Eliminar</button>
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
        stopCertCamera();
        certCapturedPhoto = null;
        certCapturedImg.src = '';
        certCapturedImg.classList.add('hidden');
        certCameraContainer.classList.add('hidden');
        startCertCameraBtn.classList.remove('hidden');
        captureCertBtn.classList.add('hidden');
        retakeCertBtn.classList.add('hidden');
    }

    async function startCertCamera() {
        try {
            certCameraStream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: 'environment' } 
            });
            certVideo.srcObject = certCameraStream;
            certCameraContainer.classList.remove('hidden');
            startCertCameraBtn.classList.add('hidden');
            captureCertBtn.classList.remove('hidden');
        } catch (err) {
            console.error('Error al acceder a la cámara:', err);
            alert('No se pudo acceder a la cámara. Revisa los permisos.');
        }
    }

    function stopCertCamera() {
        if (certCameraStream) {
            certCameraStream.getTracks().forEach(track => track.stop());
            certCameraStream = null;
        }
    }

    function captureCertPhoto() {
        const canvas = document.createElement('canvas');
        canvas.width = certVideo.videoWidth;
        canvas.height = certVideo.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(certVideo, 0, 0);
        
        // Comprimir imagen
        certCapturedPhoto = canvas.toDataURL('image/jpeg', 0.6);
        
        certCapturedImg.src = certCapturedPhoto;
        certCapturedImg.classList.remove('hidden');
        certCameraContainer.classList.add('hidden');
        
        captureCertBtn.classList.add('hidden');
        retakeCertBtn.classList.remove('hidden');
        
        stopCertCamera();
    }

    startCertCameraBtn.addEventListener('click', startCertCamera);
    captureCertBtn.addEventListener('click', captureCertPhoto);
    retakeCertBtn.addEventListener('click', () => {
        resetCertModal();
        startCertCamera();
    });

    saveCertBtn.addEventListener('click', async () => {
        const fecha = document.getElementById('certFecha').value;
        
        if (!fecha || !certCapturedPhoto) {
            alert('Por favor selecciona una fecha y toma una foto');
            return;
        }

        await addStationRecord('certificados', {
            estacionId: currentStationId,
            fecha: fecha,
            photo: certCapturedPhoto,
            createdAt: new Date().toISOString()
        });

        certificadoModal.classList.add('hidden');
        resetCertModal();
        await loadCertificados();
        await renderStations();
    });

    cancelCertBtn.addEventListener('click', () => {
        stopCertCamera();
        certificadoModal.classList.add('hidden');
    });

    window.deleteCertificado = async (id) => {
        if (confirm('¿Eliminar este certificado?')) {
            await deleteStationRecord('certificados', id);
            await loadCertificados();
            await renderStations();
        }
    };

    // === VISOR DE IMAGEN CERTIFICADOS ===
    window.showCertImage = (src) => {
        fullSizeCertImage.src = src;
        certImageViewerModal.classList.remove('hidden');
    };

    closeCertImageViewer.addEventListener('click', () => {
        certImageViewerModal.classList.add('hidden');
        fullSizeCertImage.src = '';
    });

    certImageViewerModal.addEventListener('click', (e) => {
        if (e.target === certImageViewerModal) {
            certImageViewerModal.classList.add('hidden');
            fullSizeCertImage.src = '';
        }
    });

    // === UTILIDADES ===
    function formatStationDate(dateStr) {
        const date = new Date(dateStr + 'T00:00:00');
        return date.toLocaleDateString('es-ES', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    function formatMonthYear(monthStr) {
        const [year, month] = monthStr.split('-');
        const date = new Date(year, parseInt(month) - 1, 1);
        return date.toLocaleDateString('es-ES', {
            year: 'numeric',
            month: 'long'
        });
    }

    // === INICIALIZACIÓN ===
    initStationsDB().then(() => {
        console.log('Base de datos de estaciones inicializada');
        renderStations();
    }).catch(err => {
        console.error('Error inicializando DB de estaciones:', err);
    });
})();
