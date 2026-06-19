import { BriefcaseBusiness, ShieldCheck } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { paths } from "../../../routing/paths";

export function WorkspaceModeSwitcher({ slug }: { slug: string }) {
  const location = useLocation();
  const isAdministration = location.pathname === paths.workspaceUsers(slug);

  return (
    <nav className="workspace-mode-switch" aria-label="Workspace mode">
      <NavLink
        to={paths.workspaceDashboard(slug)}
        className={isAdministration ? undefined : "active"}
      >
        <BriefcaseBusiness aria-hidden="true" />
        Workspace
      </NavLink>
      <NavLink to={paths.workspaceUsers(slug)} className={isAdministration ? "active" : undefined}>
        <ShieldCheck aria-hidden="true" />
        Administration
      </NavLink>
    </nav>
  );
}
