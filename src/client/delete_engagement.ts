import type {
  FetchLike,
  PipelineDomRefs,
  WindowLike
} from "./pipeline_shared.ts";
import { parseErrorDetail } from "./pipeline_shared.ts";

interface DeleteEngagementOptions {
  fetchFn: FetchLike;
  getCurrentEngagement: () => string | null;
  refs: Pick<
    PipelineDomRefs,
    | "deleteButton"
    | "deleteModal"
    | "deleteCancel"
    | "deleteConfirm"
    | "deleteTargetName"
  >;
  window: WindowLike;
}

export function createDeleteEngagementControls(
  options: DeleteEngagementOptions
): void {
  const { fetchFn, getCurrentEngagement, refs, window } = options;

  refs.deleteButton.addEventListener("click", () => {
    const engagement = getCurrentEngagement() ?? "";
    refs.deleteTargetName.textContent = engagement;
    refs.deleteModal.classList.remove("hidden");
  });

  refs.deleteCancel.addEventListener("click", () => {
    refs.deleteModal.classList.add("hidden");
  });

  refs.deleteConfirm.addEventListener("click", async () => {
    const engagement = getCurrentEngagement();
    if (!engagement) {
      return;
    }

    refs.deleteModal.classList.add("hidden");
    const response = await fetchFn(
      `/api/engagements/${encodeURIComponent(engagement)}`,
      {
        method: "DELETE"
      }
    );
    if (!response.ok) {
      window.alert(
        (await parseErrorDetail(response)) ?? "Failed to delete engagement"
      );
      return;
    }
    window.location.href = "/";
  });
}
