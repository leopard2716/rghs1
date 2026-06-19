import { createApp } from "./app";
import type { ApiBindings } from "./app.types";
import { requireSupabaseConfig } from "./config/env";
import { AdminService } from "./features/admin/admin.service";
import { SupabaseAuthAdminClient } from "./infrastructure/supabase-auth-admin.client";
import { SupabaseRestClient } from "./infrastructure/supabase-rest.client";

const app = createApp();

async function purgeExpiredTenantDeletions(env: ApiBindings): Promise<void> {
  const config = requireSupabaseConfig(env);
  const service = new AdminService(
    new SupabaseRestClient(config),
    new SupabaseAuthAdminClient(config)
  );

  await service.purgeExpiredDeletedWorkspaces();
}

export default {
  fetch(request: Request, env: ApiBindings, context: ExecutionContext) {
    return app.fetch(request, env, context);
  },
  scheduled(_event: ScheduledController, env: ApiBindings, context: ExecutionContext) {
    context.waitUntil(purgeExpiredTenantDeletions(env));
  }
} satisfies ExportedHandler<ApiBindings>;
