import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "../Button/Button";
import { Icon } from "../Icon/Icon";
import type { IconName } from "../Icon/icons";
import type { DateRangeVal } from "../../types/dashboard";
import styles from "./MetricCard.module.css";

interface MetricCardProps {
  icon: IconName;
  value: number;
  label: string;
  rangeLabel: string;
  onRangeChange?: (val: DateRangeVal, label: string) => void;
}

/** Top-row metric card: icon + range dropdown, big number, label. */
export function MetricCard({
  icon,
  value,
  label,
  rangeLabel,
  onRangeChange,
}: MetricCardProps) {
  const [open, setOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{
    top: number;
    right: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        !containerRef.current?.contains(target) &&
        !dropdownRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    // Rendered in a portal (see below) so it can escape the mobile
    // metrics row's `overflow-x: auto` clipping — that also means it's no
    // longer anchored to the trigger via CSS, so any scroll (including the
    // horizontal metrics row itself) closes it rather than leaving it
    // floating in a stale position.
    function handleScroll() {
      setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [open]);

  function toggleOpen() {
    if (!open && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }
    setOpen((prev) => !prev);
  }

  return (
    <article className={styles.card}>
      <div className={styles.header}>
        <span className={styles.iconWrap}>
          <Icon name={icon} size={24} />
          <span className={styles.count}>{value}</span>
        </span>
        <div className={styles.rangeContainer} ref={containerRef}>
          {onRangeChange ? (
            <Button
              type="button"
              variant="secondary"
              aria-expanded={open}
              icon="chevronDown"
              iconPosition="right"
              className={styles.rangeButton}
              isActive={open}
              onClick={toggleOpen}
            >
              {rangeLabel}
            </Button>
          ) : (
            <span className={styles.rangeStatic}>{rangeLabel}</span>
          )}

          {onRangeChange &&
            open &&
            dropdownPos &&
            createPortal(
              <div
                ref={dropdownRef}
                className={styles.dropdown}
                role="dialog"
                aria-label="Select Date Range"
                style={{ top: dropdownPos.top, right: dropdownPos.right }}
              >
                <Button
                  type="button"
                  variant="ghost"
                  buttonStyle="fullWidth"
                  align="left"
                  onClick={() => {
                    onRangeChange?.({ type: "all" }, "All time");
                    setOpen(false);
                  }}
                >
                  All time
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  align="left"
                  buttonStyle="fullWidth"
                  onClick={() => {
                    onRangeChange?.({ type: "today" }, "Today");
                    setOpen(false);
                  }}
                >
                  Today
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  buttonStyle="fullWidth"
                  align="left"
                  onClick={() => {
                    onRangeChange?.({ type: "week" }, "This Week");
                    setOpen(false);
                  }}
                >
                  This Week
                </Button>
                <div className={styles.dropdownItemInput}>
                  <span>Select Month</span>
                  <input
                    type="month"
                    aria-label="Select Month"
                    onChange={(e) => {
                      if (e.target.value) {
                        const [y, m] = e.target.value.split("-");
                        const date = new Date(
                          parseInt(y, 10),
                          parseInt(m, 10) - 1,
                          1,
                        );
                        const monthName = date.toLocaleDateString("en-US", {
                          month: "long",
                          year: "numeric",
                        });
                        onRangeChange?.(
                          { type: "month", month: e.target.value },
                          monthName,
                        );
                        setOpen(false);
                      }
                    }}
                  />
                </div>
                <div className={styles.dropdownItemInput}>
                  <span>Select Year</span>
                  <input
                    type="number"
                    min="2020"
                    max="2100"
                    placeholder="e.g. 2026"
                    aria-label="Select Year"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const val = parseInt(
                          (e.target as HTMLInputElement).value,
                          10,
                        );
                        if (val >= 2020 && val <= 2100) {
                          onRangeChange?.(
                            { type: "year", year: val },
                            String(val),
                          );
                          setOpen(false);
                        }
                      }
                    }}
                  />
                </div>
                <div className={styles.dropdownItemInput}>
                  <span>Select Specific Date</span>
                  <input
                    type="date"
                    aria-label="Select Specific Date"
                    onChange={(e) => {
                      if (e.target.value) {
                        onRangeChange?.(
                          { type: "specific", date: e.target.value },
                          e.target.value,
                        );
                        setOpen(false);
                      }
                    }}
                  />
                </div>
              </div>,
              document.body,
            )}
        </div>
      </div>
      <div className={styles.body}>
        <span className={styles.label}>{label}</span>
      </div>
    </article>
  );
}
