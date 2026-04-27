// --- FIREBASE NUSTATYMAI ---
const firebaseConfig = {
    apiKey: "AIzaSyBoB81lVsKQQbykbaxzO67MBH1pTRl-6TE",
    authDomain: "stone-tracker-5c710.firebaseapp.com",
    databaseURL: "https://stone-tracker-5c710-default-rtdb.firebaseio.com",
    projectId: "stone-tracker-5c710",
    storageBucket: "stone-tracker-5c710.firebasestorage.app",
    messagingSenderId: "264831403484",
    appId: "1:264831403484:web:372d2b5aa55ce082edfb19"
};

let db = null;
// Jei vartotojas įvedė savo raktą, inicijuojame Firebase
if (firebaseConfig.apiKey !== "JŪSŲ_API_RAKTAS") {
    firebase.initializeApp(firebaseConfig);
    db = firebase.database();
}

let map;
let userMarker;
let accuracyCircle;
let appData = {}; // Format: { "Field 1": [ {lat, lng, size, ts} ] }
let currentField = null;
let stoneMarkers = [];
let routePolyline;
let userCurrentPos = null;

const STATUS_EL = document.getElementById('status-text');

const STONE_COLORS = { 'very-large': '#dc2626', 'large': '#f97316', 'medium': '#eab308' };
const STONE_NAMES = { 'very-large': 'Labai didelis', 'large': 'Didelis', 'medium': 'Vidutinis' };

document.addEventListener('DOMContentLoaded', () => {
    loadAppData();
    attachGlobalListeners();
});

function loadAppData() {
    if (db) {
        // Debesų (Cloud) sinchronizacija realiu laiku
        db.ref('appData').on('value', (snapshot) => {
            const data = snapshot.val();
            appData = data || {};
            renderFieldsList();
            if (currentField) renderCurrentFieldStones();
        });
    } else {
        // Jei Firebase nepajungtas, naudojame telefono atmintį
        const saved = localStorage.getItem('appData');
        if (saved) appData = JSON.parse(saved);
        renderFieldsList();
    }
}

function saveAppData() {
    if (db) {
        db.ref('appData').set(appData);
    } else {
        localStorage.setItem('appData', JSON.stringify(appData));
    }
}

function renderFieldsList() {
    const list = document.getElementById('fields-list');
    list.innerHTML = '';

    if (!document.getElementById('cloud-status')) {
        const p = document.createElement('p');
        p.id = 'cloud-status';
        p.style.fontSize = '0.90rem';
        p.style.marginBottom = '10px';
        p.style.color = db ? '#15803d' : '#854d0e';
        p.innerText = db ? "☁️ Prijungta prie internetinės duomenų bazės" : "⚠️ Veikia tik šio įrenginio atmintyje. Įveskite Firebase.";
        document.querySelector('.field-container').insertBefore(p, document.querySelector('.new-field-box'));
    }

    const fields = Object.keys(appData);
    if (fields.length === 0) {
        list.innerHTML = '<p style="color: #999;">Nėra sukurtų laukų. Sukurkite naują aukščiau esančiame laukelyje.</p>';
        return;
    }

    fields.forEach(field => {
        const btn = document.createElement('button');
        btn.className = 'field-item';
        const nameSpan = document.createElement('span'); nameSpan.innerText = field;
        const countSpan = document.createElement('span'); countSpan.className = 'stone-count';
        const len = appData[field] ? (Array.isArray(appData[field]) ? appData[field].length : Object.keys(appData[field]).length) : 0;
        countSpan.innerText = `${len} akm.`;
        btn.appendChild(nameSpan); btn.appendChild(countSpan);
        btn.onclick = () => openField(field);
        list.appendChild(btn);
    });
}

function openField(fieldName) {
    currentField = fieldName;
    document.getElementById('current-field-name').innerText = currentField;
    document.getElementById('field-screen').style.display = 'none';
    document.getElementById('app-container').style.display = 'flex';
    if (!map) { initMap(); } else { setTimeout(() => map.invalidateSize(), 100); }
    renderCurrentFieldStones();
}

function renderCurrentFieldStones() {
    stoneMarkers.forEach(m => map.removeLayer(m));
    stoneMarkers = [];
    if (routePolyline) { map.removeLayer(routePolyline); routePolyline = null; }

    if (currentField && appData[currentField]) {
        const stones = Array.isArray(appData[currentField]) ? appData[currentField] : Object.values(appData[currentField]);
        stones.forEach(renderStoneMarker);
    }
}

function renderStoneMarker(stone) {
    if (!stone || !stone.lat) return;
    const m = L.circleMarker([stone.lat, stone.lng], {
        color: '#ffffff', weight: 1, fillColor: STONE_COLORS[stone.size],
        fillOpacity: 0.9, radius: 10
    }).bindPopup(`<b>${STONE_NAMES[stone.size]}</b><br>${new Date(stone.ts).toLocaleTimeString()}`).addTo(map);
    stoneMarkers.push(m);
}

