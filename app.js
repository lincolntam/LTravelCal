/* Tesla Smart Route HK - Version 0.20
   - Fix: Removed illegal 'lat' property from waypoints (Fixed InvalidValueError)
   - Fix: Added manual keyword direction detection (Fallback for disabled Geocoding API)
   - Feature: Support for Shing Mun and Tate's Cairn Tunnels
*/

let map, ds, drGo;
let returnMode = false;

// ✅ 緯度 (lat) 越高代表位置越北；用於自動排序順序
const TUNNEL_DATA = [
    { id: "tlt", name: "大欖", loc: "Tai Lam Tunnel", match: "Yuen Long|Tuen Mun|元朗|屯門", toll: "tlt", lat: 22.41 },
    { id: "smt", name: "城門", loc: "Shing Mun Tunnels", match: "Tsuen Wan|Sha Tin|葵涌|荃灣|沙田", toll: 5, lat: 22.38 },
    { id: "tct", name: "大老山", loc: "Tate's Cairn Tunnel", match: "Sha Tin|Diamond Hill|Kwun Tong|沙田|馬鞍山|觀塘", toll: 15, lat: 22.36 },
    { id: "tpr", name: "大埔道", loc: "Tai Po Road Piper's Hill", match: "Sha Tin|Tai Po|Sham Shui Po|大埔道", toll: 0, lat: 22.34 },
    { id: "lrt", name: "獅子山", loc: "Lion Rock Tunnel", match: "Sha Tin|Tai Po|Kowloon|沙田|九龍", toll: 8, lat: 22.33 },
    { id: "ent", name: "尖山", loc: "Eagle's Nest Tunnel", match: "Sha Tin|Kowloon|West|沙田|長沙灣|荔枝角", toll: 8, lat: 22.33 },
    { id: "whc", name: "西隧", loc: "Western Harbour Crossing", match: "Island|Central|West|香港|中環|西環", toll: "h", lat: 22.29 },
    { id: "cht", name: "紅隧", loc: "Cross-Harbour Tunnel", match: "Island|Kowloon|Central|香港|尖沙咀|灣仔", toll: "h", lat: 22.29 },
    { id: "ehc", name: "東隧", loc: "Eastern Harbour Crossing", match: "Island|East|Kwun Tong|香港|觀塘|鰂魚涌", toll: "h", lat: 22.29 }
];

function initApp() {
    ds = new google.maps.DirectionsService();
    drGo = new google.maps.DirectionsRenderer({ polylineOptions: { strokeColor: "#E3193F", strokeWeight: 5 } });
    
    const now = new Date();
    document.getElementById('start-time').value = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');
    
    document.querySelectorAll('.node-input').forEach(bindAutocomplete);
    renderButtons('goTunnels');
    smartFilterTunnels(); 
}

function bindAutocomplete(inp) {
    const ac = new google.maps.places.Autocomplete(inp, { componentRestrictions: { country: "hk" } });
    ac.addListener('place_changed', () => { 
        smartFilterTunnels(); 
        calculate(); 
    });
}

function renderButtons(id) {
    const container = document.getElementById(id);
    TUNNEL_DATA.forEach(t => {
        const div = document.createElement('div');
        div.className = 't-btn';
        div.innerText = t.name;
        div.onclick = function() { 
            this.classList.toggle('active'); 
            calculate(); 
        };
        div.setAttribute('data-loc', t.loc);
        container.appendChild(div);
    });
}

function getToll(loc, targetDate) {
    const data = TUNNEL_DATA.find(d => d.loc === loc);
    if (!data) return 0;
    const h = targetDate.getHours() + targetDate.getMinutes()/60;
    if (data.toll === "h") {
        if ((h >= 7.5 && h < 10.25) || (h >= 16.5 && h < 19)) return 60;
        if (h >= 10.25 && h < 16.5) return 30;
        return 20;
    }
    if (data.toll === "tlt") return (h >= 7.5 && h < 9.5) || (h >= 17.5 && h < 19) ? 45 : 18;
    return data.toll;
}

function smartFilterTunnels() {
    const showAll = document.getElementById('show-all-tunnels').checked;
    const combined = Array.from(document.querySelectorAll('.node-input')).map(i => i.value.toLowerCase()).join(" ");
    
    document.querySelectorAll('.t-btn').forEach(btn => {
        const data = TUNNEL_DATA.find(d => d.loc === btn.getAttribute('data-loc'));
        const matched = data.match.toLowerCase().split('|').some(term => combined.includes(term));
        if (showAll || matched) {
            btn.classList.add('visible');
        } else {
            btn.classList.remove('visible', 'active');
        }
    });
}

