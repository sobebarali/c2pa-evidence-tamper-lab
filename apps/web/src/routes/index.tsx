import { buttonVariants } from "@c2pa-evidence-tamper-lab/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

const STEPS = [
  {
    to: "/upload",
    title: "1. Create signed evidence",
    body: "Upload an image, fill the evidence JSON, and sign it into a C2PA manifest.",
  },
  {
    to: "/records",
    title: "2. Evidence records",
    body: "Browse stored records: evidenceId, mode, hashes, manifest label, signature status.",
  },
  {
    to: "/tamper",
    title: "3. Tamper",
    body: "Generate a tampered copy of a signed image (strip the manifest or patch pixels).",
  },
  {
    to: "/verify",
    title: "4. Verify",
    body: "Re-upload an image and detect verified / tampered / manifest_missing, linked to its record.",
  },
] as const;

function apiStatus(isLoading: boolean, ok: unknown): string {
  if (isLoading) {
    return "…";
  }
  return ok ? "connected" : "offline";
}

function HomeComponent() {
  const healthCheck = useQuery(orpc.healthCheck.queryOptions());

  return (
    <div className="container mx-auto max-w-3xl space-y-6 px-4 py-6">
      <header className="space-y-1">
        <h1 className="font-semibold text-2xl">C2PA Evidence Tamper Lab</h1>
        <p className="text-muted-foreground text-sm">
          A local-first content-provenance workflow: sign images with C2PA,
          store evidence, tamper, and verify.
        </p>
        <div className="flex items-center gap-2 pt-1">
          <span
            className={`h-2 w-2 rounded-full ${healthCheck.data ? "bg-green-500" : "bg-red-500"}`}
          />
          <span className="text-muted-foreground text-xs">
            API {apiStatus(healthCheck.isLoading, healthCheck.data)}
          </span>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {STEPS.map((step) => (
          <Link
            className="rounded-lg border p-4 transition-colors hover:bg-muted/50"
            key={step.to}
            to={step.to}
          >
            <h2 className="mb-1 font-medium">{step.title}</h2>
            <p className="text-muted-foreground text-sm">{step.body}</p>
          </Link>
        ))}
      </div>

      <Link className={buttonVariants({})} to="/upload">
        Start →
      </Link>
    </div>
  );
}
