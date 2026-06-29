CREATE TABLE `evidence_records` (
	`evidence_id` text PRIMARY KEY NOT NULL,
	`mode` text NOT NULL,
	`original_file_id` text NOT NULL,
	`original_file_hash` text NOT NULL,
	`signed_file_id` text NOT NULL,
	`signed_file_hash` text NOT NULL,
	`manifest_label` text,
	`claim_generator` text,
	`signature_status` text NOT NULL,
	`validation_errors` text NOT NULL,
	`extracted_evidence_json` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`original_file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`signed_file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`sha256` text NOT NULL,
	`mime` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`width` integer,
	`height` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
