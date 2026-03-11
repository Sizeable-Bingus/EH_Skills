import type {
  FetchLike,
  PipelineDomRefs,
  WindowLike
} from "./pipeline_shared.ts";
import { getCurrentParams } from "./pipeline_shared.ts";

interface EngagementOption {
  value: string;
  label: string;
}

interface EngagementPickerOptions {
  document: Document;
  HTMLElementCtor: typeof HTMLElement;
  window: WindowLike;
  fetchFn: FetchLike;
  refs: Pick<
    PipelineDomRefs,
    "combobox" | "comboInput" | "listbox" | "deleteButton"
  >;
}

export function createEngagementPickerController(
  options: EngagementPickerOptions
) {
  const { document, HTMLElementCtor, window, fetchFn, refs } = options;
  let allEngagements: EngagementOption[] = [];
  let focusedIndex = -1;

  function getCurrentEngagement(): string | null {
    return getCurrentParams(window).get("engagement");
  }

  function closeListbox(): void {
    refs.listbox.classList.add("hidden");
    refs.combobox.classList.remove("combobox--open");
    refs.comboInput.setAttribute("aria-expanded", "false");
    focusedIndex = -1;
  }

  function selectEngagement(value: string, label: string): void {
    closeListbox();
    refs.comboInput.value = value ? label : "";
    const params = getCurrentParams(window);
    if (value) {
      params.set("engagement", value);
    } else {
      params.delete("engagement");
    }
    window.location.search = params.toString();
  }

  function renderOptions(filter: string): void {
    const query = filter.toLowerCase().trim();
    const filtered = allEngagements.filter((option) =>
      option.label.toLowerCase().includes(query)
    );
    const current = getCurrentEngagement() ?? "";

    if (filtered.length === 0) {
      refs.listbox.innerHTML = '<li class="combobox-empty">No matches</li>';
      focusedIndex = -1;
      return;
    }

    refs.listbox.innerHTML = "";
    for (const [index, option] of filtered.entries()) {
      const item = document.createElement("li");
      item.className = "combobox-option";
      item.setAttribute("role", "option");
      item.textContent = option.label;
      item.dataset.value = option.value;
      if (option.value === current) {
        item.classList.add("combobox-option--active");
      }
      if (index === focusedIndex) {
        item.classList.add("combobox-option--focused");
      }
      item.addEventListener("mousedown", (event) => {
        event.preventDefault();
        selectEngagement(option.value, option.label);
      });
      refs.listbox.appendChild(item);
    }
  }

  function openListbox(): void {
    refs.listbox.classList.remove("hidden");
    refs.combobox.classList.add("combobox--open");
    refs.comboInput.setAttribute("aria-expanded", "true");
    renderOptions(refs.comboInput.value);
  }

  function updateFocus(items: NodeListOf<Element>): void {
    items.forEach((item, index) => {
      item.classList.toggle("combobox-option--focused", index === focusedIndex);
      if (index === focusedIndex && item instanceof HTMLElementCtor) {
        item.scrollIntoView({ block: "nearest" });
      }
    });
  }

  function syncSelectedEngagement(): void {
    const current = getCurrentEngagement() ?? "";
    const match = allEngagements.find((option) => option.value === current);
    refs.comboInput.value = match?.label ?? "";
  }

  async function loadEngagements(): Promise<void> {
    const response = await fetchFn("/api/engagements");
    const data = (await response.json()) as string[];
    allEngagements = data
      .filter((name) => name.toLowerCase() !== "default")
      .map((name) => ({ value: name, label: name }));
    syncSelectedEngagement();
  }

  function updateDeleteButtonVisibility(): void {
    refs.deleteButton.classList.toggle("hidden", !getCurrentEngagement());
  }

  refs.comboInput.addEventListener("focus", () => {
    refs.comboInput.select();
    openListbox();
    refs.comboInput.addEventListener(
      "mouseup",
      function preventDeselect(event) {
        event.preventDefault();
        refs.comboInput.removeEventListener("mouseup", preventDeselect);
      }
    );
  });

  refs.comboInput.addEventListener("input", () => {
    focusedIndex = -1;
    renderOptions(refs.comboInput.value);
  });

  refs.comboInput.addEventListener("blur", () => {
    closeListbox();
    syncSelectedEngagement();
  });

  refs.comboInput.addEventListener("keydown", (event) => {
    const items = refs.listbox.querySelectorAll(".combobox-option");
    if (items.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusedIndex = Math.min(focusedIndex + 1, items.length - 1);
      updateFocus(items);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusedIndex = Math.max(focusedIndex - 1, 0);
      updateFocus(items);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const item = focusedIndex >= 0 ? items.item(focusedIndex) : null;
      if (item instanceof HTMLElementCtor) {
        selectEngagement(item.dataset.value ?? "", item.textContent ?? "");
      }
      return;
    }

    if (event.key === "Escape") {
      closeListbox();
      refs.comboInput.blur();
    }
  });

  return {
    getCurrentEngagement,
    loadEngagements,
    updateDeleteButtonVisibility
  };
}
