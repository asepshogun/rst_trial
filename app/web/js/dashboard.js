(function () {
  "use strict";

  var app = window.VehicleCountApp;
  var FONT = '"Inter", system-ui, sans-serif';

  /* ── palette ──────────────────────────────────────────────── */
  var C = {
    accent:  "oklch(0.50 0.20 252)",
    green:   "oklch(0.60 0.16 155)",
    amber:   "oklch(0.74 0.14 70)",
    violet:  "oklch(0.58 0.18 295)",
    red:     "oklch(0.62 0.20 25)",
    ink3:    "oklch(0.58 0.010 250)",
    ink:     "oklch(0.20 0.015 250)",
    line:    "oklch(0.92 0.006 250)",
  };

  var GOLONGAN_SHADES = [
    "oklch(0.50 0.20 252)", "oklch(0.60 0.18 252)", "oklch(0.70 0.15 252)",
    "oklch(0.78 0.10 252)", "oklch(0.83 0.07 252)", "oklch(0.87 0.05 252)",
    "oklch(0.91 0.03 252)", "oklch(0.95 0.02 252)",
    "#10B981", "#F59E0B", "#8B5CF6", "#EF4444",
  ];

  var SITE_CATEGORY_GROUPS = [
    { key: "cars",        label: "Cars & light",  codes: ["2", "3", "4"],                color: "#3B82F6" },
    { key: "motorcycles", label: "Motorcycles",   codes: ["1"],                          color: "#22C55E" },
    { key: "trucks",      label: "Trucks",        codes: ["6a", "6b", "7a", "7b", "7c"], color: "#EF4444" },
    { key: "buses",       label: "Buses",         codes: ["5a", "5b"],                   color: "#F59E0B" },
    { key: "nonmotor",    label: "Non-motorized", codes: ["8"],                          color: "#94A3B8" },
  ];
  var SITE_HEAVY_CODES = ["5a", "5b", "6a", "6b", "7a", "7b", "7c"];
  var SITE_VEHICLE_ICONS = {
    "1": "ti-motorbike", "2": "ti-car", "3": "ti-car", "4": "ti-truck",
    "5a": "ti-bus", "5b": "ti-bus",
    "6a": "ti-truck", "6b": "ti-truck", "7a": "ti-truck", "7b": "ti-truck", "7c": "ti-truck",
    "8": "ti-bike",
  };
  var _siteCategoryChart = null;

  var gridOpts = {
    borderColor: C.line, strokeDashArray: 4,
    padding: { top: 4, right: 8, bottom: 0, left: 4 },
  };

  var STATUS_MAP = {
    processed:  { label: "Done",       cls: "sb-done" },
    processing: { label: "Processing", cls: "sb-processing" },
    uploaded:   { label: "Uploaded",   cls: "sb-uploaded" },
    converting: { label: "Converting", cls: "sb-converting" },
    failed:     { label: "Failed",     cls: "sb-failed" },
    pending:    { label: "Pending",    cls: "sb-uploaded" },
    queued:     { label: "Queued",     cls: "sb-queued" },
  };

  var STATUS_LABEL_ID = {
    processed: "Done", processing: "Processing", uploaded: "Uploaded",
    converting: "Converting", failed: "Failed", pending: "Pending", queued: "Queued",
  };

  /* ── helpers ──────────────────────────────────────────────── */
  function trunc(s, n) { return s && s.length > n ? s.slice(0, n - 1) + "…" : s || ""; }

  function animCount(id, target) {
    var el = document.getElementById(id);
    if (!el) return;
    var t0 = performance.now();
    (function tick(now) {
      var p = Math.min((now - t0) / 1000, 1);
      el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))).toLocaleString("en-US");
      if (p < 1) requestAnimationFrame(tick);
    })(performance.now());
  }

  function setText(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; }

  function showEmpty(chartId, emptyId) {
    var c = document.getElementById(chartId), e = document.getElementById(emptyId);
    if (c) c.classList.add("d-none");
    if (e) e.classList.remove("d-none");
  }

  function destroyChart(ref) {
    if (ref) { try { ref.destroy(); } catch (_) {} }
    return null;
  }

  /* ── sparklines ───────────────────────────────────────────── */
  function sparkline(elId, data, color) {
    var el = document.getElementById(elId);
    if (!el) return;
    new ApexCharts(el, {
      chart: { 
        type: "area", 
        height: 48, 
        sparkline: { enabled: true }, 
        animations: { 
          enabled: true, 
          easing: "easeinout", 
          speed: 800 
        },
        dropShadow: {
          enabled: true,
          top: 3,
          left: 0,
          blur: 3,
          opacity: 0.18,
          color: color
        }
      },
      series: [{ data: data }],
      stroke: { curve: "smooth", width: 2.5 },
      fill: { type: "gradient", gradient: { shadeIntensity: 1, opacityFrom: 0.25, opacityTo: 0, stops: [0, 100] } },
      colors: [color],
      tooltip: { enabled: false },
    }).render();
  }

  /* ════════════════════════════════════════════════════════════
     VOLUME PER LOKASI
  ════════════════════════════════════════════════════════════ */
  var _volLokasiChart = null;
  var _volLokasiSites = [];   /* raw sites array from /api/dashboard/stats */

  window.DashVolLokasi = {
    /* called once on boot with full sites array */
    init: function (sites) {
      _volLokasiSites = sites || [];
      this.filter();
    },

    _dayVal:  "all",
    _sortVal: "desc",

    filter: function () {
      var dayVal  = this._dayVal;
      var sortVal = this._sortVal;

      /* build display data — total_vehicles is the whole-lifetime count per site.
         Day filter is UI-only for now (future: pass to API); we show a simulated
         daily fraction so the chart still reacts meaningfully. */
      var DAY_FACTOR = {
        "all": 1,
        "1": 0.155, "2": 0.150, "3": 0.148,
        "4": 0.160, "5": 0.175, "6": 0.110, "0": 0.102,
      };
      var factor = DAY_FACTOR[dayVal] || 1;

      var data = _volLokasiSites
        .filter(function (s) { return s.total_vehicles >= 0; })
        .map(function (s) {
          return { name: s.name, value: Math.round(s.total_vehicles * factor) };
        });

      /* sort */
      if (sortVal === "desc") data.sort(function (a, b) { return b.value - a.value; });
      else if (sortVal === "asc") data.sort(function (a, b) { return a.value - b.value; });
      else data.sort(function (a, b) { return a.name.localeCompare(b.name); });

      this._render(data);
    },

    _render: function (data) {
      var el = document.getElementById("chart-vol-lokasi");
      if (!el) return;

      if (_volLokasiChart) {
        try { _volLokasiChart.destroy(); } catch (_) {}
        _volLokasiChart = null;
      }

      if (!data || !data.length) {
        showEmpty("chart-vol-lokasi", "chartVolLokasiEmpty");
        return;
      }

      /* tiap bar 32px + padding atas bawah 16px */
      var h = data.length * 34 + 32;

      var maxVal = Math.max.apply(null, data.map(function (d) { return d.value; })) || 1;
      var minVal = Math.min.apply(null, data.map(function (d) { return d.value; })) || 0;
      var spread = maxVal - minVal || 1;

      /* Stretch ratio across actual min–max so even similar values look different.
         ratio=0 (min) → light blue  #BFDBFE = rgb(191,219,254)
         ratio=1 (max) → dark blue   #1D4ED8 = rgb(29,78,216)  */
      var barColors = data.map(function (d) {
        var ratio = (d.value - minVal) / spread;
        var r = Math.round(191 + ratio * (29  - 191));
        var g = Math.round(219 + ratio * (78  - 219));
        var b = Math.round(254 + ratio * (216 - 254));
        return "rgb(" + r + "," + g + "," + b + ")";
      });

      _volLokasiChart = new ApexCharts(el, {
        chart: {
          type: "bar",
          height: h,
          toolbar: { show: false },
          animations: { enabled: true, speed: 350, animateGradually: { enabled: false } },
          fontFamily: FONT,
          sparkline: { enabled: false },
        },
        series: [{ name: "Kendaraan", data: data.map(function (d) { return d.value; }) }],
        plotOptions: {
          bar: {
            horizontal: true,
            borderRadius: 6,
            distributed: true,
            barHeight: "60%",
            dataLabels: { position: "right" },
          },
        },
        colors: barColors,
        fill: {
          type: "solid",
          opacity: 1
        },
        /* nama lokasi di yaxis, dipersingkat */
        xaxis: {
          categories: data.map(function (d) { return d.name; }),
          labels: { 
            show: true,
            style: { fontFamily: FONT, colors: C.slate, fontSize: "11px", fontWeight: 500 },
            formatter: function(v) {
               if (v >= 1000) return (v / 1000).toFixed(1) + "k";
               return String(v);
            }
          },
          axisBorder: { show: true, color: C.line },
          axisTicks: { show: true, color: C.line },
          min: 0,
          max: Math.ceil(maxVal * 1.18),  /* beri ruang untuk data label */
        },
        yaxis: {
          labels: {
            style: { fontSize: "11.5px", fontFamily: FONT, colors: C.ink, fontWeight: 600 },
            maxWidth: 160,
            formatter: function (v) {
              return v && v.length > 22 ? v.slice(0, 22) + "…" : v;
            },
          },
        },
        dataLabels: {
          enabled: false
        },
        legend: { show: false },
        grid: {
          borderColor: "transparent",
          xaxis: { lines: { show: false } },
          yaxis: { lines: { show: false } },
          padding: { top: 0, bottom: 0, left: 10, right: 36 },
        },
        tooltip: {
          style: { fontFamily: FONT },
          x: { show: true },
          y: { formatter: function (v) { return v.toLocaleString("id-ID") + " kendaraan"; } },
        },
      });
      _volLokasiChart.render();
    },
  };

  /* ── GLOBAL CHARTS ────────────────────────────────────────── */

  function renderGolongan(data, elId, emptyId, breakdownId) {
    elId       = elId       || "chart-golongan";
    emptyId    = emptyId    || "chartGolonganEmpty";
    breakdownId = breakdownId || "golonganBreakdown";

    if (!data || !data.length) { showEmpty(elId, emptyId); return; }

    new ApexCharts(document.getElementById(elId), {
      chart: { type: "donut", height: 240, animations: { enabled: false }, fontFamily: FONT },
      series: data.map(function (d) { return d.total; }),
      labels: data.map(function (d) { return "Class " + d.golongan_code; }),
      colors: GOLONGAN_SHADES.slice(0, data.length),
      legend: { position: "right", fontSize: "11px", fontFamily: FONT, offsetY: -4,
        itemMargin: { vertical: 3 }, markers: { size: 7, shape: "circle" } },
      plotOptions: { pie: { donut: { size: "65%", labels: {
        show: true,
        total: { show: true, label: "Total Vehicles", fontSize: "10px", fontFamily: FONT, color: C.ink3,
          formatter: function (w) { return w.globals.seriesTotals.reduce(function (a, b) { return a + b; }, 0).toLocaleString("en-US"); } },
        value: { fontSize: "20px", fontWeight: 700, fontFamily: FONT, formatter: function (v) { return Number(v).toLocaleString("en-US"); } },
      } } } },
      dataLabels: { enabled: false },
      stroke: { width: 0 },
      tooltip: { style: { fontFamily: FONT }, y: { formatter: function (v) { return v.toLocaleString("en-US") + " veh"; } } },
    }).render();

    /* breakdown bars */
    var bdEl = document.getElementById(breakdownId);
    if (!bdEl) return;
    var total = data.reduce(function (s, d) { return s + d.total; }, 0) || 1;
    var top5  = data.slice(0, 5);
    bdEl.innerHTML = top5.map(function (d, i) {
      var pct = ((d.total / total) * 100).toFixed(1);
      var color = GOLONGAN_SHADES[i] || C.accent;
      return '<div class="gb-row">'
        + '<div class="gb-label">Class ' + app.escapeHtml(String(d.golongan_code)) + '</div>'
        + '<div class="gb-bar-track"><div class="gb-bar-fill" style="width:' + pct + '%;background:' + color + '"></div></div>'
        + '<div class="gb-count">' + d.total.toLocaleString("en-US") + '</div>'
        + '</div>';
    }).join("");
  }

  /* ── Site Analysis Panel ─────────────────────────────────── */
  function renderSiteAnalysisPanel(golonganTotals) {
    /* Build totals map: { code → count } */
    var totalsMap = {};
    (golonganTotals || []).forEach(function (d) {
      totalsMap[String(d.golongan_code)] = Number(d.total) || 0;
    });

    var allCodes = Object.keys(totalsMap);
    var totalVehicles = allCodes.reduce(function (s, c) { return s + (totalsMap[c] || 0); }, 0);

    /* ── Overall number ── */
    var overallEl = document.getElementById("siteOverallTotal");
    if (overallEl) overallEl.textContent = totalVehicles.toLocaleString("en-US");

    /* ── Category-grouped bar + legend ── */
    var cats = SITE_CATEGORY_GROUPS.map(function (g) {
      var count = g.codes.reduce(function (s, c) { return s + (totalsMap[c] || 0); }, 0);
      return { label: g.label, color: g.color, count: count };
    });

    var overallBar = document.getElementById("siteOverallBar");
    if (overallBar) {
      overallBar.innerHTML = cats.map(function (c) {
        var pct = totalVehicles > 0 ? (c.count / totalVehicles * 100).toFixed(2) : 0;
        return '<div class="an-overall-bar-seg" style="width:' + pct + '%;background:' + c.color + ';"></div>';
      }).join("");
    }
    var overallLegend = document.getElementById("siteOverallLegend");
    if (overallLegend) {
      overallLegend.innerHTML = cats.map(function (c) {
        var pct = totalVehicles > 0 ? c.count / totalVehicles * 100 : 0;
        var pctStr = pct >= 1 ? Math.round(pct) + "%" : pct.toFixed(1) + "%";
        return '<div class="an-overall-legend-item">'
          + '<span class="an-overall-legend-dot" style="background:' + c.color + ';"></span>'
          + app.escapeHtml(c.label)
          + ' <span class="an-overall-legend-pct">' + pctStr + '</span>'
          + '</div>';
      }).join("");
    }

    /* ── Distribution list (per golongan_code sorted by count) ── */
    var distBody = document.getElementById("siteDistributionBody");
    if (distBody) {
      var sorted = (golonganTotals || []).slice().sort(function (a, b) {
        if (!a.total && b.total) return 1;
        if (a.total && !b.total) return -1;
        return (b.total || 0) - (a.total || 0);
      });
      distBody.innerHTML = sorted.map(function (d) {
        var code  = String(d.golongan_code);
        var count = Number(d.total) || 0;
        var pct   = totalVehicles > 0 ? (count / totalVehicles * 100) : 0;
        var pctStr = pct >= 1 ? Math.round(pct) + "%" : pct.toFixed(1) + "%";
        var icon  = SITE_VEHICLE_ICONS[code] || "ti-car";
        var cat   = SITE_CATEGORY_GROUPS.find(function (g) { return g.codes.indexOf(code) !== -1; });
        var barColor = cat ? cat.color : C.accent;
        return '<div class="an-dist-row' + (count === 0 ? " is-zero" : "") + '">'
          + '<div class="an-dist-rank">' + app.escapeHtml(code) + '</div>'
          + '<div class="an-dist-icon"><i class="ti ' + icon + '"></i></div>'
          + '<div class="an-dist-name">' + app.escapeHtml(d.golongan_label || ("Class " + code)) + '</div>'
          + '<div class="an-dist-bar-wrap"><div class="an-dist-bar" style="width:' + pct.toFixed(1) + '%;background:' + barColor + ';"></div></div>'
          + '<div class="an-dist-count">' + count.toLocaleString("en-US") + '</div>'
          + '<div class="an-dist-pct">' + pctStr + '</div>'
          + '</div>';
      }).join("");
    }

    /* ── Mini stats ── */
    var busiest = (golonganTotals || []).reduce(function (best, d) {
      return (!best || d.total > best.total) ? d : best;
    }, null);
    var busiestIcon = document.getElementById("siteBusiestClassIcon");
    var busiestLabel = document.getElementById("siteBusiestClassLabel");
    var busiestSub = document.getElementById("siteBusiestClassSub");
    if (busiestIcon) busiestIcon.className = "ti " + (SITE_VEHICLE_ICONS[busiest ? String(busiest.golongan_code) : ""] || "ti-car");
    if (busiestLabel) busiestLabel.textContent = busiest && busiest.total > 0 ? (busiest.golongan_label || ("Class " + busiest.golongan_code)) : "—";
    if (busiestSub) busiestSub.textContent = (busiest && busiest.total > 0 && totalVehicles > 0)
      ? busiest.total.toLocaleString("en-US") + " · " + Math.round(busiest.total / totalVehicles * 100) + "%"
      : "—";

    var detectedCount = (golonganTotals || []).filter(function (d) { return d.total > 0; }).length;
    var totalClasses  = (golonganTotals || []).length;
    var noDetect      = totalClasses - detectedCount;
    var classValEl    = document.getElementById("siteClassesDetectedValue");
    var classSubEl    = document.getElementById("siteClassesDetectedSub");
    if (classValEl) classValEl.textContent = totalVehicles > 0 ? detectedCount + " of " + totalClasses : "—";
    if (classSubEl) classSubEl.textContent = totalVehicles > 0
      ? (noDetect > 0 ? noDetect + " " + (noDetect === 1 ? "class" : "classes") + " with no detections" : "All classes detected")
      : "—";

    var heavyCount = SITE_HEAVY_CODES.reduce(function (s, c) { return s + (totalsMap[c] || 0); }, 0);
    var heavyPct   = totalVehicles > 0 ? Math.round(heavyCount / totalVehicles * 100) : 0;
    var heavyValEl = document.getElementById("siteHeavyVehiclesValue");
    var heavySubEl = document.getElementById("siteHeavyVehiclesSub");
    if (heavyValEl) heavyValEl.textContent = totalVehicles > 0 ? heavyCount.toLocaleString("en-US") : "—";
    if (heavySubEl) heavySubEl.textContent = totalVehicles > 0 ? "Trucks + buses · " + heavyPct + "%" : "—";

    /* ── Category donut chart ── */
    var chartEl = document.getElementById("siteCategoryChart");
    if (_siteCategoryChart && typeof _siteCategoryChart.destroy === "function") {
      _siteCategoryChart.destroy();
      _siteCategoryChart = null;
    }
    if (chartEl && window.ApexCharts) {
      if (!totalVehicles) {
        chartEl.innerHTML = '<div class="text-muted py-4 text-center" style="font-size:.875rem;">No analysis data yet.</div>';
      } else {
        _siteCategoryChart = new ApexCharts(chartEl, {
          chart: { type: "donut", height: 220, fontFamily: FONT, animations: { enabled: true, speed: 420 } },
          series: cats.map(function (c) { return c.count; }),
          labels: cats.map(function (c) { return c.label; }),
          colors: cats.map(function (c) { return c.color; }),
          plotOptions: { pie: { donut: { size: "68%", labels: {
            show: true,
            total: { show: true, label: "VEHICLES", fontSize: "10px", fontWeight: 700, color: "#94A3B8",
              formatter: function () { return totalVehicles.toLocaleString("en-US"); } },
            value: { show: true, fontSize: "22px", fontWeight: 800, color: "#0F172A", offsetY: 5,
              formatter: function (val) { return Number(val).toLocaleString("en-US"); } },
          } } } },
          dataLabels: { enabled: false },
          legend: { show: false },
          stroke: { show: false },
          tooltip: { theme: "light", y: { formatter: function (v) { return v.toLocaleString("en-US") + " vehicles"; } } },
        });
        _siteCategoryChart.render();
      }
    }

    /* ── Category legend ── */
    var legendEl = document.getElementById("siteCategoryLegend");
    if (legendEl) {
      legendEl.innerHTML = cats.map(function (c) {
        var pct = totalVehicles > 0 ? c.count / totalVehicles * 100 : 0;
        var pctStr = pct >= 1 ? Math.round(pct) + "%" : pct.toFixed(1) + "%";
        return '<div class="an-cat-legend-row">'
          + '<span class="an-cat-legend-dot" style="background:' + c.color + ';"></span>'
          + '<span class="an-cat-legend-label">' + app.escapeHtml(c.label) + '</span>'
          + '<span class="an-cat-legend-count">' + c.count.toLocaleString("en-US") + '</span>'
          + '<span class="an-cat-legend-pct">' + pctStr + '</span>'
          + '</div>';
      }).join("");
    }
  }

  /* ── Heatmap ──────────────────────────────────────────────── */
  var _heatmapChart = null;
  var _heatmapMonth = null;
  var _heatmapWeek  = null;

  /* Mark active item inside a dash-dropdown-menu by data attribute key/value */
  function _hmSetDropdownActive(dataKey, val) {
    document.querySelectorAll('[data-' + dataKey + ']').forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset[dataKey.replace(/-([a-z])/g, function(_, c){ return c.toUpperCase(); })] === String(val));
    });
  }

  window.HeatmapPeriod = {
    setAll: function () {
      _heatmapMonth = null;
      _heatmapWeek  = null;
      /* reset month dropdown label + active items */
      var mLabel = document.getElementById("heatmapMonthLabel");
      var wLabel = document.getElementById("heatmapWeekLabel");
      if (mLabel) mLabel.textContent = "Pilih Bulan";
      if (wLabel) wLabel.textContent = "Pilih Minggu";
      _hmSetDropdownActive("hm-month", "");
      _hmSetDropdownActive("hm-week", "");
      /* disable week btn */
      var wBtn = document.getElementById("heatmapWeekBtn");
      if (wBtn) { wBtn.disabled = true; wBtn.classList.remove("dash-pill-btn--active"); }
      /* activate Semua pill */
      var pill = document.getElementById("heatmapPillAll");
      if (pill) pill.classList.add("dash-pill-btn--active");
      var mBtn = document.getElementById("heatmapMonthBtn");
      if (mBtn) mBtn.classList.remove("dash-pill-btn--active");
      fetchAndRenderHeatmap();
    },

    setMonth: function (val, label) {
      _heatmapMonth = val ? parseInt(val, 10) : null;
      _heatmapWeek  = null;
      var mLabel = document.getElementById("heatmapMonthLabel");
      var wLabel = document.getElementById("heatmapWeekLabel");
      if (mLabel) mLabel.textContent = label || "Pilih Bulan";
      if (wLabel) wLabel.textContent = "Pilih Minggu";
      _hmSetDropdownActive("hm-month", val || "");
      _hmSetDropdownActive("hm-week", "");
      /* toggle week btn enable/disable */
      var wBtn = document.getElementById("heatmapWeekBtn");
      if (wBtn) { wBtn.disabled = !_heatmapMonth; wBtn.classList.remove("dash-pill-btn--active"); }
      /* pill states */
      var pill = document.getElementById("heatmapPillAll");
      if (pill) pill.classList.toggle("dash-pill-btn--active", !_heatmapMonth);
      var mBtn = document.getElementById("heatmapMonthBtn");
      if (mBtn) mBtn.classList.toggle("dash-pill-btn--active", !!_heatmapMonth);
      fetchAndRenderHeatmap();
    },

    setWeek: function (val, label) {
      _heatmapWeek = val ? parseInt(val, 10) : null;
      var wLabel = document.getElementById("heatmapWeekLabel");
      if (wLabel) wLabel.textContent = label || "Pilih Minggu";
      _hmSetDropdownActive("hm-week", val || "");
      var wBtn = document.getElementById("heatmapWeekBtn");
      if (wBtn) wBtn.classList.toggle("dash-pill-btn--active", !!_heatmapWeek);
      fetchAndRenderHeatmap();
    },
  };

  function renderHeatmap(series) {
    var el = document.getElementById("chart-heatmap");
    var emptyEl = document.getElementById("chartHeatmapEmpty");
    if (!el) return;

    _heatmapChart = destroyChart(_heatmapChart);
    el.innerHTML = "";

    var hasData = series && series.length && series.some(function (s) {
      return s.data && s.data.some(function (d) { return d.y > 0; });
    });
    if (!hasData) {
      el.style.display = "none";
      if (emptyEl) emptyEl.classList.remove("d-none");
      return;
    }

    el.style.display = "";
    if (emptyEl) emptyEl.classList.add("d-none");

    /* ApexCharts tidak support oklch — pakai hex */
    _heatmapChart = new ApexCharts(el, {
      chart: {
        type: "heatmap",
        height: 340,
        toolbar: { show: false },
        animations: { enabled: false },
        fontFamily: FONT,
      },
      series: series,
      dataLabels: { enabled: false },
      colors: ["#0064E0"],
      plotOptions: {
        heatmap: {
          shadeIntensity: 0.85,
          radius: 3,
          useFillColorAsStroke: false,
          colorScale: {
            ranges: [{ from: 0, to: 0, color: "#F0F4FF", name: "Kosong" }],
          },
        },
      },
      xaxis: {
        type: "category",
        /* hanya tampilkan label kelipatan 3 jam agar tidak berdesakan */
        tickAmount: 8,
        labels: {
          style: { fontSize: "10px", fontFamily: FONT, colors: "#94A3B8" },
          rotate: 0,
          formatter: function (v) {
            if (!v) return "";
            var h = parseInt(v, 10);
            return (isNaN(h) || h % 3 !== 0) ? "" : v;
          },
        },
        axisBorder: { show: false },
        axisTicks: { show: false },
        tooltip: { enabled: false },
      },
      yaxis: {
        labels: {
          style: { fontSize: "11px", fontFamily: FONT, colors: "#1E293B", fontWeight: "600" },
        },
      },
      grid: { padding: { top: 4, right: 12, bottom: 0, left: 4 } },
      stroke: { width: 2, colors: ["#fff"] },
      legend: { show: false },
      tooltip: {
        style: { fontFamily: FONT },
        y: {
          formatter: function (v) {
            return (v || 0).toLocaleString("id-ID") + " kendaraan";
          },
        },
      },
    });
    _heatmapChart.render();
  }

  async function fetchAndRenderHeatmap() {
    try {
      var params = [];
      if (_heatmapMonth) params.push("month=" + _heatmapMonth);
      if (_heatmapWeek)  params.push("week="  + _heatmapWeek);
      var qs = params.length ? "?" + params.join("&") : "";
      var res = await app.apiFetch("/api/dashboard/heatmap" + qs);

      /* update subtitle label inside card */
      var labelEl = document.getElementById("heatmapLabel");
      if (labelEl) {
        if (res.label && res.label !== "Semua Data") {
          labelEl.textContent = res.label;
          labelEl.classList.remove("d-none");
        } else {
          labelEl.classList.add("d-none");
        }
      }

      renderHeatmap(res.heatmap || []);
    } catch (_) {
      showEmpty("chart-heatmap", "chartHeatmapEmpty");
    }
  }

  /* ═══════════════════════════════════════════════════════════
     LEAFLET MAP — sama persis dengan landing page
  ═══════════════════════════════════════════════════════════ */

  var LINE_COLOR  = { high: "#EF4444", medium: "#F59E0B", low: "#22C55E", none: "#94A3B8" };
  var LINE_WEIGHT = { high: 7, medium: 6, low: 5, none: 4 };
  var MARKER_COLOR = { high: "#EF4444", medium: "#F59E0B", low: "#22C55E", none: "#94A3B8" };
  var BADGE_BG   = { high: "rgba(239,68,68,.12)",  medium: "rgba(245,158,11,.12)", low: "rgba(34,197,94,.12)",  none: "rgba(148,163,184,.12)" };
  var BADGE_TEXT = { high: "#DC2626",               medium: "#B45309",              low: "#16A34A",              none: "#64748B" };
  var TIER_LABEL = { high: "High Volume", medium: "Medium Volume", low: "Low Volume", none: "No data yet" };

  var dashMap = null;
  var siteMarkers = {};   // site_id → L.marker
  var currentSiteId = null;

  function getTier(v, maxV) {
    if (!v || v <= 0) return "none";
    var r = v / (maxV || 1);
    return r >= 0.66 ? "high" : r >= 0.33 ? "medium" : "low";
  }

  /* Generate "inner" offset point ~500m along given cardinal direction */
  function innerPoint(lat, lng, dirLabel) {
    var d = (dirLabel || "").toLowerCase();
    var delta = 0.0045; // ~500m
    if (d.includes("utara") || d.includes("north") || d.includes("lembang") || d.includes("cisarua"))
      return [lat + delta, lng];
    if (d.includes("selatan") || d.includes("south") || d.includes("soreang") || d.includes("dayeuh"))
      return [lat - delta, lng];
    if (d.includes("timur") || d.includes("east") || d.includes("sumedang") || d.includes("cileunyi"))
      return [lat, lng + delta];
    if (d.includes("barat") || d.includes("west") || d.includes("jakarta") || d.includes("cimahi"))
      return [lat, lng - delta];
    /* default: offset north-east */
    return [lat + delta * 0.7, lng + delta * 0.7];
  }

  async function fetchOsrmRoute(siteId, lat, lng, innerLat, innerLng) {
    var key = "dash_osrm_v2_" + siteId;
    var cached = sessionStorage.getItem(key);
    if (cached) return JSON.parse(cached);

    var url = "https://router.project-osrm.org/route/v1/driving/" +
      lng + "," + lat + ";" + innerLng + "," + innerLat +
      "?overview=full&geometries=geojson";

    var res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    var data = await res.json();
    if (data.code !== "Ok" || !data.routes || !data.routes[0]) throw new Error("No route");

    var coords = data.routes[0].geometry.coordinates.map(function (c) { return [c[1], c[0]]; });
    sessionStorage.setItem(key, JSON.stringify(coords));
    return coords;
  }

  function trimCoords(coords, frac) {
    frac = frac || 0.45;
    var end = Math.max(2, Math.ceil(coords.length * frac));
    return coords.slice(0, end);
  }

  function drawRoute(coords, tier) {
    if (!dashMap) return;
    L.polyline(coords, {
      color:    LINE_COLOR[tier]  || "#94A3B8",
      weight:   LINE_WEIGHT[tier] || 5,
      opacity:  0.85,
      lineCap:  "round",
      lineJoin: "round",
    }).addTo(dashMap);
  }

  function drawFallback(lat, lng, innerLat, innerLng, tier) {
    if (!dashMap) return;
    L.polyline([[lat, lng], [innerLat, innerLng]], {
      color: LINE_COLOR[tier] || "#94A3B8",
      weight: LINE_WEIGHT[tier] || 5,
      opacity: 0.55,
      dashArray: "8 5",
    }).addTo(dashMap);
  }

  function makeMarkerIcon(tier) {
    var iconHtml = '<div class="dash-site-marker dash-site-marker--' + tier + '"><i class="ti ti-camera" style="font-size:.85rem;line-height:1;"></i></div>';
    return L.divIcon({ html: iconHtml, className: "", iconSize: [34, 34], iconAnchor: [17, 17], popupAnchor: [0, -20] });
  }

  function makePopupHtml(site, tier) {
    return '<div class="dash-popup-inner">'
      + '<div class="dash-popup-header">'
      + '<span class="dash-popup-name">' + app.escapeHtml(site.name) + '</span>'
      + '<span class="dash-popup-badge" style="background:' + BADGE_BG[tier] + ';color:' + BADGE_TEXT[tier] + ';">● ' + TIER_LABEL[tier] + '</span>'
      + '</div>'
      + (site.location_description ? '<div class="dash-popup-sub">' + app.escapeHtml(site.location_description) + '</div>' : "")
      + '<div class="dash-popup-row"><span>Total vehicles</span><strong>' + site.total_vehicles.toLocaleString("en-US") + '</strong></div>'
      + '<div class="dash-popup-row"><span>Analysis videos</span><strong>' + site.video_count + '</strong></div>'
      + '<div class="dash-popup-actions">'
      + '<button class="dash-popup-btn dash-popup-btn--primary" onclick="DashSite.load(\'' + site.site_id + '\')">'
      + '<i class="ti ti-chart-bar"></i> View Detail</button>'
      + '<button class="dash-popup-btn dash-popup-btn--ghost" onclick="if(window._dashMap)window._dashMap.closePopup()">'
      + '<i class="ti ti-x"></i> Close</button>'
      + '</div>'
      + '</div>';
  }

  function initMap(sites) {
    var withCoords = sites.filter(function (s) { return s.latitude != null && s.longitude != null; });

    dashMap = L.map("dash-map", { scrollWheelZoom: false, zoomControl: false });
    window._dashMap = dashMap;

    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 19,
    }).addTo(dashMap);

    L.control.zoom({ position: "bottomright" }).addTo(dashMap);

    if (!withCoords.length) {
      dashMap.setView([-6.917, 107.619], 12);
      /* show hint overlay so user knows how to add coordinates */
      var hint = L.control({ position: "topright" });
      hint.onAdd = function () {
        var div = L.DomUtil.create("div");
        div.style.cssText = "background:#fff;border-radius:10px;padding:10px 14px;font-size:.78rem;color:#334155;box-shadow:0 2px 8px rgba(0,0,0,.12);max-width:220px;line-height:1.45;";
        div.innerHTML = '<i class="ti ti-map-pin" style="color:#0064E0;margin-right:4px;"></i><strong>No coordinates set</strong><br>Select a site from the dropdown, then click <em>Edit Coordinates</em> to add a map marker.';
        return div;
      };
      hint.addTo(dashMap);
      return;
    }

    var maxV = Math.max.apply(null, withCoords.map(function (s) { return s.total_vehicles; }).concat([1]));

    withCoords.forEach(function (site) {
      var tier = getTier(site.total_vehicles, maxV);
      var marker = L.marker([site.latitude, site.longitude], { icon: makeMarkerIcon(tier) });
      marker.bindPopup(makePopupHtml(site, tier), { maxWidth: 300, className: "dash-map-popup" });
      marker.addTo(dashMap);
      siteMarkers[site.site_id] = marker;

      /* draw OSRM route */
      var inner = innerPoint(site.latitude, site.longitude, site.location_description || "");
      fetchOsrmRoute(site.site_id, site.latitude, site.longitude, inner[0], inner[1])
        .then(function (coords) { drawRoute(trimCoords(coords, 0.45), tier); })
        .catch(function ()      { drawFallback(site.latitude, site.longitude, inner[0], inner[1], tier); });
    });

    /* fit bounds */
    var bounds = withCoords.map(function (s) { return [s.latitude, s.longitude]; });
    if (bounds.length === 1) {
      dashMap.setView(bounds[0], 15);
    } else {
      dashMap.fitBounds(L.latLngBounds(bounds), { padding: [60, 60] });
    }

    /* pill strip */
    var pillsEl = document.getElementById("dashMapPills");
    if (pillsEl) {
      withCoords.forEach(function (site) {
        var tier = getTier(site.total_vehicles, maxV);
        var pill = document.createElement("button");
        pill.className = "dash-map-pill";
        pill.dataset.siteId = site.site_id;
        pill.innerHTML = '<span class="dash-map-pill-dot" style="background:' + MARKER_COLOR[tier] + '"></span>' + app.escapeHtml(site.name);
        pill.addEventListener("click", function () {
          /* fly to + open popup */
          dashMap.flyTo([site.latitude, site.longitude], 16, { duration: 1.1 });
          setTimeout(function () {
            var m = siteMarkers[site.site_id];
            if (m) m.openPopup();
          }, 1200);
          /* load site data */
          DashSite.load(site.site_id);
          /* highlight pill */
          document.querySelectorAll(".dash-map-pill").forEach(function (p) { p.classList.remove("active"); });
          pill.classList.add("active");
        });
        pillsEl.appendChild(pill);
      });
    }
  }

  /* ═══════════════════════════════════════════════════════════
     SITE DETAIL SECTION
  ═══════════════════════════════════════════════════════════ */

  var siteFdCharts = { vk: null, qk: null, vq: null };

  window.DashSite = {
    load: function (siteId) {
      if (!siteId) return;
      currentSiteId = siteId;

      /* sync site selector label */
      var _syncLabel = document.getElementById("siteSelectorLabel");
      if (_syncLabel && siteId) {
        var _activeBtn = document.querySelector('[data-site-id="' + siteId + '"]');
        if (_activeBtn) _syncLabel.textContent = _activeBtn.textContent.trim();
      }

      /* show section, scroll to it */
      var section = document.getElementById("siteSection");
      section.classList.remove("d-none");
      setTimeout(function () {
        section.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);

      /* show loading */
      document.getElementById("siteLoading").classList.remove("d-none");
      document.getElementById("siteContent").classList.add("d-none");

      /* highlight pill */
      document.querySelectorAll(".dash-map-pill").forEach(function (p) {
        p.classList.toggle("active", p.dataset.siteId === siteId);
      });

      fetchSiteDetail(siteId)
        .then(function (data) { DashSite.render(data); })
        .catch(function (err) {
          document.getElementById("siteLoading").classList.add("d-none");
          var sec = document.getElementById("siteSection");
          var alertDiv = document.createElement("div");
          alertDiv.className = "alert alert-danger mb-3";
          alertDiv.textContent = "Failed to load site data: " + (err.message || "");
          sec.prepend(alertDiv);
        });
    },

    render: function (data) {
      var site = data.site;
      var summary = data.summary;

      /* header */
      DashSite._currentSite = site;

      setText("siteName", site.name);
      setText("siteDesc", site.location_description || site.code);
      
      /* dynamically update all headers referring to 'This Site' */
      document.querySelectorAll(".dynamic-site-name").forEach(function(el) {
        el.textContent = site.name || "This Site";
      });

      /* sync site selector label */
      var _lbl = document.getElementById("siteSelectorLabel");
      if (_lbl) _lbl.textContent = site.name || "— Select Site —";

      /* stat cards */
      animCount("siteStatVideos",   summary.video_count);
      animCount("siteStatVehicles", summary.total_vehicles);
      animCount("siteStatAvg",      summary.avg_vehicles_per_video);
      setText("siteStatProcessed", summary.processed_count + " analysed");

      if (data.fd_result && data.fd_result.greenshields_vf) {
        setText("siteStatFd",    data.fd_result.greenshields_vf.toFixed(1));
        setText("siteStatFdSub", "vf km/h (Greenshields)");
      } else {
        setText("siteStatFd",    "—");
        setText("siteStatFdSub", "No FD computed yet");
      }

      /* destroy old site charts */
      siteFdCharts.vk = destroyChart(siteFdCharts.vk);
      siteFdCharts.qk = destroyChart(siteFdCharts.qk);
      siteFdCharts.vq = destroyChart(siteFdCharts.vq);
      if (_siteCategoryChart && typeof _siteCategoryChart.destroy === "function") {
        _siteCategoryChart.destroy();
        _siteCategoryChart = null;
      }

      /* analysis panel per site */
      renderSiteAnalysisPanel(data.golongan_totals);

      /* analyses table */
      DashSite.renderTable(data.recent_analyses, site.site_id);

      /* FD */
      DashSite.renderFd(data.fd_result);

      /* show content */
      document.getElementById("siteLoading").classList.add("d-none");
      document.getElementById("siteContent").classList.remove("d-none");
    },

    renderTopVideos: function (data) {
      if (!data || !data.length) {
        showEmpty("site-chart-top-videos", "siteChartTopVideosEmpty");
        return;
      }
      var h = Math.max(240, data.length * 44 + 60);
      new ApexCharts(document.getElementById("site-chart-top-videos"), {
        chart: { type: "bar", height: h, toolbar: { show: false }, animations: { enabled: false }, fontFamily: FONT },
        series: [{ name: "Vehicles", data: data.map(function (d) { return d.total_vehicles; }) }],
        xaxis: {
          categories: data.map(function (d) { return trunc(d.filename, 32); }),
          labels: { style: { fontSize: "11px", fontFamily: FONT }, formatter: function (v) { return Number(v).toLocaleString("en-US"); } },
          axisBorder: { show: false }, axisTicks: { show: false },
        },
        yaxis: { labels: { formatter: function (v) { return (v / 1000).toFixed(0) + "k"; }, style: { fontSize: "11px", fontFamily: FONT } } },
        colors: [C.accent],
        plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: "56%" } },
        dataLabels: {
          enabled: true,
          formatter: function (v) { return v.toLocaleString("en-US"); },
          style: { fontSize: "10.5px", fontFamily: FONT, colors: ["#fff"] },
          offsetX: -8,
        },
        grid: Object.assign({}, gridOpts, { yaxis: { lines: { show: false } } }),
        tooltip: {
          x: { formatter: function (v, o) { return data[o.dataPointIndex] ? data[o.dataPointIndex].filename : v; } },
          y: { formatter: function (v) { return v.toLocaleString("en-US") + " vehicles"; } },
          style: { fontFamily: FONT },
        },
      }).render();
    },

    renderTable: function (analyses, siteId) {
      _siteAnalysesData = analyses || [];
      _siteAnalysesPage = 1;
      DashSite._applySiteSort();
    },

    renderFd: function (fd) {
      var loadEl    = document.getElementById("siteFdLoading");
      var emptyEl   = document.getElementById("siteFdEmpty");
      var contentEl = document.getElementById("siteFdContent");

      if (loadEl)    loadEl.style.display    = "none";
      if (emptyEl)   emptyEl.classList.add("d-none");
      if (contentEl) contentEl.classList.add("d-none");

      if (!fd) {
        if (emptyEl) emptyEl.classList.remove("d-none");
        return;
      }

      /* values */
      setText("siteFdVf",   fd.greenshields_vf   ? fd.greenshields_vf.toFixed(1)   : "—");
      setText("siteFdKj",   fd.greenshields_kj   ? fd.greenshields_kj.toFixed(1)   : "—");
      setText("siteFdQmax", fd.greenshields_q_cap ? Math.round(fd.greenshields_q_cap).toLocaleString("en-US") : "—");
      setText("siteFdSubtitle", trunc(fd.filename || "", 50) + " · " + fd.direction + " · D=" + fd.line_spacing_m + "m");
      setText("siteFdMetaPairs",    (fd.matched_pairs_count || 0).toLocaleString("en-US"));
      setText("siteFdMetaInterval", fd.interval_s + " detik");
      setText("siteFdMetaSpacing",  fd.line_spacing_m + " m");
      setText("siteFdMetaDir",      fd.direction);
      setText("siteFdMetaDate",     fd.created_at ? new Date(fd.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—");

      /* destroy old */
      siteFdCharts.vk = destroyChart(siteFdCharts.vk);
      siteFdCharts.qk = destroyChart(siteFdCharts.qk);
      siteFdCharts.vq = destroyChart(siteFdCharts.vq);
      ["siteFdChartVK", "siteFdChartQK", "siteFdChartVQ"].forEach(function (id) {
        var el = document.getElementById(id); if (el) el.innerHTML = "";
      });

      var intervals = fd.intervals_json || [];
      var vf = fd.greenshields_vf, kj = fd.greenshields_kj;
      var scatterVK = intervals.map(function (r) { return { x: r.density_k, y: r.speed_v }; });
      var scatterQK = intervals.map(function (r) { return { x: r.density_k, y: r.flow_q }; });
      var scatterVQ = intervals.map(function (r) { return { x: r.flow_q,    y: r.speed_v }; });

      function fdChartOpts(elId, series, xTitle, yTitle) {
        return {
          chart: { type: "line", height: 260, toolbar: { show: false }, animations: { enabled: false }, zoom: { enabled: false }, fontFamily: FONT },
          series: series,
          stroke: { width: series.map(function (s) { return s.type === "scatter" ? 0 : 2; }), curve: "smooth" },
          markers: {
            size:         series.map(function (s) { return s.type === "scatter" ? 3.5 : 0; }),
            colors:       ["rgba(0,100,224,.12)"],
            strokeColors: ["rgba(0,100,224,.65)"],
            strokeWidth:  1.5,
          },
          colors: [C.accent, C.red],
          xaxis: {
            type: "numeric",
            title: { text: xTitle, style: { fontSize: "11px", fontFamily: FONT, color: C.ink3, fontWeight: 500 }, offsetY: 4 },
            labels: { style: { fontSize: "10.5px", fontFamily: FONT }, formatter: function (v) { return (+v).toFixed(1); } },
            axisBorder: { show: false }, axisTicks: { show: false }, tickAmount: 5,
          },
          yaxis: {
            title: { text: yTitle, style: { fontSize: "11px", fontFamily: FONT, color: C.ink3, fontWeight: 500 } },
            labels: { style: { fontSize: "10.5px", fontFamily: FONT }, formatter: function (v) { return (+v).toFixed(1); } },
          },
          grid: gridOpts,
          legend: { show: series.length > 1, fontSize: "11px", fontFamily: FONT, markers: { size: 6 }, itemMargin: { horizontal: 10 } },
          tooltip: { shared: false, intersect: true, style: { fontFamily: FONT } },
        };
      }

      var N = 80;
      var seriesVK = [{ name: "Observasi", type: "scatter", data: scatterVK }];
      var seriesQK = [{ name: "Observasi", type: "scatter", data: scatterQK }];
      if (vf && kj) {
        var lineVK = [], lineQK = [];
        for (var i = 0; i <= N; i++) {
          var k = (kj * i) / N;
          lineVK.push({ x: +k.toFixed(4), y: +Math.max(0, vf - (vf / kj) * k).toFixed(4) });
          lineQK.push({ x: +k.toFixed(4), y: +Math.max(0, vf * k - (vf / kj) * k * k).toFixed(4) });
        }
        seriesVK.push({ name: "Model Greenshields", type: "line", data: lineVK });
        seriesQK.push({ name: "Model Greenshields", type: "line", data: lineQK });
      }

      siteFdCharts.vk = new ApexCharts(document.getElementById("siteFdChartVK"), fdChartOpts("siteFdChartVK", seriesVK, "k  (veh/km)", "v  (km/h)"));
      siteFdCharts.vk.render();

      siteFdCharts.qk = new ApexCharts(document.getElementById("siteFdChartQK"), fdChartOpts("siteFdChartQK", seriesQK, "k  (veh/km)", "q  (veh/h)"));
      siteFdCharts.qk.render();

      siteFdCharts.vq = new ApexCharts(document.getElementById("siteFdChartVQ"), {
        chart: { type: "scatter", height: 260, toolbar: { show: false }, animations: { enabled: false }, zoom: { enabled: false }, fontFamily: FONT },
        series: [{ name: "Observasi", data: scatterVQ }],
        markers: { size: 3.5, colors: ["rgba(0,100,224,.12)"], strokeColors: ["rgba(0,100,224,.65)"], strokeWidth: 1.5 },
        colors: [C.accent],
        xaxis: {
          type: "numeric",
          title: { text: "q  (veh/h)", style: { fontSize: "11px", fontFamily: FONT, color: C.ink3, fontWeight: 500 }, offsetY: 4 },
          labels: { style: { fontSize: "10.5px", fontFamily: FONT }, formatter: function (v) { return (+v).toFixed(0); } },
          axisBorder: { show: false }, axisTicks: { show: false }, tickAmount: 5,
        },
        yaxis: {
          title: { text: "v  (km/h)", style: { fontSize: "11px", fontFamily: FONT, color: C.ink3, fontWeight: 500 } },
          labels: { style: { fontSize: "10.5px", fontFamily: FONT }, formatter: function (v) { return (+v).toFixed(1); } },
        },
        grid: gridOpts,
        legend: { show: false },
        tooltip: { shared: false, intersect: true, style: { fontFamily: FONT } },
      });
      siteFdCharts.vq.render();

      if (contentEl) contentEl.classList.remove("d-none");
    },

    _currentSite: null,

    openEditModal: function () {
      var site = DashSite._currentSite;
      if (!site) return;
      var f = function (id) { return document.getElementById(id); };
      if (f("editSiteName"))     f("editSiteName").value     = site.name || "";
      if (f("editSiteDesc"))     f("editSiteDesc").value     = site.location_description || "";
      if (f("editSiteLat"))      f("editSiteLat").value      = site.latitude != null ? site.latitude : "";
      if (f("editSiteLng"))      f("editSiteLng").value      = site.longitude != null ? site.longitude : "";
      if (f("editSiteDirNormal")) f("editSiteDirNormal").value = site.direction_normal_label || "";
      if (f("editSiteDirOpp"))   f("editSiteDirOpp").value   = site.direction_opposite_label || "";
      var alertEl = f("editSiteAlert");
      if (alertEl) alertEl.classList.add("d-none");
      var modal = bootstrap.Modal.getOrCreateInstance(document.getElementById("editSiteModal"));
      modal.show();
    },
  };

  /* ── Edit site submit ────────────────────────────────────── */
  document.addEventListener("DOMContentLoaded", function () {
    var submitBtn = document.getElementById("editSiteSubmit");
    if (!submitBtn) return;
    submitBtn.addEventListener("click", async function () {
      var site = DashSite._currentSite;
      if (!site) return;
      var f = function (id) { return document.getElementById(id); };
      var alertEl = f("editSiteAlert");
      var spinner = f("editSiteSpinner");
      var icon    = f("editSiteIcon");

      var name = (f("editSiteName") || {}).value || "";
      if (!name.trim()) {
        if (alertEl) { alertEl.textContent = "Site name cannot be empty."; alertEl.classList.remove("d-none"); }
        return;
      }
      var lat = f("editSiteLat") && f("editSiteLat").value !== "" ? parseFloat(f("editSiteLat").value) : null;
      var lng = f("editSiteLng") && f("editSiteLng").value !== "" ? parseFloat(f("editSiteLng").value) : null;

      if (alertEl) alertEl.classList.add("d-none");
      submitBtn.disabled = true;
      if (spinner) spinner.classList.remove("d-none");
      if (icon)    icon.classList.add("d-none");

      /* guard: demo sites cannot be saved to API */
      if (site.site_id.startsWith("demo-")) {
        if (alertEl) {
          alertEl.textContent = "Demo Mode: these coordinates are static and cannot be saved. Replace with a real site from the database.";
          alertEl.classList.remove("d-none");
        }
        submitBtn.disabled = false;
        if (spinner) spinner.classList.add("d-none");
        if (icon)    icon.classList.remove("d-none");
        return;
      }
      try {
        await app.apiFetch("/api/dashboard/site/" + site.site_id + "/info", {
          method: "PUT",
          body: JSON.stringify({
            name: name.trim(),
            location_description: (f("editSiteDesc") || {}).value || "",
            latitude: lat,
            longitude: lng,
            direction_normal_label: (f("editSiteDirNormal") || {}).value || "Normal",
            direction_opposite_label: (f("editSiteDirOpp") || {}).value || "Opposite",
          }),
        });
        bootstrap.Modal.getInstance(document.getElementById("editSiteModal")).hide();
        /* clear OSRM cache for this site so new route is fetched */
        sessionStorage.removeItem("dash_osrm_v2_" + site.site_id);
        /* reload the page to re-init map with new coordinates */
        window.location.reload();
      } catch (err) {
        if (alertEl) { alertEl.textContent = err.message || "Failed to save."; alertEl.classList.remove("d-none"); }
      } finally {
        submitBtn.disabled = false;
        if (spinner) spinner.classList.add("d-none");
        if (icon)    icon.classList.remove("d-none");
      }
    });
  });

  /* ── site selector dropdown click ───────────────────────────── */
  document.addEventListener("DOMContentLoaded", function () {
    document.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-site-id]");
      if (!btn) return;
      var siteId = btn.dataset.siteId;
      var label  = btn.textContent.trim();
      /* update active state */
      document.querySelectorAll("[data-site-id]").forEach(function (b) {
        b.classList.toggle("active", b.dataset.siteId === siteId && siteId !== "");
      });
      var lbl = document.getElementById("siteSelectorLabel");
      if (lbl) lbl.textContent = siteId ? label : "— Select Site —";
      if (siteId) DashSite.load(siteId);
    });
  });

  /* ── Dropdown event delegation ───────────────────────────── */
  document.addEventListener("DOMContentLoaded", function () {
    document.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-vol-day]");
      if (btn) {
        var val   = btn.dataset.volDay;
        var label = btn.textContent.trim();
        DashVolLokasi._dayVal = val;
        document.querySelectorAll("[data-vol-day]").forEach(function (b) {
          b.classList.toggle("active", b.dataset.volDay === val);
        });
        var lbl = document.getElementById("volLokasiDayLabel");
        if (lbl) lbl.textContent = label;
        DashVolLokasi.filter();
        return;
      }

      var btn2 = e.target.closest("[data-vol-sort]");
      if (btn2) {
        var val2   = btn2.dataset.volSort;
        var label2 = btn2.textContent.trim();
        DashVolLokasi._sortVal = val2;
        document.querySelectorAll("[data-vol-sort]").forEach(function (b) {
          b.classList.toggle("active", b.dataset.volSort === val2);
        });
        var lbl2 = document.getElementById("volLokasiSortLabel");
        if (lbl2) lbl2.textContent = label2;
        DashVolLokasi.filter();
        return;
      }

      var btn3 = e.target.closest("[data-hm-month]");
      if (btn3) {
        var val3   = btn3.dataset.hmMonth;
        var label3 = btn3.textContent.trim();
        HeatmapPeriod.setMonth(val3, val3 ? label3 : "");
        return;
      }

      var btn4 = e.target.closest("[data-hm-week]");
      if (btn4) {
        var val4   = btn4.dataset.hmWeek;
        var label4 = btn4.textContent.trim();
        HeatmapPeriod.setWeek(val4, val4 ? label4 : "");
        return;
      }

      var btn5 = e.target.closest("[data-site-sort]");
      if (btn5) {
        var val5   = btn5.dataset.siteSort;
        var label5 = btn5.textContent.trim();
        document.querySelectorAll("[data-site-sort]").forEach(function (b) {
          b.classList.toggle("active", b.dataset.siteSort === val5);
        });
        var lbl5 = document.getElementById("siteSortLabel");
        if (lbl5) lbl5.textContent = label5;
        DashSite.sortBy(val5);
        return;
      }
    });
  });

  /* ── Site table sort + pagination state ─────────────────── */
  var _siteSortField    = "started_at";
  var _siteSortAsc      = false;
  var _siteAnalysesData = [];
  var _siteAnalysesPage = 1;
  var PAGE_SIZE         = 10;

  DashSite.sortBy = function (field) {
    if (_siteSortField === field) {
      _siteSortAsc = !_siteSortAsc;
    } else {
      _siteSortField = field;
      _siteSortAsc   = field === "filename" || field === "status";
    }
    _siteAnalysesPage = 1;
    DashSite._applySiteSort();
  };

  DashSite.toggleSortDir = function () {
    _siteSortAsc = !_siteSortAsc;
    _siteAnalysesPage = 1;
    DashSite._applySiteSort();
  };

  DashSite.sortTable = function () {
    DashSite._applySiteSort();
  };

  DashSite._applySiteSort = function () {
    var icon = document.getElementById("siteSortDirIcon");
    if (icon) icon.className = _siteSortAsc ? "ti ti-sort-ascending" : "ti ti-sort-descending";

    document.querySelectorAll(".nc-table .th-sort[data-col]").forEach(function (th) {
      th.classList.toggle("active", th.dataset.col === _siteSortField);
      var ico = th.querySelector(".th-sort-icon");
      if (ico && th.dataset.col === _siteSortField) {
        ico.className = "ti " + (_siteSortAsc ? "ti-sort-ascending" : "ti-sort-descending") + " th-sort-icon";
      } else if (ico) {
        ico.className = "ti ti-selector th-sort-icon";
      }
    });

    var sorted = _siteAnalysesData.slice().sort(function (a, b) {
      var av = a[_siteSortField], bv = b[_siteSortField];
      if (av == null) av = _siteSortAsc ? "￿" : "";
      if (bv == null) bv = _siteSortAsc ? "￿" : "";
      if (typeof av === "number" && typeof bv === "number") return _siteSortAsc ? av - bv : bv - av;
      return _siteSortAsc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });

    DashSite._renderPage(sorted);
  };

  DashSite._renderPage = function (sorted) {
    var tbody  = document.getElementById("siteAnalysesBody");
    var pagDiv = document.getElementById("siteAnalysesPagination");
    if (!tbody) return;

    if (!sorted || !sorted.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-5" style="font-size:.875rem;">No analyses found for this site</td></tr>';
      if (pagDiv) pagDiv.style.setProperty("display", "none", "important");
      return;
    }

    var total  = sorted.length;
    var pages  = Math.ceil(total / PAGE_SIZE);
    if (_siteAnalysesPage > pages) _siteAnalysesPage = pages;
    if (_siteAnalysesPage < 1)     _siteAnalysesPage = 1;
    var start  = (_siteAnalysesPage - 1) * PAGE_SIZE;
    var slice  = sorted.slice(start, start + PAGE_SIZE);

    tbody.innerHTML = slice.map(function (a) {
      var s = STATUS_MAP[a.status] || { label: a.status, cls: "sb-uploaded" };
      return "<tr>"
        + '<td style="font-size:11.5px;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500;" title="' + app.escapeHtml(a.filename) + '">' + app.escapeHtml(trunc(a.filename, 44)) + "</td>"
        + '<td><span class="sbadge ' + s.cls + '">' + s.label + "</span></td>"
        + '<td style="color:var(--nc-ink-3);font-size:12px;white-space:nowrap;">' + app.formatDateTime(a.started_at) + "</td>"
        + '<td style="color:var(--nc-ink-3);font-size:12px;white-space:nowrap;">' + (a.finished_at ? app.formatDateTime(a.finished_at) : "—") + "</td>"
        + '<td style="text-align:right;font-weight:600;">' + (a.total_vehicles ? a.total_vehicles.toLocaleString("en-US") : "—") + "</td>"
        + '<td><a href="/analysis?video=' + app.escapeHtml(a.video_id) + '" class="detail-link">Detail →</a></td>'
        + "</tr>";
    }).join("");

    /* render pagination */
    if (pagDiv) {
      if (pages <= 1) {
        pagDiv.style.setProperty("display", "none", "important");
      } else {
        pagDiv.style.removeProperty("display");
        var info = '<span>' + (start + 1) + '–' + Math.min(start + PAGE_SIZE, total) + ' of ' + total + '</span>';
        var btns = '<div class="dash-pagination-btns">';
        btns += '<button class="dash-page-btn" onclick="DashSite._goPage(' + (_siteAnalysesPage - 1) + ')" ' + (_siteAnalysesPage === 1 ? "disabled" : "") + '><i class="ti ti-chevron-left"></i></button>';
        for (var p = 1; p <= pages; p++) {
          if (pages > 7 && p > 2 && p < pages - 1 && Math.abs(p - _siteAnalysesPage) > 1) {
            if (p === 3 || p === pages - 2) btns += '<button class="dash-page-btn" disabled>…</button>';
            continue;
          }
          btns += '<button class="dash-page-btn' + (p === _siteAnalysesPage ? " active" : "") + '" onclick="DashSite._goPage(' + p + ')">' + p + '</button>';
        }
        btns += '<button class="dash-page-btn" onclick="DashSite._goPage(' + (_siteAnalysesPage + 1) + ')" ' + (_siteAnalysesPage === pages ? "disabled" : "") + '><i class="ti ti-chevron-right"></i></button>';
        btns += '</div>';
        pagDiv.innerHTML = info + btns;
      }
    }
  };

  DashSite._goPage = function (p) {
    _siteAnalysesPage = p;
    DashSite._applySiteSort();
  };

  /* ═══════════════════════════════════════════════════════════
     GLOBAL ANALYSES TABLE (sortable)
  ═══════════════════════════════════════════════════════════ */
  var _globalSortField = "started_at";
  var _globalSortAsc   = false;
  var _globalAnalysesData = [];

  window.DashGlobalTable = {
    setData: function (analyses) {
      _globalAnalysesData = analyses || [];
      this._render();
    },

    sort: function () {
      _globalSortField = (document.getElementById("globalSortField") || {}).value || "started_at";
      this._render();
    },

    sortBy: function (field) {
      if (_globalSortField === field) {
        _globalSortAsc = !_globalSortAsc;
      } else {
        _globalSortField = field;
        _globalSortAsc   = field === "filename" || field === "status";
      }
      var sel = document.getElementById("globalSortField");
      if (sel) sel.value = field;
      this._render();
    },

    toggleDir: function () {
      _globalSortAsc = !_globalSortAsc;
      this._render();
    },

    _render: function () {
      var icon = document.getElementById("globalSortDirIcon");
      if (icon) icon.className = _globalSortAsc ? "ti ti-sort-ascending" : "ti ti-sort-descending";

      var sorted = _globalAnalysesData.slice().sort(function (a, b) {
        var av = a[_globalSortField], bv = b[_globalSortField];
        if (av == null) av = _globalSortAsc ? "￿" : "";
        if (bv == null) bv = _globalSortAsc ? "￿" : "";
        if (typeof av === "number" && typeof bv === "number") return _globalSortAsc ? av - bv : bv - av;
        return _globalSortAsc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
      });

      var tbody = document.getElementById("globalAnalysesBody");
      if (!tbody) return;
      if (!sorted.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-5" style="font-size:.875rem">No analyses found</td></tr>';
        return;
      }
      tbody.innerHTML = sorted.map(function (a) {
        var s = STATUS_MAP[a.status] || { label: a.status, cls: "sb-uploaded" };
        return "<tr>"
          + '<td style="font-size:12px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500;" title="' + app.escapeHtml(a.filename) + '">' + app.escapeHtml(trunc(a.filename, 36)) + "</td>"
          + '<td><span class="sbadge ' + s.cls + '">' + s.label + "</span></td>"
          + '<td style="font-size:12px;color:var(--nc-ink-2);">' + app.escapeHtml(a.site_name || "—") + "</td>"
          + '<td style="color:var(--nc-ink-3);font-size:12px;white-space:nowrap;">' + app.formatDateTime(a.started_at) + "</td>"
          + '<td style="text-align:right;font-weight:600;font-size:12.5px;">' + (a.total_vehicles ? a.total_vehicles.toLocaleString("en-US") : "—") + "</td>"
          + '<td><a href="/analysis?video=' + app.escapeHtml(a.video_id) + '" class="detail-link">Detail →</a></td>'
          + "</tr>";
      }).join("");
    },
  };

  /* ═══════════════════════════════════════════════════════════
     REFRESH
  ═══════════════════════════════════════════════════════════ */
  window.DashRefresh = {
    _running: false,

    run: async function () {
      if (this._running) return;
      this._running = true;
      var btn  = document.getElementById("dashRefreshBtn");
      var icon = document.getElementById("dashRefreshIcon");
      if (btn)  { btn.classList.add("loading"); btn.disabled = true; }
      if (icon) icon.style.animation = "spinIcon .6s linear infinite";

      try {
        var rawData = await app.apiFetch("/api/dashboard/stats");
        var data    = mergeWithDummy(rawData);
        _refreshCharts(data);
        _updateLastRefresh();
      } catch (e) {
        /* silent — keep existing data */
      } finally {
        this._running = false;
        if (btn)  { btn.classList.remove("loading"); btn.disabled = false; }
        if (icon) icon.style.animation = "";
      }
    },
  };

  /* ── Time range selector ─────────────────────────────────── */
  window.DashRange = {
    current: 90,
    set: function (h) {
      this.current = h;
      document.querySelectorAll(".dash-range-pill").forEach(function (btn) {
        btn.classList.toggle("active", parseInt(btn.dataset.range) === h);
      });
      /* future: pass range param to API; for now just refresh data */
      DashRefresh.run();
    },
  };

  function _updateLastRefresh() {
    var el = document.getElementById("lastRefreshTime");
    if (el) {
      var now = new Date();
      var day  = now.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
      var time = now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      el.textContent = day + " · Diperbarui pukul " + time + " WIB";
    }
  }

  /* ── Recent analyses table (global) ──────────────────────── */
  /* not used in new layout — removed */

  /* ═══════════════════════════════════════════════════════════
     FD COMPUTE MODAL (global fallback)
  ═══════════════════════════════════════════════════════════ */
  function initFdModal() {
    var modal = document.getElementById("fdComputeModal");
    if (!modal) return;
    modal.addEventListener("show.bs.modal", function () {
      app.apiFetch("/api/fd/eligible-videos").then(function (videos) {
        var sel = document.getElementById("fdModalVideoSelect");
        if (!sel) return;
        if (!videos || !videos.length) { sel.innerHTML = '<option value="">No eligible videos found</option>'; return; }
        sel.innerHTML = '<option value="">— Select video —</option>'
          + videos.map(function (v) { return '<option value="' + v.video_id + '">' + app.escapeHtml(trunc(v.filename, 58)) + '</option>'; }).join("");
      }).catch(function () {});
    });
    var submitBtn = document.getElementById("fdComputeSubmit");
    if (!submitBtn) return;
    submitBtn.addEventListener("click", async function () {
      var videoId = (document.getElementById("fdModalVideoSelect") || {}).value || "";
      var spacing = parseFloat((document.getElementById("fdLineSpacing") || {}).value || "0");
      var dir     = (document.getElementById("fdDirection")          || {}).value || "normal";
      var itvl    = parseInt( (document.getElementById("fdIntervalS")   || {}).value || "60",  10);
      var maxDt   = parseFloat((document.getElementById("fdMaxMatchDt") || {}).value || "5");
      var minSpd  = parseFloat((document.getElementById("fdMinSpeed")   || {}).value || "1");
      var maxSpd  = parseFloat((document.getElementById("fdMaxSpeed")   || {}).value || "120");
      var alertEl = document.getElementById("fdModalAlert");
      var spinner = document.getElementById("fdComputeSpinner");
      var icon    = document.getElementById("fdComputeIcon");
      if (alertEl) alertEl.classList.add("d-none");
      function setAlert(msg) {
        if (!alertEl) return;
        alertEl.className = "alert alert-danger";
        alertEl.textContent = msg;
        alertEl.classList.remove("d-none");
      }
      if (!videoId)                { setAlert("Please select a video first."); return; }
      if (!spacing || spacing <= 0){ setAlert("Enter a valid line spacing value (> 0 m)."); return; }
      submitBtn.disabled = true;
      if (spinner) spinner.classList.remove("d-none");
      if (icon)    icon.classList.add("d-none");
      try {
        await app.apiFetch("/api/fd/compute/" + videoId, {
          method: "POST",
          body: JSON.stringify({ line_spacing_m: spacing, direction: dir, interval_s: itvl, max_match_dt_s: maxDt, min_speed_kmh: minSpd, max_speed_kmh: maxSpd }),
        });
        bootstrap.Modal.getInstance(modal)?.hide();
        if (currentSiteId) DashSite.load(currentSiteId);
      } catch (err) {
        setAlert(err.message || "Computation failed.");
      } finally {
        submitBtn.disabled = false;
        if (spinner) spinner.classList.add("d-none");
        if (icon)    icon.classList.remove("d-none");
      }
    });
  }

  /* ═══════════════════════════════════════════════════════════
     DUMMY DATA — dipakai jika data real kosong/null
     Sections marked [DEMO] below are static.
  ═══════════════════════════════════════════════════════════ */
  var DUMMY_SITES = [
    /* [DEMO] coordinates, names, and directions below are static */
    {
      site_id: "demo-site-1",
      name: "Jl. Soekarno-Hatta (Timur)",
      code: "SHT-01",
      location_description: "Depan Ruko Setrasari, arah ke Cileunyi",
      latitude: -6.9396,
      longitude: 107.6300,
      total_vehicles: 4820,
      video_count: 12,
      direction_normal_label: "Arah Timur / Cileunyi",
      direction_opposite_label: "Arah Barat / Cimahi",
    },
    {
      site_id: "demo-site-2",
      name: "Jl. Sudirman (Selatan)",
      code: "SDM-02",
      location_description: "Simpang Dago, menuju Soreang",
      latitude: -6.9040,
      longitude: 107.6138,
      total_vehicles: 3210,
      video_count: 8,
      direction_normal_label: "Arah Selatan / Soreang",
      direction_opposite_label: "Arah Utara / Lembang",
    },
    {
      site_id: "demo-site-3",
      name: "Jl. Asia Afrika (Barat)",
      code: "AAF-03",
      location_description: "Alun-alun Bandung, menuju Cimahi",
      latitude: -6.9211,
      longitude: 107.6063,
      total_vehicles: 1950,
      video_count: 5,
      direction_normal_label: "Arah Barat / Cimahi",
      direction_opposite_label: "Arah Timur / Kota",
    },
  ];

  var DUMMY_GOLONGAN = [
    /* [DEMO] static vehicle class distribution */
    { golongan_code: "1",  golongan_label: "Motorcycle",    total: 5840 },
    { golongan_code: "2",  golongan_label: "Sedan",         total: 2310 },
    { golongan_code: "3",  golongan_label: "SUV / MPV",     total: 1540 },
    { golongan_code: "4",  golongan_label: "Minibus",       total:  820 },
    { golongan_code: "5a", golongan_label: "Small Bus",     total:  460 },
    { golongan_code: "6a", golongan_label: "2-Axle Truck",  total:  210 },
  ];

  var DUMMY_STATUS = [
    /* [DEMO] */
    { status: "processed", count: 18 },
    { status: "uploaded",  count: 4 },
    { status: "failed",    count: 2 },
  ];

  var DUMMY_TOP_VIDEOS = [
    /* [DEMO] */
    { video_id: "v1", filename: "SHT_20240512_pagi.mp4",  status: "processed", total_vehicles: 1240 },
    { video_id: "v2", filename: "SHT_20240512_siang.mp4", status: "processed", total_vehicles: 1080 },
    { video_id: "v3", filename: "SDM_20240513_pagi.mp4",  status: "processed", total_vehicles:  970 },
    { video_id: "v4", filename: "AAF_20240514_sore.mp4",  status: "processed", total_vehicles:  850 },
    { video_id: "v5", filename: "SHT_20240515_sore.mp4",  status: "processed", total_vehicles:  680 },
  ];

  /* Dummy site-detail per site_id — [DEMO] all values below are static */
  var DUMMY_SITE_DETAIL = {
    "demo-site-1": {
      site: DUMMY_SITES[0],
      summary: { video_count: 12, processed_count: 10, total_vehicles: 4820, avg_vehicles_per_video: 482 },
      golongan_totals: [
        { golongan_code: "1",  golongan_label: "Motorcycle",  total: 2410 },
        { golongan_code: "2",  golongan_label: "Sedan",   total:  960 },
        { golongan_code: "3",  golongan_label: "SUV / MPV", total:  640 },
        { golongan_code: "4",  golongan_label: "Minibus",       total:  410 },
        { golongan_code: "5a", golongan_label: "Small Bus",     total:  230 },
        { golongan_code: "6a", golongan_label: "2-Axle Truck",  total:  170 },
      ],
      top_videos: [
        { video_id: "v1", filename: "SHT_pagi.mp4",  status: "processed", total_vehicles: 1240 },
        { video_id: "v2", filename: "SHT_siang.mp4", status: "processed", total_vehicles: 1080 },
        { video_id: "v3", filename: "SHT_sore.mp4",  status: "processed", total_vehicles:  960 },
        { video_id: "v4", filename: "SHT_malam.mp4", status: "processed", total_vehicles:  540 },
      ],
      recent_analyses: [
        { job_id: "j1", video_id: "v1", filename: "SHT_pagi.mp4",  status: "completed", started_at: "2024-05-12T06:00:00", finished_at: "2024-05-12T06:12:00", total_vehicles: 1240 },
        { job_id: "j2", video_id: "v2", filename: "SHT_siang.mp4", status: "completed", started_at: "2024-05-12T11:00:00", finished_at: "2024-05-12T11:09:00", total_vehicles: 1080 },
        { job_id: "j3", video_id: "v3", filename: "SHT_sore.mp4",  status: "completed", started_at: "2024-05-12T15:00:00", finished_at: "2024-05-12T15:14:00", total_vehicles:  960 },
      ],
      fd_result: {
        /* [DEMO] static Greenshields parameters */
        id: "fd-demo-1", video_id: "v1", filename: "SHT_pagi.mp4",
        line_spacing_m: 5, direction: "normal", interval_s: 60,
        greenshields_vf: 62.4, greenshields_kj: 148.0, greenshields_q_cap: 2306,
        matched_pairs_count: 84,
        intervals_json: (function () {
          var arr = [];
          for (var k = 5; k <= 130; k += 5) {
            var v = Math.max(0, 62.4 - (62.4 / 148.0) * k) + (Math.random() - 0.5) * 6;
            var q = Math.max(0, 62.4 * k - (62.4 / 148.0) * k * k) + (Math.random() - 0.5) * 80;
            arr.push({ density_k: +k.toFixed(1), speed_v: +Math.max(0, v).toFixed(1), flow_q: +Math.max(0, q).toFixed(0) });
          }
          return arr;
        })(),
        created_at: "2024-05-12T06:12:00",
      },
    },
    "demo-site-2": {
      site: DUMMY_SITES[1],
      summary: { video_count: 8, processed_count: 7, total_vehicles: 3210, avg_vehicles_per_video: 458.6 },
      golongan_totals: [
        { golongan_code: "1",  golongan_label: "Motorcycle",  total: 1680 },
        { golongan_code: "2",  golongan_label: "Sedan",   total:  720 },
        { golongan_code: "3",  golongan_label: "SUV / MPV", total:  480 },
        { golongan_code: "5a", golongan_label: "Small Bus",     total:  200 },
        { golongan_code: "6a", golongan_label: "2-Axle Truck",  total:  130 },
      ],
      top_videos: [
        { video_id: "v5", filename: "SDM_pagi.mp4",  status: "processed", total_vehicles: 970 },
        { video_id: "v6", filename: "SDM_siang.mp4", status: "processed", total_vehicles: 810 },
        { video_id: "v7", filename: "SDM_sore.mp4",  status: "processed", total_vehicles: 720 },
      ],
      recent_analyses: [
        { job_id: "j4", video_id: "v5", filename: "SDM_pagi.mp4",  status: "completed", started_at: "2024-05-13T07:00:00", finished_at: "2024-05-13T07:08:00", total_vehicles: 970 },
        { job_id: "j5", video_id: "v6", filename: "SDM_siang.mp4", status: "completed", started_at: "2024-05-13T12:00:00", finished_at: "2024-05-13T12:11:00", total_vehicles: 810 },
      ],
      fd_result: {
        id: "fd-demo-2", video_id: "v5", filename: "SDM_pagi.mp4",
        line_spacing_m: 5, direction: "normal", interval_s: 60,
        greenshields_vf: 55.8, greenshields_kj: 132.0, greenshields_q_cap: 1841,
        matched_pairs_count: 61,
        intervals_json: (function () {
          var arr = [];
          for (var k = 5; k <= 115; k += 5) {
            var v = Math.max(0, 55.8 - (55.8 / 132.0) * k) + (Math.random() - 0.5) * 5;
            var q = Math.max(0, 55.8 * k - (55.8 / 132.0) * k * k) + (Math.random() - 0.5) * 70;
            arr.push({ density_k: +k.toFixed(1), speed_v: +Math.max(0, v).toFixed(1), flow_q: +Math.max(0, q).toFixed(0) });
          }
          return arr;
        })(),
        created_at: "2024-05-13T07:08:00",
      },
    },
    "demo-site-3": {
      site: DUMMY_SITES[2],
      summary: { video_count: 5, processed_count: 4, total_vehicles: 1950, avg_vehicles_per_video: 487.5 },
      golongan_totals: [
        { golongan_code: "1",  golongan_label: "Motorcycle",  total: 1050 },
        { golongan_code: "2",  golongan_label: "Sedan",   total:  420 },
        { golongan_code: "3",  golongan_label: "SUV / MPV", total:  280 },
        { golongan_code: "4",  golongan_label: "Minibus",       total:  200 },
      ],
      top_videos: [
        { video_id: "v8", filename: "AAF_pagi.mp4", status: "processed", total_vehicles: 850 },
        { video_id: "v9", filename: "AAF_sore.mp4", status: "processed", total_vehicles: 680 },
      ],
      recent_analyses: [
        { job_id: "j6", video_id: "v8", filename: "AAF_pagi.mp4", status: "completed", started_at: "2024-05-14T08:00:00", finished_at: "2024-05-14T08:06:00", total_vehicles: 850 },
      ],
      fd_result: null,
    },
  };

  /* ── helper: merge real data with dummy fallback ────────────── */
  function mergeWithDummy(data) {
    /* sites: pakai real jika ada koordinat, fallback ke dummy */
    var realHasCoords = (data.sites || []).some(function (s) { return s.latitude != null; });
    var sites = realHasCoords ? data.sites : DUMMY_SITES;

    /* stats: pakai real, tapi topup jika 0 */
    var summary = data.summary || {};
    var totalVideos    = summary.total_videos          || DUMMY_STATUS.reduce(function (a, s) { return a + s.count; }, 0);
    var totalVehicles  = summary.total_vehicle_events  || DUMMY_GOLONGAN.reduce(function (a, g) { return a + g.total; }, 0);
    var totalUsers     = summary.total_users           || 3;
    var totalSites     = summary.total_sites           || DUMMY_SITES.length;
    var statusData     = (data.videos_by_status && data.videos_by_status.length) ? data.videos_by_status : DUMMY_STATUS;
    var golonganData   = (data.golongan_totals  && data.golongan_totals.length)  ? data.golongan_totals  : DUMMY_GOLONGAN;
    var topVideosData  = (data.top_videos       && data.top_videos.length)       ? data.top_videos       : DUMMY_TOP_VIDEOS;

    return {
      summary: { total_videos: totalVideos, total_vehicle_events: totalVehicles, total_users: totalUsers, total_sites: totalSites },
      videos_by_status: statusData,
      golongan_totals:  golonganData,
      top_videos:       topVideosData,
      recent_analyses:  data.recent_analyses || [],
      sites:            sites,
      _usedDummySites:  !realHasCoords,
    };
  }

  /* ─────────────────────────────────────────────────────────── */
  /* helper: get site detail — real API first, dummy fallback   */
  async function fetchSiteDetail(siteId) {
    /* if it's a demo site id, return dummy directly */
    if (DUMMY_SITE_DETAIL[siteId]) return DUMMY_SITE_DETAIL[siteId];
    /* try real API */
    return app.apiFetch("/api/dashboard/site/" + siteId);
  }

  /* ── helper: rebuild charts on refresh (no page reload) ──── */
  var _globalChartRefs = { golongan: null, status: null, topSites: null, topVideos: null };

  function _countByStatus(statusArr, status) {
    var found = (statusArr || []).find(function (s) { return s.status === status; });
    return found ? found.count : 0;
  }

  function _refreshCharts(data) {
    var statusArr      = data.videos_by_status || [];
    var processedCount = _countByStatus(statusArr, "processed");
    var convertingCount= _countByStatus(statusArr, "converting");
    var uploadedCount  = _countByStatus(statusArr, "uploaded");
    var analysisCount  = statusArr.reduce(function (a, s) { return a + s.count; }, 0);

    animCount("statAnalyses",   analysisCount);
    animCount("statVehicles",   convertingCount);
    animCount("statProcessed",  processedCount);
    animCount("statSites",      data.summary.total_sites);

    var subA = document.getElementById("statAnalysesSub");
    if (subA) subA.textContent = processedCount + " completed · " + uploadedCount + " queued";

    var subV = document.getElementById("statVehiclesSub");
    if (subV) subV.textContent = convertingCount > 0 ? "sedang dikonversi" : "tidak ada antrian";

    var subP = document.getElementById("statProcessedSub");
    if (subP) {
      var pct = analysisCount ? Math.round((processedCount / analysisCount) * 100) : 0;
      subP.textContent = pct + "% completion rate";
    }

    var tEl = document.getElementById("statAnalysesTrend");
    if (tEl) tEl.innerHTML = analysisCount > 0 ? '<i class="ti ti-trending-up"></i>' + analysisCount + " total" : "";

    /* rebuild global charts */
    DashVolLokasi.init(data.sites);
    fetchAndRenderHeatmap();
  }

  /* ═══════════════════════════════════════════════════════════
     BOOT
  ═══════════════════════════════════════════════════════════ */
  document.addEventListener("DOMContentLoaded", async function () {
    var user = await app.requireSession();
    if (!user) return;
    if (!user.is_admin) { window.location.href = "/videos"; return; }

    var loadEl = document.getElementById("dashLoading");
    var errEl  = document.getElementById("dashError");
    var mainEl = document.getElementById("dashContent");

    try {
      var rawData = await app.apiFetch("/api/dashboard/stats");
      var data    = mergeWithDummy(rawData);

      /* derived counts */
      var statusArr       = data.videos_by_status || [];
      var processedCount  = _countByStatus(statusArr, "processed");
      var convertingCount = _countByStatus(statusArr, "converting");
      var uploadedCount   = _countByStatus(statusArr, "uploaded");
      var analysisCount   = statusArr.reduce(function (a, s) { return a + s.count; }, 0);

      /* stat cards */
      animCount("statAnalyses",  analysisCount);
      animCount("statVehicles",  convertingCount);
      animCount("statProcessed", processedCount);
      animCount("statSites",     data.summary.total_sites);

      var subA = document.getElementById("statAnalysesSub");
      if (subA) subA.textContent = processedCount + " completed · " + uploadedCount + " queued";

      var subV = document.getElementById("statVehiclesSub");
      if (subV) subV.textContent = convertingCount > 0 ? "sedang dikonversi" : "tidak ada antrian";

      var subP = document.getElementById("statProcessedSub");
      if (subP) {
        var pct = analysisCount ? Math.round((processedCount / analysisCount) * 100) : 0;
        subP.textContent = pct + "% completion rate";
      }

      var tEl = document.getElementById("statAnalysesTrend");
      if (tEl && analysisCount > 0) tEl.innerHTML = '<i class="ti ti-trending-up"></i>' + analysisCount + " total";

      /* global charts */
      DashVolLokasi.init(data.sites);

      /* populate site selector dropdown */
      var siteMenu = document.getElementById("siteSelectorMenu");
      if (siteMenu && data.sites && data.sites.length) {
        siteMenu.innerHTML = '<li><button class="dash-dropdown-item" type="button" data-site-id="">— Select Site —</button></li>'
          + data.sites.map(function (s) {
              var label = app.escapeHtml(s.name) + (data._usedDummySites ? " [DEMO]" : "");
              return '<li><button class="dash-dropdown-item" type="button" data-site-id="' + s.site_id + '">' + label + '</button></li>';
            }).join("");
      }

      /* show content first so Leaflet + ApexCharts get real container dimensions */
      if (loadEl) loadEl.classList.add("d-none");
      if (mainEl) mainEl.classList.remove("d-none");

      /* render heatmap AFTER container is visible — ApexCharts needs real height */
      fetchAndRenderHeatmap();

      /* init map AFTER container is visible */
      initMap(data.sites);
      setTimeout(function () { if (dashMap) dashMap.invalidateSize(); }, 100);

      initFdModal();
      _updateLastRefresh();

      /* auto-load first site */
      var firstSite = data.sites[0];
      if (firstSite) DashSite.load(firstSite.site_id);

    } catch (err) {
      if (loadEl) loadEl.classList.add("d-none");
      setText("dashErrorMsg", err.message || "Failed to load dashboard data.");
      if (errEl) errEl.classList.remove("d-none");
    }
  });
})();
