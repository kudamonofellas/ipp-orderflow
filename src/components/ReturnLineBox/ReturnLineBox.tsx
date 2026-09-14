import type { ChangeEvent } from "react";
import { Icon } from "../Icon/Icon";
import { Button } from "../Button/Button";
import type { OrderLinesCollection } from "../../types/directus";
import { formatClock } from "../../lib/format";
import styles from "./ReturnLineBox.module.css";

/** kg/gram only — matches `OrderDetail.tsx`'s own `isWeightOnlyUnit` (no
 *  shared home for either yet, so duplicated here per this component's own
 *  established convention of keeping small leaf-level utilities local
 *  rather than reaching back into the page's module). `order_lines.delivered`
 *  is never written for these units (`handleConfirmDelivery` skips them
 *  entirely — they're held back via the `short` flag instead), so `keptQty`
 *  below can't use `delivered` as its basis for them the way it does for
 *  counted lines. */
function isWeightUnit(unit: string | null | undefined): boolean {
  const u = (unit ?? "").toLowerCase();
  return u === "kg" || u === "gram";
}

/** kg/gram OR loaf — matches the prototype's `isWeighed` (`Dev-domain.js:35`:
 *  `isWeightUnit(u) || /^loa(f|ves)$/i.test(u)`). A loaf is counted but
 *  invoiced by catch-weight, so it needs a scale reading same as a pure
 *  weight-unit line does — `isWeightUnit` alone would miss it. */
function isWeighedUnit(unit: string | null | undefined): boolean {
  return isWeightUnit(unit) || /^loa(f|ves)$/i.test((unit ?? "").trim());
}

export interface ReturnLineBoxImageEntry {
  url: string;
  title: string;
  receiveLineId?: string;
  receivePhotoId?: string;
}

/** One returned-line box inside the Customer Return card — shared between
 *  the direct (isReturned-stage) and parallel (Incoming Return) receive
 *  flows, since both need identical read-only / interactive / confirmed
 *  states. `pendingAmount` is `line.returned` for the direct flow or
 *  `line.inbound_return` for the parallel flow. A real, module-level
 *  component (not a nested function inside `OrderDetail`) — its identity is
 *  stable across `OrderDetail` re-renders, so React never remounts it. */
export interface ReturnLineBoxPhoto {
  id: string;
  fileId: string;
  url: string;
}

export interface ReturnLineBoxProps {
  line: OrderLinesCollection;
  pendingAmount: number;
  returnedReason?: string | null;
  /** Drives the read-only fallback message when nobody can act on this line
   *  right now (e.g. an Admin viewing while it's still awaiting receipt). */
  orderReturnReceived?: boolean | null;
  canReceiveReturn: boolean;
  confirming: boolean;
  reopening: boolean;
  onConfirm: (lineId: string) => void;
  onReopen: (line: OrderLinesCollection) => void;
  receiveQtyValue: string | undefined;
  onReceiveQtyChange: (lineId: string, value: string) => void;
  /** Actual weighed kg for a loaf-type line, entered by the warehouse — see
   *  `isWeighedUnit`/`weighReady` below. Unused for non-loaf lines. */
  weightValue: string | undefined;
  onWeightChange: (lineId: string, value: string) => void;
  /** Courier's refusal-time evidence (`line_return_photos.kind === 'refusal'`)
   *  — always shown, read-only, no delete; a different capture moment than
   *  `photos` below (confirmed against the prototype's separate `returnPhotos`
   *  vs `returnedWeighPhoto` fields). */
  refusalPhotos: ReturnLineBoxPhoto[];
  /** Warehouse's receive/reweigh evidence (`kind === 'receive'`). */
  photos: ReturnLineBoxPhoto[];
  onUploadPhoto: (lineId: string, e: ChangeEvent<HTMLInputElement>) => void;
  onRemovePhoto: (lineId: string, photoId: string) => void;
  onOpenImage: (entries: ReturnLineBoxImageEntry[], index: number) => void;
  t: (key: string) => string;
}

