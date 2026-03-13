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

  function toggleFinding(id: string): void {
    const row = documentRef.getElementById(`detail-${id}`);
    const arrow = documentRef.getElementById(`arrow-${id}`);
    const button = documentRef.querySelector<HTMLButtonElement>(
      `[data-detail-toggle][data-id="${id}"]`,
    );
    if (!row || !arrow) {
      return;
    }

    const isHidden = row.classList.contains("hidden");
    row.classList.toggle("hidden", !isHidden);
    arrow.setAttribute("style", isHidden ? "transform:rotate(90deg)" : "");
    button?.setAttribute("aria-expanded", String(isHidden));
  }

  for (const button of buttons) {
    button.addEventListener("click", () => {
      const id = button.dataset.id;
      if (id) {
        toggleFinding(id);
      }
    });
  }

  const rows = documentRef.querySelectorAll<HTMLTableRowElement>(
    "tr[data-finding-id]",
  );
  for (const row of rows) {
    row.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      if (target.closest("button, a")) {
        return;
      }
      const id = row.dataset.findingId;
      if (id) {
        toggleFinding(id);
      }
    });
  }
}
