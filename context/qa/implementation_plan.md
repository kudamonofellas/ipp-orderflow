# Implementation Plan: Immediate Condition Photo Persistence & In-Place Refusal Form

Align the Dispatch / Proof of Delivery workflow and the "Customer refused / returned" sub-flow with the prototype design.

## Proposed Changes

### 1. Proof of Delivery: Immediate Condition Photo DB Persistence
#### [MODIFY] [OrderDetail.tsx](file:///d:/IPP/IPP-OrderFlow/src/pages/OrderDetail/OrderDetail.tsx)
- **Persist on upload (`handleUploadProofPhoto`)**:
  - When `slot === "cond"` (condition photo) is uploaded, immediately save/update the `delivery_proofs` record in Directus (`createDeliveryProof` or `updateDeliveryProof`).
  - Set `activeProof` in component state to reference this record.
- **Persist on removal (`handleRemoveStagedProofPhoto`)**:
  - If a condition photo is deleted, update `delivery_proofs` to clear `cond_photo`.
- **Hydrate on initial load (`loadData`)**:
  - When loading the order, if an active (non-archived) `delivery_proofs` record exists in Directus, initialize `condPhotos`, `recvPhotos`, `signedPhotos`, `receiverName`, and COD outcomes from `activeProof`.
  - This ensures that if a courier refreshes or reopens the page, the uploaded condition photo thumbnail remains and all Proof of Delivery fields stay open.

---

### 2. In-Place "Customer refused / returned" Form inside Proof of Delivery
#### [MODIFY] [OrderDetail.tsx](file:///d:/IPP/IPP-OrderFlow/src/pages/OrderDetail/OrderDetail.tsx)
- **Move refusal form inside Proof of Delivery Card**:
  - Replace the separate, bottom-of-page `<Card>` (line 8144) with an inline section directly inside the Proof of Delivery card.
  - When `showRefuseForm` is active, hide `.cardActions` (the `Mark delivered`, `Customer refused`, and `Delivery failed` buttons) and render the refusal form in-place.
  - When *Cancel* is clicked, toggle `showRefuseForm` off and restore the standard `.cardActions` buttons.
- **Align Refusal Form with Prototype (`Dev-OrderDetail.jsx:922-1005`)**:
  - **Header**: *"What did the customer refuse?"* with subtext *"Each item can have its own reason + photos — different items may come back for different reasons."*
  - **Per-item rows**:
    - Item name, ordered/sent quantity.
    - Number input for refused quantity (`refuseQtyMap[l.id]`), decimal for weight units (kg/gram) and integer for counted units.
    - When refused quantity $> 0$:
      - Per-item reason input (`refuseReasonsMap[l.id]`) with placeholder *"Reason (optional)"*.
      - Per-item photo picker (`refusePhotosMap[l.id]`) with camera upload button and thumbnail delete (X) badge.
  - **"Refuse the whole order" shortcut**: One-tap button that sets all active lines' refused quantities to their maximum sent/ordered quantities.
  - **Partial Return Warning**: If some items are kept and some returned (`anyAccepted`), display: *"The customer kept some items — add the delivery proof above (received-by name, photos, and the signed/amended invoice) for those."*
  - **Confirm Return Action (`handleConfirmRefusal`)**:
    - Stores the per-line return quantities into `order_lines.returned`.
    - Uploads and links per-line return photos to `line_return_photos`.
    - Computes de-duplicated order-level `returned_reason` from per-line reasons and writes to `orders.returned_reason`.
    - If items were kept (partial return), also persists the staged delivery proof (receiver name, photos, COD collection) into `delivery_proofs`.
    - Transitions order stage to `'returned'` and records an event in `order_history`.

---

### 3. Styling & Polish
#### [MODIFY] [OrderDetail.module.css](file:///d:/IPP/IPP-OrderFlow/src/pages/OrderDetail/OrderDetail.module.css)
- Add styling for the in-place refusal card container (`.refusalBox`, `.refusalItemRow`, `.refusalItemInputs`, `.refuseWholeBtn`).

---

## Verification Plan

### Automated Tests
- Run `npm run build` (`tsc -b && vite build`) to verify type safety and bundle generation.

### Manual Verification
1. **Condition Photo Persistence**:
   - Go to an order in `dispatch` stage.
   - Upload an item condition photo.
   - Refresh the page: verify the condition thumbnail is still present and the remaining Proof of Delivery fields are visible.
2. **In-Place Refusal Form Toggle**:
   - Click **"Customer refused / returned"**: verify the action buttons disappear and the *"What did the customer refuse?"* section appears in-place.
   - Click **"Cancel"**: verify the form closes and the action buttons reappear.
3. **Refusal Form Interactions**:
   - Click **"Refuse the whole order"**: verify all line quantities fill with max quantities.
   - Enter a reason and upload a photo for an individual line.
   - Click **"Confirm return"**: verify the order transitions to `returned`, the return reasons/photos are saved, and the kept/returned counts display correctly.
