import { buttonVariants } from "@c2pa-evidence-tamper-lab/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

import { fileUrl } from "@/lib/server";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/records")({ component: RecordsPage });

function RecordsPage() {
  const records = useQuery(orpc.records.list.queryOptions());

  return (
    <div className="container mx-auto max-w-5xl space-y-4 px-4 py-6">
      <h1 className="font-semibold text-2xl">Evidence records</h1>
      {records.isLoading && <p className="text-muted-foreground">Loading…</p>}
      {records.data?.items.length === 0 && (
        <p className="text-muted-foreground">
          No records yet.{" "}
          <Link className="underline" to="/upload">
            Create one
          </Link>
          .
        </p>
      )}
      {records.data && records.data.items.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="p-2">Preview</th>
                <th className="p-2">Evidence ID</th>
                <th className="p-2">Mode</th>
                <th className="p-2">Signature</th>
                <th className="p-2">Manifest</th>
                <th className="p-2">Original hash</th>
                <th className="p-2">Signed hash</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {records.data.items.map((r) => (
                <tr className="border-t" key={r.evidenceId}>
                  <td className="p-2">
                    <img
                      alt={r.evidenceId}
                      className="h-12 w-12 rounded border object-cover"
                      height={48}
                      src={fileUrl(r.signedFileId)}
                      width={48}
                    />
                  </td>
                  <td className="p-2 font-mono text-xs">{r.evidenceId}</td>
                  <td className="p-2">{r.mode}</td>
                  <td className="p-2">
                    <StatusBadge status={r.signatureStatus} />
                  </td>
                  <td className="max-w-40 truncate p-2 font-mono text-xs">
                    {r.manifestLabel ?? "—"}
                  </td>
                  <td className="p-2 font-mono text-xs">
                    {r.originalFileHash.slice(0, 12)}…
                  </td>
                  <td className="p-2 font-mono text-xs">
                    {r.signedFileHash.slice(0, 12)}…
                  </td>
                  <td className="p-2">
                    <Link
                      className={buttonVariants({
                        size: "sm",
                        variant: "outline",
                      })}
                      search={{ signedFileId: r.signedFileId }}
                      to="/tamper"
                    >
                      Tamper
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const STATUS_COLOR: Record<string, string> = {
  valid: "bg-green-600/15 text-green-700 dark:text-green-400",
  invalid: "bg-red-600/15 text-red-700 dark:text-red-400",
};

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLOR[status] ?? "bg-muted text-muted-foreground";
  return (
    <span className={`rounded px-2 py-0.5 font-medium text-xs ${color}`}>
      {status}
    </span>
  );
}
