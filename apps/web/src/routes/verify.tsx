import { Button } from "@c2pa-evidence-tamper-lab/ui/components/button";
import { Input } from "@c2pa-evidence-tamper-lab/ui/components/input";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { fileUrl } from "@/lib/server";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/verify")({ component: VerifyPage });

type VerifyResult = Awaited<ReturnType<typeof orpc.verify.check.call>>;

const STATUS_STYLE: Record<string, string> = {
  verified: "bg-green-600/15 text-green-700 dark:text-green-400",
  tampered: "bg-red-600/15 text-red-700 dark:text-red-400",
  manifest_missing: "bg-amber-600/15 text-amber-700 dark:text-amber-400",
  manifest_invalid: "bg-amber-600/15 text-amber-700 dark:text-amber-400",
  unknown: "bg-muted text-muted-foreground",
};

function VerifyPage() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<VerifyResult | null>(null);

  const verifyMutation = useMutation(
    orpc.verify.check.mutationOptions({
      onSuccess: (data) => setResult(data),
      onError: (e) => toast.error(e.message),
    })
  );

  return (
    <div className="container mx-auto max-w-2xl space-y-6 px-4 py-6">
      <h1 className="font-semibold text-2xl">Verify an image</h1>

      <section className="rounded-lg border p-4">
        <div className="flex items-center gap-3">
          <Input
            accept="image/jpeg,image/png"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            type="file"
          />
          <Button
            disabled={!file || verifyMutation.isPending}
            onClick={() => file && verifyMutation.mutate({ file })}
          >
            {verifyMutation.isPending ? "Verifying…" : "Verify"}
          </Button>
        </div>
      </section>

      {result && (
        <section className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center gap-3">
            <span
              className={`rounded px-2 py-1 font-semibold text-sm ${STATUS_STYLE[result.uploadedFileStatus] ?? ""}`}
            >
              {result.uploadedFileStatus}
            </span>
            {result.matchedOriginalRecord && (
              <span className="text-muted-foreground text-sm">
                linked to {result.matchedEvidenceId}
              </span>
            )}
          </div>

          <p className="text-sm">{result.message}</p>

          <div>
            <p className="mb-1 font-medium text-sm">Reason codes</p>
            <ul className="flex flex-wrap gap-2">
              {result.reasonCodes.map((code) => (
                <li
                  className="rounded bg-muted px-2 py-0.5 font-mono text-xs"
                  key={code}
                >
                  {code}
                </li>
              ))}
            </ul>
          </div>

          <dl className="grid grid-cols-[140px_1fr] gap-y-1 text-xs">
            <dt className="text-muted-foreground">Uploaded hash</dt>
            <dd className="font-mono">
              {result.uploadedFileHash.slice(0, 32)}…
            </dd>
            <dt className="text-muted-foreground">Original signed hash</dt>
            <dd className="font-mono">
              {result.originalSignedFileHash
                ? `${result.originalSignedFileHash.slice(0, 32)}…`
                : "—"}
            </dd>
          </dl>

          <img
            alt="uploaded"
            className="max-w-xs rounded border"
            height={240}
            src={fileUrl(result.uploadedFileId)}
            width={320}
          />
        </section>
      )}
    </div>
  );
}
