import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RentalBarcodeScanner } from "./RentalBarcodeScanner";
const scanner = vi.hoisted(() => ({ decode: vi.fn(), stop: vi.fn() }));
vi.mock("@zxing/browser", () => ({
  BrowserMultiFormatReader: class {
    decodeFromVideoDevice = scanner.decode;
  },
}));
beforeEach(() => {
  scanner.stop.mockReset();
  scanner.decode.mockReset();
});
describe("rental barcode scanner", () => {
  it("forwards a decoded barcode once and stops the camera", async () => {
    const onScan = vi.fn();
    scanner.decode.mockImplementation(async (_device, _video, callback) => {
      callback({ getText: () => " 123456 " }, null, { stop: scanner.stop });
      return { stop: scanner.stop };
    });
    render(<RentalBarcodeScanner onScan={onScan} />);
    await waitFor(() => expect(onScan).toHaveBeenCalledWith("123456"));
    expect(onScan).toHaveBeenCalledTimes(1);
    expect(scanner.stop).toHaveBeenCalled();
  });
  it("stops a camera that resolves after the inline form closes", async () => {
    let resolve!: (controls: { stop: () => void }) => void;
    scanner.decode.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const view = render(<RentalBarcodeScanner onScan={vi.fn()} />);
    await waitFor(() => expect(scanner.decode).toHaveBeenCalled());
    view.unmount();
    resolve({ stop: scanner.stop });
    await waitFor(() => expect(scanner.stop).toHaveBeenCalled());
  });
  it("keeps manual entry available when camera access fails", async () => {
    scanner.decode.mockRejectedValue(new Error("Camera denied"));
    render(<RentalBarcodeScanner onScan={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter the barcode manually",
    );
  });
});
