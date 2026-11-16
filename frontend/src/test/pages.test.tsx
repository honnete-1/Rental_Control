import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";

import i18n from "@/i18n";
import LandlordLayout from "@/layouts/LandlordLayout";
import OverviewPage from "@/pages/landlord/Overview";
import LoginPage from "@/pages/public/Login";
import ReportProblemPage from "@/pages/tenant/ReportProblem";
import { mockFetch, renderWithApp } from "./utils";

const landlord = { id: 1, email: "owner@example.com", full_name: "Jean Mugenzi", role: "landlord", language: "en", text_size: "normal", unread_notifications: 2, has_home: false, is_demo: false };
const tenant = { ...landlord, id: 2, email: "t@example.com", full_name: "Eric N", role: "tenant", unread_notifications: 0, has_home: true };
const unauthenticated = () => new Response(JSON.stringify({ code: "not_authenticated" }), { status: 401 });

beforeEach(async () => {
  await i18n.changeLanguage("en");
  document.cookie = "csrftoken=t";
});

describe("sign in", () => {
  it("shows friendly validation and keeps what the user typed", async () => {
    mockFetch({ "/api/auth/me/": unauthenticated, "/api/auth/login/": () => new Response(JSON.stringify({ code: "invalid_credentials", detail: "x" }), { status: 401 }) });
    renderWithApp(<LoginPage />, { route: "/login" });
    await userEvent.click(await screen.findByRole("button", { name: "Sign in" }));
    expect(await screen.findAllByText("Please fill in this field.")).toHaveLength(2);
    await userEvent.type(screen.getByLabelText("Email address"), "owner@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "wrong-password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("The email or password is not correct.")).toBeInTheDocument();
    expect(screen.getByLabelText("Email address")).toHaveValue("owner@example.com");
  });
});

describe("landlord dashboard", () => {
  it("shows real counts and the 'Needs Your Attention' list first", async () => {
    mockFetch({
      "/api/auth/me/": landlord,
      "/api/dashboard/landlord/": {
        properties: 2, units: 5, occupied_units: 3, vacant_units: 2, open_requests: 4, urgent_requests: 1, new_requests: 2,
        needs_attention: [{ type: "maintenance", id: 9, link: "/landlord/maintenance/9", reference: "RC-00009", category: "plumbing", priority: "urgent", status: "new", unit_name: "A1", property_name: "Kibagabaga Residence", created_at: new Date().toISOString() }],
        recent_repairs: [], maintenance_spending_this_month: 45000, finance: null, recent_activity: [],
      },
    });
    renderWithApp(<OverviewPage />);
    expect(await screen.findByRole("heading", { name: /Needs Your Attention/ })).toBeInTheDocument();
    expect(screen.getByText("Plumbing (water)")).toBeInTheDocument();
    expect(screen.getByText("Urgent")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Urgent problems\s*1/ })).toHaveAttribute("href", "/landlord/maintenance?open=true&priority=urgent");
    expect(screen.getByText("3 occupied, 2 empty")).toBeInTheDocument();
  });

  it("shows a helpful empty state for a new landlord", async () => {
    mockFetch({ "/api/auth/me/": landlord, "/api/dashboard/landlord/": { properties: 0, units: 0, occupied_units: 0, vacant_units: 0, open_requests: 0, urgent_requests: 0, new_requests: 0, needs_attention: [], recent_repairs: [], maintenance_spending_this_month: 0, finance: null, recent_activity: [] } });
    renderWithApp(<OverviewPage />);
    expect(await screen.findByText("You have no properties yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Add a Property/ })).toHaveAttribute("href", "/landlord/properties/new");
  });

  it("shows an error with a Try again button when loading fails", async () => {
    mockFetch({ "/api/auth/me/": landlord, "/api/dashboard/landlord/": () => new Response("{}", { status: 500 }) });
    renderWithApp(<OverviewPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

describe("responsive navigation", () => {
  it("has a labelled sidebar and a Menu button that opens the mobile menu", async () => {
    mockFetch({ "/api/auth/me/": landlord, "/api/dashboard/landlord/": { properties: 0, units: 0, occupied_units: 0, vacant_units: 0, open_requests: 0, urgent_requests: 0, new_requests: 0, needs_attention: [], recent_repairs: [], maintenance_spending_this_month: 0, finance: null, recent_activity: [] } });
    renderWithApp(<Routes><Route path="/landlord" element={<LandlordLayout />}><Route index element={<p>home</p>} /></Route></Routes>, { route: "/landlord" });
    const nav = await screen.findAllByRole("navigation", { name: "Main menu" });
    expect(nav[0]).toHaveTextContent("My Properties");
    expect(await screen.findByRole("link", { name: "Notifications: 2 unread" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Menu" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Maintenance");
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });
});

describe("tenant reports a problem", () => {
  it("is guided in 4 steps, validates, and sends the photo and details", async () => {
    let sent: FormData | null = null;
    mockFetch({
      "/api/auth/me/": tenant,
      "/api/auth/csrf/": {},
      "/api/my-home/": { tenancy: { id: 1 }, unit: { name: "A1" }, property: { name: "Kibagabaga Residence" } },
      "/api/maintenance/": (init?: RequestInit) => {
        sent = init?.body as FormData;
        return { id: 5, reference: "RC-00005" };
      },
    });
    renderWithApp(<ReportProblemPage />);
    expect(await screen.findByText("Step 1 of 4")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Next/ }));
    expect(screen.getByRole("alert")).toHaveTextContent("Please choose the kind of problem.");
    await userEvent.click(screen.getByLabelText("Plumbing (water)"));
    await userEvent.click(screen.getByRole("button", { name: /Next/ }));
    expect(screen.getByText("Step 2 of 4")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("What is wrong?"), "Water leaking under the sink");
    await userEvent.click(screen.getByLabelText(/This is urgent/));
    await userEvent.click(screen.getByRole("button", { name: /Next/ }));
    const photo = new File([new Uint8Array([137, 80, 78, 71])], "leak.png", { type: "image/png" });
    await userEvent.upload(screen.getByTestId("photo-input"), photo);
    expect(screen.getByRole("list", { name: "1 photo selected" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Next/ }));
    expect(screen.getByText("Step 4 of 4")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Send/ }));
    expect(await screen.findByText("Thank you! Your report RC-00005 was sent.")).toBeInTheDocument();
    await waitFor(() => expect(sent).not.toBeNull());
    expect(sent!.get("category")).toBe("plumbing");
    expect(sent!.get("priority")).toBe("urgent");
    expect(sent!.get("description")).toBe("Water leaking under the sink");
    expect((sent!.get("photos") as File).name).toBe("leak.png");
    expect(sent!.has("unit")).toBe(false); // the server links the tenant's own unit
  });

  it("works in Kinyarwanda", async () => {
    await i18n.changeLanguage("rw");
    mockFetch({ "/api/auth/me/": { ...tenant, language: "rw" }, "/api/my-home/": { tenancy: { id: 1 }, unit: { name: "A1" }, property: { name: "K" } } });
    renderWithApp(<ReportProblemPage />);
    expect(await screen.findByText("Intambwe ya 1 kuri 4")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ikibazo ni ikihe?" })).toBeInTheDocument();
    expect(screen.getByLabelText("Amazi n'amatiyo")).toBeInTheDocument();
  });
});
