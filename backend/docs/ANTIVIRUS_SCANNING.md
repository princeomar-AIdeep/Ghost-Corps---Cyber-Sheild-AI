# Antivirus file scanning

The authenticated `POST /api/scans/image` route accepts one multipart field named `file` (maximum 25 MiB). It sends the file bytes to ClamAV using `INSTREAM`; uploads stay in memory and are not saved to disk. Scan history stores only a sanitized filename, detected MIME type, SHA-256, size, engine/version, signature version/update time, verdict, and scan time.

A successful clean result means only **no malware was detected by ClamAV**. It is not a guarantee that a file is safe. If ClamAV is unreachable, times out, returns malformed output, or has missing/stale definitions, the API fails closed and does not create a clean scan record.

## Codespaces setup

The repository includes a pinned official ClamAV 1.5.4 Debian 13 slim image in `compose.clamav.yaml`. Its entrypoint downloads initial signatures, starts `freshclam` periodic updates, and starts `clamd`. The signature database is persisted in the `clamav_database` Docker volume; service health uses ClamAV's `clamdcheck.sh`. TCP 3310 is published only on loopback.

1. Ensure Docker Engine and Compose are available in the Codespace.
2. Start the scanner explicitly: `docker compose -f compose.clamav.yaml up -d clamav`.
3. Wait until healthy: `docker compose -f compose.clamav.yaml ps`.
4. Check daemon readiness: `docker compose -f compose.clamav.yaml exec clamav clamdcheck.sh`.
5. Set the non-secret backend values in `backend/.env` if needed: `CLAMAV_HOST=127.0.0.1`, `CLAMAV_PORT=3310`, `CLAMAV_TIMEOUT_MS=120000`, and `CLAMAV_MAX_DEFINITION_AGE_HOURS=48`.
6. Restart the backend normally and submit a benign test file through the authenticated Analyze File UI. Do not send EICAR or any other test signature through a shared or production scanner.

The repository backend is a Codespaces process, not part of this Compose file. If deployment runs the backend as another container on the same Compose network, configure `CLAMAV_HOST=clamav` and do not publish port 3310 publicly. If the backend runs in a separate host/container, configure only a private, firewalled address reachable by the backend. Never expose the clamd TCP port to the public internet.

## File policy and limits

- Maximum upload: 25 MiB, one file, streamed to ClamAV with bounded chunks. At most two uploads/scans are active concurrently by default (`CLAMAV_MAX_CONCURRENT_SCANS`, clamped to 1–8).
- Supported content is detected from file bytes, not accepted from the filename. Recognized images, PDF, ZIP/Office/archive formats, common executable formats, and UTF-8 text/script types are accepted. Unknown/binary content is rejected.
- ClamAV is configured with a 100 MiB aggregate scan limit, 25 MiB per-file/stream limit, recursion depth 10, and at most 10,000 files. Exceeding scan limits is treated as a failed scan, never as clean.
- No uploaded content is executed or persisted. Failed scans do not create a clean history record.
- Each scan has a 120-second overall daemon timeout by default (`CLAMAV_TIMEOUT_MS`). The backend checks that ClamAV's signature version is nonzero and the reported signature timestamp is no older than the configured maximum (48 hours by default).

Tests use an in-process fake clamd protocol server and a harmless EICAR test string that is never executed or sent to an actual scanner. They do not prove that the local ClamAV daemon, signature download, or external malware detection works. Verify those separately with the commands above in a non-production environment.
