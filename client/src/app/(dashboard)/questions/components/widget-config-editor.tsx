"use client";

import { arrayMove } from "@dnd-kit/sortable";
import { Code, Dices, Plus, Trash2 } from "lucide-react";
import React, { useEffect,useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePreviewWidgetInstanceMutation } from "@/features/assessments/questionsApi";
import { AngleProtractorWidget } from "@/features/clio/widgets/AngleProtractorWidget";
import { CoordinatePlotterWidget } from "@/features/clio/widgets/CoordinatePlotterWidget";
import { ShapeShadingWidget } from "@/features/clio/widgets/ShapeShadingWidget";

import { DragHandle, SortableListContext, SortableRow } from "./sortable-list";

// Shared "Generate Preview" control for parameterized widgets — hits the
// stateless preview endpoint so authors can sanity-check a sample instance
// before saving, using the exact same generator that resolves real attempts.
function GeneratePreviewButton({ widgetType, config }: { widgetType: string; config: any }) {
  const [previewWidgetInstance, { isLoading }] = usePreviewWidgetInstanceMutation();
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePreview = async () => {
    setError(null);
    try {
      const res = await previewWidgetInstance({ widgetType, widgetConfig: config }).unwrap();
      setResult(res);
    } catch (err: any) {
      setResult(null);
      setError(err?.data?.message || "Could not generate a preview from this config.");
    }
  };

  return (
    <div className="space-y-2 rounded-2xl border border-dashed border-border p-4">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold text-muted-foreground">Sample Generated Instance</Label>
        <Button
          type="button"
          onClick={handlePreview}
          disabled={isLoading}
          className="h-8 rounded-lg bg-primary px-3 text-[11px] font-bold text-primary-foreground hover:bg-primary/90"
        >
          <Dices className="mr-1 h-3.5 w-3.5" /> {isLoading ? "Generating..." : "Generate Preview"}
        </Button>
      </div>
      {error && <p className="text-[10px] font-semibold text-destructive">{error}</p>}
      {result && (
        <div className="rounded-xl bg-muted/50 p-3 text-xs">
          {result.displayConfig?.prompt && (
            <p className="mb-2 font-semibold text-foreground">{result.displayConfig.prompt}</p>
          )}
          {result.options && (
            <ul className="space-y-1">
              {result.options.map((o: any) => (
                <li key={o.id} className={o.isCorrect ? "font-bold text-success" : "text-muted-foreground"}>
                  {o.optionLabel}. {o.optionText} {o.isCorrect ? "(correct)" : ""}
                </li>
              ))}
            </ul>
          )}
          {!result.options && result.resolvedAnswer?.correctValue !== undefined && (
            <p className="text-muted-foreground">
              Range {result.displayConfig?.min}–{result.displayConfig?.max}
              {result.displayConfig?.unit}, target ={" "}
              <span className="font-bold text-success">
                {result.resolvedAnswer.correctValue}
                {result.displayConfig?.unit}
              </span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

interface WidgetConfigEditorProps {
  widgetType: string;
  value: any;
  onChange: (newValue: any) => void;
}

export function WidgetConfigEditor({ widgetType, value, onChange }: WidgetConfigEditorProps) {
  const [activeTab, setActiveTab] = useState<string>("form");
  const [rawJsonText, setRawJsonText] = useState<string>("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Sync value changes to raw JSON input
  useEffect(() => {
    if (value) {
      setRawJsonText(JSON.stringify(value, null, 2));
      setJsonError(null);
    } else {
      setRawJsonText("{}");
    }
  }, [value]);

  const handleJsonChange = (text: string) => {
    setRawJsonText(text);
    try {
      const parsed = JSON.parse(text);
      setJsonError(null);
      onChange(parsed);
    } catch (err: any) {
      setJsonError(err.message || "Invalid JSON syntax");
    }
  };

  const updateField = (key: string, val: any) => {
    const updated = { ...value, [key]: val };
    onChange(updated);
  };

  // Render different sub-forms based on widgetType
  const renderFormEditor = () => {
    switch (widgetType) {
      case "SLIDER_MANIPULATIVE": {
        const isParameterized = value?.configVersion === 2 && value?.mode === "parameterized";

        const setMode = (mode: "fixed" | "parameterized") => {
          if (mode === "fixed") {
            // configVersion: 2 routes this to widget-generator.ts's v2 fixed
            // branch, which grades against this correctValue directly.
            // Without it, the config falls through to the legacy v1 path,
            // which grades against a separate `correctAnswer` field this
            // editor never sets — an unwinnable question that looks fine
            // here (see question-editor-form.tsx's initial default, fixed
            // the same way).
            onChange({ configVersion: 2, mode: "fixed", min: 0, max: 100, step: 1, unit: "", correctValue: 50 });
          } else {
            onChange({
              configVersion: 2,
              mode: "parameterized",
              params: {
                given: { min: 0, max: 100, step: 1, unit: "" },
                hidden: { correctValue: { min: 10, max: 90 } },
              },
              tolerance: 5,
            });
          }
        };

        const modeToggle = (
          <div className="flex gap-2 border-b border-border pb-3">
            <button
              type="button"
              onClick={() => setMode("fixed")}
              className={`h-8 flex-1 rounded-lg text-xs font-bold transition-colors ${
                !isParameterized ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              Fixed Value
            </button>
            <button
              type="button"
              onClick={() => setMode("parameterized")}
              className={`h-8 flex-1 rounded-lg text-xs font-bold transition-colors ${
                isParameterized ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              Parameterized
            </button>
          </div>
        );

        if (isParameterized) {
          const given = value?.params?.given ?? { min: 0, max: 100, step: 1, unit: "" };
          const hiddenRange = value?.params?.hidden?.correctValue ?? { min: 10, max: 90 };
          const tolerance = value?.tolerance ?? 5;

          const updateParam = (path: "given" | "hidden", key: string, val: any) => {
            const params = { ...(value?.params ?? {}) };
            if (path === "given") {
              params.given = { ...given, [key]: val };
            } else {
              params.hidden = { correctValue: { ...hiddenRange, [key]: val } };
            }
            onChange({ ...value, params });
          };

          return (
            <div className="space-y-4">
              {modeToggle}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground">Slider Min</Label>
                  <Input type="number" value={given.min} onChange={(e) => updateParam("given", "min", Number(e.target.value))} className="h-10 rounded-xl text-xs" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground">Slider Max</Label>
                  <Input type="number" value={given.max} onChange={(e) => updateParam("given", "max", Number(e.target.value))} className="h-10 rounded-xl text-xs" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground">Step Interval</Label>
                  <Input type="number" value={given.step} onChange={(e) => updateParam("given", "step", Number(e.target.value))} className="h-10 rounded-xl text-xs" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground">Unit</Label>
                  <Input type="text" value={given.unit} onChange={(e) => updateParam("given", "unit", e.target.value)} className="h-10 rounded-xl text-xs" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground">Target Range Min</Label>
                  <Input type="number" value={hiddenRange.min} onChange={(e) => updateParam("hidden", "min", Number(e.target.value))} className="h-10 rounded-xl text-xs" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground">Target Range Max</Label>
                  <Input type="number" value={hiddenRange.max} onChange={(e) => updateParam("hidden", "max", Number(e.target.value))} className="h-10 rounded-xl text-xs" />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground">Tolerance (± around target)</Label>
                  <Input
                    type="number"
                    value={tolerance}
                    onChange={(e) => onChange({ ...value, tolerance: Number(e.target.value) })}
                    className="h-10 rounded-xl text-xs"
                  />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Each attempt randomizes a new target within the range above, so different students (and retries) see a different number to find.
              </p>
              <GeneratePreviewButton widgetType="SLIDER_MANIPULATIVE" config={value} />
            </div>
          );
        }

        const min = value?.min ?? 0;
        const max = value?.max ?? 100;
        const step = value?.step ?? 1;
        const unit = value?.unit ?? "";
        const correctValue = value?.correctValue ?? min;

        return (
          <div className="space-y-4">
            {modeToggle}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground">Min Value</Label>
                <Input
                  type="number"
                  value={min}
                  onChange={(e) => updateField("min", Number(e.target.value))}
                  className="h-10 rounded-xl text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground">Max Value</Label>
                <Input
                  type="number"
                  value={max}
                  onChange={(e) => updateField("max", Number(e.target.value))}
                  className="h-10 rounded-xl text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground">Step Interval</Label>
                <Input
                  type="number"
                  value={step}
                  onChange={(e) => updateField("step", Number(e.target.value))}
                  className="h-10 rounded-xl text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground">Unit (e.g. %, cm)</Label>
                <Input
                  type="text"
                  placeholder="unit label..."
                  value={unit}
                  onChange={(e) => updateField("unit", e.target.value)}
                  className="h-10 rounded-xl text-xs"
                />
              </div>
              <div className="col-span-2 space-y-1.5 border-t border-border pt-3">
                <Label className="text-xs font-semibold text-muted-foreground">Target Value (correctAnswer)</Label>
                <Input
                  type="number"
                  value={correctValue}
                  onChange={(e) => updateField("correctValue", Number(e.target.value))}
                  className="h-10 rounded-xl text-xs"
                />
              </div>
            </div>
          </div>
        );
      }

      case "STANDARD_MCQ": {
        const params = value?.params ?? { given: {}, secret: {}, derived: {} };
        const givenList: { name: string; min: number; max: number }[] = Object.entries(params.given ?? {}).map(
          ([name, r]: [string, any]) => ({ name, min: r.min, max: r.max }),
        );
        const secretList: { name: string; min: number; max: number }[] = Object.entries(params.secret ?? {}).map(
          ([name, r]: [string, any]) => ({ name, min: r.min, max: r.max }),
        );
        const derivedList: { name: string; expr: string }[] = Object.entries(params.derived ?? {}).map(
          ([name, expr]: [string, any]) => ({ name, expr }),
        );
        const template: string = value?.display?.template ?? "";
        const answerCorrect: string = value?.answerKey?.correct ?? "";
        const distractors: { expr: string }[] = value?.distractors ?? [];

        const rebuild = (overrides: Partial<{ given: any[]; secret: any[]; derived: any[] }>) => {
          const nextGiven = overrides.given ?? givenList;
          const nextSecret = overrides.secret ?? secretList;
          const nextDerived = overrides.derived ?? derivedList;
          const given = Object.fromEntries(nextGiven.filter((g) => g.name).map((g) => [g.name, { min: g.min, max: g.max }]));
          const secret = Object.fromEntries(nextSecret.filter((s) => s.name).map((s) => [s.name, { min: s.min, max: s.max }]));
          const derived = Object.fromEntries(nextDerived.filter((d) => d.name).map((d) => [d.name, d.expr]));
          onChange({
            configVersion: 2,
            mode: "parameterized",
            params: { given, secret, derived },
            display: { template },
            answerKey: { correct: answerCorrect },
            distractors,
          });
        };

        const updateVar = (
          list: "given" | "secret",
          idx: number,
          field: "name" | "min" | "max",
          val: string | number,
        ) => {
          const source = list === "given" ? [...givenList] : [...secretList];
          source[idx] = { ...source[idx], [field]: val };
          rebuild(list === "given" ? { given: source } : { secret: source });
        };

        const addVar = (list: "given" | "secret") => {
          const source = list === "given" ? [...givenList, { name: "", min: 1, max: 10 }] : [...secretList, { name: "", min: 1, max: 10 }];
          rebuild(list === "given" ? { given: source } : { secret: source });
        };

        const removeVar = (list: "given" | "secret", idx: number) => {
          const source = (list === "given" ? givenList : secretList).filter((_, i) => i !== idx);
          rebuild(list === "given" ? { given: source } : { secret: source });
        };

        const updateDerived = (idx: number, field: "name" | "expr", val: string) => {
          const next = [...derivedList];
          next[idx] = { ...next[idx], [field]: val };
          rebuild({ derived: next });
        };

        const addDerived = () => rebuild({ derived: [...derivedList, { name: "", expr: "" }] });
        const removeDerived = (idx: number) => rebuild({ derived: derivedList.filter((_, i) => i !== idx) });

        const updateTopLevel = (patch: Record<string, any>) => onChange({ ...value, ...patch });

        const updateDistractor = (idx: number, expr: string) => {
          const next = [...distractors];
          next[idx] = { expr };
          updateTopLevel({ distractors: next });
        };
        const addDistractor = () => updateTopLevel({ distractors: [...distractors, { expr: "" }] });
        const removeDistractor = (idx: number) => updateTopLevel({ distractors: distractors.filter((_, i) => i !== idx) });

        const varNames = [...givenList.map((g) => g.name), ...secretList.map((s) => s.name), ...derivedList.map((d) => d.name)].filter(Boolean);

        return (
          <div className="space-y-4">
            <p className="text-[10px] text-muted-foreground">
              A parameterized MCQ generates fresh numbers and answer options every attempt, so no fixed Answer Options are needed below.
            </p>

            {/* Given variables */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-muted-foreground">Given Variables (shown to student)</Label>
                <button type="button" onClick={() => addVar("given")} className="flex items-center gap-1 text-[11px] font-bold text-primary">
                  <Plus className="h-3 w-3" /> Add
                </button>
              </div>
              {givenList.map((g, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <Input placeholder="name (e.g. a)" value={g.name} onChange={(e) => updateVar("given", idx, "name", e.target.value)} className="h-9 w-28 rounded-xl text-xs" />
                  <Input type="number" placeholder="min" value={g.min} onChange={(e) => updateVar("given", idx, "min", Number(e.target.value))} className="h-9 rounded-xl text-xs" />
                  <Input type="number" placeholder="max" value={g.max} onChange={(e) => updateVar("given", idx, "max", Number(e.target.value))} className="h-9 rounded-xl text-xs" />
                  <button type="button" onClick={() => removeVar("given", idx)} className="rounded-xl border border-border bg-card p-2 text-muted-foreground hover:bg-muted hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Secret variables */}
            <div className="space-y-2 border-t border-border pt-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-muted-foreground">Secret Variables (the answer, never shown)</Label>
                <button type="button" onClick={() => addVar("secret")} className="flex items-center gap-1 text-[11px] font-bold text-primary">
                  <Plus className="h-3 w-3" /> Add
                </button>
              </div>
              {secretList.map((s, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <Input placeholder="name (e.g. x)" value={s.name} onChange={(e) => updateVar("secret", idx, "name", e.target.value)} className="h-9 w-28 rounded-xl text-xs" />
                  <Input type="number" placeholder="min" value={s.min} onChange={(e) => updateVar("secret", idx, "min", Number(e.target.value))} className="h-9 rounded-xl text-xs" />
                  <Input type="number" placeholder="max" value={s.max} onChange={(e) => updateVar("secret", idx, "max", Number(e.target.value))} className="h-9 rounded-xl text-xs" />
                  <button type="button" onClick={() => removeVar("secret", idx)} className="rounded-xl border border-border bg-card p-2 text-muted-foreground hover:bg-muted hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Derived variables */}
            <div className="space-y-2 border-t border-border pt-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-muted-foreground">Derived Values (formula, shown to student)</Label>
                <button type="button" onClick={addDerived} className="flex items-center gap-1 text-[11px] font-bold text-primary">
                  <Plus className="h-3 w-3" /> Add
                </button>
              </div>
              {derivedList.map((d, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <Input placeholder="name (e.g. c)" value={d.name} onChange={(e) => updateDerived(idx, "name", e.target.value)} className="h-9 w-28 rounded-xl text-xs" />
                  <Input placeholder="formula (e.g. a * x + b)" value={d.expr} onChange={(e) => updateDerived(idx, "expr", e.target.value)} className="h-9 flex-1 rounded-xl text-xs" />
                  <button type="button" onClick={() => removeDerived(idx)} className="rounded-xl border border-border bg-card p-2 text-muted-foreground hover:bg-muted hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Template + answer key */}
            <div className="space-y-2 border-t border-border pt-3">
              <Label className="text-xs font-semibold text-muted-foreground">
                Prompt Template (use {"{name}"} for given/derived values, never a secret variable)
              </Label>
              <Input
                placeholder="e.g. Solve: {a}x + {b} = {c}. What is x?"
                value={template}
                onChange={(e) => updateTopLevel({ display: { template: e.target.value } })}
                className="h-9 rounded-xl text-xs"
              />
              <Label className="text-xs font-semibold text-muted-foreground">Correct Answer Variable</Label>
              <Select value={answerCorrect} onValueChange={(val) => updateTopLevel({ answerKey: { correct: val } })}>
                <SelectTrigger className="h-9 rounded-xl text-xs bg-muted/50">
                  <SelectValue placeholder="Select variable..." />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {varNames.map((n) => (
                    <SelectItem key={n} value={n}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Distractors */}
            <div className="space-y-2 border-t border-border pt-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-muted-foreground">Distractor Formulas (wrong options)</Label>
                <button type="button" onClick={addDistractor} className="flex items-center gap-1 text-[11px] font-bold text-primary">
                  <Plus className="h-3 w-3" /> Add
                </button>
              </div>
              {distractors.map((d, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <Input placeholder="e.g. x + 1" value={d.expr} onChange={(e) => updateDistractor(idx, e.target.value)} className="h-9 flex-1 rounded-xl text-xs" />
                  <button type="button" onClick={() => removeDistractor(idx)} className="rounded-xl border border-border bg-card p-2 text-muted-foreground hover:bg-muted hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <GeneratePreviewButton widgetType="STANDARD_MCQ" config={value} />
          </div>
        );
      }

      case "DRAG_AND_DROP_LABELS": {
        const labels: string[] = value?.labels ?? [];
        const targets: any[] = value?.targets ?? [];

        const handleAddLabel = () => {
          updateField("labels", [...labels, ""]);
        };

        const handleUpdateLabel = (idx: number, text: string) => {
          const newLabels = [...labels];
          newLabels[idx] = text;
          updateField("labels", newLabels);
        };

        const handleRemoveLabel = (idx: number) => {
          const newLabels = labels.filter((_, i) => i !== idx);
          updateField("labels", newLabels);
        };

        const handleReorderLabels = (fromIndex: number, toIndex: number) => {
          updateField("labels", arrayMove(labels, fromIndex, toIndex));
        };

        const handleAddTarget = () => {
          updateField("targets", [
            ...targets,
            { id: `target-${Date.now()}`, placeholder: "", correctLabel: "" },
          ]);
        };

        const handleUpdateTarget = (idx: number, field: string, val: string) => {
          const newTargets = targets.map((t, i) => (i === idx ? { ...t, [field]: val } : t));
          updateField("targets", newTargets);
        };

        const handleRemoveTarget = (idx: number) => {
          const newTargets = targets.filter((_, i) => i !== idx);
          updateField("targets", newTargets);
        };

        const handleReorderTargets = (fromIndex: number, toIndex: number) => {
          updateField("targets", arrayMove(targets, fromIndex, toIndex));
        };

        return (
          <div className="space-y-4">
            {/* Labels Bank */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-muted-foreground">Labels Pool (Draggables)</Label>
                <button
                  type="button"
                  onClick={handleAddLabel}
                  className="flex items-center gap-1 text-[11px] font-bold text-primary"
                >
                  <Plus className="h-3 w-3" /> Add Label
                </button>
              </div>
              <SortableListContext
                ids={labels.map((_, idx) => `label-${idx}`)}
                onReorder={handleReorderLabels}
                layout="wrap"
              >
                <div className="flex flex-wrap gap-2">
                  {labels.map((lbl, idx) => (
                    <SortableRow
                      key={idx}
                      id={`label-${idx}`}
                      className="flex items-center gap-1 rounded-xl border border-border bg-card p-1 pl-1"
                    >
                      {(handle) => (
                        <>
                          <DragHandle
                            {...handle}
                            className="flex h-7 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
                          />
                          <input
                            type="text"
                            value={lbl}
                            placeholder={`Label ${idx + 1}...`}
                            onChange={(e) => handleUpdateLabel(idx, e.target.value)}
                            className="border-none bg-transparent font-sans text-xs font-semibold text-foreground focus:outline-none w-20"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveLabel(idx)}
                            className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </SortableRow>
                  ))}
                </div>
              </SortableListContext>
            </div>

            {/* Target Slots */}
            <div className="space-y-2 border-t border-border pt-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-muted-foreground">Drop Targets (Slots)</Label>
                <button
                  type="button"
                  onClick={handleAddTarget}
                  className="flex items-center gap-1 text-[11px] font-bold text-primary"
                >
                  <Plus className="h-3 w-3" /> Add Slot
                </button>
              </div>
              <SortableListContext
                ids={targets.map((t, idx) => t.id ?? `target-idx-${idx}`)}
                onReorder={handleReorderTargets}
              >
                <div className="space-y-2">
                  {targets.map((t, idx) => (
                    <SortableRow
                      key={idx}
                      id={t.id ?? `target-idx-${idx}`}
                      className="flex gap-2 items-center"
                    >
                      {(handle) => (
                        <>
                          <DragHandle
                            {...handle}
                            className="flex h-9 w-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
                          />
                          <Input
                            type="text"
                            placeholder="Placeholder text (e.g. 'Solve 3 + ___')"
                            value={t.placeholder ?? ""}
                            onChange={(e) => handleUpdateTarget(idx, "placeholder", e.target.value)}
                            className="h-9 rounded-xl text-xs flex-1"
                          />
                          <Select
                            value={t.correctLabel || ""}
                            onValueChange={(val) => handleUpdateTarget(idx, "correctLabel", val)}
                          >
                            <SelectTrigger className="h-9 w-40 rounded-xl text-xs border-border bg-muted/50">
                              <SelectValue placeholder="Correct label..." />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl">
                              {labels.filter(Boolean).map((lbl, lIdx) => (
                                <SelectItem key={lIdx} value={lbl}>
                                  {lbl}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <button
                            type="button"
                            onClick={() => handleRemoveTarget(idx)}
                            className="rounded-xl border border-border bg-card p-2 text-muted-foreground hover:bg-muted hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </SortableRow>
                  ))}
                </div>
              </SortableListContext>
              {targets.length > 0 && !targets.some((t) => t.correctLabel) && (
                <p className="text-[10px] font-semibold text-destructive">
                  No slot has a correct label set — this question cannot be graded. Pick a
                  correct label for at least one slot, or delete slots that are purely
                  decorative.
                </p>
              )}
            </div>
          </div>
        );
      }

      case "COORDINATE_PLOTTER": {
        const xMin = value?.xRange?.[0] ?? -10;
        const xMax = value?.xRange?.[1] ?? 10;
        const yMin = value?.yRange?.[0] ?? -10;
        const yMax = value?.yRange?.[1] ?? 10;
        const gridStep = value?.gridStep ?? 1;
        const tolerance = value?.tolerance ?? 0.1;
        const correctPoints: { x: number; y: number }[] = value?.correctPoints ?? [];

        const handlePointsChange = (newValue: { points: { x: number; y: number }[] }) => {
          updateField("correctPoints", newValue.points);
        };

        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground">X-Range Min</Label>
                <Input
                  type="number"
                  value={xMin}
                  onChange={(e) => updateField("xRange", [Number(e.target.value), xMax])}
                  className="h-10 rounded-xl text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground">X-Range Max</Label>
                <Input
                  type="number"
                  value={xMax}
                  onChange={(e) => updateField("xRange", [xMin, Number(e.target.value)])}
                  className="h-10 rounded-xl text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground">Y-Range Min</Label>
                <Input
                  type="number"
                  value={yMin}
                  onChange={(e) => updateField("yRange", [Number(e.target.value), yMax])}
                  className="h-10 rounded-xl text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground">Y-Range Max</Label>
                <Input
                  type="number"
                  value={yMax}
                  onChange={(e) => updateField("yRange", [yMin, Number(e.target.value)])}
                  className="h-10 rounded-xl text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground">Grid Step</Label>
                <Input
                  type="number"
                  value={gridStep}
                  onChange={(e) => updateField("gridStep", Number(e.target.value))}
                  className="h-10 rounded-xl text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground">Tolerance Margin</Label>
                <Input
                  type="number"
                  step="0.05"
                  value={tolerance}
                  onChange={(e) => updateField("tolerance", Number(e.target.value))}
                  className="h-10 rounded-xl text-xs"
                />
              </div>
            </div>

            {/* Visual Point Selector for correctPoints */}
            <div className="border-t border-border pt-4 space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground block">
                Visual Coordinates Target Selector
              </Label>
              <p className="text-[10px] text-muted-foreground mb-2">
                Click intersections on the grid below to plot coordinates expected as the correct answer.
              </p>
              <div className="flex justify-center bg-muted/50 p-4 rounded-2xl">
                <CoordinatePlotterWidget
                  config={{
                    xRange: [xMin, xMax],
                    yRange: [yMin, yMax],
                    gridStep,
                    correctPoints: [],
                    tolerance,
                  }}
                  value={{ points: correctPoints }}
                  onChange={handlePointsChange}
                  locked={false}
                />
              </div>
            </div>
          </div>
        );
      }

      case "SHAPE_SHADING": {
        const shapeKind: "bar" | "polygon" = value?.shape?.kind ?? "bar";
        const minRegions = shapeKind === "polygon" ? 3 : 2;
        const regions: number = value?.shape?.regions ?? (shapeKind === "polygon" ? 3 : 4);
        const targetNumerator: number = value?.targetNumerator ?? 1;
        const requireContiguous: boolean = value?.requireContiguous ?? false;

        // The grader compares the submitted shaded-region count to this
        // field exactly — a target outside 0..regions can never be
        // satisfied by any answer, so it's stopped here rather than saved
        // as a silently unanswerable question.
        const targetOutOfRange = targetNumerator < 0 || targetNumerator > regions;

        const setShapeKind = (kind: "bar" | "polygon") => {
          const clampedRegions = Math.max(regions, kind === "polygon" ? 3 : 2);
          onChange({
            ...value,
            shape: { kind, regions: clampedRegions },
            targetNumerator: Math.min(targetNumerator, clampedRegions),
          });
        };

        const setRegions = (next: number) => {
          const clamped = Math.max(minRegions, Math.min(12, next));
          onChange({
            ...value,
            shape: { kind: shapeKind, regions: clamped },
            targetNumerator: Math.min(targetNumerator, clamped),
          });
        };

        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground">Shape</Label>
                <Select value={shapeKind} onValueChange={(val) => setShapeKind(val as "bar" | "polygon")}>
                  <SelectTrigger className="h-10 rounded-xl text-xs bg-muted/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="bar">Bar (segments, no wrap)</SelectItem>
                    <SelectItem value="polygon">Polygon (wedges, wraps)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground">
                  Total Parts ({minRegions}–12)
                </Label>
                <Input
                  type="number"
                  min={minRegions}
                  max={12}
                  value={regions}
                  onChange={(e) => setRegions(Number(e.target.value))}
                  className="h-10 rounded-xl text-xs"
                />
              </div>
              <div className="col-span-2 space-y-1.5 border-t border-border pt-3">
                <Label className="text-xs font-semibold text-muted-foreground">
                  Parts to Shade (correct answer)
                </Label>
                <Input
                  type="number"
                  min={0}
                  max={regions}
                  value={targetNumerator}
                  onChange={(e) => updateField("targetNumerator", Number(e.target.value))}
                  className="h-10 rounded-xl text-xs"
                />
                {targetOutOfRange && (
                  <p className="text-[10px] font-semibold text-destructive">
                    Must be between 0 and {regions} — this shape only has {regions} part
                    {regions === 1 ? "" : "s"} to shade.
                  </p>
                )}
              </div>
              <div className="col-span-2 flex h-10 items-center justify-between rounded-xl border border-border bg-muted/30 px-3">
                <div>
                  <Label className="text-xs font-semibold text-foreground">Require contiguous parts</Label>
                  <p className="text-[10px] text-muted-foreground">
                    Shaded parts must touch. {shapeKind === "polygon" ? "Wedges may wrap around." : "Bar segments don't wrap."}
                  </p>
                </div>
                <Switch
                  checked={requireContiguous}
                  onCheckedChange={(checked) => updateField("requireContiguous", checked)}
                />
              </div>
            </div>

            <div className="border-t border-border pt-4 space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground block">Preview</Label>
              <p className="text-[10px] text-muted-foreground mb-2">
                What the learner sees. Correctness is judged on how many parts are shaded (and
                whether they touch, if required) — not on which specific parts, so there is nothing
                to click here.
              </p>
              <div className="flex justify-center bg-muted/50 p-4 rounded-2xl">
                <ShapeShadingWidget
                  config={{ shape: { kind: shapeKind, regions }, targetNumerator, requireContiguous }}
                  value={null}
                  onChange={() => {}}
                  locked
                />
              </div>
            </div>
          </div>
        );
      }

      case "ANGLE_PROTRACTOR": {
        const correctAngle: number = value?.correctAngle ?? 45;
        const tolerance: number = value?.tolerance ?? 5;
        const classification: string = value?.classification ?? "none";

        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground block">
                Correct Angle
              </Label>
              <p className="text-[10px] text-muted-foreground">
                Drag the slider (or type a value) to set the angle a student&apos;s answer is graded
                against — this is the same control students see, just unlocked.
              </p>
              <div className="flex justify-center bg-muted/50 p-4 rounded-2xl">
                <AngleProtractorWidget
                  config={{}}
                  value={{ angle: correctAngle }}
                  onChange={(newValue) => updateField("correctAngle", newValue.angle)}
                  locked={false}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground">
                  Tolerance (± degrees)
                </Label>
                <Input
                  type="number"
                  min={1}
                  max={45}
                  value={tolerance}
                  onChange={(e) => updateField("tolerance", Number(e.target.value))}
                  className="h-10 rounded-xl text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground">
                  Classification (optional)
                </Label>
                <Select
                  value={classification}
                  onValueChange={(val) =>
                    updateField("classification", val === "none" ? undefined : val)
                  }
                >
                  <SelectTrigger className="h-10 rounded-xl text-xs bg-muted/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="none">None — angle only</SelectItem>
                    <SelectItem value="acute">Acute</SelectItem>
                    <SelectItem value="right">Right</SelectItem>
                    <SelectItem value="obtuse">Obtuse</SelectItem>
                    <SelectItem value="straight">Straight</SelectItem>
                    <SelectItem value="reflex">Reflex</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <GeneratePreviewButton widgetType="ANGLE_PROTRACTOR" config={value} />
          </div>
        );
      }

      case "GRID_MATCHING": {
        const left: any[] = value?.left ?? [];
        const right: any[] = value?.right ?? [];
        const correctPairs: [string, string][] = value?.correctPairs ?? [];

        const handleAddLeft = () => {
          updateField("left", [...left, { id: `l-${Date.now()}`, text: "" }]);
        };

        const handleAddRight = () => {
          updateField("right", [...right, { id: `r-${Date.now()}`, text: "" }]);
        };

        const handleUpdateItem = (field: "left" | "right", idx: number, text: string) => {
          const list = field === "left" ? left : right;
          const newList = list.map((item, i) => (i === idx ? { ...item, text } : item));
          updateField(field, newList);
        };

        const handleRemoveItem = (field: "left" | "right", idx: number) => {
          const list = field === "left" ? left : right;
          const itemId = list[idx].id;
          const newList = list.filter((_, i) => i !== idx);
          updateField(field, newList);

          // Clean up correctPairs
          const newPairs = correctPairs.filter(([lId, rId]) =>
            field === "left" ? lId !== itemId : rId !== itemId
          );
          updateField("correctPairs", newPairs);
        };

        const handleReorderItem = (field: "left" | "right", fromIndex: number, toIndex: number) => {
          const list = field === "left" ? left : right;
          updateField(field, arrayMove(list, fromIndex, toIndex));
        };

        const handleAddPair = () => {
          updateField("correctPairs", [...correctPairs, ["", ""]]);
        };

        const handleUpdatePair = (pIdx: number, slotIdx: number, val: string) => {
          const newPairs = correctPairs.map((p, idx) => {
            if (idx === pIdx) {
              const newPair = [...p] as [string, string];
              newPair[slotIdx] = val;
              return newPair;
            }
            return p;
          });
          updateField("correctPairs", newPairs);
        };

        const handleRemovePair = (pIdx: number) => {
          const newPairs = correctPairs.filter((_, idx) => idx !== pIdx);
          updateField("correctPairs", newPairs);
        };

        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {/* Left Column Items */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-muted-foreground">Left Column</Label>
                  <button
                    type="button"
                    onClick={handleAddLeft}
                    className="flex items-center gap-1 text-[11px] font-bold text-primary"
                  >
                    <Plus className="h-3 w-3" /> Add Item
                  </button>
                </div>
                <SortableListContext
                  ids={left.map((item, idx) => item.id ?? `left-idx-${idx}`)}
                  onReorder={(from, to) => handleReorderItem("left", from, to)}
                >
                  <div className="space-y-1.5">
                    {left.map((item, idx) => (
                      <SortableRow
                        key={idx}
                        id={item.id ?? `left-idx-${idx}`}
                        className="flex gap-1.5 items-center"
                      >
                        {(handle) => (
                          <>
                            <DragHandle
                              {...handle}
                              className="flex h-9 w-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
                            />
                            <Input
                              type="text"
                              placeholder="Item text..."
                              value={item.text}
                              onChange={(e) => handleUpdateItem("left", idx, e.target.value)}
                              className="h-9 rounded-xl text-xs flex-1"
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveItem("left", idx)}
                              className="rounded-xl border border-border bg-card p-2.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </SortableRow>
                    ))}
                  </div>
                </SortableListContext>
              </div>

              {/* Right Column Items */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-muted-foreground">Right Column</Label>
                  <button
                    type="button"
                    onClick={handleAddRight}
                    className="flex items-center gap-1 text-[11px] font-bold text-primary"
                  >
                    <Plus className="h-3 w-3" /> Add Item
                  </button>
                </div>
                <SortableListContext
                  ids={right.map((item, idx) => item.id ?? `right-idx-${idx}`)}
                  onReorder={(from, to) => handleReorderItem("right", from, to)}
                >
                  <div className="space-y-1.5">
                    {right.map((item, idx) => (
                      <SortableRow
                        key={idx}
                        id={item.id ?? `right-idx-${idx}`}
                        className="flex gap-1.5 items-center"
                      >
                        {(handle) => (
                          <>
                            <DragHandle
                              {...handle}
                              className="flex h-9 w-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
                            />
                            <Input
                              type="text"
                              placeholder="Item text..."
                              value={item.text}
                              onChange={(e) => handleUpdateItem("right", idx, e.target.value)}
                              className="h-9 rounded-xl text-xs flex-1"
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveItem("right", idx)}
                              className="rounded-xl border border-border bg-card p-2.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </SortableRow>
                    ))}
                  </div>
                </SortableListContext>
              </div>
            </div>

            {/* Correct Pairs Linker */}
            <div className="space-y-2 border-t border-border pt-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-muted-foreground">Correct Pairings Map</Label>
                <button
                  type="button"
                  onClick={handleAddPair}
                  className="flex items-center gap-1 text-[11px] font-bold text-primary"
                >
                  <Plus className="h-3 w-3" /> Link Pair
                  </button>
              </div>
              <div className="space-y-2">
                {correctPairs.map((pair, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <Select
                      value={pair[0] || ""}
                      onValueChange={(val) => handleUpdatePair(idx, 0, val)}
                    >
                      <SelectTrigger className="h-9 flex-1 rounded-xl text-xs bg-muted/50">
                        <SelectValue placeholder="Select Left..." />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        {left.filter((l) => l.text).map((l) => (
                          <SelectItem key={l.id} value={l.id}>
                            {l.text}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <span className="text-muted-foreground text-xs font-bold">⇔</span>

                    <Select
                      value={pair[1] || ""}
                      onValueChange={(val) => handleUpdatePair(idx, 1, val)}
                    >
                      <SelectTrigger className="h-9 flex-1 rounded-xl text-xs bg-muted/50">
                        <SelectValue placeholder="Select Right..." />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        {right.filter((r) => r.text).map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.text}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <button
                      type="button"
                      onClick={() => handleRemovePair(idx)}
                      className="rounded-xl border border-border bg-card p-2.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      }

      case "CODE_PLAYGROUND": {
        const language = value?.language ?? "javascript";
        const starterCode = value?.starterCode ?? "";
        const tests: any[] = value?.tests ?? [];

        const handleAddTest = () => {
          updateField("tests", [...tests, { input: "", expected: "" }]);
        };

        const handleUpdateTest = (idx: number, key: string, val: string) => {
          const newTests = tests.map((t, i) => (i === idx ? { ...t, [key]: val } : t));
          updateField("tests", newTests);
        };

        const handleRemoveTest = (idx: number) => {
          const newTests = tests.filter((_, i) => i !== idx);
          updateField("tests", newTests);
        };

        return (
          <div className="space-y-4">
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs font-semibold text-muted-foreground">Sandbox Language</Label>
              <Select value={language} onValueChange={(val) => updateField("language", val)}>
                <SelectTrigger className="h-10 rounded-xl text-xs bg-muted/50">
                  <SelectValue placeholder="Select language..." />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="javascript">Javascript (Client sandbox)</SelectItem>
                  <SelectItem value="typescript">Typescript (Transpiled client)</SelectItem>
                  <SelectItem value="python">Python (Syntax highlighting)</SelectItem>
                  <SelectItem value="html">HTML (Isolated sandbox)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground">Starter Code</Label>
              <textarea
                value={starterCode}
                onChange={(e) => updateField("starterCode", e.target.value)}
                placeholder="// Code template for students..."
                className="h-28 w-full resize-none rounded-xl border border-border bg-muted/20 p-3 font-mono text-xs focus:outline-none/50"
              />
            </div>

            {/* Test cases list */}
            <div className="space-y-2 border-t border-border pt-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-muted-foreground">Test Assertions ({tests.length})</Label>
                <button
                  type="button"
                  onClick={handleAddTest}
                  className="flex items-center gap-1 text-[11px] font-bold text-primary"
                >
                  <Plus className="h-3 w-3" /> Add Test Case
                </button>
              </div>
              <div className="space-y-2">
                {tests.map((test, idx) => (
                  <div key={idx} className="flex gap-2 items-start">
                    <div className="flex-1 space-y-1">
                      <Label className="text-[9px] font-bold text-muted-foreground">Execution Call Expression</Label>
                      <Input
                        type="text"
                        placeholder="e.g. add(2, 3)"
                        value={test.input}
                        onChange={(e) => handleUpdateTest(idx, "input", e.target.value)}
                        className="h-9 rounded-xl text-xs"
                      />
                    </div>
                    <div className="flex-1 space-y-1">
                      <Label className="text-[9px] font-bold text-muted-foreground">Expected Result Expression</Label>
                      <Input
                        type="text"
                        placeholder="e.g. 5"
                        value={test.expected}
                        onChange={(e) => handleUpdateTest(idx, "expected", e.target.value)}
                        className="h-9 rounded-xl text-xs"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveTest(idx)}
                      className="mt-5 rounded-xl border border-border bg-card p-2.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      }

      default:
        return (
          <div className="text-center py-6 text-xs text-muted-foreground font-medium">
            This question type does not require a widget configuration.
          </div>
        );
    }
  };

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex justify-between items-center mb-2">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Interactive Configuration
          </Label>
          <TabsList className="h-8 rounded-xl bg-muted p-0.5">
            <TabsTrigger value="form" className="h-7 cursor-pointer rounded-lg px-3 text-xs font-semibold">
              Form Builder
            </TabsTrigger>
            <TabsTrigger value="json" className="h-7 cursor-pointer rounded-lg px-3 text-xs font-semibold">
              <Code className="h-3.5 w-3.5 mr-1" /> Raw JSON
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="form" className="mt-0 focus-visible:outline-none">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm/40">
            {renderFormEditor()}
          </div>
        </TabsContent>

        <TabsContent value="json" className="mt-0 focus-visible:outline-none">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm/40 space-y-2">
            <textarea
              value={rawJsonText}
              onChange={(e) => handleJsonChange(e.target.value)}
              className="h-60 w-full resize-none rounded-xl border border-border bg-muted/50 p-3 font-mono text-xs focus:outline-none/60"
            />
            {jsonError && (
              <span className="text-[10px] font-bold text-destructive block">
                {jsonError}
              </span>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
