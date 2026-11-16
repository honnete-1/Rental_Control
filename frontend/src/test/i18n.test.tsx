import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { execFileSync } from "node:child_process";
import path from "node:path";

import i18n, { resources } from "@/i18n";
import { formatDate, formatMoney, relativeTime } from "@/lib/format";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { mockFetch, renderWithApp } from "./utils";

function flatKeys(obj: object, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) => (v && typeof v === "object" ? flatKeys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));
}

describe("translations", () => {
  afterEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("French and Kinyarwanda have exactly the same keys as English", () => {
    for (const ns of Object.keys(resources.en) as (keyof typeof resources.en)[]) {
      const en = flatKeys(resources.en[ns]).sort();
      expect(flatKeys(resources.fr[ns]).sort()).toEqual(en);
      expect(flatKeys(resources.rw[ns]).sort()).toEqual(en);
    }
  });

  it("the coverage script finds no missing keys used in the code", () => {
    const script = path.resolve(__dirname, "../../scripts/check-translations.mjs");
    expect(() => execFileSync(process.execPath, [script], { stdio: "pipe" })).not.toThrow();
  });

  it("formats money as whole Rwandan francs", () => {
    expect(formatMoney(45000)).toBe("RWF 45,000");
    expect(formatMoney(null)).toBe("—");
  });

  it("formats dates in Kinyarwanda even without browser support", async () => {
    await i18n.changeLanguage("rw");
    expect(formatDate("2026-07-01")).toBe("1 Nyakanga 2026");
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    expect(relativeTime(tenMinutesAgo)).toBe("hashize iminota 10");
  });

  it("switching language updates the visible text immediately", async () => {
    mockFetch({ "/api/auth/me/": new Response(JSON.stringify({ code: "not_authenticated" }), { status: 401 }) });
    renderWithApp(<LanguageSwitcher />);
    expect(screen.getByText("Language")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByRole("combobox"), "rw");
    await waitFor(() => expect(screen.getByText("Ururimi")).toBeInTheDocument());
    expect(document.documentElement.lang).toBe("rw");
    await userEvent.selectOptions(screen.getByRole("combobox"), "fr");
    await waitFor(() => expect(screen.getByText("Langue")).toBeInTheDocument());
    expect(localStorage.getItem("rc-language")).toBe("fr");
  });

  it("saves the language to the account when signed in", async () => {
    const { calls } = mockFetch({
      "/api/auth/me/": (init?: RequestInit) => ({ id: 1, email: "a@b.c", full_name: "A", role: "landlord", language: init?.method === "PATCH" ? "fr" : "en", text_size: "normal", unread_notifications: 0 }),
      "/api/auth/csrf/": {},
    });
    document.cookie = "csrftoken=test-token";
    renderWithApp(<LanguageSwitcher />);
    await waitFor(() => expect(calls.some((c) => c.url === "/api/auth/me/")).toBe(true));
    await userEvent.selectOptions(screen.getByRole("combobox"), "fr");
    await waitFor(() => expect(calls.some((c) => c.init?.method === "PATCH")).toBe(true));
    const patch = calls.find((c) => c.init?.method === "PATCH")!;
    expect(JSON.parse(String(patch.init!.body))).toEqual({ language: "fr" });
    expect((patch.init!.headers as Record<string, string>)["X-CSRFToken"]).toBe("test-token");
  });
});
