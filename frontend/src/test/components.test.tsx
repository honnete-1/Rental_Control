import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import "@/i18n";
import { AccessibleDataTable } from "@/components/AccessibleDataTable";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { EmptyState } from "@/components/feedback";
import { GuidedFormStepper } from "@/components/GuidedFormStepper";
import { ConditionBadge, StatusBadge } from "@/components/StatusBadge";
import { Field, Input } from "@/components/ui/form";
import { Wrench } from "lucide-react";

describe("accessible components", () => {
  it("status badges show a word, not only a colour", () => {
    render(<><StatusBadge status="in_progress" /><ConditionBadge condition="damaged" /></>);
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("Damaged")).toBeInTheDocument();
  });

  it("form fields connect label, hint and error for screen readers", () => {
    render(<Field label="Unit name" hint="For example A1" error="Please fill in this field."><Input /></Field>);
    const input = screen.getByLabelText("Unit name");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("For example A1 Please fill in this field.");
    expect(screen.getByRole("alert")).toHaveTextContent("Please fill in this field.");
  });

  it("the stepper shows 'Step 2 of 3' and gives Back, Next and Cancel", async () => {
    const onBack = vi.fn();
    const onNext = vi.fn();
    const onCancel = vi.fn();
    render(<GuidedFormStepper steps={["One", "Two", "Three"]} current={1} onBack={onBack} onNext={onNext} onCancel={onCancel}><p>content</p></GuidedFormStepper>);
    expect(screen.getByText("Step 2 of 3")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Two" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Back/ }));
    await userEvent.click(screen.getByRole("button", { name: /Next/ }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onBack).toHaveBeenCalled();
    expect(onNext).toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });

  it("confirmation dialog puts the safe choice first and needs an explicit yes", async () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(<ConfirmationDialog open onOpenChange={onOpenChange} title="Delete this expense?" message="It cannot be undone." confirmLabel="Delete" onConfirm={onConfirm} />);
    expect(screen.getByRole("dialog", { name: "Delete this expense?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "No, go back" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it("data table has a caption and column headers", () => {
    render(<AccessibleDataTable caption="Expenses" rowKey={(r) => r.id} rows={[{ id: 1, name: "Water bill" }]} columns={[{ key: "n", header: "What", cell: (r) => r.name }]} />);
    const table = screen.getByRole("table", { name: "Expenses" });
    expect(table).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "What" })).toBeInTheDocument();
  });

  it("empty state explains what to do next", () => {
    render(<MemoryRouter><EmptyState icon={Wrench} title="No repair requests" text="When a tenant reports a problem, it will appear here." /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "No repair requests" })).toBeInTheDocument();
    expect(screen.getByText(/When a tenant reports/)).toBeInTheDocument();
  });
});
