export class WorkspaceService {
  removedBootstrapResponse() {
    return {
      error: "Demo bootstrap data has been removed.",
      next: [
        "Configure Supabase Auth.",
        "Implement GET /v1/me/workspaces.",
        "Implement GET /v1/workspaces/by-slug/:slug."
      ]
    };
  }
}