async function calculate() {
    const inputs = document.querySelectorAll('.node-input');
    const locs = Array.from(inputs).map(i => i.value).filter(v => v.length > 2);
    if (locs.length < 2) return;

    if (!map) {
        map = new google.maps.Map(document.getElementById('map'), { 
            zoom: 12, center: { lat: 22.3, lng: 114.1 }, 
            disableDefaultUI: true, styles: [{stylers:[{invert_lightness:true}]}] 
        });
    }

    const time = new Date();
    const timeVal = document.getElementById('start-time').value;
    if (timeVal) { const [hrs, mins] = timeVal.split(':'); time.setHours(hrs, mins); }

    // 1. 收集點並記錄緯度用於排序
    let selectedPoints = Array.from(document.querySelectorAll('.t-btn.active')).map(b => {
        const data = TUNNEL_DATA.find(d => d.loc === b.getAttribute('data-loc'));
        return { 
            location: data.loc, 
            stopover: true, 
            lat: data.lat, 
            tollValue: getToll(data.loc, time) 
        };
    });

    // 2. 💡 智慧方向偵測邏輯 (不依賴 Geocoding API)
    let isSouthbound = true; 
    const ntKeywords = ['sha tin', 'tai po', 'fanling', 'sheung shui', 'yuen long', 'tuen mun', 'ma on shan', 'fo tan', '科學園', '沙田', '火炭', '大埔'];
    const islandKeywords = ['central', 'wanchai', 'causeway bay', 'quarry bay', 'chai wan', 'siu sai wan', '香港仔', '中環', '灣仔', '小西灣', '柴灣'];
    
    const startStr = locs[0].toLowerCase();
    const endStr = locs[locs.length-1].toLowerCase();

    if (ntKeywords.some(k => startStr.includes(k)) || islandKeywords.some(k => endStr.includes(k))) {
        isSouthbound = true;
    } else if (islandKeywords.some(k => startStr.includes(k)) || ntKeywords.some(k => endStr.includes(k))) {
        isSouthbound = false;
    }

    // 執行排序：南下則北到南排列，北上則反之
    if (isSouthbound) {
        selectedPoints.sort((a, b) => b.lat - a.lat);
    } else {
        selectedPoints.sort((a, b) => a.lat - b.lat);
    }

    let totalToll = selectedPoints.reduce((acc, p) => acc + p.tollValue, 0);

    // 3. ⚠️ 重要：過濾非法屬性，只保留 Google 認識的欄位
    const cleanWaypoints = [];
    // 加入手動中途站
    for(let i=1; i < locs.length - 1; i++) { 
        cleanWaypoints.push({ location: locs[i], stopover: true }); 
    }
    // 加入排序後的隧道點
    selectedPoints.forEach(p => {
        cleanWaypoints.push({ location: p.location, stopover: p.stopover });
    });

    ds.route({
        origin: locs[0],
        destination: locs[locs.length-1],
        waypoints: cleanWaypoints,
        travelMode: 'DRIVING',
        optimizeWaypoints: false 
    }, (res, stat) => {
        if (stat === 'OK') {
            document.getElementById('map').style.display = 'block';
            drGo.setMap(map);
            drGo.setDirections(res);
            const km = res.routes[0].legs.reduce((a, b) => a + b.distance.value, 0) / 1000;
            const sec = res.routes[0].legs.reduce((a, b) => a + b.duration.value, 0);
            updateUI(km, totalToll, sec);
        } else {
            console.error("Route calculation failed: " + stat);
        }
    });
}

function updateUI(km, toll, sec) {
    const car = document.getElementById('car-model').value.split('|');
    const energy = km * parseFloat(car[0]) * parseFloat(car[1]);
    document.getElementById('km').innerText = km.toFixed(1) + " km";
    document.getElementById('duration').innerText = Math.round(sec / 60) + " min";
    document.getElementById('t-fee').innerText = "$" + toll;
    document.getElementById('e-cost').innerText = "$" + energy.toFixed(1);
    document.getElementById('total').innerText = (energy + toll).toFixed(1);
}

function addNode() {
    const container = document.getElementById('nodes-container');
    const div = document.createElement('div');
    div.className = 'input-group';
    div.innerHTML = `<input class="node-input" placeholder="中途站" autocomplete="off">`;
    container.appendChild(div);
    bindAutocomplete(div.querySelector('.node-input'));
}

function toggleReturn() {
    returnMode = !returnMode;
    document.getElementById('retBtn').classList.toggle('active', returnMode);
    calculate();
}