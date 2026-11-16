import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";

// jsdom does not implement these browser APIs.
URL.createObjectURL = vi.fn(() => "blob:preview");
URL.revokeObjectURL = vi.fn();
window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});
