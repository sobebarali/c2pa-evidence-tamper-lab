import { Button } from "@c2pa-evidence-tamper-lab/ui/components/button";
import { Label } from "@c2pa-evidence-tamper-lab/ui/components/label";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { fileUrl } from "@/lib/server";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/tamper")({
  component: TamperPage,
  validateSearch: (search: Record<string, unknown>) => ({
    signedFileId:
      typeof search.signedFileId === "string" ? search.signedFileId : undefined,
  }),
});

type TamperResult = Awaited<ReturnType<typeof orpc.tamper.create.call>>;
type Method = "strip" | "pixel";

function TamperPage() {
  const { signedFileId: initial } = Route.useSearch();
  const records = useQuery(orpc.records.list.queryOptions());
  const [signedFileId, setSignedFileId] = useState(initial ?? "");
  const [method, setMethod] = useState<Method>("pixel");
  const [result, setResult] = useState<TamperResult | null>(null);

  const tamperMutation = useMutation(
    orpc.tamper.create.mutationOptions({
      onSuccess: (data) => setResult(data),
      onError: (e) => toast.error(e.message),
    })
  );

  const chosen = signedFileId || initial || "";

  return (
    <div className="container mx-auto max-w-2xl space-y-6 px-4 py-6">
      <h1 className="font-semibold text-2xl">Tamper a signed image</h1>

      <section className="space-y-4 rounded-lg border p-4">
        <div className="space-y-1">
          <Label htmlFor="signed">Signed image</Label>
          <select
            className="w-full rounded-md border bg-background p-2 text-sm"
            id="signed"
            onChange={(e) => setSignedFileId(e.target.value)}
            value={chosen}
          >
            <option value="">Select a record…</option>
            {records.data?.items.map((r) => (
              <option key={r.evidenceId} value={r.signedFileId}>
                {r.evidenceId}
              </option>
            ))}
          </select>
        </div>

        <fieldset className="space-y-1">
          <span className="font-medium text-sm">Method</span>
          <div className="flex gap-4 text-sm">
            {(["pixel", "strip"] as const).map((m) => (
              <label className="flex items-center gap-2" key={m}>
                <input
                  checked={method === m}
                  name="method"
                  onChange={() => setMethod(m)}
                  type="radio"
                />
                {m === "pixel"
                  ? "pixel — keeps manifest (→ tampered)"
                  : "strip — drops manifest (→ manifest_missing)"}
              </label>
            ))}
          </div>
        </fieldset>

        <Button
          disabled={!chosen || tamperMutation.isPending}
          onClick={() =>
            tamperMutation.mutate({ signedFileId: chosen, method })
          }
        >
          {tamperMutation.isPending ? "Tampering…" : "Generate tampered image"}
        </Button>
      </section>

      {result && (
        <section className="space-y-3 rounded-lg border border-amber-600/40 bg-amber-600/5 p-4">
          <h2 className="font-medium">Tampered image ready</h2>
          <img
            alt="tampered"
            className="max-w-xs rounded border"
            height={240}
            src={fileUrl(result.tamperedFileId)}
            width={320}
          />
          <p className="font-mono text-muted-foreground text-xs">
            sha256 {result.sha256.slice(0, 24)}… · method {result.method}
          </p>
          <a
            className="text-sm underline"
            download={`tampered-${result.method}.jpg`}
            href={fileUrl(result.tamperedFileId)}
          >
            Download — then re-upload it on the Verify page
          </a>
        </section>
      )}
    </div>
  );
}
