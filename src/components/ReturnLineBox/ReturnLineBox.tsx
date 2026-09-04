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

  return (
    <div className={styles.returnLineBox}>
      <div className={styles.returnLineName}>{line.name}</div>

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
                  })),
                  i,
                )
              }
            >
              <img src={p.url} alt="" className={styles.thumbnailImg} />
            </div>
          ))}
        </div>
      )}

      {isConfirmed && (
        <>
          <div className={styles.undoRow}>
            <div className={styles.left}>
              <Icon name="check" style={{ color: "var(--accent-primary)" }} />
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
                variant="secondary"
                size="sm"
                icon="camera"
                iconOnly
                title={t("Add weighing photo")}
                onClick={(e) => {
                  const inputElem = (e.currentTarget as HTMLElement)
                    .nextElementSibling as HTMLInputElement;
                  inputElem?.click();
                }}
              />
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
            <Button
              type="button"
              variant="secondary"
              buttonStyle="fullWidth"
              onClick={() => onConfirm(line.id)}
              disabled={confirming}
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