export function ReturnLineBox({
  line,
  pendingAmount,
  returnedReason,
  orderReturnReceived,
  canReceiveReturn,
  confirming,
  reopening,
  onConfirm,
  onReopen,
  receiveQtyValue,
  onReceiveQtyChange,
  weightValue,
  onWeightChange,
  refusalPhotos,
  photos,
  onUploadPhoto,
  onRemovePhoto,
  onOpenImage,
  t,
}: ReturnLineBoxProps) {
  const isConfirmed = !!line.return_verified && Number(line.returned) > 0;
  const isPending = !isConfirmed && pendingAmount > 0;

  // What the customer kept vs. what came back — matches prototype's keptOf()
  // (Dev-OrderDetail.jsx:1092): weight-unit lines use (qty - returned), while
  // counted lines use line.delivered directly (net kept tally).
  const returnedQty = isConfirmed ? Number(line.returned) : pendingAmount;
  const keptQty = isWeightUnit(line.unit)
    ? Math.max(0, (Number(line.qty) || 0) - returnedQty)
    : Number(line.delivered) || 0;

  // Catch-weight receive gate for loaf-type lines — ported from the
  // prototype's `lineWeight`/`propWeight`/`overHard`/`overSoft`/`weighReady`
  // (`Dev-OrderDetail.jsx:1102-1113`), adapted from its whole-order gate to
  // this box's own per-line Confirm button. A loaf is COUNTED by the courier
  // but INVOICED by weight — the warehouse must enter the actual scale kg
  // before confirming, it doesn't just re-count.
  const loafLike = isWeighedUnit(line.unit) && !isWeightUnit(line.unit);
  // The line's total weighed kg ceiling — Cold Storage's catch-weight, or
  // the ordered kg for a pure weight-unit line.
  const lineWeight =
    Number(line.weight) ||
    (isWeightUnit(line.unit) ? Number(line.qty) || 0 : 0);
  // How many units left the warehouse this cycle (kept + returned) — the
  // base the returned loaves' proportional share of `lineWeight` is drawn
  // from.
  const sentCount =
    (Number(line.delivered) || 0) + (Number(line.returned) || 0);
  const propWeight =
    sentCount > 0
      ? lineWeight * ((Number(line.returned) || 0) / sentCount)
      : lineWeight;
  const vWt = parseFloat(weightValue ?? "") || 0;
  // HARD block: can never return more kg than the whole line ever weighed.
  const overHard = lineWeight > 0 && vWt > lineWeight + 1e-9;
  // SOFT flag only: individual loaves vary, so weighing in above the
  // returned count's *average* share isn't wrong — just worth a second look.
  const overSoft =
    loafLike && propWeight > 0 && vWt > propWeight + 1e-9 && !overHard;
  const weighReady = !overHard && (loafLike ? vWt > 0 : true);

  return (
    <div className={styles.returnLineBox}>
      <div className={styles.returnLineName}>{line.name}</div>

      {refusalPhotos.length > 0 && (
        <div
          className={`${styles.thumbnailsContainer} ${styles.thumbnailsContainerLoose}`}
        >
          {refusalPhotos.map((p, i) => (
            <div
              key={p.id}
              className={styles.thumbnailItem}
              onClick={() =>
                onOpenImage(
                  refusalPhotos.map((p2) => ({
                    url: p2.url,
                    title: `${t("Refusal photo")} · ${line.name}`,
                  })),
                  i,
                )
              }
            >
              <img src={p.url} alt="" className={styles.thumbnailImg} />
              {i === 0 && refusalPhotos.length > 1 && (
                <div className={styles.thumbnailCountBadge}>
                  <Icon name="touch" size={14} />
                  {t("See all")}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {isConfirmed && (
        <>
          <div className={styles.undoRow}>
            <div className={styles.left}>
              <Icon
                name="check"
                style={{ color: "var(--accent-primary)", flexShrink: 0 }}
              />
              {t("Received & verified at the warehouse")}
              {line.return_verified_at
                ? ` · ${formatClock(line.return_verified_at)}`
                : ""}
            </div>
            {canReceiveReturn && (
              <Button
                type="button"
                variant="tertiary"
                icon="undo"
                size="md"
                className={styles.inlineButton}
                onClick={() => onReopen(line)}
                disabled={reopening}
              >
                {t("Re-open & re-weigh")}
              </Button>
            )}
          </div>
        </>
      )}

      {keptQty > 0 && (
        <div className={styles.returnPill}>
          <Icon name="packageDelivered" size={20} />
          <span className={styles.detailValue}>
            {keptQty} {line.unit}
          </span>
          <span className={styles.returnPillLabel}>
            {t("kept by customer")}
          </span>
        </div>
      )}

      <div className={styles.returnPill}>
        <Icon name="packageReturned" size={20} />
        <span className={styles.detailValue}>
          {returnedQty} {line.unit}
          {loafLike && Number(line.returned_weight) > 0
            ? ` · ${Number(line.returned_weight).toFixed(2)} kg`
            : ""}
        </span>
        <span className={styles.returnPillLabel}>returned</span>
      </div>

      {returnedReason && (
        <p className={styles.detailValue}>
          {t("Reason:")} <strong>{returnedReason}</strong>
        </p>
      )}

      {isConfirmed ? null : isPending && canReceiveReturn ? (
        <>
          <div className={styles.followUpRow}>
            <input
              type="number"
              min="0"
              step="any"
              className={styles.editInput}
              style={{ width: 90 }}
              value={receiveQtyValue ?? String(pendingAmount)}
              onChange={(e) => onReceiveQtyChange(line.id, e.target.value)}
            />
            <span className="tiny muted">{line.unit}</span>
            <label style={{ display: "inline-flex", cursor: "pointer" }}>
              <Button
                type="button"
                variant="tertiary"
                icon="camera"
                title={t("Add weighing photo")}
                onClick={(e) => {
                  const inputElem = (e.currentTarget as HTMLElement)
                    .nextElementSibling as HTMLInputElement;
                  inputElem?.click();
                }}
              >
                Add weighing photo
              </Button>
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => onUploadPhoto(line.id, e)}
              />
            </label>
            {photos.length > 0 && (
              <div className={styles.thumbnailsContainer}>
                {photos.map((p, i) => (
                  <div
                    key={p.id}
                    className={styles.thumbnailItem}
                    onClick={() =>
                      onOpenImage(
                        photos.map((p2) => ({
                          url: p2.url,
                          title: `${t("Scale photo")} · ${line.name}`,
                          receiveLineId: line.id,
                          receivePhotoId: p2.id,
                        })),
                        i,
                      )
                    }
                  >
                    <img src={p.url} alt="" className={styles.thumbnailImg} />
                    {i === 0 && photos.length > 1 && (
                      <div className={styles.thumbnailCountBadge}>
                        <Icon name="touch" size={14} />
                        {t("See all")}
                      </div>
                    )}
                    <div
                      className={styles.thumbnailHoverTrash}
                      title={t("Delete image")}
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemovePhoto(line.id, p.id);
                      }}
                    >
                      <Icon name="trash" size={14} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={styles.cardActions}>
            {loafLike && (
              <div className={styles.followUpRow}>
                <span className="tiny muted" style={{ flexGrow: 1 }}>
                  {t("Actual returned weight")}
                  {lineWeight > 0
                    ? ` · ${t("sent")} ${propWeight.toFixed(2)} kg`
                    : ""}
                </span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="0.00"
                  className={styles.editInput}
                  style={{
                    width: 90,
                    ...(overHard
                      ? { borderColor: "var(--danger)" }
                      : overSoft
                        ? { borderColor: "var(--warning)" }
                        : {}),
                  }}
                  value={weightValue ?? ""}
                  onChange={(e) => onWeightChange(line.id, e.target.value)}
                />
                <span className={styles.secondary}>kg</span>
              </div>
            )}
            {overHard && (
              <p
                className={styles.infoHint}
                style={{ color: "var(--state-danger)" }}
              >
                {t("Can't return more than was sent")} — {lineWeight.toFixed(2)}{" "}
                kg.
              </p>
            )}
            {overSoft && (
              <p
                className={styles.infoHint}
                style={{ color: "var(--state-warning)" }}
              >
                {t("More than the usual weight for")} {returnedQty} {line.unit}{" "}
                (~
                {propWeight.toFixed(2)} kg) — {t("double-check")}.
              </p>
            )}
            {!weighReady && !overHard && (
              <p
                className={styles.infoHint}
                style={{ color: "var(--state-warning)" }}
              >
                {t(
                  "Weigh each returned loaf — the credit is based on actual kg.",
                )}
              </p>
            )}

            <Button
              type="button"
              variant="secondary"
              buttonStyle="fullWidth"
              onClick={() => onConfirm(line.id)}
              disabled={confirming || !weighReady}
            >
              {confirming ? t("Saving…") : t("Confirm received & weighed")}
            </Button>
          </div>
        </>
      ) : (
        <p className={styles.muted}>
          {orderReturnReceived
            ? t(
                "Received — waiting for an admin to update the Accurate documents and decide.",
              )
            : t(
                "Coming back to the warehouse — waiting for the warehouse to receive & verify the goods.",
              )}
        </p>
      )}
    </div>
  );
}
