"use client";
import { useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";

export function RentalBarcodeScanner({
  onScan,
}: {
  onScan: (value: string) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const callback = useRef(onScan);
  useEffect(() => {
    callback.current = onScan;
  }, [onScan]);
  const [error, setError] = useState("");
  useEffect(() => {
    let stopped = false;
    let controls: IScannerControls | undefined;
    void (async () => {
      try {
        const [
          { BrowserMultiFormatReader },
          { BarcodeFormat, DecodeHintType },
        ] = await Promise.all([
          import("@zxing/browser"),
          import("@zxing/library"),
        ]);
        if (stopped || !video.current) return;
        const hints = new Map([
          [
            DecodeHintType.POSSIBLE_FORMATS,
            [
              BarcodeFormat.CODE_128,
              BarcodeFormat.CODE_39,
              BarcodeFormat.CODE_93,
              BarcodeFormat.EAN_13,
              BarcodeFormat.EAN_8,
              BarcodeFormat.UPC_A,
              BarcodeFormat.UPC_E,
              BarcodeFormat.ITF,
            ],
          ],
        ]);
        controls = await new BrowserMultiFormatReader(
          hints,
        ).decodeFromVideoDevice(
          undefined,
          video.current,
          (result, _error, activeControls) => {
            if (result && !stopped) {
              stopped = true;
              activeControls.stop();
              callback.current(result.getText().trim());
            }
          },
        );
        if (stopped) controls.stop();
      } catch {
        if (!stopped)
          setError("Camera unavailable. Enter the barcode manually.");
      }
    })();
    return () => {
      stopped = true;
      controls?.stop();
    };
  }, []);
  return (
    <div>
      {error ? (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      ) : (
        <>
          <video
            ref={video}
            className="max-h-48 w-full rounded-lg"
            muted
            playsInline
          />
          <p role="status" className="text-xs">
            Point camera at the equipment barcode.
          </p>
        </>
      )}
    </div>
  );
}
