type DeleteRequest = { p_id: string; p_expected_version: number };

// The RPC is the permission boundary; Discord cleanup only follows a successful deletion.
export async function deleteTournament(
  id: string,
  version: number,
  remove: (request: DeleteRequest) => PromiseLike<{ error: { message: string } | null }>,
  cleanup: () => Promise<{ failed?: boolean }>,
) {
  const { error } = await remove({ p_id: id, p_expected_version: version });
  if (error) throw error;
  try {
    return { discordCleanupFailed: (await cleanup()).failed === true };
  } catch {
    return { discordCleanupFailed: true };
  }
}