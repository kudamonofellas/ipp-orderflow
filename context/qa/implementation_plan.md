# Order Detail — 4 Fixes From Prior Feedback

Continuing unfinished feedback from another conversation. Four separate issues to address.

---

## 1. "Total:" text showing bare at intake stage

**Problem**: At intake (`new order`) stage, the "Total:" label renders with nothing after it when the line has a price but no weight, because `showLineDetail` evaluates `true` (via the `canSeePrices && hasPrice` branch), but the weight span (`stage !== "intake" && isWeighedItem`) is `false`. The price line appears correctly, but "Total:" still appears with just the weight info that isn't there.

**Diagnosis**: Actually, looking closer — at intake, `stage !== "intake" && isWeighedItem` is `false`, so the weight `<span>` (which contains `t("Total:")`) is **not** rendered. The issue must be about a different scenario. Let me re-read the user's request: *"can you make this text `{t("Total:")}` in the orders' item line shows up in the new order stage, just the 'Total' text"*.

This means the user **wants** the "Total:" label to appear at intake stage. Currently, the guard `stage !== "intake" && isWeighedItem` prevents it from showing at intake. The user wants at least the text "Total" to be visible at intake.

**Fix**: At intake, when there's a price to show, also show "Total:" as a label before the price calculation. Change the weight span guard from `stage !== "intake" && isWeighedItem` to always show the "Total:" text when `showLineDetail` is true, but only show the measured weight after it when `stage !== "intake" && isWeighedItem`.

### [MODIFY] [OrderDetail.tsx](file:///d:/IPP/IPP-OrderFlow/src/pages/OrderDetail/OrderDetail.tsx)

Lines ~4125–4148: Restructure the `itemTotalRow` so that:
- "Total:" text always shows when `showLineDetail` is true
- The weight measurement (`totalMeasuredWeight.toFixed(2) kg` + hints) only renders when `stage !== "intake" && isWeighedItem`
- This way at intake, the user sees `Total: 50,000 x 2  100,000` instead of just the price calc alone

---

## 2. Align "Replacement" subStatusBadge to the right of the `<td>` in OrderRow

**Problem**: The `StatusPill`'s "Replacement" badge is not pushed to the right edge of the status `<td>`. The current CSS uses `display: flex` on `.statusCell` and `flex: 1; justify-content: space-between` on the pill's `.wrap`, but `<td>` doesn't behave well with `display: flex` in all browsers.

> [!NOTE]
> The file is already named `OrderRow.tsx` (not `OrderRows.tsx`), so no rename is needed.

