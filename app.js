let map, ds, drGo;
let returnMode = false;

const TUNNEL_DATA = [
    { id: "whc", name: "西隧", loc: "Western Harbour Crossing", match: "Island|Central|West|香港|中環|西環", toll: "h" },
    { id: "cht", name: "紅隧", loc: "Cross-Harbour Tunnel", match: "Island|Kowloon|Central|香港|尖沙咀|灣仔", toll: "h" },
    { id: "ehc", name: "東隧", loc: "Eastern Harbour Crossing", match: "Island|East|Kwun Tong|香港|觀塘|鰂魚涌", toll: "h" },
    { id: "tlt", name: "大欖", loc: "Tai Lam Tunnel", match: "Yuen Long|Tuen Mun|NT|元朗|屯門|天水圍", toll: "tlt" },
    { id: "lrt", name: "獅子山", loc: "Lion Rock Tunnel", match: "Sha Tin|Tai Po|Kowloon|沙田|大埔|九龍", toll: 8 },
    { id: "ent", name: "尖山", loc: "Eagle's Nest Tunnel", match: "Sha Tin|Kowloon|West|沙田|長沙灣|荔枝角", toll: 8 },
    { id: "tpr", name: "大埔道", loc: "Tai Po Road Piper's Hill", match: "Sha Tin|Tai Po|Sham Shui Po|大埔道", toll: 0 }
];

function initApp() {
    ds = new google.maps.DirectionsService();
    drGo = new google.maps.DirectionsRenderer({ polylineOptions: { strokeColor: "#E3193F", strokeWeight: 5 } });
    const now = new Date();
    document.getElementById('start-time').value = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');
    document.querySelectorAll('.node-input').forEach(bindAutocomplete);
    renderButtons('goTunnels');
}

function bindAutocomplete(inp) {
    const ac = new google.maps.places.Autocomplete(inp, { componentRestrictions: { country: "hk" } });
    ac.addListener('place_changed', () => { smartFilterTunnels(); calculate(); });
}

function renderButtons(id) {
    const container = document.getElementById(id);
    TUNNEL_DATA.forEach(t => {
        const div = document.createElement('div');
        div.className = 't-btn';
        div.innerText = t.name;
        div.onclick = function() { this.classList.toggle('active'); calculate(); };
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
        if (showAll || matched) btn.classList.add('visible');
        else btn.classList.remove('visible', 'active');
    });
}

async function calculate() {
    const locs = Array.from(document.querySelectorAll('.node-input')).map(i => i.value).filter(v => v.length > 2);
    const mapDiv = document.getElementById('map');
    if (locs.length < 2) { mapDiv.style.display = 'none'; updateUI(0, 0, 0); return; }

    if (!map) map = new google.maps.Map(mapDiv, { zoom: 12, center: { lat: 22.3, lng: 114.1 }, disableDefaultUI: true, styles: [{stylers:[{invert_lightness:true}]}] });

    const time = new Date();
    const [hrs, mins] = document.getElementById('start-time').value.split(':');
    time.setHours(hrs, mins);

    let totalToll = 0;
    const tunnelWays = Array.from(document.querySelectorAll('.t-btn.active')).map(b => {
        totalToll += getToll(b.getAttribute('data-loc'), time);
        return { location: b.getAttribute('data-loc'), stopover: true };
    });

    // 核心邏輯：強制將隧道放在出發地和目的地之間，且不優化順序
    ds.route({
        origin: locs[0],
        destination: locs[locs.length-1],
        waypoints: tunnelWays,
        travelMode: 'DRIVING',
        optimizeWaypoints: false 
    }, (res, stat) => {
        if (stat === 'OK') {
            mapDiv.style.display = 'block';
            drGo.setMap(map);
            drGo.setDirections(res);
            const km = res.routes[0].legs.reduce((a, b) => a + b.distance.value, 0) / 1000;
            const sec = res.routes[0].legs.reduce((a, b) => a + b.duration.value, 0);
            updateUI(km, totalToll, sec);
            google.maps.event.trigger(map, 'resize');
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