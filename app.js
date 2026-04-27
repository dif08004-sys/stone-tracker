let map;
let userMarker;
let accuracyCircle;
let appData = {}; // Format: { "Field 1": [ {lat, lng, size, ts} ] }
let currentField = null;
let stoneMarkers = [];
let routePolyline;
let userCurrentPos = null;

const STATUS_EL = document.getElementById('status-text');

const STONE_COLORS = {
    'very-large': '#dc2626',
    'large': '#f97316',
    'medium': '#eab308'
};

const STONE_NAMES = {
    'very-large': 'Labai didelis',
    'large': 'Didelis',
    'medium': 'Vidutinis'
};

document.addEventListener('DOMContentLoaded', () => {
    loadAppData();
    renderFieldsList();
    attachGlobalListeners();
});

function loadAppData() {
    const saved = localStorage.getItem('appData');
    if (saved) {
        appData = JSON.parse(saved);
    }
    const oldStones = localStorage.getItem('stones');
    if (oldStones) {
        appData['Numatytasis Laukas'] = JSON.parse(oldStones);
        localStorage.removeItem('stones');
        saveAppData();
    }
}

function saveAppData() {
    localStorage.setItem('appData', JSON.stringify(appData));
}

function renderFieldsList() {
    const list = document.getElementById('fields-list');
    list.innerHTML = '';

    const fields = Object.keys(appData);
    if (fields.length === 0) {
        list.innerHTML = '<p style="color: #999;">Nėra sukurtų laukų. Sukurkite naują aukščiau esančiame laukelyje.</p>';
        return;
    }

    fields.forEach(field => {
        const btn = document.createElement('button');
        btn.className = 'field-item';

        const nameSpan = document.createElement('span');
        nameSpan.innerText = field;

        const countSpan = document.createElement('span');
        countSpan.className = 'stone-count';
        countSpan.innerText = `${appData[field].length} akm.`;

        btn.appendChild(nameSpan);
        btn.appendChild(countSpan);

        btn.onclick = () => openField(field);
        list.appendChild(btn);
    });
}

function openField(fieldName) {
    currentField = fieldName;
    document.getElementById('current-field-name').innerText = currentField;
    document.getElementById('field-screen').style.display = 'none';
    document.getElementById('app-container').style.display = 'flex';

    if (!map) {
        initMap();
    } else {
        setTimeout(() => map.invalidateSize(), 100);
    }

    renderCurrentFieldStones();
}

function renderCurrentFieldStones() {
    stoneMarkers.forEach(m => map.removeLayer(m));
    stoneMarkers = [];
    if (routePolyline) {
        map.removeLayer(routePolyline);
        routePolyline = null;
    }

    if (currentField && appData[currentField]) {
        appData[currentField].forEach(renderStoneMarker);
    }
}

function renderStoneMarker(stone) {
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
            alert("Toks laukas jau egzistuoja, jis atidaromas.");
            openField(name);
            input.value = '';
            return;
        }
        appData[name] = [];
        saveAppData();
        renderFieldsList();
        input.value = '';
        openField(name);
    });

    document.getElementById('back-to-fields').addEventListener('click', () => {
        document.getElementById('app-container').style.display = 'none';
        document.getElementById('field-screen').style.display = 'flex';
        renderFieldsList();
        currentField = null;
    });

    document.querySelectorAll('.mark-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (!currentField) return;
            if (!userCurrentPos) {
                alert("Prašome palaukti, kol atsiras stiprus GPS signalas.");
                return;
            }
            const size = e.target.dataset.size;
            const stone = {
                lat: userCurrentPos[0],
                lng: userCurrentPos[1],
                size: size,
                ts: Date.now()
            };
            appData[currentField].push(stone);
            saveAppData();
            renderStoneMarker(stone);

            if (navigator.vibrate) navigator.vibrate(50);
        });
    });

    document.getElementById('clear-btn').addEventListener('click', () => {
        if (!currentField) return;
        if (confirm(`Ar tikrai norite ištrinti lauką "${currentField}" ir visus jo akmenis?`)) {
            // Delete field completely and go back to home screen
            delete appData[currentField];
            saveAppData();
            document.getElementById('back-to-fields').click();
        }
    });

    document.getElementById('share-btn').addEventListener('click', () => {
        if (!currentField) return;
        const stones = appData[currentField];
        if (stones.length === 0) {
            alert("Šiame lauke nėra pažymėtų akmenų.");
            return;
        }

        let shareText = `Lauko "${currentField}" akmenys:\n`;
        stones.forEach((s, i) => {
            shareText += `${i + 1}. ${STONE_NAMES[s.size]} - ${s.lat.toFixed(6)}, ${s.lng.toFixed(6)}\n`;
        });

        const mapsUrl = `https://www.google.com/maps/dir/${stones.map(s => s.lat + ',' + s.lng).join('/')}`;
        shareText += `\nMaršruto nuoroda:\n${mapsUrl}`;

        if (navigator.share) {
            navigator.share({
                title: `Akmenų maršrutas - ${currentField}`,
                text: shareText
            }).catch(console.error);
        } else {
            navigator.clipboard.writeText(shareText).then(() => {
                alert("Koordinatės nukopijuotos į iškarpinę!");
            }).catch(() => {
                alert("Nepavyko nukopijuoti koordinačių.");
            });
        }
    });

    document.getElementById('route-btn').addEventListener('click', () => {
        calculateAndDrawRoute();
    });
}

