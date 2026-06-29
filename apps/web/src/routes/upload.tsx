import {
  type EvidenceClaims,
  evidenceClaimsSchema,
} from "@c2pa-evidence-tamper-lab/api/evidence/schema";
import {
  Button,
  buttonVariants,
} from "@c2pa-evidence-tamper-lab/ui/components/button";
import { Input } from "@c2pa-evidence-tamper-lab/ui/components/input";
import { Label } from "@c2pa-evidence-tamper-lab/ui/components/label";
import { Textarea } from "@c2pa-evidence-tamper-lab/ui/components/textarea";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { fileUrl } from "@/lib/server";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/upload")({ component: UploadPage });

type UploadResult = Awaited<ReturnType<typeof orpc.upload.create.call>>;
type SignResult = Awaited<ReturnType<typeof orpc.sign.create.call>>;
type Mode = "journalism" | "inspection";

function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [uploaded, setUploaded] = useState<UploadResult | null>(null);
  const [signed, setSigned] = useState<SignResult | null>(null);
  const [mode, setMode] = useState<Mode>("journalism");
  const [form, setForm] = useState<Record<string, string>>({});

  const set = (k: string) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const uploadMutation = useMutation(
    orpc.upload.create.mutationOptions({
      onSuccess: (data) => {
        setUploaded(data);
        setSigned(null);
      },
      onError: (e) => toast.error(e.message),
    })
  );
  const signMutation = useMutation(
    orpc.sign.create.mutationOptions({
      onSuccess: (data) => setSigned(data),
      onError: (e) => toast.error(e.message),
    })
  );

  function onUpload() {
    if (!file) {
      toast.error("Choose an image first");
      return;
    }
    uploadMutation.mutate({ file });
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: flat field-mapping, no real branching depth
  function buildClaims(): EvidenceClaims | null {
    const capture = {
      capturedAt: form.capturedAt
        ? new Date(form.capturedAt).toISOString()
        : null,
      gps:
        form.lat && form.lng
          ? {
              lat: Number(form.lat),
              lng: Number(form.lng),
              source: (form.gpsSource as "exif" | "user" | "unknown") ?? "user",
              confidence: "medium" as const,
            }
          : null,
      cameraHeadingDegrees: form.heading ? Number(form.heading) : null,
      cameraDirectionText: form.direction || null,
    };
    const draft =
      mode === "journalism"
        ? {
            mode,
            capture,
            journalism: {
              reporterId: form.reporterId ?? "",
              organization: form.organization ?? "",
              sourceType: form.sourceType ?? "",
              caption: form.caption ?? "",
              publicInterestReason: form.publicInterestReason ?? "",
              safetyNotes: form.safetyNotes
                ? form.safetyNotes.split("\n").filter(Boolean)
                : [],
            },
          }
        : {
            mode,
            capture,
            inspection: {
              inspectionId: form.inspectionId ?? "",
              claimId: form.claimId ?? "",
              inspectorId: form.inspectorId ?? "",
              assetId: form.assetId ?? "",
              damageType: form.damageType ?? "",
              observation: form.observation ?? "",
              mapRequired: form.mapRequired === "yes",
            },
          };
    const parsed = evidenceClaimsSchema.safeParse(draft);
    if (!parsed.success) {
      toast.error(`Evidence invalid: ${parsed.error.issues[0]?.message}`);
      return null;
    }
    return parsed.data;
  }

  function onSign() {
    if (!uploaded) {
      return;
    }
    const claims = buildClaims();
    if (claims) {
      signMutation.mutate({ originalFileId: uploaded.fileId, claims });
    }
  }

  return (
    <div className="container mx-auto max-w-3xl space-y-6 px-4 py-6">
      <h1 className="font-semibold text-2xl">Create signed evidence</h1>

      {/* Page 1 — Upload original */}
      <section className="rounded-lg border p-4">
        <h2 className="mb-3 font-medium">1. Upload original image</h2>
        <div className="flex items-center gap-3">
          <Input
            accept="image/jpeg,image/png"
            name="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            type="file"
          />
          <Button disabled={uploadMutation.isPending} onClick={onUpload}>
            {uploadMutation.isPending ? "Uploading…" : "Upload"}
          </Button>
        </div>
        {uploaded && (
          <div className="mt-4 grid grid-cols-[160px_1fr] gap-4">
            <img
              alt="original"
              className="rounded border"
              height={120}
              src={fileUrl(uploaded.fileId)}
              width={160}
            />
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <Fact k="SHA-256" v={`${uploaded.media.sha256.slice(0, 16)}…`} />
              <Fact k="MIME" v={uploaded.media.mimeType} />
              <Fact
                k="Dimensions"
                v={`${uploaded.media.width}×${uploaded.media.height}`}
              />
              <Fact k="Size" v={`${uploaded.media.fileSizeBytes} B`} />
              <Fact
                k="Captured"
                v={uploaded.capture.capturedAt ?? "— (no EXIF)"}
              />
              <Fact
                k="GPS"
                v={
                  uploaded.capture.gps
                    ? `${uploaded.capture.gps.lat}, ${uploaded.capture.gps.lng}`
                    : "— (none)"
                }
              />
            </dl>
          </div>
        )}
      </section>

      {/* Pages 2–4 — Evidence editor (journalism / inspection) */}
      {uploaded && !signed && (
        <section className="rounded-lg border p-4">
          <h2 className="mb-3 font-medium">2. Evidence details</h2>
          <div className="mb-4 flex gap-2">
            {(["journalism", "inspection"] as const).map((m) => (
              <Button
                key={m}
                onClick={() => setMode(m)}
                size="sm"
                variant={mode === m ? "default" : "outline"}
              >
                {m}
              </Button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field
              id="capturedAt"
              label="Captured at"
              onChange={set("capturedAt")}
              type="datetime-local"
            />
            <Field
              id="direction"
              label="Camera direction"
              onChange={set("direction")}
            />
            <Field id="lat" label="GPS lat" onChange={set("lat")} />
            <Field id="lng" label="GPS lng" onChange={set("lng")} />
            <Field id="heading" label="Heading (°)" onChange={set("heading")} />
            <div className="space-y-1">
              <Label htmlFor="gpsSource">Location source</Label>
              <select
                className="w-full rounded-md border bg-background p-2 text-sm"
                id="gpsSource"
                onChange={set("gpsSource")}
                value={form.gpsSource ?? "user"}
              >
                <option value="user">user</option>
                <option value="exif">exif</option>
                <option value="unknown">unknown</option>
              </select>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            {mode === "journalism" ? (
              <>
                <Field
                  id="reporterId"
                  label="Reporter ID"
                  onChange={set("reporterId")}
                />
                <Field
                  id="organization"
                  label="Organization"
                  onChange={set("organization")}
                />
                <Field
                  id="sourceType"
                  label="Source type"
                  onChange={set("sourceType")}
                />
                <Field
                  id="publicInterestReason"
                  label="Public-interest reason"
                  onChange={set("publicInterestReason")}
                />
                <TextField
                  id="caption"
                  label="Caption"
                  onChange={set("caption")}
                />
                <TextField
                  id="safetyNotes"
                  label="Safety notes (one per line)"
                  onChange={set("safetyNotes")}
                />
              </>
            ) : (
              <>
                <Field
                  id="inspectionId"
                  label="Inspection ID"
                  onChange={set("inspectionId")}
                />
                <Field
                  id="claimId"
                  label="Claim ID"
                  onChange={set("claimId")}
                />
                <Field
                  id="inspectorId"
                  label="Inspector ID"
                  onChange={set("inspectorId")}
                />
                <Field
                  id="assetId"
                  label="Asset ID"
                  onChange={set("assetId")}
                />
                <Field
                  id="damageType"
                  label="Damage type"
                  onChange={set("damageType")}
                />
                <Field
                  id="mapRequired"
                  label="Map required (yes/no)"
                  onChange={set("mapRequired")}
                />
                <TextField
                  id="observation"
                  label="Observation"
                  onChange={set("observation")}
                />
              </>
            )}
          </div>

          <Button
            className="mt-4"
            disabled={signMutation.isPending}
            onClick={onSign}
          >
            {signMutation.isPending ? "Signing…" : "3. Sign with C2PA"}
          </Button>
        </section>
      )}

      {/* Page 5 — Signed result */}
      {signed && (
        <section className="rounded-lg border border-green-600/40 bg-green-600/5 p-4">
          <h2 className="mb-3 font-medium">Signed ✓</h2>
          <div className="grid grid-cols-[160px_1fr] gap-4">
            <img
              alt="signed"
              className="rounded border"
              height={120}
              src={fileUrl(signed.signedFileId)}
              width={160}
            />
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <Fact k="Evidence ID" v={signed.evidenceId} />
              <Fact k="Manifest" v={signed.manifestLabel ?? "—"} />
              <Fact k="Signature" v={signed.signatureStatus} />
              <Fact
                k="Signed hash"
                v={`${signed.signedFileHash.slice(0, 16)}…`}
              />
            </dl>
          </div>
          <a
            className="mt-3 inline-block text-sm underline"
            download={`signed-${signed.evidenceId}.jpg`}
            href={fileUrl(signed.signedFileId)}
          >
            Download signed image — re-upload this one on the Verify page to get
            “verified”
          </a>
          <div className="mt-4 flex gap-2">
            <Link
              className={buttonVariants({ size: "sm" })}
              search={{ signedFileId: signed.signedFileId }}
              to="/tamper"
            >
              Tamper this image
            </Link>
            <Link
              className={buttonVariants({ size: "sm", variant: "outline" })}
              to="/records"
            >
              View records
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="truncate font-mono text-xs">{v}</dd>
    </>
  );
}

function Field({
  id,
  label,
  onChange,
  type = "text",
}: {
  id: string;
  label: string;
  onChange: (e: { target: { value: string } }) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} onChange={onChange} type={type} />
    </div>
  );
}

function TextField({
  id,
  label,
  onChange,
}: {
  id: string;
  label: string;
  onChange: (e: { target: { value: string } }) => void;
}) {
  return (
    <div className="col-span-2 space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Textarea id={id} onChange={onChange} rows={2} />
    </div>
  );
}
