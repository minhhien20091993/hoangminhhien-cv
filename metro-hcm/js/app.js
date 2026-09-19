const map = L.map("map", {
  zoomControl: false,
  preferCanvas: true
}).setView([10.82, 106.75], 12);

L.control.zoom({ position: "bottomright" }).addTo(map);

// ============================
// BASEMAP ESRI / ARCGIS ONLINE
// ============================

// Dark Gray Canvas: hợp với dashboard vận hành, làm nổi tuyến Metro.
const esriDarkBase = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
  {
    maxZoom: 19,
    attribution: "Tiles &copy; Esri"
  }
);

const esriDarkReference = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
  {
    maxZoom: 19,
    attribution: "Reference &copy; Esri"
  }
);

const esriDark = L.layerGroup([
  esriDarkBase,
  esriDarkReference
]);

// ArcGIS Topographic.
const esriTopo = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
  {
    maxZoom: 19,
    attribution: "Tiles &copy; Esri"
  }
);

// ArcGIS World Imagery.
const esriImagery = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  {
    maxZoom: 19,
    attribution: "Imagery &copy; Esri"
  }
);

// Mặc định dùng ArcGIS Dark Gray.
esriDark.addTo(map);

// Cho phép đổi nền ngay trên bản đồ.
L.control.layers(
  {
    "ArcGIS Dark Gray": esriDark,
    "ArcGIS Topographic": esriTopo,
    "ArcGIS World Imagery": esriImagery
  },
  {},
  {
    position: "bottomright",
    collapsed: true
  }
).addTo(map);

const ui = {
  clock: document.getElementById("currentClock"),
  date: document.getElementById("currentDate"),
  active: document.getElementById("activeTrainCount"),
  bt: document.getElementById("btCount"),
  st: document.getElementById("stCount"),
  stationCount: document.getElementById("stationCount"),
  nextBT: document.getElementById("nextBT"),
  nextST: document.getElementById("nextST"),
  activeList: document.getElementById("activeTrainList"),
  status: document.getElementById("status"),
  subtitle: document.getElementById("mapSubtitle"),
  serviceState: document.getElementById("serviceState")
};

const TRIP_MINUTES = 29;
const trainMarkers = new Map();

function pad(n) {
  return String(n).padStart(2, "0");
}

function formatClock(date = new Date()) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatDate(date = new Date()) {
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function updateClock() {
  const now = new Date();
  ui.clock.textContent = formatClock(now);
  ui.date.textContent = formatDate(now);
}

function timeToMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function nowMinutes() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

function getRouteCoordinates(lineData) {
  const geometry = lineData.features[0].geometry;
  if (geometry.type === "LineString") return geometry.coordinates;
  if (geometry.type === "MultiLineString") return geometry.coordinates.flat();
  throw new Error("Geometry tuyến phải là LineString hoặc MultiLineString.");
}

function haversine(a, b) {
  const R = 6371000;
  const toRad = v => v * Math.PI / 180;

  const [lon1, lat1] = a;
  const [lon2, lat2] = b;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
    Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(x));
}

function buildRoute(coords) {
  let total = 0;
  const segments = [];

  for (let i = 0; i < coords.length - 1; i++) {
    const length = haversine(coords[i], coords[i + 1]);

    segments.push({
      a: coords[i],
      b: coords[i + 1],
      start: total,
      length
    });

    total += length;
  }

  return { segments, total };
}

function pointAt(route, progress) {
  const p = Math.max(0, Math.min(1, progress));
  const target = route.total * p;

  for (const s of route.segments) {
    if (target <= s.start + s.length) {
      const ratio = s.length === 0 ? 0 : (target - s.start) / s.length;

      const lon = s.a[0] + (s.b[0] - s.a[0]) * ratio;
      const lat = s.a[1] + (s.b[1] - s.a[1]) * ratio;

      return [lat, lon];
    }
  }

  const last = route.segments[route.segments.length - 1].b;
  return [last[1], last[0]];
}

function buildTrips(timetable) {
  const trips = [];

  timetable.directions.BEN_THANH_TO_SUOI_TIEN.departures.forEach(time => {
    trips.push({
      id: `BT-${time.replace(":", "")}`,
      label: time,
      depart: time,
      departMin: timeToMinutes(time),
      reverse: false,
      css: "bt",
      shortDirection: "BT → ST",
      direction: "Bến Thành → Suối Tiên"
    });
  });

  timetable.directions.SUOI_TIEN_TO_BEN_THANH.departures.forEach(time => {
    trips.push({
      id: `ST-${time.replace(":", "")}`,
      label: time,
      depart: time,
      departMin: timeToMinutes(time),
      reverse: true,
      css: "st",
      shortDirection: "ST → BT",
      direction: "Suối Tiên → Bến Thành"
    });
  });

  return trips;
}

