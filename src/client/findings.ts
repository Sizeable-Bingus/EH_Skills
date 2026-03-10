document.addEventListener("DOMContentLoaded", () => {
  const buttons = document.querySelectorAll<HTMLButtonElement>(
    "[data-detail-toggle]"
  );

  for (const button of buttons) {
    button.addEventListener("click", () => {
      const id = button.dataset.id;
      if (!id) {
        return;
      }

      const row = document.getElementById(`detail-${id}`);
      const arrow = document.getElementById(`arrow-${id}`);
      if (!row || !arrow) {
        return;
      }

      const isHidden = row.classList.contains("hidden");
      row.classList.toggle("hidden", !isHidden);
      arrow.setAttribute("style", isHidden ? "transform:rotate(90deg)" : "");
      button.setAttribute("aria-expanded", String(isHidden));
    });
  }
});
