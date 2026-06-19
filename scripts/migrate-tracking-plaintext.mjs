const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const masterKeyValue = process.env.ENCRYPTION_MASTER_KEY?.trim();

if (!supabaseUrl || !serviceRoleKey || !masterKeyValue) {
  fail(
    "SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and the legacy ENCRYPTION_MASTER_KEY are required."
  );
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const workspaceKeys = new Map();
const masterKey = decodeMasterKey(masterKeyValue);
const migrationConcurrency = 6;
const requestTimeoutMs = 20_000;
const requestAttempts = 3;

await migrateTable("tracking_profiles", "tracking-profile", async (row, payload) => {
  await patch("tracking_profiles", row.id, { name: payload.name });
});

await migrateTable(
  "tracking_profile_requests",
  "tracking-profile-request",
  async (row, payload) => {
    await patch("tracking_profile_requests", row.id, { name: payload.name });
  }
);

await migrateTable(
  "tracking_job_markets",
  "tracking-job-market",
  async (row, payload) => {
    await patch("tracking_job_markets", row.id, { name: payload.name });
  },
  "system=eq.false"
);

await migrateTable("bid_records", "bid-record", async (row, payload) => {
  await patch("bid_records", row.id, {
    job_title: payload.jobTitle,
    company: payload.company,
    job_link: payload.jobLink,
    bid_at: payload.bidAt,
    job_description: payload.jobDescription ?? null
  });

  const resumes = payload.profileResumes ?? {};
  await Promise.all(
    Object.entries(resumes).map(([profileId, resume]) =>
      patchComposite(
        "bid_record_profiles",
        {
          workspace_id: row.workspace_id,
          bid_id: row.id,
          profile_id: profileId
        },
        { resume }
      )
    )
  );

  if (payload.resumeLink && Object.keys(resumes).length === 0) {
    const assignments = await select(
      "bid_record_profiles",
      "profile_id",
      `workspace_id=eq.${row.workspace_id}&bid_id=eq.${row.id}&limit=1`
    );
    if (assignments[0]) {
      await patchComposite(
        "bid_record_profiles",
        {
          workspace_id: row.workspace_id,
          bid_id: row.id,
          profile_id: assignments[0].profile_id
        },
        { resume: payload.resumeLink }
      );
    }
  }
});

await migrateTable("interview_records", "interview-record", async (row, payload) => {
  const startAt = payload.startAt ?? payload.interviewAt;
  if (!startAt) {
    throw new Error(`Interview ${row.id} has no start timestamp.`);
  }
  const defaultEndAt = new Date(new Date(startAt).getTime() + 60 * 60 * 1000).toISOString();
  await patch("interview_records", row.id, {
    step: payload.step,
    start_at: startAt,
    end_at: payload.endAt ?? defaultEndAt,
    time_zone: payload.timeZone ?? "UTC",
    interview_link: payload.interviewLink,
    notes: payload.notes ?? null
  });
});

console.log("Tracking plaintext backfill completed.");

async function migrateTable(table, entityType, writePayload, extraFilter = "") {
  console.log(`${table}: loading encrypted rows...`);
  const query = [
    "select=id,workspace_id,encrypted_payload",
    "encrypted_payload=not.is.null",
    extraFilter
  ]
    .filter(Boolean)
    .join("&");
  const rows = await selectAll(table, "id,workspace_id,encrypted_payload", query);
  if (!rows.length) {
    console.log(`${table}: 0 row(s) migrated`);
    return;
  }
  console.log(`${table}: ${rows.length} row(s) to migrate`);
  for (let offset = 0; offset < rows.length; offset += migrationConcurrency) {
    const batch = rows.slice(offset, offset + migrationConcurrency);
    await Promise.all(
      batch.map(async (row) => {
        const payload = await decrypt(row.workspace_id, entityType, row.id, row.encrypted_payload);
        await writePayload(row, payload);
      })
    );
    console.log(
      `${table}: ${Math.min(offset + batch.length, rows.length)}/${rows.length} processed`
    );
  }
  console.log(`${table}: ${rows.length} row(s) migrated`);
}

async function select(table, fields, query = "") {
  const params = new URLSearchParams(query);
  params.set("select", fields);
  const response = await requestWithRetry(
    `${supabaseUrl}/rest/v1/${table}?${params}`,
    { headers: serviceHeaders() },
    `${table} read`
  );
  if (!response.ok) {
    fail(`${table} read failed: ${await responseMessage(response)}`);
  }
  return response.json();
}

async function selectAll(table, fields, query = "") {
  const pageSize = 1000;
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const params = new URLSearchParams(query);
    params.set("select", fields);
    params.set("order", "id.asc");
    params.set("limit", String(pageSize));
    params.set("offset", String(offset));
    const response = await requestWithRetry(
      `${supabaseUrl}/rest/v1/${table}?${params}`,
      { headers: serviceHeaders() },
      `${table} page read`
    );
    if (!response.ok) {
      fail(`${table} read failed: ${await responseMessage(response)}`);
    }
    const page = await response.json();
    rows.push(...page);
    if (page.length < pageSize) {
      return rows;
    }
  }
}

