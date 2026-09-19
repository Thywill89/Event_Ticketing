"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";

type Props = {
  onScan: (text: string) => void;
  disabled?: boolean;
};

/**
 * Optional camera QR scanner. Manual entry remains the primary path on Windows
 * when camera permissions or drivers are awkward.
 */
export function QrScanner({ onScan, disabled }: Props) {
  const regionId = useId().replace(/:/g, "");
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const lastScanRef = useRef<{ value: string; at: number }>({ value: "", at: 0 });

  useEffect(() => {
    return () => {
      const scanner = scannerRef.current;
      scannerRef.current = null;
      if (scanner?.isScanning) {
        void scanner.stop().catch(() => undefined);
      }
    };
  }, []);

  async function start() {
    setError(null);
    setStarting(true);
    try {
      const scanner = new Html5Qrcode(regionId);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 8, qrbox: { width: 240, height: 240 } },
        (decoded) => {
          const now = Date.now();
          const last = lastScanRef.current;
          if (decoded === last.value && now - last.at < 2500) return;
          lastScanRef.current = { value: decoded, at: now };
          onScan(decoded);
        },
        () => undefined,
      );
      setActive(true);
    } catch (err) {
      setActive(false);
      scannerRef.current = null;
      setError(
        err instanceof Error
          ? err.message
          : "Camera unavailable — use manual entry instead",
      );
    } finally {
      setStarting(false);
    }
  }

  async function stop() {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    setActive(false);
    if (scanner?.isScanning) {
      try {
        await scanner.stop();
      } catch {
        /* ignore */
      }
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {!active ? (
          <Button
            type="button"
            variant="outline"
            disabled={disabled || starting}
            onClick={() => void start()}
          >
            {starting ? "Starting camera…" : "Start camera scan"}
          </Button>
        ) : (
          <Button type="button" variant="outline" onClick={() => void stop()}>
            Stop camera
          </Button>
        )}
      </div>
      {error ? (
        <p className="text-sm text-muted-foreground">{error}</p>
      ) : null}
      <div
        id={regionId}
        className={
          active
            ? "overflow-hidden rounded-xl ring-1 ring-foreground/10"
            : "hidden"
        }
      />
    </div>
  );
}
