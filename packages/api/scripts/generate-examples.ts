// Generates the task.md §12 example deliverables by running the REAL pipeline:
// original.jpg → evidence.json → manifest.json → signed.jpg → tampered.jpg + a
// db-export.json. Run from the repo root: bun run examples
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import sharp from "sharp";

import { buildEvidence, formatEvidenceId } from "../src/evidence/build";
import { evidenceSchema, type Media } from "../src/evidence/schema";
import { readManifest, signImage } from "../src/integrations/c2pa/index";
import {
  extractMetadata,
  sha256,
  tamper,
} from "../src/integrations/imaging/index";

const outDir = join(import.meta.dirname, "..", "..", "..", "examples");
const MIME = "image/jpeg";

async function main() {
  await mkdir(outDir, { recursive: true });

  const original = Buffer.from(
    await sharp({
      create: {
        width: 1280,
        height: 720,
        channels: 3,
        background: { r: 30, g: 110, b: 170 },
      },
    })
      .jpeg()
      .toBuffer()
  );
  await writeFile(join(outDir, "original.jpg"), original);

  const meta = await extractMetadata(original);
  const media: Media = {
    sha256: sha256(original),
    mimeType: "image/jpeg",
    fileSizeBytes: original.length,
    width: meta.width,
    height: meta.height,
  };

  const evidenceId = formatEvidenceId(2026, 1);
  const createdAt = "2026-06-27T10:35:00Z";
  const evidence = evidenceSchema.parse(
    buildEvidence({
      evidenceId,
      media,
      createdAt,
      claims: {
        mode: "journalism",
        capture: {
          capturedAt: "2026-06-27T10:30:00Z",
          gps: {
            lat: 25.2048,
            lng: 55.2708,
            source: "user",
            confidence: "medium",
          },
          cameraHeadingDegrees: 90,
          cameraDirectionText: "east",
        },
        journalism: {
          reporterId: "rep_123",
          organization: "Example Newsroom",
          sourceType: "staff_reporter",
          caption: "Street scene after the event",
          publicInterestReason: "Newsworthy event documentation",
          safetyNotes: ["Do not reveal exact GPS publicly"],
        },
      },
    })
  );
  await writeFile(
    join(outDir, "evidence.json"),
    JSON.stringify(evidence, null, 2)
  );

  // The manifest definition (the c2patool `-m manifest.json` shape).
  const manifestDefinition = {
    claim_generator_info: [
      { name: "Original Pictures Evidence Agent", version: "1.0" },
    ],
    title: evidenceId,
    assertions: [
      {
        label: "c2pa.actions",
        data: { actions: [{ action: "c2pa.created" }] },
      },
      { label: "com.originalpictures.evidence", data: evidence },
    ],
  };
  await writeFile(
    join(outDir, "manifest.json"),
    JSON.stringify(manifestDefinition, null, 2)
  );

  const signed = await signImage({
    bytes: original,
    mime: MIME,
    title: evidenceId,
    evidence,
  });
  await writeFile(join(outDir, "signed.jpg"), signed.signedBytes);

  const tampered = await tamper(signed.signedBytes, "pixel");
  await writeFile(join(outDir, "tampered.jpg"), tampered);

  const dbExport = [
    {
      evidenceId,
      mode: evidence.mode,
      originalFileHash: media.sha256,
      signedFileHash: sha256(signed.signedBytes),
      manifestLabel: signed.manifestLabel,
      claimGenerator: signed.claimGenerator,
      signatureStatus: signed.signatureStatus,
      validationErrors: [],
      extractedEvidenceJson: evidence,
      createdAt,
    },
  ];
  await writeFile(
    join(outDir, "db-export.json"),
    JSON.stringify(dbExport, null, 2)
  );

  const verifyTampered = await readManifest(tampered, MIME);
  process.stdout.write(
    `examples written to ${outDir}\n  tampered validation_status: ${verifyTampered.validationStatus
      .map((s) => s.code)
      .join(", ")}\n`
  );
}

main().catch((err) => {
  process.stderr.write(`${err}\n`);
  process.exit(1);
});