function attachGlobalListeners() {
    document.getElementById('add-field-btn').addEventListener('click', () => {
        const input = document.getElementById('new-field-input');
        const name = input.value.trim();
        if (!name) return;
        if (appData[name]) {
            alert("Toks laukas jau egzistuoja."); openField(name); input.value = ''; return;
        }
        appData[name] = []; saveAppData(); if (!db) { renderFieldsList(); } input.value = ''; openField(name);
    });

    document.getElementById('back-to-fields').addEventListener('click', () => {
        document.getElementById('app-container').style.display = 'none';
        document.getElementById('field-screen').style.display = 'flex';
        renderFieldsList(); currentField = null;
    });

    document.querySelectorAll('.mark-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (!currentField) return;
            if (!userCurrentPos) { alert("Prašome palaukti, kol atsiras stiprus GPS signalas."); return; }
            const stone = { lat: userCurrentPos[0], lng: userCurrentPos[1], size: e.target.dataset.size, ts: Date.now() };
            if (!Array.isArray(appData[currentField])) { appData[currentField] = Object.values(appData[currentField] || {}); }
            appData[currentField].push(stone); saveAppData();
            if (!db) { renderStoneMarker(stone); }
            if (navigator.vibrate) navigator.vibrate(50);
        });
    });

    document.getElementById('clear-btn').addEventListener('click', () => {
        if (!currentField) return;
        if (confirm(`Ar tikrai norite ištrinti lauką "${currentField}"?`)) {
            delete appData[currentField]; saveAppData(); document.getElementById('back-to-fields').click();
        }
    });

    document.getElementById('share-btn').addEventListener('click', () => {
        if (!currentField) return;
        const stones = Array.isArray(appData[currentField]) ? appData[currentField] : Object.values(appData[currentField] || {});
        if (!stones || stones.length === 0) { alert("Nėra akmenų."); return; }
        let shareText = `Lauko "${currentField}" akmenys:\n`;
        stones.forEach((s, i) => { shareText += `${i + 1}. ${STONE_NAMES[s.size]} - ${s.lat.toFixed(6)}, ${s.lng.toFixed(6)}\n`; });
        const mapsUrl = `https://www.google.com/maps/dir/${stones.map(s => s.lat + ',' + s.lng).join('/')}`;
        shareText += `\nMaršruto nuoroda:\n${mapsUrl}`;
        if (navigator.share) { navigator.share({ title: `Maršrutas`, text: shareText }).catch(console.error); }
        else { navigator.clipboard.writeText(shareText).then(() => alert("Kopijuota!")).catch(() => alert("Klaida.")); }
    });

    document.getElementById('route-btn').addEventListener('click', calculateAndDrawRoute);
}

function initMap() {
    map = L.map('map', { zoomControl: false }).setView([55.1694, 23.8813], 7);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { maxZoom: 20, attribution: 'OSM' }).addTo(map);
    startGPS();
}

function startGPS() {
    if (!("geolocation" in navigator)) { STATUS_EL.innerText = "GPS nepalaikomas."; return; }
    STATUS_EL.innerText = "Ieškoma GPS signalo...";
    navigator.geolocation.watchPosition(
        (position) => {
            const acc = position.coords.accuracy; userCurrentPos = [position.coords.latitude, position.coords.longitude];
            STATUS_EL.innerText = `GPS aktyvus. Paklaida: ±${Math.round(acc)}m`;
            if (!userMarker) {
                accuracyCircle = L.circle(userCurrentPos, { radius: acc, color: '#3b82f6', weight: 1, opacity: 0.3, fillColor: '#3b82f6', fillOpacity: 0.1 }).addTo(map);
                userMarker = L.circleMarker(userCurrentPos, { color: '#ffffff', fillColor: '#3b82f6', fillOpacity: 1, radius: 8, weight: 2 }).addTo(map);
                map.setView(userCurrentPos, 18);
            } else { userMarker.setLatLng(userCurrentPos); accuracyCircle.setLatLng(userCurrentPos); accuracyCircle.setRadius(acc); }
        },
        (error) => {
            if (error.code === error.TIMEOUT) {
                STATUS_EL.innerText = "GPS ilgai nerandamas. Išeikite į atvirą lauką.";
            } else {
                STATUS_EL.innerText = `GPS klaida: ${error.message}`;
            }
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
}

function calculateAndDrawRoute() {
    if (!currentField) return;
    const stones = Array.isArray(appData[currentField]) ? appData[currentField] : Object.values(appData[currentField] || {});
    if (!stones || stones.length < 2) { alert("Reikia bent 2 akmenų maršrutui."); return; }
    let unvisited = [...stones]; let current = userCurrentPos ? { lat: userCurrentPos[0], lng: userCurrentPos[1] } : unvisited[0]; let route = [];
    if (userCurrentPos) route.push({ lat: current.lat, lng: current.lng });
    while (unvisited.length > 0) {
        let nearestIdx = 0; let minDist = Infinity;
        for (let i = 0; i < unvisited.length; i++) {
            const dist = getDistance(current.lat, current.lng, unvisited[i].lat, unvisited[i].lng);
            if (dist < minDist) { minDist = dist; nearestIdx = i; }
        }
        current = unvisited[nearestIdx]; route.push(current); unvisited.splice(nearestIdx, 1);
    }
    if (routePolyline) map.removeLayer(routePolyline);
    routePolyline = L.polyline(route.map(p => [p.lat, p.lng]), { color: '#8b5cf6', weight: 4, dashArray: '10, 10' }).addTo(map);
    map.fitBounds(routePolyline.getBounds(), { padding: [50, 50] });
}

function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; const φ1 = lat1 * Math.PI / 180; const φ2 = lat2 * Math.PI / 180; const Δφ = (lat2 - lat1) * Math.PI / 180; const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}
