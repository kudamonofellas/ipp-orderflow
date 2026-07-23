/**
 * Icon registry: semantic name → HugeIcons identifier.
 *
 * Kept separate from Icon.tsx so the component file only exports a component
 * (satisfies the react-refresh/only-export-components lint rule). Add new
 * icons here so the rest of the app never hardcodes a raw icon string.
 *
 * Icon set: @iconify-json/hugeicons.
 */
export const ICONS = {
  arrowRight: 'hugeicons:arrow-right-02',
  dashboard: 'hugeicons:dashboard-square-02',
  orders: 'hugeicons:license-draft',
  customers: 'hugeicons:user-multiple',
  products: 'hugeicons:package',
  reports: 'hugeicons:analytics-01',
  search: 'hugeicons:search-01',
  notification: 'hugeicons:notification-01',
  settings: 'hugeicons:settings-01',
  add: 'hugeicons:add-01',
  total: 'hugeicons:package',
  delivered: 'hugeicons:delivery-truck-01',
  returned: 'hugeicons:delivery-return-01',
  cancelled: 'hugeicons:package-remove',
  alert: 'hugeicons:alert-01',
  chevronDown: 'hugeicons:arrow-down-01',
  chevronRight: 'hugeicons:arrow-right-01',
  chevronLeft: 'hugeicons:arrow-left-01',
  close: 'hugeicons:cancel-01',
  trash: 'hugeicons:delete-02',
  logout: 'hugeicons:logout-05',
  check: 'hugeicons:checkmark-circle-02',
  whatsapp: 'hugeicons:whatsapp',
  attach: 'hugeicons:attachment-01',
  upload: 'hugeicons:upload-01',
  store: 'hugeicons:store-01',
  printer: 'hugeicons:printer',
  refresh: 'hugeicons:arrow-reload-horizontal',
  pause: 'hugeicons:pause',
  play: 'hugeicons:play',
  cancel: 'hugeicons:cancel-circle',
  edit: 'hugeicons:pencil-edit-02',
  paperclip: 'hugeicons:document-attachment',
  camera: 'hugeicons:camera-01',
  knife: 'hugeicons:knife-02',
  scale: 'hugeicons:weight-scale',
  document: 'hugeicons:file-01',
  save: 'hugeicons:floppy-disk'
} as const;

export type IconName = keyof typeof ICONS;
