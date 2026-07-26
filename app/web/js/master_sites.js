document.addEventListener("DOMContentLoaded", async () => {
  const app = window.VehicleCountApp;
  const alertBox = document.getElementById("sitesAlert");
  const tableBody = document.getElementById("sitesTableBody");
  const addButton = document.getElementById("addSiteButton");

  const formModal = new bootstrap.Modal(document.getElementById("siteFormModal"));
  const formModalEl = document.getElementById("siteFormModal");
  const formAlertBox = document.getElementById("siteFormAlert");
  const formTitle = document.getElementById("siteFormModalLabel");
  const form = document.getElementById("siteForm");
  const codeInput = document.getElementById("siteCode");
  const nameInput = document.getElementById("siteName");
  const descInput = document.getElementById("siteDescription");
  const latInput = document.getElementById("siteLatitude");
  const lngInput = document.getElementById("siteLongitude");
  const dirNormalInput = document.getElementById("siteDirNormal");
  const dirOppositeInput = document.getElementById("siteDirOpposite");
  const submitButton = document.getElementById("siteFormSubmit");

  const deleteModal = new bootstrap.Modal(document.getElementById("siteDeleteModal"));
  const deleteAlertBox = document.getElementById("siteDeleteAlert");
  const deleteNameEl = document.getElementById("siteDeleteName");
  const deleteConfirmBtn = document.getElementById("siteDeleteConfirm");

  let currentSites = [];
  let editingSiteId = null;
  let deletingSiteId = null;

  function renderTable(sites) {
    currentSites = Array.isArray(sites) ? sites.slice() : [];

    if (currentSites.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center text-muted py-5">
            <i class="ti ti-map-pin-off" style="font-size:2rem;opacity:.4;display:block;margin-bottom:.5rem" aria-hidden="true"></i>
            Belum ada data titik lokasi.
          </td>
        </tr>`;
      return;
    }

    tableBody.innerHTML = currentSites
      .map(
        (site) => `
      <tr data-site-id="${app.escapeHtml(site.id)}">
        <td>
          <span class="badge bg-primary bg-opacity-10 text-primary fw-semibold">${app.escapeHtml(site.code)}</span>
        </td>
        <td class="fw-semibold">${app.escapeHtml(site.name)}</td>
        <td class="text-muted" style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
            title="${app.escapeHtml(site.location_description || "")}">${app.escapeHtml(site.location_description || "-")}</td>
        <td>${site.latitude != null ? Number(site.latitude).toFixed(6) : "-"}</td>
        <td>${site.longitude != null ? Number(site.longitude).toFixed(6) : "-"}</td>
        <td>${app.escapeHtml(site.direction_normal_label)}</td>
        <td>${app.escapeHtml(site.direction_opposite_label)}</td>
        <td style="text-align:right;white-space:nowrap">
          <button type="button" class="btn btn-sm btn-light me-1 js-edit-site" data-id="${app.escapeHtml(site.id)}" title="Edit">
            <i class="ti ti-pencil" aria-hidden="true"></i>
          </button>
          <button type="button" class="btn btn-sm btn-light text-danger js-delete-site" data-id="${app.escapeHtml(site.id)}" data-name="${app.escapeHtml(site.name)}" title="Hapus">
            <i class="ti ti-trash" aria-hidden="true"></i>
          </button>
        </td>
      </tr>`,
      )
      .join("");
  }

  async function loadSites() {
    const data = await app.apiFetch("/api/sites");
    renderTable(data);
  }

  function resetForm() {
    form.reset();
    editingSiteId = null;
    codeInput.value = "";
    nameInput.value = "";
    descInput.value = "";
    latInput.value = "";
    lngInput.value = "";
    dirNormalInput.value = "Normal";
    dirOppositeInput.value = "Opposite";
    codeInput.disabled = false;
    app.setAlert(formAlertBox, "danger", "");
  }

  function populateForm(site) {
    codeInput.value = site.code || "";
    nameInput.value = site.name || "";
    descInput.value = site.location_description || "";
    latInput.value = site.latitude != null ? site.latitude : "";
    lngInput.value = site.longitude != null ? site.longitude : "";
    dirNormalInput.value = site.direction_normal_label || "Normal";
    dirOppositeInput.value = site.direction_opposite_label || "Opposite";
    codeInput.disabled = true;
  }

  function buildPayload() {
    const payload = {
      name: nameInput.value.trim(),
      location_description: descInput.value.trim() || null,
      latitude: latInput.value ? parseFloat(latInput.value) : null,
      longitude: lngInput.value ? parseFloat(lngInput.value) : null,
      direction_normal_label: dirNormalInput.value.trim() || "Normal",
      direction_opposite_label: dirOppositeInput.value.trim() || "Opposite",
    };
    if (!editingSiteId) {
      payload.code = codeInput.value.trim();
    }
    return payload;
  }

  function setSubmitting(isSaving) {
    submitButton.disabled = isSaving;
    submitButton.innerHTML = isSaving
      ? '<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span> Menyimpan…'
      : '<i class="ti ti-device-floppy me-1" aria-hidden="true"></i> Simpan';
  }

  try {
    const user = await app.requireSession();
    if (!user || !user.is_admin) {
      window.location.href = "/videos";
      return;
    }
    await loadSites();
  } catch (error) {
    app.setAlert(alertBox, "danger", error.message);
    return;
  }

  addButton.addEventListener("click", () => {
    resetForm();
    formTitle.textContent = "Tambah Lokasi Baru";
    formModal.show();
  });

  tableBody.addEventListener("click", (event) => {
    const editBtn = event.target.closest(".js-edit-site");
    if (editBtn) {
      const siteId = editBtn.dataset.id;
      const site = currentSites.find((s) => s.id === siteId);
      if (!site) return;

      resetForm();
      editingSiteId = siteId;
      formTitle.textContent = "Edit Lokasi";
      populateForm(site);
      formModal.show();
      return;
    }

    const deleteBtn = event.target.closest(".js-delete-site");
    if (deleteBtn) {
      deletingSiteId = deleteBtn.dataset.id;
      const siteName = deleteBtn.dataset.name;
      deleteNameEl.textContent = siteName;
      app.setAlert(deleteAlertBox, "danger", "");
      deleteModal.show();
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    app.setAlert(formAlertBox, "danger", "");

    const payload = buildPayload();

    if (!editingSiteId && !payload.code) {
      app.setAlert(formAlertBox, "danger", "Kode lokasi wajib diisi");
      return;
    }
    if (!payload.name) {
      app.setAlert(formAlertBox, "danger", "Nama lokasi wajib diisi");
      return;
    }

    try {
      setSubmitting(true);

      if (editingSiteId) {
        await app.apiFetch(`/api/sites/${editingSiteId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await app.apiFetch("/api/sites", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      formModal.hide();
      await loadSites();
      app.setAlert(
        alertBox,
        "success",
        editingSiteId ? "Lokasi berhasil diperbarui" : "Lokasi baru berhasil ditambahkan",
      );
    } catch (error) {
      app.setAlert(formAlertBox, "danger", error.message);
    } finally {
      setSubmitting(false);
    }
  });

  deleteConfirmBtn.addEventListener("click", async () => {
    if (!deletingSiteId) return;
    app.setAlert(deleteAlertBox, "danger", "");

    deleteConfirmBtn.disabled = true;
    deleteConfirmBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span> Menghapus…';

    try {
      await app.apiFetch(`/api/sites/${deletingSiteId}`, { method: "DELETE" });
      deleteModal.hide();
      await loadSites();
      app.setAlert(alertBox, "success", "Lokasi berhasil dihapus");
    } catch (error) {
      app.setAlert(deleteAlertBox, "danger", error.message);
    } finally {
      deleteConfirmBtn.disabled = false;
      deleteConfirmBtn.innerHTML = '<i class="ti ti-trash me-1" aria-hidden="true"></i> Hapus';
      deletingSiteId = null;
    }
  });

  formModalEl.addEventListener("hidden.bs.modal", () => {
    resetForm();
  });
});
