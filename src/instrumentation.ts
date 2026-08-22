export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { installDeterministicE2EProviderNetworkGuard } = await import("@/providers/testing/provider-network-audit");
  installDeterministicE2EProviderNetworkGuard();
}
