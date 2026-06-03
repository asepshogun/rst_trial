/* ================================================================
   ATCS Kota Bandung — Landing Page JavaScript
   Vanilla JS only — no framework, no bundler
   ================================================================ */

document.addEventListener("DOMContentLoaded", () => {

  /* ── Dummy camera data ──────────────────────────────────────── */
  // TODO: Replace with fetch("/api/cameras") in production
  const CAMERAS = [
    { id:1,  name:"Simpang Dago – Ir. H. Juanda",          lat:-6.8847, lng:107.6100, status:"online",  vehicles:15200 },
    { id:2,  name:"Simpang Lima – Jl. Merdeka",             lat:-6.9175, lng:107.6191, status:"online",  vehicles:8200  },
    { id:3,  name:"Simpang Pasteur – Jl. Dr. Djundjunan",  lat:-6.8971, lng:107.5785, status:"online",  vehicles:13800 },
    { id:4,  name:"Jl. Asia Afrika – Alun-alun",            lat:-6.9218, lng:107.6072, status:"offline", vehicles:0     },
    { id:5,  name:"Simpang Buah Batu – Jl. Terusan",       lat:-6.9499, lng:107.6387, status:"online",  vehicles:10200 },
    { id:6,  name:"Jl. Soekarno-Hatta – Kiaracondong",     lat:-6.9326, lng:107.6560, status:"online",  vehicles:12600 },
    { id:7,  name:"Simpang Antapani – Jl. Jakarta",         lat:-6.9169, lng:107.6638, status:"online",  vehicles:11400 },
    { id:8,  name:"Jl. Sudirman – Kosambi",                 lat:-6.9120, lng:107.5987, status:"offline", vehicles:0     },
    { id:9,  name:"Jl. Setiabudi – UNPAD",                  lat:-6.8740, lng:107.6219, status:"online",  vehicles:7400  },
    { id:10, name:"Simpang Gatot Subroto",                   lat:-6.9065, lng:107.5842, status:"online",  vehicles:9100  },
    { id:11, name:"Jl. Riau – Departemen Store",             lat:-6.9068, lng:107.6302, status:"online",  vehicles:9800  },
    { id:12, name:"Simpang Cicendo – PDAM",                  lat:-6.9052, lng:107.5977, status:"online",  vehicles:8600  },
    { id:13, name:"Jl. Rajawali – Batas Cimahi",             lat:-6.9123, lng:107.5603, status:"online",  vehicles:6800  },
    { id:14, name:"Simpang Pasirkoja – Jl. Astana Anyar",   lat:-6.9352, lng:107.5908, status:"online",  vehicles:7100  },
    { id:15, name:"Jl. Ibrahim Adjie – Kopo",                lat:-6.9445, lng:107.5812, status:"offline", vehicles:0     },
    { id:16, name:"Simpang Leuwipanjang – Terminal",          lat:-6.9562, lng:107.5754, status:"online",  vehicles:6200  },
    { id:17, name:"Jl. Cihampelas – Punclut",                lat:-6.8999, lng:107.5968, status:"online",  vehicles:5900  },
    { id:18, name:"Simpang Suci – Jl. Surapati",             lat:-6.9015, lng:107.6398, status:"online",  vehicles:9800  },
  ];

  /* ── 1. NAVBAR scroll behavior ──────────────────────────────── */
  const navbar = document.getElementById("lpNavbar");
  let lastScroll = 0;
  window.addEventListener("scroll", () => {
    const y = window.scrollY;
    navbar.classList.toggle("scrolled", y > 50);
    lastScroll = y;
  }, { passive: true });

  /* ── 2. Mobile menu ─────────────────────────────────────────── */
  const mobileToggle = document.getElementById("lpMobileToggle");
  const mobileMenu   = document.getElementById("lpMobileMenu");
  if (mobileToggle && mobileMenu) {
    mobileToggle.addEventListener("click", () => {
      mobileMenu.classList.toggle("open");
      const icon = mobileToggle.querySelector("i");
      if (icon) icon.className = mobileMenu.classList.contains("open") ? "ti ti-x" : "ti ti-menu-2";
    });
  }

  /* ── 3. Smooth scroll ───────────────────────────────────────── */
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener("click", e => {
      const target = document.querySelector(link.getAttribute("href"));
      if (!target) return;
      e.preventDefault();
      const offset = 72;
      const top = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: "smooth" });
      if (mobileMenu) {
        mobileMenu.classList.remove("open");
        const icon = mobileToggle && mobileToggle.querySelector("i");
        if (icon) icon.className = "ti ti-menu-2";
      }
    });
  });

  /* ── 4. Active nav highlight on scroll ─────────────────────── */
  const navLinks = document.querySelectorAll(".lp-nav-link[href^='#']");
  const sections = ["beranda","peta","statistik","prediksi","cuaca"].map(id => document.getElementById(id)).filter(Boolean);
  const observer_nav = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.id;
        navLinks.forEach(l => l.classList.toggle("active", l.getAttribute("href") === `#${id}`));
      }
    });
  }, { rootMargin: "-40% 0px -55% 0px" });
  sections.forEach(s => observer_nav.observe(s));

  /* ── 5. Entrance animations ─────────────────────────────────── */
  const observer_anim = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer_anim.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: "0px 0px -40px 0px" });
  document.querySelectorAll(".fade-up").forEach(el => observer_anim.observe(el));

  /* ── 6. Animated counters ───────────────────────────────────── */
  function animateCounter(el, target, duration = 1800) {
    const suffix = el.dataset.suffix || "";
    const isFloat = target !== Math.floor(target);
    let start = null;
    const step = ts => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = Math.round(eased * target);
      el.textContent = value.toLocaleString("id-ID") + suffix;
      if (progress < 1) requestAnimationFrame(step);
      else el.textContent = target.toLocaleString("id-ID") + suffix;
    };
    requestAnimationFrame(step);
  }

  const observer_counter = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const target = Number(el.dataset.count || 0);
        animateCounter(el, target);
        observer_counter.unobserve(el);
      }
    });
  }, { threshold: 0.5 });
  document.querySelectorAll("[data-count]").forEach(el => observer_counter.observe(el));

  /* ── 7. LEAFLET MAP ─────────────────────────────────────────── */
  const mapEl = document.getElementById("lp-map");
  let lpMap = null;
  let currentModalCamId = null;

  if (mapEl && window.L) {
    lpMap = L.map("lp-map", {
      center: [-6.9175, 107.6191],
      zoom: 13,
      zoomControl: false,
    });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 19,
    }).addTo(lpMap);

    L.control.zoom({ position: "bottomright" }).addTo(lpMap);

    function makeCameraIcon(cam) {
      const cls = cam.status === "online" ? "lp-marker--online" : "lp-marker--offline";
      const html = `<div class="lp-marker ${cls}"><i class="ti ti-camera" style="font-size:0.9rem;"></i></div>`;
      return L.divIcon({ html, className: "", iconSize: [32, 32], iconAnchor: [16, 16], popupAnchor: [0, -18] });
    }

    function makePopupHtml(cam) {
      const badge = cam.status === "online"
        ? `<span class="lp-popup-badge lp-popup-badge--online">● Online</span>`
        : `<span class="lp-popup-badge lp-popup-badge--offline">● Offline</span>`;
      return `
        <div class="lp-popup">
          <div class="lp-popup-header">
            <div class="lp-popup-name">${cam.name}</div>
            ${badge}
          </div>
          <div class="lp-popup-preview">
            <i class="ti ti-player-play lp-popup-preview-icon"></i>
            <span class="lp-popup-preview-label">Live stream</span>
          </div>
          <div class="lp-popup-actions">
            <button class="lp-popup-btn lp-popup-btn--primary" onclick="window.lpOpenCameraModal(${cam.id})">
              <i class="ti ti-arrows-maximize"></i> Perbesar
            </button>
            <button class="lp-popup-btn lp-popup-btn--ghost" onclick="if(window.lpMap){window.lpMap.closePopup()}">
              Tutup
            </button>
          </div>
        </div>`;
    }

    CAMERAS.forEach(cam => {
      const marker = L.marker([cam.lat, cam.lng], { icon: makeCameraIcon(cam) });
      marker.bindPopup(makePopupHtml(cam), { maxWidth: 320, className: "" });
      marker.addTo(lpMap);
      cam._marker = marker;
    });

    // Expose map globally for popup buttons
    window.lpMap = lpMap;

    // Camera pills
    const pillsContainer = document.getElementById("lpCameraPills");
    if (pillsContainer) {
      CAMERAS.filter(c => c.status === "online").forEach(cam => {
        const pill = document.createElement("button");
        pill.className = "lp-camera-pill";
        pill.innerHTML = `<span class="lp-camera-pill-dot"></span>${cam.name.split("–")[0].trim()}`;
        pill.addEventListener("click", () => {
          lpMap.flyTo([cam.lat, cam.lng], 16, { duration: 1.2 });
          setTimeout(() => cam._marker && cam._marker.openPopup(), 1400);
        });
        pillsContainer.appendChild(pill);
      });
    }
  }

  /* ── 8. Camera modal ────────────────────────────────────────── */
  window.lpOpenCameraModal = function(camId) {
    const cam = CAMERAS.find(c => c.id === camId);
    if (!cam) return;
    currentModalCamId = camId;

    const nameEl   = document.getElementById("lpModalCamName");
    const locEl    = document.getElementById("lpModalCamLocation");
    const statusEl = document.getElementById("lpModalCamStatus");
    const vehiclesEl = document.getElementById("lpModalCamVehicles");
    const timeEl   = document.getElementById("lpModalCamTime");

    if (nameEl)     nameEl.textContent = cam.name;
    if (locEl)      locEl.textContent  = cam.name;
    if (statusEl)   statusEl.textContent = cam.status === "online" ? "Online" : "Offline";
    if (vehiclesEl) vehiclesEl.textContent = cam.vehicles > 0 ? cam.vehicles.toLocaleString("id-ID") : "-";
    if (timeEl)     timeEl.textContent  = new Date().toLocaleTimeString("id-ID", { hour:"2-digit", minute:"2-digit" });

    if (lpMap) lpMap.closePopup();
    const modalEl = document.getElementById("lpCameraModal");
    if (modalEl && window.bootstrap) {
      bootstrap.Modal.getOrCreateInstance(modalEl).show();
    }
  };

  /* ── 9. APEXCHARTS — lazy init ──────────────────────────────── */
  let chartsInitialized = false;

  function initCharts() {
    if (chartsInitialized || !window.ApexCharts) return;
    chartsInitialized = true;

    const baseTheme = {
      theme: { mode: "light" },
      chart: {
        background: "transparent",
        foreColor: "#64748B",
        fontFamily: "Inter, sans-serif",
        toolbar: { show: false },
        animations: { enabled: true, speed: 600 },
      },
      grid: { borderColor: "#E2E8F0", strokeDashArray: 3 },
      tooltip: {
        theme: "light",
        style: { fontFamily: "Inter, sans-serif" },
      },
    };

    /* A. Volume per Jam (Line chart 24h) */
    const hours = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2,"0")}:00`);
    const motor  = [820,430,210,155,205,420,1250,2850,2430,1820,1450,1220,1540,1620,1440,1225,1830,2650,2830,2040,1430,920,620,415];
    const mobil  = [390,195,98,82,105,210,820,2050,1860,1430,1120,1020,1230,1320,1140,1010,1450,2050,2230,1650,1020,610,305,195];
    const berat  = [105,52,32,22,32,55,155,415,360,285,225,205,258,275,225,205,308,465,495,358,205,125,82,52];
    new ApexCharts(document.getElementById("chartHourly"), {
      ...baseTheme,
      series: [
        { name: "Motor",            data: motor },
        { name: "Mobil",            data: mobil },
        { name: "Kendaraan Berat",  data: berat },
      ],
      chart: { ...baseTheme.chart, type: "line", height: 280 },
      stroke: { curve: "smooth", width: 2.5 },
      colors: ["#3B82F6", "#10B981", "#F59E0B"],
      xaxis: { categories: hours, labels: { rotate: 0, showDuplicates: false,
        formatter: (v, i) => (i % 3 === 0 ? v : ""),
        style: { fontSize: "10px" } } },
      yaxis: { labels: { formatter: v => v >= 1000 ? `${(v/1000).toFixed(1)}k` : v } },
      legend: { position: "top", horizontalAlign: "right" },
    }).render();

    /* B. Distribusi Jenis (Donut) */
    new ApexCharts(document.getElementById("chartDonut"), {
      ...baseTheme,
      series: [68200, 41200, 8960, 5120, 4970],
      labels: ["Gol.1 Motor","Gol.2 Mobil","Gol.3 Sedang","Gol.4 Bus","Gol.5 Truk"],
      chart: { ...baseTheme.chart, type: "donut", height: 280 },
      colors: ["#3B82F6","#10B981","#F59E0B","#A78BFA","#F87171"],
      plotOptions: { pie: { donut: { size: "62%", labels: { show: true,
        total: { show: true, label: "Total", color: "#94A3B8",
          formatter: w => w.globals.seriesTotals.reduce((a,b)=>a+b,0).toLocaleString("id-ID") } } } } },
      dataLabels: { enabled: false },
      legend: { position: "bottom", fontSize: "12px" },
    }).render();

    /* C. Volume per Lokasi (Bar horizontal) */
    const locations = ["Simpang Dago","Simpang Pasteur","Soekarno-Hatta","Simpang Antapani","Simpang Buah Batu","Simpang Suci","Jl. Asia Afrika","Simpang Lima"];
    const locVolume = [15200,13800,12600,11400,10200,9800,8900,8200];
    new ApexCharts(document.getElementById("chartLocation"), {
      ...baseTheme,
      series: [{ name: "Kendaraan", data: locVolume }],
      chart: { ...baseTheme.chart, type: "bar", height: 280 },
      plotOptions: { bar: { borderRadius: 5, horizontal: true, distributed: true, barHeight: "65%" } },
      colors: ["#3B82F6","#2563EB","#1D4ED8","#1E40AF","#1E3A8A","#1D4ED8","#2563EB","#3B82F6"],
      xaxis: { categories: locations, labels: { formatter: v => `${(v/1000).toFixed(1)}k` } },
      dataLabels: { enabled: false },
      legend: { show: false },
    }).render();

    /* D. Tren 7 Hari (Area) */
    const days = ["Senin","Selasa","Rabu","Kamis","Jumat","Sabtu","Minggu"];
    const trend = [98200,112400,108800,125600,121300,115800,128450];
    new ApexCharts(document.getElementById("chartTrend"), {
      ...baseTheme,
      series: [{ name: "Total Kendaraan", data: trend }],
      chart: { ...baseTheme.chart, type: "area", height: 280 },
      stroke: { curve: "smooth", width: 2.5 },
      colors: ["#3B82F6"],
      fill: { type: "gradient", gradient: {
        shadeIntensity: 1, opacityFrom: 0.35, opacityTo: 0.02,
        stops: [0, 90, 100], colorStops: [
          { offset: 0, color: "#3B82F6", opacity: 0.35 },
          { offset: 100, color: "#3B82F6", opacity: 0.02 },
        ]
      }},
      xaxis: { categories: days },
      yaxis: { labels: { formatter: v => `${(v/1000).toFixed(0)}k` } },
      dataLabels: { enabled: false },
    }).render();
  }

  /* Trigger charts when statistik section enters viewport */
  const statistikSection = document.getElementById("statistik");
  if (statistikSection) {
    new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) initCharts();
    }, { threshold: 0.1 }).observe(statistikSection);
  }

  /* ── 10. PRAKIRAAN CUACA — Open-Meteo API ───────────────────── */
  // Bandung: lat -6.9175, lng 107.6191  |  Free, no API key required
  const OPEN_METEO_URL =
    "https://api.open-meteo.com/v1/forecast" +
    "?latitude=-6.9175&longitude=107.6191" +
    "&daily=weathercode,temperature_2m_max,temperature_2m_min" +
    ",precipitation_probability_max,windspeed_10m_max" +
    "&timezone=Asia%2FJakarta&forecast_days=5";

  // WMO Weather Interpretation Codes → label bahasa Indonesia + Tabler icon + warna
  // Semua icon sudah diverifikasi ada di Tabler Icons v3.31.0
  const WMO_MAP = {
    0:  { label: "Cerah",              icon: "ti-sun",         color: "#F59E0B" },
    1:  { label: "Cerah",              icon: "ti-sun",         color: "#F59E0B" },
    2:  { label: "Cerah Berawan",      icon: "ti-sun-wind",    color: "#94A3B8" },
    3:  { label: "Berawan",            icon: "ti-cloud",       color: "#64748B" },
    45: { label: "Berkabut",           icon: "ti-mist",        color: "#94A3B8" },
    48: { label: "Berkabut",           icon: "ti-mist",        color: "#94A3B8" },
    51: { label: "Gerimis",            icon: "ti-cloud-rain",  color: "#60A5FA" },
    53: { label: "Gerimis",            icon: "ti-cloud-rain",  color: "#60A5FA" },
    55: { label: "Gerimis Lebat",      icon: "ti-cloud-rain",  color: "#3B82F6" },
    61: { label: "Hujan Ringan",       icon: "ti-cloud-rain",  color: "#3B82F6" },
    63: { label: "Hujan Sedang",       icon: "ti-cloud-rain",  color: "#2563EB" },
    65: { label: "Hujan Lebat",        icon: "ti-cloud-rain",  color: "#1D4ED8" },
    71: { label: "Hujan Es Ringan",    icon: "ti-cloud-snow",  color: "#BAE6FD" },
    73: { label: "Hujan Es",           icon: "ti-cloud-snow",  color: "#BAE6FD" },
    75: { label: "Hujan Es Lebat",     icon: "ti-cloud-snow",  color: "#BAE6FD" },
    80: { label: "Hujan",              icon: "ti-cloud-rain",  color: "#3B82F6" },
    81: { label: "Hujan Lebat",        icon: "ti-cloud-rain",  color: "#2563EB" },
    82: { label: "Hujan Sangat Lebat", icon: "ti-cloud-rain",  color: "#1D4ED8" },
    85: { label: "Hujan Es",           icon: "ti-cloud-snow",  color: "#BAE6FD" },
    86: { label: "Hujan Es Lebat",     icon: "ti-cloud-snow",  color: "#BAE6FD" },
    95: { label: "Badai Petir",        icon: "ti-cloud-storm", color: "#F59E0B" },
    96: { label: "Badai Petir",        icon: "ti-cloud-storm", color: "#F59E0B" },
    99: { label: "Badai Petir",        icon: "ti-cloud-storm", color: "#EF4444" },
  };

  function getWmoInfo(code) {
    return WMO_MAP[Number(code)] || { label: "Tidak Diketahui", icon: "ti-question-mark", color: "#94A3B8" };
  }

  function formatWeatherDay(dateStr, index) {
    if (index === 0) return "Hari ini";
    if (index === 1) return "Besok";
    // dateStr format: "YYYY-MM-DD" dari Open-Meteo
    const date = new Date(dateStr + "T00:00:00+07:00");
    return date.toLocaleDateString("id-ID", { weekday: "long" });
  }

  function renderWeatherCards(grid, data) {
    const { time, weathercode, temperature_2m_max, temperature_2m_min,
            precipitation_probability_max } = data.daily;

    grid.innerHTML = time.map((dateStr, i) => {
      const wmo     = getWmoInfo(weathercode[i]);
      const dayName = formatWeatherDay(dateStr, i);
      const isToday = i === 0;
      const maxTemp = Math.round(temperature_2m_max[i]);
      const minTemp = Math.round(temperature_2m_min[i]);
      const precip  = precipitation_probability_max[i] ?? 0;

      return `
        <div class="lp-weather-card${isToday ? " lp-weather-card--today" : ""}">
          <div class="lp-weather-day">${dayName}</div>
          <div class="lp-weather-icon" style="color:${wmo.color};"><i class="ti ${wmo.icon}"></i></div>
          <div class="lp-weather-condition"${isToday ? ' style="font-weight:600;"' : ""}>${wmo.label}</div>
          <div class="lp-weather-temp">
            <span class="lp-temp-high">${maxTemp}°</span>
            <span class="lp-temp-low">${minTemp}°</span>
          </div>
          <div class="lp-weather-humidity"><i class="ti ti-umbrella"></i> ${precip}%</div>
        </div>
      `;
    }).join("");
  }

  async function fetchWeather() {
    const grid      = document.getElementById("lpWeatherGrid");
    const updatedEl = document.getElementById("lpWeatherUpdated");
    if (!grid) return;

    // Skeleton loading — 5 placeholder cards
    grid.innerHTML = Array(5).fill(null).map(() => `
      <div class="lp-weather-card lp-weather-skeleton">
        <div class="lp-skel-line lp-skel-line--sm"></div>
        <div class="lp-skel-icon"></div>
        <div class="lp-skel-line lp-skel-line--md"></div>
        <div class="lp-skel-line lp-skel-line--sm"></div>
        <div class="lp-skel-line lp-skel-line--xs"></div>
      </div>
    `).join("");

    try {
      const res = await fetch(OPEN_METEO_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      // Validasi struktur respons Open-Meteo
      if (!data.daily || !Array.isArray(data.daily.time) || !data.daily.time.length) {
        throw new Error("Format data tidak valid");
      }

      renderWeatherCards(grid, data);

      if (updatedEl) {
        const now = new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
        updatedEl.innerHTML =
          `<i class="ti ti-refresh"></i> Diperbarui pukul ${now} · Sumber: <a href="https://open-meteo.com" target="_blank" rel="noopener" style="color:inherit;">Open-Meteo</a>`;
        updatedEl.classList.add("visible");
      }
    } catch (err) {
      console.warn("[NiceCount] Open-Meteo fetch gagal:", err.message);
      grid.innerHTML = `
        <div class="lp-weather-error">
          <i class="ti ti-cloud-off"></i>
          <p>Data cuaca tidak dapat dimuat.<br>Periksa koneksi internet.</p>
        </div>
      `;
    }
  }

  /* ── 11. PREDIKSI KEMACETAN — UI Interactivity ─────────────── */
  (function initPrediksi() {
    const dateInput     = document.getElementById("predDateInput");
    const dayName       = document.getElementById("predDayName");
    const dayHint       = document.getElementById("predDayHint");
    const predCta       = document.getElementById("predCta");
    const predEmpty     = document.getElementById("predEmpty");
    const predRows      = document.getElementById("predRows");
    const resultTitle   = document.getElementById("predResultTitle");
    const resultSub     = document.getElementById("predResultSub");
    if (!dateInput) return;

    const ID_DAYS   = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"];
    const ID_MONTHS = ["Januari","Februari","Maret","April","Mei","Juni",
                       "Juli","Agustus","September","Oktober","November","Desember"];
    const ID_MONTHS_SHORT = ["Jan","Feb","Mar","Apr","Mei","Jun",
                             "Jul","Agt","Sep","Okt","Nov","Des"];
    const TIME_LABEL = { pagi:"Pagi (06–10)", siang:"Siang (10–14)", sore:"Sore (14–18)", malam:"Malam (18–22)" };
    const DAY_HINTS = [
      "Hari Minggu · Lalu lintas biasanya paling ringan",
      "Hari Kerja · Senin cenderung paling padat",
      "Hari Kerja · Waspadai jam sibuk pagi &amp; sore",
      "Hari Kerja · Waspadai jam sibuk pagi &amp; sore",
      "Hari Kerja · Waspadai jam sibuk pagi &amp; sore",
      "Hari Kerja · Jumat sore cenderung lebih macet",
      "Hari Sabtu · Kepadatan lebih rendah dari hari kerja",
    ];

    // Dummy prediction data per time slot
    const PRED_DATA = {
      pagi: [
        { name:"Simpang Dago",         road:"Jl. Ir. H. Juanda",          level:"macet",  vol:92 },
        { name:"Simpang Pasteur",       road:"Jl. Dr. Djundjunan",         level:"macet",  vol:88 },
        { name:"Jl. Setiabudi – UNPAD", road:"Ke arah Lembang",            level:"macet",  vol:84 },
        { name:"Jl. Soekarno-Hatta",    road:"Kiaracondong – Buah Batu",   level:"padat",  vol:74 },
        { name:"Simpang Antapani",       road:"Jl. Jakarta – Jl. Terusan", level:"padat",  vol:68 },
        { name:"Simpang Buah Batu",      road:"Jl. Terusan Buah Batu",     level:"padat",  vol:62 },
        { name:"Simpang Lima Merdeka",   road:"Jl. Asia Afrika",           level:"lancar", vol:40 },
        { name:"Jl. Sudirman",           road:"Kosambi – Cicendo",         level:"lancar", vol:35 },
      ],
      siang: [
        { name:"Simpang Dago",         road:"Jl. Ir. H. Juanda",          level:"padat",  vol:64 },
        { name:"Simpang Pasteur",       road:"Jl. Dr. Djundjunan",         level:"padat",  vol:57 },
        { name:"Simpang Lima Merdeka",   road:"Jl. Asia Afrika",           level:"padat",  vol:61 },
        { name:"Jl. Soekarno-Hatta",    road:"Kiaracondong – Buah Batu",   level:"lancar", vol:44 },
        { name:"Jl. Setiabudi – UNPAD", road:"Ke arah Lembang",            level:"lancar", vol:38 },
        { name:"Simpang Antapani",       road:"Jl. Jakarta – Jl. Terusan", level:"lancar", vol:42 },
        { name:"Simpang Buah Batu",      road:"Jl. Terusan Buah Batu",     level:"padat",  vol:58 },
        { name:"Jl. Sudirman",           road:"Kosambi – Cicendo",         level:"lancar", vol:30 },
      ],
      sore: [
        { name:"Simpang Dago",         road:"Jl. Ir. H. Juanda",          level:"macet",  vol:96 },
        { name:"Jl. Soekarno-Hatta",    road:"Kiaracondong – Buah Batu",   level:"macet",  vol:91 },
        { name:"Simpang Pasteur",       road:"Jl. Dr. Djundjunan",         level:"macet",  vol:89 },
        { name:"Simpang Antapani",       road:"Jl. Jakarta – Jl. Terusan", level:"macet",  vol:85 },
        { name:"Simpang Buah Batu",      road:"Jl. Terusan Buah Batu",     level:"macet",  vol:87 },
        { name:"Simpang Lima Merdeka",   road:"Jl. Asia Afrika",           level:"padat",  vol:70 },
        { name:"Jl. Setiabudi – UNPAD", road:"Ke arah Lembang",            level:"padat",  vol:65 },
        { name:"Jl. Sudirman",           road:"Kosambi – Cicendo",         level:"padat",  vol:60 },
      ],
      malam: [
        { name:"Jl. Soekarno-Hatta",    road:"Kiaracondong – Buah Batu",   level:"padat",  vol:54 },
        { name:"Simpang Lima Merdeka",   road:"Jl. Asia Afrika",           level:"padat",  vol:52 },
        { name:"Simpang Dago",         road:"Jl. Ir. H. Juanda",          level:"lancar", vol:28 },
        { name:"Simpang Pasteur",       road:"Jl. Dr. Djundjunan",         level:"lancar", vol:26 },
        { name:"Simpang Antapani",       road:"Jl. Jakarta – Jl. Terusan", level:"lancar", vol:30 },
        { name:"Simpang Buah Batu",      road:"Jl. Terusan Buah Batu",     level:"lancar", vol:33 },
        { name:"Jl. Setiabudi – UNPAD", road:"Ke arah Lembang",            level:"lancar", vol:22 },
        { name:"Jl. Sudirman",           road:"Kosambi – Cicendo",         level:"padat",  vol:48 },
      ],
    };

    const LEVEL = {
      macet:  { dot:"#EF4444", bar:"#EF4444", badge:"lp-pred-row-badge--red",   label:"Macet Parah" },
      padat:  { dot:"#F59E0B", bar:"#F59E0B", badge:"lp-pred-row-badge--amber", label:"Padat"       },
      lancar: { dot:"#22C55E", bar:"#22C55E", badge:"lp-pred-row-badge--green", label:"Lancar"      },
    };

    // Set default date to today
    dateInput.value = new Date().toISOString().slice(0, 10);
    updateDayCard();

    dateInput.addEventListener("change", updateDayCard);

    function updateDayCard() {
      if (!dateInput.value) return;
      const d = new Date(dateInput.value + "T00:00:00");
      const dow = d.getDay();
      if (dayName) dayName.textContent = `${ID_DAYS[dow]}, ${d.getDate()} ${ID_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
      if (dayHint) dayHint.innerHTML = DAY_HINTS[dow];
    }

    // Time button toggle
    document.querySelectorAll(".lp-pred-time").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".lp-pred-time").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
      });
    });

    // Predict button
    if (predCta) {
      predCta.addEventListener("click", () => {
        if (!dateInput.value) return;
        const d    = new Date(dateInput.value + "T00:00:00");
        const dow  = d.getDay();
        const active = document.querySelector(".lp-pred-time.active");
        const key  = active ? active.dataset.time : "pagi";
        const data = PRED_DATA[key] || PRED_DATA.pagi;

        if (resultTitle) resultTitle.textContent =
          `Prediksi · ${ID_DAYS[dow]} ${d.getDate()} ${ID_MONTHS_SHORT[d.getMonth()]}`;
        if (resultSub) resultSub.textContent = TIME_LABEL[key];

        if (predEmpty) predEmpty.style.display = "none";
        if (predRows) {
          predRows.style.display = "block";
          predRows.innerHTML = data.map(item => {
            const cfg = LEVEL[item.level];
            return `
              <div class="lp-pred-row">
                <span class="lp-pred-row-dot" style="background:${cfg.dot};"></span>
                <div>
                  <div class="lp-pred-row-name">${item.name}</div>
                  <div class="lp-pred-row-road">${item.road}</div>
                </div>
                <div class="lp-pred-row-bar-wrap">
                  <div class="lp-pred-row-bar" style="width:${item.vol}%;background:${cfg.bar};"></div>
                </div>
                <span class="lp-pred-row-badge ${cfg.badge}">${cfg.label}</span>
              </div>`;
          }).join("");
        }
      });
    }
  })();

  // Lazy-load: fetch saat section cuaca masuk viewport (preload 200px sebelum terlihat)
  const cuacaSection = document.getElementById("cuaca");
  if (cuacaSection) {
    const weatherObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        weatherObserver.disconnect(); // hanya fetch sekali
        fetchWeather();
      }
    }, { rootMargin: "200px 0px", threshold: 0 });
    weatherObserver.observe(cuacaSection);
  }

}); // end DOMContentLoaded
