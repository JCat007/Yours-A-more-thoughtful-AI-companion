/** Bella `bella_users.id` is a Postgres UUID string (canonical 8-4-4-4-12 hex). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * System message injected into OpenClaw-bound turns so gbrain writes align with Bella:
 * only `companion/<bella_users.id>/...` for the signed-in user; no companion writes when anonymous.
 */
export function buildOpenClawGbrainWriteScopeSystemMessage(userId: string | null | undefined): string {
  const id = (userId || '').trim();
  if (id && UUID_RE.test(id)) {
    return [
      '[Bella ↔ gbrain — write scope]',
      `Authenticated Bella user id (use verbatim in gbrain slugs): ${id}`,
      `For gbrain tools (put, import, sync, timeline-add, delete, get, search scope you control, etc.): ONLY use page slugs under \`companion/${id}/\`.`,
      `Example: \`companion/${id}/preferences\`.`,
      `Never write under \`companion/<other-uuid>/\` or outside \`companion/${id}/\` for this user.`,
    ].join('\n');
  }
  return [
    '[Bella ↔ gbrain — write scope]',
    'This HTTP request has no authenticated Bella user (anonymous chat).',
    'Do NOT create, update, import, sync, or delete any gbrain page under `companion/<uuid>/` for this turn.',
    'Do not invent a user id; companion memory writes require Bella login.',
  ].join('\n');
}
