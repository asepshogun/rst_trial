document.addEventListener("DOMContentLoaded", async () => {
  const app = window.VehicleCountApp;
  const videosAlert = document.getElementById("videosAlert");
  const videosTableBody = document.getElementById("videosTableBody");
  const openUploadModalButton = document.getElementById("openUploadModal");
  const uploadForm = document.getElementById("uploadForm");
  const uploadRecordedDateInput = document.getElementById("uploadRecordedDate");
  const uploadRecordedTimeInput = document.getElementById("uploadRecordedTime");
  const uploadSubmitButton = document.getElementById("uploadSubmitButton");

  const uploadVideoModalElement = document.getElementById("uploadVideoModal");
  const previewVideoModalElement = document.getElementById("previewVideoModal");
  const uploadLoadingModalElement = document.getElementById("uploadLoadingModal");
  const uploadSuccessModalElement = document.getElementById("uploadSuccessModal");
  const previewVideoTitle = document.getElementById("previewVideoTitle");
  const previewVideoPlayer = document.getElementById("previewVideoPlayer");
  const previewVideoLoading = document.getElementById("previewVideoLoading");
  const previewVideoError = document.getElementById("previewVideoError");
  const uploadSuccessMessage = document.getElementById("uploadSuccessMessage");

  const uploadVideoModal = window.bootstrap ? window.bootstrap.Modal.getOrCreateInstance(uploadVideoModalElement) : null;
  const previewVideoModal = window.bootstrap ? window.bootstrap.Modal.getOrCreateInstance(previewVideoModalElement) : null;
  const uploadLoadingModal = window.bootstrap ? window.bootstrap.Modal.getOrCreateInstance(uploadLoadingModalElement) : null;
  const uploadSuccessModal = window.bootstrap ? window.bootstrap.Modal.getOrCreateInstance(uploadSuccessModalElement) : null;

  const videoSearchInput  = document.getElementById("videoSearch");
  const videoSortSelect   = document.getElementById("videoSort");       // legacy (null-safe)
  const videoStatusFilter = document.getElementById("videoStatusFilter"); // legacy (null-safe)
  const videoViewGridBtn  = document.getElementById("videoViewGrid");
  const videoViewListBtn  = document.getElementById("videoViewList");
  const videoCountBadge   = document.getElementById("videoCountBadge");
  const videoSortLabel    = document.getElementById("videoSortLabel");
  const videoStatusLabel  = document.getElementById("videoStatusLabel");

  const videosPaginator = document.getElementById("videosPaginator");

  const _savedView = localStorage.getItem("nc_videos_view_mode");
  const state = {
    videos: [],
    pollHandle: null,
    query: "",
    sortOrder: "latest",
    statusFilter: "all",
    viewMode: _savedView === "list" ? "list" : "grid",
    page: 1,
    perPage: 12,
  };

  function syncViewToggle() {
    if (!videoViewGridBtn || !videoViewListBtn) return;
    if (state.viewMode === "list") {
      videoViewListBtn.classList.add("active");
      videoViewGridBtn.classList.remove("active");
    } else {
      videoViewGridBtn.classList.add("active");
      videoViewListBtn.classList.remove("active");
    }
  }

  const ICONS = {
    actions: `
      <span class="app-inline-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="5" r="1.7" fill="currentColor"/>
          <circle cx="12" cy="12" r="1.7" fill="currentColor"/>
          <circle cx="12" cy="19" r="1.7" fill="currentColor"/>
        </svg>
      </span>
    `,
    line: `
      <span class="app-inline-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M4 17h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          <path d="M7 8h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          <circle cx="7" cy="8" r="1.6" fill="currentColor"/>
          <circle cx="17" cy="8" r="1.6" fill="currentColor"/>
          <circle cx="4" cy="17" r="1.6" fill="currentColor"/>
          <circle cx="20" cy="17" r="1.6" fill="currentColor"/>
        </svg>
      </span>
    `,
    analysis: `
      <span class="app-inline-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M5 19V9M12 19V5M19 19v-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      </span>
    `,
    preview: `
      <span class="app-inline-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="m9 7 8 5-8 5V7Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
          <path d="M4 12c2-4 5-6 8-6s6 2 8 6c-2 4-5 6-8 6s-6-2-8-6Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
        </svg>
      </span>
    `,
    delete: `
      <span class="app-inline-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M5 7h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          <path d="M9 7V5h6v2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M8 7l1 12h6l1-12" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
        </svg>
      </span>
    `,
  };

  function getRecordedAtValue(dateInput, timeInput) {
    const dateValue = dateInput ? dateInput.value : "";
    const timeValue = timeInput ? timeInput.value : "";
    if (!dateValue) {
      return "";
    }
    return `${dateValue}T${timeValue || "00:00"}`;
  }

  function resetUploadForm() {
    uploadForm.reset();
    if (uploadRecordedDateInput) {
      uploadRecordedDateInput.value = "";
    }
    if (uploadRecordedTimeInput) {
      uploadRecordedTimeInput.value = "";
    }
  }

  function stopPolling() {
    if (state.pollHandle) {
      window.clearInterval(state.pollHandle);
      state.pollHandle = null;
    }
  }

  function shouldPollVideos() {
    return state.videos.some((video) => {
      const analysisStatus = video.analysis_job ? video.analysis_job.status : "pending";
      return ["converting", "processing"].includes(video.status) || ["queued", "processing"].includes(analysisStatus);
    });
  }

  function ensurePolling() {
    stopPolling();
    if (!shouldPollVideos()) {
      return;
    }
    state.pollHandle = window.setInterval(async () => {
      try {
        await loadVideos();
      } catch (error) {
        console.error("video polling failed", error);
      }
    }, 2000);
  }

  function setUploadSubmitting(isSubmitting) {
    if (!uploadSubmitButton) {
      return;
    }
    uploadSubmitButton.disabled = isSubmitting;
    const label = uploadSubmitButton.querySelector(".indicator-label");
    if (label) {
      label.textContent = isSubmitting ? "Uploading..." : "Upload Video";
    }
  }

  function showUploadLoading() {
    setUploadSubmitting(true);
    if (uploadLoadingModal) {
      uploadLoadingModal.show();
    }
  }

  function hideUploadLoading() {
    setUploadSubmitting(false);
    if (uploadLoadingModal) {
      uploadLoadingModal.hide();
    }
  }

  function thumbnailUrl(video) {
    const stem = String(video.stored_filename || "")
      .replace(/\.[^.]+$/, "");
    return stem ? `/storage/thumbnails/${encodeURIComponent(stem)}.jpg` : "";
  }

  function needsPlaybackConversion(video) {
    const storedFilename = String(video && video.stored_filename ? video.stored_filename : "").toLowerCase();
    return storedFilename ? !storedFilename.endsWith(".mp4") : false;
  }

  function displayPlaybackFilename(video) {
    const storedFilename = String(video && video.stored_filename ? video.stored_filename : "");
    if (!storedFilename) {
      return String(video && video.original_filename ? video.original_filename : "");
    }
    if (!needsPlaybackConversion(video)) {
      return storedFilename;
    }
    return storedFilename.replace(/\.[^.]+$/, ".mp4");
  }

  function actionMenuButton({ action, id, label, toneClass, title }) {
    return `
      <button
        class="dropdown-item app-dropdown-action ${toneClass}"
        type="button"
        data-action="${action}"
        data-id="${id}"
        title="${app.escapeHtml(title)}"
      >
        ${ICONS[action]}
        <span>${label}</span>
      </button>
    `;
  }

  function actionMenuButtonDisabled({ action, label, toneClass, title }) {
    return `
      <button
        class="dropdown-item app-dropdown-action ${toneClass}"
        type="button"
        disabled
        title="${app.escapeHtml(title)}"
      >
        ${ICONS[action]}
        <span>${label}</span>
      </button>
    `;
  }

  function actionMenuLink({ href, icon, label, toneClass, title }) {
    return `
      <a
        class="dropdown-item app-dropdown-action ${toneClass}"
        href="${href}"
        title="${app.escapeHtml(title)}"
      >
        ${icon}
        <span>${label}</span>
      </a>
    `;
  }

  function renderActionCell(video) {
    const isConverting = video.status === "converting";
    const analyzeButton = isConverting
      ? `
        <button
          class="btn btn-sm btn-light-success app-primary-row-action"
          type="button"
          disabled
          title="${app.escapeHtml(`Analyze will be available after MP4 conversion finishes for ${video.original_filename}`)}"
        >
          ${ICONS.analysis}
          <span>Analyze</span>
        </button>
      `
      : `
        <a
          class="btn btn-sm btn-light-success app-primary-row-action"
          href="/analysis?video_id=${video.id}"
          title="${app.escapeHtml(`Analyze ${video.original_filename}`)}"
        >
          ${ICONS.analysis}
          <span>Analyze</span>
        </a>
      `;

    return `
      <div class="app-row-actions">
        ${analyzeButton}
        <div class="dropdown app-actions-dropdown">
          <button
            class="btn btn-sm btn-light-primary app-actions-toggle"
            type="button"
            data-bs-toggle="dropdown"
            data-bs-auto-close="true"
            title="More actions"
            aria-label="More actions"
            aria-expanded="false"
          >
            ${ICONS.actions}
          </button>
          <div class="dropdown-menu dropdown-menu-end app-actions-menu">
            ${actionMenuLink({
              href: `/count-lines?video_id=${video.id}`,
              icon: ICONS.line,
              label: "Lines",
              toneClass: "app-dropdown-action-warning",
              title: `Set count lines for ${video.original_filename}`,
            })}
            ${isConverting ? actionMenuButtonDisabled({
              action: "preview",
              label: "Preview",
              toneClass: "app-dropdown-action-primary",
              title: `Preview will be available after MP4 conversion finishes for ${video.original_filename}`,
            }) : actionMenuButton({
              action: "preview",
              id: video.id,
              label: "Preview",
              toneClass: "app-dropdown-action-primary",
              title: `Preview ${video.original_filename}`,
            })}
            ${actionMenuButton({
              action: "delete",
              id: video.id,
              label: "Delete",
              toneClass: "app-dropdown-action-danger",
              title: `Delete ${video.original_filename}`,
            })}
          </div>
        </div>
      </div>
    `;
  }

  function renderThumbnail(video) {
    const src = thumbnailUrl(video);
    if (!src) {
      return `
        <div class="video-card-thumb-inner is-fallback">
          <div class="video-card-no-preview">
            <i class="ti ti-video-off"></i>
            <span>No Preview</span>
          </div>
        </div>
      `;
    }
    return `
      <div class="video-card-thumb-inner" data-thumb-shell>
        <img src="${app.escapeHtml(src)}"
             alt="${app.escapeHtml(video.original_filename)}"
             loading="lazy" data-thumb />
        <div class="video-card-no-preview">
          <i class="ti ti-video-off"></i>
          <span>No Preview</span>
        </div>
      </div>
    `;
  }

  function bindThumbnailFallbacks() {
    videosTableBody.querySelectorAll("img[data-thumb]").forEach((img) => {
      img.addEventListener("error", () => {
        const shell = img.closest("[data-thumb-shell]");
        if (shell) shell.classList.add("is-fallback");
      }, { once: true });
    });
  }

  function getFilteredSorted() {
    let list = [...state.videos];
    if (state.query) {
      const q = state.query.toLowerCase();
      list = list.filter((v) =>
        (v.original_filename || "").toLowerCase().includes(q)
      );
    }
    if (state.statusFilter !== "all") {
      list = list.filter((v) => v.status === state.statusFilter);
    }
    list.sort((a, b) => {
      const aT = new Date(a.created_at || 0).getTime();
      const bT = new Date(b.created_at || 0).getTime();
      return state.sortOrder === "latest" ? bT - aT : aT - bT;
    });
    return list;
  }

  function updateCountBadge(count) {
    if (!videoCountBadge) return;
    videoCountBadge.textContent = `${count} video${count !== 1 ? "s" : ""}`;
    videoCountBadge.classList.toggle("hidden", count === 0 && state.query === "" && state.statusFilter === "all");
  }

  function renderVideoListItem(video) {
    const analysisStatus = video.analysis_job ? video.analysis_job.status : "pending";
    const isConverting   = video.status === "converting";
    const name           = app.escapeHtml(displayPlaybackFilename(video) || video.original_filename || "-");
    const duration       = video.duration_seconds ? app.formatDuration(video.duration_seconds) : null;

    const analyzeBtn = isConverting
      ? `<button class="btn btn-sm btn-light" type="button" disabled title="Available after MP4 conversion">
           ${ICONS.analysis}<span>Analyze</span>
         </button>`
      : `<a class="btn btn-sm btn-primary" href="/analysis?video_id=${video.id}"
            title="Analyze ${app.escapeHtml(video.original_filename)}">
           ${ICONS.analysis}<span>Analyze</span>
         </a>`;

    const src = thumbnailUrl(video);
    const playOverlay = !isConverting
      ? `<div class="video-card-play-overlay" data-action="preview" data-id="${video.id}" title="Preview ${app.escapeHtml(video.original_filename)}">
           <button class="video-card-play-btn" type="button" tabindex="-1" aria-hidden="true">
             <i class="ti ti-player-play-filled" aria-hidden="true"></i>
           </button>
         </div>`
      : "";
    const thumbHtml = src
      ? `<div class="video-list-thumb" data-thumb-shell>
           <img src="${app.escapeHtml(src)}" alt="${app.escapeHtml(video.original_filename)}" loading="lazy" data-thumb />
           <div class="video-list-thumb-fallback"><i class="ti ti-video-off"></i></div>
           ${playOverlay}
         </div>`
      : `<div class="video-list-thumb is-fallback">
           <div class="video-list-thumb-fallback"><i class="ti ti-video-off"></i></div>
         </div>`;

    return `
      <div class="video-list-item">
        ${thumbHtml}
        <div class="video-list-info">
          <div class="video-list-name" title="${name}">${name}</div>
          <div class="video-list-meta">
            ${app.escapeHtml(video.uploaded_by || "-")} &middot; ${app.formatDateTime(video.created_at)}
            ${duration ? `&middot; ${duration}` : ""}
          </div>
          <div class="video-list-badges">
            <span class="badge ${app.statusBadge(video.status)} status-pill">${app.escapeHtml(video.status)}</span>
            <span class="badge ${app.statusBadge(analysisStatus)} status-pill">${app.escapeHtml(analysisStatus)}</span>
          </div>
        </div>
        <div class="video-list-actions">
          ${analyzeBtn}
          <a class="btn btn-sm btn-light" href="/count-lines?video_id=${video.id}"
             title="Set count lines for ${app.escapeHtml(video.original_filename)}">
            ${ICONS.line}<span>Lines</span>
          </a>
          <button class="btn btn-sm btn-light-danger" type="button"
                  data-action="delete" data-id="${video.id}"
                  title="Delete ${app.escapeHtml(video.original_filename)}">
            ${ICONS.delete}<span>Delete</span>
          </button>
        </div>
      </div>
    `;
  }

  function vcDotBadge(status) {
    return `<span class="vc-dot-badge"><span class="vc-dot vc-dot--${app.escapeHtml(status)}"></span>${app.escapeHtml(status)}</span>`;
  }

  function renderVideoCard(video) {
    const analysisStatus = video.analysis_job ? video.analysis_job.status : "pending";
    const isConverting   = video.status === "converting";
    const hasDesc        = Boolean(video.description);
    const mainTitle      = app.escapeHtml(hasDesc ? video.description : (video.original_filename || "-"));
    const subFilename    = hasDesc ? app.escapeHtml(video.original_filename || "") : "";
    const resolution     = (video.frame_width && video.frame_height)
      ? `${video.frame_width}×${video.frame_height} · ` : "";
    const duration       = video.duration_seconds ? app.formatDuration(video.duration_seconds) : null;
    const escapedOrig    = app.escapeHtml(video.original_filename || "");

    const analyzeBtn = isConverting
      ? `<button class="btn btn-sm btn-light vc-analyze-btn" type="button" disabled
                 title="Available after MP4 conversion">
           ${ICONS.analysis}<span>Analyze</span>
         </button>`
      : `<a class="btn btn-sm btn-primary vc-analyze-btn"
            href="/analysis?video_id=${video.id}"
            title="Analyze ${escapedOrig}">
           ${ICONS.analysis}<span>Analyze</span>
         </a>`;

    return `
      <div class="video-card">

        <!-- Thumbnail -->
        <div class="video-card-thumb">
          ${renderThumbnail(video)}
          ${duration ? `<div class="video-card-duration">${duration}</div>` : ""}
          ${!isConverting ? `
            <div class="video-card-play-overlay" data-action="preview" data-id="${video.id}" title="Preview ${escapedOrig}">
              <button class="video-card-play-btn" type="button" tabindex="-1" aria-hidden="true">
                <i class="ti ti-player-play-filled" aria-hidden="true"></i>
              </button>
            </div>
          ` : ""}
        </div>

        <!-- Info -->
        <div class="video-card-info">
          <div class="video-card-title" title="${mainTitle}">${mainTitle}</div>
          <div class="vc-badge-row">
            ${vcDotBadge(video.status)}
            <span class="vc-badge-sep">·</span>
            ${vcDotBadge(analysisStatus)}
          </div>
          ${subFilename ? `<div class="vc-sub-filename">${subFilename}</div>` : ""}
          <div class="video-card-meta">
            ${resolution}${app.escapeHtml(video.uploaded_by || "-")} · ${app.formatDateTime(video.created_at)}
          </div>
        </div>

        <!-- Actions -->
        <div class="video-card-foot">
          ${analyzeBtn}
          <a class="btn btn-sm btn-light vc-lines-btn"
             href="/count-lines?video_id=${video.id}"
             title="Set count lines for ${escapedOrig}">
            ${ICONS.line}<span>Lines</span>
          </a>
          <button class="btn btn-sm btn-light-danger vc-delete-btn" type="button"
                  data-action="delete" data-id="${video.id}"
                  title="Delete ${escapedOrig}">
            ${ICONS.delete}
          </button>
        </div>

      </div>
    `;
  }

  function getPageRange(current, total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    if (current <= 4) return [1, 2, 3, 4, 5, "...", total];
    if (current >= total - 3) return [1, "...", total - 4, total - 3, total - 2, total - 1, total];
    return [1, "...", current - 1, current, current + 1, "...", total];
  }

  function renderPaginator(total, current, perPage) {
    if (!videosPaginator) return;
    const totalPages = Math.ceil(total / perPage);
    if (totalPages <= 1) {
      videosPaginator.innerHTML = "";
      videosPaginator.classList.add("hidden");
      return;
    }
    videosPaginator.classList.remove("hidden");
    const start = (current - 1) * perPage + 1;
    const end   = Math.min(current * perPage, total);
    const pages = getPageRange(current, totalPages);
    videosPaginator.innerHTML = `
      <span class="videos-paginator-info">${start}–${end} dari ${total} video</span>
      <div class="videos-paginator-controls">
        <button class="videos-page-btn" data-page="${current - 1}" ${current === 1 ? "disabled" : ""} title="Previous">
          <i class="ti ti-chevron-left" aria-hidden="true"></i>
        </button>
        ${pages.map((p) => p === "..."
          ? `<span class="videos-page-ellipsis">…</span>`
          : `<button class="videos-page-btn${p === current ? " active" : ""}" data-page="${p}">${p}</button>`
        ).join("")}
        <button class="videos-page-btn" data-page="${current + 1}" ${current === totalPages ? "disabled" : ""} title="Next">
          <i class="ti ti-chevron-right" aria-hidden="true"></i>
        </button>
      </div>
    `;
  }

  function renderVideos() {
    const filtered = getFilteredSorted();
    updateCountBadge(state.videos.length);

    const totalPages = Math.ceil(filtered.length / state.perPage);
    if (state.page > totalPages && totalPages > 0) state.page = totalPages;
    if (state.page < 1) state.page = 1;

    if (!filtered.length) {
      videosTableBody.classList.remove("video-list-view");
      videosTableBody.classList.add("video-card-grid");
      const hasFilters = state.query || state.statusFilter !== "all";
      const iconName   = hasFilters ? "search" : "video-plus";
      const title      = hasFilters ? "No videos found" : "No videos yet";
      const sub        = state.query
        ? `No videos match "<strong>${app.escapeHtml(state.query)}</strong>".`
        : state.statusFilter !== "all"
          ? `No videos with status "<strong>${app.escapeHtml(state.statusFilter)}</strong>".`
          : "Upload your first video to get started.";
      videosTableBody.innerHTML = `
        <div class="video-empty-state">
          <i class="ti ti-${iconName} video-empty-icon"></i>
          <div class="video-empty-title">${title}</div>
          <div class="video-empty-sub">${sub}</div>
        </div>
      `;
      renderPaginator(0, 1, state.perPage);
      return;
    }

    const start  = (state.page - 1) * state.perPage;
    const paged  = filtered.slice(start, start + state.perPage);

    if (state.viewMode === "list") {
      videosTableBody.classList.remove("video-card-grid");
      videosTableBody.classList.add("video-list-view");
      videosTableBody.innerHTML = paged.map(renderVideoListItem).join("");
    } else {
      videosTableBody.classList.remove("video-list-view");
      videosTableBody.classList.add("video-card-grid");
      videosTableBody.innerHTML = paged.map(renderVideoCard).join("");
    }
    bindThumbnailFallbacks();
    renderPaginator(filtered.length, state.page, state.perPage);
  }

  async function loadVideos() {
    state.videos = await app.apiFetch("/api/videos");
    renderVideos();
    ensurePolling();
  }

  function openPreviewModal(video) {
    previewVideoTitle.textContent = displayPlaybackFilename(video) || video.original_filename || "Video Preview";
    if (previewVideoLoading) {
      previewVideoLoading.classList.remove("hidden");
    }
    if (previewVideoError) {
      previewVideoError.classList.add("hidden");
    }
    previewVideoPlayer.src = `/api/videos/${video.id}/playback`;
    previewVideoPlayer.load();
    if (previewVideoModal) {
      previewVideoModal.show();
    }
  }

  try {
    await app.requireSession();
    syncViewToggle();
    await loadVideos();
    resetUploadForm();
  } catch (error) {
    app.setAlert(videosAlert, "danger", error.message);
    return;
  }

  uploadVideoModalElement.addEventListener("hidden.bs.modal", () => {
    resetUploadForm();
  });

  previewVideoModalElement.addEventListener("hidden.bs.modal", () => {
    previewVideoPlayer.pause();
    previewVideoPlayer.removeAttribute("src");
    previewVideoPlayer.load();
    if (previewVideoLoading) {
      previewVideoLoading.classList.add("hidden");
    }
    if (previewVideoError) {
      previewVideoError.classList.add("hidden");
    }
  });

  previewVideoPlayer.addEventListener("loadstart", () => {
    if (previewVideoLoading) {
      previewVideoLoading.classList.remove("hidden");
    }
    if (previewVideoError) {
      previewVideoError.classList.add("hidden");
    }
  });

  const hidePreviewLoading = () => {
    if (previewVideoLoading) {
      previewVideoLoading.classList.add("hidden");
    }
  };

  previewVideoPlayer.addEventListener("loadeddata", hidePreviewLoading);
  previewVideoPlayer.addEventListener("canplay", hidePreviewLoading);
  previewVideoPlayer.addEventListener("playing", hidePreviewLoading);

  previewVideoPlayer.addEventListener("error", () => {
    hidePreviewLoading();
    if (previewVideoError) {
      previewVideoError.classList.remove("hidden");
    }
  });

  openUploadModalButton.addEventListener("click", () => {
    app.setAlert(videosAlert, "danger", "");
    resetUploadForm();
    if (uploadVideoModal) {
      uploadVideoModal.show();
    }
  });

  uploadForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    app.setAlert(videosAlert, "danger", "");

    const formData = new FormData(uploadForm);
    const file = formData.get("file");
    const recordedAtValue = getRecordedAtValue(uploadRecordedDateInput, uploadRecordedTimeInput);
    if (!(file instanceof File) || !file.name) {
      app.setAlert(videosAlert, "danger", "A video file is required");
      return;
    }

    if (recordedAtValue) {
      formData.set("recorded_at", new Date(recordedAtValue).toISOString());
    } else {
      formData.delete("recorded_at");
    }
    formData.delete("recorded_at_date");
    formData.delete("recorded_at_time");

    if (!formData.get("auto_process")) {
      formData.delete("auto_process");
    }

    try {
      showUploadLoading();
      const createdVideo = await app.apiFetch("/api/videos", {
        method: "POST",
        body: formData,
      });
      if (uploadVideoModal) {
        uploadVideoModal.hide();
      }
      await loadVideos();
      hideUploadLoading();
      if (uploadSuccessMessage) {
        if (createdVideo && createdVideo.status === "converting") {
          uploadSuccessMessage.textContent = formData.get("auto_process")
            ? `Video ${file.name} was uploaded. MP4 conversion is now running, and analysis will start automatically when the MP4 file is ready.`
            : `Video ${file.name} was uploaded. MP4 conversion is now running in the background.`;
        } else {
          uploadSuccessMessage.textContent = `Video ${file.name} was uploaded successfully.`;
        }
      }
      if (uploadSuccessModal) {
        uploadSuccessModal.show();
      }
      app.setAlert(videosAlert, "success", "Video uploaded successfully");
    } catch (error) {
      hideUploadLoading();
      app.setAlert(videosAlert, "danger", error.message);
    }
  });

  videosTableBody.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) {
      return;
    }

    const video = state.videos.find((item) => item.id === button.dataset.id);
    if (!video) {
      return;
    }

    if (button.dataset.action === "preview") {
      app.setAlert(videosAlert, "danger", "");
      openPreviewModal(video);
      return;
    }

    if (button.dataset.action === "delete") {
      if (!window.confirm(`Delete video ${video.original_filename}?`)) {
        return;
      }

      try {
        await app.apiFetch(`/api/videos/${video.id}`, { method: "DELETE" });
        await loadVideos();
        app.setAlert(videosAlert, "success", "Video deleted successfully");
      } catch (error) {
        app.setAlert(videosAlert, "danger", error.message);
      }
    }
  });

  if (videoSearchInput) {
    let searchDebounce = null;
    videoSearchInput.addEventListener("input", () => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        state.query = videoSearchInput.value.trim();
        state.page = 1;
        renderVideos();
      }, 200);
    });
  }

  if (videoSortSelect) {
    videoSortSelect.addEventListener("change", () => {
      state.sortOrder = videoSortSelect.value;
      renderVideos();
    });
  }

  if (videoStatusFilter) {
    videoStatusFilter.addEventListener("change", () => {
      state.statusFilter = videoStatusFilter.value;
      renderVideos();
    });
  }

  document.querySelectorAll(".video-toolbar-dropdown-menu [data-sort]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.sortOrder = btn.dataset.sort;
      state.page = 1;
      if (videoSortLabel) videoSortLabel.textContent = btn.textContent.trim();
      document.querySelectorAll(".video-toolbar-dropdown-menu [data-sort]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      renderVideos();
    });
  });

  document.querySelectorAll(".video-toolbar-dropdown-menu [data-status]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.statusFilter = btn.dataset.status;
      state.page = 1;
      if (videoStatusLabel) videoStatusLabel.textContent = btn.textContent.trim();
      document.querySelectorAll(".video-toolbar-dropdown-menu [data-status]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      renderVideos();
    });
  });

  if (videosPaginator) {
    videosPaginator.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-page]");
      if (!btn || btn.disabled) return;
      state.page = parseInt(btn.dataset.page, 10);
      renderVideos();
      videosTableBody.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  if (videoViewGridBtn) {
    videoViewGridBtn.addEventListener("click", () => {
      state.viewMode = "grid";
      localStorage.setItem("nc_videos_view_mode", "grid");
      videoViewGridBtn.classList.add("active");
      videoViewListBtn.classList.remove("active");
      renderVideos();
    });
  }

  if (videoViewListBtn) {
    videoViewListBtn.addEventListener("click", () => {
      state.viewMode = "list";
      localStorage.setItem("nc_videos_view_mode", "list");
      videoViewListBtn.classList.add("active");
      videoViewGridBtn.classList.remove("active");
      renderVideos();
    });
  }

  window.addEventListener("beforeunload", () => {
    stopPolling();
  });
});