function trainIcon(cssClass) {
  return L.divIcon({
    className: "",
    html: `<div class="train-marker ${cssClass}">🚇</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });
}

function stationIcon(isTerminal) {
  return L.divIcon({
    className: "",
    html: `<div class="metro-station ${isTerminal ? "terminal" : ""}"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });
}

function stationKm(feature) {
  const p = feature?.properties || {};
  const value = Number(p.KM_ROUTE ?? p.MEAS);

  if (!Number.isFinite(value)) {
    throw new Error(
      `Ga ${p.STATION_NAME ?? "không rõ tên"} không có KM_ROUTE/MEAS hợp lệ.`
    );
  }

  return value;
}

function describePositionByKm(stations, currentKm, reverse) {
  const n = stations.length;

  if (n < 2) {
    return {
      currentStation: null,
      nextStation: null,
      segmentProgress: 0,
      distanceToNextKm: 0
    };
  }

  const firstKm = stationKm(stations[0]);
  const lastKm = stationKm(stations[n - 1]);

  // Clamp to route range.
  const km = Math.max(firstKm, Math.min(lastKm, currentKm));

  // At or beyond terminal.
  if (!reverse && km >= lastKm) {
    return {
      currentStation: stations[n - 1],
      nextStation: null,
      segmentProgress: 1,
      distanceToNextKm: 0
    };
  }

  if (reverse && km <= firstKm) {
    return {
      currentStation: stations[0],
      nextStation: null,
      segmentProgress: 1,
      distanceToNextKm: 0
    };
  }

  // Find the two stations bracketing the current M value.
  for (let i = 0; i < n - 1; i++) {
    const lower = stations[i];
    const upper = stations[i + 1];

    const kmA = stationKm(lower);
    const kmB = stationKm(upper);

    if (km >= kmA && km <= kmB) {
      const span = Math.max(kmB - kmA, 0.000001);

      if (!reverse) {
        return {
          currentStation: lower,
          nextStation: upper,
          segmentProgress: (km - kmA) / span,
          distanceToNextKm: Math.max(0, kmB - km)
        };
      }

      return {
        currentStation: upper,
        nextStation: lower,
        segmentProgress: (kmB - km) / span,
        distanceToNextKm: Math.max(0, km - kmA)
      };
    }
  }

  return {
    currentStation: reverse ? stations[n - 1] : stations[0],
    nextStation: reverse ? stations[n - 2] : stations[1],
    segmentProgress: 0,
    distanceToNextKm: 0
  };
}

function stationName(feature) {
  return feature?.properties?.STATION_NAME ?? "-";
}

function renderUpcoming(container, departures, now) {
  const upcoming = departures
    .map(time => ({ time, min: timeToMinutes(time) }))
    .filter(x => x.min >= now)
    .slice(0, 4);

  if (!upcoming.length) {
    container.innerHTML = `<div class="empty-state" style="grid-column:1/-1">Hết chuyến hôm nay</div>`;
    return;
  }

  container.innerHTML = upcoming
    .map(x => `<div class="departure-time">${x.time}</div>`)
    .join("");
}

function createTrainPopup(trip, progress, currentKm, locationInfo, totalKm) {
  const pct = Math.round(progress * 100);

  const currentName = stationName(locationInfo.currentStation);
  const nextName = locationInfo.nextStation
    ? stationName(locationInfo.nextStation)
    : "Ga cuối";

  const segmentPct = Math.round(locationInfo.segmentProgress * 100);

  const etaMin = locationInfo.nextStation
    ? Math.max(0, (locationInfo.distanceToNextKm / totalKm) * TRIP_MINUTES)
    : 0;

  return `
    <div class="popup-title">🚇 ${trip.id}</div>
    <div class="popup-line">Hướng: <span class="popup-value">${trip.direction}</span></div>
    <div class="popup-line">Xuất bến: <span class="popup-value">${trip.depart}</span></div>
    <div class="popup-line">Lý trình ước tính: <span class="popup-value">Km ${currentKm.toFixed(3)}</span></div>
    <div class="popup-line">Đoạn hiện tại: <span class="popup-value">${currentName} → ${nextName}</span></div>
    <div class="popup-line">Ga kế tiếp: <span class="popup-value">${nextName}</span></div>
    <div class="popup-line">Còn đến ga: <span class="popup-value">${locationInfo.distanceToNextKm.toFixed(3)} km</span></div>
    <div class="popup-line">Tiến độ đoạn: <span class="popup-value">${segmentPct}%</span></div>
    <div class="popup-line">Tiến độ toàn tuyến: <span class="popup-value">${pct}%</span></div>
    <div class="popup-line">ETA ga kế tiếp: <span class="popup-value">~${etaMin.toFixed(1)} phút</span></div>
    <div class="popup-line">Nguồn vị trí: <span class="popup-value">lịch chạy + Linear Referencing ArcGIS</span></div>
  `;
}