function initMap() {
    map = L.map('map', {
        zoomControl: false
    }).setView([55.1694, 23.8813], 7);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 20,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
    }).addTo(map);

    startGPS();
}

function startGPS() {
    if (!("geolocation" in navigator)) {
        STATUS_EL.innerText = "GPS nepalaikomas šiame įrenginyje.";
        return;
    }

    STATUS_EL.innerText = "Ieškoma GPS signalo...";

    navigator.geolocation.watchPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            const accuracy = position.coords.accuracy;
            userCurrentPos = [lat, lng];

            STATUS_EL.innerText = `GPS aktyvus. Paklaida: ±${Math.round(accuracy)}m`;

            if (!userMarker) {
                accuracyCircle = L.circle(userCurrentPos, {
                    radius: accuracy, color: '#3b82f6', weight: 1, opacity: 0.3, fillColor: '#3b82f6', fillOpacity: 0.1
                }).addTo(map);

                userMarker = L.circleMarker(userCurrentPos, {
                    color: '#ffffff', fillColor: '#3b82f6', fillOpacity: 1, radius: 8, weight: 2
                }).addTo(map);

                map.setView(userCurrentPos, 18);
            } else {
                userMarker.setLatLng(userCurrentPos);
                accuracyCircle.setLatLng(userCurrentPos);
                accuracyCircle.setRadius(accuracy);
            }
        },
        (error) => {
            console.error(error);
            STATUS_EL.innerText = `GPS klaida: ${error.message}`;
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
}

function calculateAndDrawRoute() {
    if (!currentField) return;
    const stones = appData[currentField];
    if (stones.length < 2) {
        alert("Reikia bent 2 pažymėtų akmenų optimaliam maršrutui sudaryti.");
        return;
    }

    let unvisited = [...stones];
    let current = userCurrentPos ? { lat: userCurrentPos[0], lng: userCurrentPos[1] } : unvisited[0];
    let route = [];

    if (userCurrentPos) route.push({ lat: current.lat, lng: current.lng });

    while (unvisited.length > 0) {
        let nearestIdx = 0;
        let minDist = Infinity;
        for (let i = 0; i < unvisited.length; i++) {
            const dist = getDistance(current.lat, current.lng, unvisited[i].lat, unvisited[i].lng);
            if (dist < minDist) { minDist = dist; nearestIdx = i; }
        }
        current = unvisited[nearestIdx];
        route.push(current);
        unvisited.splice(nearestIdx, 1);
    }

    if (routePolyline) map.removeLayer(routePolyline);
    const latlngs = route.map(p => [p.lat, p.lng]);
    routePolyline = L.polyline(latlngs, { color: '#8b5cf6', weight: 4, dashArray: '10, 10' }).addTo(map);
    map.fitBounds(routePolyline.getBounds(), { padding: [50, 50] });
}

function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}
