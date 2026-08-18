import { Fragment, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "../../components/Card/Card";
import { Checkbox } from "../../components/Checkbox/Checkbox";
import { Icon } from "../../components/Icon/Icon";
import { Button } from "../../components/Button/Button";
import { Toggle } from "../../components/Toggle/Toggle";
import { useAuth, useCurrentUserName } from "../../hooks/useAuth";
import { useLanguage } from "../../hooks/useLanguage";
import { useDialog } from "../../hooks/useDialog";
import { useSettings } from "../../hooks/useSettings";
import { useTeamSettings } from "../../hooks/useTeamSettings";
import { useCorrections } from "../../hooks/useCorrections";
import {
  updateTeamMember,
  deleteTeamMember,
  setRolePermission,
  deleteRolePermissionRows,
  type TeamMember,
} from "../../lib/directus";
import {
  ALLOW,
  PERMISSION_GRID,
  PERMISSION_GRID_ROLES,
  normalizeRole,
  type Capability,
  type Role,
} from "../../lib/domain";
import styles from "./Settings.module.css";

const NOT_AVAILABLE =
  "Not available yet — this feature has no backing implementation.";

/** Full Settings page — Account, Team, Roles & Permissions, Intake Learning, Cold Storage, Dispatch, General, and Data sections. */
export function Settings() {
  const navigate = useNavigate();
  const auth = useAuth();
  const { role, logout, can, refreshPermissions } = auth;
  const name = useCurrentUserName();
  const { settings, learnedMatches, loading, error, update } = useSettings();
  const { lang, setLang, t } = useLanguage();
  const { alert, confirm } = useDialog();
  const {
    rows: correctionRows,
    loading: correctionsLoading,
    error: correctionsError,
    deletingIds: deletingCorrectionIds,
    remove: removeCorrection,
  } = useCorrections();
  const {
    members,
    roles,
    permRows,
    loading: teamLoading,
    error: teamError,
    reload: reloadTeam,
    setPermRows,
    setMembers,
  } = useTeamSettings();

  const canManageSettings = can("manageSettings");
  const canManageRoles = can("manageRoles");
  const canBackupRestore = can("backupRestore");
  const canExportCSV = can("exportCSV");
  const isOwner = role === "Owner";

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRoleId, setEditRoleId] = useState("");
  const [savingMember, setSavingMember] = useState(false);

  function handleLangChange(next: "en" | "id") {
    update({ lang: next });
    // Live-update this session's language immediately — update() only
    // persists to Directus, it doesn't touch the render-time t() the rest
    // of the app reads from.
    setLang(next);
  }

  /**
   * `update()` (useSettings) can fail silently if not awaited — surface any
   * error instead of letting a toggle/input appear to do nothing. Found via
   * a real bug: `updateSettings()` used to PATCH `/items/settings/:id`,
   * which 404s for a Directus singleton collection (no such route), so every
   * settings write here failed with the error never shown to anyone.
   */
  async function handleSettingUpdate(patch: Record<string, unknown>) {
    const res = await update(patch);
    if (res.error) alert(res.error, { title: t("Settings update failed") });
  }

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  function startEdit(m: TeamMember) {
    setEditingId(m.id);
    setEditName(`${m.first_name ?? ""} ${m.last_name ?? ""}`.trim());
    setEditRoleId(m.role?.id ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(id: string) {
    setSavingMember(true);
    const trimmed = editName.trim();
    const [first, ...rest] = trimmed.split(/\s+/);
    const res = await updateTeamMember(id, {
      first_name: first || "",
      last_name: rest.join(" "),
      role: editRoleId,
    });
    setSavingMember(false);
    if (res.error) {
      alert(res.error, { title: t("Couldn't save member") });
      return;
    }
    setEditingId(null);
    reloadTeam();
  }

  async function deleteMember(m: TeamMember) {
    const fullName =
      `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim() || m.email;
    if (
      !(await confirm(
        `${t("Remove")} ${fullName} — ${t("This cannot be undone.")}`,
        {
          title: t("Remove team member"),
          danger: true,
          confirmLabel: t("Remove"),
        },
      ))
    ) {
      return;
    }
    const res = await deleteTeamMember(m.id);
    if (res.error) {
      alert(res.error, { title: t("Couldn't remove member") });
      return;
    }
    setEditingId(null);
    reloadTeam();
  }

  async function handleDeleteCorrection(id: string, tokenKey: string) {
    if (
      !(await confirm(
        `${t("Remove learned match")} "${tokenKey}"? ${t("This cannot be undone.")}`,
        {
          title: t("Remove learned match"),
          danger: true,
          confirmLabel: t("Remove"),
        },
      ))
    ) {
      return;
    }
    const res = await removeCorrection(id);
    if (res.error) {
      alert(res.error, { title: t("Couldn't remove match") });
    }
  }

  async function handleToggleActive(m: TeamMember, nextActive: boolean) {
    const prevStatus = m.status;
    const nextStatus = nextActive ? "active" : "suspended";
    // Optimistic, same reasoning as toggleCell below: reloadTeam() would
    // refetch members + roles + permRows together and flip teamLoading,
    // flickering "Loading team…" over the whole section for a single-row
    // status flip.
    setMembers((prev) =>
      prev.map((x) => (x.id === m.id ? { ...x, status: nextStatus } : x)),
    );
    const res = await updateTeamMember(m.id, { status: nextStatus });
    if (res.error) {
      setMembers((prev) =>
        prev.map((x) => (x.id === m.id ? { ...x, status: prevStatus } : x)),
      );
      alert(res.error, { title: t("Couldn't update member status") });
    }
  }

  function permValue(
    gridRole: Exclude<Role, "Owner">,
    cap: Capability,
  ): boolean {
    const row = permRows.find(
      (r) => normalizeRole(r.role) === gridRole && r.capability === cap,
    );
    if (row) return row.allowed;
    return ALLOW[gridRole]?.[cap] === true;
  }

  async function toggleCell(
    gridRole: Exclude<Role, "Owner">,
    cap: Capability,
    next: boolean,
  ) {
    const existing = permRows.find(
      (r) => normalizeRole(r.role) === gridRole && r.capability === cap,
    );

    // Optimistic: flip immediately, persist in the background, revert on
    // error only. Patches `permRows` directly instead of routing through
    // `reloadTeam()` — that refetches members + roles + permRows together
    // and flips `teamLoading`, which visibly flickers the unrelated Team
    // section on every single grid click.
    if (existing) {
      setPermRows((prev) =>
        prev.map((r) => (r.id === existing.id ? { ...r, allowed: next } : r)),
      );
    } else {
      setPermRows((prev) => [
        ...prev,
        {
          id: `pending-${gridRole}-${cap}`,
          role: gridRole,
          capability: cap,
          allowed: next,
        },
      ]);
    }

    const res = await setRolePermission(
      existing?.id ?? null,
      gridRole,
      cap,
      next,
    );
    if (res.error) {
      // Revert the optimistic change.
      if (existing) {
        setPermRows((prev) =>
          prev.map((r) =>
            r.id === existing.id ? { ...r, allowed: existing.allowed } : r,
          ),
        );
      } else {
        setPermRows((prev) =>
          prev.filter((r) => r.id !== `pending-${gridRole}-${cap}`),
        );
      }
      alert(res.error, { title: t("Permission update failed") });
      return;
    }
    // A newly created row's real id comes back from the write — swap it in
    // for the placeholder so a follow-up toggle on the same cell updates
    // instead of creating a duplicate row.
    if (!existing && res.data) {
      const realId = res.data;
      setPermRows((prev) =>
        prev.map((r) =>
          r.id === `pending-${gridRole}-${cap}` ? { ...r, id: realId } : r,
        ),
      );
    }
    await refreshPermissions();
  }

  async function handleResetPermissions() {
    if (
      !(await confirm(
        `${t("Reset all role permissions to defaults?")} ${t("This clears every override.")}`,
        { title: t("Reset permissions"), danger: true },
      ))
    ) {
      return;
    }
    // Real ids only — a still-pending optimistic row from toggleCell (id
    // prefixed "pending-") has nothing persisted yet to delete.
    const idsToDelete = permRows
      .map((r) => r.id)
      .filter((id) => !id.startsWith("pending-"));
    const previousRows = permRows;
    setPermRows([]);
    const res = await deleteRolePermissionRows(idsToDelete);
    if (res.error) {
      setPermRows(previousRows);
      alert(res.error, { title: t("Reset failed") });
      return;
    }
    await refreshPermissions();
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>{t("Settings")}</h1>

      <section>
        <h2 className={styles.sectionHeading}>{t("Account")}</h2>
        <Card>
          <span className={styles.accountName}>{name || "—"}</span>
          <span className={styles.accountRole}>{role ?? ""}</span>
        </Card>
      </section>

      {canManageRoles && (
        <section>
          <h2 className={styles.sectionHeading}>{t("Team")}</h2>
          <p className={styles.body}>
            {t(
              "Manage who can log in. Toggle a member inactive to block their access without deleting the account.",
            )}
          </p>
          {teamLoading ? (
            <div className={styles.muted}>{t("Loading team…")}</div>
          ) : teamError ? (
            <div className={styles.error}>{teamError}</div>
          ) : (
            <Card className={styles.teamCard}>
              {members.map((m) => {
                const isEditing = editingId === m.id;
                return (
                  <div key={m.id} className={styles.teamMember}>
                    <div className={styles.teamRowHeader}>
                      <div className={styles.teamInfo}>
                        <span className={styles.teamName}>
                          {`${m.first_name ?? ""} ${m.last_name ?? ""}`.trim() ||
                            m.email}
                        </span>
                        <span className={styles.teamRole}>
                          {m.role?.name ?? "—"}
                        </span>
                      </div>
                      <div className={styles.teamActions}>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          iconOnly
                          icon="pencilEdit"
                          title={t("Edit")}
                          isActive={isEditing}
                          onClick={() =>
                            isEditing ? cancelEdit() : startEdit(m)
                          }
                        >
                          {t("Edit")}
                        </Button>
                        <Toggle
                          size="md"
                          label={
                            m.status === "active"
                              ? t("Deactivate member")
                              : t("Activate member")
                          }
                          checked={m.status === "active"}
                          onChange={(next) => handleToggleActive(m, next)}
                        />
                      </div>
                    </div>

                    {isEditing && (
                      <div className={styles.teamEditRow}>
                        <div className={styles.teamEditGrid}>
                          <input
                            className={styles.input}
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            placeholder={t("Name")}
                          />
                          <select
                            className={styles.select}
                            value={editRoleId}
                            onChange={(e) => setEditRoleId(e.target.value)}
                          >
                            {roles.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className={styles.teamEditFooter}>
                          <Button
                            type="button"
                            variant="tertiary"
                            size="sm"
                            iconOnly
                            icon="trash"
                            title={t("Remove member")}
                            onClick={() => deleteMember(m)}
                          >
                            {t("Remove")}
                          </Button>
                          <div className={styles.teamEditActions}>
                            <Button
                              type="button"
                              variant="secondary"
                              size="md"
                              onClick={cancelEdit}
                            >
                              {t("Cancel")}
                            </Button>
                            <Button
                              type="button"
                              variant="primary"
                              size="md"
                              disabled={savingMember}
                              onClick={() => saveEdit(m.id)}
                            >
                              {t("Save")}
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </Card>
          )}
        </section>
      )}

      {isOwner && (
        <section>
          <h2 className={styles.sectionHeading}>{t("Roles & Permissions")}</h2>
          <p className={styles.body}>
            {t(
              "Turn each function on or off per role. Owner always has full access. Tap a cell to change it.",
            )}
          </p>
          <Card className={styles.gridCard}>
            <div className={styles.gridScroll}>
              <table className={styles.permTable}>
                <thead>
                  <tr>
                    <th></th>
                    {PERMISSION_GRID_ROLES.map((r) => (
                      <th key={r}>{t(r)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PERMISSION_GRID.map((group) => (
                    <Fragment key={group.section}>
                      <tr className={styles.groupRow}>
                        <td colSpan={PERMISSION_GRID_ROLES.length + 1}>
                          {t(group.section)}
                        </td>
                      </tr>
                      {group.rows.map(({ cap, label }) => (
                        <tr key={cap}>
                          <td className={styles.permLabel}>{t(label)}</td>
                          {PERMISSION_GRID_ROLES.map((r) => {
                            const allowed = permValue(r, cap);
                            return (
                              <td key={r} className={styles.permCell}>
                                <Checkbox
                                  checked={allowed}
                                  onChange={(next) => toggleCell(r, cap, next)}
                                  label={`${t(label)} — ${t(r)}`}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <Button
              type="button"
              variant="tertiary"
              className={styles.resetLink}
              onClick={handleResetPermissions}
            >
              {t("Reset permissions to defaults")}
            </Button>
          </Card>
        </section>
      )}

      <section>
        <h2 className={styles.sectionHeading}>{t("Intake Learning")}</h2>
        <Card>
          <div className={styles.row}>
            <Icon name="ai" size={20} className={styles.rowIcon} />
            <div className={styles.rowInfo}>
              <span className={styles.rowTitle}>
                {learnedMatches} {t("learned matches")}
              </span>
              <span className={styles.rowNote}>
                {t(
                  "Shared knowledge base — every correction your team makes is kept and reused, reviewed here.",
                )}
              </span>
            </div>
          </div>
        </Card>

        {correctionsLoading ? (
          <div className={styles.muted}>{t("Loading learned matches…")}</div>
        ) : correctionsError ? (
          <div className={styles.error}>{correctionsError}</div>
        ) : correctionRows.length === 0 ? (
          <div className={styles.muted}>{t("No learned matches yet.")}</div>
        ) : (
          <Card className={styles.correctionsCard} flush>
            {correctionRows.map((c) => (
              <div key={c.id} className={styles.correctionRow}>
                <div className={styles.correctionInfo}>
                  <span className={styles.correctionToken}>
                    "{c.tokenKey}"
                    <span className={styles.correctionArrow}>→</span>
                    {c.productName}
                  </span>
                  <span className={styles.correctionMeta}>
                    {t("Added by")} {c.createdBy}
                    {c.dateCreated
                      ? ` · ${new Date(c.dateCreated).toLocaleDateString("en-US")}`
                      : ""}
                  </span>
                </div>
                <div className={styles.correctionRight}>
                  <span className={styles.correctionCount}>
                    {c.timesUsed} {c.timesUsed === 1 ? t("use") : t("uses")}
                  </span>
                  {canManageSettings && (
                    <Button
                      type="button"
                      variant="tertiary"
                      size="md"
                      iconOnly
                      icon="trash"
                      title={t("Remove learned match")}
                      disabled={deletingCorrectionIds.has(c.id)}
                      onClick={() => handleDeleteCorrection(c.id, c.tokenKey)}
                    >
                      {t("Remove")}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </Card>
        )}
      </section>

      {loading ? (
        <div className={styles.muted}>{t("Loading settings…")}</div>
      ) : error ? (
        <div className={styles.error}>{error}</div>
      ) : (
        <>
          {canManageSettings && (
            <>
              <section>
                <h2 className={styles.sectionHeading}>{t("Cold Storage")}</h2>
                <Card className={styles.stackedCard}>
                  <div className={styles.toggleRow}>
                    <div className={styles.rowInfo}>
                      <span className={styles.rowTitle}>
                        {t("Require a proof photo on every item")}
                      </span>
                      <span className={styles.rowNote}>
                        {t(
                          "Warehouse must attach at least one photo per item before releasing.",
                        )}
                      </span>
                    </div>
                    <Toggle
                      label={t("Require a proof photo on every item")}
                      checked={settings?.require_photo === true}
                      onChange={(next) =>
                        handleSettingUpdate({ require_photo: next })
                      }
                    />
                  </div>

                  <div className={styles.toleranceBlock}>
                    <span className={styles.rowTitle}>
                      {t("Weigh tolerance vs the order")}
                    </span>
                    <div className={styles.toleranceGrid}>
                      <label className={styles.toleranceField}>
                        <span className={styles.toleranceLabel}>
                          {t("Flag if below by (%)")}
                        </span>
                        <input
                          className={styles.input}
                          type="number"
                          min={0}
                          max={100}
                          value={settings?.tol_below_pct ?? 10}
                          onChange={(e) =>
                            handleSettingUpdate({
                              tol_below_pct: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                      <label className={styles.toleranceField}>
                        <span className={styles.toleranceLabel}>
                          {t("Flag if above by (%)")}
                        </span>
                        <input
                          className={styles.input}
                          type="number"
                          min={0}
                          max={100}
                          value={settings?.tol_above_pct ?? 10}
                          onChange={(e) =>
                            handleSettingUpdate({
                              tol_above_pct: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                    </div>
                    <span className={styles.rowNote}>
                      {t(
                        "A weighed total outside this range shows a gentle hint — it does not block.",
                      )}
                    </span>
                  </div>
                </Card>
              </section>

              <section>
                <h2 className={styles.sectionHeading}>{t("Dispatch")}</h2>
                <Card>
                  <div className={styles.toggleRow}>
                    <div className={styles.rowInfo}>
                      <span className={styles.rowTitle}>
                        {t("Require delivery proof photos")}
                      </span>
                      <span className={styles.rowNote}>
                        {t(
                          "Courier must attach condition, received-by & signed-invoice photos before marking delivered. Off = photos optional.",
                        )}
                      </span>
                    </div>
                    <Toggle
                      label={t("Require delivery proof photos")}
                      checked={settings?.dispatch_proof_required === true}
                      onChange={(next) =>
                        handleSettingUpdate({ dispatch_proof_required: next })
                      }
                    />
                  </div>
                </Card>
              </section>
            </>
          )}

          <section>
            <h2 className={styles.sectionHeading}>{t("General")}</h2>
            <Card>
              <div className={styles.row}>
                <Icon name="language" size={20} className={styles.rowIcon} />
                <div className={styles.rowInfo}>
                  <span className={styles.rowTitle}>{t("Language")}</span>
                  <span className={styles.rowNote}>
                    {t("Sets the default UI language for the whole team.")}
                  </span>
                </div>
                <div className={styles.langButtons}>
                  <Button
                    type="button"
                    variant={lang === "en" ? "primary" : "secondary"}
                    size="md"
                    onClick={() => handleLangChange("en")}
                  >
                    {t("English")}
                  </Button>
                  <Button
                    type="button"
                    variant={lang === "id" ? "primary" : "secondary"}
                    size="md"
                    onClick={() => handleLangChange("id")}
                  >
                    {t("Bahasa")}
                  </Button>
                </div>
              </div>
            </Card>
          </section>
        </>
      )}

      <section>
        <h2 className={styles.sectionHeading}>{t("Data")}</h2>
        <div className={styles.dataStack}>
          {canBackupRestore && (
            <Button
              type="button"
              variant="secondary"
              buttonStyle="fullWidth"
              size="lg"
              icon="download"
              onClick={() =>
                alert(t(NOT_AVAILABLE), { title: t("Backup unavailable") })
              }
            >
              {t("Backup everything (Download)")}
            </Button>
          )}
          <div className={styles.dataRow}>
            {canBackupRestore && (
              <Button
                type="button"
                variant="secondary"
                buttonStyle="fullWidth"
                size="lg"
                icon="restore"
                onClick={() =>
                  alert(t(NOT_AVAILABLE), { title: t("Restore unavailable") })
                }
              >
                {t("Restore from Backup")}
              </Button>
            )}
            {canExportCSV && (
              <Button
                type="button"
                variant="secondary"
                buttonStyle="fullWidth"
                size="lg"
                icon="export"
                onClick={() =>
                  alert(t(NOT_AVAILABLE), { title: t("Export unavailable") })
                }
              >
                {t("Export all orders (CSV)")}
              </Button>
            )}
          </div>
          <span className={styles.rowNote}>
            {t(
              "Full backup = orders, customers, settings + all photos in one file. Columns follow your role.",
            )}
          </span>

          <div className={styles.divider} />

          <Button
            type="button"
            variant="secondary"
            buttonStyle="fullWidth"
            size="lg"
            icon="logout"
            onClick={handleLogout}
          >
            {t("Logout")}
          </Button>
        </div>
      </section>
    </div>
  );
}
