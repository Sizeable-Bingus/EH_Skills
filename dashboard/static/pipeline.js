/* Pipeline UI: modal, SSE streaming, status bar, engagement selector */

(function () {
  const modal = document.getElementById("scan-modal");
  const targetInput = document.getElementById("scan-target");
  const startBtn = document.getElementById("scan-start");
  const cancelBtn = document.getElementById("scan-cancel");
  const openBtn = document.getElementById("scan-open");

  const statusBar = document.getElementById("pipeline-status");
  const statusDot = document.getElementById("pipeline-dot");
  const statusText = document.getElementById("pipeline-text");
  const logToggle = document.getElementById("log-toggle");
  const logPanel = document.getElementById("log-panel");
  const logPre = document.getElementById("log-pre");

  const engDropdown = document.getElementById("engagement-select");
  let currentTarget = "";

  /* --- Modal --- */
  openBtn.addEventListener("click", () => {
    modal.classList.remove("hidden");
    targetInput.value = "";
    targetInput.focus();
  });

  cancelBtn.addEventListener("click", () => modal.classList.add("hidden"));

  startBtn.addEventListener("click", async () => {
    const target = targetInput.value.trim();
    if (!target) return;
    modal.classList.add("hidden");

    const res = await fetch("/api/pipeline/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target }),
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
    statusText.textContent = currentTarget ? `${phase} - ${currentTarget}` : phase;
    statusDot.className =
      "w-3 h-3 rounded-full inline-block mr-2 " +
      (status === "running"
        ? "bg-yellow-400 animate-pulse"
        : status === "complete"
          ? "bg-green-400"
          : status === "error"
            ? "bg-red-400"
            : "bg-gray-500");
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

  /* --- Engagement selector --- */
  async function loadEngagements() {
    try {
      const res = await fetch("/api/engagements");
      const data = await res.json();
      const params = new URLSearchParams(window.location.search);
      const cur = params.get("engagement");
      const options = [{ value: "", label: "Default" }, ...data.map((name) => ({
        value: name,
        label: name,
      }))];

      engDropdown.replaceChildren(
        ...options.map(({ value, label }) => {
          const option = document.createElement("option");
          option.value = value;
          option.textContent = label;
          return option;
        }),
      );

      if (cur) {
        engDropdown.value = cur;
      }
    } catch {
      /* ignore */
    }
  }

  engDropdown.addEventListener("change", () => {
    const params = new URLSearchParams(window.location.search);
    if (engDropdown.value) {
      params.set("engagement", engDropdown.value);
    } else {
      params.delete("engagement");
    }
    window.location.search = params.toString();
  });

  /* --- Init --- */
  async function init() {
    await loadEngagements();
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
