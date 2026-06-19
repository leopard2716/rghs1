const email = process.argv[2]?.trim().toLowerCase();
const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!email) {
  fail("Usage: npm run bootstrap:platform-admin -- user@example.com");
}

if (!supabaseUrl || !serviceRoleKey) {
  fail("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the root .env file.");
}

const user = await findAuthUserByEmail(email);
if (!user) {
  fail(
    `No Supabase Auth user exists for ${email}. Create the user first, then rerun this command.`
  );
}

const response = await fetch(`${supabaseUrl}/rest/v1/platform_admins?on_conflict=user_id`, {
  method: "POST",
  headers: serviceHeaders({
    Prefer: "resolution=merge-duplicates,return=representation"
  }),
  body: JSON.stringify({
    user_id: user.id
  })
});

if (!response.ok) {
  fail(`Platform admin bootstrap failed: ${await responseMessage(response)}`);
}

console.log(`Platform admin ready: ${user.email ?? email} (${user.id})`);

async function findAuthUserByEmail(targetEmail) {
  for (let page = 1; page <= 10; page += 1) {
    const params = new URLSearchParams({
      page: String(page),
      per_page: "1000"
    });
    const response = await fetch(`${supabaseUrl}/auth/v1/admin/users?${params.toString()}`, {
      headers: serviceHeaders()
    });

    if (!response.ok) {
      fail(`Auth user lookup failed: ${await responseMessage(response)}`);
    }

    const body = await response.json();
    const users = Array.isArray(body) ? body : (body.users ?? []);
    const match = users.find((user) => user.email?.toLowerCase() === targetEmail);
    if (match) {
      return match;
    }

    if (users.length < 1000) {
      return null;
    }
  }

  return null;
}

function serviceHeaders(extra = {}) {
  return {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    "content-type": "application/json",
    ...extra
  };
}

async function responseMessage(response) {
  const text = await response.text();
  if (!text) {
    return `HTTP ${response.status}`;
  }

  try {
    const body = JSON.parse(text);
    return body.message ?? body.msg ?? body.error ?? text;
  } catch {
    return text;
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
