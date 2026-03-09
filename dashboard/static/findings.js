document.addEventListener("DOMContentLoaded", () => {
    const buttons = document.querySelectorAll("[data-detail-toggle]");

    for (const button of buttons) {
        button.addEventListener("click", () => {
            const id = button.dataset.id;
            const row = document.getElementById(`detail-${id}`);
            const arrow = document.getElementById(`arrow-${id}`);
            if (!row || !arrow) {
                return;
            }
            const isHidden = row.classList.contains("hidden");

            row.classList.toggle("hidden", !isHidden);
            arrow.style.transform = isHidden ? "rotate(90deg)" : "";
            button.setAttribute("aria-expanded", String(isHidden));
        });
    }
});