async function patch(table, id, values) {
  return patchComposite(table, { id }, values);
}

async function patchComposite(table, filters, values) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    params.set(key, `eq.${value}`);
  }
  const response = await requestWithRetry(
    `${supabaseUrl}/rest/v1/${table}?${params}`,
    {
      method: "PATCH",
      headers: serviceHeaders({ Prefer: "return=minimal" }),
      body: JSON.stringify(values)
    },
    `${table} update`
  );
  if (!response.ok) {
    fail(`${table} update failed: ${await responseMessage(response)}`);
  }
}

async function decrypt(workspaceId, entityType, recordId, envelope) {
  if (envelope?.v !== 1 || envelope?.alg !== "A256GCM" || !envelope.iv || !envelope.ciphertext) {
    throw new Error(`Invalid encrypted envelope for ${entityType} ${recordId}.`);
  }
  const key = await workspaceKey(workspaceId);
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: Buffer.from(envelope.iv, "base64"),
      additionalData: encoder.encode(`${workspaceId}:${entityType}:${recordId}:v1`),
      tagLength: 128
    },
    key,
    Buffer.from(envelope.ciphertext, "base64")
  );
  return JSON.parse(decoder.decode(plaintext));
}

async function workspaceKey(workspaceId) {
  if (!workspaceKeys.has(workspaceId)) {
    workspaceKeys.set(workspaceId, deriveWorkspaceKey(workspaceId));
  }
  return workspaceKeys.get(workspaceId);
}

async function deriveWorkspaceKey(workspaceId) {
  const sourceKey = await crypto.subtle.importKey("raw", masterKey, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode(workspaceId),
      info: encoder.encode("rghs1/workspace-tracking/v1")
    },
    sourceKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
}

function decodeMasterKey(value) {
  const normalized = value.replace(/\s+/g, "");
  const bytes = /^[a-f0-9]{64}$/i.test(normalized)
    ? Buffer.from(normalized, "hex")
    : Buffer.from(normalized, "base64");
  if (bytes.byteLength !== 32) {
    fail("The legacy ENCRYPTION_MASTER_KEY must decode to exactly 32 bytes.");
  }
  return bytes;
}

function serviceHeaders(extra = {}) {
  return {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    "content-type": "application/json",
    ...extra
  };
}

async function requestWithRetry(url, init, operation) {
  let lastError;
  for (let attempt = 1; attempt <= requestAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal
      });
      if (attempt < requestAttempts && (response.status === 429 || response.status >= 500)) {
        await response.body?.cancel();
        await delay(500 * 2 ** (attempt - 1));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt === requestAttempts) {
        break;
      }
      console.warn(`${operation}: attempt ${attempt} failed; retrying...`);
      await delay(500 * 2 ** (attempt - 1));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(
    `${operation} failed after ${requestAttempts} attempts: ${
      lastError instanceof Error ? lastError.message : "unknown network error"
    }`
  );
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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