async function main() {
  try {
    const [lineRes, stationRes, timetableRes] = await Promise.all([
      fetch("data/metro_line1.geojson"),
      fetch("data/metro_stations_km.geojson"),
      fetch("data/metro_timetable_weekday_2026.json")
    ]);

    if (!lineRes.ok || !stationRes.ok || !timetableRes.ok) {
      throw new Error("Không tải được đủ dữ liệu tuyến / ga / lịch.");
    }

    const lineData = await lineRes.json();
    const stationData = await stationRes.json();
    const timetable = await timetableRes.json();

    // Route glow / casing
    const routeGlow = L.geoJSON(lineData, {
      style: {
        color: "#38d7ff",
        weight: 14,
        opacity: 0.10,
        lineCap: "round",
        lineJoin: "round"
      }
    }).addTo(map);

    const routeOuter = L.geoJSON(lineData, {
      style: {
        color: "#07111f",
        weight: 8,
        opacity: 0.88,
        lineCap: "round",
        lineJoin: "round"
      }
    }).addTo(map);

    const routeMain = L.geoJSON(lineData, {
      style: {
        color: "#38d7ff",
        weight: 4,
        opacity: 0.98,
        lineCap: "round",
        lineJoin: "round"
      }
    }).addTo(map);

    const stationFeatures = [...stationData.features].sort(
      (a, b) => stationKm(a) - stationKm(b)
    );

    if (stationFeatures.length !== 14) {
      console.warn(`Số ga hiện có: ${stationFeatures.length}, dự kiến: 14.`);
    }

    const routeStartKm = stationKm(stationFeatures[0]);
    const routeEndKm = stationKm(stationFeatures[stationFeatures.length - 1]);
    const totalRouteKm = routeEndKm - routeStartKm;

    if (!(totalRouteKm > 0)) {
      throw new Error("KM_ROUTE của các ga không tạo thành một tuyến tăng dần hợp lệ.");
    }

    const stationLayer = L.featureGroup();

    stationFeatures.forEach((feature, index) => {
      const [lon, lat] = feature.geometry.coordinates;
      const p = feature.properties || {};
      const isTerminal = index === 0 || index === stationFeatures.length - 1;

      const marker = L.marker([lat, lon], {
        icon: stationIcon(isTerminal),
        keyboard: false
      });

      marker.bindTooltip(
        `${p.STATION_NO ?? ""}. ${p.STATION_NAME ?? "Ga Metro"}`,
        {
          className: "metro-tooltip",
          direction: "top",
          offset: [0, -8]
        }
      );

      const kmLabel = stationKm(feature).toFixed(3);

      marker.bindPopup(
        `<div class="popup-title">${p.STATION_NAME ?? "Ga Metro"}</div>
         <div class="popup-line">Mã ga: <span class="popup-value">${p.STATION_ID ?? "-"}</span></div>
         <div class="popup-line">Thứ tự: <span class="popup-value">${p.STATION_NO ?? "-"}</span></div>
         <div class="popup-line">Loại ga: <span class="popup-value">${p.STATION_TYPE ?? "-"}</span></div>
         <div class="popup-line">Lý trình: <span class="popup-value">Km ${kmLabel}</span></div>`,
        { className: "metro-popup" }
      );

      marker.addTo(stationLayer);
    });

    stationLayer.addTo(map);

    ui.stationCount.textContent = stationFeatures.length;

    const allLayers = L.featureGroup([routeMain, stationLayer]);
    map.fitBounds(allLayers.getBounds().pad(0.07));

    const route = buildRoute(getRouteCoordinates(lineData));
    const trips = buildTrips(timetable);

    const btDepartures =
      timetable.directions.BEN_THANH_TO_SUOI_TIEN.departures;

    const stDepartures =
      timetable.directions.SUOI_TIEN_TO_BEN_THANH.departures;

    function focusTrain(id) {
      const marker = trainMarkers.get(id);
      if (!marker) return;
      map.flyTo(marker.getLatLng(), Math.max(map.getZoom(), 14), {
        duration: 0.8
      });
      marker.openPopup();
    }

    function update() {
      const now = nowMinutes();

      const active = trips
        .map(trip => {
          const elapsed = now - trip.departMin;
          if (elapsed < 0 || elapsed > TRIP_MINUTES) return null;

          const raw = elapsed / TRIP_MINUTES;
          const routeProgress = trip.reverse ? 1 - raw : raw;

          // M-value/KM_ROUTE increases from Bến Thành -> Suối Tiên.
          const currentKm =
            routeStartKm + routeProgress * totalRouteKm;

          const locationInfo =
            describePositionByKm(stationFeatures, currentKm, trip.reverse);

          return {
            trip,
            elapsed,
            routeProgress,
            tripProgress: raw,
            currentKm,
            locationInfo
          };
        })
        .filter(Boolean);

      const activeIds = new Set(active.map(x => x.trip.id));

      for (const [id, marker] of trainMarkers.entries()) {
        if (!activeIds.has(id)) {
          map.removeLayer(marker);
          trainMarkers.delete(id);
        }
      }

      for (const x of active) {
        const pos = pointAt(route, x.routeProgress);
        let marker = trainMarkers.get(x.trip.id);

       if (!marker) {
  marker = L.marker(pos, {
    icon: trainIcon(x.trip.css),
    zIndexOffset: 1000
  }).addTo(map);

  // Cho phép click vào tàu để mở thông tin
  marker.bindPopup("", {
    className: "metro-popup",
    maxWidth: 330,
    minWidth: 260,
    closeButton: true
  });

  trainMarkers.set(x.trip.id, marker);

} else {
  marker.setLatLng(pos);
}

// Nội dung popup được cập nhật liên tục theo vị trí tàu
marker.setPopupContent(
  createTrainPopup(
    x.trip,
    x.tripProgress,
    x.currentKm,
    x.locationInfo,
    totalRouteKm
  )
);
      }

      const bt = active.filter(x => !x.trip.reverse);
      const st = active.filter(x => x.trip.reverse);

      ui.active.textContent = active.length;
      ui.bt.textContent = bt.length;
      ui.st.textContent = st.length;
      ui.serviceState.textContent = active.length ? "ON" : "IDLE";

      renderUpcoming(ui.nextBT, btDepartures, now);
      renderUpcoming(ui.nextST, stDepartures, now);

      if (!active.length) {
        ui.activeList.innerHTML =
          `<div class="empty-state">Hiện không có chuyến nằm trong cửa sổ hành trình.</div>`;
      } else {
        ui.activeList.innerHTML = active
          .sort((a, b) => a.trip.departMin - b.trip.departMin)
          .map(x => `
            <div class="train-row" data-train="${x.trip.id}">
              <span class="train-bullet ${x.trip.css}"></span>
              <div>
                <strong>${x.trip.id} · ${x.trip.shortDirection}</strong><br>
                <span>
                  Km ${x.currentKm.toFixed(3)} ·
                  ${stationName(x.locationInfo.currentStation)}
                  →
                  ${x.locationInfo.nextStation ? stationName(x.locationInfo.nextStation) : "Ga cuối"}
                </span>
              </div>
              <span class="train-progress">${Math.round(x.tripProgress * 100)}%</span>
            </div>
          `)
          .join("");

        document.querySelectorAll(".train-row").forEach(row => {
          row.addEventListener("click", () => focusTrain(row.dataset.train));
        });
      }

      ui.subtitle.textContent =
        `${active.length} lượt đang trên tuyến • ${stationFeatures.length} ga • ${totalRouteKm.toFixed(3)} km (GIS)`;

      ui.status.textContent =
        `ArcGIS Linear Referencing • ${active.length} lượt đang hoạt động`;
    }

    update();
    setInterval(update, 1000);

  } catch (error) {
    console.error(error);
    ui.status.textContent = "Lỗi tải dữ liệu Metro.";
    ui.subtitle.textContent = "Không thể nạp dữ liệu.";
  }
}

updateClock();
setInterval(updateClock, 1000);
main();
