import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";

import { useAuth } from "@/auth/AuthContext";
import { Banner, LoadingSkeleton } from "@/components/feedback";
import { GuidedFormStepper } from "@/components/GuidedFormStepper";
import { InspectionChecklist } from "@/components/InspectionChecklist";
import { PageHeader } from "@/components/PageHeader";
import { PhotoUploader } from "@/components/PhotoUploader";
import { ConditionBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { api, del, get, patch, post, toFormData } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { todayISO } from "@/lib/format";
import { useUnits } from "@/lib/queries";
import type { Inspection, InspectionItem } from "@/lib/types";
import { cn } from "@/lib/utils";

const ROOM_PRESETS = [
  { key: "livingRoom", water: false },
  { key: "kitchen", water: true },
  { key: "bedroom1", water: false },
  { key: "bedroom2", water: false },
  { key: "bathroom", water: true },
  { key: "toilet", water: true },
  { key: "corridor", water: false },
  { key: "outside", water: false },
];
const TYPES = ["move_in", "periodic", "move_out"] as const;

export default function InspectionNewPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const draftId = params.get("draft");
  const units = useUnits(params.get("property") ?? undefined);

  const [step, setStep] = useState(0);
  const [roomIndex, setRoomIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [basics, setBasics] = useState({ unit: params.get("unit") ?? "", inspection_type: "periodic", inspection_date: todayISO(), inspector_name: user?.full_name ?? "" });
  const [rooms, setRooms] = useState<{ name: string; has_water: boolean; selected: boolean }[]>(() =>
    ROOM_PRESETS.map((r, i) => ({ name: t(`inspections:rooms.${r.key}`), has_water: r.water, selected: i < 3 || r.key === "bathroom" })),
  );
  const [customRoom, setCustomRoom] = useState({ name: "", has_water: false });
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [items, setItems] = useState<InspectionItem[]>([]);
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoArea, setPhotoArea] = useState("");
  const [summary, setSummary] = useState("");
  const [share, setShare] = useState(true);

  // Resume a saved draft.
  const draft = useQuery({ queryKey: ["inspection", draftId], queryFn: () => get<Inspection>(`/api/inspections/${draftId}/`), enabled: !!draftId });
  useEffect(() => {
    if (draft.data && !inspection) {
      setInspection(draft.data);
      setItems(draft.data.items ?? []);
      setSummary(draft.data.summary);
      setShare(draft.data.shared_with_tenant);
      setStep(2);
    }
  }, [draft.data, inspection]);

  const areas = useMemo(() => Array.from(new Set(items.map((i) => i.area))), [items]);
  const steps = [t("inspections:wizard.step1"), t("inspections:wizard.step2"), t("inspections:wizard.step3"), t("inspections:wizard.step4"), t("inspections:wizard.step5")];

  const saveItems = async () => {
    if (!inspection) return;
    const updated = await patch<Inspection>(`/api/inspections/${inspection.id}/`, { items: items.map(({ id, condition, notes }) => ({ id, condition, notes })), summary, shared_with_tenant: share });
    setInspection(updated);
  };

  const next = async () => {
    setError(null);
    setBusy(true);
    try {
      if (step === 0) {
        if (!basics.unit) throw new Error(t("inspections:wizard.chooseUnit"));
        setStep(1);
      } else if (step === 1) {
        const chosen = rooms.filter((r) => r.selected).map(({ name, has_water }) => ({ name, has_water }));
        if (!chosen.length) throw new Error(t("inspections:wizard.chooseRoom"));
        const created = await post<Inspection>("/api/inspections/", { ...basics, unit: Number(basics.unit), rooms: chosen, shared_with_tenant: true });
        setInspection(created);
        setItems(created.items ?? []);
        setRoomIndex(0);
        setStep(2);
        qc.invalidateQueries({ queryKey: ["inspections"] });
      } else if (step === 2) {
        await saveItems();
        if (roomIndex < areas.length - 1) {
          setRoomIndex(roomIndex + 1);
          window.scrollTo(0, 0);
        } else setStep(3);
      } else if (step === 3) {
        for (const file of photos) {
          await api(`/api/inspections/${inspection!.id}/photos/`, { method: "POST", body: toFormData({ image: file, area: photoArea }) });
        }
        if (photos.length) {
          setPhotos([]);
          setInspection(await get<Inspection>(`/api/inspections/${inspection!.id}/`));
        }
        setStep(4);
      } else {
        await saveItems();
        await post(`/api/inspections/${inspection!.id}/complete/`);
        qc.invalidateQueries({ queryKey: ["inspections"] });
        qc.invalidateQueries({ queryKey: ["passport"] });
        qc.invalidateQueries({ queryKey: ["units"] });
        toast.show(t("inspections:wizard.completed"));
        navigate(`/landlord/inspections/${inspection!.id}`);
      }
    } catch (e) {
      setError(e instanceof Error && !("status" in e) ? e.message : errorMessage(t, e));
    } finally {
      setBusy(false);
    }
  };

  const back = async () => {
    if (step === 2 && roomIndex > 0) {
      await saveItems().catch(() => undefined);
      return setRoomIndex(roomIndex - 1);
    }
    if (step === 2 && inspection) return; // rooms are already created; stay
    setStep(step - 1);
  };

  const saveAndExit = async () => {
    if (inspection) {
      await saveItems().catch(() => undefined);
      toast.show(t("inspections:wizard.draftSaved"));
      navigate(`/landlord/inspections/${inspection.id}`);
    } else navigate("/landlord/inspections");
  };

  if (draftId && draft.isPending) return <LoadingSkeleton />;
  const currentArea = areas[roomIndex];
  const roomItems = items.filter((i) => i.area === currentArea);
  const counts = items.reduce((acc, i) => ({ ...acc, [i.condition]: (acc[i.condition] ?? 0) + 1 }), {} as Record<string, number>);

  return (
    <>
      <PageHeader title={t("inspections:newInspection")} crumbs={[{ label: t("common:nav.overview"), to: "/landlord" }, { label: t("common:nav.inspections"), to: "/landlord/inspections" }, { label: t("inspections:newInspection") }]} />
      <Card className="p-6">
        <GuidedFormStepper steps={steps} current={step} onBack={step === 2 && roomIndex === 0 ? undefined : back} onNext={next} onCancel={saveAndExit} nextLoading={busy}
          title={step === 2 && currentArea ? t("inspections:wizard.roomTitle", { room: currentArea, current: roomIndex + 1, total: areas.length }) : undefined}
          nextLabel={step === 4 ? t("inspections:wizard.finish") : step === 1 ? t("inspections:wizard.startChecklist") : undefined}>
          {error && <Banner tone="danger">{error}</Banner>}
          {inspection && step >= 2 && <p className="text-sm text-muted">{t("inspections:wizard.autosave")}</p>}

          {step === 0 && (
            <>
              <Field label={t("properties:tenants.unit")}>
                <Select value={basics.unit} onChange={(e) => setBasics({ ...basics, unit: e.target.value })}>
                  <option value="">{t("common:form.choose")}</option>
                  {units.data?.results.map((u) => <option key={u.id} value={u.id}>{u.property_name} — {u.name}</option>)}
                </Select>
              </Field>
              <fieldset>
                <legend className="mb-2 font-semibold">{t("inspections:wizard.typeLabel")}</legend>
                <div className="grid gap-3 sm:grid-cols-3">
                  {TYPES.map((ty) => (
                    <label key={ty} className={cn("flex min-h-12 cursor-pointer flex-col gap-1 rounded-xl border-2 p-3", basics.inspection_type === ty ? "border-teal-600 bg-teal-50 dark:bg-navy-700" : "border-line")}>
                      <span className="flex items-center gap-2 font-semibold"><input type="radio" name="itype" className="size-5 accent-teal-600" checked={basics.inspection_type === ty} onChange={() => setBasics({ ...basics, inspection_type: ty })} />{t(`inspections:types.${ty}`)}</span>
                      <span className="text-sm text-muted">{t(`inspections:typeHelp.${ty}`)}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("inspections:wizard.date")}><Input type="date" value={basics.inspection_date} onChange={(e) => setBasics({ ...basics, inspection_date: e.target.value })} /></Field>
                <Field label={t("inspections:wizard.inspector")}><Input value={basics.inspector_name} onChange={(e) => setBasics({ ...basics, inspector_name: e.target.value })} /></Field>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <p>{t("inspections:wizard.roomsHelp")}</p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {rooms.map((r, i) => (
                  <li key={`${r.name}-${i}`} className="rounded-xl border-2 border-line p-3">
                    <Checkbox label={r.name} hint={r.has_water ? t("inspections:wizard.hasWater") : undefined} checked={r.selected} onChange={(e) => setRooms(rooms.map((x, j) => (j === i ? { ...x, selected: e.target.checked } : x)))} />
                  </li>
                ))}
              </ul>
              <div className="rounded-xl bg-canvas p-4">
                <p className="mb-2 font-semibold">{t("inspections:wizard.addRoom")}</p>
                <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                  <Field label={t("inspections:wizard.roomName")}><Input value={customRoom.name} onChange={(e) => setCustomRoom({ ...customRoom, name: e.target.value })} /></Field>
                  <Checkbox label={t("inspections:wizard.hasWaterShort")} checked={customRoom.has_water} onChange={(e) => setCustomRoom({ ...customRoom, has_water: e.target.checked })} />
                  <Button variant="secondary" disabled={!customRoom.name.trim()} onClick={() => { setRooms([...rooms, { name: customRoom.name.trim(), has_water: customRoom.has_water, selected: true }]); setCustomRoom({ name: "", has_water: false }); }}><Plus aria-hidden="true" />{t("common:actions.add")}</Button>
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <p className="text-muted">{t("inspections:wizard.conditionHelp")}</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => setItems(items.map((i) => (i.area === currentArea ? { ...i, condition: "good" } : i)))}>{t("inspections:wizard.allGood")}</Button>
              </div>
              <InspectionChecklist items={roomItems} onChange={(id, p) => setItems(items.map((i) => (i.id === id ? { ...i, ...p } : i)))} />
            </>
          )}

          {step === 3 && inspection && (
            <>
              <p>{t("inspections:wizard.photosHelp")}</p>
              <Field label={t("inspections:compare.room")}>
                <Select value={photoArea} onChange={(e) => setPhotoArea(e.target.value)}>
                  <option value="">{t("inspections:wizard.generalPhoto")}</option>
                  {areas.map((a) => <option key={a} value={a}>{a}</option>)}
                </Select>
              </Field>
              <PhotoUploader files={photos} onChange={setPhotos} max={10} onError={(m) => setError(m)} />
              {!!inspection.photos?.length && (
                <div>
                  <p className="mb-2 font-semibold">{t("inspections:wizard.savedPhotos", { count: inspection.photos.length })}</p>
                  <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {inspection.photos.map((p) => (
                      <li key={p.id} className="overflow-hidden rounded-lg border border-line">
                        <img src={p.image} alt={p.area || t("properties:passport.photo")} className="aspect-square w-full object-cover" />
                        <button type="button" className="flex min-h-11 w-full items-center justify-center gap-1 text-sm font-semibold text-danger-700" onClick={async () => { await del(`/api/inspections/${inspection.id}/photos/${p.id}/`); setInspection(await get<Inspection>(`/api/inspections/${inspection.id}/`)); }}>
                          <Trash2 className="size-4" aria-hidden="true" />{t("common:actions.remove")}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-sm text-muted">{t("inspections:wizard.photosOptional")}</p>
            </>
          )}

          {step === 4 && inspection && (
            <>
              <div className="flex flex-wrap gap-2">
                {(["good", "needs_attention", "damaged", "not_checked"] as const).map((c) => (
                  <span key={c} className="inline-flex items-center gap-2"><ConditionBadge condition={c} /><span className="font-bold">{counts[c] ?? 0}</span></span>
                ))}
              </div>
              <ul className="space-y-2">
                {items.filter((i) => i.condition === "damaged" || i.condition === "needs_attention").map((i) => (
                  <li key={i.id} className="rounded-xl bg-canvas p-3"><span className="font-semibold">{i.area} — {t(`inspections:elements.${i.element}`)}:</span> {t(`inspections:conditions.${i.condition}`)}{i.notes && ` — ${i.notes}`}</li>
                ))}
              </ul>
              <Field label={t("inspections:wizard.summary")} optional hint={t("inspections:wizard.summaryHint")}><Textarea value={summary} onChange={(e) => setSummary(e.target.value)} /></Field>
              <Checkbox label={t("inspections:wizard.share")} hint={t("inspections:wizard.shareHint")} checked={share} onChange={(e) => setShare(e.target.checked)} />
              <Banner tone="warning">{t("inspections:wizard.lockWarning")}</Banner>
            </>
          )}
        </GuidedFormStepper>
      </Card>
    </>
  );
}
