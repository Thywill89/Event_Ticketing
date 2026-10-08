"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { get, useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  MapPin,
  Plus,
  Ticket,
  Trash2,
} from "lucide-react";
import { OrganizerShell } from "@/components/organizer-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ApiError,
  createOrganizerEvent,
  createTicketType,
  submitEventForReview,
  uploadEventMainImage,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatHourMinuteAmPm, formatShortWeekdayDate } from "@/lib/datetime";
import {
  emptyVenueForm,
  newEventFormSchema,
  type TicketRowFormValues,
} from "@/lib/form-schemas";
import styles from "./page.module.css";

type NewEventFormInput = z.input<typeof newEventFormSchema>;
type NewEventFormOutput = z.output<typeof newEventFormSchema>;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function defaultSchedule() {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start);
  end.setHours(end.getHours() + 1);
  return {
    startDate: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
    startTime: `${pad(start.getHours())}:${pad(start.getMinutes())}`,
    endDate: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`,
    endTime: `${pad(end.getHours())}:${pad(end.getMinutes())}`,
  };
}

function newTicketRow(): TicketRowFormValues {
  return {
    name: "Regular",
    price: "0",
    quantityTotal: "100",
  };
}

const TIME_OPTIONS: string[] = Array.from({ length: 48 }, (_, i) => {
  const hours = Math.floor(i / 2);
  const minutes = i % 2 === 0 ? 0 : 30;
  return `${pad(hours)}:${pad(minutes)}`;
});

function snapToHalfHour(time: string): string {
  if (!time) return TIME_OPTIONS[0]!;
  const [hRaw, mRaw] = time.split(":");
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return TIME_OPTIONS[0]!;
  const snapped = m < 15 ? 0 : m < 45 ? 30 : 0;
  const hours = m >= 45 ? (h + 1) % 24 : h;
  return `${pad(hours)}:${pad(snapped)}`;
}

function parseYmd(value: string): { y: number; m: number; d: number } | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return { y, m, d };
}

function toYmd(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

function monthLabel(y: number, m: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(y, m - 1, 1));
}

function buildMonthCells(y: number, m: number) {
  const first = new Date(y, m - 1, 1);
  const startPad = first.getDay(); // 0 Sun
  const daysInMonth = new Date(y, m, 0).getDate();
  const cells: Array<{ day: number | null; value: string | null }> = [];

  for (let i = 0; i < startPad; i += 1) {
    cells.push({ day: null, value: null });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ day, value: toYmd(y, m, day) });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ day: null, value: null });
  }
  return cells;
}

function DateTimeChip({
  date,
  time,
  onDateChange,
  onTimeChange,
  dateLabel,
  timeLabel,
}: {
  date: string;
  time: string;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  dateLabel: string;
  timeLabel: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [dateOpen, setDateOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const selectedTime = snapToHalfHour(time);
  const parsed = parseYmd(date) ?? (() => {
    const now = new Date();
    return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
  })();
  const [viewYear, setViewYear] = useState(parsed.y);
  const [viewMonth, setViewMonth] = useState(parsed.m);

  useEffect(() => {
    if (!dateOpen) return;
    const current = parseYmd(date);
    if (current) {
      setViewYear(current.y);
      setViewMonth(current.m);
    }
  }, [dateOpen, date]);

  useEffect(() => {
    if (!dateOpen && !timeOpen) return;

    function onPointerDown(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setDateOpen(false);
        setTimeOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setDateOpen(false);
        setTimeOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [dateOpen, timeOpen]);

  useEffect(() => {
    if (!timeOpen || !listRef.current) return;
    const active = listRef.current.querySelector<HTMLElement>(
      `[data-time="${selectedTime}"]`,
    );
    active?.scrollIntoView({ block: "center" });
  }, [timeOpen, selectedTime]);

  const cells = buildMonthCells(viewYear, viewMonth);
  const today = (() => {
    const n = new Date();
    return toYmd(n.getFullYear(), n.getMonth() + 1, n.getDate());
  })();

  return (
    <div className={styles.whenRow} ref={wrapRef}>
      <div className={styles.dateWrap}>
        <button
          type="button"
          className={`${styles.whenChip} ${styles.dateChip} ${date ? "" : styles.whenChipEmpty}`}
          onClick={() => {
            setTimeOpen(false);
            setDateOpen((open) => !open);
          }}
          aria-label={dateLabel}
          aria-haspopup="dialog"
          aria-expanded={dateOpen}
        >
          <span>{formatShortWeekdayDate(date)}</span>
        </button>
        {dateOpen ? (
          <div className={styles.dateMenu} role="dialog" aria-label={dateLabel}>
            <div className={styles.dateMenuHead}>
              <button
                type="button"
                className={styles.dateNavBtn}
                aria-label="Previous month"
                onClick={() => {
                  if (viewMonth === 1) {
                    setViewMonth(12);
                    setViewYear((y) => y - 1);
                  } else {
                    setViewMonth((m) => m - 1);
                  }
                }}
              >
                <ChevronLeft className="size-4" />
              </button>
              <p className={styles.dateMenuTitle}>
                {monthLabel(viewYear, viewMonth)}
              </p>
              <button
                type="button"
                className={styles.dateNavBtn}
                aria-label="Next month"
                onClick={() => {
                  if (viewMonth === 12) {
                    setViewMonth(1);
                    setViewYear((y) => y + 1);
                  } else {
                    setViewMonth((m) => m + 1);
                  }
                }}
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
            <div className={styles.dateWeekdays} aria-hidden>
              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div className={styles.dateGrid}>
              {cells.map((cell, index) =>
                cell.value ? (
                  <button
                    key={cell.value}
                    type="button"
                    className={`${styles.dateDay} ${
                      cell.value === date ? styles.dateDayActive : ""
                    } ${cell.value === today ? styles.dateDayToday : ""}`}
                    onClick={() => {
                      onDateChange(cell.value!);
                      setDateOpen(false);
                    }}
                  >
                    {cell.day}
                  </button>
                ) : (
                  <span key={`empty-${index}`} className={styles.dateDayEmpty} />
                ),
              )}
            </div>
          </div>
        ) : null}
      </div>

      <div className={styles.timeWrap}>
        <button
          type="button"
          className={`${styles.whenChip} ${styles.timeChip} ${time ? "" : styles.whenChipEmpty}`}
          onClick={() => {
            setDateOpen(false);
            setTimeOpen((open) => !open);
          }}
          aria-label={timeLabel}
          aria-haspopup="listbox"
          aria-expanded={timeOpen}
        >
          <span>{formatHourMinuteAmPm(selectedTime)}</span>
        </button>
        {timeOpen ? (
          <div
            className={styles.timeMenu}
            role="listbox"
            aria-label={timeLabel}
            ref={listRef}
          >
            {TIME_OPTIONS.map((option) => {
              const active = option === selectedTime;
              return (
                <button
                  key={option}
                  type="button"
                  role="option"
                  aria-selected={active}
                  data-time={option}
                  className={`${styles.timeOption} ${active ? styles.timeOptionActive : ""}`}
                  onClick={() => {
                    onTimeChange(option);
                    setTimeOpen(false);
                  }}
                >
                  {formatHourMinuteAmPm(option)}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function NewEventPage() {
  const { token } = useAuth();
  const router = useRouter();
  const coverInputId = useId();
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);

  const {
    control,
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<NewEventFormInput, unknown, NewEventFormOutput>({
    resolver: zodResolver(newEventFormSchema),
    defaultValues: {
      event: { name: "", description: "", venue: emptyVenueForm },
      schedule: defaultSchedule(),
      tickets: [newTicketRow()],
    },
  });
  const {
    fields: ticketFields,
    append: appendTicket,
    remove: removeTicket,
  } = useFieldArray({ control, name: "tickets" });
  const { startDate, startTime, endDate, endTime } = useWatch({
    control,
    name: "schedule",
  });
  const scheduleError: string | undefined =
    get(errors, "event.startsAt")?.message ?? get(errors, "event.endsAt")?.message;

  useEffect(() => {
    if (!coverFile) {
      setCoverPreview(null);
      return;
    }
    const url = URL.createObjectURL(coverFile);
    setCoverPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [coverFile]);

  async function onSubmit({ event: body, tickets }: NewEventFormOutput) {
    if (!token) return;
    try {
      const event = await createOrganizerEvent(token, body);

      if (coverFile) {
        await uploadEventMainImage(token, event.id, coverFile);
      }

      for (const ticket of tickets) {
        await createTicketType(token, event.id, ticket);
      }

      await submitEventForReview(token, event.id);

      router.push(`/organizer/events/${event.id}`);
    } catch (err) {
      setError("root", {
        message: err instanceof ApiError ? err.message : "Failed to create event",
      });
    }
  }

  return (
    <OrganizerShell
      title="Create Event"
      description="Set the cover, details, and tickets — then submit for review."
      actions={
        <Button variant="outline" render={<Link href="/organizer/events" />}>
          Back to list
        </Button>
      }
    >
      <form noValidate onSubmit={handleSubmit(onSubmit)} className={styles.composer}>
        {errors.root?.message ? (
          <div className="md:col-span-2">
            <Alert variant="destructive">
              <AlertDescription>{errors.root.message}</AlertDescription>
            </Alert>
          </div>
        ) : null}

        <div className={styles.coverCol}>
          <div className={styles.coverFrame}>
            {coverPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={coverPreview}
                alt=""
                className={styles.coverImage}
              />
            ) : null}
            <input
              ref={coverInputRef}
              id={coverInputId}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="sr-only"
              onChange={(e) => {
                setCoverFile(e.target.files?.[0] ?? null);
              }}
            />
            <button
              type="button"
              className={styles.coverUpload}
              aria-label="Upload cover photo"
              onClick={() => coverInputRef.current?.click()}
            >
              <ImagePlus className="size-4" />
            </button>
          </div>
          <p className={styles.coverHint}>
            Cover photo · JPEG, PNG, WebP, or GIF · up to 5 MB
          </p>
        </div>

        <div className={styles.detailsCol}>
          <div>
            <input
              className={styles.nameInput}
              placeholder="Event Name"
              aria-label="Event name"
              aria-invalid={errors.event?.name ? true : undefined}
              {...register("event.name")}
            />
            <FieldError message={errors.event?.name?.message} />
          </div>

          <div className={styles.fieldCard}>
            <div className={styles.whenGrid}>
              <div className={styles.whenLabels} aria-hidden>
                <div className={styles.whenLabel}>
                  <span className={styles.whenDot} />
                  Start
                </div>
                <div className={styles.whenLabel}>
                  <span className={`${styles.whenDot} ${styles.whenDotEnd}`} />
                  End
                </div>
              </div>
              <div className={styles.whenInputs}>
                <DateTimeChip
                  date={startDate}
                  time={startTime}
                  onDateChange={(value) => {
                    setValue("schedule.startDate", value);
                    if (endDate && value > endDate) {
                      setValue("schedule.endDate", value);
                    }
                  }}
                  onTimeChange={(value) => {
                    setValue("schedule.startTime", value);
                    if (!startDate || !endDate || !endTime) return;
                    const startMs = new Date(
                      `${startDate}T${value}:00`,
                    ).getTime();
                    const endMs = new Date(`${endDate}T${endTime}:00`).getTime();
                    if (Number.isFinite(startMs) && endMs <= startMs) {
                      const next = new Date(startMs + 60 * 60 * 1000);
                      setValue(
                        "schedule.endDate",
                        `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`,
                      );
                      setValue(
                        "schedule.endTime",
                        `${pad(next.getHours())}:${pad(next.getMinutes())}`,
                      );
                    }
                  }}
                  dateLabel="Start date"
                  timeLabel="Start time"
                />
                <DateTimeChip
                  date={endDate}
                  time={endTime}
                  onDateChange={(value) => setValue("schedule.endDate", value)}
                  onTimeChange={(value) => setValue("schedule.endTime", value)}
                  dateLabel="End date"
                  timeLabel="End time"
                />
              </div>
            </div>
            <FieldError message={scheduleError} className="mt-2" />
          </div>

          <div className={styles.fieldCard}>
            <div className={styles.iconField}>
              <span className={styles.iconWrap} aria-hidden>
                <MapPin className="size-4" />
              </span>
              <div className={styles.iconFieldBody}>
                <p className={styles.iconFieldLabel}>Add Event Location</p>
                <Input
                  placeholder="Venue name"
                  aria-label="Venue name"
                  aria-invalid={errors.event?.venue?.name ? true : undefined}
                  {...register("event.venue.name")}
                />
                <FieldError message={errors.event?.venue?.name?.message} />
                <Input
                  placeholder="Address"
                  aria-label="Address"
                  aria-invalid={errors.event?.venue?.address ? true : undefined}
                  {...register("event.venue.address")}
                />
                <FieldError message={errors.event?.venue?.address?.message} />
                <Input
                  placeholder="City"
                  aria-label="City"
                  aria-invalid={errors.event?.venue?.city ? true : undefined}
                  {...register("event.venue.city")}
                />
                <FieldError message={errors.event?.venue?.city?.message} />
              </div>
            </div>
          </div>

          <div className={styles.fieldCard}>
            <div className={styles.iconField}>
              <span className={styles.iconWrap} aria-hidden>
                <CalendarClock className="size-4" />
              </span>
              <div className={styles.iconFieldBody}>
                <Label htmlFor="description" className={styles.iconFieldLabel}>
                  Add Description
                </Label>
                <Textarea
                  id="description"
                  rows={3}
                  placeholder="What should guests know?"
                  className="min-h-20 resize-y border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                  aria-invalid={errors.event?.description ? true : undefined}
                  {...register("event.description")}
                />
                <FieldError message={errors.event?.description?.message} />
              </div>
            </div>
          </div>

          <div className={styles.fieldCard}>
            <div className={styles.ticketHead}>
              <div className={styles.iconField}>
                <span className={styles.iconWrap} aria-hidden>
                  <Ticket className="size-4" />
                </span>
                <p className={styles.iconFieldLabel}>Ticket types</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => appendTicket(newTicketRow())}
              >
                <Plus className="size-3.5" />
                Add
              </Button>
            </div>
            <div className={styles.ticketList}>
              {ticketFields.map((field, index) => {
                const rowErrors = errors.tickets?.[index];
                return (
                  <div key={field.id} className={styles.ticketRow}>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`ticket-name-${field.id}`}>Name</Label>
                      <Input
                        id={`ticket-name-${field.id}`}
                        placeholder="Regular"
                        aria-invalid={rowErrors?.name ? true : undefined}
                        {...register(`tickets.${index}.name`)}
                      />
                      <FieldError message={rowErrors?.name?.message} />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`ticket-price-${field.id}`}>Price</Label>
                      <Input
                        id={`ticket-price-${field.id}`}
                        type="number"
                        min="0"
                        step="0.01"
                        aria-invalid={rowErrors?.price ? true : undefined}
                        {...register(`tickets.${index}.price`)}
                      />
                      <FieldError message={rowErrors?.price?.message} />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`ticket-qty-${field.id}`}>Capacity</Label>
                      <Input
                        id={`ticket-qty-${field.id}`}
                        type="number"
                        min="0"
                        step="1"
                        aria-invalid={rowErrors?.quantityTotal ? true : undefined}
                        {...register(`tickets.${index}.quantityTotal`)}
                      />
                      <FieldError message={rowErrors?.quantityTotal?.message} />
                    </div>
                    {ticketFields.length > 1 ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="justify-self-end"
                        aria-label="Remove ticket type"
                        onClick={() => removeTicket(index)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    ) : (
                      <span className="hidden sm:block" />
                    )}
                  </div>
                );
              })}
            </div>
            <FieldError
              message={errors.tickets?.root?.message ?? errors.tickets?.message}
            />
          </div>

          <div className={styles.submitBar}>
            <Button
              type="submit"
              disabled={isSubmitting}
              className={styles.submitBtn}
            >
              {isSubmitting ? "Creating…" : "Create Event"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              render={<Link href="/organizer/events" />}
            >
              Cancel
            </Button>
          </div>
        </div>
      </form>
    </OrganizerShell>
  );
}
