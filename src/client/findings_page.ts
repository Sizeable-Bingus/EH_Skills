export interface FindingsPageDependencies {
  document?: Document;
}

export function initializeFindingsPage(
  dependencies: FindingsPageDependencies = {},
): void {
  const documentRef = dependencies.document ?? document;
  const buttons = documentRef.querySelectorAll<HTMLButtonElement>(
    "[data-detail-toggle]",
  );

  for (const button of buttons) {
    button.addEventListener("click", () => {
      const id = button.dataset.id;
      if (!id) {
        return;
      }

      const row = documentRef.getElementById(`detail-${id}`);
      const arrow = documentRef.getElementById(`arrow-${id}`);
      if (!row || !arrow) {
        return;
      }

      const isHidden = row.classList.contains("hidden");
      row.classList.toggle("hidden", !isHidden);
      arrow.setAttribute("style", isHidden ? "transform:rotate(90deg)" : "");
      button.setAttribute("aria-expanded", String(isHidden));
    });
  }
}
