/* (L)TravelCal - Version 0.33.8 */

let map, ds, drGo, drBack;
let returnMode = false;

const TUNNEL_DATA = [
    { id: "whc", name: "西隧", loc: "Western Harbour Crossing", toll: "h", lat: 22.29 },
    { id: "cht", name: "紅隧", loc: "Cross-Harbour Tunnel", toll: "h", lat: 22.29 },
    { id: "ehc", name: "東隧", loc: "Eastern Harbour Crossing", toll: "h", lat: 22.29 },
    { id: "tlt", name: "大欖", loc: "Tai Lam Tunnel", toll: "tlt", lat: 22.41 },
    { id: "smt", name: "城門", loc: "Shing Mun Tunnels", toll: 5, lat: 22.38 },
    { id: "tct", name: "大老山", loc: "Tate's Cairn Tunnel", toll: 15, lat: 22.36 },
    { id: "tpr", name: "大埔道", loc: "Tai Po Road Piper's Hill", toll: 0, lat: 22.34 },
    { id: "lrt", name: "獅子山", loc: "Lion Rock Tunnel", toll: 8, lat: 22.33 },
    { id: "ent", name: "尖山", loc: "Eagle's Nest Tunnel", toll: 8, lat: 22.33 }
];

function initApp() {
    ds = new google.maps.DirectionsService();
    drGo = new google.maps.DirectionsRenderer({ polylineOptions: { strokeColor: "#E3193F", strokeWeight: 6 } });
    drBack = new google.maps.DirectionsRenderer({ polylineOptions: { strokeColor: "#1976D2", strokeWeight: 5 }, suppressMarkers: true });
    
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    document.getElementById('start-time').value = (new Date(now - offset)).toISOString().slice(0, 16);
    document.getElementById('return-time').value = (new Date(now.getTime() + 4*60*60*1000 - offset)).toISOString().slice(0, 16);

    document.querySelectorAll('.node-input').forEach(bindAutocomplete);
    renderButtons('goTunnels', 'go');
    renderButtons('backTunnels', 'back');
}

function bindAutocomplete(inp) {
    const ac = new google.maps.places.Autocomplete(inp, { componentRestrictions: { country: "hk" } });
    ac.addListener('place_changed', () => { calculate(); });
}

function renderButtons(id, prefix) {
    const container = document.getElementById(id);
    TUNNEL_DATA.forEach(t => {
        const div = document.createElement('div');
        div.className = `t-btn ${prefix}-t`;
        div.innerText = t.name;
        div.onclick = function() { this.classList.toggle('active'); calculate(); };
        div.setAttribute('data-loc', t.loc);
        container.appendChild(div);
    });
}

function getToll(loc, targetDate) {
    const data = TUNNEL_DATA.find(d => d.loc === loc);
    if (!data) return 0;
    const day = targetDate.getDay(); 
    const h = targetDate.getHours() + targetDate.getMinutes()/60;
    const isSpecial = (day === 0 || day === 6); 

    if (data.toll === "h") {
        if (!isSpecial) {
            if ((h >= 7.5 && h < 10.25) || (h >= 16.5 && h < 19)) return 60;
            if (h >= 10.25 && h < 16.5) return 30;
            return 20;
        } else {
            if (h >= 10 && h < 19.25) return 25;
            return 20;
        }
    }
    if (data.toll === "tlt") return (h >= 7.5 && h < 9.5) || (h >= 17.5 && h < 19) ? 45 : 18;
    return data.toll;
}

async function calculate() {
    const inputs = document.querySelectorAll('.node-input');
    const locs = Array.from(inputs).map(i => i.value).filter(v => v.length > 2);
    const mapEl = document.getElementById('map');

    if (locs.length < 2) {
        document.querySelectorAll('.conditional-show, .return-only').forEach(el => el.style.display = 'none');
        mapEl.classList.remove('active');
        return;
    }

    document.querySelectorAll('.conditional-show').forEach(el => { el.style.display = 'block'; });
    document.querySelectorAll('.return-only').forEach(el => { el.style.display = returnMode ? 'block' : 'none'; });

    mapEl.classList.add('active');

    if (!map) {
        map = new google.maps.Map(mapEl, { 
            zoom: 12, center: { lat: 22.3, lng: 114.1 }, 
            disableDefaultUI: true, 
            styles: [{stylers:[{invert_lightness:true}]}] 
        });
    }

    setTimeout(() => google.maps.event.trigger(map, 'resize'), 100);
    drGo.setMap(null); drBack.setMap(null);

    const goTime = new Date(document.getElementById('start-time').value);
    const goSelected = Array.from(document.querySelectorAll('.go-t.active')).map(b => TUNNEL_DATA.find(d => d.loc === b.getAttribute('data-loc')));
    const go = await getRouteData(locs[0], locs[locs.length-1], goSelected, goTime);

    let totalKm = go.km, totalToll = go.toll, totalSec = go.sec;
    if (go.raw) { drGo.setMap(map); drGo.setDirections(go.raw); }

    if (returnMode) {
        const backTime = new Date(document.getElementById('return-time').value);
        const backSelected = Array.from(document.querySelectorAll('.back-t.active')).map(b => TUNNEL_DATA.find(d => d.loc === b.getAttribute('data-loc')));
        const back = await getRouteData(locs[locs.length-1], locs[0], backSelected, backTime);
        totalKm += back.km; totalToll += back.toll; totalSec += back.sec;
        if (back.raw) { drBack.setMap(map); drBack.setDirections(back.raw); }
    }

    updateUI(totalKm, totalToll, totalSec);
}

async function getRouteData(start, end, tunnels, time) {
    return new Promise(resolve => {
        let pts = tunnels.map(t => ({ location: t.loc, stopover: true, lat: t.lat, toll: getToll(t.loc, time) }));
        pts.sort((a, b) => end.includes('Sha Tin') ? a.lat - b.lat : b.lat - a.lat);
        ds.route({ origin: start, destination: end, waypoints: pts.map(p=>({location:p.location, stopover:true})), travelMode: 'DRIVING' }, (res, stat) => {
            if (stat === 'OK') {
                const km = res.routes[0].legs.reduce((a, b) => a + b.distance.value, 0) / 1000;
                const sec = res.routes[0].legs.reduce((a, b) => a + b.duration.value, 0);
                resolve({ km, toll: pts.reduce((a,b)=>a+b.toll, 0), sec, raw: res });
            } else resolve({ km: 0, toll: 0, sec: 0, raw: null });
        });
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
    document.getElementById('savings').innerText = "$" + (km * 1.8 - energy).toFixed(1);
}

function addNode() {
    const div = document.createElement('div');
    div.className = 'input-group';
    div.innerHTML = `<input class="node-input" placeholder="中途站" autocomplete="off">`;
    document.getElementById('nodes-container').appendChild(div);
    bindAutocomplete(div.querySelector('.node-input'));
}

function toggleReturn() {
    returnMode = !returnMode;
    document.getElementById('retBtn').classList.toggle('active', returnMode);
    calculate();
}

initApp();