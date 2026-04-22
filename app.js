// ... 保持原有初始化代碼 ...

async function calculate() {
    const inputs = document.querySelectorAll('.node-input');
    // 過濾出有填寫的地點
    const locs = Array.from(inputs).map(i => i.value).filter(v => v.length > 2);
    const mapDiv = document.getElementById('map');

    if (locs.length < 2) { 
        mapDiv.style.display = 'none'; 
        updateUI(0, 0, 0); 
        return; 
    }

    // 初始化地圖
    if (!map) map = new google.maps.Map(mapDiv, { 
        zoom: 12, 
        center: { lat: 22.3, lng: 114.1 }, 
        disableDefaultUI: true, 
        styles: [{stylers:[{invert_lightness:true}]}] 
    });

    const time = new Date();
    const timeVal = document.getElementById('start-time').value;
    if (timeVal) { 
        const [hrs, mins] = timeVal.split(':'); 
        time.setHours(hrs, mins); 
    }

    let totalToll = 0;
    
    // 整理所有選中的隧道作為 Waypoints
    const tunnelWaypoints = Array.from(document.querySelectorAll('#goTunnels .active')).map(b => {
        totalToll += getToll(b.getAttribute('data-loc'), time);
        return { location: b.getAttribute('data-loc'), stopover: true }; // 設為 true 確保必經
    });

    // 💡 解決繞路核心邏輯：
    // 如果你有中途站，必須確保順序是：[起點, ...中途站, ...隧道, 終點]
    // 這裡我們暫時將隧道放在最後一個站點之前
    const allWaypoints = [];
    
    // 加入使用者填寫的中途站 (除了起點和終點)
    for(let i=1; i < locs.length - 1; i++) {
        allWaypoints.push({ location: locs[i], stopover: true });
    }
    
    // 加入隧道
    allWaypoints.push(...tunnelWaypoints);

    ds.route({ 
        origin: locs[0], 
        destination: locs[locs.length-1], 
        waypoints: allWaypoints, 
        travelMode: 'DRIVING',
        // ✅ 嚴格禁用優化，避免 Google 亂改你的隧道順序
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
        } else {
            console.error("路線計算失敗: " + stat);
        }
    });
}

// ... 保持其他函式不變 ...