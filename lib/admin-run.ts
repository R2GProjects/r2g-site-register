import {
  actorName,
  adminActiveFlag,
  adminLoginSource,
  isAdminActive,
  normalizeAdminUsername,
  validateAdminDisplayName,
  validateAdminPassword,
  validateAdminUsername,
  type AdminAccount,
} from "@/lib/admin-identity";
import {
  generateUUID,
  hashAdminPassword,
  nowISO,
  safeEqual,
  verifyAdminPassword,
} from "@/lib/auth";
import {
  create,
  ensureAdminUserTable,
  getOne,
  list,
  numericId,
  update,
} from "@/lib/nocodb";

const ADMIN_FIELDS =
  "Id,AdminUUID,Username,DisplayName,PasswordHash,Active,CreatedAt1,UpdatedAt1";

type StoredAdmin = AdminAccount & { id: number; passwordHash: string };

function asAccount(row: Record<string, unknown>): StoredAdmin | null {
  const id = numericId(row.Id);
  const username = normalizeAdminUsername(row.Username);
  if (!id || !username) return null;
  return {
    id,
    username,
    displayName: String(row.DisplayName ?? "").trim(),
    active: isAdminActive(row.Active),
    passwordHash: String(row.PasswordHash ?? ""),
  };
}

export function publicAdmin(row: Record<string, unknown>) {
  const account = asAccount(row);
  if (!account) return null;
  return {
    Id: account.id,
    Username: account.username,
    DisplayName: account.displayName,
    Active: account.active,
  };
}

async function loadAccounts() {
  const table = await ensureAdminUserTable();
  const rows = await list<Record<string, unknown>>(table, {
    limit: 200,
    sort: "Username",
    fields: ADMIN_FIELDS,
  });
  return {
    table,
    rows,
    accounts: rows
      .map(asAccount)
      .filter((row): row is StoredAdmin => row !== null),
  };
}

export async function listAdminUsers() {
  const { rows } = await loadAccounts();
  return rows
    .map(publicAdmin)
    .filter((row): row is NonNullable<typeof row> => row !== null);
}

export async function verifyAdminLogin(
  username: unknown,
  password: unknown
): Promise<string | null> {
  const user = String(username ?? "").trim();
  const pass = String(password ?? "").trim();
  if (!user || !pass) return null;

  const envUser = (process.env.ADMIN_USERNAME || "").trim();
  const envPass = (process.env.ADMIN_PASSWORD || "").trim();
  const { accounts } = await loadAccounts();
  const source = adminLoginSource(user, accounts, envUser);

  if (source === "table") {
    const row = accounts.find(
      (account) => account.username === normalizeAdminUsername(user)
    );
    if (!row || !verifyAdminPassword(pass, row.passwordHash)) return null;
    return actorName(row.username, row.displayName);
  }
  if (source === "env") {
    if (!envUser || !envPass) return null;
    if (!safeEqual(pass, envPass)) return null;
    return envUser;
  }
  return null;
}

export async function saveAdminUser(body: Record<string, unknown>) {
  const parsedUser = validateAdminUsername(body.Username ?? body.username);
  if (!parsedUser.ok) {
    return {
      error:
        parsedUser.reason === "noUser"
          ? "A login name is required."
          : "Use letters, numbers, dot, underscore or hyphen — two to 32 characters.",
      status: 400 as const,
    };
  }
  const displayName =
    validateAdminDisplayName(body.DisplayName ?? body.displayName) ||
    parsedUser.username;
  const existingId = numericId(body.Id ?? body.id);
  const passwordInput = body.password ?? body.Password;
  const hasPassword = String(passwordInput ?? "").trim() !== "";
  const parsedPass = hasPassword ? validateAdminPassword(passwordInput) : null;
  if (parsedPass && !parsedPass.ok) {
    return {
      error:
        parsedPass.reason === "short"
          ? "Password must be at least 8 characters."
          : parsedPass.reason === "long"
            ? "Password must be 64 characters or fewer."
            : "A password is required.",
      status: 400 as const,
    };
  }

  const { table, accounts } = await loadAccounts();
  const duplicate = accounts.find(
    (account) =>
      account.username === parsedUser.username && account.id !== existingId
  );
  if (duplicate) {
    return { error: "That login name is already in use.", status: 409 as const };
  }

  const now = nowISO();
  if (existingId) {
    const existing = await getOne<Record<string, unknown>>(table, existingId);
    if (!existing) return { error: "Admin not found.", status: 404 as const };
    const fields: Record<string, unknown> = {
      Username: parsedUser.username,
      DisplayName: displayName,
      Active: adminActiveFlag(body.Active ?? body.active ?? existing.Active),
      UpdatedAt1: now,
    };
    if (parsedPass?.ok) {
      fields.PasswordHash = hashAdminPassword(parsedPass.password);
    }
    await update(table, { Id: existingId, ...fields });
    return { id: existingId };
  }

  if (!parsedPass?.ok) {
    return { error: "A password is required.", status: 400 as const };
  }
  const id = await create(table, {
    AdminUUID: generateUUID(),
    Username: parsedUser.username,
    DisplayName: displayName,
    PasswordHash: hashAdminPassword(parsedPass.password),
    Active: "1",
    CreatedAt1: now,
    UpdatedAt1: now,
  });
  return { id };
}

export async function setAdminActive(id: number, active: unknown) {
  const table = await ensureAdminUserTable();
  const existing = await getOne<Record<string, unknown>>(table, id);
  if (!existing) return { error: "Admin not found.", status: 404 as const };
  await update(table, {
    Id: id,
    Active: adminActiveFlag(active),
    UpdatedAt1: nowISO(),
  });
  return { ok: true as const };
}
