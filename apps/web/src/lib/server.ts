import { env } from "@c2pa-evidence-tamper-lab/env/web";

export function fileUrl(id: string): string {
  return `${env.VITE_SERVER_URL}/files/${id}`;
}
