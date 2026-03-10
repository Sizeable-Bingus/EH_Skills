/* Pipeline UI: modal, SSE streaming, status bar, engagement selector */

(function () {
  const modal = document.getElementById("scan-modal");
  const targetInput = document.getElementById("scan-target");
  const usernameInput = document.getElementById("scan-username");
  const passwordInput = document.getElementById("scan-password");
  const startBtn = document.getElementById("scan-start");
  const cancelBtn = document.getElementById("scan-cancel");
  const openBtn = document.getElementById("scan-open");

  const statusBar = document.getElementById("pipeline-status");
  const statusDot = document.getElementById("pipeline-dot");
  const statusText = document.getElementById("pipeline-text");
  const logToggle = document.getElementById("log-toggle");
  const logPanel = document.getElementById("log-panel");
  const logPre = document.getElementById("log-pre");

  /* --- Searchable Combobox --- */
  const combobox = document.getElementById("engagement-combobox");
  const comboInput = document.getElementById("engagement-input");
  const listbox = document.getElementById("engagement-listbox");
  let allEngagements = [];  /* {value, label}[] */
  let focusedIdx = -1;
  let currentTarget = "";

  /* --- Modal --- */
  openBtn.addEventListener("click", () => {
    modal.classList.remove("hidden");
    targetInput.value = "";
    usernameInput.value = "";
    passwordInput.value = "";
    targetInput.focus();
  });

  cancelBtn.addEventListener("click", () => modal.classList.add("hidden"));

  startBtn.addEventListener("click", async () => {
    const target = targetInput.value.trim();
    if (!target) return;
    modal.classList.add("hidden");

    const payload = { target };
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    if (username) payload.username = username;
    if (password) payload.password = password;

    const res = await fetch("/api/pipeline/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.detail || "Failed to start pipeline");
      return;
    }
    showStatus("running", "Starting", target);
    connectSSE();
  });

  /* --- Status bar --- */
  function showStatus(status, phase, target) {
    if (target) {
      currentTarget = target;
    }

    statusBar.classList.remove("hidden");
    statusText.textContent = currentTarget ? `${phase} — ${currentTarget}` : phase;

    const dotBase = "pipeline-dot";
    const dotState =
      status === "running"  ? "pipeline-dot--running" :
      status === "complete" ? "pipeline-dot--complete" :
      status === "error"    ? "pipeline-dot--error" :
                              "pipeline-dot--idle";
    statusDot.className = `${dotBase} ${dotState}`;
  }

  /* --- SSE --- */
  let evtSource = null;

  function connectSSE() {
    if (evtSource) evtSource.close();
    logPre.textContent = "";
    evtSource = new EventSource("/api/pipeline/stream");

    evtSource.onmessage = (e) => {
      logPre.textContent += e.data + "\n";
      logPre.scrollTop = logPre.scrollHeight;
      const m = e.data.match(/PHASE:\s*(.+)/);
      if (m) showStatus("running", m[1].trim(), currentTarget);
    };

    evtSource.addEventListener("done", (e) => {
      const info = JSON.parse(e.data);
      showStatus(info.status, info.current_phase, info.target);
      evtSource.close();
      evtSource = null;
      loadEngagements();
      scheduleAutoHide();
    });

    evtSource.onerror = () => {
      if (evtSource) {
        evtSource.close();
        evtSource = null;
      }
    };
  }

  /* --- Auto-hide status bar (only when log panel is closed) --- */
  let autoHideTimer = null;
  let scanFinished = false;

  function scheduleAutoHide() {
    scanFinished = true;
    clearTimeout(autoHideTimer);
    if (!logPanel.classList.contains("hidden")) return;
    autoHideTimer = setTimeout(() => statusBar.classList.add("hidden"), 5000);
  }

  /* --- Log toggle --- */
  logToggle.addEventListener("click", () => {
    logPanel.classList.toggle("hidden");
    logToggle.textContent = logPanel.classList.contains("hidden")
      ? "Show Log"
      : "Hide Log";

    if (scanFinished) {
      clearTimeout(autoHideTimer);
      if (logPanel.classList.contains("hidden")) {
        scheduleAutoHide();
      }
    }
  });

  /* --- Engagement combobox --- */
  function openListbox() {
    listbox.classList.remove("hidden");
    combobox.classList.add("combobox--open");
    comboInput.setAttribute("aria-expanded", "true");
    renderOptions(comboInput.value);
  }

  function closeListbox() {
    listbox.classList.add("hidden");
    combobox.classList.remove("combobox--open");
    comboInput.setAttribute("aria-expanded", "false");
    focusedIdx = -1;
  }

  function renderOptions(filter) {
    const q = filter.toLowerCase().trim();
    const filtered = allEngagements.filter((o) =>
      o.label.toLowerCase().includes(q)
    );
    const params = new URLSearchParams(window.location.search);
    const cur = params.get("engagement") || "";

    if (filtered.length === 0) {
      listbox.innerHTML = '<li class="combobox-empty">No matches</li>';
      focusedIdx = -1;
      return;
    }

    listbox.innerHTML = "";
    filtered.forEach((opt, i) => {
      const li = document.createElement("li");
      li.className = "combobox-option";
      li.setAttribute("role", "option");
      li.textContent = opt.label;
      li.dataset.value = opt.value;
      if (opt.value === cur) li.classList.add("combobox-option--active");
      if (i === focusedIdx) li.classList.add("combobox-option--focused");
      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        selectEngagement(opt.value, opt.label);
      });
      listbox.appendChild(li);
    });
  }

  function selectEngagement(value, label) {
    closeListbox();
    comboInput.value = value ? label : "";
    const params = new URLSearchParams(window.location.search);
    if (value) {
      params.set("engagement", value);
    } else {
      params.delete("engagement");
    }
    window.location.search = params.toString();
  }

  comboInput.addEventListener("focus", () => {
    comboInput.select();
    openListbox();
    comboInput.addEventListener("mouseup", function preventDeselect(e) {
      e.preventDefault();
      comboInput.removeEventListener("mouseup", preventDeselect);
    });
  });
  comboInput.addEventListener("input", () => {
    focusedIdx = -1;
    renderOptions(comboInput.value);
  });

  comboInput.addEventListener("blur", () => {
    closeListbox();
    /* Restore display label to current selection */
    const params = new URLSearchParams(window.location.search);
    const cur = params.get("engagement") || "";
    const match = allEngagements.find((o) => o.value === cur);
    comboInput.value = match ? match.label : "";
  });

  comboInput.addEventListener("keydown", (e) => {
    const items = listbox.querySelectorAll(".combobox-option");
    if (!items.length) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusedIdx = Math.min(focusedIdx + 1, items.length - 1);
      updateFocus(items);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusedIdx = Math.max(focusedIdx - 1, 0);
      updateFocus(items);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (focusedIdx >= 0 && items[focusedIdx]) {
        const li = items[focusedIdx];
        selectEngagement(li.dataset.value, li.textContent);
      }
    } else if (e.key === "Escape") {
      closeListbox();
      comboInput.blur();
    }
  });

  function updateFocus(items) {
    items.forEach((li, i) => {
      li.classList.toggle("combobox-option--focused", i === focusedIdx);
      if (i === focusedIdx) li.scrollIntoView({ block: "nearest" });
    });
  }

  async function loadEngagements() {
    try {
      const res = await fetch("/api/engagements");
      const data = await res.json();
      const params = new URLSearchParams(window.location.search);
      const cur = params.get("engagement") || "";

      allEngagements = data
        .filter((name) => name.toLowerCase() !== "default")
        .map((name) => ({ value: name, label: name }));

      const match = allEngagements.find((o) => o.value === cur);
      comboInput.value = match && match.value ? match.label : "";
    } catch {
      /* ignore */
    }
  }

  /* --- Delete engagement --- */
  const deleteBtn = document.getElementById("delete-engagement");
  const deleteModal = document.getElementById("delete-modal");
  const deleteCancel = document.getElementById("delete-cancel");
  const deleteConfirm = document.getElementById("delete-confirm");
  const deleteTargetName = document.getElementById("delete-target-name");

  function updateDeleteBtnVisibility() {
    const params = new URLSearchParams(window.location.search);
    const eng = params.get("engagement");
    if (eng) {
      deleteBtn.classList.remove("hidden");
    } else {
      deleteBtn.classList.add("hidden");
    }
  }

  deleteBtn.addEventListener("click", () => {
    const params = new URLSearchParams(window.location.search);
    const eng = params.get("engagement") || "";
    deleteTargetName.textContent = eng;
    deleteModal.classList.remove("hidden");
  });

  deleteCancel.addEventListener("click", () => deleteModal.classList.add("hidden"));

  deleteConfirm.addEventListener("click", async () => {
    const params = new URLSearchParams(window.location.search);
    const eng = params.get("engagement");
    if (!eng) return;
    deleteModal.classList.add("hidden");
    const res = await fetch(`/api/engagements/${encodeURIComponent(eng)}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.detail || "Failed to delete engagement");
      return;
    }
    window.location.href = "/";
  });

  /* --- Init --- */
  async function init() {
    await loadEngagements();
    updateDeleteBtnVisibility();
    try {
      const res = await fetch("/api/pipeline/status");
      const info = await res.json();
      if (info.status === "running") {
        showStatus("running", info.current_phase, info.target);
        connectSSE();
      }
    } catch {
      /* ignore */
    }
  }

  init();
})();