**Fix**: Update [OrderRow.module.css](file:///d:/IPP/IPP-OrderFlow/src/components/OrderRow/OrderRow.module.css) so the `.statusCell` properly pushes the replacement badge to the far right of the cell. Since `<td>` with `display: flex` can be unreliable, we'll keep the approach but ensure it works correctly or switch to a wrapper div.

### [MODIFY] [OrderRow.module.css](file:///d:/IPP/IPP-OrderFlow/src/components/OrderRow/OrderRow.module.css)

Update `.statusCell` styles for proper right-alignment of the Replacement badge.

---

## 3. "Signed DO/SI not returned yet" label on order rows

**Problem**: The Orders page has a "pending-docs" filter for "Signed DO/SI not returned yet" (delivered orders where `docs_returned !== true`), but there's no visual indicator on individual order rows in the table showing this status.

**Fix**: 
1. Add a `pendingDocs` boolean to the `OpenOrder` type (true when `stage === "delivered"` and `docs_returned !== true`)
2. Fetch the `docs_returned` field in [useOrders.ts](file:///d:/IPP/IPP-OrderFlow/src/hooks/useOrders.ts)
3. Surface it in the `toOpenOrder` mapping
4. In [StatusPill.tsx](file:///d:/IPP/IPP-OrderFlow/src/components/StatusPill/StatusPill.tsx), add a `pendingDocs` prop that renders a badge similar to the "Replacement" `subStatusBadge`
5. Pass it from [OrderRow.tsx](file:///d:/IPP/IPP-OrderFlow/src/components/OrderRow/OrderRow.tsx)

### [MODIFY] [dashboard.ts](file:///d:/IPP/IPP-OrderFlow/src/types/dashboard.ts)
Add `pendingDocs: boolean` to `OpenOrder`.

### [MODIFY] [useOrders.ts](file:///d:/IPP/IPP-OrderFlow/src/hooks/useOrders.ts)
- Add `docs_returned` to `orderFields`
- Pass it through `toOpenOrder` to set `pendingDocs`

### [MODIFY] [StatusPill.tsx](file:///d:/IPP/IPP-OrderFlow/src/components/StatusPill/StatusPill.tsx)
Add `pendingDocs?: boolean` prop — renders a `subStatusBadge` with an appropriate icon/text.

### [MODIFY] [OrderRow.tsx](file:///d:/IPP/IPP-OrderFlow/src/components/OrderRow/OrderRow.tsx)
Pass `pendingDocs={order.pendingDocs}` to `<StatusPill>`.

---

## 4. On Hold → Resume should return to original stage, not always dispatch

**Problem**: `handleHold` sets `stage: "outstanding"` but **doesn't save which stage the order was at**. Then `handleRestore` hardcodes `restoreStage = "dispatch"` for outstanding orders because `cancelled_from` was never set by `handleHold`. The user also wants the button labeled "Resume order" (not "Restore Order") when the order is on hold, with a prominent banner matching the prototype's on-hold card.

**Fix**:

### [MODIFY] [OrderDetail.tsx](file:///d:/IPP/IPP-OrderFlow/src/pages/OrderDetail/OrderDetail.tsx)

**`handleHold` (~line 2674)**: Save the current stage into `cancelled_from` (reuse the same field Cancel uses, since an order can't be both cancelled and on-hold simultaneously) so `handleRestore` can read it back.

```diff
-const holdPatch = { stage: "outstanding" };
+const holdPatch = { stage: "outstanding", cancelled_from: stage };
```

**`handleRestore` (~line 2712)**: Use `cancelled_from` for outstanding too (instead of hardcoding `"dispatch"`).

```diff
-const restoreStage = isOutstanding
-  ? "dispatch"
-  : (order.cancelled_from ?? "intake");
+const restoreStage = order.cancelled_from ?? "intake";
```

**Button label (~line 5902–5912)**: When the order is outstanding (on hold), show "Resume order" instead of "Restore Order", and use a play icon instead of refresh.

**On-hold banner**: Add a prominent on-hold banner card (like the prototype screenshot — orange border, "On hold" heading, "This order is paused — the process cannot continue until it is resumed.", with a full-width "Resume order" button) that appears when `isOutstanding` is true.

### [MODIFY] [OrderDetail.module.css](file:///d:/IPP/IPP-OrderFlow/src/pages/OrderDetail/OrderDetail.module.css)
Add styles for the on-hold banner card.

---

## Open Questions

> [!IMPORTANT]
> **"Signed DO/SI not returned yet" badge icon**: Should this use a document/warning icon, or just text? I'll use a small document icon (`doc` or `file`) with the text "Pending DO/SI" to keep it compact in the table row.

> [!IMPORTANT]
> **On-hold banner placement**: The prototype shows it as a prominent card. Should it go above the item list (near the top of the detail view), or in the actions area at the bottom? Based on the prototype screenshot, it seems like it should be a prominent card near the top — I'll place it right below the stepper/header area.

---

## Verification Plan

### Manual Verification
- Create an order, put it on hold from various stages, then resume — verify it returns to the correct stage each time
- Check that the "Total:" text appears at intake stage
- Verify the "Replacement" badge aligns to the right in the order row
- Filter by "pending-docs" and confirm the badge shows on order rows
- Check i18n (ID locale) for new translation keys
