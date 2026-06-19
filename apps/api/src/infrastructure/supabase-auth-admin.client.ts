import { apiError, upstreamErrorMessage } from "../errors";
import type { SupabaseConfig } from "../config/env";

export type AuthAdminUser = {
  id: string;
  email?: string;
};

type AuthAdminUserResponse =
  | AuthAdminUser
  | {
      user?: AuthAdminUser;
    };

type AuthAdminListResponse = {
  users?: AuthAdminUser[];
};

export class SupabaseAuthAdminClient {
  constructor(private readonly config: SupabaseConfig) {}

  async findUserByEmail(email: string): Promise<AuthAdminUser | null> {
    const target = email.toLowerCase();

    for (let page = 1; page <= 10; page += 1) {
      const params = new URLSearchParams({
        page: String(page),
        per_page: "1000"
      });
      const response = await fetch(`${this.config.url}/auth/v1/admin/users?${params.toString()}`, {
        headers: this.headers()
      });

      if (!response.ok) {
        throw apiError(
          response.status,
          await upstreamErrorMessage(response),
          "auth_admin_list_users_failed"
        );
      }

      const body = (await response.json()) as AuthAdminListResponse | AuthAdminUser[];
      const users = Array.isArray(body) ? body : (body.users ?? []);
      const match = users.find((user) => user.email?.toLowerCase() === target);
      if (match) {
        return match;
      }

      if (users.length < 1000) {
        return null;
      }
    }

    return null;
  }

  async createUserWithPassword(email: string, password: string): Promise<AuthAdminUser> {
    const response = await fetch(`${this.config.url}/auth/v1/admin/users`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          rghs1_created_by: "global-admin"
        }
      })
    });

    if (!response.ok) {
      throw apiError(
        response.status,
        await upstreamErrorMessage(response),
        "auth_admin_create_user_failed"
      );
    }

    return this.parseUser((await response.json()) as AuthAdminUserResponse);
  }

  private parseUser(body: AuthAdminUserResponse): AuthAdminUser {
    const user = (body as { user?: AuthAdminUser }).user ?? (body as AuthAdminUser);
    if (!user.id) {
      throw apiError(
        502,
        "Supabase Auth Admin did not return a user id.",
        "auth_admin_user_missing_id"
      );
    }

    return {
      id: user.id,
      email: user.email
    };
  }

  private headers(): HeadersInit {
    return {
      apikey: this.config.serviceRoleKey,
      authorization: `Bearer ${this.config.serviceRoleKey}`,
      "content-type": "application/json"
    };
  }
}
